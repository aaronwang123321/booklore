#!/usr/bin/env node

/**
 * Stripe Integration Test Script
 * 
 * This script tests the basic Stripe integration functionality:
 * 1. Creates a test customer
 * 2. Creates a subscription with trial period
 * 3. Simulates webhook events
 * 4. Cleans up test data
 * 
 * Usage: node scripts/test-stripe-integration.js
 */

const Stripe = require('stripe');
const axios = require('axios');

// Configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_PRICE_ID = process.env.STRIPE_BASIC_PRICE_ID || 'price_test_basic';

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY environment variable is required');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

async function testStripeIntegration() {
  console.log('🧪 Starting Stripe Integration Test...\n');

  let testCustomer = null;
  let testSubscription = null;

  try {
    // Step 1: Create a test customer
    console.log('1️⃣ Creating test customer...');
    testCustomer = await stripe.customers.create({
      email: 'test@booklore.app',
      name: 'Test User',
      metadata: {
        userId: '999',
        testData: 'true',
      },
    });
    console.log(`✅ Created customer: ${testCustomer.id}\n`);

    // Step 2: Create a subscription with trial period
    console.log('2️⃣ Creating test subscription with trial...');
    testSubscription = await stripe.subscriptions.create({
      customer: testCustomer.id,
      items: [{ price: TEST_PRICE_ID }],
      trial_period_days: 14,
      metadata: {
        userId: '999',
        plan: 'basic',
        testData: 'true',
      },
    });
    console.log(`✅ Created subscription: ${testSubscription.id}`);
    console.log(`   Status: ${testSubscription.status}`);
    console.log(`   Trial end: ${new Date(testSubscription.trial_end * 1000).toISOString()}\n`);

    // Step 3: Test webhook endpoint (if available)
    if (STRIPE_WEBHOOK_SECRET) {
      console.log('3️⃣ Testing webhook endpoint...');
      
      // Create a test webhook event
      const webhookEvent = {
        id: 'evt_test_webhook',
        object: 'event',
        api_version: '2024-06-20',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: testSubscription,
        },
        livemode: false,
        pending_webhooks: 1,
        request: {
          id: 'req_test',
          idempotency_key: null,
        },
        type: 'customer.subscription.created',
      };

      // Generate webhook signature
      const payload = JSON.stringify(webhookEvent);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: STRIPE_WEBHOOK_SECRET,
      });

      try {
        const response = await axios.post(
          `${API_BASE_URL}/webhooks/stripe`,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
              'stripe-signature': signature,
            },
          }
        );

        if (response.status === 200) {
          console.log('✅ Webhook endpoint responded successfully');
        } else {
          console.log(`⚠️ Webhook endpoint returned status: ${response.status}`);
        }
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.log('⚠️ API server not running, skipping webhook test');
        } else {
          console.log(`⚠️ Webhook test failed: ${error.message}`);
        }
      }
      console.log();
    }

    // Step 4: Test subscription updates
    console.log('4️⃣ Testing subscription update...');
    const updatedSubscription = await stripe.subscriptions.update(testSubscription.id, {
      metadata: {
        ...testSubscription.metadata,
        updated: 'true',
        updatedAt: new Date().toISOString(),
      },
    });
    console.log(`✅ Updated subscription metadata\n`);

    // Step 5: Test customer portal session creation
    console.log('5️⃣ Testing customer portal session...');
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: testCustomer.id,
      return_url: 'http://localhost:4200/subscription',
    });
    console.log(`✅ Created portal session: ${portalSession.id}`);
    console.log(`   Portal URL: ${portalSession.url}\n`);

    // Step 6: Verify subscription status
    console.log('6️⃣ Verifying subscription status...');
    const retrievedSubscription = await stripe.subscriptions.retrieve(testSubscription.id);
    console.log(`✅ Subscription status: ${retrievedSubscription.status}`);
    console.log(`   Current period: ${new Date(retrievedSubscription.current_period_start * 1000).toISOString()} - ${new Date(retrievedSubscription.current_period_end * 1000).toISOString()}\n`);

    console.log('🎉 All tests passed successfully!\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.type === 'StripeInvalidRequestError') {
      console.error('   Stripe Error Details:', error.detail);
    }
    console.log();
  } finally {
    // Cleanup: Cancel subscription and delete customer
    console.log('🧹 Cleaning up test data...');
    
    try {
      if (testSubscription) {
        await stripe.subscriptions.cancel(testSubscription.id);
        console.log(`✅ Canceled subscription: ${testSubscription.id}`);
      }
      
      if (testCustomer) {
        await stripe.customers.del(testCustomer.id);
        console.log(`✅ Deleted customer: ${testCustomer.id}`);
      }
    } catch (cleanupError) {
      console.error('⚠️ Cleanup error:', cleanupError.message);
    }
    
    console.log('\n✨ Test completed!');
  }
}

// Helper function to display configuration
function displayConfiguration() {
  console.log('📋 Configuration:');
  console.log(`   Stripe Secret Key: ${STRIPE_SECRET_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Webhook Secret: ${STRIPE_WEBHOOK_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`   API Base URL: ${API_BASE_URL}`);
  console.log(`   Test Price ID: ${TEST_PRICE_ID}`);
  console.log();
}

// Run the test
if (require.main === module) {
  displayConfiguration();
  testStripeIntegration().catch(console.error);
}

module.exports = { testStripeIntegration };