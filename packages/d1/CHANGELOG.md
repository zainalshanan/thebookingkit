# @thebookingkit/d1

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

- Updated dependencies [aac30ce]
- Updated dependencies [d3ab748]
  - @thebookingkit/core@0.3.0

## 0.2.0

### Minor Changes (2026-03-25)

Adds D1/SQLite adapter helpers, domain-scoped DDL for all tables, and resource booking support.

### New Features

#### Domain-Scoped DDL Constants (E-24)

- **14 domain-scoped DDL constants** for all core tables: `ORGANIZATIONS_DDL`, `TEAMS_DDL`, `PROVIDERS_DDL`, `EVENT_TYPES_DDL`, `AVAILABILITY_DDL`, `BOOKINGS_DDL`, `RECURRING_DDL`, `PAYMENTS_DDL`, `ROUTING_DDL`, `WORKFLOWS_DDL`, `WEBHOOKS_DDL`, `EMAIL_DDL`, `CUSTOMER_DDL`, `WALK_IN_DDL`
- **`ALL_DDL`** — convenience aggregate joining all 16 constants (14 domain + `RESOURCE_DDL` + `BOOKING_LOCKS_DDL`), ordered by FK dependency
- `RESOURCE_DDL` deprecated in favor of `ALL_DDL` (retained for backward compatibility)
- 101 new DDL tests validating table structure, column names, FK constraints, and absence of PostgreSQL-only syntax

#### Resource Helpers (`resource-helpers.ts`)

- **`d1ResourceAvailabilityRowsToInputs()`** — Converts D1 text-encoded resource availability rows into `AvailabilityRuleInput[]` using `D1DateCodec`.
- **`d1ResourceOverrideRowsToInputs()`** — Converts D1 resource override rows into `AvailabilityOverrideInput[]`.
- **`D1ResourceBookingLock`** — Resource-scoped advisory locking extending `D1BookingLock` with namespaced keys (`resource:{id}:{date}`).
- **`createD1ResourceBookingLock()`** — Factory function for resource lock instances.

#### Interfaces

- `D1ResourceRow`, `D1ResourceAvailabilityRuleRow`, `D1ResourceAvailabilityOverrideRow`

#### Migration (`migration.ts`)

- **`RESOURCE_DDL`** constant — SQLite CREATE TABLE statements for `resources`, `resource_availability_rules`, `resource_availability_overrides` with indexes.

#### Tests

- 50 new tests covering row converters, date codec round-trips, lock behavior, DDL syntax, and race condition simulation.

### Dependencies

- Updated `@thebookingkit/core` to `^0.2.0`

## 0.1.5

### Minor Changes — QA Audit (2026-03-12)

13 bugs fixed in `@thebookingkit/d1`.

### Bug Fixes

#### Critical

- **C1** — `D1BookingLock` constructor validates `tableName` against `/^[a-zA-Z_][a-zA-Z0-9_]*$/`, preventing SQL injection via identifier interpolation (`lock.ts`)
- **C2** — `buildMigrationSql` validates `tableName`, `primaryKey`, and all column keys against the same identifier regex before constructing SQL (`migration.ts`)

#### High

- **H6** — `D1BookingLock.acquire()` inspects error messages for `"UNIQUE constraint"` and only retries on those; all other errors are re-thrown immediately instead of being masked as `LockAcquisitionError` (`lock.ts`)

#### Medium

- **M1** — `d1LocalDayQuery` computes next-day midnight using `normalizeToUTC` on the next date string, producing correct 23h/25h spans on DST transition days instead of a flat 24h addition (`booking-helpers.ts`)
- **M2** — `d1LocalDayQuery` subtracts 1ms from `bounds.lte` so bookings starting at exactly the next day's midnight are excluded from `<=` queries (`booking-helpers.ts`)
- **M3** — `weeklyScheduleToRules` normalizes single-digit hours (e.g. `"9:00"` → `"09:00"`) before validation instead of silently dropping them (`schedule-adapter.ts`)
- **M4** — `isHHmm` regex tightened from `/^\d{2}:\d{2}$/` to `/^([01]\d|2[0-3]):[0-5]\d$/`, rejecting out-of-range values like `"25:00"` or `"99:99"` (`schedule-adapter.ts`)
- **M5** — Stale lock cleanup threshold changed from `now - lockTtlMs` to `now`, so expired locks are cleaned up immediately instead of after 2x TTL (`lock.ts`)
- **M6** — `D1DateCodec.encode()` removed the `new Date(value)` fallback that accepted ambiguous strings; now throws `RangeError` for non-ISO formats (`codec.ts`)
- **M7** — `D1DateCodec.decode()` explicitly rejects date-only strings (`"YYYY-MM-DD"`) with `D1DateDecodeError` instead of silently accepting them via V8's `new Date()` path (`codec.ts`)

#### Low

- **L1** — `weeklyScheduleToRules` throws `RangeError` for inverted time windows (`startTime >= endTime`) instead of silently discarding them (`schedule-adapter.ts`)
- **L2** — Removed unused `BookingConflictError` import from `lock.ts`

### Dependencies

- Updated `@thebookingkit/core` to `^0.1.5`

## 0.1.1

### Patch Changes

- Initial release of The Booking Kit packages.
- Updated dependencies
  - @thebookingkit/core@0.1.1
