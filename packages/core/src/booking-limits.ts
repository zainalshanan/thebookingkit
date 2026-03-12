import {
  addMinutes,
  addDays,
} from "date-fns";
import type { BookingInput } from "./types.js";

/** Booking limits configuration (stored as JSON on event_types) */
export interface BookingLimitsConfig {
  /** Maximum bookings per day for this event type */
  maxBookingsPerDay?: number | null;
  /** Maximum bookings per week for this event type */
  maxBookingsPerWeek?: number | null;
  /** Minimum lead time in minutes before a booking can be made */
  minNoticeMinutes?: number | null;
  /** Maximum days in the future a booking can be made */
  maxFutureDays?: number | null;
}

/** Result of checking booking limits */
export interface LimitStatus {
  /** Whether more bookings are allowed */
  canBook: boolean;
  /** Bookings today for this event type */
  dailyCount: number;
  /** Daily limit (null = unlimited) */
  dailyLimit: number | null;
  /** Bookings this week for this event type */
  weeklyCount: number;
  /** Weekly limit (null = unlimited) */
  weeklyLimit: number | null;
  /** Remaining daily capacity (null = unlimited) */
  dailyRemaining: number | null;
  /** Remaining weekly capacity (null = unlimited) */
  weeklyRemaining: number | null;
}

/**
 * Compute booking limit status for a provider's event type on a given date.
 *
 * @param existingBookings - All non-cancelled bookings for this provider + event type
 * @param limits - Booking limits config from the event type
 * @param date - The date to check limits for
 */
export function computeBookingLimits(
  existingBookings: BookingInput[],
  limits: BookingLimitsConfig,
  date: Date,
): LimitStatus {
  const activeBookings = existingBookings.filter(
    (b) => b.status !== "cancelled" && b.status !== "rejected",
  );

  const dateStr = utcDateKey(date);

  const dailyCount = activeBookings.filter(
    (b) => utcDateKey(b.startsAt) === dateStr,
  ).length;

  const weekStr = utcWeekKey(date);
  const weeklyCount = activeBookings.filter(
    (b) => utcWeekKey(b.startsAt) === weekStr,
  ).length;

  const dailyLimit = limits.maxBookingsPerDay ?? null;
  const weeklyLimit = limits.maxBookingsPerWeek ?? null;

  const dailyRemaining = dailyLimit !== null ? Math.max(0, dailyLimit - dailyCount) : null;
  const weeklyRemaining = weeklyLimit !== null ? Math.max(0, weeklyLimit - weeklyCount) : null;

  const canBook =
    (dailyLimit === null || dailyCount < dailyLimit) &&
    (weeklyLimit === null || weeklyCount < weeklyLimit);

  return {
    canBook,
    dailyCount,
    dailyLimit,
    weeklyCount,
    weeklyLimit,
    dailyRemaining,
    weeklyRemaining,
  };
}

/**
 * Filter slots based on booking limits (minimum notice, max future days, daily/weekly caps).
 *
 * @param slots - Candidate slot start times (UTC)
 * @param existingBookings - Active bookings for limit counting
 * @param limits - Booking limits configuration
 * @param now - Current time (for min notice calculation)
 */
export function filterSlotsByLimits(
  slots: Array<{ start: Date; end: Date }>,
  existingBookings: BookingInput[],
  limits: BookingLimitsConfig,
  now: Date = new Date(),
): Array<{ start: Date; end: Date }> {
  const minNotice = limits.minNoticeMinutes ?? 0;
  const maxFutureDays = limits.maxFutureDays ?? null;

  const earliest = addMinutes(now, minNotice);
  const latest = maxFutureDays !== null ? addDays(now, maxFutureDays) : null;

  // Track daily counts as we filter
  const dailyCounts = new Map<string, number>();
  const weeklyCounts = new Map<string, number>();

  // Pre-count existing bookings
  const activeBookings = existingBookings.filter(
    (b) => b.status !== "cancelled" && b.status !== "rejected",
  );

  for (const booking of activeBookings) {
    const dayK = utcDateKey(booking.startsAt);
    dailyCounts.set(dayK, (dailyCounts.get(dayK) ?? 0) + 1);

    const weekK = utcWeekKey(booking.startsAt);
    weeklyCounts.set(weekK, (weeklyCounts.get(weekK) ?? 0) + 1);
  }

  return slots.filter((slot) => {
    // Min notice check
    if (slot.start < earliest) return false;

    // Max future days check
    if (latest && slot.start > latest) return false;

    // Daily limit check
    if (limits.maxBookingsPerDay != null) {
      const dayK = utcDateKey(slot.start);
      const count = dailyCounts.get(dayK) ?? 0;
      if (count >= limits.maxBookingsPerDay) return false;
    }

    // Weekly limit check
    if (limits.maxBookingsPerWeek != null) {
      const weekK = utcWeekKey(slot.start);
      const count = weeklyCounts.get(weekK) ?? 0;
      if (count >= limits.maxBookingsPerWeek) return false;
    }

    // After all checks pass, increment counters so subsequent slots see updated counts
    if (limits.maxBookingsPerDay != null) {
      const dayK = utcDateKey(slot.start);
      dailyCounts.set(dayK, (dailyCounts.get(dayK) ?? 0) + 1);
    }
    if (limits.maxBookingsPerWeek != null) {
      const weekK = utcWeekKey(slot.start);
      weeklyCounts.set(weekK, (weeklyCounts.get(weekK) ?? 0) + 1);
    }

    return true;
  });
}

/** UTC-based date key for consistent day comparison */
function utcDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

/** UTC-based week key (ISO week starting Monday) */
function utcWeekKey(date: Date): string {
  // Get Monday of the week in UTC
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setUTCDate(diff);
  return utcDateKey(d);
}
