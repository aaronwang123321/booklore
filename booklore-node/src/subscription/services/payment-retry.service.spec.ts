import { Test, TestingModule } from '@nestjs/testing';
import { PaymentRetryService } from './payment-retry.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { StripeService } from './stripe.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Stripe from 'stripe';

describe('PaymentRetryService', () => {
  let service: PaymentRetryService;
  let prismaService: any;
  let stripeService: any;
  let configService: any;

  const mockInvoice: Partial<Stripe.Invoice> = {
    id: 'in_test123',
    subscription: 'sub_test123',
    customer: 'cus_test123',
    attempt_count: 1,
    status: 'open',
    amount_due: 2000,
    amount_paid: 0,
    last_finalization_error: {
      message: 'Your card was declined.',
      type: 'card_error',
    } as any,
  };

  const mockSubscription: Partial<Stripe.Subscription> = {
    id: 'sub_test123',
    customer: 'cus_test123',
    metadata: {
      userId: '1',
    },
    status: 'past_due',
  };

  const mockRetryAttempt = {
    id: 'retry_test123',
    invoiceId: 'in_test123',
    userId: 1,
    attemptNumber: 1,
    status: 'pending' as const,
    errorMessage: 'Your card was declined.',
    nextRetryAt: new Date(Date.now() + 3600000), // 1 hour from now
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      paymentRetryAttempt: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
        groupBy: vi.fn(),
      },
      subscription: {
        update: vi.fn(),
      },
    };

    const mockStripeService = {
      retryInvoicePayment: vi.fn(),
    };

    const mockConfigService = {
      get: vi.fn((key: string, defaultValue?: any) => {
        const config = {
          PAYMENT_RETRY_MAX_ATTEMPTS: 5,
          PAYMENT_RETRY_ABANDON_DAYS: 14,
        };
        return config[key] || defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRetryService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: StripeService,
          useValue: mockStripeService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PaymentRetryService>(PaymentRetryService);
    prismaService = module.get(PrismaService);
    stripeService = module.get(StripeService);
    configService = module.get(ConfigService);

    // Mock logger to avoid console output during tests
    vi.spyOn(service['logger'], 'log').mockImplementation(() => {});
    vi.spyOn(service['logger'], 'warn').mockImplementation(() => {});
    vi.spyOn(service['logger'], 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handlePaymentFailure', () => {
    it('should create retry attempt for failed payment', async () => {
      prismaService.paymentRetryAttempt.create.mockResolvedValue(mockRetryAttempt as any);

      await service.handlePaymentFailure(mockInvoice as Stripe.Invoice, mockSubscription as Stripe.Subscription);

      expect(prismaService.paymentRetryAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          invoiceId: 'in_test123',
          userId: 1,
          attemptNumber: 2, // attempt_count + 1
          status: 'pending',
          errorMessage: 'Your card was declined.',
        }),
      });
    });

    it('should handle final payment failure when max attempts reached', async () => {
      const invoiceWithMaxAttempts = {
        ...mockInvoice,
        attempt_count: 5,
      };

      prismaService.paymentRetryAttempt.updateMany.mockResolvedValue({ count: 1 });
      prismaService.subscription.update.mockResolvedValue({} as any);

      await service.handlePaymentFailure(invoiceWithMaxAttempts as Stripe.Invoice, mockSubscription as Stripe.Subscription);

      expect(prismaService.paymentRetryAttempt.updateMany).toHaveBeenCalledWith({
        where: { invoiceId: 'in_test123' },
        data: expect.objectContaining({
          status: 'abandoned',
        }),
      });

      expect(prismaService.subscription.update).toHaveBeenCalledWith({
        where: { userId: 1 },
        data: expect.objectContaining({
          status: 'PAST_DUE',
        }),
      });
    });

    it('should handle missing userId gracefully', async () => {
      const subscriptionWithoutUserId = {
        ...mockSubscription,
        metadata: {},
      };

      await service.handlePaymentFailure(mockInvoice as Stripe.Invoice, subscriptionWithoutUserId as Stripe.Subscription);

      expect(prismaService.paymentRetryAttempt.create).not.toHaveBeenCalled();
    });
  });

  describe('retryPayment', () => {
    it('should successfully retry payment', async () => {
      const paidInvoice = {
        ...mockInvoice,
        status: 'paid',
        amount_paid: 2000,
      };

      prismaService.paymentRetryAttempt.findFirst.mockResolvedValue(mockRetryAttempt as any);
      stripeService.retryInvoicePayment.mockResolvedValue(paidInvoice as Stripe.Invoice);
      prismaService.paymentRetryAttempt.updateMany.mockResolvedValue({ count: 1 });
      prismaService.subscription.update.mockResolvedValue({} as any);

      const result = await service.retryPayment('in_test123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Payment retry successful');
      expect(result.invoice).toEqual(paidInvoice);

      expect(prismaService.paymentRetryAttempt.updateMany).toHaveBeenCalledWith({
        where: { invoiceId: 'in_test123' },
        data: expect.objectContaining({
          status: 'success',
        }),
      });

      expect(prismaService.subscription.update).toHaveBeenCalledWith({
        where: { userId: 1 },
        data: expect.objectContaining({
          status: 'ACTIVE',
        }),
      });
    });

    it('should handle failed payment retry', async () => {
      const failedInvoice = {
        ...mockInvoice,
        status: 'open',
      };

      prismaService.paymentRetryAttempt.findFirst.mockResolvedValue(mockRetryAttempt as any);
      stripeService.retryInvoicePayment.mockResolvedValue(failedInvoice as Stripe.Invoice);
      prismaService.paymentRetryAttempt.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.retryPayment('in_test123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Payment retry failed: open');

      expect(prismaService.paymentRetryAttempt.updateMany).toHaveBeenCalledWith({
        where: { invoiceId: 'in_test123' },
        data: expect.objectContaining({
          status: 'failed',
          errorMessage: 'Invoice status: open',
        }),
      });
    });

    it('should handle retry attempt not found', async () => {
      prismaService.paymentRetryAttempt.findFirst.mockResolvedValue(null);

      const result = await service.retryPayment('in_test123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('No retry attempt found for invoice');
      expect(stripeService.retryInvoicePayment).not.toHaveBeenCalled();
    });

    it('should handle non-pending retry attempt', async () => {
      const completedRetryAttempt = {
        ...mockRetryAttempt,
        status: 'success' as const,
      };

      prismaService.paymentRetryAttempt.findFirst.mockResolvedValue(completedRetryAttempt as any);

      const result = await service.retryPayment('in_test123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Retry attempt is success');
      expect(stripeService.retryInvoicePayment).not.toHaveBeenCalled();
    });

    it('should handle Stripe API errors', async () => {
      const stripeError = new Error('Card declined');

      prismaService.paymentRetryAttempt.findFirst.mockResolvedValue(mockRetryAttempt as any);
      stripeService.retryInvoicePayment.mockRejectedValue(stripeError);
      prismaService.paymentRetryAttempt.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.retryPayment('in_test123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Card declined');

      expect(prismaService.paymentRetryAttempt.updateMany).toHaveBeenCalledWith({
        where: { invoiceId: 'in_test123' },
        data: expect.objectContaining({
          status: 'failed',
          errorMessage: 'Card declined',
        }),
      });
    });
  });

  describe('processPendingRetries', () => {
    it('should process pending retries that are due', async () => {
      const dueRetryAttempt = {
        ...mockRetryAttempt,
        nextRetryAt: new Date(Date.now() - 3600000), // 1 hour ago
      };

      prismaService.paymentRetryAttempt.findMany.mockResolvedValue([dueRetryAttempt as any]);
      prismaService.paymentRetryAttempt.findFirst.mockResolvedValue(dueRetryAttempt as any);
      stripeService.retryInvoicePayment.mockResolvedValue({ ...mockInvoice, status: 'paid' } as Stripe.Invoice);
      prismaService.paymentRetryAttempt.updateMany.mockResolvedValue({ count: 1 });
      prismaService.subscription.update.mockResolvedValue({} as any);

      await service.processPendingRetries();

      expect(stripeService.retryInvoicePayment).toHaveBeenCalledWith('in_test123');
    });

    it('should skip retries that are not yet due', async () => {
      const futureRetryAttempt = {
        ...mockRetryAttempt,
        nextRetryAt: new Date(Date.now() + 3600000), // 1 hour from now
      };

      prismaService.paymentRetryAttempt.findMany.mockResolvedValue([futureRetryAttempt as any]);

      await service.processPendingRetries();

      expect(stripeService.retryInvoicePayment).not.toHaveBeenCalled();
    });
  });

  describe('abandonOldRetries', () => {
    it('should abandon old pending retries', async () => {
      prismaService.paymentRetryAttempt.updateMany.mockResolvedValue({ count: 3 });

      await service.abandonOldRetries();

      expect(prismaService.paymentRetryAttempt.updateMany).toHaveBeenCalledWith({
        where: {
          status: 'pending',
          createdAt: {
            lt: expect.any(Date),
          },
        },
        data: {
          status: 'abandoned',
          updatedAt: expect.any(Date),
        },
      });
    });
  });

  describe('getRetryStatistics', () => {
    it('should return retry statistics for user', async () => {
      const mockStats = [
        { status: 'success', _count: { status: 5 } },
        { status: 'failed', _count: { status: 2 } },
        { status: 'pending', _count: { status: 1 } },
      ];

      prismaService.paymentRetryAttempt.groupBy.mockResolvedValue(mockStats as any);

      const result = await service.getRetryStatistics(1);

      expect(result).toEqual({
        totalAttempts: 8,
        successfulRetries: 5,
        failedRetries: 2,
        pendingRetries: 1,
        abandonedRetries: 0,
      });
    });

    it('should return zero statistics when no data', async () => {
      prismaService.paymentRetryAttempt.groupBy.mockResolvedValue([]);

      const result = await service.getRetryStatistics(1);

      expect(result).toEqual({
        totalAttempts: 0,
        successfulRetries: 0,
        failedRetries: 0,
        pendingRetries: 0,
        abandonedRetries: 0,
      });
    });
  });
});