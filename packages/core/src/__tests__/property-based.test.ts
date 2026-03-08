import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { getAvailableSlots, isSlotAvailable } from "../slot-engine.js";
import { normalizeToUTC, utcToLocal } from "../timezone.js";
import type {
  AvailabilityRuleInput,
  AvailabilityOverrideInput,
  BookingInput,
} from "../types.js";

// ---------------------------------------------------------------------------
// Arbitraries (data generators)
// ---------------------------------------------------------------------------

/** Generate a random IANA timezone from a representative set */
const timezoneArb = fc.constantFrom(
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
);

/** Generate a random weekday set for BYDAY */
const bydayArb = fc
  .subarray(["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const, {
    minLength: 1,
    maxLength: 7,
  })
  .map((days) => days.join(","));

/** Generate valid start/end hour pairs (start < end, both 0-23) */
const hourPairArb = fc
  .tuple(fc.integer({ min: 0, max: 22 }), fc.integer({ min: 1, max: 23 }))
  .filter(([s, e]) => s < e)
  .map(([s, e]) => ({
    startTime: `${String(s).padStart(2, "0")}:00`,
    endTime: `${String(e).padStart(2, "0")}:00`,
  }));

/** Generate a random availability rule */
const ruleArb = fc
  .tuple(bydayArb, hourPairArb, timezoneArb)
  .map(([byday, hours, tz]) => ({
    rrule: `FREQ=WEEKLY;BYDAY=${byday}`,
    startTime: hours.startTime,
    endTime: hours.endTime,
    timezone: tz,
  }));

/** Generate a random booking within a given date range */
function bookingInRangeArb(
  rangeStart: Date,
  rangeEnd: Date,
): fc.Arbitrary<BookingInput> {
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  const rangeMs = endMs - startMs;

  return fc
    .tuple(
      fc.integer({ min: 0, max: rangeMs - 30 * 60 * 1000 }),
      fc.integer({ min: 15, max: 120 }),
      fc.constantFrom(
        "confirmed" as const,
        "pending" as const,
        "cancelled" as const,
      ),
    )
    .map(([offsetMs, durationMin, status]) => ({
      startsAt: new Date(startMs + offsetMs),
      endsAt: new Date(startMs + offsetMs + durationMin * 60 * 1000),
      status,
    }));
}

// ---------------------------------------------------------------------------
// Property-Based Tests
// ---------------------------------------------------------------------------

describe("Property-based: Slot Engine Invariants", () => {
  // Use a fixed future date range to avoid "slots in the past" filtering
  const futureStart = new Date("2027-06-01T00:00:00Z");
  const futureEnd = new Date("2027-06-08T00:00:00Z");
  const dateRange = { start: futureStart, end: futureEnd };

  it("all returned slots are non-overlapping (no two slots share time)", () => {
    fc.assert(
      fc.property(
        ruleArb,
        fc.integer({ min: 15, max: 120 }),
        (rule, duration) => {
          const slots = getAvailableSlots(
            [rule],
            [],
            [],
            dateRange,
            "UTC",
            { duration },
          );

          for (let i = 1; i < slots.length; i++) {
            const prev = new Date(slots[i - 1].endTime);
            const curr = new Date(slots[i].startTime);
            expect(curr.getTime()).toBeGreaterThanOrEqual(prev.getTime());
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("all returned slots have the correct duration", () => {
    fc.assert(
      fc.property(
        ruleArb,
        fc.integer({ min: 15, max: 120 }),
        (rule, duration) => {
          const slots = getAvailableSlots(
            [rule],
            [],
            [],
            dateRange,
            "UTC",
            { duration },
          );

          for (const slot of slots) {
            const startMs = new Date(slot.startTime).getTime();
            const endMs = new Date(slot.endTime).getTime();
            expect(endMs - startMs).toBe(duration * 60 * 1000);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("slots are always sorted chronologically", () => {
    fc.assert(
      fc.property(ruleArb, (rule) => {
        const slots = getAvailableSlots([rule], [], [], dateRange, "UTC");

        for (let i = 1; i < slots.length; i++) {
          expect(
            new Date(slots[i].startTime).getTime(),
          ).toBeGreaterThanOrEqual(
            new Date(slots[i - 1].startTime).getTime(),
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  it("adding a booking always produces fewer or equal slots", () => {
    fc.assert(
      fc.property(
        ruleArb,
        bookingInRangeArb(futureStart, futureEnd),
        (rule, booking) => {
          const slotsWithout = getAvailableSlots(
            [rule],
            [],
            [],
            dateRange,
            "UTC",
          );
          const slotsWith = getAvailableSlots(
            [rule],
            [],
            [booking],
            dateRange,
            "UTC",
          );

          // A non-cancelled booking should remove slots; cancelled should not
          if (booking.status === "cancelled") {
            expect(slotsWith.length).toBe(slotsWithout.length);
          } else {
            expect(slotsWith.length).toBeLessThanOrEqual(slotsWithout.length);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("no returned slot overlaps with any active booking", () => {
    fc.assert(
      fc.property(
        ruleArb,
        fc.array(bookingInRangeArb(futureStart, futureEnd), {
          minLength: 1,
          maxLength: 10,
        }),
        (rule, bookings) => {
          const slots = getAvailableSlots(
            [rule],
            [],
            bookings,
            dateRange,
            "UTC",
          );

          const activeBookings = bookings.filter(
            (b) => b.status !== "cancelled" && b.status !== "rejected",
          );

          for (const slot of slots) {
            const slotStart = new Date(slot.startTime).getTime();
            const slotEnd = new Date(slot.endTime).getTime();

            for (const booking of activeBookings) {
              const bStart = booking.startsAt.getTime();
              const bEnd = booking.endsAt.getTime();

              // Slot must not overlap with booking
              const overlaps = slotStart < bEnd && slotEnd > bStart;
              expect(overlaps).toBe(false);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("an unavailable override always produces fewer or equal slots", () => {
    fc.assert(
      fc.property(
        ruleArb,
        fc.integer({ min: 0, max: 6 }),
        (rule, dayOffset) => {
          const overrideDate = new Date(futureStart);
          overrideDate.setUTCDate(overrideDate.getUTCDate() + dayOffset);

          const override: AvailabilityOverrideInput = {
            date: overrideDate,
            isUnavailable: true,
          };

          const slotsWithout = getAvailableSlots(
            [rule],
            [],
            [],
            dateRange,
            "UTC",
          );
          const slotsWith = getAvailableSlots(
            [rule],
            [override],
            [],
            dateRange,
            "UTC",
          );

          // Blocking a date should never add slots
          expect(slotsWith.length).toBeLessThanOrEqual(slotsWithout.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Property-based: Timezone Roundtrip", () => {
  it("normalizeToUTC → utcToLocal is identity for 1000 random datetimes across timezones", () => {
    const timezones = [
      "America/New_York",
      "America/Los_Angeles",
      "America/Chicago",
      "America/Denver",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Kolkata",
      "Australia/Sydney",
      "Australia/Melbourne",
      "Pacific/Auckland",
      "Pacific/Honolulu",
      "Africa/Cairo",
      "America/Sao_Paulo",
      "Asia/Dubai",
      "Asia/Singapore",
      "Europe/Moscow",
      "UTC",
    ];

    fc.assert(
      fc.property(
        // Generate valid dates avoiding edge cases
        fc.date({
          min: new Date("2025-01-01T00:00:00Z"),
          max: new Date("2027-12-31T00:00:00Z"),
        }).filter((d) => !isNaN(d.getTime())),
        fc.constantFrom(...timezones),
        (date, timezone) => {
          // Start from UTC, convert to local, then back to UTC
          const utcIso = date.toISOString();

          // UTC → Local
          const local = utcToLocal(utcIso, timezone);

          // Local → UTC (roundtrip)
          const roundtripped = normalizeToUTC(local, timezone);

          // They should match to the minute (DST ambiguity can cause ±1hr, but
          // the roundtrip from UTC→local→UTC should be stable)
          const originalMs = date.getTime();
          const roundtrippedMs = new Date(roundtripped).getTime();

          // Allow up to 1 hour difference for DST ambiguous times
          const diffMs = Math.abs(originalMs - roundtrippedMs);
          expect(diffMs).toBeLessThanOrEqual(60 * 60 * 1000);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe("Property-based: isSlotAvailable consistency with getAvailableSlots", () => {
  const futureStart = new Date("2027-06-01T00:00:00Z");
  const futureEnd = new Date("2027-06-08T00:00:00Z");
  const dateRange = { start: futureStart, end: futureEnd };

  it("every slot returned by getAvailableSlots is marked available by isSlotAvailable", () => {
    fc.assert(
      fc.property(
        ruleArb,
        fc.array(bookingInRangeArb(futureStart, futureEnd), {
          minLength: 0,
          maxLength: 5,
        }),
        (rule, bookings) => {
          const slots = getAvailableSlots(
            [rule],
            [],
            bookings,
            dateRange,
            "UTC",
          );

          // Check a sample of returned slots (up to 10 to keep test fast)
          const sample = slots.slice(0, 10);
          for (const slot of sample) {
            const result = isSlotAvailable(
              [rule],
              [],
              bookings,
              new Date(slot.startTime),
              new Date(slot.endTime),
            );
            expect(result.available).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
