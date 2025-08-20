# Stripe Integration Guide

This document explains how to set up and use the Stripe subscription system in BookLore.

## Overview

The Stripe integration provides:
- Subscription management with multiple plans (Free, Basic, Premium, Enterprise)
- 14-day trial periods for paid plans
- Webhook handling for real-time subscription updates
- Subscription-based access control with guards
- Customer portal for subscription management

## Setup

### 1. Environment Variables

Add the following variables to your `.env` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY="sk_test_your_stripe_secret_key"
STRIPE_PUBLISHABLE_KEY="pk_test_your_stripe_publishable_key"
STRIPE_WEBHOOK_SECRET="whsec_your_webhook_secret"
STRIPE_SUCCESS_URL="http://localhost:4200/subscription/success"
STRIPE_CANCEL_URL="http://localhost:4200/subscription/cancel"

# Stripe Price IDs (replace with your actual price IDs)
STRIPE_BASIC_PRICE_ID="price_basic_monthly"
STRIPE_PREMIUM_PRICE_ID="price_premium_monthly"
STRIPE_ENTERPRISE_PRICE_ID="price_enterprise_monthly"

# Subscription Settings
TRIAL_PERIOD_DAYS=14
```

### 2. Stripe Dashboard Configuration

1. Create products and prices in your Stripe dashboard
2. Set up a webhook endpoint pointing to `https://yourdomain.com/webhooks/stripe`
3. Configure the webhook to listen for these events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `checkout.session.completed`

### 3. Update Price IDs

Update the price IDs in `src/subscription/enums/subscription-plan.enum.ts`:

```typescript
export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, SubscriptionPlanConfig> = {
  [SubscriptionPlan.BASIC]: {
    // ...
    stripePriceId: 'price_your_basic_price_id',
    // ...
  },
  // ... other plans
};
```

## Usage

### API Endpoints

#### Get Current Subscription
```http
GET /subscription/current
Authorization: Bearer <jwt_token>
```

#### Create Checkout Session
```http
POST /subscription/checkout
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "plan": "basic",
  "successUrl": "https://yourapp.com/success",
  "cancelUrl": "https://yourapp.com/cancel"
}
```

#### Cancel Subscription
```http
POST /subscription/cancel?immediately=false
Authorization: Bearer <jwt_token>
```

#### Get Customer Portal
```http
POST /subscription/portal
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "returnUrl": "https://yourapp.com/subscription"
}
```

### Using Subscription Guards

Protect routes with subscription requirements:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard, RequireSubscription } from '../subscription/guards/subscription.guard';
import { SubscriptionPlan } from '../subscription/enums/subscription-plan.enum';

@Controller('premium-features')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
export class PremiumFeaturesController {

  @Get('analytics')
  @RequireSubscription(SubscriptionPlan.PREMIUM, SubscriptionPlan.ENTERPRISE)
  async getAnalytics() {
    return { message: 'Premium analytics data' };
  }

  @Get('api-access')
  @RequireSubscription(SubscriptionPlan.ENTERPRISE)
  async getApiAccess() {
    return { message: 'Enterprise API access' };
  }
}
```

### Checking Usage Limits

```typescript
import { Injectable } from '@nestjs/common';
import { SubscriptionService } from '../subscription/services/subscription.service';

@Injectable()
export class LibraryService {
  constructor(private subscriptionService: SubscriptionService) {}

  async createLibrary(userId: number, libraryData: any) {
    // Check subscription limits
    const limits = await this.subscriptionService.getSubscriptionLimits(userId);
    
    if (limits.maxLibraries !== -1) {
      const currentCount = await this.getUserLibraryCount(userId);
      if (currentCount >= limits.maxLibraries) {
        throw new ForbiddenException(
          `You have reached the maximum number of libraries (${limits.maxLibraries}) for your plan`
        );
      }
    }

    // Create library...
  }
}
```

## Testing

### Unit Tests

Run the subscription tests:

```bash
npm test -- --run src/subscription/
```

### Integration Testing

Use the provided test script to verify Stripe integration:

```bash
# Set your test Stripe keys
export STRIPE_SECRET_KEY="sk_test_..."
export STRIPE_WEBHOOK_SECRET="whsec_..."

# Run integration test
node scripts/test-stripe-integration.js
```

### Stripe CLI Testing

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Login to your Stripe account: `stripe login`
3. Forward webhooks to your local server:
   ```bash
   stripe listen --forward-to localhost:3000/webhooks/stripe
   ```
4. Test webhook events:
   ```bash
   stripe trigger customer.subscription.created
   ```

## Subscription Plans

### Free Plan
- 1 library
- 100 books per library
- 1GB storage
- 1 user

### Basic Plan ($9.99/month)
- 5 libraries
- 1,000 books per library
- 10GB storage
- 5 users
- Email support

### Premium Plan ($19.99/month)
- Unlimited libraries
- Unlimited books
- 100GB storage
- 25 users
- Priority support
- Advanced analytics
- API access

### Enterprise Plan ($49.99/month)
- Everything in Premium
- Unlimited storage
- Unlimited users
- Custom integrations
- Dedicated support
- SLA guarantee

## Error Handling

The system handles various error scenarios:

- **Invalid subscription**: Returns 403 with appropriate message
- **Expired subscription**: Prompts user to renew
- **Payment failures**: Webhook updates subscription status
- **Webhook signature verification**: Rejects invalid webhooks

## Security Considerations

1. **Webhook Security**: All webhooks are verified using Stripe signatures
2. **API Authentication**: All subscription endpoints require JWT authentication
3. **Plan Validation**: Server-side validation of subscription plans and limits
4. **Idempotency**: Webhook events are processed idempotently

## Monitoring

Monitor subscription health with:

1. **Stripe Dashboard**: View subscription metrics and events
2. **Application Logs**: Monitor webhook processing and errors
3. **Database Queries**: Track subscription status and usage
4. **Health Checks**: Verify Stripe connectivity

## Troubleshooting

### Common Issues

1. **Webhook not receiving events**
   - Check webhook URL in Stripe dashboard
   - Verify webhook secret matches environment variable
   - Check server logs for webhook processing errors

2. **Subscription guard not working**
   - Ensure user is authenticated (JWT token valid)
   - Check subscription status in database
   - Verify subscription hasn't expired

3. **Payment failures**
   - Check Stripe dashboard for payment details
   - Verify webhook events are being processed
   - Check customer's payment method

### Debug Commands

```bash
# Check subscription status
curl -H "Authorization: Bearer <token>" http://localhost:3000/subscription/current

# Test webhook endpoint
curl -X POST http://localhost:3000/webhooks/stripe \
  -H "stripe-signature: test" \
  -d '{"type":"test"}'

# Run verification script
node scripts/test-t07-complete.js
```

## Support

For issues with the Stripe integration:

1. Check the application logs
2. Review Stripe dashboard events
3. Run the integration test script
4. Consult Stripe documentation: https://stripe.com/docs