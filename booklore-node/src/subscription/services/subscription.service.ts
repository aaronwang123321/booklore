import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { StripeService } from './stripe.service';
import {
  SubscriptionPlan,
  SubscriptionStatus,
  SUBSCRIPTION_PLANS,
} from '../enums/subscription-plan.enum';
import { User, Subscription } from '@prisma/client';
import Stripe from 'stripe';

export interface CreateSubscriptionDto {
  userId: number;
  plan: SubscriptionPlan;
  paymentMethodId?: string;
  trialPeriodDays?: number;
}

export interface SubscriptionWithDetails extends Subscription {
  user: User;
  planConfig: any;
  stripeSubscription?: Stripe.Subscription;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  // Create or update subscription
  async createSubscription(data: CreateSubscriptionDto): Promise<SubscriptionWithDetails> {
    try {
      this.logger.log(`Creating subscription for user ${data.userId} with plan ${data.plan}`);

      // Get user
      const user = await this.prisma.user.findUnique({
        where: { id: data.userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Get plan configuration
      const planConfig = SUBSCRIPTION_PLANS[data.plan];
      if (!planConfig) {
        throw new BadRequestException('Invalid subscription plan');
      }

      // For free plan, create subscription without Stripe
      if (data.plan === SubscriptionPlan.FREE) {
        return this.createFreeSubscription(user);
      }

      // Create or get Stripe customer
      let stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        const stripeCustomer = await this.stripeService.createCustomer({
          email: user.email,
          name: user.name || undefined,
          metadata: {
            userId: user.id.toString(),
          },
        });
        stripeCustomerId = stripeCustomer.id;

        // Update user with Stripe customer ID
        await this.prisma.user.update({
          where: { id: user.id },
          data: { stripeCustomerId },
        });
      }

      // Create Stripe subscription
      const stripeSubscription = await this.stripeService.createSubscription({
        customerId: stripeCustomerId,
        priceId: planConfig.stripePriceId,
        trialPeriodDays: data.trialPeriodDays || 14,
        metadata: {
          userId: user.id.toString(),
          plan: data.plan,
        },
      });

      // Create or update subscription in database
      const subscription = await this.upsertSubscription({
        userId: user.id,
        plan: data.plan,
        status: this.mapStripeStatus(stripeSubscription.status),
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        trialStart: stripeSubscription.trial_start
          ? new Date(stripeSubscription.trial_start * 1000)
          : null,
        trialEnd: stripeSubscription.trial_end
          ? new Date(stripeSubscription.trial_end * 1000)
          : null,
      });

      return {
        ...subscription,
        user,
        planConfig,
        stripeSubscription,
      };
    } catch (error) {
      this.logger.error(`Failed to create subscription: ${error.message}`);
      throw error;
    }
  }

  private async createFreeSubscription(user: User): Promise<SubscriptionWithDetails> {
    const subscription = await this.upsertSubscription({
      userId: user.id,
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      trialStart: null,
      trialEnd: null,
    });

    return {
      ...subscription,
      user,
      planConfig: SUBSCRIPTION_PLANS[SubscriptionPlan.FREE],
    };
  }

  private async upsertSubscription(data: {
    userId: number;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    stripeSubscriptionId: string | null;
    stripeCustomerId: string | null;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    trialStart: Date | null;
    trialEnd: Date | null;
  }): Promise<Subscription> {
    return this.prisma.subscription.upsert({
      where: { userId: data.userId },
      update: {
        plan: data.plan,
        status: data.status,
        stripeSubscriptionId: data.stripeSubscriptionId,
        stripeCustomerId: data.stripeCustomerId,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        trialStart: data.trialStart,
        trialEnd: data.trialEnd,
        updatedAt: new Date(),
      },
      create: {
        userId: data.userId,
        plan: data.plan,
        status: data.status,
        stripeSubscriptionId: data.stripeSubscriptionId,
        stripeCustomerId: data.stripeCustomerId,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        trialStart: data.trialStart,
        trialEnd: data.trialEnd,
      },
    });
  }

  // Get user subscription
  async getUserSubscription(userId: number): Promise<SubscriptionWithDetails | null> {
    try {
      const subscription = await this.prisma.subscription.findUnique({
        where: { userId },
        include: { user: true },
      });

      if (!subscription) {
        return null;
      }

      const planConfig = SUBSCRIPTION_PLANS[subscription.plan as SubscriptionPlan];
      let stripeSubscription: Stripe.Subscription | undefined;

      // Get Stripe subscription details if available
      if (subscription.stripeSubscriptionId) {
        try {
          stripeSubscription = await this.stripeService.getSubscription(
            subscription.stripeSubscriptionId,
          );
        } catch (error) {
          this.logger.warn(`Failed to get Stripe subscription: ${error.message}`);
        }
      }

      return {
        ...subscription,
        planConfig,
        stripeSubscription,
      };
    } catch (error) {
      this.logger.error(`Failed to get user subscription: ${error.message}`);
      return null;
    }
  }

  // Check if user has active subscription
  async hasActiveSubscription(userId: number): Promise<boolean> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription) {
        return false;
      }

      // Check if subscription is active or in trial
      const isActive =
        subscription.status === SubscriptionStatus.ACTIVE ||
        subscription.status === SubscriptionStatus.TRIALING;

      // Check if subscription hasn't expired
      const isNotExpired = subscription.currentPeriodEnd > new Date();

      return isActive && isNotExpired;
    } catch (error) {
      this.logger.error(`Failed to check active subscription: ${error.message}`);
      return false;
    }
  }

  // Check if user is in trial period
  async isInTrialPeriod(userId: number): Promise<boolean> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription || !subscription.trialEnd) {
        return false;
      }

      return (
        subscription.status === SubscriptionStatus.TRIALING && subscription.trialEnd > new Date()
      );
    } catch (error) {
      this.logger.error(`Failed to check trial period: ${error.message}`);
      return false;
    }
  }

  // Get subscription limits
  async getSubscriptionLimits(userId: number) {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription) {
        // Return free plan limits if no subscription
        return SUBSCRIPTION_PLANS[SubscriptionPlan.FREE].limits;
      }

      return subscription.planConfig.limits;
    } catch (error) {
      this.logger.error(`Failed to get subscription limits: ${error.message}`);
      return SUBSCRIPTION_PLANS[SubscriptionPlan.FREE].limits;
    }
  }

  // Cancel subscription
  async cancelSubscription(userId: number, immediately = false): Promise<SubscriptionWithDetails> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription) {
        throw new NotFoundException('Subscription not found');
      }

      if (subscription.plan === SubscriptionPlan.FREE) {
        throw new BadRequestException('Cannot cancel free subscription');
      }

      if (!subscription.stripeSubscriptionId) {
        throw new BadRequestException('No Stripe subscription found');
      }

      // Cancel Stripe subscription
      const stripeSubscription = await this.stripeService.cancelSubscription(
        subscription.stripeSubscriptionId,
        immediately,
      );

      // Update subscription status
      const updatedSubscription = await this.prisma.subscription.update({
        where: { userId },
        data: {
          status: immediately ? SubscriptionStatus.CANCELED : subscription.status,
          canceledAt: immediately ? new Date() : null,
          updatedAt: new Date(),
        },
        include: { user: true },
      });

      return {
        ...updatedSubscription,
        planConfig: subscription.planConfig,
        stripeSubscription,
      };
    } catch (error) {
      this.logger.error(`Failed to cancel subscription: ${error.message}`);
      throw error;
    }
  }

  // Reactivate subscription
  async reactivateSubscription(userId: number): Promise<SubscriptionWithDetails> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription) {
        throw new NotFoundException('Subscription not found');
      }

      if (!subscription.stripeSubscriptionId) {
        throw new BadRequestException('No Stripe subscription found');
      }

      // Reactivate Stripe subscription
      const stripeSubscription = await this.stripeService.reactivateSubscription(
        subscription.stripeSubscriptionId,
      );

      // Update subscription status
      const updatedSubscription = await this.prisma.subscription.update({
        where: { userId },
        data: {
          status: this.mapStripeStatus(stripeSubscription.status),
          canceledAt: null,
          updatedAt: new Date(),
        },
        include: { user: true },
      });

      return {
        ...updatedSubscription,
        planConfig: subscription.planConfig,
        stripeSubscription,
      };
    } catch (error) {
      this.logger.error(`Failed to reactivate subscription: ${error.message}`);
      throw error;
    }
  }

  // Update subscription from Stripe webhook
  async updateSubscriptionFromStripe(stripeSubscription: Stripe.Subscription): Promise<void> {
    try {
      const userId = parseInt(stripeSubscription.metadata.userId);
      if (!userId) {
        this.logger.warn('No userId found in Stripe subscription metadata');
        return;
      }

      const plan = stripeSubscription.metadata.plan as SubscriptionPlan;
      if (!plan || !SUBSCRIPTION_PLANS[plan]) {
        this.logger.warn('Invalid plan in Stripe subscription metadata');
        return;
      }

      await this.upsertSubscription({
        userId,
        plan,
        status: this.mapStripeStatus(stripeSubscription.status),
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: stripeSubscription.customer as string,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        trialStart: stripeSubscription.trial_start
          ? new Date(stripeSubscription.trial_start * 1000)
          : null,
        trialEnd: stripeSubscription.trial_end
          ? new Date(stripeSubscription.trial_end * 1000)
          : null,
      });

      this.logger.log(`Updated subscription for user ${userId} from Stripe webhook`);
    } catch (error) {
      this.logger.error(`Failed to update subscription from Stripe: ${error.message}`);
    }
  }

  // Helper method to map Stripe status to our enum
  private mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    switch (stripeStatus) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'canceled':
        return SubscriptionStatus.CANCELED;
      case 'incomplete':
        return SubscriptionStatus.INCOMPLETE;
      case 'incomplete_expired':
        return SubscriptionStatus.INCOMPLETE_EXPIRED;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'unpaid':
        return SubscriptionStatus.UNPAID;
      default:
        return SubscriptionStatus.INCOMPLETE;
    }
  }

  // Get all available plans
  getAllPlans() {
    return this.stripeService.getAllPlans();
  }

  // Create checkout session
  async createCheckoutSession(
    userId: number,
    plan: SubscriptionPlan,
    successUrl: string,
    cancelUrl: string,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const planConfig = SUBSCRIPTION_PLANS[plan];
      if (!planConfig || plan === SubscriptionPlan.FREE) {
        throw new BadRequestException('Invalid subscription plan');
      }

      // Create or get Stripe customer
      let stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        const stripeCustomer = await this.stripeService.createCustomer({
          email: user.email,
          name: user.name || undefined,
          metadata: {
            userId: user.id.toString(),
          },
        });
        stripeCustomerId = stripeCustomer.id;

        // Update user with Stripe customer ID
        await this.prisma.user.update({
          where: { id: user.id },
          data: { stripeCustomerId },
        });
      }

      // Create checkout session
      const session = await this.stripeService.createCheckoutSession({
        customerId: stripeCustomerId,
        priceId: planConfig.stripePriceId,
        successUrl,
        cancelUrl,
        trialPeriodDays: 14,
        metadata: {
          userId: user.id.toString(),
          plan,
        },
      });

      return session;
    } catch (error) {
      this.logger.error(`Failed to create checkout session: ${error.message}`);
      throw error;
    }
  }

  // Create customer portal session
  async createCustomerPortalSession(userId: number, returnUrl: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.stripeCustomerId) {
        throw new BadRequestException('No Stripe customer found');
      }

      const session = await this.stripeService.createCustomerPortalSession(
        user.stripeCustomerId,
        returnUrl,
      );

      return session;
    } catch (error) {
      this.logger.error(`Failed to create customer portal session: ${error.message}`);
      throw error;
    }
  }

  // Update subscription status (used by webhook handlers)
  async updateSubscriptionStatus(userId: number, status: string): Promise<void> {
    try {
      await this.prisma.subscription.update({
        where: { userId },
        data: {
          status: status as any,
          updatedAt: new Date(),
        },
      });

      this.logger.log(`Updated subscription status for user ${userId} to ${status}`);
    } catch (error) {
      this.logger.error(`Failed to update subscription status: ${error.message}`);
      throw error;
    }
  }

  // Retry failed payment
  async retryFailedPayment(userId: number): Promise<{ success: boolean; message: string }> {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription || !subscription.stripeSubscriptionId) {
        throw new BadRequestException('No active subscription found');
      }

      // Get the latest invoice
      const stripeSubscription = await this.stripeService.getSubscription(
        subscription.stripeSubscriptionId,
      );

      if (!stripeSubscription.latest_invoice) {
        throw new BadRequestException('No invoice found to retry');
      }

      const invoiceId = stripeSubscription.latest_invoice as string;

      // Retry the payment
      const invoice = await this.stripeService.retryInvoicePayment(invoiceId);

      if (invoice.status === 'paid') {
        // Update subscription status if payment succeeded
        await this.updateSubscriptionStatus(userId, 'active');

        return {
          success: true,
          message: 'Payment retry successful',
        };
      } else {
        return {
          success: false,
          message: 'Payment retry failed',
        };
      }
    } catch (error) {
      this.logger.error(`Failed to retry payment: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // Get subscription usage and limits
  async getSubscriptionUsage(userId: number) {
    try {
      const subscription = await this.getUserSubscription(userId);

      if (!subscription) {
        return {
          plan: 'FREE',
          limits: SUBSCRIPTION_PLANS[SubscriptionPlan.FREE].limits,
          usage: {
            libraries: 0,
            books: 0,
            storage: 0,
            users: 1,
          },
        };
      }

      // Get actual usage from database
      const [libraryCount, bookCount, userCount] = await Promise.all([
        this.prisma.library.count({ where: { ownerId: userId } }),
        this.prisma.book.count({
          where: {
            library: {
              ownerId: userId,
            },
          },
        }),
        this.prisma.libraryMember.count({
          where: {
            library: {
              ownerId: userId,
            },
          },
        }),
      ]);

      // Calculate storage usage (placeholder - would need actual file size calculation)
      const storageUsage = await this.calculateStorageUsage(userId);

      return {
        plan: subscription.plan,
        limits: subscription.planConfig.limits,
        usage: {
          libraries: libraryCount,
          books: bookCount,
          storage: storageUsage,
          users: userCount + 1, // +1 for the owner
        },
        isWithinLimits: {
          libraries: libraryCount <= subscription.planConfig.limits.libraries,
          books: bookCount <= subscription.planConfig.limits.booksPerLibrary,
          storage: storageUsage <= subscription.planConfig.limits.storageGB * 1024 * 1024 * 1024,
          users: userCount + 1 <= subscription.planConfig.limits.users,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get subscription usage: ${error.message}`);
      throw error;
    }
  }

  private async calculateStorageUsage(userId: number): Promise<number> {
    try {
      // Sum up file sizes for all books owned by the user
      const result = await this.prisma.book.aggregate({
        where: {
          library: {
            ownerId: userId,
          },
        },
        _sum: {
          fileSize: true,
        },
      });

      return result._sum.fileSize || 0;
    } catch (error) {
      this.logger.error(`Failed to calculate storage usage: ${error.message}`);
      return 0;
    }
  }

  // Upgrade or downgrade subscription
  async changeSubscriptionPlan(
    userId: number,
    newPlan: SubscriptionPlan,
    prorate: boolean = true,
  ): Promise<SubscriptionWithDetails> {
    try {
      this.logger.log(`Changing subscription for user ${userId} to plan ${newPlan}`);

      const currentSubscription = await this.getUserSubscription(userId);
      if (!currentSubscription) {
        throw new BadRequestException('No active subscription found');
      }

      const currentPlan = currentSubscription.plan as SubscriptionPlan;
      if (currentPlan === newPlan) {
        throw new BadRequestException('User is already on the requested plan');
      }

      const newPlanConfig = SUBSCRIPTION_PLANS[newPlan];
      if (!newPlanConfig) {
        throw new BadRequestException('Invalid subscription plan');
      }

      // Handle downgrade to free plan
      if (newPlan === SubscriptionPlan.FREE) {
        return this.downgradeToFreePlan(userId, currentSubscription);
      }

      // Handle upgrade from free plan
      if (currentPlan === SubscriptionPlan.FREE) {
        return this.upgradeFromFreePlan(userId, newPlan);
      }

      // Handle plan change between paid plans
      return this.changePaidPlan(userId, currentSubscription, newPlan, prorate);
    } catch (error) {
      this.logger.error(`Failed to change subscription plan: ${error.message}`);
      throw error;
    }
  }

  private async downgradeToFreePlan(
    userId: number,
    currentSubscription: SubscriptionWithDetails,
  ): Promise<SubscriptionWithDetails> {
    // Cancel the current Stripe subscription at period end
    if (currentSubscription.stripeSubscriptionId) {
      await this.stripeService.cancelSubscription(
        currentSubscription.stripeSubscriptionId,
        false, // Don't cancel immediately, let it run until period end
      );
    }

    // Update subscription to indicate it will downgrade to free at period end
    const subscription = await this.prisma.subscription.update({
      where: { userId },
      data: {
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        canceledAt: new Date(),
        updatedAt: new Date(),
      },
      include: { user: true },
    });

    return {
      ...subscription,
      planConfig: SUBSCRIPTION_PLANS[SubscriptionPlan.FREE],
    };
  }

  private async upgradeFromFreePlan(
    userId: number,
    newPlan: SubscriptionPlan,
  ): Promise<SubscriptionWithDetails> {
    // This is essentially creating a new paid subscription
    return this.createSubscription({
      userId,
      plan: newPlan,
    });
  }

  private async changePaidPlan(
    userId: number,
    currentSubscription: SubscriptionWithDetails,
    newPlan: SubscriptionPlan,
    prorate: boolean,
  ): Promise<SubscriptionWithDetails> {
    if (!currentSubscription.stripeSubscriptionId) {
      throw new BadRequestException('No Stripe subscription found');
    }

    const newPlanConfig = SUBSCRIPTION_PLANS[newPlan];

    // Update the Stripe subscription
    const updatedStripeSubscription = await this.stripeService.updateSubscription(
      currentSubscription.stripeSubscriptionId,
      {
        items: [
          {
            id: currentSubscription.stripeSubscription?.items.data[0].id,
            price: newPlanConfig.stripePriceId,
          },
        ],
        proration_behavior: prorate ? 'create_prorations' : 'none',
        metadata: {
          userId: userId.toString(),
          plan: newPlan,
          previousPlan: currentSubscription.plan,
          changeDate: new Date().toISOString(),
        },
      },
    );

    // Update subscription in database
    const subscription = await this.prisma.subscription.update({
      where: { userId },
      data: {
        plan: newPlan,
        status: this.mapStripeStatus(updatedStripeSubscription.status),
        currentPeriodStart: new Date(updatedStripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(updatedStripeSubscription.current_period_end * 1000),
        updatedAt: new Date(),
      },
      include: { user: true },
    });

    return {
      ...subscription,
      planConfig: newPlanConfig,
      stripeSubscription: updatedStripeSubscription,
    };
  }

  // Get plan change preview (prorated amount)
  async getSubscriptionChangePreview(
    userId: number,
    newPlan: SubscriptionPlan,
  ): Promise<{
    currentPlan: SubscriptionPlan;
    newPlan: SubscriptionPlan;
    proratedAmount: number;
    currency: string;
    effectiveDate: Date;
    nextBillingDate: Date;
  }> {
    try {
      const currentSubscription = await this.getUserSubscription(userId);
      if (!currentSubscription) {
        throw new BadRequestException('No active subscription found');
      }

      const currentPlan = currentSubscription.plan as SubscriptionPlan;
      if (currentPlan === newPlan) {
        throw new BadRequestException('User is already on the requested plan');
      }

      const newPlanConfig = SUBSCRIPTION_PLANS[newPlan];
      if (!newPlanConfig) {
        throw new BadRequestException('Invalid subscription plan');
      }

      // For free plan changes, no prorated amount
      if (newPlan === SubscriptionPlan.FREE || currentPlan === SubscriptionPlan.FREE) {
        return {
          currentPlan,
          newPlan,
          proratedAmount: 0,
          currency: 'USD',
          effectiveDate: new Date(),
          nextBillingDate: currentSubscription.currentPeriodEnd,
        };
      }

      // Get upcoming invoice preview for the change
      if (!currentSubscription.stripeSubscriptionId) {
        throw new BadRequestException('No Stripe subscription found');
      }

      const preview = await this.stripeService.getSubscriptionChangePreview(
        currentSubscription.stripeSubscriptionId,
        newPlanConfig.stripePriceId,
      );

      return {
        currentPlan,
        newPlan,
        proratedAmount: preview.amount_due / 100, // Convert from cents
        currency: preview.currency.toUpperCase(),
        effectiveDate: new Date(),
        nextBillingDate: new Date(preview.period_end * 1000),
      };
    } catch (error) {
      this.logger.error(`Failed to get subscription change preview: ${error.message}`);
      throw error;
    }
  }
}
