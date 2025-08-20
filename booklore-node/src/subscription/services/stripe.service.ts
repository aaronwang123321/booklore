import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripeConfig } from '../config/stripe.config';
import { SubscriptionPlan, SUBSCRIPTION_PLANS } from '../enums/subscription-plan.enum';

export interface CreateCustomerData {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface CreateSubscriptionData {
  customerId: string;
  priceId: string;
  trialPeriodDays?: number;
  metadata?: Record<string, string>;
}

export interface CreateCheckoutSessionData {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  trialPeriodDays?: number;
  metadata?: Record<string, string>;
}

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly stripeConfig: StripeConfig,
    private readonly configService: ConfigService,
  ) {
    this.stripe = this.stripeConfig.getStripeInstance();
  }

  // Customer Management
  async createCustomer(data: CreateCustomerData): Promise<Stripe.Customer> {
    try {
      this.logger.log(`Creating Stripe customer for email: ${data.email}`);

      const customer = await this.stripe.customers.create({
        email: data.email,
        name: data.name,
        metadata: data.metadata || {},
      });

      this.logger.log(`Created Stripe customer: ${customer.id}`);
      return customer;
    } catch (error) {
      this.logger.error(`Failed to create Stripe customer: ${error.message}`);
      throw new BadRequestException(`Failed to create customer: ${error.message}`);
    }
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);

      if (customer.deleted) {
        throw new BadRequestException('Customer has been deleted');
      }

      return customer as Stripe.Customer;
    } catch (error) {
      this.logger.error(`Failed to retrieve customer ${customerId}: ${error.message}`);
      throw new BadRequestException(`Failed to retrieve customer: ${error.message}`);
    }
  }

  async updateCustomer(
    customerId: string,
    data: Partial<CreateCustomerData>,
  ): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.update(customerId, {
        email: data.email,
        name: data.name,
        metadata: data.metadata,
      });

      this.logger.log(`Updated Stripe customer: ${customerId}`);
      return customer;
    } catch (error) {
      this.logger.error(`Failed to update customer ${customerId}: ${error.message}`);
      throw new BadRequestException(`Failed to update customer: ${error.message}`);
    }
  }

  async deleteCustomer(customerId: string): Promise<void> {
    try {
      await this.stripe.customers.del(customerId);
      this.logger.log(`Deleted Stripe customer: ${customerId}`);
    } catch (error) {
      this.logger.error(`Failed to delete customer ${customerId}: ${error.message}`);
      throw new BadRequestException(`Failed to delete customer: ${error.message}`);
    }
  }

  // Subscription Management
  async createSubscription(data: CreateSubscriptionData): Promise<Stripe.Subscription> {
    try {
      this.logger.log(`Creating subscription for customer: ${data.customerId}`);

      const subscriptionData: Stripe.SubscriptionCreateParams = {
        customer: data.customerId,
        items: [{ price: data.priceId }],
        metadata: data.metadata || {},
        expand: ['latest_invoice.payment_intent'],
      };

      // Add trial period if specified
      if (data.trialPeriodDays && data.trialPeriodDays > 0) {
        subscriptionData.trial_period_days = data.trialPeriodDays;
      }

      const subscription = await this.stripe.subscriptions.create(subscriptionData);

      this.logger.log(`Created subscription: ${subscription.id}`);
      return subscription;
    } catch (error) {
      this.logger.error(`Failed to create subscription: ${error.message}`);
      throw new BadRequestException(`Failed to create subscription: ${error.message}`);
    }
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice.payment_intent'],
      });

      return subscription;
    } catch (error) {
      this.logger.error(`Failed to retrieve subscription ${subscriptionId}: ${error.message}`);
      throw new BadRequestException(`Failed to retrieve subscription: ${error.message}`);
    }
  }

  async updateSubscription(
    subscriptionId: string,
    data: Partial<Stripe.SubscriptionUpdateParams>,
  ): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, data);
      this.logger.log(`Updated subscription: ${subscriptionId}`);
      return subscription;
    } catch (error) {
      this.logger.error(`Failed to update subscription ${subscriptionId}: ${error.message}`);
      throw new BadRequestException(`Failed to update subscription: ${error.message}`);
    }
  }

  async cancelSubscription(
    subscriptionId: string,
    immediately = false,
  ): Promise<Stripe.Subscription> {
    try {
      const subscription = immediately
        ? await this.stripe.subscriptions.cancel(subscriptionId)
        : await this.stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: true,
          });

      this.logger.log(
        `${immediately ? 'Canceled' : 'Scheduled cancellation for'} subscription: ${subscriptionId}`,
      );
      return subscription;
    } catch (error) {
      this.logger.error(`Failed to cancel subscription ${subscriptionId}: ${error.message}`);
      throw new BadRequestException(`Failed to cancel subscription: ${error.message}`);
    }
  }

  async reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });

      this.logger.log(`Reactivated subscription: ${subscriptionId}`);
      return subscription;
    } catch (error) {
      this.logger.error(`Failed to reactivate subscription ${subscriptionId}: ${error.message}`);
      throw new BadRequestException(`Failed to reactivate subscription: ${error.message}`);
    }
  }

  // Checkout Sessions
  async createCheckoutSession(data: CreateCheckoutSessionData): Promise<Stripe.Checkout.Session> {
    try {
      this.logger.log(`Creating checkout session for customer: ${data.customerId}`);

      const sessionData: Stripe.Checkout.SessionCreateParams = {
        customer: data.customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: data.priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: data.successUrl,
        cancel_url: data.cancelUrl,
        metadata: data.metadata || {},
        allow_promotion_codes: true,
        billing_address_collection: 'required',
      };

      // Add trial period if specified
      if (data.trialPeriodDays && data.trialPeriodDays > 0) {
        sessionData.subscription_data = {
          trial_period_days: data.trialPeriodDays,
        };
      }

      const session = await this.stripe.checkout.sessions.create(sessionData);

      this.logger.log(`Created checkout session: ${session.id}`);
      return session;
    } catch (error) {
      this.logger.error(`Failed to create checkout session: ${error.message}`);
      throw new BadRequestException(`Failed to create checkout session: ${error.message}`);
    }
  }

  async getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription', 'customer'],
      });

      return session;
    } catch (error) {
      this.logger.error(`Failed to retrieve checkout session ${sessionId}: ${error.message}`);
      throw new BadRequestException(`Failed to retrieve checkout session: ${error.message}`);
    }
  }

  // Customer Portal
  async createCustomerPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<Stripe.BillingPortal.Session> {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      this.logger.log(`Created customer portal session for: ${customerId}`);
      return session;
    } catch (error) {
      this.logger.error(`Failed to create customer portal session: ${error.message}`);
      throw new BadRequestException(`Failed to create customer portal session: ${error.message}`);
    }
  }

  // Webhook Verification
  constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
    try {
      const webhookSecret = this.stripeConfig.getWebhookSecret();
      if (!webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      this.logger.error(`Failed to construct webhook event: ${error.message}`);
      throw new BadRequestException(`Invalid webhook signature: ${error.message}`);
    }
  }

  // Utility Methods
  async getCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        expand: ['data.latest_invoice.payment_intent'],
      });

      return subscriptions.data;
    } catch (error) {
      this.logger.error(`Failed to get customer subscriptions: ${error.message}`);
      throw new BadRequestException(`Failed to get subscriptions: ${error.message}`);
    }
  }

  async getActiveSubscription(customerId: string): Promise<Stripe.Subscription | null> {
    try {
      const subscriptions = await this.getCustomerSubscriptions(customerId);

      // Find active or trialing subscription
      const activeSubscription = subscriptions.find(
        sub => sub.status === 'active' || sub.status === 'trialing',
      );

      return activeSubscription || null;
    } catch (error) {
      this.logger.error(`Failed to get active subscription: ${error.message}`);
      return null;
    }
  }

  getSubscriptionPlan(priceId: string): SubscriptionPlan | null {
    for (const [plan, config] of Object.entries(SUBSCRIPTION_PLANS)) {
      if (config.stripePriceId === priceId) {
        return plan as SubscriptionPlan;
      }
    }
    return null;
  }

  getPlanConfig(plan: SubscriptionPlan) {
    return SUBSCRIPTION_PLANS[plan];
  }

  getAllPlans() {
    return Object.values(SUBSCRIPTION_PLANS);
  }

  // Invoice Management
  async getUpcomingInvoice(customerId: string): Promise<Stripe.Invoice | null> {
    try {
      const invoice = await this.stripe.invoices.retrieveUpcoming({
        customer: customerId,
      });

      return invoice as any; // UpcomingInvoice doesn't have id, but Invoice interface expects it
    } catch (error) {
      if (error.code === 'invoice_upcoming_none') {
        return null;
      }
      this.logger.error(`Failed to get upcoming invoice: ${error.message}`);
      throw new BadRequestException(`Failed to get upcoming invoice: ${error.message}`);
    }
  }

  async getInvoices(customerId: string, limit = 10): Promise<Stripe.Invoice[]> {
    try {
      const invoices = await this.stripe.invoices.list({
        customer: customerId,
        limit,
      });

      return invoices.data;
    } catch (error) {
      this.logger.error(`Failed to get invoices: ${error.message}`);
      throw new BadRequestException(`Failed to get invoices: ${error.message}`);
    }
  }

  // Payment Method Management
  async createSetupIntent(data: {
    customer: string;
    usage?: 'off_session' | 'on_session';
    payment_method_types?: string[];
    metadata?: Record<string, string>;
  }): Promise<Stripe.SetupIntent> {
    try {
      const setupIntent = await this.stripe.setupIntents.create({
        customer: data.customer,
        usage: data.usage || 'off_session',
        payment_method_types: data.payment_method_types || ['card'],
        metadata: data.metadata || {},
      });

      this.logger.log(`Created setup intent: ${setupIntent.id}`);
      return setupIntent;
    } catch (error) {
      this.logger.error(`Failed to create setup intent: ${error.message}`);
      throw new BadRequestException(`Failed to create setup intent: ${error.message}`);
    }
  }

  async getCustomerPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      return paymentMethods.data;
    } catch (error) {
      this.logger.error(`Failed to get customer payment methods: ${error.message}`);
      throw new BadRequestException(`Failed to get payment methods: ${error.message}`);
    }
  }

  async getPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    try {
      const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);
      return paymentMethod;
    } catch (error) {
      this.logger.error(`Failed to get payment method: ${error.message}`);
      throw new BadRequestException(`Failed to get payment method: ${error.message}`);
    }
  }

  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string,
  ): Promise<Stripe.PaymentMethod> {
    try {
      const paymentMethod = await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      this.logger.log(`Attached payment method ${paymentMethodId} to customer ${customerId}`);
      return paymentMethod;
    } catch (error) {
      this.logger.error(`Failed to attach payment method: ${error.message}`);
      throw new BadRequestException(`Failed to attach payment method: ${error.message}`);
    }
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    try {
      const paymentMethod = await this.stripe.paymentMethods.detach(paymentMethodId);
      this.logger.log(`Detached payment method: ${paymentMethodId}`);
      return paymentMethod;
    } catch (error) {
      this.logger.error(`Failed to detach payment method: ${error.message}`);
      throw new BadRequestException(`Failed to detach payment method: ${error.message}`);
    }
  }

  async updateCustomerDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string,
  ): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      this.logger.log(`Updated default payment method for customer ${customerId}`);
      return customer;
    } catch (error) {
      this.logger.error(`Failed to update default payment method: ${error.message}`);
      throw new BadRequestException(`Failed to update default payment method: ${error.message}`);
    }
  }

  // Enhanced Subscription Management
  async updateSubscriptionPaymentMethod(
    subscriptionId: string,
    paymentMethodId: string,
  ): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, {
        default_payment_method: paymentMethodId,
      });

      this.logger.log(`Updated payment method for subscription: ${subscriptionId}`);
      return subscription;
    } catch (error) {
      this.logger.error(`Failed to update subscription payment method: ${error.message}`);
      throw new BadRequestException(
        `Failed to update subscription payment method: ${error.message}`,
      );
    }
  }

  async getInvoice(invoiceId: string): Promise<Stripe.Invoice> {
    try {
      const invoice = await this.stripe.invoices.retrieve(invoiceId);
      return invoice;
    } catch (error) {
      this.logger.error(`Failed to retrieve invoice ${invoiceId}: ${error.message}`);
      throw new BadRequestException(`Failed to retrieve invoice: ${error.message}`);
    }
  }

  async payInvoice(invoiceId: string): Promise<boolean> {
    try {
      const invoice = await this.stripe.invoices.pay(invoiceId);
      this.logger.log(`Successfully paid invoice: ${invoiceId}`);
      return invoice.status === 'paid';
    } catch (error) {
      this.logger.error(`Failed to pay invoice ${invoiceId}: ${error.message}`);
      return false;
    }
  }

  async retryInvoicePayment(invoiceId: string): Promise<Stripe.Invoice> {
    try {
      const invoice = await this.stripe.invoices.pay(invoiceId);
      this.logger.log(`Retried payment for invoice: ${invoiceId}`);
      return invoice;
    } catch (error) {
      this.logger.error(`Failed to retry invoice payment: ${error.message}`);
      throw new BadRequestException(`Failed to retry payment: ${error.message}`);
    }
  }

  // Discount and Coupon Management
  async applyCouponToCustomer(customerId: string, couponId: string): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.update(customerId, {
        coupon: couponId,
      });

      this.logger.log(`Applied coupon ${couponId} to customer ${customerId}`);
      return customer;
    } catch (error) {
      this.logger.error(`Failed to apply coupon: ${error.message}`);
      throw new BadRequestException(`Failed to apply coupon: ${error.message}`);
    }
  }

  async removeCouponFromCustomer(customerId: string): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.update(customerId, {
        coupon: '',
      });

      this.logger.log(`Removed coupon from customer ${customerId}`);
      return customer;
    } catch (error) {
      this.logger.error(`Failed to remove coupon: ${error.message}`);
      throw new BadRequestException(`Failed to remove coupon: ${error.message}`);
    }
  }

  async validateCoupon(couponId: string): Promise<Stripe.Coupon> {
    try {
      const coupon = await this.stripe.coupons.retrieve(couponId);

      if (!coupon.valid) {
        throw new BadRequestException('Coupon is not valid');
      }

      return coupon;
    } catch (error) {
      this.logger.error(`Failed to validate coupon: ${error.message}`);
      throw new BadRequestException(`Invalid coupon: ${error.message}`);
    }
  }

  // Subscription Change Preview
  async getSubscriptionChangePreview(
    subscriptionId: string,
    newPriceId: string,
  ): Promise<Stripe.UpcomingInvoice> {
    try {
      // Get current subscription to get the subscription item ID
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);

      if (!subscription.items.data[0]) {
        throw new BadRequestException('No subscription items found');
      }

      const subscriptionItemId = subscription.items.data[0].id;

      // Get upcoming invoice preview with the new price
      const upcomingInvoice = await this.stripe.invoices.retrieveUpcoming({
        customer: subscription.customer as string,
        subscription: subscriptionId,
        subscription_items: [
          {
            id: subscriptionItemId,
            price: newPriceId,
          },
        ],
        subscription_proration_behavior: 'create_prorations',
      });

      this.logger.log(`Generated subscription change preview for subscription: ${subscriptionId}`);
      return upcomingInvoice;
    } catch (error) {
      this.logger.error(`Failed to get subscription change preview: ${error.message}`);
      throw new BadRequestException(`Failed to get subscription change preview: ${error.message}`);
    }
  }

  // Enhanced subscription update with better error handling
  async updateSubscriptionWithRetry(
    subscriptionId: string,
    updateParams: Stripe.SubscriptionUpdateParams,
    maxRetries: number = 3,
  ): Promise<Stripe.Subscription> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const subscription = await this.stripe.subscriptions.update(subscriptionId, updateParams);
        this.logger.log(
          `Successfully updated subscription ${subscriptionId} on attempt ${attempt}`,
        );
        return subscription;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Subscription update attempt ${attempt} failed: ${error.message}`);

        // Don't retry on certain errors
        if (error.code === 'resource_missing' || error.code === 'subscription_canceled') {
          break;
        }

        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    this.logger.error(
      `Failed to update subscription after ${maxRetries} attempts: ${lastError.message}`,
    );
    throw new BadRequestException(`Failed to update subscription: ${lastError.message}`);
  }
}
