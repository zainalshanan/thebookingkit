/**
 * D1DateCodec — canonical UTC-ISO encoding for Cloudflare D1 / SQLite.
 *
 * ## The Problem
 *
 * SQLite has no native timestamp type. Drizzle's `sqlite-core` maps date
 * columns to `text`. String-comparison range queries (`>=`, `<=`) only
 * produce correct results when EVERY stored value uses the SAME lexicographic
 * format. The two formats developers commonly mix are:
 *
 *   - Local ISO without Z:  "2026-03-09T09:00:00"   ← NOT lexicographically sortable across DST boundaries
 *   - UTC ISO with Z:       "2026-03-09T14:00:00.000Z"  ← always sortable, always unambiguous
 *
 * This module enforces the **UTC-Z** format as the single canonical form for
 * all date storage and query bound construction. All incoming values (Date
 * objects, UTC strings, or local strings with a supplied timezone) are
 * normalized to this format before they leave the adapter boundary.
 *
 * ## The Rule
 *
 * - Every date column in a D1/SQLite schema used with TheBookingKit MUST store
 *   values in the form "YYYY-MM-DDTHH:mm:ss.sssZ".
 * - Query bounds passed to Drizzle (`gte`, `lte`) MUST use `D1DateCodec.encode()`.
 * - Rows retrieved from D1 MUST be parsed with `D1DateCodec.decode()` before
 *   being passed to `@thebookingkit/core` functions.
 */

import { fromZonedTime } from "date-fns-tz";
import { isValidTimezone } from "@thebookingkit/core";

/** The canonical UTC-Z regex. Matches "YYYY-MM-DDTHH:mm:ss.sssZ". */
const UTC_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Local ISO without timezone suffix, e.g. "2026-03-09T14:00:00". */
const LOCAL_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;

/**
 * Thrown when a date string cannot be decoded into a valid UTC Date.
 */
export class D1DateDecodeError extends Error {
  public readonly code = "D1_DATE_DECODE_ERROR";
  public readonly raw: string;

  constructor(raw: string, hint?: string) {
    super(
      `Cannot decode D1 date string "${raw}" into a valid UTC Date.${hint ? " " + hint : ""} ` +
        `Ensure all date columns are stored with D1DateCodec.encode() which produces "YYYY-MM-DDTHH:mm:ss.sssZ" format.`,
    );
    this.name = "D1DateDecodeError";
    this.raw = raw;
  }
}

/**
 * Thrown when a local ISO string is passed to encode() without a timezone.
 */
export class D1DateEncodeError extends Error {
  public readonly code = "D1_DATE_ENCODE_ERROR";

  constructor(value: string) {
    super(
      `Cannot encode local ISO string "${value}" without a timezone. ` +
        `Either pass a Date object, a UTC-Z string, or provide the "timezone" option so the local time can be converted to UTC.`,
    );
    this.name = "D1DateEncodeError";
  }
}

/**
 * Options for D1DateCodec.encode() when the input is a local ISO string.
 */
export interface EncodeOptions {
  /**
   * IANA timezone identifier used to interpret local ISO strings
   * (e.g. "Australia/Sydney"). Required when the input is a local ISO string
   * without a Z suffix. Ignored for Date objects and UTC-Z strings.
   */
  timezone?: string;
}

/**
 * Canonical date codec for Cloudflare D1 / SQLite date columns.
 *
 * All methods are pure functions — no side effects, no global state.
 *
 * @example
 * ```ts
 * // Store
 * const stored = D1DateCodec.encode(new Date("2026-03-09T14:00:00.000Z"));
 * // => "2026-03-09T14:00:00.000Z"
 *
 * // Query bounds
 * const { gte, lte } = D1DateCodec.dayBounds("2026-03-09");
 *
 * // Read back
 * const date = D1DateCodec.decode(row.startsAt);
 * ```
 */
export const D1DateCodec = {
  /**
   * Encode a date value to the canonical UTC-Z string for D1 storage or
   * query bound construction.
   *
   * Accepts three input shapes:
   * - `Date` object — converted directly via `.toISOString()`.
   * - UTC-Z string (e.g. `"2026-03-09T14:00:00.000Z"`) — returned as-is
   *   after validation.
   * - Local ISO string (e.g. `"2026-03-09T14:00:00"`) — requires
   *   `options.timezone` to perform a tz-aware conversion via
   *   `date-fns-tz/fromZonedTime`. Throws `D1DateEncodeError` if
   *   `options.timezone` is absent.
   *
   * @param value - Date object or ISO string to encode.
   * @param options - Optional timezone for local ISO string inputs.
   * @returns Canonical UTC-Z ISO string.
   */
  encode(value: Date | string, options?: EncodeOptions): string {
    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        throw new RangeError("Cannot encode an invalid Date object.");
      }
      return value.toISOString();
    }

    if (UTC_ISO_RE.test(value)) {
      // UTC-Z input — validate and normalize to canonical form with .000 millis
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        throw new RangeError(`Cannot encode malformed UTC string: "${value}"`);
      }
      return d.toISOString();
    }

    if (LOCAL_ISO_RE.test(value)) {
      if (!options?.timezone) {
        throw new D1DateEncodeError(value);
      }
      if (!isValidTimezone(options.timezone)) {
        throw new RangeError(
          `Invalid IANA timezone: "${options.timezone}". Provide a valid identifier such as "America/New_York".`,
        );
      }
      const utcDate = fromZonedTime(value, options.timezone);
      return utcDate.toISOString();
    }

    throw new RangeError(
      `Cannot encode unrecognized date string: "${value}". ` +
      `Expected ISO 8601 format: "YYYY-MM-DDTHH:mm:ss.sssZ" (UTC) or "YYYY-MM-DDTHH:mm:ss" (local with timezone option).`,
    );
  },

  /**
   * Decode a D1 text column value into a UTC `Date` object suitable for
   * passing to `@thebookingkit/core` functions (`getAvailableSlots`, `isSlotAvailable`).
   *
   * Accepts:
   * - UTC-Z strings (canonical format, preferred).
   * - Local ISO strings without Z — interpreted as UTC for backwards
   *   compatibility with rows written before this codec was adopted.
   *   A `D1DateDecodeError` is NOT thrown for these; instead the value is
   *   parsed with `new Date(value + "Z")` and a warning reason is attached to
   *   the returned object via the `_legacyFormat` symbol property so callers
   *   can detect and migrate legacy rows.
   *
   * @param raw - The raw string value from a D1 text column.
   * @returns A UTC Date object.
   * @throws D1DateDecodeError when the string cannot be parsed at all.
   */
  decode(raw: string): Date {
    if (!raw || typeof raw !== "string") {
      throw new D1DateDecodeError(String(raw), "Value is null, undefined, or not a string.");
    }

    // Fast path: canonical format
    if (UTC_ISO_RE.test(raw)) {
      const d = new Date(raw);
      if (isNaN(d.getTime())) throw new D1DateDecodeError(raw);
      return d;
    }

    // Compatibility path: local ISO without Z (legacy rows written without this codec)
    if (LOCAL_ISO_RE.test(raw)) {
      const d = new Date(raw + "Z");
      if (isNaN(d.getTime())) throw new D1DateDecodeError(raw);
      // Tag this date so callers can detect legacy format rows if needed
      (d as Date & { _d1LegacyFormat?: true })._d1LegacyFormat = true;
      return d;
    }

    // Date-only strings like "2026-03-10" are ambiguous — reject them explicitly
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new D1DateDecodeError(
        raw,
        "Date-only strings are ambiguous. Store full UTC-Z datetimes: \"2026-03-10T00:00:00.000Z\".",
      );
    }

    throw new D1DateDecodeError(
      raw,
      "String does not match YYYY-MM-DDTHH:mm:ss[.sss]Z or YYYY-MM-DDTHH:mm:ss format.",
    );
  },

  /**
   * Build the `gte`/`lte` string bounds for a single-day D1 range query.
   *
   * SQLite string comparison only works correctly when both the stored values
   * AND the query bounds use the same format. Since we store UTC-Z, the bounds
   * must also be UTC-Z.
   *
   * @param dateStr - A date string in "YYYY-MM-DD" format.
   * @returns `{ gte: string; lte: string }` — both in UTC-Z canonical format.
   *
   * @example
   * ```ts
   * const { gte, lte } = D1DateCodec.dayBounds("2026-03-09");
   * // gte => "2026-03-09T00:00:00.000Z"
   * // lte => "2026-03-09T23:59:59.999Z"
   * ```
   */
  dayBounds(dateStr: string): { gte: string; lte: string } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new RangeError(
        `dayBounds expects "YYYY-MM-DD", received: "${dateStr}"`,
      );
    }
    return {
      gte: `${dateStr}T00:00:00.000Z`,
      lte: `${dateStr}T23:59:59.999Z`,
    };
  },

  /**
   * Build `gte`/`lte` bounds from a `DateRange` (two UTC Date objects) for use
   * in multi-day D1 range queries.
   *
   * @param range - A BookingKit `DateRange` with UTC `start` and `end` Date objects.
   * @returns `{ gte: string; lte: string }` — both in UTC-Z canonical format.
   *
   * @example
   * ```ts
   * const range = {
   *   start: new Date("2026-03-09T00:00:00.000Z"),
   *   end:   new Date("2026-03-15T23:59:59.999Z"),
   * };
   * const { gte, lte } = D1DateCodec.rangeBounds(range);
   * ```
   */
  rangeBounds(range: { start: Date; end: Date }): { gte: string; lte: string } {
    if (isNaN(range.start.getTime()) || isNaN(range.end.getTime())) {
      throw new RangeError("rangeBounds: start and end must be valid Date objects.");
    }
    if (range.start > range.end) {
      throw new RangeError("rangeBounds: start must be before or equal to end.");
    }
    return {
      gte: range.start.toISOString(),
      lte: range.end.toISOString(),
    };
  },

  /**
   * Build a `DateRange` (UTC Date objects) from a plain date string for
   * passing to `getAvailableSlots()` or `isSlotAvailable()`.
   *
   * @param dateStr - "YYYY-MM-DD" date string.
   * @returns `DateRange` with start = 00:00:00.000Z and end = 23:59:59.999Z.
   *
   * @example
   * ```ts
   * const range = D1DateCodec.toDateRange("2026-03-09");
   * getAvailableSlots(rules, overrides, bookings, range, tz, opts);
   * ```
   */
  toDateRange(dateStr: string): { start: Date; end: Date } {
    const bounds = D1DateCodec.dayBounds(dateStr);
    return {
      start: new Date(bounds.gte),
      end: new Date(bounds.lte),
    };
  },

  /**
   * Returns true if the given string value appears to have been stored in
   * legacy local-ISO format (no Z suffix). Use this to identify rows that
   * need a migration.
   */
  isLegacyFormat(value: string): boolean {
    return LOCAL_ISO_RE.test(value) && !UTC_ISO_RE.test(value);
  },
} as const;
