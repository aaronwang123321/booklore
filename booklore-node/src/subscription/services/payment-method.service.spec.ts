import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMethodService } from './payment-method.service';
import { StripeService } from './stripe.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { vi } from 'vitest';

describe('PaymentMethodService', () => {
  let service: PaymentMethodService;
  let stripeService: any;
  let prismaService: any;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    stripeCustomerId: 'cus_test123',
  };

  const mockPaymentMethod = {
    id: 'pm_test123',
    object: 'payment_method',
    type: 'card',
    card: {
      brand: 'visa',
      last4: '4242',
      exp_month: 12,
      exp_year: 2025,
    },
    customer: 'cus_test123',
  } as Stripe.PaymentMethod;

  const mockSetupIntent = {
    id: 'seti_test123',
    object: 'setup_intent',
    client_secret: 'seti_test123_secret_test',
    status: 'requires_payment_method',
    customer: 'cus_test123',
  } as Stripe.SetupIntent;

  beforeEach(async () => {
    const mockStripeService = {
      createSetupIntent: vi.fn(),
      getCustomerPaymentMethods: vi.fn(),
      attachPaymentMethod: vi.fn(),
      detachPaymentMethod: vi.fn(),
      updateCustomerDefaultPaymentMethod: vi.fn(),
      getCustomer: vi.fn(),
      getPaymentMethod: vi.fn(),
    };

    const mockPrismaService = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMethodService,
        {
          provide: StripeService,
          useValue: mockStripeService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PaymentMethodService>(PaymentMethodService);
    stripeService = module.get(StripeService);
    prismaService = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSetupIntent', () => {
    it('should create setup intent successfully', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser as any);
      stripeService.createSetupIntent.mockResolvedValue(mockSetupIntent);

      const result = await service.createSetupIntent('user-1');

      expect(result).toEqual({
        success: true,
        data: {
          clientSecret: mockSetupIntent.client_secret,
          setupIntentId: mockSetupIntent.id,
        },
      });
      expect(stripeService.createSetupIntent).toHaveBeenCalledWith({
        customer: 'cus_test123',
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.createSetupIntent('user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user has no Stripe customer', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        stripeCustomerId: null,
      } as any);

      await expect(service.createSetupIntent('user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getPaymentMethods', () => {
    it('should get payment methods successfully', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser as any);
      stripeService.getCustomerPaymentMethods.mockResolvedValue([mockPaymentMethod]);

      const result = await service.getPaymentMethods('user-1');

      expect(result).toEqual({
        success: true,
        data: {
          paymentMethods: [
            {
              id: mockPaymentMethod.id,
              type: mockPaymentMethod.type,
              card: {
                brand: mockPaymentMethod.card.brand,
                last4: mockPaymentMethod.card.last4,
                expMonth: mockPaymentMethod.card.exp_month,
                expYear: mockPaymentMethod.card.exp_year,
              },
            },
          ],
        },
      });
    });

    it('should return empty array when user has no Stripe customer', async () => {
      prismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        stripeCustomerId: null,
      } as any);

      const result = await service.getPaymentMethods('user-1');

      expect(result).toEqual({
        success: true,
        data: {
          paymentMethods: [],
        },
        message: 'No Stripe customer found',
      });
    });
  });

  describe('attachPaymentMethod', () => {
    it('should attach payment method successfully', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser as any);
      stripeService.attachPaymentMethod.mockResolvedValue(mockPaymentMethod);

      const result = await service.attachPaymentMethod('user-1', 'pm_test123');

      expect(result).toEqual({
        success: true,
        message: 'Payment method attached successfully',
      });
      expect(stripeService.attachPaymentMethod).toHaveBeenCalledWith('pm_test123', 'cus_test123');
    });

    it('should throw NotFoundException when user not found', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.attachPaymentMethod('user-1', 'pm_test123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('detachPaymentMethod', () => {
    it('should detach payment method successfully', async () => {
      stripeService.detachPaymentMethod.mockResolvedValue({
        ...mockPaymentMethod,
        customer: null,
      });

      const result = await service.detachPaymentMethod('pm_test123');

      expect(result).toEqual({
        success: true,
        message: 'Payment method detached successfully',
      });
      expect(stripeService.detachPaymentMethod).toHaveBeenCalledWith('pm_test123');
    });
  });

  describe('setDefaultPaymentMethod', () => {
    it('should set default payment method successfully', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser as any);
      stripeService.updateCustomerDefaultPaymentMethod.mockResolvedValue({
        id: 'cus_test123',
        invoice_settings: {
          default_payment_method: 'pm_test123',
        },
      } as any);

      const result = await service.setDefaultPaymentMethod('user-1', 'pm_test123');

      expect(result).toEqual({
        success: true,
        message: 'Default payment method updated successfully',
      });
      expect(stripeService.updateCustomerDefaultPaymentMethod).toHaveBeenCalledWith(
        'cus_test123',
        'pm_test123',
      );
    });
  });

  describe('getDefaultPaymentMethod', () => {
    it('should get default payment method successfully', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser as any);
      stripeService.getCustomer.mockResolvedValue({
        id: 'cus_test123',
        invoice_settings: {
          default_payment_method: 'pm_test123',
        },
      } as any);
      stripeService.getPaymentMethod.mockResolvedValue(mockPaymentMethod);

      const result = await service.getDefaultPaymentMethod('user-1');

      expect(result).toEqual({
        success: true,
        data: {
          paymentMethod: {
            id: mockPaymentMethod.id,
            type: mockPaymentMethod.type,
            card: {
              brand: mockPaymentMethod.card.brand,
              last4: mockPaymentMethod.card.last4,
              expMonth: mockPaymentMethod.card.exp_month,
              expYear: mockPaymentMethod.card.exp_year,
            },
          },
        },
      });
      expect(stripeService.getCustomer).toHaveBeenCalledWith('cus_test123');
      expect(stripeService.getPaymentMethod).toHaveBeenCalledWith('pm_test123');
    });

    it('should return null when no default payment method', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser as any);
      stripeService.getCustomer.mockResolvedValue({
        id: 'cus_test123',
        invoice_settings: {
          default_payment_method: null,
        },
      } as any);

      const result = await service.getDefaultPaymentMethod('user-1');

      expect(result).toEqual({
        success: true,
        data: {
          paymentMethod: null,
        },
        message: 'No default payment method set',
      });
    });
  });

  describe('validatePaymentMethod', () => {
    it('should validate payment method successfully', async () => {
      const validPaymentMethod = {
        ...mockPaymentMethod,
        customer: 'cus_test123',
      };

      const result = service.validatePaymentMethod(validPaymentMethod, 'cus_test123');

      expect(result).toEqual({
        isValid: true,
        reason: null,
      });
    });

    it('should return invalid for different customer', async () => {
      const invalidPaymentMethod = {
        ...mockPaymentMethod,
        customer: 'cus_different',
      };

      const result = service.validatePaymentMethod(invalidPaymentMethod, 'cus_test123');

      expect(result).toEqual({
        isValid: false,
        reason: 'Payment method belongs to different customer',
      });
    });

    it('should return invalid for expired card', async () => {
      const expiredPaymentMethod = {
        ...mockPaymentMethod,
        card: {
          ...mockPaymentMethod.card,
          exp_year: 2020,
          exp_month: 1,
        },
      };

      const result = service.validatePaymentMethod(expiredPaymentMethod, 'cus_test123');

      expect(result).toEqual({
        isValid: false,
        reason: 'Payment method has expired',
      });
    });
  });
});