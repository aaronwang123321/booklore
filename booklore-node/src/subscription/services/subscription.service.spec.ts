import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { StripeService } from './stripe.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { SubscriptionPlan, SubscriptionStatus } from '../enums/subscription-plan.enum';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let prismaService: PrismaService;
  let stripeService: StripeService;

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    stripeCustomerId: 'cus_test123',
  };

  const mockSubscription = {
    id: 'sub_test123',
    userId: 1,
    plan: SubscriptionPlan.BASIC,
    status: SubscriptionStatus.ACTIVE,
    stripeSubscriptionId: 'sub_stripe123',
    stripeCustomerId: 'cus_test123',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    trialStart: null,
    trialEnd: null,
    canceledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: vi.fn(),
              update: vi.fn(),
            },
            subscription: {
              findUnique: vi.fn(),
              upsert: vi.fn(),
              update: vi.fn(),
            },
          },
        },
        {
          provide: StripeService,
          useValue: {
            createCustomer: vi.fn(),
            createSubscription: vi.fn(),
            getSubscription: vi.fn(),
            cancelSubscription: vi.fn(),
            reactivateSubscription: vi.fn(),
            createCheckoutSession: vi.fn(),
            createCustomerPortalSession: vi.fn(),
            getAllPlans: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
    prismaService = module.get<PrismaService>(PrismaService);
    stripeService = module.get<StripeService>(StripeService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createSubscription', () => {
    it('should create free subscription without Stripe', async () => {
      const freeSubscription = {
        ...mockSubscription,
        plan: SubscriptionPlan.FREE,
      };
      
      vi.mocked(prismaService.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(prismaService.subscription.upsert).mockResolvedValue(freeSubscription as any);

      const result = await service.createSubscription({
        userId: 1,
        plan: SubscriptionPlan.FREE,
      });

      expect(result.plan).toBe(SubscriptionPlan.FREE);
      expect(prismaService.subscription.upsert).toHaveBeenCalled();
    });

    it('should create paid subscription with Stripe', async () => {
      const mockStripeCustomer = { id: 'cus_new123' };
      const mockStripeSubscription = {
        id: 'sub_new123',
        status: 'active',
        current_period_start: 1640995200,
        current_period_end: 1643673600,
        trial_start: null,
        trial_end: null,
      };

      vi.mocked(prismaService.user.findUnique).mockResolvedValue({
        ...mockUser,
        stripeCustomerId: null,
      } as any);
      vi.mocked(stripeService.createCustomer).mockResolvedValue(mockStripeCustomer as any);
      vi.mocked(stripeService.createSubscription).mockResolvedValue(mockStripeSubscription as any);
      vi.mocked(prismaService.user.update).mockResolvedValue(mockUser as any);
      vi.mocked(prismaService.subscription.upsert).mockResolvedValue(mockSubscription as any);

      const result = await service.createSubscription({
        userId: 1,
        plan: SubscriptionPlan.BASIC,
        trialPeriodDays: 14,
      });

      expect(stripeService.createCustomer).toHaveBeenCalled();
      expect(stripeService.createSubscription).toHaveBeenCalled();
      expect(result.plan).toBe(SubscriptionPlan.BASIC);
    });

    it('should throw error if user not found', async () => {
      vi.mocked(prismaService.user.findUnique).mockResolvedValue(null);

      await expect(
        service.createSubscription({
          userId: 999,
          plan: SubscriptionPlan.BASIC,
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error for invalid plan', async () => {
      vi.mocked(prismaService.user.findUnique).mockResolvedValue(mockUser as any);

      await expect(
        service.createSubscription({
          userId: 1,
          plan: 'invalid' as SubscriptionPlan,
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUserSubscription', () => {
    it('should return user subscription with plan config', async () => {
      vi.mocked(prismaService.subscription.findUnique).mockResolvedValue({
        ...mockSubscription,
        user: mockUser,
      } as any);
      vi.mocked(stripeService.getSubscription).mockResolvedValue({
        id: 'sub_stripe123',
        status: 'active',
      } as any);

      const result = await service.getUserSubscription(1);

      expect(result).toBeDefined();
      expect(result?.plan).toBe(SubscriptionPlan.BASIC);
      expect(result?.planConfig).toBeDefined();
    });

    it('should return null if no subscription found', async () => {
      vi.mocked(prismaService.subscription.findUnique).mockResolvedValue(null);

      const result = await service.getUserSubscription(1);

      expect(result).toBeNull();
    });
  });

  describe('hasActiveSubscription', () => {
    it('should return true for active subscription', async () => {
      vi.mocked(prismaService.subscription.findUnique).mockResolvedValue({
        ...mockSubscription,
        user: mockUser,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      } as any);

      const result = await service.hasActiveSubscription(1);

      expect(result).toBe(true);
    });

    it('should return false for expired subscription', async () => {
      vi.mocked(prismaService.subscription.findUnique).mockResolvedValue({
        ...mockSubscription,
        user: mockUser,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      } as any);

      const result = await service.hasActiveSubscription(1);

      expect(result).toBe(false);
    });

    it('should return false for canceled subscription', async () => {
      vi.mocked(prismaService.subscription.findUnique).mockResolvedValue({
        ...mockSubscription,
        user: mockUser,
        status: SubscriptionStatus.CANCELED,
      } as any);

      const result = await service.hasActiveSubscription(1);

      expect(result).toBe(false);
    });
  });

  describe('isInTrialPeriod', () => {
    it('should return true for active trial', async () => {
      vi.mocked(prismaService.subscription.findUnique).mockResolvedValue({
        ...mockSubscription,
        user: mockUser,
        status: SubscriptionStatus.TRIALING,
        trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      } as any);

      const result = await service.isInTrialPeriod(1);

      expect(result).toBe(true);
    });

    it('should return false for expired trial', async () => {
      vi.mocked(prismaService.subscription.findUnique).mockResolvedValue({
        ...mockSubscription,
        user: mockUser,
        status: SubscriptionStatus.TRIALING,
        trialEnd: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      } as any);

      const result = await service.isInTrialPeriod(1);

      expect(result).toBe(false);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      const mockStripeSubscription = {
        id: 'sub_stripe123',
        status: 'CANCELED',
      };

      vi.mocked(prismaService.subscription.findUnique).mockResolvedValue({
        ...mockSubscription,
        user: mockUser,
      } as any);
      vi.mocked(stripeService.cancelSubscription).mockResolvedValue(mockStripeSubscription as any);
      vi.mocked(prismaService.subscription.update).mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.CANCELED,
        user: mockUser,
      } as any);

      const result = await service.cancelSubscription(1, true);

      expect(stripeService.cancelSubscription).toHaveBeenCalledWith('sub_stripe123', true);
      expect(result.status).toBe(SubscriptionStatus.CANCELED);
    });

    it('should throw error for free subscription', async () => {
      vi.mocked(prismaService.subscription.findUnique).mockResolvedValue({
        ...mockSubscription,
        plan: SubscriptionPlan.FREE,
        user: mockUser,
      } as any);

      await expect(service.cancelSubscription(1)).rejects.toThrow(BadRequestException);
    });

    it('should throw error if subscription not found', async () => {
      vi.mocked(prismaService.subscription.findUnique).mockResolvedValue(null);

      await expect(service.cancelSubscription(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session successfully', async () => {
      const mockSession = {
        id: 'cs_test123',
        url: 'https://checkout.stripe.com/pay/cs_test123',
      };

      vi.mocked(prismaService.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(stripeService.createCheckoutSession).mockResolvedValue(mockSession as any);

      const result = await service.createCheckoutSession(
        1,
        SubscriptionPlan.BASIC,
        'https://example.com/success',
        'https://example.com/cancel'
      );

      expect(result).toEqual(mockSession);
      expect(stripeService.createCheckoutSession).toHaveBeenCalled();
    });

    it('should throw error for free plan', async () => {
      vi.mocked(prismaService.user.findUnique).mockResolvedValue(mockUser as any);

      await expect(
        service.createCheckoutSession(
          1,
          SubscriptionPlan.FREE,
          'https://example.com/success',
          'https://example.com/cancel'
        )
      ).rejects.toThrow(BadRequestException);
    });
  });
});