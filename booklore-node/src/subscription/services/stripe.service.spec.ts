import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { StripeConfig } from '../config/stripe.config';
import { vi } from 'vitest';

// Mock Stripe
const mockStripe = {
  customers: {
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
    del: vi.fn(),
  },
  subscriptions: {
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
    list: vi.fn(),
  },
  checkout: {
    sessions: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
  },
  billingPortal: {
    sessions: {
      create: vi.fn(),
    },
  },
  invoices: {
    retrieveUpcoming: vi.fn(),
    list: vi.fn(),
  },
  webhooks: {
    constructEvent: vi.fn(),
  },
};

vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => mockStripe),
  };
});

describe('StripeService', () => {
  let service: StripeService;
  let stripeConfig: StripeConfig;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        {
          provide: StripeConfig,
          useValue: {
            getStripeInstance: vi.fn().mockReturnValue(mockStripe),
            getWebhookSecret: vi.fn().mockReturnValue('whsec_test'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
    stripeConfig = module.get<StripeConfig>(StripeConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createCustomer', () => {
    it('should create a customer successfully', async () => {
      const mockCustomer = {
        id: 'cus_test123',
        email: 'test@example.com',
        name: 'Test User',
      };

      mockStripe.customers.create.mockResolvedValue(mockCustomer);

      const result = await service.createCustomer({
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(result).toEqual(mockCustomer);
      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test User',
        metadata: {},
      });
    });

    it('should handle customer creation error', async () => {
      mockStripe.customers.create.mockRejectedValue(new Error('Stripe error'));

      await expect(
        service.createCustomer({
          email: 'test@example.com',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createSubscription', () => {
    it('should create a subscription successfully', async () => {
      const mockSubscription = {
        id: 'sub_test123',
        customer: 'cus_test123',
        status: 'active',
        current_period_start: 1640995200,
        current_period_end: 1643673600,
      };

      mockStripe.subscriptions.create.mockResolvedValue(mockSubscription);

      const result = await service.createSubscription({
        customerId: 'cus_test123',
        priceId: 'price_test123',
        trialPeriodDays: 14,
      });

      expect(result).toEqual(mockSubscription);
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith({
        customer: 'cus_test123',
        items: [{ price: 'price_test123' }],
        metadata: {},
        expand: ['latest_invoice.payment_intent'],
        trial_period_days: 14,
      });
    });

    it('should handle subscription creation error', async () => {
      mockStripe.subscriptions.create.mockRejectedValue(new Error('Stripe error'));

      await expect(
        service.createSubscription({
          customerId: 'cus_test123',
          priceId: 'price_test123',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createCheckoutSession', () => {
    it('should create a checkout session successfully', async () => {
      const mockSession = {
        id: 'cs_test123',
        url: 'https://checkout.stripe.com/pay/cs_test123',
      };

      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const result = await service.createCheckoutSession({
        customerId: 'cus_test123',
        priceId: 'price_test123',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        trialPeriodDays: 14,
      });

      expect(result).toEqual(mockSession);
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_test123',
        payment_method_types: ['card'],
        line_items: [
          {
            price: 'price_test123',
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
        metadata: {},
        allow_promotion_codes: true,
        billing_address_collection: 'required',
        subscription_data: {
          trial_period_days: 14,
        },
      });
    });
  });

  describe('constructWebhookEvent', () => {
    it('should construct webhook event successfully', () => {
      const mockEvent = {
        id: 'evt_test123',
        type: 'customer.subscription.created',
        data: { object: {} },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = service.constructWebhookEvent('payload', 'signature');

      expect(result).toEqual(mockEvent);
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        'payload',
        'signature',
        'whsec_test'
      );
    });

    it('should handle webhook construction error', () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      expect(() => service.constructWebhookEvent('payload', 'signature')).toThrow(
        BadRequestException
      );
    });
  });

  describe('getActiveSubscription', () => {
    it('should return active subscription', async () => {
      const mockSubscriptions = [
        {
          id: 'sub_test123',
          status: 'active',
        },
        {
          id: 'sub_test456',
          status: 'CANCELED',
        },
      ];

      mockStripe.subscriptions.list.mockResolvedValue({
        data: mockSubscriptions,
      });

      const result = await service.getActiveSubscription('cus_test123');

      expect(result).toEqual(mockSubscriptions[0]);
    });

    it('should return null if no active subscription', async () => {
      mockStripe.subscriptions.list.mockResolvedValue({
        data: [
          {
            id: 'sub_test456',
            status: 'CANCELED',
          },
        ],
      });

      const result = await service.getActiveSubscription('cus_test123');

      expect(result).toBeNull();
    });
  });
});