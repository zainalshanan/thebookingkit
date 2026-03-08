# E-09 — Payments & Stripe Integration

> **Priority:** Post-MVP · **Sprints:** 9–10 · **Story Points:** 34 · **Release:** R2

Deep Stripe integration with prepayment, no-show fee holds, time-based cancellation fees, and refund policy engine.

---

## User Stories

### 9.1 E09-S01 — Stripe Connect Onboarding `[Must]` · 8 pts

- [x] **Complete**

**As a** provider, **I want to** connect my Stripe account to receive payments for bookings **so that** I can monetize my services without building payment infrastructure.

**Acceptance Criteria:**

- [x] Stripe Connect onboarding flow (Express or Standard) via a Next.js API route.
- [x] Provider's Stripe account ID is stored securely on the provider record.
- [x] Provider can disconnect Stripe from their settings.
- [x] Event types gain a `price_cents` and `currency` field; only event types with a price show payment UI.

---

### 9.2 E09-S02 — Prepayment at Booking `[Must]` · 8 pts

- [x] **Complete**

**As a** customer, **I want to** pay for my booking at the time of confirmation **so that** I can secure my appointment with a prepayment.

**Acceptance Criteria:**

- [x] `<PaymentGate />` component renders Stripe Payment Element (card, Apple Pay, Google Pay).
- [x] Payment intent is created server-side via API route; client confirms with Stripe.js.
- [x] On successful payment, booking status moves to `'confirmed'` and a payment record is created.
- [x] On failed payment, booking status stays `'pending'` with `payment_status = 'failed'`.
- [x] Payment record includes: `stripe_payment_intent_id`, `amount_cents`, `currency`, `status`, `payment_type = 'prepay'`.

---

### 9.3 E09-S03 — No-Show Fee Hold `[Must]` · 8 pts

- [x] **Complete**

**As a** provider, **I want to** hold a no-show fee on the customer's card without charging immediately **so that** I'm protected against no-shows without penalizing customers upfront.

**Acceptance Criteria:**

- [x] Event type supports a `no_show_fee_cents` field with `payment_type = 'no_show_hold'`.
- [x] A Stripe SetupIntent authorizes the card; a PaymentIntent is created with `capture_method = 'manual'`.
- [x] If provider marks the booking as no-show, the held amount is captured automatically.
- [x] If the booking completes normally, the hold is released (PaymentIntent cancelled).
- [x] Payment record tracks the hold status: `authorized`, `captured`, `released`.

---

### 9.4 E09-S04 — Time-Based Cancellation Fees `[Should]` · 5 pts

- [x] **Complete**

**As a** provider, **I want to** configure time-based cancellation fees **so that** late cancellations are fairly penalized based on how close to the appointment they occur.

**Acceptance Criteria:**

- [x] Event type supports a `cancellation_policy` JSON: array of `{ hours_before, fee_percentage }`.
- [x] Example: `[{ hours_before: 24, fee_percentage: 0 }, { hours_before: 2, fee_percentage: 50 }, { hours_before: 0, fee_percentage: 100 }]`.
- [x] When a customer cancels, the system evaluates the policy and charges the appropriate fee.
- [x] Refund amount = original payment − cancellation fee.
- [x] Policy is displayed to the customer on the booking confirmation page and cancellation page.

---

### 9.5 E09-S05 — Payment History Dashboard `[Should]` · 5 pts

- [x] **Complete**

**As a** provider, **I want to** view payment history for all my bookings **so that** I can reconcile my Stripe account with my booking records.

**Acceptance Criteria:**

- [x] Admin dashboard shows a payments table: booking ID, customer, amount, status, date.
- [x] Filterable by status (completed, refunded, held, failed) and date range.
- [x] Each row links to the associated booking detail view.
- [x] Total revenue and refund amounts are summarized at the top.
