import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StripeService } from '../services/stripe.service';
import { SubscriptionService } from '../services/subscription.service';
import { PaymentRetryService } from '../services/payment-retry.service';
import { WebSocketNotificationService } from '../../shared/services/websocket-notification.service';
import { NotificationService } from '../../shared/services/notification.service';
import Stripe from 'stripe';
import { Request } from 'express';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly subscriptionService: SubscriptionService,
    private readonly paymentRetryService: PaymentRetryService,
    private readonly webSocketNotificationService: WebSocketNotificationService,
    private readonly notificationService: NotificationService,
  ) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Stripe webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook signature' })
  async handleStripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    try {
      if (!signature) {
        throw new BadRequestException('Missing Stripe signature');
      }

      // Get raw body for signature verification
      const payload = request.rawBody || request.body;
      if (!payload) {
        throw new BadRequestException('Missing request body');
      }

      // Construct and verify webhook event
      const event = this.stripeService.constructWebhookEvent(payload, signature);

      this.logger.log(`Received Stripe webhook: ${event.type} (${event.id})`);

      // Handle different event types
      await this.handleWebhookEvent(event);

      return { received: true };
    } catch (error) {
      this.logger.error(`Webhook error: ${error.message}`);
      throw new BadRequestException(`Webhook error: ${error.message}`);
    }
  }

  private async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    try {
      switch (event.type) {
        // Subscription events
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.trial_will_end':
          await this.handleTrialWillEnd(event.data.object as Stripe.Subscription);
          break;

        // Invoice events
        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.upcoming':
          await this.handleInvoiceUpcoming(event.data.object as Stripe.Invoice);
          break;

        // Customer events
        case 'customer.created':
          await this.handleCustomerCreated(event.data.object as Stripe.Customer);
          break;

        case 'customer.updated':
          await this.handleCustomerUpdated(event.data.object as Stripe.Customer);
          break;

        case 'customer.deleted':
          await this.handleCustomerDeleted(event.data.object as Stripe.Customer);
          break;

        // Checkout events
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case 'checkout.session.expired':
          await this.handleCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session);
          break;

        // Payment method events
        case 'payment_method.attached':
          await this.handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod);
          break;

        default:
          this.logger.log(`Unhandled webhook event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error(`Error handling webhook event ${event.type}: ${error.message}`);
      throw error;
    }
  }

  // Subscription event handlers
  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription created: ${subscription.id}`);
    await this.subscriptionService.updateSubscriptionFromStripe(subscription);
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription updated: ${subscription.id}`);
    await this.subscriptionService.updateSubscriptionFromStripe(subscription);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription deleted: ${subscription.id}`);
    await this.subscriptionService.updateSubscriptionFromStripe(subscription);
  }

  private async handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Trial will end for subscription: ${subscription.id}`);

    const userId = subscription.metadata?.userId;
    if (userId) {
      try {
        const trialEndDate = subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : new Date();

        // Create in-app notification
        await this.notificationService.createTrialEndingNotification(
          parseInt(userId),
          trialEndDate,
        );

        // Send WebSocket notification
        await this.webSocketNotificationService.sendTrialEndingNotification(userId, {
          trialEndDate,
          daysRemaining: Math.ceil((trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        });

        this.logger.log(`Sent trial ending notifications to user ${userId}`);
      } catch (error) {
        this.logger.error(`Failed to send trial ending notifications: ${error.message}`);
      }
    }
  }

  // Invoice event handlers
  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice payment succeeded: ${invoice.id}`);

    // Update subscription status if needed
    if (invoice.subscription) {
      const subscription = await this.stripeService.getSubscription(invoice.subscription as string);
      await this.subscriptionService.updateSubscriptionFromStripe(subscription);

      // Send payment success notifications
      const userId = subscription.metadata?.userId;
      if (userId) {
        try {
          // Get subscription details for notifications
          const subscriptionData = await this.subscriptionService.getUserSubscription(
            parseInt(userId),
          );

          if (subscriptionData) {
            // Create in-app notification
            await this.notificationService.createPaymentSuccessNotification(
              parseInt(userId),
              subscriptionData.plan,
              invoice.amount_paid,
              invoice.currency,
            );

            // Send WebSocket notification
            await this.webSocketNotificationService.sendPaymentSuccessNotification(userId, {
              planName: subscriptionData.plan,
              amount: invoice.amount_paid,
              currency: invoice.currency,
              nextBillingDate: subscription.current_period_end
                ? new Date(subscription.current_period_end * 1000)
                : undefined,
            });

            this.logger.log(`Sent payment success notifications to user ${userId}`);
          }
        } catch (error) {
          this.logger.error(`Failed to send payment success notifications: ${error.message}`);
        }
      }
    }
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice payment failed: ${invoice.id}`);

    // Handle failed payment - could send notification or update subscription status
    if (invoice.subscription) {
      const subscription = await this.stripeService.getSubscription(invoice.subscription as string);
      await this.subscriptionService.updateSubscriptionFromStripe(subscription);

      // Get user ID from subscription metadata
      const userId = subscription.metadata?.userId;
      if (userId) {
        try {
          // Create payment retry record
          await this.paymentRetryService.createPaymentRetry({
            invoiceId: invoice.id,
            userId: parseInt(userId),
            errorMessage: invoice.last_finalization_error?.message || 'Payment failed',
          });

          // Send immediate notification about payment failure
          await this.notificationService.createPaymentFailedNotification(
            parseInt(userId),
            invoice.subscription as string,
            invoice.amount_due,
            invoice.currency,
          );

          // Send WebSocket notification
          await this.webSocketNotificationService.sendPaymentFailureNotification(userId, {
            planName: 'Subscription',
            amount: invoice.amount_due,
            currency: invoice.currency,
            failureReason: invoice.last_finalization_error?.message,
          });

          this.logger.log(`Created payment retry and sent notifications for user ${userId}`);
        } catch (error) {
          this.logger.error(
            `Failed to handle payment failure for user ${userId}: ${error.message}`,
          );
        }
      }
    }
  }

  private async handleInvoiceUpcoming(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Upcoming invoice: ${invoice.id}`);

    // Send upcoming invoice notification to user
    await this.sendUpcomingInvoiceNotification(invoice);
  }

  // Payment retry endpoint for manual retry
  @Post('retry-payment')
  async retryPayment(@Body('invoiceId') invoiceId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Get pending retry for this invoice
      const pendingRetries = await this.paymentRetryService.getPendingRetries();
      const retry = pendingRetries.find(r => r.invoiceId === invoiceId);

      if (!retry) {
        return {
          success: false,
          message: 'No pending retry found for this invoice',
        };
      }

      // Process the retry immediately
      const invoice = await this.stripeService.getInvoice(invoiceId);
      const success = await this.stripeService.payInvoice(invoiceId);

      if (success) {
        await this.paymentRetryService.markRetryAsSuccessful(retry.id);
        await this.notificationService.createPaymentSuccessNotification(
          retry.userId,
          'Subscription',
          invoice.amount_paid,
          invoice.currency,
        );
        return {
          success: true,
          message: 'Payment retry successful',
        };
      } else {
        await this.paymentRetryService.markRetryAsFailed(retry.id, 'Manual retry failed');
        return {
          success: false,
          message: 'Payment retry failed',
        };
      }
    } catch (error) {
      this.logger.error(`Manual payment retry failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  private async sendUpcomingInvoiceNotification(invoice: Stripe.Invoice): Promise<void> {
    try {
      if (!invoice.customer) return;

      const customerId = invoice.customer as string;
      const customer = await this.stripeService.getCustomer(customerId);

      // TODO: Implement email notification service
      this.logger.log(`Should send upcoming invoice notification to ${customer.email}`);
    } catch (error) {
      this.logger.error(`Error sending upcoming invoice notification: ${error.message}`);
    }
  }

  // Customer event handlers
  private async handleCustomerCreated(customer: Stripe.Customer): Promise<void> {
    this.logger.log(`Customer created: ${customer.id}`);
    // Customer creation is handled in the subscription service
  }

  private async handleCustomerUpdated(customer: Stripe.Customer): Promise<void> {
    this.logger.log(`Customer updated: ${customer.id}`);
    // Handle customer updates if needed
  }

  private async handleCustomerDeleted(customer: Stripe.Customer): Promise<void> {
    this.logger.log(`Customer deleted: ${customer.id}`);
    // Handle customer deletion if needed
  }

  // Checkout event handlers
  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    this.logger.log(`Checkout session completed: ${session.id}`);

    // The subscription should be created automatically by Stripe
    // We'll update it when we receive the subscription.created event

    if (session.subscription) {
      const subscription = await this.stripeService.getSubscription(session.subscription as string);
      await this.subscriptionService.updateSubscriptionFromStripe(subscription);
    }
  }

  private async handleCheckoutSessionExpired(session: Stripe.Checkout.Session): Promise<void> {
    this.logger.log(`Checkout session expired: ${session.id}`);
    // Handle expired checkout session if needed
  }

  // Payment method event handlers
  private async handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod): Promise<void> {
    this.logger.log(`Payment method attached: ${paymentMethod.id}`);
    // Handle payment method attachment if needed
  }
}
