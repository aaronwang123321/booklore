import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { StripeService } from './stripe.service';
import { ConfigService } from '@nestjs/config';
import { EmailService, PaymentFailureEmailData } from '../../shared/services/email.service';
import { NotificationService } from '../../shared/services/notification.service';
import { SubscriptionPlan, SUBSCRIPTION_PLANS } from '../enums/subscription-plan.enum';
import { PaymentRetryStatus } from '@prisma/client';
import Stripe from 'stripe';

export interface PaymentRetryAttempt {
  id: string;
  invoiceId: string;
  userId: number;
  attemptNumber: number;
  status: PaymentRetryStatus;
  errorMessage?: string;
  nextRetryAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentRetryConfig {
  maxAttempts: number;
  retryIntervals: number[]; // in hours
  abandonAfterDays: number;
  notificationIntervals: number[]; // which attempts to send notifications
}

@Injectable()
export class PaymentRetryService {
  private readonly logger = new Logger(PaymentRetryService.name);
  private readonly retryConfig: PaymentRetryConfig;

  private notificationGateway: any; // Will be injected later to avoid circular dependency

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly notificationService: NotificationService,
  ) {
    this.retryConfig = {
      maxAttempts: this.configService.get<number>('PAYMENT_RETRY_MAX_ATTEMPTS', 5),
      retryIntervals: [1, 3, 24, 72, 168], // 1h, 3h, 1d, 3d, 7d
      abandonAfterDays: this.configService.get<number>('PAYMENT_RETRY_ABANDON_DAYS', 14),
      notificationIntervals: [1, 3, 5], // Send notifications on these attempts
    };
  }

  /**
   * Create a payment retry record
   */
  async createPaymentRetry(data: {
    invoiceId: string;
    userId: number;
    errorMessage: string;
  }): Promise<void> {
    try {
      await this.createRetryAttempt({
        invoiceId: data.invoiceId,
        userId: data.userId,
        attemptNumber: 1,
        status: PaymentRetryStatus.PENDING,
        errorMessage: data.errorMessage,
        nextRetryAt: this.calculateNextRetryTime(0),
      });

      this.logger.log(`Created payment retry for user ${data.userId}, invoice ${data.invoiceId}`);
    } catch (error) {
      this.logger.error(`Error creating payment retry: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle payment failure and initiate retry process
   */
  async handlePaymentFailure(
    invoice: Stripe.Invoice,
    subscription: Stripe.Subscription,
  ): Promise<void> {
    try {
      const userId = parseInt(subscription.metadata.userId);
      if (!userId) {
        this.logger.warn('No userId found in subscription metadata');
        return;
      }

      const attemptCount = invoice.attempt_count || 0;

      // Check if we should continue retrying
      if (attemptCount >= this.retryConfig.maxAttempts) {
        await this.handleFinalPaymentFailure(userId, invoice.id, subscription.id);
        return;
      }

      // Create or update retry attempt record
      await this.createRetryAttempt({
        invoiceId: invoice.id,
        userId,
        attemptNumber: attemptCount + 1,
        status: PaymentRetryStatus.PENDING,
        errorMessage: this.extractErrorMessage(invoice),
        nextRetryAt: this.calculateNextRetryTime(attemptCount),
      });

      // Schedule notification if needed
      if (this.retryConfig.notificationIntervals.includes(attemptCount + 1)) {
        await this.scheduleRetryNotification(userId, invoice.id, attemptCount + 1);
      }

      this.logger.log(
        `Payment retry scheduled for user ${userId}, invoice ${invoice.id}, attempt ${attemptCount + 1}`,
      );
    } catch (error) {
      this.logger.error(`Error handling payment failure: ${error.message}`);
    }
  }

  /**
   * Retry payment for a specific invoice
   */
  async retryPayment(invoiceId: string): Promise<{
    success: boolean;
    message: string;
    invoice?: Stripe.Invoice;
  }> {
    try {
      // Get retry attempt record
      const retryAttempt = await this.getRetryAttempt(invoiceId);
      if (!retryAttempt) {
        throw new Error('No retry attempt found for invoice');
      }

      // Check if retry is still valid
      if (retryAttempt.status !== PaymentRetryStatus.PENDING) {
        return {
          success: false,
          message: `Retry attempt is ${retryAttempt.status}`,
        };
      }

      // Attempt to pay the invoice
      const invoice = await this.stripeService.retryInvoicePayment(invoiceId);

      if (invoice.status === 'paid') {
        // Payment successful
        await this.updateRetryAttempt(invoiceId, {
          status: PaymentRetryStatus.SUCCESS,
          updatedAt: new Date(),
        });

        // Update subscription status
        await this.updateSubscriptionAfterSuccessfulPayment(retryAttempt.userId);

        this.logger.log(`Payment retry successful for invoice ${invoiceId}`);
        return {
          success: true,
          message: 'Payment retry successful',
          invoice,
        };
      } else {
        // Payment still failed
        await this.updateRetryAttempt(invoiceId, {
          status: PaymentRetryStatus.FAILED,
          errorMessage: `Invoice status: ${invoice.status}`,
          updatedAt: new Date(),
        });

        return {
          success: false,
          message: `Payment retry failed: ${invoice.status}`,
        };
      }
    } catch (error) {
      this.logger.error(`Payment retry failed: ${error.message}`);

      // Update retry attempt with error
      await this.updateRetryAttempt(invoiceId, {
        status: PaymentRetryStatus.FAILED,
        errorMessage: error.message,
        updatedAt: new Date(),
      });

      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Process all pending retries
   */
  async processPendingRetries(): Promise<void> {
    try {
      const pendingRetries = await this.getPendingRetries();

      for (const retry of pendingRetries) {
        if (retry.nextRetryAt && retry.nextRetryAt <= new Date()) {
          await this.retryPayment(retry.invoiceId);
        }
      }
    } catch (error) {
      this.logger.error(`Error processing pending retries: ${error.message}`);
    }
  }

  /**
   * Abandon old retry attempts
   */
  async abandonOldRetries(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retryConfig.abandonAfterDays);

      const abandonedCount = await this.prisma.paymentRetryAttempt.updateMany({
        where: {
          status: PaymentRetryStatus.PENDING,
          createdAt: {
            lt: cutoffDate,
          },
        },
        data: {
          status: PaymentRetryStatus.ABANDONED,
          updatedAt: new Date(),
        },
      });

      this.logger.log(`Abandoned ${abandonedCount.count} old retry attempts`);
    } catch (error) {
      this.logger.error(`Error abandoning old retries: ${error.message}`);
    }
  }

  /**
   * Get retry statistics for a user
   */
  async getRetryStatistics(userId: number): Promise<{
    totalAttempts: number;
    successfulRetries: number;
    failedRetries: number;
    pendingRetries: number;
    abandonedRetries: number;
  }> {
    try {
      const stats = await this.prisma.paymentRetryAttempt.groupBy({
        by: ['status'],
        where: { userId },
        _count: { status: true },
      });

      const result = {
        totalAttempts: 0,
        successfulRetries: 0,
        failedRetries: 0,
        pendingRetries: 0,
        abandonedRetries: 0,
      };

      stats.forEach(stat => {
        result.totalAttempts += stat._count.status;
        switch (stat.status) {
          case PaymentRetryStatus.SUCCESS:
            result.successfulRetries = stat._count.status;
            break;
          case PaymentRetryStatus.FAILED:
            result.failedRetries = stat._count.status;
            break;
          case PaymentRetryStatus.PENDING:
            result.pendingRetries = stat._count.status;
            break;
          case PaymentRetryStatus.ABANDONED:
            result.abandonedRetries = stat._count.status;
            break;
        }
      });

      return result;
    } catch (error) {
      this.logger.error(`Error getting retry statistics: ${error.message}`);
      throw error;
    }
  }

  // Private helper methods
  private async createRetryAttempt(
    data: Omit<PaymentRetryAttempt, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    await this.prisma.paymentRetryAttempt.create({
      data: {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  private async getRetryAttempt(invoiceId: string): Promise<PaymentRetryAttempt | null> {
    return this.prisma.paymentRetryAttempt.findFirst({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async updateRetryAttempt(
    invoiceId: string,
    data: Partial<PaymentRetryAttempt>,
  ): Promise<void> {
    await this.prisma.paymentRetryAttempt.updateMany({
      where: { invoiceId },
      data,
    });
  }

  async getPendingRetries(): Promise<PaymentRetryAttempt[]> {
    return this.prisma.paymentRetryAttempt.findMany({
      where: {
        status: PaymentRetryStatus.PENDING,
        nextRetryAt: {
          lte: new Date(),
        },
      },
    });
  }

  private calculateNextRetryTime(attemptCount: number): Date {
    const hoursToAdd = this.retryConfig.retryIntervals[attemptCount] || 168; // Default to 7 days
    const nextRetry = new Date();
    nextRetry.setHours(nextRetry.getHours() + hoursToAdd);
    return nextRetry;
  }

  private extractErrorMessage(invoice: Stripe.Invoice): string {
    if (invoice.last_finalization_error?.message) {
      return invoice.last_finalization_error.message;
    }
    return `Payment failed for invoice ${invoice.id}`;
  }

  private async handleFinalPaymentFailure(
    userId: number,
    invoiceId: string,
    subscriptionId: string,
  ): Promise<void> {
    try {
      // Mark retry as abandoned
      await this.updateRetryAttempt(invoiceId, {
        status: PaymentRetryStatus.ABANDONED,
        updatedAt: new Date(),
      });

      // Update subscription status to past_due
      await this.prisma.subscription.update({
        where: { userId },
        data: {
          status: 'PAST_DUE',
          updatedAt: new Date(),
        },
      });

      // Send final failure notification
      await this.sendFinalFailureNotification(userId, invoiceId);

      this.logger.warn(`Final payment failure for user ${userId}, subscription ${subscriptionId}`);
    } catch (error) {
      this.logger.error(`Error handling final payment failure: ${error.message}`);
    }
  }

  private async updateSubscriptionAfterSuccessfulPayment(userId: number): Promise<void> {
    await this.prisma.subscription.update({
      where: { userId },
      data: {
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    });
  }

  private async scheduleRetryNotification(
    userId: number,
    invoiceId: string,
    attemptNumber: number,
  ): Promise<void> {
    try {
      // Get user and subscription details
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      const subscription = await this.prisma.subscription.findFirst({
        where: { userId },
      });

      if (user && subscription) {
        const nextRetryDate = this.calculateNextRetryTime(attemptNumber - 1);

        // Get plan configuration
        const planConfig = SUBSCRIPTION_PLANS[subscription.plan as SubscriptionPlan];

        // Send email notification
        const emailData: PaymentFailureEmailData = {
          userName: user.name || 'User',
          planName: planConfig.name,
          amount: planConfig.monthlyPrice,
          currency: 'USD',
          retryDate: nextRetryDate,
          isLastAttempt: attemptNumber >= this.retryConfig.maxAttempts,
          dashboardUrl: `${this.configService.get('FRONTEND_URL')}/dashboard/billing`,
        };

        const emailTemplate = this.emailService.generatePaymentFailureTemplate(emailData);
        await this.emailService.sendEmail(user.email, emailTemplate);

        // Send in-app notification
        const nextRetryDateForNotification =
          attemptNumber < this.retryConfig.maxAttempts
            ? this.calculateNextRetryTime(attemptNumber)
            : undefined;

        await this.notificationService.createPaymentFailedNotification(
          userId,
          planConfig.name,
          planConfig.monthlyPrice,
          'USD',
          nextRetryDateForNotification,
        );

        // Send real-time WebSocket notification
        if (this.notificationGateway) {
          this.notificationGateway.sendPaymentRetryNotification(userId, {
            type: 'payment_retry',
            attemptNumber,
            planName: planConfig.name,
            amount: planConfig.monthlyPrice,
            currency: 'USD',
            nextRetryDate: nextRetryDateForNotification,
            isLastAttempt: attemptNumber >= this.retryConfig.maxAttempts,
          });
        }

        this.logger.log(
          `Sent retry notification to user ${userId} for invoice ${invoiceId}, attempt ${attemptNumber}`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to send retry notification: ${error.message}`);
    }
  }

  private async sendFinalFailureNotification(userId: number, invoiceId: string): Promise<void> {
    try {
      // Get user and subscription details
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      const subscription = await this.prisma.subscription.findFirst({
        where: { userId },
      });

      if (user && subscription) {
        // Get plan configuration
        const planConfig = SUBSCRIPTION_PLANS[subscription.plan as SubscriptionPlan];

        // Send final failure email
        const emailData: PaymentFailureEmailData = {
          userName: user.name || 'User',
          planName: planConfig.name,
          amount: planConfig.monthlyPrice,
          currency: 'USD',
          isLastAttempt: true,
          dashboardUrl: `${this.configService.get('FRONTEND_URL')}/dashboard/billing`,
        };

        const emailTemplate = this.emailService.generatePaymentFailureTemplate(emailData);
        await this.emailService.sendEmail(user.email, emailTemplate);

        // Send urgent in-app notification
        await this.notificationService.createPaymentFailedNotification(
          userId,
          planConfig.name,
          planConfig.monthlyPrice,
          'USD',
        );

        // Create subscription expiration notification
        await this.notificationService.createSubscriptionExpiredNotification(
          userId,
          planConfig.name,
        );

        // Send real-time WebSocket notification for final failure
        if (this.notificationGateway) {
          this.notificationGateway.sendPaymentFailureNotification(userId, {
            type: 'payment_final_failure',
            planName: planConfig.name,
            amount: planConfig.monthlyPrice,
            currency: 'USD',
            subscriptionStatus: 'PAST_DUE',
          });
        }

        this.logger.log(
          `Sent final failure notification to user ${userId} for invoice ${invoiceId}`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to send final failure notification: ${error.message}`);
    }
  }

  /**
   * Mark retry attempt as successful
   */
  async markRetryAsSuccessful(retryId: string): Promise<void> {
    try {
      await this.prisma.paymentRetryAttempt.update({
        where: { id: retryId },
        data: {
          status: PaymentRetryStatus.SUCCESS,
          updatedAt: new Date(),
        },
      });
      this.logger.log(`Marked retry ${retryId} as successful`);
    } catch (error) {
      this.logger.error(`Failed to mark retry as successful: ${error.message}`);
    }
  }

  /**
   * Mark retry attempt as failed
   */
  async markRetryAsFailed(retryId: string, errorMessage: string): Promise<void> {
    try {
      await this.prisma.paymentRetryAttempt.update({
        where: { id: retryId },
        data: {
          status: PaymentRetryStatus.FAILED,
          errorMessage,
          updatedAt: new Date(),
        },
      });
      this.logger.log(`Marked retry ${retryId} as failed: ${errorMessage}`);
    } catch (error) {
      this.logger.error(`Failed to mark retry as failed: ${error.message}`);
    }
  }

  /**
   * Set notification gateway for WebSocket notifications
   */
  setNotificationGateway(gateway: any): void {
    this.notificationGateway = gateway;
  }
}
