import { fromZonedTime, toZonedTime, format } from "date-fns-tz";
import { addMinutes, isWithinInterval, areIntervalsOverlapping } from "date-fns";
import { parseRecurrence } from "./rrule-parser.js";
import type {
  Slot,
  DateRange,
  AvailabilityRuleInput,
  AvailabilityOverrideInput,
  BookingInput,
  SlotComputeOptions,
  SlotAvailabilityResult,
} from "./types.js";

/**
 * Core slot computation pipeline (three-step model).
 *
 * 1. **Base Layer:** Expand availability_rules via RRULE into time windows.
 * 2. **Mask Layer:** Apply availability_overrides (blocked days, extra hours).
 * 3. **Filter Layer:** Subtract existing bookings, apply buffer time.
 *
 * @param rules - Provider's availability rules from the database
 * @param overrides - Provider's availability overrides from the database
 * @param existingBookings - Non-cancelled bookings for the provider in the date range
 * @param dateRange - The date range to compute slots for. Both `start` and `end`
 *   **must be UTC** Date objects (use `new Date("...Z")` or `Date.UTC()`).
 *   Passing local-time dates on a non-UTC server will shift the RRULE boundary.
 * @param customerTimezone - Customer's IANA timezone for localStart/localEnd formatting
 * @param options - Slot duration, buffer, and interval configuration
 * @returns Sorted array of available slots
 */
export function getAvailableSlots(
  rules: AvailabilityRuleInput[],
  overrides: AvailabilityOverrideInput[],
  existingBookings: BookingInput[],
  dateRange: DateRange,
  customerTimezone: string,
  options?: SlotComputeOptions,
): Slot[] {
  const duration = options?.duration ?? 30;
  const bufferBefore = options?.bufferBefore ?? 0;
  const bufferAfter = options?.bufferAfter ?? 0;
  const slotInterval = options?.slotInterval ?? duration;
  // C2 fix: capture "now" once so the filter is deterministic within a single
  // call. Callers can inject a stable value via options.now for testing or SSR.
  const now = options?.now ?? new Date();

  // --- Step 1: Base Layer — Expand RRULE into raw time windows ---
  const rawWindows: Array<{ start: Date; end: Date }> = [];

  for (const rule of rules) {
    // Check validity period
    if (rule.validFrom && dateRange.end < rule.validFrom) continue;
    if (rule.validUntil && dateRange.start > rule.validUntil) continue;

    const occurrences = parseRecurrence(rule.rrule, dateRange, rule.startTime, rule.endTime);

    for (const occ of occurrences) {
      // Convert local times to UTC using the rule's timezone
      const startLocal = `${occ.date}T${occ.startTime}:00`;
      const endLocal = `${occ.date}T${occ.endTime}:00`;

      const windowStart = fromZonedTime(startLocal, rule.timezone);
      let windowEnd = fromZonedTime(endLocal, rule.timezone);

      // C1 fix: if the end time is on the same calendar day as the start time
      // but numerically earlier (e.g. 22:00 -> 02:00), the window crosses
      // midnight. Advance windowEnd by 24 hours so the slot loop terminates
      // correctly instead of producing zero slots.
      if (windowEnd <= windowStart) {
        windowEnd = addMinutes(windowEnd, 24 * 60);
      }

      rawWindows.push({ start: windowStart, end: windowEnd });
    }
  }

  // --- Step 2: Mask Layer — Apply overrides ---
  // Use provider's timezone for date comparisons (overrides are local dates)
  const providerTz = rules.length > 0 ? rules[0].timezone : "UTC";
  let maskedWindows = [...rawWindows];

  for (const override of overrides) {
    const overrideDate = formatDateOnly(override.date);

    if (override.isUnavailable) {
      // Remove all windows whose start falls on this local date
      maskedWindows = maskedWindows.filter(
        (w) => formatDateInTimezone(w.start, providerTz) !== overrideDate,
      );
    } else if (override.startTime && override.endTime) {
      // First remove existing windows on this local date
      maskedWindows = maskedWindows.filter(
        (w) => formatDateInTimezone(w.start, providerTz) !== overrideDate,
      );

      // Then add the override window
      const startLocal = `${overrideDate}T${override.startTime}:00`;
      const endLocal = `${overrideDate}T${override.endTime}:00`;

      maskedWindows.push({
        start: fromZonedTime(startLocal, providerTz),
        end: fromZonedTime(endLocal, providerTz),
      });
    }
  }

  // --- Generate individual slots from windows ---
  const candidateSlots: Array<{ start: Date; end: Date }> = [];

  for (const window of maskedWindows) {
    let slotStart = window.start;

    while (true) {
      const slotEnd = addMinutes(slotStart, duration);
      if (slotEnd > window.end) break;

      candidateSlots.push({ start: slotStart, end: slotEnd });
      slotStart = addMinutes(slotStart, slotInterval);
    }
  }

  // --- Step 3: Filter Layer — Subtract bookings + buffer ---
  const activeBookings = existingBookings.filter(
    (b) => b.status !== "cancelled" && b.status !== "rejected",
  );

  const availableSlots = candidateSlots.filter((slot) => {
    // Check each booking for overlap (including buffer)
    for (const booking of activeBookings) {
      const bookingStartWithBuffer = addMinutes(booking.startsAt, -bufferBefore);
      const bookingEndWithBuffer = addMinutes(booking.endsAt, bufferAfter);

      if (
        areIntervalsOverlapping(
          { start: slot.start, end: slot.end },
          { start: bookingStartWithBuffer, end: bookingEndWithBuffer },
        )
      ) {
        return false;
      }
    }

    // Filter out slots whose end time is already in the past.
    // Using slot.end < now (strict less-than) rather than slot.start <= now so
    // that a slot still in progress (started but not yet ended) remains
    // bookable. (C2: `now` is captured once above — not re-evaluated per slot)
    if (slot.end < now) return false;

    return true;
  });

  // --- Format and sort ---
  return availableSlots
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((slot) => ({
      startTime: slot.start.toISOString(),
      endTime: slot.end.toISOString(),
      localStart: formatInTimezone(slot.start, customerTimezone),
      localEnd: formatInTimezone(slot.end, customerTimezone),
    }));
}

/**
 * Quick check for a single slot's availability.
 *
 * @param rules - Provider's availability rules
 * @param overrides - Provider's availability overrides
 * @param existingBookings - Non-cancelled bookings for the provider
 * @param startTime - Slot start time (UTC Date)
 * @param endTime - Slot end time (UTC Date)
 * @param bufferBefore - Buffer time before in minutes
 * @param bufferAfter - Buffer time after in minutes
 */
export function isSlotAvailable(
  rules: AvailabilityRuleInput[],
  overrides: AvailabilityOverrideInput[],
  existingBookings: BookingInput[],
  startTime: Date,
  endTime: Date,
  bufferBefore = 0,
  bufferAfter = 0,
): SlotAvailabilityResult {
  // Check overrides first (blocked dates)
  // Use provider timezone for local date comparison
  const isSlotProviderTz = rules.length > 0 ? rules[0].timezone : "UTC";
  const slotDateStr = formatDateInTimezone(startTime, isSlotProviderTz);
  for (const override of overrides) {
    if (override.isUnavailable && formatDateOnly(override.date) === slotDateStr) {
      return { available: false, reason: "blocked_date" };
    }
  }

  // Check if slot falls within any availability window
  let withinAvailability = false;

  for (const rule of rules) {
    if (rule.validFrom && startTime < rule.validFrom) continue;
    if (rule.validUntil && startTime > rule.validUntil) continue;

    const dateRange: DateRange = {
      start: new Date(startTime.getTime() - 24 * 60 * 60 * 1000),
      end: new Date(startTime.getTime() + 24 * 60 * 60 * 1000),
    };

    const occurrences = parseRecurrence(rule.rrule, dateRange, rule.startTime, rule.endTime);

    for (const occ of occurrences) {
      const windowStart = fromZonedTime(`${occ.date}T${occ.startTime}:00`, rule.timezone);
      let windowEnd = fromZonedTime(`${occ.date}T${occ.endTime}:00`, rule.timezone);

      // C1 fix: same midnight-crossing correction as in getAvailableSlots
      if (windowEnd <= windowStart) {
        windowEnd = addMinutes(windowEnd, 24 * 60);
      }

      if (startTime >= windowStart && endTime <= windowEnd) {
        withinAvailability = true;
        break;
      }
    }
    if (withinAvailability) break;
  }

  // Check overrides that provide alternative hours
  if (!withinAvailability) {
    for (const override of overrides) {
      if (
        !override.isUnavailable &&
        override.startTime &&
        override.endTime &&
        formatDateOnly(override.date) === slotDateStr
      ) {
        const windowStart = fromZonedTime(`${slotDateStr}T${override.startTime}:00`, isSlotProviderTz);
        const windowEnd = fromZonedTime(`${slotDateStr}T${override.endTime}:00`, isSlotProviderTz);

        if (startTime >= windowStart && endTime <= windowEnd) {
          withinAvailability = true;
          break;
        }
      }
    }
  }

  if (!withinAvailability) {
    return { available: false, reason: "outside_availability" };
  }

  // Check booking conflicts
  const activeBookings = existingBookings.filter(
    (b) => b.status !== "cancelled" && b.status !== "rejected",
  );

  for (const booking of activeBookings) {
    const bookingStartWithBuffer = addMinutes(booking.startsAt, -bufferBefore);
    const bookingEndWithBuffer = addMinutes(booking.endsAt, bufferAfter);

    if (
      areIntervalsOverlapping(
        { start: startTime, end: endTime },
        { start: bookingStartWithBuffer, end: bookingEndWithBuffer },
      )
    ) {
      // Determine if it's directly booked or a buffer conflict
      if (
        areIntervalsOverlapping(
          { start: startTime, end: endTime },
          { start: booking.startsAt, end: booking.endsAt },
        )
      ) {
        return { available: false, reason: "already_booked" };
      }
      return { available: false, reason: "buffer_conflict" };
    }
  }

  return { available: true };
}

/** Format a Date as YYYY-MM-DD in UTC (used for override.date which is already a local date) */
function formatDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format a UTC Date as YYYY-MM-DD in a specific timezone */
function formatDateInTimezone(date: Date, timezone: string): string {
  const zonedDate = toZonedTime(date, timezone);
  return format(zonedDate, "yyyy-MM-dd", { timeZone: timezone });
}

/** Format a UTC Date in the given timezone */
function formatInTimezone(date: Date, timezone: string): string {
  const zonedDate = toZonedTime(date, timezone);
  return format(zonedDate, "yyyy-MM-dd'T'HH:mm:ss", { timeZone: timezone });
}
