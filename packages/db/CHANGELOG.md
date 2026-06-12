# @thebookingkit/db

## 0.3.0

### Minor Changes

- aac30ce: feat: Resource & Capacity-Based Booking (E-22)

  Adds resource-based booking to support restaurants, yoga studios, coworking spaces, and any venue with bookable physical units. New functions: `getResourceAvailableSlots`, `assignResource`, `isResourceSlotAvailable`, `getResourcePoolSummary`. New database tables: `resources`, `resource_availability_rules`, `resource_availability_overrides`. D1 adapter extended with resource helpers and locking. Full backward compatibility — existing provider-based booking is unchanged.

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

### Patch Changes

- f371ca0: fix: integration test infrastructure and audit trigger correctness (v0.2.1)

  - **Audit trigger**: Replace direct `NEW.status::booking_event_type` cast with explicit `CASE` expression — the direct cast silently failed when status values didn't align with enum labels; the `CASE` now maps each status explicitly with an `'updated'` fallback, making future enum divergence visible
  - **drizzle.config.ts**: Correct schema path from `./src/schema/index.ts` to `./dist/schema/index.js` — drizzle-kit requires the compiled JS output, not the TypeScript source; this was causing `drizzle-kit push` and `drizzle-kit generate` to fail when run after a clean build
  - **Integration tests**: Fix `ANY(array)` SQL queries that broke with postgres.js — replaced raw `sql\`id = ANY(${jsArray})\``with drizzle-orm's`inArray()`helper; fixed table-existence check to use`sql.join`with`IN`instead of`ANY`
  - **CI workflow**: Restore `echo "yes" | npx drizzle-kit push` — `--force` is not a valid drizzle-kit flag and was silently re-introduced, reverting a prior fix; CI now also manages the Postgres container explicitly (`docker run` / `docker rm -v`) rather than relying on GitHub Actions `services:`, ensuring both container and volume are removed after every run
  - **Local test script**: Add `scripts/test-integration.sh` and `test:integration:fresh` npm script — spins up an isolated Postgres 15 container on port 5433, runs schema push + custom migrations + vitest, then removes the container and volume via `trap cleanup EXIT` regardless of test outcome; does not affect the dev DB on port 5432

## 0.2.0

### Minor Changes — Resource & Capacity Booking (2026-03-17)

Adds three new tables and a migration for resource-based booking.

### New Features

#### Schema (`schema/tables.ts`)

- **`resources`** table — Bookable physical units (tables, rooms, courts) with `type`, `capacity`, `location`, and `is_active` fields.
- **`resourceAvailabilityRules`** table — RRULE-based recurring availability per resource (mirrors `availabilityRules`).
- **`resourceAvailabilityOverrides`** table — Date-specific availability exceptions per resource (mirrors `availabilityOverrides`).
- **`bookings.resource_id`** — Nullable FK to `resources` with `ON DELETE SET NULL`. Existing bookings are unaffected.
- **`EXCLUDE USING gist`** constraint on `(resource_id, tstzrange(starts_at, ends_at))` prevents overlapping bookings on the same resource. Scoped with `WHERE resource_id IS NOT NULL`.

#### Migration (`0005_resources.sql`)

- Creates all three tables with indexes
- Adds `resource_id` column and index to `bookings`
- Adds resource EXCLUDE constraint
- Updates `create_booking()` function with optional `p_resource_id UUID DEFAULT NULL` parameter (backward-compatible)
- All statements use `IF NOT EXISTS` for idempotent re-runs

#### Type Exports

- `Resource`, `NewResource`, `ResourceAvailabilityRule`, `NewResourceAvailabilityRule`, `ResourceAvailabilityOverride`, `NewResourceAvailabilityOverride`

## 0.1.5

### Minor Changes — QA Audit (2026-03-12)

9 bugs fixed in `@thebookingkit/db`.

### Bug Fixes

#### Critical

- **C1** — EXCLUDE constraint `bookings_no_overlap` now excludes `'rescheduled'` status alongside `'cancelled'` and `'rejected'`, preventing double-booking when rescheduling (`0001_setup_extensions.sql`)
- **C2** — Audit trigger ELSE branch uses `'updated'` as fallback event type instead of `'confirmed'`, preventing spurious confirmed events on non-status field updates (`0002_booking_audit_trigger.sql`)
- **C3** — Removed unconditional `v_metadata := '{}'::jsonb` line that silently discarded metadata computed in the IF/ELSIF/ELSE branches (`0002_booking_audit_trigger.sql`)

#### High

- **H4** — Added `.unique()` constraint to `teams.slug` column, preventing duplicate team slugs (`schema/tables.ts`)
- **H5** — Added `.unique()` constraint to `eventTypes.slug` column, preventing duplicate event type slugs (`schema/tables.ts`)

#### Medium

- **M4** — Changed `bookingEvents.bookingId` foreign key from `onDelete: "cascade"` to `onDelete: "restrict"`, protecting audit trail from accidental deletion when a booking is hard-deleted (`schema/tables.ts`)
- **M6** — Added `WalkInQueue` and `NewWalkInQueue` type exports to package index (`index.ts`)
- **M8** — Added `CREATE EXTENSION IF NOT EXISTS pgcrypto` to setup migration so the `digest()` function used by GDPR `anonymize_customer()` is available on fresh databases (`0001_setup_extensions.sql`)

#### Low

- **L5** — Added `"test": "vitest run"` script and `vitest` devDependency to `package.json`

## 0.1.1

### Patch Changes

- Initial release of The Booking Kit packages.
