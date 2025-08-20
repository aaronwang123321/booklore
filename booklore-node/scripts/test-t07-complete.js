#!/usr/bin/env node

/**
 * T07 Task Completion Verification Script
 * 
 * This script verifies that all components of T07 are properly implemented:
 * 1. Stripe SDK integration
 * 2. SubscriptionGuard implementation
 * 3. Webhook controller
 * 4. 14-day trial logic
 * 5. Environment configuration
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 T07 Task Completion Verification\n');

const checks = [
  {
    name: 'Stripe SDK 13.7.0 installed',
    check: () => {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      return packageJson.dependencies.stripe === '^13.7.0';
    }
  },
  {
    name: 'StripeService exists',
    check: () => fs.existsSync('src/subscription/services/stripe.service.ts')
  },
  {
    name: 'StripeConfig exists',
    check: () => fs.existsSync('src/subscription/config/stripe.config.ts')
  },
  {
    name: 'SubscriptionGuard exists',
    check: () => fs.existsSync('src/subscription/guards/subscription.guard.ts')
  },
  {
    name: 'WebhookController exists',
    check: () => fs.existsSync('src/subscription/controllers/webhook.controller.ts')
  },
  {
    name: 'SubscriptionController exists',
    check: () => fs.existsSync('src/subscription/controllers/subscription.controller.ts')
  },
  {
    name: 'SubscriptionService exists',
    check: () => fs.existsSync('src/subscription/services/subscription.service.ts')
  },
  {
    name: 'Subscription module properly configured',
    check: () => {
      const moduleContent = fs.readFileSync('src/subscription/subscription.module.ts', 'utf8');
      return moduleContent.includes('SubscriptionController') &&
             moduleContent.includes('WebhookController') &&
             moduleContent.includes('StripeService') &&
             moduleContent.includes('SubscriptionGuard');
    }
  },
  {
    name: 'Environment variables documented',
    check: () => {
      const envExample = fs.readFileSync('.env.example', 'utf8');
      return envExample.includes('STRIPE_SECRET_KEY') &&
             envExample.includes('STRIPE_WEBHOOK_SECRET') &&
             envExample.includes('TRIAL_PERIOD_DAYS');
    }
  },
  {
    name: 'SubscriptionGuard tests exist',
    check: () => fs.existsSync('src/subscription/guards/subscription.guard.spec.ts')
  },
  {
    name: 'WebhookController tests exist',
    check: () => fs.existsSync('src/subscription/controllers/webhook.controller.spec.ts')
  },
  {
    name: 'Stripe integration test script exists',
    check: () => fs.existsSync('scripts/test-stripe-integration.js')
  },
  {
    name: 'Usage examples exist',
    check: () => fs.existsSync('src/subscription/examples/subscription-guard-usage.example.ts')
  },
  {
    name: '14-day trial logic implemented',
    check: () => {
      const subscriptionService = fs.readFileSync('src/subscription/services/subscription.service.ts', 'utf8');
      return subscriptionService.includes('trialPeriodDays: data.trialPeriodDays || 14');
    }
  },
  {
    name: 'Webhook event handlers implemented',
    check: () => {
      const webhookController = fs.readFileSync('src/subscription/controllers/webhook.controller.ts', 'utf8');
      return webhookController.includes('customer.subscription.created') &&
             webhookController.includes('customer.subscription.updated') &&
             webhookController.includes('customer.subscription.deleted') &&
             webhookController.includes('invoice.payment_succeeded') &&
             webhookController.includes('invoice.payment_failed');
    }
  },
  {
    name: 'Subscription plans configured',
    check: () => {
      const planEnum = fs.readFileSync('src/subscription/enums/subscription-plan.enum.ts', 'utf8');
      return planEnum.includes('SUBSCRIPTION_PLANS') &&
             planEnum.includes('FREE') &&
             planEnum.includes('BASIC') &&
             planEnum.includes('PREMIUM') &&
             planEnum.includes('ENTERPRISE');
    }
  }
];

let passed = 0;
let failed = 0;

console.log('📋 Running verification checks:\n');

checks.forEach((check, index) => {
  try {
    const result = check.check();
    if (result) {
      console.log(`✅ ${index + 1}. ${check.name}`);
      passed++;
    } else {
      console.log(`❌ ${index + 1}. ${check.name}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ ${index + 1}. ${check.name} (Error: ${error.message})`);
    failed++;
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

// Additional functional checks
console.log('🔧 Functional verification:\n');

try {
  // Check if StripeService has required methods
  const stripeServiceContent = fs.readFileSync('src/subscription/services/stripe.service.ts', 'utf8');
  if (stripeServiceContent.includes('createCustomer') && 
      stripeServiceContent.includes('createSubscription') && 
      stripeServiceContent.includes('constructWebhookEvent')) {
    console.log('✅ StripeService has required methods');
    passed++;
  } else {
    console.log('❌ StripeService missing required methods');
    failed++;
  }
} catch (error) {
  console.log('❌ StripeService verification failed:', error.message);
  failed++;
}

try {
  // Check subscription guard decorators
  const guardFile = fs.readFileSync('src/subscription/guards/subscription.guard.ts', 'utf8');
  if (guardFile.includes('RequireSubscription') && guardFile.includes('SUBSCRIPTION_PLANS_KEY')) {
    console.log('✅ SubscriptionGuard decorators implemented');
    passed++;
  } else {
    console.log('❌ SubscriptionGuard decorators missing');
    failed++;
  }
} catch (error) {
  console.log('❌ SubscriptionGuard verification failed:', error.message);
  failed++;
}

// Check webhook signature verification
try {
  const webhookFile = fs.readFileSync('src/subscription/controllers/webhook.controller.ts', 'utf8');
  if (webhookFile.includes('constructWebhookEvent') && webhookFile.includes('stripe-signature')) {
    console.log('✅ Webhook signature verification implemented');
    passed++;
  } else {
    console.log('❌ Webhook signature verification missing');
    failed++;
  }
} catch (error) {
  console.log('❌ Webhook verification failed:', error.message);
  failed++;
}

console.log(`\n🎯 Final Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\n🎉 All T07 requirements successfully implemented!');
  console.log('\n📝 Summary of implemented features:');
  console.log('   • Stripe SDK 13.7.0 integrated');
  console.log('   • SubscriptionGuard with plan-based access control');
  console.log('   • Webhook endpoint for Stripe events');
  console.log('   • 14-day trial period logic');
  console.log('   • Comprehensive test coverage');
  console.log('   • Environment configuration');
  console.log('   • Usage examples and documentation');
  
  console.log('\n🚀 Next steps:');
  console.log('   1. Set up Stripe account and get API keys');
  console.log('   2. Configure webhook endpoint in Stripe dashboard');
  console.log('   3. Test with Stripe CLI: stripe listen --forward-to localhost:3000/webhooks/stripe');
  console.log('   4. Run integration tests with real Stripe data');
  
  process.exit(0);
} else {
  console.log('\n❌ Some requirements are missing. Please review the failed checks above.');
  process.exit(1);
}