// Compile-time only (tsconfig.typetest.json): a real Stripe client must be
// assignable to StripeLike / StripeWebhookVerifier, so consumers can pass
// `new Stripe(...)` without a cast. Checked against stripe 23 (devDependency)
// and, in CI, again with stripe 17 installed — both ends of the peer range.
import Stripe from "stripe";
import type { StripeLike } from "../adapters/stripe-payment-adapter.js";
import type { StripeWebhookVerifier } from "../webhooks/stripe.js";

declare const stripe: Stripe;

export const adapter: StripeLike = stripe;
export const webhooks: StripeWebhookVerifier = stripe;
