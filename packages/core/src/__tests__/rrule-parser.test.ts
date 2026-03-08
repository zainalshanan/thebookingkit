import { describe, it, expect } from "vitest";
import { parseRecurrence, InvalidRRuleError } from "../index.js";

describe("parseRecurrence", () => {
  const dateRange = {
    start: new Date("2026-03-02T00:00:00Z"), // Monday
    end: new Date("2026-03-08T23:59:59Z"),   // Sunday
  };

  it("expands FREQ=WEEKLY;BYDAY=MO,WE,FR for a week", () => {
    const result = parseRecurrence(
      "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      dateRange,
      "09:00",
      "17:00",
    );

    expect(result).toHaveLength(3);
    expect(result[0].date).toBe("2026-03-02"); // Monday
    expect(result[1].date).toBe("2026-03-04"); // Wednesday
    expect(result[2].date).toBe("2026-03-06"); // Friday
    expect(result[0].startTime).toBe("09:00");
    expect(result[0].endTime).toBe("17:00");
  });

  it("expands weekday schedule (MO-FR)", () => {
    const result = parseRecurrence(
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      dateRange,
      "09:00",
      "17:00",
    );

    expect(result).toHaveLength(5);
  });

  it("handles UNTIL termination", () => {
    const result = parseRecurrence(
      "FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20260304T235959Z",
      dateRange,
      "09:00",
      "17:00",
    );

    // Only Monday and Wednesday (before UNTIL)
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("handles COUNT termination", () => {
    const result = parseRecurrence(
      "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=2",
      dateRange,
      "09:00",
      "17:00",
    );

    expect(result).toHaveLength(2);
  });

  it("handles EXDATE exclusions", () => {
    const rruleWithExdate = [
      "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      "EXDATE:20260304T000000Z", // Exclude Wednesday
    ].join("\n");

    const result = parseRecurrence(rruleWithExdate, dateRange, "09:00", "17:00");

    const dates = result.map((r) => r.date);
    expect(dates).toContain("2026-03-02"); // Monday
    expect(dates).not.toContain("2026-03-04"); // Wednesday excluded
    expect(dates).toContain("2026-03-06"); // Friday
  });

  it("handles daily frequency", () => {
    const result = parseRecurrence(
      "FREQ=DAILY",
      dateRange,
      "10:00",
      "12:00",
    );

    expect(result).toHaveLength(7); // Every day of the week
  });

  it("handles INTERVAL=2 (biweekly)", () => {
    const twoWeekRange = {
      start: new Date("2026-03-02T00:00:00Z"),
      end: new Date("2026-03-15T23:59:59Z"),
    };

    const result = parseRecurrence(
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO",
      twoWeekRange,
      "09:00",
      "17:00",
    );

    expect(result).toHaveLength(1); // Only every other Monday
  });

  it("returns empty array for date range with no occurrences", () => {
    const emptyRange = {
      start: new Date("2026-12-25T00:00:00Z"), // Thursday
      end: new Date("2026-12-25T23:59:59Z"),
    };

    const result = parseRecurrence(
      "FREQ=WEEKLY;BYDAY=MO",
      emptyRange,
      "09:00",
      "17:00",
    );

    expect(result).toHaveLength(0);
  });

  it("handles RRULE: prefix gracefully", () => {
    const result = parseRecurrence(
      "RRULE:FREQ=WEEKLY;BYDAY=MO",
      dateRange,
      "09:00",
      "17:00",
    );

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-03-02");
  });

  it("throws InvalidRRuleError for malformed strings", () => {
    expect(() =>
      parseRecurrence("INVALID_GARBAGE", dateRange, "09:00", "17:00"),
    ).toThrow(InvalidRRuleError);
  });

  it("handles multiple EXDATE values", () => {
    const rruleWithMultipleExdates = [
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      "EXDATE:20260302T000000Z,20260304T000000Z",
    ].join("\n");

    const result = parseRecurrence(rruleWithMultipleExdates, dateRange, "09:00", "17:00");

    const dates = result.map((r) => r.date);
    expect(dates).not.toContain("2026-03-02");
    expect(dates).not.toContain("2026-03-04");
    expect(dates).toContain("2026-03-03");
    expect(dates).toContain("2026-03-05");
    expect(dates).toContain("2026-03-06");
  });
});
