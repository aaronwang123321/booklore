import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeConfig {
  private readonly stripe: Stripe;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2023-08-16',
      typescript: true,
    });
  }

  getStripeInstance(): Stripe {
    return this.stripe;
  }

  getPublishableKey(): string {
    return this.configService.get<string>('STRIPE_PUBLISHABLE_KEY', '');
  }

  getWebhookSecret(): string {
    return this.configService.get<string>('STRIPE_WEBHOOK_SECRET', '');
  }

  getSuccessUrl(): string {
    return this.configService.get<string>('STRIPE_SUCCESS_URL', 'http://localhost:3000/success');
  }

  getCancelUrl(): string {
    return this.configService.get<string>('STRIPE_CANCEL_URL', 'http://localhost:3000/cancel');
  }

  getTrialPeriodDays(): number {
    return this.configService.get<number>('TRIAL_PERIOD_DAYS', 14);
  }
}
