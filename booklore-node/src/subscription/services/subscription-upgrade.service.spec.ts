import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { StripeService } from './stripe.service';
import { SubscriptionPlan, SubscriptionStatus } from '../enums/subscription-plan.enum';
import { vi } from 'vitest';

describe('SubscriptionService - Upgrade/Downgrade', () => {
  let service: SubscriptionService;
  let prismaService: any;
  let stripeService: any;

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    stripeCustomerId: 'cus_test123',
  };

  const mockSubscription = {
    id: 1,
    userId: 1,
    plan: SubscriptionPlan.BASIC,
    status: SubscriptionStatus.ACTIVE,
    stripeSubscriptionId: 'sub_test123',
    stripeCustomerId: 'cus_test123',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    trialStart: null,
    trialEnd: null,
    canceledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: mockUser,
  };

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      subscription: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      library: {
        count: vi.fn(),
      },
      book: {
        count: vi.fn(),
        aggregate: vi.fn(),
      },
      libraryMember: {
        count: vi.fn(),
      },
    };

    const mockStripeService = {
      createCustomer: vi.fn(),
      createSubscription: vi.fn(),
      getSubscription: vi.fn(),
      updateSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
      getSubscriptionChangePreview: vi.fn(),
      getAllPlans: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: StripeService,
          useValue: mockStripeService,
        },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
    prismaService = module.get(PrismaService);
    stripeService = module.get(StripeService);
  });

  describe('changeSubscriptionPlan', () => {
    it('should upgrade from basic to premium plan', async () => {
      const mockStripeSubscription = {
        id: 'sub_test123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
        items: {
          data: [{ id: 'si_test123' }],
        },
      };

      const updatedSubscription = {
        ...mockSubscription,
        plan: SubscriptionPlan.PREMIUM,
      };

      prismaService.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        user: mockUser,
      });
      stripeService.updateSubscription.mockResolvedValue(mockStripeSubscription);
      prismaService.subscription.update.mockResolvedValue(updatedSubscription);

      const result = await service.changeSubscriptionPlan(
        mockUser.id,
        SubscriptionPlan.PREMIUM,
        true,
      );

      expect(result.plan).toBe(SubscriptionPlan.PREMIUM);
      expect(stripeService.updateSubscription).toHaveBeenCalledWith(
        'sub_test123',
        expect.objectContaining({
          proration_behavior: 'create_prorations',
        }),
      );
    });

    it('should downgrade to free plan', async () => {
      const updatedSubscription = {
        ...mockSubscription,
        plan: SubscriptionPlan.FREE,
        canceledAt: new Date(),
      };

      prismaService.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        user: mockUser,
      });
      stripeService.cancelSubscription.mockResolvedValue({ id: 'sub_test123' });
      prismaService.subscription.update.mockResolvedValue(updatedSubscription);

      const result = await service.changeSubscriptionPlan(
        mockUser.id,
        SubscriptionPlan.FREE,
        true,
      );

      expect(result.plan).toBe(SubscriptionPlan.FREE);
      expect(stripeService.cancelSubscription).toHaveBeenCalledWith('sub_test123', false);
    });

    it('should upgrade from free to paid plan', async () => {
      const freeSubscription = {
        ...mockSubscription,
        plan: SubscriptionPlan.FREE,
        stripeSubscriptionId: null,
      };

      const mockStripeSubscription = {
        id: 'sub_new123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
        trial_start: null,
        trial_end: null,
      };

      const newSubscription = {
        ...mockSubscription,
        plan: SubscriptionPlan.BASIC,
        stripeSubscriptionId: 'sub_new123',
      };

      prismaService.subscription.findUnique.mockResolvedValue({
        ...freeSubscription,
        user: mockUser,
      });
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      stripeService.createSubscription.mockResolvedValue(mockStripeSubscription);
      prismaService.subscription.upsert.mockResolvedValue(newSubscription);

      const result = await service.changeSubscriptionPlan(
        mockUser.id,
        SubscriptionPlan.BASIC,
        true,
      );

      expect(result.plan).toBe(SubscriptionPlan.BASIC);
      expect(stripeService.createSubscription).toHaveBeenCalled();
    });

    it('should throw error if user already on requested plan', async () => {
      prismaService.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        user: mockUser,
      });

      await expect(
        service.changeSubscriptionPlan(mockUser.id, SubscriptionPlan.BASIC, true),
      ).rejects.toThrow('User is already on the requested plan');
    });

    it('should throw error if no subscription found', async () => {
      prismaService.subscription.findUnique.mockResolvedValue(null);

      await expect(
        service.changeSubscriptionPlan(mockUser.id, SubscriptionPlan.PREMIUM, true),
      ).rejects.toThrow('No active subscription found');
    });

    it('should throw error for invalid plan', async () => {
      prismaService.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        user: mockUser,
      });

      await expect(
        service.changeSubscriptionPlan(mockUser.id, 'invalid_plan' as any, true),
      ).rejects.toThrow('Invalid subscription plan');
    });
  });

  describe('getSubscriptionChangePreview', () => {
    it('should return preview for plan upgrade', async () => {
      const mockPreview = {
        amount_due: 1000, // $10.00 in cents
        currency: 'usd',
        period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
      };

      prismaService.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        user: mockUser,
      });
      stripeService.getSubscriptionChangePreview.mockResolvedValue(mockPreview);

      const result = await service.getSubscriptionChangePreview(
        mockUser.id,
        SubscriptionPlan.PREMIUM,
      );

      expect(result.currentPlan).toBe(SubscriptionPlan.BASIC);
      expect(result.newPlan).toBe(SubscriptionPlan.PREMIUM);
      expect(result.proratedAmount).toBe(10); // Converted from cents
      expect(result.currency).toBe('USD');
    });

    it('should return zero prorated amount for free plan changes', async () => {
      const freeSubscription = {
        ...mockSubscription,
        plan: SubscriptionPlan.FREE,
      };

      prismaService.subscription.findUnique.mockResolvedValue({
        ...freeSubscription,
        user: mockUser,
      });

      const result = await service.getSubscriptionChangePreview(
        mockUser.id,
        SubscriptionPlan.BASIC,
      );

      expect(result.currentPlan).toBe(SubscriptionPlan.FREE);
      expect(result.newPlan).toBe(SubscriptionPlan.BASIC);
      expect(result.proratedAmount).toBe(0);
    });

    it('should throw error if user already on requested plan', async () => {
      prismaService.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        user: mockUser,
      });

      await expect(
        service.getSubscriptionChangePreview(mockUser.id, SubscriptionPlan.BASIC),
      ).rejects.toThrow('User is already on the requested plan');
    });
  });
});