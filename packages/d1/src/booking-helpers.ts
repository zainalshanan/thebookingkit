/**
 * D1 booking helpers — bridge between raw D1 row data and @thebookingkit/core types.
 *
 * These functions handle the two-way conversion that every D1-backed booking
 * flow requires:
 *
 *   D1 row (string dates)  →  BookingInput[]   (for conflict checking)
 *   DateRange (Date objs)  →  query bounds     (for DB SELECT)
 *   Date / string          →  stored string    (for DB INSERT)
 *
 * All conversions go through D1DateCodec so the format is always UTC-Z.
 */

import type { BookingInput, AvailabilityOverrideInput } from "@thebookingkit/core";
import { normalizeToUTC } from "@thebookingkit/core";
import { toZonedTime } from "date-fns-tz";
import { format } from "date-fns";
import { D1DateCodec } from "./codec.js";

/**
 * The minimal shape of a D1 booking row needed for conflict checking.
 * Your Drizzle schema's inferred type will be a superset of this.
 */
export interface D1BookingRow {
  /** Stored as a UTC-Z string via D1DateCodec.encode() */
  startsAt: string;
  /** Stored as a UTC-Z string via D1DateCodec.encode() */
  endsAt: string;
  /**
   * Booking status. Cancelled and rejected bookings are excluded from
   * conflict checks by the slot engine — they just need to be present here.
   */
  status: string;
}

/**
 * The minimal shape of a D1 availability override row.
 */
export interface D1AvailabilityOverrideRow {
  /** Date column stored as UTC-Z string */
  date: string;
  /** HH:mm or null */
  startTime: string | null;
  /** HH:mm or null */
  endTime: string | null;
  isUnavailable: number | boolean;
}

/**
 * Convert an array of raw D1 booking rows into `BookingInput[]` for
 * `getAvailableSlots()` and `isSlotAvailable()`.
 *
 * All `startsAt`/`endsAt` strings are decoded through `D1DateCodec.decode()`
 * which handles both canonical UTC-Z format and legacy local-ISO rows.
 *
 * @param rows - Raw rows from a D1/Drizzle query.
 * @returns Array of BookingInput objects with proper UTC Date objects.
 *
 * @example
 * ```ts
 * const rows = await db.select().from(bookings)
 *   .where(and(
 *     eq(bookings.barberId, barberId),
 *     gte(bookings.startsAt, bounds.gte),
 *     lte(bookings.startsAt, bounds.lte),
 *   )).all();
 *
 * const inputs = d1BookingRowsToInputs(rows);
 * const slots = getAvailableSlots(rules, [], inputs, dateRange, tz, opts);
 * ```
 */
export function d1BookingRowsToInputs(rows: D1BookingRow[]): BookingInput[] {
  return rows.map((row) => ({
    startsAt: D1DateCodec.decode(row.startsAt),
    endsAt: D1DateCodec.decode(row.endsAt),
    status: row.status,
  }));
}

/**
 * Convert an array of raw D1 availability override rows into
 * `AvailabilityOverrideInput[]` for `getAvailableSlots()`.
 *
 * @param rows - Raw override rows from D1.
 * @returns Array of AvailabilityOverrideInput.
 */
export function d1OverrideRowsToInputs(
  rows: D1AvailabilityOverrideRow[],
): AvailabilityOverrideInput[] {
  return rows.map((row) => ({
    date: D1DateCodec.decode(row.date),
    startTime: row.startTime ?? null,
    endTime: row.endTime ?? null,
    isUnavailable: Boolean(row.isUnavailable),
  }));
}

/**
 * Build a full D1 date column value for INSERT/UPDATE.
 *
 * Accepts a Date object, a UTC-Z string, or (with the timezone option) a
 * local ISO string. Always returns the canonical UTC-Z format.
 *
 * @param value - The booking time to store.
 * @param timezone - Required only when value is a local ISO string without Z.
 * @returns UTC-Z canonical string for the D1 text column.
 *
 * @example
 * ```ts
 * // From a slot returned by getAvailableSlots():
 * const startsAt = encodeD1Date(slot.startTime);
 * const endsAt   = encodeD1Date(slot.endTime);
 *
 * await db.insert(bookings).values({ startsAt, endsAt, ... });
 * ```
 */
export function encodeD1Date(value: Date | string, timezone?: string): string {
  return D1DateCodec.encode(value, timezone ? { timezone } : undefined);
}

/**
 * Build the query bounds object for a single-day booking range query.
 *
 * @param dateStr - "YYYY-MM-DD" date string.
 * @returns `{ gte, lte }` strings ready for Drizzle's `gte()`/`lte()` helpers.
 *
 * @example
 * ```ts
 * const bounds = d1DayBounds("2026-03-09");
 * const rows = await db.select().from(bookings)
 *   .where(and(
 *     eq(bookings.barberId, barberId),
 *     gte(bookings.startsAt, bounds.gte),
 *     lte(bookings.startsAt, bounds.lte),
 *   )).all();
 * ```
 */
export function d1DayBounds(dateStr: string): { gte: string; lte: string } {
  return D1DateCodec.dayBounds(dateStr);
}

/**
 * Build the query bounds and the matching DateRange for the slot engine in
 * one call. This ensures the strings used for the DB query and the Date
 * objects used for the slot engine are always derived from the same source,
 * eliminating the mixed-format bug seen in forza-barber-v2/booking.ts.
 *
 * @param dateStr - "YYYY-MM-DD" date string.
 * @returns Object with `bounds` for the DB query and `dateRange` for the engine.
 *
 * @example
 * ```ts
 * const { bounds, dateRange } = d1DayQuery("2026-03-09");
 *
 * // 1. Fetch bookings from D1
 * const rows = await db.select().from(bookings)
 *   .where(and(
 *     eq(bookings.barberId, barberId),
 *     gte(bookings.startsAt, bounds.gte),
 *     lte(bookings.startsAt, bounds.lte),
 *   )).all();
 *
 * // 2. Feed into slot engine — same UTC boundary, no format mismatch
 * const slots = getAvailableSlots(
 *   rules, [], d1BookingRowsToInputs(rows), dateRange, tz, opts
 * );
 * ```
 */
export function d1DayQuery(dateStr: string): {
  bounds: { gte: string; lte: string };
  dateRange: { start: Date; end: Date };
} {
  const bounds = D1DateCodec.dayBounds(dateStr);
  return {
    bounds,
    dateRange: {
      start: new Date(bounds.gte),
      end: new Date(bounds.lte),
    },
  };
}

/**
 * Build timezone-aware query bounds and DateRange for a single local-calendar day.
 *
 * Use this instead of `d1DayQuery` when your provider's timezone is far from UTC
 * (e.g. Australia/Sydney, Asia/Tokyo). The UTC-midnight bounds from `d1DayQuery`
 * work for the slot engine, but miss cross-midnight bookings in D1 queries.
 *
 * **`bounds`** (for D1 queries): covers the full local day in UTC so bookings
 * like "9am Sydney on March 9" (stored as `2026-03-08T22:00:00.000Z`) are found
 * even though their UTC date is March 8.
 *
 * **`dateRange`** (for slot engine): uses UTC midnight boundaries which are
 * proven correct for RRULE expansion — the 23:59:59.999Z end excludes the next
 * day's occurrence while still generating all slots for the target date.
 *
 * @param dateStr - "YYYY-MM-DD" date string (the local calendar day to query).
 * @param timezone - IANA timezone identifier for the provider/location.
 * @returns Object with `bounds` for the D1 query and `dateRange` for the slot engine.
 *
 * @example
 * ```ts
 * const { bounds, dateRange } = d1LocalDayQuery("2026-03-09", "Australia/Sydney");
 * // bounds.gte = "2026-03-08T13:00:00.000Z"  (March 9 midnight AEDT)
 * // bounds.lte = "2026-03-09T12:59:59.999Z"  (1 ms before March 10 midnight AEDT)
 * // dateRange  = UTC midnight March 9 to 23:59:59.999Z (for slot engine)
 * ```
 */
export function d1LocalDayQuery(dateStr: string, timezone: string): {
  bounds: { gte: string; lte: string };
  dateRange: { start: Date; end: Date };
} {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new RangeError(
      `d1LocalDayQuery expects "YYYY-MM-DD", received: "${dateStr}"`,
    );
  }

  // D1 query bounds: cover the full local day in UTC
  // This ensures bookings that cross UTC midnight are included
  const localMidnightUtc = new Date(normalizeToUTC(`${dateStr}T00:00:00`, timezone));

  // Parse the next day's date string
  const [y, m, d] = dateStr.split("-").map(Number);
  const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
  const nextDateStr = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, "0")}-${String(nextDate.getUTCDate()).padStart(2, "0")}`;
  const nextLocalMidnightUtc = new Date(normalizeToUTC(`${nextDateStr}T00:00:00`, timezone));

  // Slot engine dateRange: UTC midnight bounds (proven correct with RRULE expansion)
  // The 23:59:59.999Z end prevents including the next day's RRULE occurrence
  const utcDayBounds = D1DateCodec.dayBounds(dateStr);

  // Subtract 1ms from the upper bound so that a booking starting at exactly
  // the next day's local midnight is NOT included when Drizzle uses lte() (<=).
  // Without this, a booking at e.g. "2026-03-09T13:00:00.000Z" (midnight AEDT
  // March 10) would pass the lte filter and appear in the March 9 result set.
  const lteMs = nextLocalMidnightUtc.getTime() - 1;
  const lteDate = new Date(lteMs);

  return {
    bounds: {
      gte: localMidnightUtc.toISOString(),
      lte: lteDate.toISOString(),
    },
    dateRange: {
      start: new Date(utcDayBounds.gte),
      end: new Date(utcDayBounds.lte),
    },
  };
}

/**
 * Get today's date as a "YYYY-MM-DD" string in the given IANA timezone.
 *
 * This is essential for D1-backed booking systems where the server (e.g.
 * Cloudflare Workers) runs in UTC but needs to determine "today" relative to
 * a location's local timezone. Pair with `d1LocalDayQuery()` for timezone-aware
 * day queries.
 *
 * @param timezone - IANA timezone identifier (e.g. "Australia/Sydney", "America/New_York").
 * @param now - Optional reference Date; defaults to `new Date()`. Useful for testing.
 * @returns "YYYY-MM-DD" string representing the current local date.
 *
 * @example
 * ```ts
 * const today = localToday("Australia/Sydney");
 * // => "2026-03-10" (even if UTC is still March 9)
 *
 * const { bounds, dateRange } = d1LocalDayQuery(today, "Australia/Sydney");
 * ```
 */
export function localToday(timezone: string, now?: Date): string {
  return format(toZonedTime(now ?? new Date(), timezone), "yyyy-MM-dd");
}
