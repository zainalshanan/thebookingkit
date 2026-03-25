import { addMinutes, areIntervalsOverlapping } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { parseRecurrence } from "./rrule-parser.js";
import {
  expandRules,
  applyOverrides,
  generateCandidateSlots,
  formatSlots,
  formatDateOnly,
  formatDateInTimezone,
} from "./slot-pipeline.js";
import { applySlotRelease } from "./slot-release.js";
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
  const rawWindows = expandRules(rules, dateRange);

  // --- Step 2: Mask Layer — Apply overrides ---
  // Use provider's timezone for date comparisons (overrides are local dates)
  const providerTz = rules.length > 0 ? rules[0].timezone : "UTC";
  const maskedWindows = applyOverrides(rawWindows, overrides, providerTz);

  // --- Generate individual slots from windows ---
  const candidateSlots = generateCandidateSlots(maskedWindows, duration, slotInterval);

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

  // --- Step 4B: Slot Release Strategy (opt-in, E-23) ---
  // Applied after conflict filtering, before formatting. When slotRelease is
  // undefined this block is skipped entirely — zero overhead for existing callers.
  let slotsForFormatting = availableSlots;
  let discountMap = new Map<number, number>();

  if (options?.slotRelease) {
    const releaseResult = applySlotRelease(
      availableSlots,
      options.slotRelease,
      existingBookings,
      providerTz,
      now,
    );
    slotsForFormatting = releaseResult.slots;
    discountMap = releaseResult.discountMap;
  }

  // --- Format and sort ---
  const formatted = formatSlots(slotsForFormatting, customerTimezone);

  // Apply discount metadata from discount_incentive strategy (no-op for others)
  if (discountMap.size > 0) {
    for (const slot of formatted) {
      const discount = discountMap.get(new Date(slot.startTime).getTime());
      if (discount !== undefined) {
        slot.releaseMetadata = { discountPercent: discount };
      }
    }
  }

  return formatted;
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
