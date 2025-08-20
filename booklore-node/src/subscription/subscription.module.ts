import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionController } from './controllers/subscription.controller';
import { WebhookController } from './controllers/webhook.controller';
import { PaymentMethodController } from './controllers/payment-method.controller';
import { SubscriptionService } from './services/subscription.service';
import { StripeService } from './services/stripe.service';
import { PaymentMethodService } from './services/payment-method.service';
import { PaymentRetryService } from './services/payment-retry.service';
import { StripeConfig } from './config/stripe.config';
import { SubscriptionGuard, UsageLimitGuard } from './guards/subscription.guard';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [ConfigModule, SharedModule],
  controllers: [SubscriptionController, WebhookController, PaymentMethodController],
  providers: [
    SubscriptionService,
    StripeService,
    PaymentMethodService,
    PaymentRetryService,
    StripeConfig,
    SubscriptionGuard,
    UsageLimitGuard,
  ],
  exports: [
    SubscriptionService,
    StripeService,
    PaymentMethodService,
    SubscriptionGuard,
    UsageLimitGuard,
  ],
})
export class SubscriptionModule {}
