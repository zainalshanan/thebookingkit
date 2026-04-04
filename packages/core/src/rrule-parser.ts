import { RRule, RRuleSet } from "rrule";
import type { DateOccurrence, DateRange } from "./types.js";

/**
 * Thrown when an RRULE string is malformed or cannot be parsed.
 */
export class InvalidRRuleError extends Error {
  public readonly code = "INVALID_RRULE";

  constructor(rruleString: string, cause?: unknown) {
    super(`Invalid RRULE string: "${rruleString}". Please provide a valid RFC 5545 RRULE.`);
    this.name = "InvalidRRuleError";
    this.cause = cause;
  }
}

/**
 * Parse an RRULE string and expand it into concrete date occurrences
 * within the given date range.
 *
 * @param rruleString - An RFC 5545 RRULE string (e.g., "FREQ=WEEKLY;BYDAY=MO,WE,FR")
 * @param dateRange - The range to expand occurrences within. Must use UTC Date
 *   objects — `dateRange.start` is used as RRULE `dtstart` which determines
 *   the time-of-day reference for occurrence generation
 * @param startTime - The start time for each occurrence (HH:mm)
 * @param endTime - The end time for each occurrence (HH:mm)
 * @returns Array of date occurrences
 */
export function parseRecurrence(
  rruleString: string,
  dateRange: DateRange,
  startTime: string,
  endTime: string,
): DateOccurrence[] {
  // Guard against excessively long RRULE strings (DoS prevention)
  if (rruleString.length > 10_000) {
    throw new InvalidRRuleError(rruleString.slice(0, 100) + "...");
  }

  let ruleSet: RRuleSet;

  try {
    ruleSet = new RRuleSet();

    // Check if the rruleString contains EXDATE lines
    const lines = rruleString.split("\n").map((l) => l.trim()).filter(Boolean);
    let mainRuleLine = "";
    const exdates: string[] = [];

    for (const line of lines) {
      if (line.startsWith("EXDATE")) {
        // Parse EXDATE values
        const value = line.split(":")[1];
        if (value) {
          exdates.push(...value.split(",").map((d) => d.trim()));
        }
      } else {
        // This is the RRULE line (may or may not have the "RRULE:" prefix)
        mainRuleLine = line.startsWith("RRULE:") ? line.slice(6) : line;
      }
    }

    if (!mainRuleLine) {
      mainRuleLine = rruleString.startsWith("RRULE:")
        ? rruleString.slice(6)
        : rruleString;
    }

    const rule = RRule.fromString(mainRuleLine);

    // C3 fix: when the rule carries an explicit BYDAY (byweekday) constraint,
    // anchoring dtstart on dateRange.start is safe — the BYDAY filter will
    // select the correct day of week regardless of what day dateRange.start
    // falls on. But when there is NO byweekday, the RRULE engine inherits the
    // day-of-week from dtstart itself (e.g. FREQ=WEEKLY without BYDAY recurs
    // on the same weekday as dtstart). Overriding dtstart with dateRange.start
    // then shifts occurrences to whatever weekday the query window begins on.
    // Fix: for rules without an explicit byweekday, fall back to the rule's
    // own dtstart if present, otherwise use a well-known Monday epoch so that
    // FREQ=WEEKLY always anchors on Monday in a predictable way.
    const hasExplicitByDay = rule.origOptions.byweekday != null;
    const dtstart = hasExplicitByDay
      ? dateRange.start
      : (rule.origOptions.dtstart ?? new Date("2024-01-01T00:00:00Z"));

    ruleSet.rrule(
      new RRule({
        ...rule.origOptions,
        dtstart,
      }),
    );

    // Add exclusion dates
    for (const exdate of exdates) {
      ruleSet.exdate(parseICalDate(exdate));
    }
  } catch (error) {
    throw new InvalidRRuleError(rruleString, error);
  }

  const occurrences = ruleSet.between(dateRange.start, dateRange.end, true);

  return occurrences.map((date) => ({
    date: formatDateStr(date),
    startTime,
    endTime,
  }));
}

/** Format a Date to YYYY-MM-DD using UTC components (identical to formatDateOnly in slot-pipeline) */
function formatDateStr(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse iCalendar date format (e.g., "20260304T000000Z") to a Date */
function parseICalDate(dateStr: string): Date {
  // Handle iCalendar basic format: YYYYMMDDTHHmmssZ
  const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (match) {
    const [, y, mo, d, h, mi, s] = match;
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  }
  // Fallback to native Date parsing
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Cannot parse EXDATE value: "${dateStr}"`);
  }
  return date;
}

