/**
 * D1 resource helpers — bridge between raw D1 row data and @thebookingkit/core types
 * for resource-based booking (tables, rooms, courts, desks, etc.).
 *
 * These functions handle the conversion that every D1-backed resource booking
 * flow requires:
 *
 *   D1 resource_availability_rules row  →  AvailabilityRuleInput[]
 *   D1 resource_availability_overrides row  →  AvailabilityOverrideInput[]
 *
 * All date conversions go through D1DateCodec so the format is always UTC-Z.
 *
 * For double-booking prevention, use D1ResourceBookingLock which mirrors the
 * D1BookingLock pattern scoped to a specific resource_id instead of a provider.
 */

import type { AvailabilityRuleInput, AvailabilityOverrideInput } from "@thebookingkit/core";
import { D1DateCodec } from "./codec.js";
import { D1BookingLock } from "./lock.js";
import type { LockDb, D1BookingLockOptions } from "./lock.js";

// ---------------------------------------------------------------------------
// Row interfaces
// ---------------------------------------------------------------------------

/**
 * The expected shape of a raw `resources` row from D1.
 *
 * Your Drizzle schema's inferred type will be a superset of this. The
 * `isActive` column is stored as an integer (0/1) in SQLite but may arrive
 * as a boolean depending on the Drizzle version and driver.
 */
export interface D1ResourceRow {
  /** UUID primary key */
  id: string;
  /** Human-readable display name (e.g. "Table 5", "Yoga Mat 3") */
  name: string;
  /**
   * Free-form resource category (e.g. "table", "room", "court", "desk").
   * No enum — user-defined strings to allow new types without schema changes.
   */
  type: string;
  /**
   * Maximum party size / concurrent guest count this single resource can
   * accommodate. NOT the number of concurrent bookings — the EXCLUDE
   * constraint already enforces one booking per resource at a time.
   */
  capacity: number;
  /**
   * Whether the resource is active. SQLite stores booleans as 0/1 integers;
   * some Drizzle versions return actual booleans.
   */
  isActive: number | boolean;
  /** Physical or logical location label (e.g. "patio", "floor-2"), or null. */
  location: string | null;
  /** JSON-serialised metadata blob, or null. Parse with JSON.parse() if needed. */
  metadata: string | null;
}

/**
 * The expected shape of a raw `resource_availability_rules` row from D1.
 *
 * Mirrors `availability_rules` but scoped to a resource rather than a provider.
 */
export interface D1ResourceAvailabilityRuleRow {
  /** UUID primary key */
  id: string;
  /** FK → resources.id */
  resourceId: string;
  /** RRULE string (e.g. "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR") */
  rrule: string;
  /** Wall-clock start in "HH:mm" format */
  startTime: string;
  /** Wall-clock end in "HH:mm" format */
  endTime: string;
  /** IANA timezone identifier (e.g. "America/New_York") */
  timezone: string;
  /**
   * Optional: ISO date/datetime string (UTC-Z or local-ISO) after which
   * this rule becomes active. Stored as TEXT in D1.
   */
  validFrom: string | null;
  /**
   * Optional: ISO date/datetime string (UTC-Z or local-ISO) after which
   * this rule is no longer active. Stored as TEXT in D1.
   */
  validUntil: string | null;
}

/**
 * The expected shape of a raw `resource_availability_overrides` row from D1.
 *
 * Mirrors `availability_overrides` but scoped to a resource rather than a provider.
 */
export interface D1ResourceAvailabilityOverrideRow {
  /** UUID primary key */
  id: string;
  /** FK → resources.id */
  resourceId: string;
  /**
   * The date this override applies to. Stored as a UTC-Z datetime string via
   * D1DateCodec.encode() (e.g. "2026-03-10T00:00:00.000Z"). Decoded with
   * D1DateCodec.decode() before being passed to the slot engine.
   */
  date: string;
  /** Wall-clock start in "HH:mm" format, or null when the whole day is blocked */
  startTime: string | null;
  /** Wall-clock end in "HH:mm" format, or null when the whole day is blocked */
  endTime: string | null;
  /**
   * When true the entire date (or time window) is blocked. SQLite stores
   * booleans as 0/1 integers; accept both shapes.
   */
  isUnavailable: number | boolean;
  /** Human-readable reason for the override (e.g. "Deep clean", "Maintenance") */
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Row-to-input converters
// ---------------------------------------------------------------------------

/**
 * Convert an array of raw D1 `resource_availability_rules` rows into
 * `AvailabilityRuleInput[]` for `getResourceAvailableSlots()` and related
 * resource slot engine functions.
 *
 * Date fields (`validFrom`, `validUntil`) are decoded through
 * `D1DateCodec.decode()` which handles both canonical UTC-Z format and legacy
 * local-ISO rows. Null values are preserved as `null`.
 *
 * @param rows - Raw rows from a D1/Drizzle query on `resource_availability_rules`.
 * @returns Array of AvailabilityRuleInput objects ready for the slot engine.
 *
 * @example
 * ```ts
 * const ruleRows = await db.select()
 *   .from(resourceAvailabilityRules)
 *   .where(eq(resourceAvailabilityRules.resourceId, resourceId))
 *   .all();
 *
 * const rules = d1ResourceAvailabilityRowsToInputs(ruleRows);
 * const slots = getResourceAvailableSlots([{ ...resource, rules, overrides, bookings }], dateRange, tz);
 * ```
 */
export function d1ResourceAvailabilityRowsToInputs(
  rows: D1ResourceAvailabilityRuleRow[],
): AvailabilityRuleInput[] {
  return rows.map((row) => ({
    rrule: row.rrule,
    startTime: row.startTime,
    endTime: row.endTime,
    timezone: row.timezone,
    validFrom: row.validFrom != null ? D1DateCodec.decode(row.validFrom) : null,
    validUntil: row.validUntil != null ? D1DateCodec.decode(row.validUntil) : null,
  }));
}

/**
 * Convert an array of raw D1 `resource_availability_overrides` rows into
 * `AvailabilityOverrideInput[]` for `getResourceAvailableSlots()`.
 *
 * The `date` field is decoded through `D1DateCodec.decode()`. The
 * `isUnavailable` field is coerced to a boolean to handle SQLite's 0/1
 * integer representation.
 *
 * @param rows - Raw override rows from a D1 query on `resource_availability_overrides`.
 * @returns Array of AvailabilityOverrideInput objects ready for the slot engine.
 *
 * @example
 * ```ts
 * const overrideRows = await db.select()
 *   .from(resourceAvailabilityOverrides)
 *   .where(eq(resourceAvailabilityOverrides.resourceId, resourceId))
 *   .all();
 *
 * const overrides = d1ResourceOverrideRowsToInputs(overrideRows);
 * ```
 */
export function d1ResourceOverrideRowsToInputs(
  rows: D1ResourceAvailabilityOverrideRow[],
): AvailabilityOverrideInput[] {
  return rows.map((row) => ({
    date: D1DateCodec.decode(row.date),
    startTime: row.startTime ?? null,
    endTime: row.endTime ?? null,
    isUnavailable: Boolean(row.isUnavailable),
  }));
}

// ---------------------------------------------------------------------------
// D1ResourceBookingLock
// ---------------------------------------------------------------------------

/**
 * Application-level advisory lock for resource-scoped booking flows in D1 / SQLite.
 *
 * Mirrors the `D1BookingLock` pattern but scoped to a `resource_id` instead of
 * a `provider_id`. PostgreSQL prevents double-booking via an `EXCLUDE USING gist`
 * constraint on `(resource_id, tstzrange(starts_at, ends_at))`; SQLite/D1 has no
 * equivalent, so this lock provides equivalent serialisation guarantees.
 *
 * ## Required schema
 *
 * The same `booking_locks` table used by `D1BookingLock` is reused — no new table
 * is required. The lock key convention changes to `"resource:{resourceId}:{dateStr}"`:
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS booking_locks (
 *   lock_key   TEXT PRIMARY KEY,
 *   expires_at TEXT NOT NULL,
 *   created_at TEXT NOT NULL
 * );
 * ```
 *
 * ## Usage
 *
 * ```ts
 * const lock = new D1ResourceBookingLock(db);
 *
 * await lock.withResourceLock(resourceId, dateStr, async () => {
 *   // Safe to read-then-write for this resource + date combination
 *   const existing = await db.select()...
 *   const available = isResourceSlotAvailable([resource], resourceId, start, end);
 *   if (!available.available) throw new BookingConflictError();
 *   await db.insert(bookings).values({ resourceId, startsAt, endsAt, ... });
 * });
 * ```
 */
export class D1ResourceBookingLock extends D1BookingLock {
  /**
   * Create a new D1ResourceBookingLock.
   *
   * @param db - Any object exposing `run(sql, params)` (raw D1 client or Drizzle db).
   * @param options - Optional lock configuration (tableName, lockTtlMs, maxRetries, baseDelayMs).
   *   Defaults match D1BookingLock defaults. The default `tableName` is "booking_locks"
   *   — the same table used by D1BookingLock so both provider and resource locks can
   *   coexist without an extra migration.
   */
  constructor(db: LockDb, options?: D1BookingLockOptions) {
    super(db, options);
  }

  /**
   * Acquire a resource-scoped lock, run the provided callback, then release.
   *
   * The lock key is namespaced as `"resource:{resourceId}:{dateStr}"` to avoid
   * collisions with provider-scoped locks from `D1BookingLock.withLock()`.
   *
   * @param resourceId - The resource UUID being locked.
   * @param dateStr - "YYYY-MM-DD" date string identifying the booking day.
   * @param fn - Async callback containing the availability check and INSERT.
   * @returns The return value of the callback.
   * @throws LockAcquisitionError when retries are exhausted.
   *
   * @example
   * ```ts
   * const lock = new D1ResourceBookingLock(db);
   * const bookingId = await lock.withResourceLock(table.id, "2026-06-15", async () => {
   *   const available = isResourceSlotAvailable([table], table.id, start, end);
   *   if (!available.available) throw new BookingConflictError();
   *   await db.insert(bookings).values({ ... });
   *   return crypto.randomUUID();
   * });
   * ```
   */
  async withResourceLock<T>(
    resourceId: string,
    dateStr: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const lockKey = `resource:${resourceId}:${dateStr}`;
    return this.withLock(lockKey, fn);
  }

  /**
   * Build the conventional lock key for a resource booking.
   *
   * Use this when you need the key string directly (e.g. for logging or
   * manual lock management) without calling `withResourceLock`.
   *
   * @param resourceId - The resource UUID.
   * @param dateStr - "YYYY-MM-DD" date string.
   * @returns Lock key string in the form `"resource:{resourceId}:{dateStr}"`.
   */
  static buildLockKey(resourceId: string, dateStr: string): string {
    return `resource:${resourceId}:${dateStr}`;
  }
}

/**
 * Factory helper to create a D1ResourceBookingLock without the `new` keyword.
 *
 * @param db - Any object exposing `run(sql, params)`.
 * @param options - Optional lock configuration.
 * @returns A new D1ResourceBookingLock instance.
 *
 * @example
 * ```ts
 * const lock = createD1ResourceBookingLock(db, { lockTtlMs: 15_000 });
 * await lock.withResourceLock(resourceId, dateStr, async () => { ... });
 * ```
 */
export function createD1ResourceBookingLock(
  db: LockDb,
  options?: D1BookingLockOptions,
): D1ResourceBookingLock {
  return new D1ResourceBookingLock(db, options);
}
