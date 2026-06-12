---
"@thebookingkit/server": minor
---

Edge-runtime Stripe webhooks + card-on-file and off-session charging support.

**Webhooks (Cloudflare Workers compatibility)**

- `handleStripeWebhook` now prefers `stripe.webhooks.constructEventAsync` when
  the SDK provides it (it always does), falling back to the synchronous
  `constructEvent`. The sync variant throws on edge runtimes where SubtleCrypto
  is async-only, so the handler now works on Cloudflare Workers, Deno and
  similar out of the box. `StripeWebhookVerifier` gains the optional
  `constructEventAsync` member (additive).
- New optional `PaymentEventStore.onPaymentIntentAmountCapturableUpdated`
  handler, dispatched for `payment_intent.amount_capturable_updated` — the
  signal that a manual-capture intent (deposit hold / pending-review booking)
  was successfully authorized and awaits capture-or-cancel.

**Payment adapter (all additive)**

- `CreatePaymentIntentOptions` gains `customerId`, `setupFutureUsage`
  (save the card during a deposit payment for later off-session charges — e.g.
  no-show / late-cancellation fees — without a separate SetupIntent step),
  `paymentMethodId` + `offSession` + `confirm` (merchant-initiated charges
  against a saved card), and `idempotencyKey` (forwarded to Stripe so booking
  retries can't double-charge).
- `CreateSetupIntentOptions` gains `customerId` — without a customer the saved
  payment method was not reusable off-session.
- `CreatePaymentIntentResult.status` now includes `"requires_capture"`; the
  Stripe adapter previously remapped it to `"requires_confirmation"`, hiding
  exactly the state that capture/decline flows need to observe.
- `initiateDeposit` passes through new `captureMethod`, `customerId`,
  `setupFutureUsage` and `idempotencyKey` inputs, enabling authorize-only
  deposits for short-notice bookings that require provider approval before
  any money moves.
