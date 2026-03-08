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
 * @param dateRange - The date range to compute slots for
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
      const windowEnd = fromZonedTime(endLocal, rule.timezone);

      rawWindows.push({ start: windowStart, end: windowEnd });
    }
  }

  // --- Step 2: Mask Layer — Apply overrides ---
  let maskedWindows = [...rawWindows];

  for (const override of overrides) {
    const overrideDate = formatDateOnly(override.date);

    if (override.isUnavailable) {
      // Remove all windows on this date
      maskedWindows = maskedWindows.filter(
        (w) => formatDateOnly(w.start) !== overrideDate,
      );
    } else if (override.startTime && override.endTime) {
      // First remove existing windows on this date
      maskedWindows = maskedWindows.filter(
        (w) => formatDateOnly(w.start) !== overrideDate,
      );

      // Then add the override window
      // We need a timezone for the override — use the first rule's timezone as reference
      const tz = rules.length > 0 ? rules[0].timezone : "UTC";
      const startLocal = `${overrideDate}T${override.startTime}:00`;
      const endLocal = `${overrideDate}T${override.endTime}:00`;

      maskedWindows.push({
        start: fromZonedTime(startLocal, tz),
        end: fromZonedTime(endLocal, tz),
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

    // Filter out slots in the past
    if (slot.start <= new Date()) return false;

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
  const slotDateStr = formatDateOnly(startTime);
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
      const windowEnd = fromZonedTime(`${occ.date}T${occ.endTime}:00`, rule.timezone);

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
        const tz = rules.length > 0 ? rules[0].timezone : "UTC";
        const windowStart = fromZonedTime(`${slotDateStr}T${override.startTime}:00`, tz);
        const windowEnd = fromZonedTime(`${slotDateStr}T${override.endTime}:00`, tz);

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

/** Format a Date as YYYY-MM-DD in UTC */
function formatDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format a UTC Date in the given timezone */
function formatInTimezone(date: Date, timezone: string): string {
  const zonedDate = toZonedTime(date, timezone);
  return format(zonedDate, "yyyy-MM-dd'T'HH:mm:ss", { timeZone: timezone });
}
