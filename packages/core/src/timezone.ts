import { toZonedTime, fromZonedTime, format } from "date-fns-tz";

/**
 * Thrown when an invalid IANA timezone identifier is provided.
 */
export class InvalidTimezoneError extends Error {
  public readonly code = "INVALID_TIMEZONE";

  constructor(timezone: string) {
    super(`Invalid timezone: "${timezone}". Please provide a valid IANA timezone identifier (e.g., "America/New_York").`);
    this.name = "InvalidTimezoneError";
  }
}

/**
 * Validate that a string is a valid IANA timezone identifier.
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a local datetime to UTC, handling DST transitions.
 *
 * - Spring-forward gap: adjusts to the next valid time.
 * - Fall-back ambiguity: defaults to the first occurrence (standard time).
 *
 * @param localTime - A datetime string in ISO format (e.g., "2026-03-08T10:00:00")
 * @param timezone - IANA timezone identifier (e.g., "America/New_York")
 * @returns UTC ISO-8601 datetime string
 */
export function normalizeToUTC(localTime: string, timezone: string): string {
  if (!isValidTimezone(timezone)) {
    throw new InvalidTimezoneError(timezone);
  }

  // fromZonedTime interprets the input as being in the given timezone
  // and returns a UTC Date
  const utcDate = fromZonedTime(localTime, timezone);
  return utcDate.toISOString();
}

/**
 * Convert a UTC datetime to a local datetime string in the given timezone.
 *
 * @param utcTime - A Date object or ISO string in UTC
 * @param timezone - IANA timezone identifier
 * @returns Formatted local datetime string (e.g., "2026-03-08T10:00:00")
 */
export function utcToLocal(utcTime: Date | string, timezone: string): string {
  if (!isValidTimezone(timezone)) {
    throw new InvalidTimezoneError(timezone);
  }

  const date = typeof utcTime === "string" ? new Date(utcTime) : utcTime;
  const zonedDate = toZonedTime(date, timezone);
  return format(zonedDate, "yyyy-MM-dd'T'HH:mm:ss", { timeZone: timezone });
}

/**
 * Get the UTC offset string for a timezone at a specific time
 * (e.g., "-05:00" for EST, "-04:00" for EDT).
 */
export function getTimezoneOffset(timezone: string, date: Date): string {
  if (!isValidTimezone(timezone)) {
    throw new InvalidTimezoneError(timezone);
  }
  return format(toZonedTime(date, timezone), "xxx", { timeZone: timezone });
}
