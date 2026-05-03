---
"@thebookingkit/core": minor
"@thebookingkit/db": minor
"@thebookingkit/d1": minor
"@thebookingkit/server": minor
"@thebookingkit/ui": minor
---

Add Stripe deposits — a partial-upfront-charge payment type configurable per event type, collected via Stripe Connect.

**Schema (additive, non-breaking)**

- New `"deposit"` value on the `payment_type` enum (Postgres) and accepted as a TEXT value in D1.
- `event_types.deposit_cents` and `event_types.deposit_percentage` columns on both DB targets, defaulting to 0.
- Postgres migration `0006_deposits.sql`; D1 in-place upgrade exported as `MIGRATION_0002_DEPOSITS_DDL`.

**`@thebookingkit/core`**

- Widened `PaymentType` union with `"deposit"`.
- New `computeDepositAmount(cfg, priceCents)` and `requiresDeposit(cfg, priceCents)` helpers; resolution rule: percentage wins when both set; result is always capped at `priceCents`.
- `PaymentSummary` now exposes `depositRevenueCents` and `countByType`.

**`@thebookingkit/server`**

- New `StripePaymentAdapter` — concrete `PaymentAdapter` implementation with full Stripe Connect support. `stripe` is an optional peer dependency.
- `PaymentAdapter` now accepts an optional `connectedAccountId` on `capture`, `cancel`, `refund`, and `createConnectOnboardingUrl` (additive).
- New `handleStripeWebhook` framework-agnostic webhook handler with signature verification and idempotency on `event.id`.
- New `initiateDeposit` / `refundDeposit` orchestration helpers.
- New workflow triggers `deposit_collected` and `deposit_refunded`; new job names `PROCESS_DEPOSIT_REFUND` and `RETRY_DEPOSIT_CHARGE`.

**Registry components (`@thebookingkit/ui`)**

- `PaymentGate` accepts a `mode` prop (`"prepayment" | "deposit" | "no_show_hold"`) and a `totalPriceCents` prop to display the remaining balance for deposits.
- `PaymentHistory` adds a payment-type filter, a deposit-revenue summary card, and a per-type CSS hook. The `paymentType` union includes `"deposit"`.
- New `EventTypeDepositFields` component — drop-in fieldset for configuring deposits in event-type editors.
