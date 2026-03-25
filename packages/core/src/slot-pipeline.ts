/**
 * @internal
 * Shared pipeline utilities for slot computation.
 *
 * This module is NOT part of the public API and is not exported from index.ts.
 * It contains the three logical stages of the slot computation pipeline plus
 * the private date-formatting helpers that both slot-engine stages depend on.
 *
 * Pipeline stages
 * ---------------
 * 1. expandRules      — Base Layer:  expand availability_rules via RRULE into
 *                       raw UTC time windows.
 * 2. applyOverrides   — Mask Layer:  block or replace windows using
 *                       availability_overrides.
 * 3. generateCandidateSlots — chop windows into fixed-duration slot candidates.
 * 4. formatSlots      — sort the candidate array and project each slot into
 *                       the customer's local timezone.
 */

import { fromZonedTime, toZonedTime, format } from "date-fns-tz";
import { addMinutes } from "date-fns";
import { parseRecurrence } from "./rrule-parser.js";
import type {
  Slot,
  DateRange,
  AvailabilityRuleInput,
  AvailabilityOverrideInput,
} from "./types.js";

// ---------------------------------------------------------------------------
// Date-formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date as YYYY-MM-DD in UTC.
 *
 * Override dates are stored as UTC midnight values that represent a local
 * calendar date, so reading their UTC components directly is correct.
 *
 * @param date - A Date whose UTC components represent the target calendar date
 * @returns The date formatted as "YYYY-MM-DD"
 */
export function formatDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Project a UTC Date into `timezone` and return the calendar date portion.
 *
 * Used to match a UTC window boundary against a provider-local override date.
 *
 * @param date - A UTC Date
 * @param timezone - IANA timezone string (e.g. "America/New_York")
 * @returns The calendar date in that timezone, formatted as "YYYY-MM-DD"
 */
export function formatDateInTimezone(date: Date, timezone: string): string {
  const zonedDate = toZonedTime(date, timezone);
  return format(zonedDate, "yyyy-MM-dd", { timeZone: timezone });
}

/**
 * Project a UTC Date into `timezone` and return a local datetime string.
 *
 * The returned string is intentionally without a timezone suffix so that
 * the caller controls how the value is interpreted (typically for display).
 *
 * @param date - A UTC Date
 * @param timezone - IANA timezone string (e.g. "America/New_York")
 * @returns The datetime formatted as "YYYY-MM-DD'T'HH:mm:ss" in that timezone
 */
export function formatInTimezone(date: Date, timezone: string): string {
  const zonedDate = toZonedTime(date, timezone);
  return format(zonedDate, "yyyy-MM-dd'T'HH:mm:ss", { timeZone: timezone });
}

// ---------------------------------------------------------------------------
// Pipeline stage 1 — Base Layer
// ---------------------------------------------------------------------------

/**
 * Expand a set of availability rules into raw UTC time windows for the given
 * date range (Step 1 of the three-step slot computation pipeline).
 *
 * Each rule's RRULE string is expanded via `parseRecurrence`. The resulting
 * occurrence dates and times are converted from the rule's local timezone to
 * UTC.  Midnight-crossing windows (e.g. 22:00 → 02:00) are handled by
 * advancing `windowEnd` by 24 hours when it would otherwise be ≤ `windowStart`
 * (the C1 fix).
 *
 * @param rules - Provider's availability rules from the database
 * @param dateRange - UTC date range to expand rules within
 * @returns Array of UTC `{ start, end }` windows, one per RRULE occurrence
 */
export function expandRules(
  rules: AvailabilityRuleInput[],
  dateRange: DateRange,
): Array<{ start: Date; end: Date }> {
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

  return rawWindows;
}

// ---------------------------------------------------------------------------
// Pipeline stage 2 — Mask Layer
// ---------------------------------------------------------------------------

/**
 * Apply availability overrides to a set of raw time windows (Step 2 of the
 * three-step slot computation pipeline).
 *
 * For each override:
 * - `isUnavailable === true` — all windows whose provider-local start date
 *   matches the override date are removed.
 * - `isUnavailable === false` with `startTime`/`endTime` present — windows on
 *   that date are first removed, then a replacement window built from the
 *   override hours is added.
 *
 * @param windows - Raw UTC time windows produced by `expandRules`
 * @param overrides - Provider's availability overrides from the database
 * @param providerTz - Provider's IANA timezone (used for local date comparison)
 * @returns Updated array of UTC `{ start, end }` windows after masking
 */
export function applyOverrides(
  windows: Array<{ start: Date; end: Date }>,
  overrides: AvailabilityOverrideInput[],
  providerTz: string,
): Array<{ start: Date; end: Date }> {
  let maskedWindows = [...windows];

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

  return maskedWindows;
}

// ---------------------------------------------------------------------------
// Pipeline stage 3 — Candidate slot generation
// ---------------------------------------------------------------------------

/**
 * Chop a set of UTC time windows into fixed-duration slot candidates.
 *
 * Each window is subdivided starting from `window.start`. A new slot is
 * emitted at every `slotInterval` minutes as long as the slot's end time does
 * not exceed `window.end`.
 *
 * @param windows - Masked UTC time windows from `applyOverrides`
 * @param duration - Slot duration in minutes
 * @param slotInterval - Step between slot start times in minutes (≤ duration
 *   for overlapping slots, equal for back-to-back, greater for gaps)
 * @returns Array of candidate `{ start, end }` UTC slots (unfiltered)
 */
export function generateCandidateSlots(
  windows: Array<{ start: Date; end: Date }>,
  duration: number,
  slotInterval: number,
): Array<{ start: Date; end: Date }> {
  const candidateSlots: Array<{ start: Date; end: Date }> = [];

  for (const window of windows) {
    let slotStart = window.start;

    while (true) {
      const slotEnd = addMinutes(slotStart, duration);
      if (slotEnd > window.end) break;

      candidateSlots.push({ start: slotStart, end: slotEnd });
      slotStart = addMinutes(slotStart, slotInterval);
    }
  }

  return candidateSlots;
}

// ---------------------------------------------------------------------------
// Pipeline stage 4 — Format and sort
// ---------------------------------------------------------------------------

/**
 * Sort candidate slots by start time and project each one into the customer's
 * local timezone to produce the final `Slot[]` output.
 *
 * @param slots - Array of UTC `{ start, end }` candidate slots that have
 *   already passed the Filter Layer (Step 3) in slot-engine.ts
 * @param customerTimezone - Customer's IANA timezone for `localStart`/`localEnd`
 * @returns Sorted array of {@link Slot} objects ready for API consumption
 */
export function formatSlots(
  slots: Array<{ start: Date; end: Date }>,
  customerTimezone: string,
): Slot[] {
  return slots
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((slot) => ({
      startTime: slot.start.toISOString(),
      endTime: slot.end.toISOString(),
      localStart: formatInTimezone(slot.start, customerTimezone),
      localEnd: formatInTimezone(slot.end, customerTimezone),
    }));
}
