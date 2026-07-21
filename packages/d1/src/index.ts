/**
 * @thebookingkit/d1 — Cloudflare D1 / SQLite adapter for TheBookingKit
 *
 * This package bridges the gap between D1's text-based date storage and
 * `@thebookingkit/core`'s UTC Date object expectations.
 *
 * ## Quick Start
 *
 * ```ts
 * import {
 *   D1DateCodec,
 *   d1DayQuery,
 *   d1BookingRowsToInputs,
 *   encodeD1Date,
 *   intersectSchedulesToRules,
 *   D1BookingLock,
 * } from "@thebookingkit/d1";
 * import { getAvailableSlots, isSlotAvailable } from "@thebookingkit/core";
 *
 * // Build query bounds + DateRange together so they never diverge
 * const { bounds, dateRange } = d1DayQuery("2026-03-09");
 *
 * const rows = await db.select().from(bookings)
 *   .where(and(
 *     eq(bookings.barberId, barberId),
 *     gte(bookings.startsAt, bounds.gte),
 *     lte(bookings.startsAt, bounds.lte),
 *   )).all();
 *
 * const rules = intersectSchedulesToRules(
 *   barber.weeklySchedule, location.weeklySchedule, location.timezone
 * );
 *
 * const slots = getAvailableSlots(
 *   rules, [], d1BookingRowsToInputs(rows), dateRange, customerTimezone, opts
 * );
 *
 * // On submit — encode before INSERT
 * await db.insert(bookings).values({
 *   startsAt: encodeD1Date(slot.startTime),
 *   endsAt:   encodeD1Date(slot.endTime),
 *   ...
 * });
 * ```
 *
 * ## Double-booking prevention
 *
 * `insertBookingIfFree()` is the authoritative guard: it performs the overlap
 * check and the INSERT in one atomic SQL statement, so concurrent requests
 * cannot interleave between them. It is the D1 equivalent of PostgreSQL's
 * `EXCLUDE USING gist` constraint and needs no advisory lock.
 *
 * ```ts
 * const { inserted } = await insertBookingIfFree(db, {
 *   id: crypto.randomUUID(),
 *   provider_id: barberId,
 *   starts_at: slot.startTime,
 *   ends_at: slot.endTime,
 *   status: "confirmed",
 *   ...rest,
 * });
 * if (!inserted) return conflictResponse();  // slot was taken mid-flight
 * ```
 *
 * `D1BookingLock` remains useful on top of it to serialise expensive work and
 * return friendlier errors, but it is advisory — the guard above is what makes
 * double booking impossible:
 *
 * ```ts
 * const lock = new D1BookingLock(rawDb);
 * await lock.withLock(`${barberId}:${dateStr}`, async () => {
 *   const existing = await fetchBookings(...);
 *   const ok = isSlotAvailable(rules, [], d1BookingRowsToInputs(existing), start, end);
 *   if (!ok.available) throw new BookingConflictError();
 *   await insertBookingOrThrow(db, values);
 * });
 * ```
 */

// Date codec (core primitive)
export {
  D1DateCodec,
  D1DateDecodeError,
  D1DateEncodeError,
  type EncodeOptions,
} from "./codec.js";

// Booking helpers (DB-to-engine bridge)
export {
  d1BookingRowsToInputs,
  d1OverrideRowsToInputs,
  d1AvailabilityRuleRowsToInputs,
  encodeD1Date,
  d1DayBounds,
  d1DayQuery,
  d1LocalDayQuery,
  localToday,
  type D1BookingRow,
  type D1AvailabilityOverrideRow,
  type D1AvailabilityRuleRow,
} from "./booking-helpers.js";

// Schedule adapter (WeeklySchedule JSON → AvailabilityRuleInput[])
export {
  weeklyScheduleToRules,
  intersectSchedulesToRules,
  type WeeklySchedule,
  type DaySchedule,
  type DayOfWeek,
} from "./schedule-adapter.js";

// Atomic overlap guard (authoritative double-booking prevention)
export {
  buildInsertIfFree,
  insertBookingIfFree,
  insertBookingOrThrow,
  extractChanges,
  GuardResultError,
  D1_INACTIVE_STATUSES,
  type BookingGuardColumns,
  type InsertIfFreeOptions,
  type InsertIfFreeResult,
  type GuardedStatement,
  type GuardDb,
} from "./booking-guard.js";

// Advisory lock (contention control + defence in depth)
export {
  D1BookingLock,
  LockAcquisitionError,
  LockLeaseExpiredError,
  LockSchemaError,
  LockDriverError,
  isUniqueConstraintError,
  createD1BookingLock,
  type LockDb,
  type LockHandle,
  type D1BookingLockOptions,
} from "./lock.js";

// Migration utilities
export {
  findLegacyRows,
  migrateRowDates,
  buildMigrationSql,
  BOOKING_LOCKS_DDL,
  BOOKING_LOCKS_HOLDER_MIGRATION_SQL,
  BOOKINGS_UNIQUE_SLOT_DDL,
  RESOURCE_DDL,
  ORGANIZATIONS_DDL,
  TEAMS_DDL,
  PROVIDERS_DDL,
  EVENT_TYPES_DDL,
  AVAILABILITY_DDL,
  BOOKINGS_DDL,
  RECURRING_DDL,
  PAYMENTS_DDL,
  ROUTING_DDL,
  WORKFLOWS_DDL,
  WEBHOOKS_DDL,
  EMAIL_DDL,
  CUSTOMER_DDL,
  WALK_IN_DDL,
  ALL_DDL,
  type MigrationColumn,
  type TableMigrationPlan,
} from "./migration.js";

// Resource helpers (E-22 resource-capacity booking)
export {
  d1ResourceAvailabilityRowsToInputs,
  d1ResourceOverrideRowsToInputs,
  D1ResourceBookingLock,
  createD1ResourceBookingLock,
  insertResourceBookingIfFree,
  type D1ResourceRow,
  type D1ResourceAvailabilityRuleRow,
  type D1ResourceAvailabilityOverrideRow,
} from "./resource-helpers.js";
