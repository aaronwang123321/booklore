import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebhookController } from './webhook.controller';
import { StripeService } from '../services/stripe.service';
import { SubscriptionService } from '../services/subscription.service';
import Stripe from 'stripe';

describe('WebhookController', () => {
  let controller: WebhookController;
  let stripeService: any;
  let subscriptionService: any;

  const mockStripeEvent: Stripe.Event = {
    id: 'evt_test_webhook',
    object: 'event',
    api_version: '2024-06-20',
    created: 1234567890,
    data: {
      object: {
        id: 'sub_test',
        object: 'subscription',
        customer: 'cus_test',
        status: 'active',
        current_period_start: 1234567890,
        current_period_end: 1234567890 + 2592000, // 30 days later
        metadata: {
          userId: '1',
          plan: 'basic',
        },
      } as Partial<Stripe.Subscription>,
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: 'req_test',
      idempotency_key: null,
    },
    type: 'customer.subscription.created',
  };

  beforeEach(async () => {
    const mockStripeService = {
      constructWebhookEvent: vi.fn(),
    };

    const mockSubscriptionService = {
      updateSubscriptionFromStripe: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        {
          provide: StripeService,
          useValue: mockStripeService,
        },
        {
          provide: SubscriptionService,
          useValue: mockSubscriptionService,
        },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
    stripeService = module.get(StripeService);
    subscriptionService = module.get(SubscriptionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleStripeWebhook', () => {
    const mockRequest = {
      rawBody: Buffer.from('test payload'),
      body: 'test payload',
    } as any;

    const mockSignature = 'whsec_test_signature';

    it('should process webhook successfully', async () => {
      stripeService.constructWebhookEvent.mockReturnValue(mockStripeEvent);
      subscriptionService.updateSubscriptionFromStripe.mockResolvedValue();

      const result = await controller.handleStripeWebhook(mockRequest, mockSignature);

      expect(result).toEqual({ received: true });
      expect(stripeService.constructWebhookEvent).toHaveBeenCalledWith(
        mockRequest.rawBody,
        mockSignature
      );
      expect(subscriptionService.updateSubscriptionFromStripe).toHaveBeenCalledWith(
        mockStripeEvent.data.object
      );
    });

    it('should throw BadRequestException when signature is missing', async () => {
      await expect(controller.handleStripeWebhook(mockRequest, '')).rejects.toThrow(
        new BadRequestException('Webhook error: Missing Stripe signature')
      );
    });

    it('should throw BadRequestException when request body is missing', async () => {
      const requestWithoutBody = { rawBody: null, body: null } as any;

      await expect(controller.handleStripeWebhook(requestWithoutBody, mockSignature)).rejects.toThrow(
        new BadRequestException('Webhook error: Missing request body')
      );
    });

    it('should handle webhook signature verification errors', async () => {
      stripeService.constructWebhookEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(controller.handleStripeWebhook(mockRequest, mockSignature)).rejects.toThrow(
        new BadRequestException('Webhook error: Invalid signature')
      );
    });

    it('should handle subscription.updated events', async () => {
      const updatedEvent = {
        ...mockStripeEvent,
        type: 'customer.subscription.updated',
      };

      stripeService.constructWebhookEvent.mockReturnValue(updatedEvent);
      subscriptionService.updateSubscriptionFromStripe.mockResolvedValue();

      const result = await controller.handleStripeWebhook(mockRequest, mockSignature);

      expect(result).toEqual({ received: true });
      expect(subscriptionService.updateSubscriptionFromStripe).toHaveBeenCalledWith(
        updatedEvent.data.object
      );
    });

    it('should handle subscription.deleted events', async () => {
      const deletedEvent = {
        ...mockStripeEvent,
        type: 'customer.subscription.deleted',
      };

      stripeService.constructWebhookEvent.mockReturnValue(deletedEvent);
      subscriptionService.updateSubscriptionFromStripe.mockResolvedValue();

      const result = await controller.handleStripeWebhook(mockRequest, mockSignature);

      expect(result).toEqual({ received: true });
      expect(subscriptionService.updateSubscriptionFromStripe).toHaveBeenCalledWith(
        deletedEvent.data.object
      );
    });

    it('should handle invoice.payment_succeeded events', async () => {
      const invoiceEvent = {
        ...mockStripeEvent,
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test',
            object: 'invoice',
            subscription: 'sub_test',
          } as Stripe.Invoice,
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(invoiceEvent);
      stripeService.getSubscription = vi.fn().mockResolvedValue(mockStripeEvent.data.object);
      subscriptionService.updateSubscriptionFromStripe.mockResolvedValue();

      const result = await controller.handleStripeWebhook(mockRequest, mockSignature);

      expect(result).toEqual({ received: true });
    });

    it('should handle invoice.payment_failed events', async () => {
      const invoiceEvent = {
        ...mockStripeEvent,
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test',
            object: 'invoice',
            subscription: 'sub_test',
          } as Stripe.Invoice,
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(invoiceEvent);
      stripeService.getSubscription = vi.fn().mockResolvedValue(mockStripeEvent.data.object);
      subscriptionService.updateSubscriptionFromStripe.mockResolvedValue();

      const result = await controller.handleStripeWebhook(mockRequest, mockSignature);

      expect(result).toEqual({ received: true });
    });

    it('should handle checkout.session.completed events', async () => {
      const checkoutEvent = {
        ...mockStripeEvent,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test',
            object: 'checkout.session',
            subscription: 'sub_test',
          } as Stripe.Checkout.Session,
        },
      };

      stripeService.constructWebhookEvent.mockReturnValue(checkoutEvent);
      stripeService.getSubscription = vi.fn().mockResolvedValue(mockStripeEvent.data.object);
      subscriptionService.updateSubscriptionFromStripe.mockResolvedValue();

      const result = await controller.handleStripeWebhook(mockRequest, mockSignature);

      expect(result).toEqual({ received: true });
    });

    it('should handle unknown event types gracefully', async () => {
      const unknownEvent = {
        ...mockStripeEvent,
        type: 'unknown.event.type',
      };

      stripeService.constructWebhookEvent.mockReturnValue(unknownEvent);

      const result = await controller.handleStripeWebhook(mockRequest, mockSignature);

      expect(result).toEqual({ received: true });
      // Should not call any subscription service methods for unknown events
      expect(subscriptionService.updateSubscriptionFromStripe).not.toHaveBeenCalled();
    });

    it('should handle errors in event processing', async () => {
      stripeService.constructWebhookEvent.mockReturnValue(mockStripeEvent);
      subscriptionService.updateSubscriptionFromStripe.mockRejectedValue(
        new Error('Database error')
      );

      await expect(controller.handleStripeWebhook(mockRequest, mockSignature)).rejects.toThrow(
        new BadRequestException('Webhook error: Database error')
      );
    });
  });
});