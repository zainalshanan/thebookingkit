import { fromZonedTime } from "date-fns-tz";

/**
 * Get the next weekday (skipping Sundays) offset from today.
 *
 * @param offset - Number of days to add to today before finding the next non-Sunday
 * @returns A Date representing the next non-Sunday service day
 */
export function getNextServiceDay(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Create a UTC Date from a local Eastern Time hour/minute on a given day.
 * Uses proper timezone conversion instead of hardcoded EST offset.
 *
 * @param day - The calendar date to use
 * @param hour - Hour in Eastern Time (0-23)
 * @param minute - Minute (0-59)
 * @returns A UTC Date equivalent to the given Eastern local time
 */
export function makeET(day: Date, hour: number, minute: number): Date {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const d = String(day.getDate()).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  const min = String(minute).padStart(2, "0");
  return fromZonedTime(`${y}-${m}-${d}T${h}:${min}:00`, "America/New_York");
}

/**
 * Build a UTC day range from a date ISO string (for server actions).
 *
 * @param dateISO - An ISO date string (e.g. "2026-03-25" or a full ISO-8601 string)
 * @returns An object with `start` set to 00:00:00.000 UTC and `end` to 23:59:59.999 UTC
 */
export function buildDayRange(dateISO: string): { start: Date; end: Date } {
  const start = new Date(dateISO);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(dateISO);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}
