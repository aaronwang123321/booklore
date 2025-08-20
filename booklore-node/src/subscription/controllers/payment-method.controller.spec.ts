import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMethodController } from './payment-method.controller';
import { PaymentMethodService } from '../services/payment-method.service';
import { StripeService } from '../services/stripe.service';
import { BadRequestException } from '@nestjs/common';
import { vi } from 'vitest';

describe('PaymentMethodController', () => {
  let controller: PaymentMethodController;
  let paymentMethodService: any;
  let stripeService: any;
  let mockPaymentMethodService: any;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    stripeCustomerId: 'cus_test123',
  };

  const mockPaymentMethod = {
    id: 'pm_test123',
    type: 'card',
    card: {
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2025,
    },
  };

  beforeEach(async () => {
    mockPaymentMethodService = {
      createSetupIntent: vi.fn(),
      getPaymentMethods: vi.fn(),
      getCustomerPaymentMethods: vi.fn(),
      attachPaymentMethod: vi.fn(),
      detachPaymentMethod: vi.fn(),
      setDefaultPaymentMethod: vi.fn(),
      getDefaultPaymentMethod: vi.fn(),
    };

    const mockStripeService = {
      applyCouponToCustomer: vi.fn(),
      removeCouponFromCustomer: vi.fn(),
      validateCoupon: vi.fn(),
      getPaymentMethod: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentMethodController],
      providers: [
        {
          provide: PaymentMethodService,
          useValue: mockPaymentMethodService,
        },
        {
          provide: StripeService,
          useValue: mockStripeService,
        },
      ],
    }).compile();

    controller = module.get<PaymentMethodController>(PaymentMethodController);
    paymentMethodService = module.get(PaymentMethodService);
    stripeService = module.get(StripeService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createSetupIntent', () => {
    it('should create setup intent successfully', async () => {
      const mockSetupIntent = {
        id: 'seti_test123',
        client_secret: 'seti_test123_secret_test',
        status: 'requires_payment_method',
      };

      mockPaymentMethodService.createSetupIntent.mockResolvedValue(mockSetupIntent);

      const result = await controller.createSetupIntent(mockUser as any, { usage: 'off_session' });

      expect(result).toEqual({
        success: true,
        data: {
          clientSecret: 'seti_test123_secret_test',
          setupIntentId: 'seti_test123',
        },
      });
      expect(mockPaymentMethodService.createSetupIntent).toHaveBeenCalledWith({
        customerId: 'cus_test123',
        usage: 'off_session',
        metadata: {
          userId: 'user-1',
        },
      });
    });
  });

  describe('getPaymentMethods', () => {
    it('should get payment methods successfully', async () => {
      const mockPaymentMethods = [{
        id: 'pm_test123',
        type: 'card',
        card: {
          brand: 'visa',
          last4: '4242',
          exp_month: 12,
          exp_year: 2025,
        },
        created: 1640995200,
      }];
      const mockDefaultResult = {
        success: true,
        data: {
          paymentMethod: mockPaymentMethod,
        },
      };

      mockPaymentMethodService.getCustomerPaymentMethods.mockResolvedValue(mockPaymentMethods);
       mockPaymentMethodService.getDefaultPaymentMethod.mockResolvedValue(mockDefaultResult);

       const result = await controller.getPaymentMethods(mockUser as any);

       expect(result.success).toBe(true);
       expect(result.data.paymentMethods).toHaveLength(1);
       expect(result.data.paymentMethods[0].id).toBe('pm_test123');
       expect(mockPaymentMethodService.getCustomerPaymentMethods).toHaveBeenCalledWith('cus_test123');
       expect(mockPaymentMethodService.getDefaultPaymentMethod).toHaveBeenCalledWith('user-1');
    });
  });

  describe('attachPaymentMethod', () => {
    it('should attach payment method successfully', async () => {
      const mockResult = {
        success: true,
        message: 'Payment method attached successfully',
      };

      stripeService.getPaymentMethod.mockResolvedValue(mockPaymentMethod);
       mockPaymentMethodService.attachPaymentMethod.mockResolvedValue(mockResult);

       const result = await controller.attachPaymentMethod(mockUser as any, {
         paymentMethodId: 'pm_test123',
       });

       expect(result.success).toBe(true);
       expect(result.message).toBe('Payment method attached successfully');
       expect(result.data.id).toBe('pm_test123');
       expect(mockPaymentMethodService.attachPaymentMethod).toHaveBeenCalledWith('user-1', 'pm_test123');
       expect(stripeService.getPaymentMethod).toHaveBeenCalledWith('pm_test123');
    });
  });

  describe('detachPaymentMethod', () => {
    it('should detach payment method successfully', async () => {
      const mockResult = {
        success: true,
        message: 'Payment method detached successfully',
      };

      stripeService.getPaymentMethod.mockResolvedValue({
        id: 'pm_test123',
        customer: 'cus_test123',
      });
      mockPaymentMethodService.detachPaymentMethod.mockResolvedValue(mockResult);

       const result = await controller.detachPaymentMethod(mockUser as any, 'pm_test123');

       expect(result).toEqual(mockResult);
       expect(mockPaymentMethodService.detachPaymentMethod).toHaveBeenCalledWith('pm_test123');
      expect(stripeService.getPaymentMethod).toHaveBeenCalledWith('pm_test123');
    });
  });

  describe('setDefaultPaymentMethod', () => {
    it('should set default payment method successfully', async () => {
      const mockResult = {
        success: true,
        message: 'Default payment method set successfully',
      };

      stripeService.getPaymentMethod.mockResolvedValue({
        id: 'pm_test123',
        customer: 'cus_test123',
      });
      mockPaymentMethodService.setDefaultPaymentMethod.mockResolvedValue(mockResult);

       const result = await controller.setDefaultPaymentMethod(mockUser as any, {
         paymentMethodId: 'pm_test123',
       });

       expect(result).toEqual(mockResult);
       expect(mockPaymentMethodService.setDefaultPaymentMethod).toHaveBeenCalledWith(
         'user-1',
         'pm_test123',
       );
    });
  });

  describe('getDefaultPaymentMethod', () => {
    it('should get default payment method successfully', async () => {
      const mockResult = {
        success: true,
        data: {
          paymentMethod: mockPaymentMethod,
        },
      };

      mockPaymentMethodService.getDefaultPaymentMethod.mockResolvedValue(mockResult);

       const result = await controller.getDefaultPaymentMethod(mockUser as any);

       expect(result).toEqual(mockResult);
       expect(mockPaymentMethodService.getDefaultPaymentMethod).toHaveBeenCalledWith('user-1');
    });
  });

  describe('applyCoupon', () => {
    it('should apply coupon successfully', async () => {
      const mockCoupon = {
        id: 'coupon_test123',
        name: 'Test Coupon',
        percent_off: 20,
        amount_off: null,
        currency: 'usd',
        valid: true,
      };

      stripeService.validateCoupon.mockResolvedValue(mockCoupon as any);
      stripeService.applyCouponToCustomer.mockResolvedValue({
        id: 'cus_test123',
        discount: {
          coupon: mockCoupon,
        },
      } as any);

      const result = await controller.applyCoupon(mockUser as any, {
        couponId: 'SAVE20',
      });

      expect(result).toEqual({
        success: true,
        data: {
          couponId: mockCoupon.id,
          name: mockCoupon.name,
          percentOff: mockCoupon.percent_off,
          amountOff: mockCoupon.amount_off,
          currency: mockCoupon.currency,
        },
        message: 'Coupon applied successfully',
      });
      expect(stripeService.validateCoupon).toHaveBeenCalledWith('SAVE20');
      expect(stripeService.applyCouponToCustomer).toHaveBeenCalledWith('cus_test123', 'SAVE20');
    });

    it('should throw BadRequestException for invalid coupon', async () => {
      stripeService.validateCoupon.mockResolvedValue(null);

      await expect(
        controller.applyCoupon(mockUser as any, {
          couponId: 'INVALID',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when user has no Stripe customer', async () => {
      const userWithoutStripe = {
        ...mockUser,
        stripeCustomerId: null,
      };

      await expect(
        controller.applyCoupon(userWithoutStripe as any, {
          couponId: 'SAVE20',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeCoupon', () => {
    it('should remove coupon successfully', async () => {
      stripeService.removeCouponFromCustomer.mockResolvedValue({
        id: 'cus_test123',
        discount: null,
      } as any);

      const result = await controller.removeCoupon(mockUser as any);

      expect(result).toEqual({
        success: true,
        message: 'Coupon removed successfully',
      });
      expect(stripeService.removeCouponFromCustomer).toHaveBeenCalledWith('cus_test123');
    });

    it('should throw BadRequestException when user has no Stripe customer', async () => {
      const userWithoutStripe = {
        ...mockUser,
        stripeCustomerId: null,
      };

      await expect(controller.removeCoupon(userWithoutStripe as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});