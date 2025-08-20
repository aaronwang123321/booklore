import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubscriptionGuard, RequireSubscription, SUBSCRIPTION_PLANS_KEY } from './subscription.guard';
import { SubscriptionService } from '../services/subscription.service';
import { SubscriptionPlan, SubscriptionStatus } from '../enums/subscription-plan.enum';

describe('SubscriptionGuard', () => {
  let guard: SubscriptionGuard;
  let subscriptionService: any;
  let reflector: any;

  const mockExecutionContext = {
    switchToHttp: () => ({
      getRequest: () => ({
        user: { id: 1, email: 'test@example.com' },
      }),
    }),
    getHandler: vi.fn(),
    getClass: vi.fn(),
  } as unknown as ExecutionContext;

  const mockSubscription = {
    id: '1',
    userId: 1,
    plan: SubscriptionPlan.BASIC,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    planConfig: {
      id: SubscriptionPlan.BASIC,
      name: 'Basic',
      features: ['basic feature', 'another feature'],
      limits: {
        maxLibraries: 5,
        maxBooksPerLibrary: 1000,
        maxStorageGB: 10,
        maxUsers: 5,
      },
    },
    user: { id: 1, email: 'test@example.com' },
  };

  beforeEach(async () => {
    const mockSubscriptionService = {
      getUserSubscription: vi.fn(),
      hasActiveSubscription: vi.fn(),
    };

    const mockReflector = {
      getAllAndOverride: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionGuard,
        {
          provide: SubscriptionService,
          useValue: mockSubscriptionService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<SubscriptionGuard>(SubscriptionGuard);
    subscriptionService = module.get(SubscriptionService);
    reflector = module.get(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow access when no subscription requirements are set', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user is not authenticated', async () => {
      reflector.getAllAndOverride.mockReturnValue([SubscriptionPlan.BASIC]);
      
      const contextWithoutUser = {
        ...mockExecutionContext,
        switchToHttp: () => ({
          getRequest: () => ({ user: null }),
        }),
      } as ExecutionContext;

      await expect(guard.canActivate(contextWithoutUser)).rejects.toThrow(
        new ForbiddenException('User not authenticated')
      );
    });

    it('should throw ForbiddenException when user has no subscription', async () => {
      reflector.getAllAndOverride.mockReturnValue([SubscriptionPlan.BASIC]);
      subscriptionService.getUserSubscription.mockResolvedValue(null);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new ForbiddenException('No subscription found. Please subscribe to access this feature.')
      );
    });

    it('should throw ForbiddenException when subscription is not active', async () => {
      reflector.getAllAndOverride.mockReturnValue([SubscriptionPlan.BASIC]);
      subscriptionService.getUserSubscription.mockResolvedValue(mockSubscription);
      subscriptionService.hasActiveSubscription.mockResolvedValue(false);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new ForbiddenException('Your subscription is not active. Please renew your subscription.')
      );
    });

    it('should throw ForbiddenException when user plan does not meet requirements', async () => {
      reflector.getAllAndOverride.mockReturnValue([SubscriptionPlan.PREMIUM]);
      subscriptionService.getUserSubscription.mockResolvedValue(mockSubscription);
      subscriptionService.hasActiveSubscription.mockResolvedValue(true);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new ForbiddenException('This feature requires a PREMIUM subscription. Your current plan is BASIC.')
      );
    });

    it('should allow access when user has required subscription plan', async () => {
      reflector.getAllAndOverride
        .mockReturnValueOnce([SubscriptionPlan.BASIC]) // for SUBSCRIPTION_PLANS_KEY
        .mockReturnValueOnce(undefined); // for SUBSCRIPTION_FEATURE_KEY
      subscriptionService.getUserSubscription.mockResolvedValue(mockSubscription);
      subscriptionService.hasActiveSubscription.mockResolvedValue(true);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should allow access when user has higher tier subscription', async () => {
      const premiumSubscription = {
        ...mockSubscription,
        plan: SubscriptionPlan.PREMIUM,
      };

      reflector.getAllAndOverride
        .mockReturnValueOnce([SubscriptionPlan.BASIC, SubscriptionPlan.PREMIUM]) // for SUBSCRIPTION_PLANS_KEY
        .mockReturnValueOnce(undefined); // for SUBSCRIPTION_FEATURE_KEY
      subscriptionService.getUserSubscription.mockResolvedValue(premiumSubscription);
      subscriptionService.hasActiveSubscription.mockResolvedValue(true);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should handle multiple required plans', async () => {
      reflector.getAllAndOverride
        .mockReturnValueOnce([SubscriptionPlan.BASIC, SubscriptionPlan.PREMIUM]) // for SUBSCRIPTION_PLANS_KEY
        .mockReturnValueOnce(undefined); // for SUBSCRIPTION_FEATURE_KEY
      subscriptionService.getUserSubscription.mockResolvedValue(mockSubscription);
      subscriptionService.hasActiveSubscription.mockResolvedValue(true);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should add subscription info to request', async () => {
      const mockRequest = { user: { id: 1, email: 'test@example.com' } };
      const contextWithRequest = {
        ...mockExecutionContext,
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as ExecutionContext;

      reflector.getAllAndOverride
        .mockReturnValueOnce([SubscriptionPlan.BASIC]) // for SUBSCRIPTION_PLANS_KEY
        .mockReturnValueOnce(undefined); // for SUBSCRIPTION_FEATURE_KEY
      subscriptionService.getUserSubscription.mockResolvedValue(mockSubscription);
      subscriptionService.hasActiveSubscription.mockResolvedValue(true);

      await guard.canActivate(contextWithRequest);

      expect(mockRequest).toHaveProperty('subscription', mockSubscription);
    });

    it('should handle service errors gracefully', async () => {
      reflector.getAllAndOverride.mockReturnValue([SubscriptionPlan.BASIC]);
      subscriptionService.getUserSubscription.mockRejectedValue(new Error('Database error'));

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        new ForbiddenException('Unable to verify subscription status')
      );
    });
  });

  describe('RequireSubscription decorator', () => {
    it('should set metadata correctly', () => {
      const mockTarget = {};
      const mockDescriptor = { value: vi.fn() };

      RequireSubscription(SubscriptionPlan.BASIC, SubscriptionPlan.PREMIUM)(
        mockTarget,
        'testMethod',
        mockDescriptor
      );

      expect(Reflect.getMetadata(SUBSCRIPTION_PLANS_KEY, mockDescriptor.value)).toEqual([
        SubscriptionPlan.BASIC,
        SubscriptionPlan.PREMIUM,
      ]);
    });
  });
});