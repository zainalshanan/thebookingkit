# @thebookingkit/server

## 0.4.0

### Patch Changes

- Updated dependencies [88f91f5]
  - @thebookingkit/core@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies
  - @thebookingkit/core@0.3.1

## 0.3.0

### Minor Changes

- d3ab748: Add Stripe deposits — a partial-upfront-charge payment type configurable per event type, collected via Stripe Connect.

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

- 1544c24: Edge-runtime Stripe webhooks + card-on-file and off-session charging support.

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

### Patch Changes

- Updated dependencies [aac30ce]
- Updated dependencies [d3ab748]
  - @thebookingkit/core@0.3.0

## 0.2.0

### Minor Changes (2026-03-25)

#### Webhook Triggers (E-24)

- **12 new webhook triggers:** `BOOKING_COMPLETED`, `RESOURCE_BOOKED`, `RESOURCE_RELEASED`, `WALK_IN_ADDED`, `WALK_IN_STARTED`, `WALK_IN_COMPLETED`, `WALK_IN_CANCELLED`, `SLOT_RELEASED`, `RECURRING_SERIES_CREATED`, `OCCURRENCE_CANCELLED`, `OCCURRENCE_RESCHEDULED`, `PAYMENT_REFUNDED`
- Total triggers: 21 (9 existing + 12 new)

#### Job Names (E-24)

- **5 new background job names:** `SEND_WALK_IN_NOTIFICATION`, `SEND_RESOURCE_BOOKING_CONFIRMATION`, `PROCESS_RECURRING_SERIES`, `PROCESS_SLOT_RELEASE`, `ADVANCE_WALK_IN_QUEUE`

#### Security & Error Handling (Audit Fixes)

- Replaced manual XOR timing comparison with `crypto.timingSafeEqual` in `verifyApiKey` and `verifyWebhookSignature`
- `withAuth` now logs unhandled errors and maps `BookingConflictError` (409) and `ResourceUnavailableError` (409) to proper status codes
- Unified role types: `AuthUser.role` and `WithAuthOptions.requiredRole` now both support `"admin" | "provider" | "member" | "customer"`
- JSON-escaped webhook payload template values to prevent injection
- HTML-escaped workflow template variables when destined for email
- Extracted shared SSRF validator (`validateExternalUrl`)
- `parseOrgBookingPath` now validates slugs against `SLUG_RE`

#### Platform Integration

- Re-exported `ResourceUnavailableError`, resource engine functions, and slot release functions from `@thebookingkit/core`

#### Branding

- Webhook headers renamed: `X-SlotKit-*` → `X-BookingKit-*`

## 0.1.5

### Minor Changes — QA Audit (2026-03-12)

14 bugs fixed in `@thebookingkit/server`.

### Bug Fixes

#### Critical

- **C1** — `generateBookingToken` uses the full 256-bit (64 hex char) HMAC signature instead of truncating to 64 bits via `.slice(0, 16)` (`booking-tokens.ts`)
- **C2** — `verifyBookingToken` uses `crypto.timingSafeEqual` for constant-time signature comparison instead of `!==` (`booking-tokens.ts`)

#### High

- **H1** — `withAuth` catches unexpected errors and returns a sanitized 500 JSON response instead of rethrowing raw errors that leak internal stack traces (`auth.ts`)
- **H2** — Role check uses a hierarchy (`admin > provider > member`) so admin users can access provider-scoped routes (`auth.ts`)
- **H3** — `validateWebhookSubscription` rejects non-HTTPS URLs and blocks private/loopback IP ranges (127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x, localhost, ::1) to prevent SSRF (`webhooks.ts`)
- **H4** — `fire_webhook` workflow action applies the same SSRF validation as webhook subscriptions (`workflows.ts`)
- **H5** — `validateSlotQueryParams` validates `providerId` and `eventTypeId` against UUID regex format (`api.ts`)

#### Medium

- **M3** — `assertTenantScope` throws `TenantAuthorizationError` when `resourceOrgId` is null/undefined instead of silently passing (`multi-tenancy.ts`)
- **M4** — `resolvePayloadTemplate` escapes curly braces in substitution values to prevent recursive template injection (`webhooks.ts`)
- **M6** — `interpolateTemplate` HTML-escapes all substituted values (`&`, `<`, `>`, `"`, `'`) to prevent XSS in HTML emails (`email-templates.ts`)
- **M7** — `validateSlotQueryParams` rejects date ranges exceeding 90 days to prevent DoS via unbounded RRULE expansion (`api.ts`)
- **M8** — `buildOrgBookingUrl` validates slug arguments against a safe regex, rejecting path traversal, null bytes, slashes, and HTML (`multi-tenancy.ts`)

#### Low

- **L2** — `formatTime`/`formatDate` accept and use an optional `timeZone` parameter for timezone-aware formatting instead of using server locale (`workflows.ts`)
- **L3** — `escapeICS` strips bare carriage return (`\r`) characters to prevent ICS line structure injection (`adapters/email-adapter.ts`)

### Dependencies

- Updated `@thebookingkit/core` to `^0.1.5`

## 0.1.1

### Patch Changes

- Initial release of The Booking Kit packages.
- Updated dependencies
  - @thebookingkit/core@0.1.1
