/**
 * Schedule adapter — converts JSON WeeklySchedule objects (as stored in
 * Cloudflare D1 / SQLite text columns) into `AvailabilityRuleInput[]` arrays
 * for `@thebookingkit/core`'s slot engine.
 *
 * This logic was originally hand-written in `forza-barber-v2/src/lib/thebookingkit-adapter.ts`.
 * Moving it into `@thebookingkit/d1` makes it reusable for any D1-backed booking
 * system that stores schedules as day-of-week JSON blobs rather than
 * normalised RRULE rows.
 */

import type { AvailabilityRuleInput } from "@thebookingkit/core";

/** Day of week keys as used in WeeklySchedule. */
export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/**
 * A single day's schedule window.
 * `isOff: true` means the provider/location is closed that day.
 * When `isOff` is false, `startTime` and `endTime` are required.
 */
export interface DaySchedule {
  /** Wall-clock start time in "HH:mm" format, or null when isOff is true */
  startTime: string | null;
  /** Wall-clock end time in "HH:mm" format, or null when isOff is true */
  endTime: string | null;
  /** True means the provider is closed for the full day */
  isOff: boolean;
}

/**
 * A weekly schedule map indexed by day name.
 * This matches the `WeeklySchedule` type in forza-barber-v2 and can be used
 * directly with the Drizzle `json` column type.
 */
export type WeeklySchedule = Record<DayOfWeek, DaySchedule>;

/** RRULE day abbreviations keyed by day-of-week name. */
const DAY_TO_RRULE: Record<DayOfWeek, string> = {
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA",
  sunday: "SU",
};

const ALL_DAYS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/**
 * Convert a `WeeklySchedule` JSON value into `AvailabilityRuleInput[]`.
 *
 * Days that share the same `startTime`/`endTime` pair are grouped into a
 * single `FREQ=WEEKLY;BYDAY=...` rule to minimise RRULE expansion cost.
 *
 * @param schedule - The weekly schedule object, or null/undefined (returns []).
 * @param timezone - IANA timezone identifier for the provider/location.
 * @returns Array of AvailabilityRuleInput ready for `getAvailableSlots()`.
 *
 * @example
 * ```ts
 * // Barber is Mon-Fri 09:00-17:00, Sat 10:00-15:00
 * const rules = weeklyScheduleToRules(barber.weeklySchedule, "Australia/Sydney");
 * ```
 */
export function weeklyScheduleToRules(
  schedule: WeeklySchedule | null | undefined,
  timezone: string,
): AvailabilityRuleInput[] {
  if (!schedule) return [];

  // Group days with identical time windows into one RRULE each.
  const groups = new Map<string, DayOfWeek[]>();

  for (const day of ALL_DAYS) {
    const hours = schedule[day];
    if (!hours || hours.isOff || !hours.startTime || !hours.endTime) continue;

    // Normalize single-digit hours: "9:00" → "09:00"
    const startTime = normalizeTime(hours.startTime);
    const endTime = normalizeTime(hours.endTime);

    // Validate HH:mm format
    if (!isHHmm(startTime) || !isHHmm(endTime)) continue;

    if (startTime >= endTime) {
      throw new RangeError(
        `weeklyScheduleToRules: inverted time window for "${day}" — startTime "${startTime}" is not before endTime "${endTime}".`,
      );
    }

    const key = `${startTime}|${endTime}`;
    const existing = groups.get(key) ?? [];
    existing.push(day);
    groups.set(key, existing);
  }

  const rules: AvailabilityRuleInput[] = [];

  for (const [timeKey, days] of groups) {
    const [startTime, endTime] = timeKey.split("|");
    const byDay = days.map((d) => DAY_TO_RRULE[d]).join(",");

    rules.push({
      rrule: `RRULE:FREQ=WEEKLY;BYDAY=${byDay}`,
      startTime,
      endTime,
      timezone,
    });
  }

  return rules;
}

/**
 * Compute the intersection of two `WeeklySchedule` objects (e.g. a barber's
 * personal hours intersected with the location's operating hours) and convert
 * the result into `AvailabilityRuleInput[]`.
 *
 * For each day the effective window is: latest(start) to earliest(end).
 * If the intersection is empty for a day that day is treated as closed.
 *
 * @param scheduleA - First schedule (e.g. provider/barber schedule).
 * @param scheduleB - Second schedule (e.g. location/venue schedule).
 * @param timezone - IANA timezone for both schedules.
 * @returns Merged AvailabilityRuleInput[] covering the intersection.
 *
 * @example
 * ```ts
 * const rules = intersectSchedulesToRules(
 *   barber.weeklySchedule,
 *   location.weeklySchedule,
 *   location.timezone,
 * );
 * ```
 */
export function intersectSchedulesToRules(
  scheduleA: WeeklySchedule | null | undefined,
  scheduleB: WeeklySchedule | null | undefined,
  timezone: string,
): AvailabilityRuleInput[] {
  // If either schedule is missing, fall back to whichever is present
  if (!scheduleA || !scheduleB) {
    return weeklyScheduleToRules(scheduleA ?? scheduleB, timezone);
  }

  const effective: Partial<WeeklySchedule> = {};

  for (const day of ALL_DAYS) {
    const a = scheduleA[day];
    const b = scheduleB[day];

    // Either closed → intersection is closed
    if (
      !a || a.isOff || !a.startTime || !a.endTime ||
      !b || b.isOff || !b.startTime || !b.endTime
    ) {
      effective[day] = { startTime: null, endTime: null, isOff: true };
      continue;
    }

    // Intersection: latest start, earliest end
    const start = a.startTime > b.startTime ? a.startTime : b.startTime;
    const end = a.endTime < b.endTime ? a.endTime : b.endTime;

    if (start >= end) {
      effective[day] = { startTime: null, endTime: null, isOff: true };
    } else {
      effective[day] = { startTime: start, endTime: end, isOff: false };
    }
  }

  return weeklyScheduleToRules(effective as WeeklySchedule, timezone);
}

/** Normalize single-digit hours to two digits: "9:00" → "09:00". */
function normalizeTime(value: string): string {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/** Validate "HH:mm" time format with range-checked hours and minutes. */
function isHHmm(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
