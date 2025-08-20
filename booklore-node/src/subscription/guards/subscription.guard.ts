import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionService } from '../services/subscription.service';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';

export const SUBSCRIPTION_PLANS_KEY = 'subscriptionPlans';
export const SUBSCRIPTION_FEATURE_KEY = 'subscriptionFeature';

// Decorator to specify required subscription plans
export const RequireSubscription = (...plans: SubscriptionPlan[]) => {
  return (_target: any, _propertyKey?: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(SUBSCRIPTION_PLANS_KEY, plans, descriptor.value);
    } else {
      Reflect.defineMetadata(SUBSCRIPTION_PLANS_KEY, plans, _target);
    }
  };
};

// Decorator to specify required subscription feature
export const RequireFeature = (feature: string) => {
  return (_target: any, _propertyKey?: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(SUBSCRIPTION_FEATURE_KEY, feature, descriptor.value);
    } else {
      Reflect.defineMetadata(SUBSCRIPTION_FEATURE_KEY, feature, _target);
    }
  };
};

@Injectable()
export class SubscriptionGuard implements CanActivate {
  private readonly logger = new Logger(SubscriptionGuard.name);

  constructor(
    private reflector: Reflector,
    private subscriptionService: SubscriptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // Get required subscription plans from metadata
      const requiredPlans = this.reflector.getAllAndOverride<SubscriptionPlan[]>(
        SUBSCRIPTION_PLANS_KEY,
        [context.getHandler(), context.getClass()],
      );

      // Get required feature from metadata
      const requiredFeature = this.reflector.getAllAndOverride<string>(SUBSCRIPTION_FEATURE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      // If no subscription requirements, allow access
      if (!requiredPlans && !requiredFeature) {
        return true;
      }

      const request = context.switchToHttp().getRequest();
      const user = request.user;

      if (!user) {
        throw new ForbiddenException('User not authenticated');
      }

      // Get user's subscription
      const subscription = await this.subscriptionService.getUserSubscription(user.id);

      if (!subscription) {
        throw new ForbiddenException(
          'No subscription found. Please subscribe to access this feature.',
        );
      }

      // Check if subscription is active
      const hasActiveSubscription = await this.subscriptionService.hasActiveSubscription(user.id);
      if (!hasActiveSubscription) {
        throw new ForbiddenException(
          'Your subscription is not active. Please renew your subscription.',
        );
      }

      // Check required plans
      if (requiredPlans && requiredPlans.length > 0) {
        const userPlan = subscription.plan as SubscriptionPlan;

        if (!requiredPlans.includes(userPlan)) {
          const planNames = requiredPlans.map(plan => plan.toUpperCase()).join(' or ');
          throw new ForbiddenException(
            `This feature requires a ${planNames} subscription. Your current plan is ${userPlan.toUpperCase()}.`,
          );
        }
      }

      // Check required feature (this would be implemented based on plan features)
      if (requiredFeature && typeof requiredFeature === 'string') {
        const planConfig = subscription.planConfig;
        if (planConfig && planConfig.features && Array.isArray(planConfig.features)) {
          const hasFeature = planConfig.features.some(
            (feature: string) =>
              typeof feature === 'string' &&
              feature.toLowerCase().includes(requiredFeature.toLowerCase()),
          );

          if (!hasFeature) {
            throw new ForbiddenException(
              `This feature (${requiredFeature}) is not available in your current plan. Please upgrade your subscription.`,
            );
          }
        }
      }

      // Add subscription info to request for use in controllers
      request.subscription = subscription;

      this.logger.log(`Access granted for user ${user.id} with plan ${subscription.plan}`);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error(`Subscription guard error: ${error.message}`);
      throw new ForbiddenException('Unable to verify subscription status');
    }
  }
}

// Usage limit guard for checking specific limits
@Injectable()
export class UsageLimitGuard implements CanActivate {
  private readonly logger = new Logger(UsageLimitGuard.name);

  constructor(private subscriptionService: SubscriptionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest();
      const user = request.user;

      if (!user) {
        throw new ForbiddenException('User not authenticated');
      }

      // Get subscription limits
      const limits = await this.subscriptionService.getSubscriptionLimits(user.id);

      // Add limits to request for use in controllers
      request.subscriptionLimits = limits;

      return true;
    } catch (error) {
      this.logger.error(`Usage limit guard error: ${error.message}`);
      throw new ForbiddenException('Unable to verify usage limits');
    }
  }
}

// Decorator for usage limit guard
export const CheckUsageLimits = () => {
  return (_target: any, _propertyKey?: string, _descriptor?: PropertyDescriptor) => {
    // This would be used with @UseGuards(UsageLimitGuard)
  };
};
