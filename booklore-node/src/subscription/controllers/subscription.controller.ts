import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User, SubscriptionStatus } from '@prisma/client';
import { SubscriptionService } from '../services/subscription.service';
import { StripeService } from '../services/stripe.service';
import { PaymentRetryService } from '../services/payment-retry.service';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';

class CreateCheckoutSessionDto {
  plan: SubscriptionPlan;
  successUrl: string;
  cancelUrl: string;
}

class CreatePortalSessionDto {
  returnUrl: string;
}

class ChangeSubscriptionPlanDto {
  plan: SubscriptionPlan;
  prorate?: boolean;
}

class PreviewSubscriptionChangeDto {
  plan: SubscriptionPlan;
}

@ApiTags('Subscription')
@Controller('subscription')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly stripeService: StripeService,
    private readonly paymentRetryService: PaymentRetryService,
  ) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get all available subscription plans' })
  @ApiResponse({ status: 200, description: 'Plans retrieved successfully' })
  async getPlans() {
    const plans = this.subscriptionService.getAllPlans();

    return {
      success: true,
      data: plans,
    };
  }

  @Get('current')
  @ApiOperation({ summary: 'Get current user subscription' })
  @ApiResponse({ status: 200, description: 'Subscription retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentSubscription(@CurrentUser() user: User) {
    const subscription = await this.subscriptionService.getUserSubscription(user.id);

    if (!subscription) {
      return {
        success: true,
        data: null,
        message: 'No subscription found',
      };
    }

    // Don't expose sensitive Stripe data
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { stripeSubscription, ...safeSubscription } = subscription;

    return {
      success: true,
      data: {
        ...safeSubscription,
        isActive: await this.subscriptionService.hasActiveSubscription(user.id),
        isInTrial: await this.subscriptionService.isInTrialPeriod(user.id),
        limits: await this.subscriptionService.getSubscriptionLimits(user.id),
      },
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get subscription status and limits' })
  @ApiResponse({ status: 200, description: 'Status retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSubscriptionStatus(@CurrentUser() user: User) {
    const [isActive, isInTrial, limits] = await Promise.all([
      this.subscriptionService.hasActiveSubscription(user.id),
      this.subscriptionService.isInTrialPeriod(user.id),
      this.subscriptionService.getSubscriptionLimits(user.id),
    ]);

    return {
      success: true,
      data: {
        isActive,
        isInTrial,
        limits,
      },
    };
  }

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  @ApiBody({ type: CreateCheckoutSessionDto })
  @ApiResponse({ status: 200, description: 'Checkout session created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createCheckoutSession(
    @CurrentUser() user: User,
    @Body() createCheckoutSessionDto: CreateCheckoutSessionDto,
  ) {
    const { plan, successUrl, cancelUrl } = createCheckoutSessionDto;

    if (!Object.values(SubscriptionPlan).includes(plan)) {
      throw new BadRequestException('Invalid subscription plan');
    }

    if (plan === SubscriptionPlan.FREE) {
      throw new BadRequestException('Cannot create checkout session for free plan');
    }

    if (!successUrl || !cancelUrl) {
      throw new BadRequestException('Success URL and Cancel URL are required');
    }

    const session = await this.subscriptionService.createCheckoutSession(
      user.id,
      plan,
      successUrl,
      cancelUrl,
    );

    return {
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    };
  }

  @Post('portal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create Stripe customer portal session' })
  @ApiBody({ type: CreatePortalSessionDto })
  @ApiResponse({ status: 200, description: 'Portal session created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createPortalSession(
    @CurrentUser() user: User,
    @Body() createPortalSessionDto: CreatePortalSessionDto,
  ) {
    const { returnUrl } = createPortalSessionDto;

    if (!returnUrl) {
      throw new BadRequestException('Return URL is required');
    }

    const session = await this.subscriptionService.createCustomerPortalSession(user.id, returnUrl);

    return {
      success: true,
      data: {
        url: session.url,
      },
    };
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel subscription' })
  @ApiResponse({ status: 200, description: 'Subscription canceled successfully' })
  @ApiResponse({ status: 400, description: 'Cannot cancel subscription' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async cancelSubscription(@CurrentUser() user: User, @Query('immediately') immediately?: string) {
    const cancelImmediately = immediately === 'true';

    const subscription = await this.subscriptionService.cancelSubscription(
      user.id,
      cancelImmediately,
    );

    return {
      success: true,
      data: {
        id: subscription.id,
        status: subscription.status,
        canceledAt: subscription.canceledAt,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
      message: cancelImmediately
        ? 'Subscription canceled immediately'
        : 'Subscription will be canceled at the end of the current period',
    };
  }

  @Post('reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate canceled subscription' })
  @ApiResponse({ status: 200, description: 'Subscription reactivated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot reactivate subscription' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async reactivateSubscription(@CurrentUser() user: User) {
    const subscription = await this.subscriptionService.reactivateSubscription(user.id);

    return {
      success: true,
      data: {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
      },
      message: 'Subscription reactivated successfully',
    };
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Get user invoices' })
  @ApiResponse({ status: 200, description: 'Invoices retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getInvoices(@CurrentUser() user: User, @Query('limit') limit?: string) {
    if (!user.stripeCustomerId) {
      return {
        success: true,
        data: [],
        message: 'No Stripe customer found',
      };
    }

    const limitNum = limit ? parseInt(limit, 10) : 10;
    const invoices = await this.stripeService.getInvoices(user.stripeCustomerId, limitNum);

    return {
      success: true,
      data: invoices.map(invoice => ({
        id: invoice.id,
        amount: invoice.amount_paid,
        currency: invoice.currency,
        status: invoice.status,
        created: new Date(invoice.created * 1000),
        pdfUrl: invoice.invoice_pdf,
        hostedUrl: invoice.hosted_invoice_url,
      })),
    };
  }

  @Get('upcoming-invoice')
  @ApiOperation({ summary: 'Get upcoming invoice' })
  @ApiResponse({ status: 200, description: 'Upcoming invoice retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUpcomingInvoice(@CurrentUser() user: User) {
    if (!user.stripeCustomerId) {
      return {
        success: true,
        data: null,
        message: 'No Stripe customer found',
      };
    }

    const invoice = await this.stripeService.getUpcomingInvoice(user.stripeCustomerId);

    if (!invoice) {
      return {
        success: true,
        data: null,
        message: 'No upcoming invoice',
      };
    }

    return {
      success: true,
      data: {
        amount: invoice.amount_due,
        currency: invoice.currency,
        periodStart: new Date(invoice.period_start * 1000),
        periodEnd: new Date(invoice.period_end * 1000),
        nextPaymentAttempt: invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1000)
          : null,
      },
    };
  }

  @Post('free')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Subscribe to free plan' })
  @ApiResponse({ status: 200, description: 'Free subscription created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async subscribeToFreePlan(@CurrentUser() user: User) {
    const subscription = await this.subscriptionService.createSubscription({
      userId: user.id,
      plan: SubscriptionPlan.FREE,
    });

    return {
      success: true,
      data: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        limits: subscription.planConfig.limits,
      },
      message: 'Successfully subscribed to free plan',
    };
  }

  @Post('retry-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry failed payment' })
  @ApiResponse({ status: 200, description: 'Payment retry attempted' })
  @ApiResponse({ status: 400, description: 'No failed payment to retry' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async retryPayment(@CurrentUser() user: User) {
    const result = await this.subscriptionService.retryFailedPayment(user.id);

    return {
      success: result.success,
      message: result.message,
    };
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get subscription usage and limits' })
  @ApiResponse({ status: 200, description: 'Usage information retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUsage(@CurrentUser() user: User) {
    const usage = await this.subscriptionService.getSubscriptionUsage(user.id);

    return {
      success: true,
      data: usage,
    };
  }

  @Get('payment-history')
  @ApiOperation({ summary: 'Get payment history' })
  @ApiResponse({ status: 200, description: 'Payment history retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPaymentHistory(@CurrentUser() user: User, @Query('limit') limit?: string) {
    if (!user.stripeCustomerId) {
      return {
        success: true,
        data: {
          payments: [],
          total: 0,
        },
        message: 'No Stripe customer found',
      };
    }

    const limitNum = limit ? parseInt(limit, 10) : 20;
    const invoices = await this.stripeService.getInvoices(user.stripeCustomerId, limitNum);

    const payments = invoices
      .filter(invoice => invoice.status === 'paid')
      .map(invoice => ({
        id: invoice.id,
        amount: invoice.amount_paid / 100, // Convert from cents
        currency: invoice.currency.toUpperCase(),
        date: new Date(invoice.created * 1000),
        description: invoice.description || 'Subscription payment',
        pdfUrl: invoice.invoice_pdf,
        hostedUrl: invoice.hosted_invoice_url,
      }));

    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);

    return {
      success: true,
      data: {
        payments,
        total: totalPaid,
        currency: payments[0]?.currency || 'USD',
      },
    };
  }

  @Get('subscription-health')
  @ApiOperation({ summary: 'Get subscription health status' })
  @ApiResponse({ status: 200, description: 'Subscription health retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSubscriptionHealth(@CurrentUser() user: User) {
    const subscription = await this.subscriptionService.getUserSubscription(user.id);

    if (!subscription) {
      return {
        success: true,
        data: {
          status: 'no_subscription',
          health: 'healthy',
          issues: [],
          recommendations: ['Consider upgrading to a paid plan for more features'],
        },
      };
    }

    const issues = [];
    const recommendations = [];
    let health = 'healthy';

    // Check subscription status
    if (subscription.status === SubscriptionStatus.PAST_DUE) {
      health = 'critical';
      issues.push('Payment is past due');
      recommendations.push('Update your payment method and retry payment');
    } else if (subscription.status === SubscriptionStatus.CANCELED) {
      health = 'critical';
      issues.push('Subscription has been canceled');
      recommendations.push('Reactivate your subscription to continue using premium features');
    } else if (subscription.status === SubscriptionStatus.INCOMPLETE) {
      health = 'warning';
      issues.push('Subscription setup is incomplete');
      recommendations.push('Complete the payment setup process');
    }

    // Check trial period
    if (subscription.trialEnd && subscription.trialEnd > new Date()) {
      const daysLeft = Math.ceil(
        (subscription.trialEnd.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysLeft <= 3) {
        if (health === 'healthy') health = 'warning';
        issues.push(`Trial period ends in ${daysLeft} days`);
        recommendations.push('Add a payment method before your trial expires');
      }
    }

    // Check usage limits
    const usage = await this.subscriptionService.getSubscriptionUsage(user.id);
    const { isWithinLimits } = usage;

    if (
      !isWithinLimits.libraries ||
      !isWithinLimits.books ||
      !isWithinLimits.storage ||
      !isWithinLimits.users
    ) {
      if (health === 'healthy') health = 'warning';
      issues.push('Approaching or exceeding plan limits');
      recommendations.push('Consider upgrading to a higher plan');
    }

    return {
      success: true,
      data: {
        status: subscription.status,
        health,
        issues,
        recommendations,
        nextBillingDate: subscription.currentPeriodEnd,
        trialEndsAt: subscription.trialEnd,
      },
    };
  }

  @Post('change-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change subscription plan (upgrade/downgrade)' })
  @ApiBody({ type: ChangeSubscriptionPlanDto })
  @ApiResponse({ status: 200, description: 'Subscription plan changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or plan change not allowed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async changeSubscriptionPlan(
    @CurrentUser() user: User,
    @Body() changeSubscriptionPlanDto: ChangeSubscriptionPlanDto,
  ) {
    const { plan, prorate = true } = changeSubscriptionPlanDto;

    if (!Object.values(SubscriptionPlan).includes(plan)) {
      throw new BadRequestException('Invalid subscription plan');
    }

    const subscription = await this.subscriptionService.changeSubscriptionPlan(
      user.id,
      plan,
      prorate,
    );

    // Don't expose sensitive Stripe data
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { stripeSubscription, ...safeSubscription } = subscription;

    return {
      success: true,
      data: {
        ...safeSubscription,
        limits: subscription.planConfig.limits,
      },
      message: `Successfully changed subscription plan to ${plan.toUpperCase()}`,
    };
  }

  @Post('preview-change')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview subscription plan change with prorated amount' })
  @ApiBody({ type: PreviewSubscriptionChangeDto })
  @ApiResponse({ status: 200, description: 'Subscription change preview generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or plan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async previewSubscriptionChange(
    @CurrentUser() user: User,
    @Body() previewSubscriptionChangeDto: PreviewSubscriptionChangeDto,
  ) {
    const { plan } = previewSubscriptionChangeDto;

    if (!Object.values(SubscriptionPlan).includes(plan)) {
      throw new BadRequestException('Invalid subscription plan');
    }

    const preview = await this.subscriptionService.getSubscriptionChangePreview(user.id, plan);

    return {
      success: true,
      data: preview,
    };
  }

  @Get('upgrade-options')
  @ApiOperation({ summary: 'Get available upgrade options for current plan' })
  @ApiResponse({ status: 200, description: 'Upgrade options retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUpgradeOptions(@CurrentUser() user: User) {
    const currentSubscription = await this.subscriptionService.getUserSubscription(user.id);
    const currentPlan = currentSubscription?.plan || SubscriptionPlan.FREE;

    const allPlans = this.subscriptionService.getAllPlans();
    const availableUpgrades = [];
    const availableDowngrades = [];

    // Define plan hierarchy for upgrade/downgrade logic
    const planHierarchy = {
      [SubscriptionPlan.FREE]: 0,
      [SubscriptionPlan.BASIC]: 1,
      [SubscriptionPlan.PREMIUM]: 2,
    };

    const currentPlanLevel = planHierarchy[currentPlan as SubscriptionPlan] ?? 0;

    Object.values(SubscriptionPlan).forEach(plan => {
      const planLevel = planHierarchy[plan];
      const planConfig = allPlans.find(p => p.id === plan);

      if (planConfig && plan !== currentPlan) {
        if (planLevel > currentPlanLevel) {
          availableUpgrades.push({
            ...planConfig,
            isUpgrade: true,
            levelDifference: planLevel - currentPlanLevel,
          });
        } else if (planLevel < currentPlanLevel) {
          availableDowngrades.push({
            ...planConfig,
            isDowngrade: true,
            levelDifference: currentPlanLevel - planLevel,
          });
        }
      }
    });

    return {
      success: true,
      data: {
        currentPlan: {
          ...allPlans.find(p => p.id === currentPlan),
          level: currentPlanLevel,
        },
        availableUpgrades: availableUpgrades.sort((a, b) => a.levelDifference - b.levelDifference),
        availableDowngrades: availableDowngrades.sort(
          (a, b) => a.levelDifference - b.levelDifference,
        ),
      },
    };
  }

  @Post('retry-payment/:invoiceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry failed payment for a specific invoice' })
  @ApiParam({ name: 'invoiceId', description: 'Stripe invoice ID to retry payment for' })
  @ApiResponse({ status: 200, description: 'Payment retry initiated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid invoice ID or retry not possible' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async retrySpecificPayment(@CurrentUser() _user: User, @Param('invoiceId') invoiceId: string) {
    const result = await this.paymentRetryService.retryPayment(invoiceId);

    return {
      success: result.success,
      message: result.message,
      data: result.invoice
        ? {
            invoiceId: result.invoice.id,
            status: result.invoice.status,
            amountPaid: result.invoice.amount_paid,
            amountDue: result.invoice.amount_due,
          }
        : null,
    };
  }

  @Get('payment-retry-stats')
  @ApiOperation({ summary: 'Get payment retry statistics for current user' })
  @ApiResponse({ status: 200, description: 'Payment retry statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPaymentRetryStats(@CurrentUser() user: User) {
    const stats = await this.paymentRetryService.getRetryStatistics(user.id);

    return {
      success: true,
      data: stats,
    };
  }

  @Post('process-pending-retries')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process all pending payment retries (admin only)' })
  @ApiResponse({ status: 200, description: 'Pending retries processed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async processPendingRetries(@CurrentUser() _user: User) {
    // TODO: Add admin role check
    // if (user.role !== 'ADMIN') {
    //   throw new ForbiddenException('Admin access required');
    // }

    await this.paymentRetryService.processPendingRetries();

    return {
      success: true,
      message: 'Pending payment retries processed successfully',
    };
  }
}
