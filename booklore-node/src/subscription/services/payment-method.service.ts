import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { StripeService } from './stripe.service';
import { NotificationService } from '../../shared/services/notification.service';
import { PaymentRetryService } from '../../shared/services/payment-retry.service';
import Stripe from 'stripe';

export interface AttachPaymentMethodDto {
  paymentMethodId: string;
  setAsDefault?: boolean;
}

export interface CreateSetupIntentDto {
  customerId: string;
  usage?: 'off_session' | 'on_session';
  metadata?: Record<string, string>;
}

@Injectable()
export class PaymentMethodService {
  private readonly logger = new Logger(PaymentMethodService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly notificationService: NotificationService,
    private readonly paymentRetryService: PaymentRetryService,
  ) {}

  // Create setup intent for adding payment methods
  async createSetupIntent(userId: string): Promise<{
    success: boolean;
    data?: {
      clientSecret: string;
      setupIntentId: string;
    };
    message?: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.stripeCustomerId) {
      throw new BadRequestException('User does not have a Stripe customer ID');
    }

    try {
      const setupIntent = await this.stripeService.createSetupIntent({
        customer: user.stripeCustomerId,
      });

      return {
        success: true,
        data: {
          clientSecret: setupIntent.client_secret!,
          setupIntentId: setupIntent.id,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to create setup intent: ${error.message}`);
      throw new BadRequestException(`Failed to create setup intent: ${error.message}`);
    }
  }

  // Get customer payment methods
  async getPaymentMethods(userId: string): Promise<{
    success: boolean;
    data: {
      paymentMethods: any[];
    };
    message?: string;
  }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: parseInt(userId) },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (!user.stripeCustomerId) {
        return {
          success: true,
          data: {
            paymentMethods: [],
          },
          message: 'No Stripe customer found',
        };
      }

      this.logger.log(`Getting payment methods for customer: ${user.stripeCustomerId}`);

      const paymentMethods = await this.stripeService.getCustomerPaymentMethods(
        user.stripeCustomerId,
      );

      const formattedPaymentMethods = paymentMethods.map(pm => ({
        id: pm.id,
        type: pm.type,
        card: pm.card
          ? {
              brand: pm.card.brand,
              last4: pm.card.last4,
              expMonth: pm.card.exp_month,
              expYear: pm.card.exp_year,
            }
          : null,
      }));

      this.logger.log(`Found ${paymentMethods.length} payment methods`);
      return {
        success: true,
        data: {
          paymentMethods: formattedPaymentMethods,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get payment methods: ${error.message}`);
      throw new BadRequestException(`Failed to get payment methods: ${error.message}`);
    }
  }

  // Get customer payment methods (legacy method)
  async getCustomerPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    try {
      const paymentMethods = await this.stripeService.getCustomerPaymentMethods(customerId);
      return paymentMethods;
    } catch (error) {
      this.logger.error(`Failed to get payment methods: ${error.message}`);
      throw new BadRequestException(`Failed to get payment methods: ${error.message}`);
    }
  }

  // Attach payment method to customer
  async attachPaymentMethod(
    userId: string,
    paymentMethodId: string,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.stripeCustomerId) {
      throw new BadRequestException('User does not have a Stripe customer ID');
    }

    try {
      this.logger.log(
        `Attaching payment method ${paymentMethodId} to customer ${user.stripeCustomerId}`,
      );

      // Attach payment method to customer
      await this.stripeService.attachPaymentMethod(paymentMethodId, user.stripeCustomerId);

      this.logger.log(`Successfully attached payment method: ${paymentMethodId}`);
      return {
        success: true,
        message: 'Payment method attached successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to attach payment method: ${error.message}`);
      throw new BadRequestException(`Failed to attach payment method: ${error.message}`);
    }
  }

  // Detach payment method from customer
  async detachPaymentMethod(paymentMethodId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      this.logger.log(`Detaching payment method: ${paymentMethodId}`);

      await this.stripeService.detachPaymentMethod(paymentMethodId);

      this.logger.log(`Successfully detached payment method: ${paymentMethodId}`);
      return {
        success: true,
        message: 'Payment method detached successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to detach payment method: ${error.message}`);
      throw new BadRequestException(`Failed to detach payment method: ${error.message}`);
    }
  }

  // Set default payment method
  async setDefaultPaymentMethod(
    userId: string,
    paymentMethodId: string,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.stripeCustomerId) {
      throw new BadRequestException('User does not have a Stripe customer ID');
    }

    try {
      this.logger.log(`Setting default payment method for customer ${user.stripeCustomerId}`);

      await this.stripeService.updateCustomerDefaultPaymentMethod(
        user.stripeCustomerId,
        paymentMethodId,
      );

      this.logger.log(`Successfully set default payment method: ${paymentMethodId}`);
      return {
        success: true,
        message: 'Default payment method updated successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to set default payment method: ${error.message}`);
      throw new BadRequestException(`Failed to set default payment method: ${error.message}`);
    }
  }

  // Get default payment method
  async getDefaultPaymentMethod(userId: string): Promise<{
    success: boolean;
    data?: {
      paymentMethod: any;
    };
    message?: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.stripeCustomerId) {
      return {
        success: true,
        data: {
          paymentMethod: null,
        },
        message: 'No Stripe customer found',
      };
    }

    try {
      const customer = await this.stripeService.getCustomer(user.stripeCustomerId);

      if (!customer.invoice_settings?.default_payment_method) {
        return {
          success: true,
          data: {
            paymentMethod: null,
          },
          message: 'No default payment method set',
        };
      }

      const paymentMethodId = customer.invoice_settings.default_payment_method as string;
      const paymentMethod = await this.stripeService.getPaymentMethod(paymentMethodId);

      return {
        success: true,
        data: {
          paymentMethod: {
            id: paymentMethod.id,
            type: paymentMethod.type,
            card: paymentMethod.card
              ? {
                  brand: paymentMethod.card.brand,
                  last4: paymentMethod.card.last4,
                  expMonth: paymentMethod.card.exp_month,
                  expYear: paymentMethod.card.exp_year,
                }
              : null,
          },
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get default payment method: ${error.message}`);
      return {
        success: true,
        data: {
          paymentMethod: null,
        },
        message: 'Failed to get default payment method',
      };
    }
  }

  // Validate payment method for subscription
  async validatePaymentMethodForSubscription(
    customerId: string,
    paymentMethodId?: string,
  ): Promise<boolean> {
    try {
      // If no payment method specified, check if customer has a default
      if (!paymentMethodId) {
        const defaultPaymentMethod = await this.getDefaultPaymentMethod(customerId);
        return !!defaultPaymentMethod;
      }

      // Check if payment method exists and belongs to customer
      const paymentMethod = await this.stripeService.getPaymentMethod(paymentMethodId);
      return paymentMethod.customer === customerId;
    } catch (error) {
      this.logger.error(`Failed to validate payment method: ${error.message}`);
      return false;
    }
  }

  // Handle failed payment
  async handleFailedPayment(subscriptionId: string, invoice: Stripe.Invoice): Promise<void> {
    try {
      this.logger.log(`Handling failed payment for subscription: ${subscriptionId}`);

      // Get subscription details
      const subscription = await this.stripeService.getSubscription(subscriptionId);

      // Check if subscription is past due
      if (subscription.status === 'past_due') {
        // Get user ID from subscription metadata
        const userId = subscription.metadata?.userId;
        if (userId) {
          // Create payment retry record
          await this.paymentRetryService.createPaymentRetry({
            invoiceId: invoice.id,
            userId: parseInt(userId),
            errorMessage: invoice.last_finalization_error?.message || 'Payment failed',
          });

          // Send payment failed notification
          await this.notificationService.createPaymentFailedNotification(
            parseInt(userId),
            subscriptionId,
            invoice.amount_due,
            invoice.currency,
          );

          this.logger.log(`Created payment retry and notification for user ${userId}`);
        }

        // Update subscription status in database
        const userIdNum = parseInt(subscription.metadata.userId);
        if (userIdNum) {
          await this.updateSubscriptionStatus(userIdNum, 'past_due');
        }
      }

      this.logger.log(`Handled failed payment for subscription: ${subscriptionId}`);
    } catch (error) {
      this.logger.error(`Failed to handle failed payment: ${error.message}`);
    }
  }

  // Send payment failed notification (placeholder)
  private async sendPaymentFailedNotification(
    customerId: string,
    _invoiceId: string,
  ): Promise<void> {
    // TODO: Implement email notification service
    this.logger.log(`Should send payment failed notification for customer: ${customerId}`);
  }

  // Update subscription status in database
  private async updateSubscriptionStatus(userId: number, status: string): Promise<void> {
    try {
      await this.prisma.subscription.update({
        where: { userId },
        data: {
          status: status as any,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to update subscription status: ${error.message}`);
    }
  }

  validatePaymentMethod(
    paymentMethod: any,
    customerId: string,
  ): { isValid: boolean; reason: string | null } {
    // Check if payment method belongs to the customer
    if (paymentMethod.customer !== customerId) {
      return {
        isValid: false,
        reason: 'Payment method belongs to different customer',
      };
    }

    // Check if card is expired (for card payment methods)
    if (paymentMethod.type === 'card' && paymentMethod.card) {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // getMonth() returns 0-11

      const expYear = paymentMethod.card.exp_year;
      const expMonth = paymentMethod.card.exp_month;

      if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
        return {
          isValid: false,
          reason: 'Payment method has expired',
        };
      }
    }

    return {
      isValid: true,
      reason: null,
    };
  }
}
