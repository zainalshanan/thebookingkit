/** A computed time slot available for booking */
export interface Slot {
  /** Start time in UTC ISO-8601 */
  startTime: string;
  /** End time in UTC ISO-8601 */
  endTime: string;
  /** Start time formatted in the customer's local timezone */
  localStart: string;
  /** End time formatted in the customer's local timezone */
  localEnd: string;
}

/** A date occurrence from RRULE expansion */
export interface DateOccurrence {
  /** The date of the occurrence (YYYY-MM-DD) */
  date: string;
  /** Start time (HH:mm) */
  startTime: string;
  /** End time (HH:mm) */
  endTime: string;
}

/** Options for slot computation */
export interface SlotComputeOptions {
  /** Slot duration in minutes */
  duration?: number;
  /** Buffer time in minutes before each slot */
  bufferBefore?: number;
  /** Buffer time in minutes after each slot */
  bufferAfter?: number;
  /** Filter slots for a specific event type */
  eventTypeId?: string;
  /** Slot interval in minutes (default: same as duration) */
  slotInterval?: number;
  /**
   * The reference point for filtering out past slots.
   * Defaults to `new Date()` when omitted. Inject an explicit value in tests
   * or server-side rendering to make slot generation fully deterministic.
   */
  now?: Date;
}

/**
 * Date range for slot queries.
 *
 * Both `start` and `end` **must be UTC Date objects**. The RRULE expansion
 * uses `start` as `dtstart`, which determines the time-of-day reference for
 * generated occurrences. Passing local-time dates (e.g. constructed without
 * a `Z` suffix on a non-UTC server) will shift the RRULE boundary and can
 * cause occurrences to be silently excluded.
 *
 * @example
 * ```ts
 * // Correct — explicit UTC
 * const dateRange = {
 *   start: new Date("2026-03-09T00:00:00.000Z"),
 *   end:   new Date("2026-03-09T23:59:59.999Z"),
 * };
 *
 * // Also correct
 * const day = new Date(Date.UTC(2026, 2, 9));
 * const dateRange = {
 *   start: day,
 *   end:   new Date(Date.UTC(2026, 2, 9, 23, 59, 59, 999)),
 * };
 *
 * // WRONG — on a non-UTC server this silently shifts the range
 * const dateRange = {
 *   start: new Date("2026-03-09T00:00:00"),   // parsed as local time!
 *   end:   new Date("2026-03-09T23:59:59"),
 * };
 * ```
 */
export interface DateRange {
  /** Start of range — must be a UTC Date */
  start: Date;
  /** End of range — must be a UTC Date */
  end: Date;
}

/** Availability rule as stored in the database */
export interface AvailabilityRuleInput {
  rrule: string;
  startTime: string;
  endTime: string;
  timezone: string;
  validFrom?: Date | null;
  validUntil?: Date | null;
}

/** Availability override as stored in the database */
export interface AvailabilityOverrideInput {
  date: Date;
  startTime?: string | null;
  endTime?: string | null;
  isUnavailable: boolean;
}

/** Existing booking for conflict checking */
export interface BookingInput {
  startsAt: Date;
  endsAt: Date;
  status: string;
}

/** Result of isSlotAvailable check */
export type SlotAvailabilityResult =
  | { available: true }
  | {
      available: false;
      reason:
        | "outside_availability"
        | "already_booked"
        | "blocked_date"
        | "buffer_conflict";
    };
