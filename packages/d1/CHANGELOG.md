# @thebookingkit/d1

## 0.4.0

### Minor Changes

- 88f91f5: Reconcile slot-occupancy semantics across the slot engine, PostgreSQL, and D1.

  The three backends disagreed about which terminal booking statuses free a slot,
  and were **inverted** on both of the statuses in question:

  |               | core / D1 (before) | PostgreSQL (before) |
  | ------------- | ------------------ | ------------------- |
  | `no_show`     | free               | **blocks**          |
  | `rescheduled` | **blocks**         | free                |

  A booking the slot engine offered could therefore be rejected by the database
  constraint, and a slot the database considered free could be hidden by the
  engine.

  All three now use the full set of terminal states — `cancelled`, `rejected`,
  `no_show`, `rescheduled`:

  - **`rescheduled` no longer blocks** (change for `core` and `d1`). A rescheduled
    booking moves to a _new_ row while the original keeps its original
    `startsAt`/`endsAt`; if it kept blocking, every reschedule would permanently
    burn the slot it left. PostgreSQL already had this right.
  - **`no_show` no longer blocks** (change for `db`). The appointment did not
    happen, so its slot is free. `core` already had this right.
  - `completed` still blocks: the appointment happened and the slot was consumed.

  `packages/db` adds migration `0007_reconcile_inactive_statuses.sql`, which drops
  and recreates `bookings_no_overlap` and `bookings_resource_no_overlap`. It only
  ever makes the constraints more permissive, so it cannot fail on existing data —
  no row satisfying the old constraint can violate the new one. Verified against
  PostgreSQL 15 with pre-migration data, including a re-run for idempotency.

  **Action required for PostgreSQL consumers:** run `runCustomMigrations()` (or
  apply `0007` directly). Until you do, your database keeps blocking `no_show`
  slots that the slot engine now offers, and `insertBookingIfFree` on D1 will
  disagree with it.

  `INACTIVE_STATUSES` (core) and `D1_INACTIVE_STATUSES` (d1) are now asserted
  equal in the test suite, so the three definitions cannot silently drift again.

- 68a77b9: Add an atomic overlap guard for D1/SQLite, and close several correctness gaps in the advisory lock.

  ## New: atomic overlap guard

  `insertBookingIfFree`, `insertBookingOrThrow`, `buildInsertIfFree`, and
  `insertResourceBookingIfFree` build a single
  `INSERT ... SELECT ... WHERE NOT EXISTS` statement, so the overlap check and the
  insert cannot be interleaved by a concurrent request. Unlike an advisory lock,
  correctness does not depend on every writer remembering to cooperate.

  Supports buffer time via `conflictWindow`, rescheduling via `excludeId`, custom
  schemas via `columns`, and resource scoping. Overlap is half-open `[start, end)`
  so back-to-back bookings do not conflict, and the blocking-status predicate
  mirrors `INACTIVE_STATUSES` in `@thebookingkit/core`.

  **What it does not cover.** The statement is atomic, but it is only as correct as
  the data it compares against. It cannot prevent an overlap created by a write
  that bypasses it — a hand-written `INSERT`, a Drizzle `db.insert()`, an admin
  script. Apply the new opt-in `BOOKINGS_UNIQUE_SLOT_DDL` for a schema-level
  backstop (identical start times only; a unique index cannot express range
  exclusion). Three further preconditions fail _open_ if violated: date columns
  must have TEXT affinity, existing rows must already be canonical UTC-Z (run
  `findLegacyRows()` / `migrateRowDates()` first), and your `GuardDb.run` must
  actually bind its `params` argument.

  ## Fixed: advisory lock

  - **A lapsed holder could unlock a slot another request was using.** Release was
    `DELETE ... WHERE lock_key = ?` with no ownership check, so a holder whose
    lease had expired — and whose lock had been reclaimed — deleted the new
    holder's row on cleanup, admitting a second writer into the critical section.
    Every acquisition now writes a random `holder` fencing token and release is
    scoped to it.
  - **A lease expiring mid-callback was silent.** `withLock` now throws
    `LockLeaseExpiredError`, with the callback's return value on `.result`.
    Whether the lease survived is determined by the release itself — the
    holder-scoped `DELETE` matching a row proves ownership — not by the wall
    clock, so a slow release cannot report an expiry that never happened and a
    lock reclaimed by a peer cannot go unreported.
  - **Contention detection missed wrapped errors.** Uniqueness violations reported
    through a `cause` chain, an `AggregateError`, a `code`/`errcode` field, or
    phrased `PRIMARY KEY must be unique` were treated as hard faults rather than
    retried. Exported as `isUniqueConstraintError()`.
  - **Auto-migration could hard-fail a concurrent request** and could never
    recover from a schema regression, because it consulted a cached "already
    migrated" flag when the rejection arrived rather than when the statement was
    issued. The decision is now made from the error alone.
  - `extend()` no longer shortens a lease, always verifies ownership, and
    serialises concurrent calls so the in-memory lease cannot drift ahead of the
    stored one.
  - Added validation: `lockTtlMs`, `maxRetries`, `baseDelayMs`, a non-empty
    `lockKey`, and a `generateHolder` that must return a non-empty string.
    `lockTtlMs` is capped at ~24.8 days, beyond which expiry timestamps use the
    expanded-year ISO form and sort below every normal timestamp, silently
    removing mutual exclusion.

  ## Also added

  `LockHandle` (passed to the `withLock` callback: `holder`, `expiresAt`,
  `isExpired()`, `extend()`), `LockLeaseExpiredError`, `LockSchemaError`,
  `LockDriverError`, `GuardResultError`, `extractChanges`,
  `D1_INACTIVE_STATUSES`, `BOOKINGS_UNIQUE_SLOT_DDL`, and
  `BOOKING_LOCKS_HOLDER_MIGRATION_SQL`. No exports were removed or renamed.

  ## Breaking changes

  This is a `minor` bump because the package is 0.x, where that is the
  conventional slot for breaking changes. Consumers on `^0.3.1` will not pick it
  up automatically.

  1. **`withLock` can now throw after a successful callback.** If the lease is lost
     before the critical section ends, `LockLeaseExpiredError` is raised even
     though the callback already ran and its side effects committed. The return
     value is preserved on `.result`. Set `onLeaseExpiry: "ignore"` for the
     previous behaviour, raise `lockTtlMs` above your worst-case critical section,
     or call `handle.extend()` during long work.

  2. **Invalid constructor options now throw `RangeError` at construction**, where
     they were previously accepted: `maxRetries` of `0`, `Infinity`, or a
     non-integer; a non-positive `lockTtlMs`; a negative `baseDelayMs`. Locks are
     usually module-scope singletons, so an env-derived `Number(undefined)` moves
     the failure from one rejected booking to a Worker that fails at import.
     Validate config before constructing.

  3. **A `db` without a `run` method now throws `TypeError` at construction.** Note
     a raw `env.DB` binding has `prepare`/`batch`/`exec` but no `run` — see the
     adapter snippet in the docs.

  4. **`withLock` callbacks now receive a `LockHandle`.** Call sites are
     unaffected, but _implementing_ the old signature breaks: subclasses that
     override `withLock<T>(key, fn: () => Promise<T>)` and hand-written test
     doubles typed that way fail to compile (TS2416). Widen the callback
     parameter.

  5. **`withLock` rejects an empty `lockKey`** instead of locking on the empty
     string.

  ## Migration

  - **Apply `BOOKING_LOCKS_HOLDER_MIGRATION_SQL`** in your migrations folder.
    `BOOKING_LOCKS_DDL` gained a `holder` column, but re-running it (or `ALL_DDL`)
    will **not** retrofit an existing table — it is `CREATE TABLE IF NOT EXISTS`
    and silently no-ops. The lock does upgrade the table in place on first use, so
    no action is strictly required; but if you set `autoMigrate: false` believing
    you have migrated, every `withLock` will throw `LockSchemaError`. Applying the
    statement explicitly also keeps your schema in step with Drizzle/Wrangler
    drift checks.
  - **Upgrade `@thebookingkit/core` and `@thebookingkit/d1` together.** They are in
    the same changesets `fixed` group. Upgrading d1 while pinning `core@^0.3.1`
    yields two copies of core, and `instanceof BookingConflictError` will stop
    matching.

  ## Verification

  276 new tests (290 → 566), including execution against a real SQLite engine:
  50-way concurrent races on one slot admit exactly one winner, an 11-case overlap
  matrix, status semantics, and a control case proving the naive read-then-write
  flow double-books under the same scheduler.

  The fencing defect is pinned by a dedicated regression test whose premise was
  validated against the real pre-fix source from a git worktree; reverting the
  ownership predicate fails 6 tests across 3 files. Adversarial review found six
  further ways to bypass the guard — a non-string `excludeId` nulling the whole
  predicate, case-variant duplicate column keys, a `conflictWindow` narrower than
  the booking, a NULL primary key, expanded-year timestamps, and a malformed
  `inactiveStatuses` — each is now rejected and each has a regression test
  asserting zero overlapping rows against real SQLite.

### Patch Changes

- Updated dependencies [88f91f5]
  - @thebookingkit/core@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies
  - @thebookingkit/core@0.3.1

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
