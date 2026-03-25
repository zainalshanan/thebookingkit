import { describe, it, expect } from "vitest";
import {
  generateOccurrences,
  checkRecurringAvailability,
  cancelFutureOccurrences,
  isValidFrequency,
  RecurringBookingError,
  type RecurringSeriesInput,
  type SeriesBooking,
} from "../recurring-bookings.js";
import type { BookingInput } from "../types.js";

// ---------------------------------------------------------------------------
// generateOccurrences
// ---------------------------------------------------------------------------

describe("generateOccurrences", () => {
  const baseInput: RecurringSeriesInput = {
    startsAt: new Date("2026-03-15T14:00:00Z"),
    durationMinutes: 30,
    frequency: "weekly",
    count: 4,
  };

  it("generates correct number of weekly occurrences", () => {
    const occs = generateOccurrences(baseInput);
    expect(occs).toHaveLength(4);
  });

  it("first occurrence matches the start date", () => {
    const occs = generateOccurrences(baseInput);
    expect(occs[0].startsAt.toISOString()).toBe("2026-03-15T14:00:00.000Z");
  });

  it("weekly occurrences land on the same day of week", () => {
    const occs = generateOccurrences(baseInput);
    const dayOfWeek = occs[0].startsAt.getUTCDay();

    for (const occ of occs) {
      expect(occ.startsAt.getUTCDay()).toBe(dayOfWeek);
    }
    // Verify dates are ~7 days apart (may differ by 1h due to DST)
    for (let i = 1; i < occs.length; i++) {
      const diffDays = Math.round(
        (occs[i].startsAt.getTime() - occs[i - 1].startsAt.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      expect(diffDays).toBe(7);
    }
  });

  it("biweekly occurrences are ~14 days apart", () => {
    const occs = generateOccurrences({ ...baseInput, frequency: "biweekly" });

    for (let i = 1; i < occs.length; i++) {
      const diffDays = Math.round(
        (occs[i].startsAt.getTime() - occs[i - 1].startsAt.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      expect(diffDays).toBe(14);
    }
  });

  it("monthly occurrences advance by month", () => {
    const occs = generateOccurrences({ ...baseInput, frequency: "monthly" });

    expect(occs[0].startsAt.getMonth()).toBe(2); // March
    expect(occs[1].startsAt.getMonth()).toBe(3); // April
    expect(occs[2].startsAt.getMonth()).toBe(4); // May
    expect(occs[3].startsAt.getMonth()).toBe(5); // June
  });

  it("each occurrence has correct duration", () => {
    const occs = generateOccurrences(baseInput);

    for (const occ of occs) {
      const durationMs = occ.endsAt.getTime() - occ.startsAt.getTime();
      expect(durationMs).toBe(30 * 60 * 1000);
    }
  });

  it("indices are sequential", () => {
    const occs = generateOccurrences(baseInput);
    expect(occs.map((o) => o.index)).toEqual([0, 1, 2, 3]);
  });

  it("throws for count < 1", () => {
    expect(() =>
      generateOccurrences({ ...baseInput, count: 0 }),
    ).toThrow(RecurringBookingError);
  });

  it("throws for count > 52", () => {
    expect(() =>
      generateOccurrences({ ...baseInput, count: 53 }),
    ).toThrow("cannot exceed 52");
  });

  it("throws for duration < 1", () => {
    expect(() =>
      generateOccurrences({ ...baseInput, durationMinutes: 0 }),
    ).toThrow("at least 1 minute");
  });

  it("handles single occurrence", () => {
    const occs = generateOccurrences({ ...baseInput, count: 1 });
    expect(occs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// checkRecurringAvailability
// ---------------------------------------------------------------------------

describe("checkRecurringAvailability", () => {
  const occurrences = generateOccurrences({
    startsAt: new Date("2026-03-15T14:00:00Z"),
    durationMinutes: 30,
    frequency: "weekly",
    count: 3,
  });

  it("all available when no existing bookings", () => {
    const result = checkRecurringAvailability(occurrences, []);
    expect(result.allAvailable).toBe(true);
    expect(result.conflicts).toHaveLength(0);
  });

  it("detects conflict with overlapping booking", () => {
    const existing: BookingInput[] = [
      {
        startsAt: new Date("2026-03-22T13:45:00Z"),
        endsAt: new Date("2026-03-22T14:15:00Z"),
        status: "confirmed",
      },
    ];

    const result = checkRecurringAvailability(occurrences, existing);
    expect(result.allAvailable).toBe(false);
    expect(result.conflicts).toEqual([1]); // second occurrence
  });

  it("ignores cancelled bookings", () => {
    const existing: BookingInput[] = [
      {
        startsAt: new Date("2026-03-22T14:00:00Z"),
        endsAt: new Date("2026-03-22T14:30:00Z"),
        status: "cancelled",
      },
    ];

    const result = checkRecurringAvailability(occurrences, existing);
    expect(result.allAvailable).toBe(true);
  });

  it("detects multiple conflicts", () => {
    const existing: BookingInput[] = [
      {
        startsAt: new Date("2026-03-15T14:00:00Z"),
        endsAt: new Date("2026-03-15T14:30:00Z"),
        status: "confirmed",
      },
      {
        startsAt: new Date("2026-03-29T14:00:00Z"),
        endsAt: new Date("2026-03-29T14:30:00Z"),
        status: "confirmed",
      },
    ];

    const result = checkRecurringAvailability(occurrences, existing);
    expect(result.conflicts).toEqual([0, 2]);
  });
});

// ---------------------------------------------------------------------------
// cancelFutureOccurrences
// ---------------------------------------------------------------------------

describe("cancelFutureOccurrences", () => {
  const now = new Date("2026-03-22T12:00:00Z");

  const seriesBookings: SeriesBooking[] = [
    {
      id: "b1",
      index: 0,
      startsAt: new Date("2026-03-15T14:00:00Z"),
      endsAt: new Date("2026-03-15T14:30:00Z"),
      status: "completed",
    },
    {
      id: "b2",
      index: 1,
      startsAt: new Date("2026-03-22T14:00:00Z"),
      endsAt: new Date("2026-03-22T14:30:00Z"),
      status: "confirmed",
    },
    {
      id: "b3",
      index: 2,
      startsAt: new Date("2026-03-29T14:00:00Z"),
      endsAt: new Date("2026-03-29T14:30:00Z"),
      status: "confirmed",
    },
    {
      id: "b4",
      index: 3,
      startsAt: new Date("2026-04-05T14:00:00Z"),
      endsAt: new Date("2026-04-05T14:30:00Z"),
      status: "cancelled",
    },
  ];

  it("cancels only future non-terminal bookings", () => {
    const result = cancelFutureOccurrences(seriesBookings, now);
    expect(result.cancelledIds).toEqual(["b2", "b3"]);
  });

  it("skips completed and cancelled bookings", () => {
    const result = cancelFutureOccurrences(seriesBookings, now);
    expect(result.skippedIds).toContain("b1"); // completed
    expect(result.skippedIds).toContain("b4"); // already cancelled
  });

  it("handles empty series", () => {
    const result = cancelFutureOccurrences([]);
    expect(result.cancelledIds).toEqual([]);
    expect(result.skippedIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isValidFrequency
// ---------------------------------------------------------------------------

describe("isValidFrequency", () => {
  it("accepts weekly", () => {
    expect(isValidFrequency("weekly")).toBe(true);
  });

  it("accepts biweekly", () => {
    expect(isValidFrequency("biweekly")).toBe(true);
  });

  it("accepts monthly", () => {
    expect(isValidFrequency("monthly")).toBe(true);
  });

  it("rejects invalid", () => {
    expect(isValidFrequency("daily")).toBe(false);
    expect(isValidFrequency("quarterly")).toBe(false);
  });
});
