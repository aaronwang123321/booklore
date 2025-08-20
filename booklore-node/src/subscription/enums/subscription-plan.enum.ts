export enum SubscriptionPlan {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise',
}

// Use Prisma-generated enum instead
export { SubscriptionStatus } from '@prisma/client';

export interface SubscriptionPlanConfig {
  id: SubscriptionPlan;
  name: string;
  description: string;
  stripePriceId: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  features: string[];
  limits: {
    maxLibraries: number;
    maxBooksPerLibrary: number;
    maxStorageGB: number;
    maxUsers: number;
  };
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, SubscriptionPlanConfig> = {
  [SubscriptionPlan.FREE]: {
    id: SubscriptionPlan.FREE,
    name: 'Free',
    description: 'Perfect for personal use',
    stripePriceId: '', // No Stripe price for free plan
    monthlyPrice: 0,
    features: ['Up to 1 library', 'Up to 100 books', '1GB storage', 'Basic book management'],
    limits: {
      maxLibraries: 1,
      maxBooksPerLibrary: 100,
      maxStorageGB: 1,
      maxUsers: 1,
    },
  },
  [SubscriptionPlan.BASIC]: {
    id: SubscriptionPlan.BASIC,
    name: 'Basic',
    description: 'Great for small teams',
    stripePriceId: process.env.STRIPE_BASIC_PRICE_ID || 'price_basic',
    monthlyPrice: 9.99,
    yearlyPrice: 99.99,
    features: [
      'Up to 5 libraries',
      'Up to 1,000 books per library',
      '10GB storage',
      'Advanced book management',
      'Email support',
    ],
    limits: {
      maxLibraries: 5,
      maxBooksPerLibrary: 1000,
      maxStorageGB: 10,
      maxUsers: 5,
    },
  },
  [SubscriptionPlan.PREMIUM]: {
    id: SubscriptionPlan.PREMIUM,
    name: 'Premium',
    description: 'Perfect for growing teams',
    stripePriceId: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_premium',
    monthlyPrice: 19.99,
    yearlyPrice: 199.99,
    features: [
      'Unlimited libraries',
      'Unlimited books',
      '100GB storage',
      'Priority support',
      'Advanced analytics',
      'API access',
    ],
    limits: {
      maxLibraries: -1, // Unlimited
      maxBooksPerLibrary: -1, // Unlimited
      maxStorageGB: 100,
      maxUsers: 25,
    },
  },
  [SubscriptionPlan.ENTERPRISE]: {
    id: SubscriptionPlan.ENTERPRISE,
    name: 'Enterprise',
    description: 'For large organizations',
    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise',
    monthlyPrice: 49.99,
    yearlyPrice: 499.99,
    features: [
      'Everything in Premium',
      'Unlimited storage',
      'Unlimited users',
      'Custom integrations',
      'Dedicated support',
      'SLA guarantee',
    ],
    limits: {
      maxLibraries: -1, // Unlimited
      maxBooksPerLibrary: -1, // Unlimited
      maxStorageGB: -1, // Unlimited
      maxUsers: -1, // Unlimited
    },
  },
};
