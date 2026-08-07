import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Test and live prices are different objects, so the environment decides
// which one a customer is actually charged for.
export const PRICE_ID =
  process.env.STRIPE_MODE === 'live'
    ? process.env.STRIPE_PRICE_LIVE
    : process.env.STRIPE_PRICE_TEST;
