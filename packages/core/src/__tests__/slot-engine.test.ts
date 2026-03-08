import { describe, it, expect, beforeEach, vi } from "vitest";
import { getAvailableSlots, isSlotAvailable } from "../index.js";
import type {
  AvailabilityRuleInput,
  AvailabilityOverrideInput,
  BookingInput,
} from "../index.js";

// Use a fixed "now" in the past so all slots are in the future
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
});

const weekdayRule: AvailabilityRuleInput = {
  rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  startTime: "09:00",
  endTime: "17:00",
  timezone: "America/New_York",
};

describe("getAvailableSlots", () => {
  it("generates 30-min slots for a weekday (Mon-Fri 9-5)", () => {
    const dateRange = {
      start: new Date("2026-03-02T00:00:00Z"), // Monday
      end: new Date("2026-03-02T23:59:59Z"),
    };

    const slots = getAvailableSlots(
      [weekdayRule],
      [],
      [],
      dateRange,
      "America/New_York",
      { duration: 30 },
    );

    // 9 AM to 5 PM = 8 hours = 16 thirty-minute slots
    expect(slots).toHaveLength(16);

    // First slot starts at 9:00 ET (14:00 UTC during EST)
    expect(slots[0].localStart).toContain("09:00");
    // Last slot starts at 16:30 ET
    expect(slots[slots.length - 1].localStart).toContain("16:30");
  });

  it("generates no slots on a weekend", () => {
    const dateRange = {
      start: new Date("2026-03-07T00:00:00Z"), // Saturday
      end: new Date("2026-03-08T23:59:59Z"),   // Sunday
    };

    const slots = getAvailableSlots(
      [weekdayRule],
      [],
      [],
      dateRange,
      "America/New_York",
    );

    expect(slots).toHaveLength(0);
  });

  it("removes slots that overlap with existing bookings", () => {
    const dateRange = {
      start: new Date("2026-03-02T00:00:00Z"),
      end: new Date("2026-03-02T23:59:59Z"),
    };

    // Booking at 10:00-10:30 ET = 15:00-15:30 UTC (EST = UTC-5)
    const bookings: BookingInput[] = [
      {
        startsAt: new Date("2026-03-02T15:00:00Z"),
        endsAt: new Date("2026-03-02T15:30:00Z"),
        status: "confirmed",
      },
    ];

    const slots = getAvailableSlots(
      [weekdayRule],
      [],
      bookings,
      dateRange,
      "America/New_York",
      { duration: 30 },
    );

    // 16 - 1 = 15 slots (the 10:00 slot is removed)
    expect(slots).toHaveLength(15);

    // Verify the 10:00 slot is gone
    const slotTimes = slots.map((s) => s.localStart);
    expect(slotTimes).not.toContain(expect.stringContaining("10:00"));
  });

  it("applies buffer time before and after bookings", () => {
    const dateRange = {
      start: new Date("2026-03-02T00:00:00Z"),
      end: new Date("2026-03-02T23:59:59Z"),
    };

    // Booking at 10:00-10:30 ET
    const bookings: BookingInput[] = [
      {
        startsAt: new Date("2026-03-02T15:00:00Z"),
        endsAt: new Date("2026-03-02T15:30:00Z"),
        status: "confirmed",
      },
    ];

    const slots = getAvailableSlots(
      [weekdayRule],
      [],
      bookings,
      dateRange,
      "America/New_York",
      { duration: 30, bufferBefore: 30, bufferAfter: 30 },
    );

    // Booking at 10:00-10:30 with 30 min buffer before & after:
    // Blocked region = 9:30 to 11:00 UTC-adjusted
    // Should remove 9:30, 10:00, and 10:30 slots
    const slotTimes = slots.map((s) => s.localStart);
    expect(slotTimes).not.toContain(expect.stringContaining("T09:30"));
    expect(slotTimes).not.toContain(expect.stringContaining("T10:00"));
    expect(slotTimes).not.toContain(expect.stringContaining("T10:30"));
    // Slot count: 16 total - 3 removed = 13
    expect(slots.length).toBe(13);
  });

  it("ignores cancelled bookings", () => {
    const dateRange = {
      start: new Date("2026-03-02T00:00:00Z"),
      end: new Date("2026-03-02T23:59:59Z"),
    };

    const bookings: BookingInput[] = [
      {
        startsAt: new Date("2026-03-02T15:00:00Z"),
        endsAt: new Date("2026-03-02T15:30:00Z"),
        status: "cancelled",
      },
    ];

    const slots = getAvailableSlots(
      [weekdayRule],
      [],
      bookings,
      dateRange,
      "America/New_York",
      { duration: 30 },
    );

    expect(slots).toHaveLength(16); // All slots available
  });

  it("blocks all slots on an unavailable override day", () => {
    const dateRange = {
      start: new Date("2026-03-02T00:00:00Z"),
      end: new Date("2026-03-02T23:59:59Z"),
    };

    const overrides: AvailabilityOverrideInput[] = [
      {
        date: new Date("2026-03-02T00:00:00Z"),
        isUnavailable: true,
      },
    ];

    const slots = getAvailableSlots(
      [weekdayRule],
      overrides,
      [],
      dateRange,
      "America/New_York",
    );

    expect(slots).toHaveLength(0);
  });

  it("replaces availability on override with custom hours", () => {
    const dateRange = {
      start: new Date("2026-03-02T00:00:00Z"),
      end: new Date("2026-03-02T23:59:59Z"),
    };

    const overrides: AvailabilityOverrideInput[] = [
      {
        date: new Date("2026-03-02T00:00:00Z"),
        startTime: "10:00",
        endTime: "14:00",
        isUnavailable: false,
      },
    ];

    const slots = getAvailableSlots(
      [weekdayRule],
      overrides,
      [],
      dateRange,
      "America/New_York",
      { duration: 30 },
    );

    // 10:00-14:00 = 4 hours = 8 thirty-minute slots
    expect(slots).toHaveLength(8);
    expect(slots[0].localStart).toContain("10:00");
    expect(slots[slots.length - 1].localStart).toContain("13:30");
  });

  it("returns slots sorted chronologically", () => {
    const dateRange = {
      start: new Date("2026-03-02T00:00:00Z"),
      end: new Date("2026-03-03T23:59:59Z"), // Two days
    };

    const slots = getAvailableSlots(
      [weekdayRule],
      [],
      [],
      dateRange,
      "America/New_York",
      { duration: 60 },
    );

    for (let i = 1; i < slots.length; i++) {
      expect(new Date(slots[i].startTime).getTime()).toBeGreaterThan(
        new Date(slots[i - 1].startTime).getTime(),
      );
    }
  });

  it("supports custom slot intervals", () => {
    const dateRange = {
      start: new Date("2026-03-02T00:00:00Z"),
      end: new Date("2026-03-02T23:59:59Z"),
    };

    const slots = getAvailableSlots(
      [weekdayRule],
      [],
      [],
      dateRange,
      "America/New_York",
      { duration: 30, slotInterval: 15 },
    );

    // With 15-min intervals for 30-min slots in 8 hours:
    // Last slot can start at 16:30 (ends at 17:00)
    // From 9:00 to 16:30 at 15-min intervals = 31 slots
    expect(slots).toHaveLength(31);
  });

  it("displays slots in customer timezone", () => {
    const dateRange = {
      start: new Date("2026-03-02T00:00:00Z"),
      end: new Date("2026-03-02T23:59:59Z"),
    };

    const slots = getAvailableSlots(
      [weekdayRule],
      [],
      [],
      dateRange,
      "America/Los_Angeles", // Customer is in Pacific time
      { duration: 30 },
    );

    // Provider is in ET (UTC-5), Customer is in PT (UTC-8)
    // First slot: 9:00 ET = 6:00 PT
    expect(slots[0].localStart).toContain("06:00");
  });
});

describe("isSlotAvailable", () => {
  it("returns available:true for a valid open slot", () => {
    const result = isSlotAvailable(
      [weekdayRule],
      [],
      [],
      new Date("2026-03-02T15:00:00Z"), // 10:00 ET on Monday
      new Date("2026-03-02T15:30:00Z"),
    );

    expect(result).toEqual({ available: true });
  });

  it("returns outside_availability for a weekend slot", () => {
    const result = isSlotAvailable(
      [weekdayRule],
      [],
      [],
      new Date("2026-03-07T15:00:00Z"), // Saturday
      new Date("2026-03-07T15:30:00Z"),
    );

    expect(result).toEqual({ available: false, reason: "outside_availability" });
  });

  it("returns blocked_date for an unavailable override", () => {
    const overrides: AvailabilityOverrideInput[] = [
      {
        date: new Date("2026-03-02T00:00:00Z"),
        isUnavailable: true,
      },
    ];

    const result = isSlotAvailable(
      [weekdayRule],
      overrides,
      [],
      new Date("2026-03-02T15:00:00Z"),
      new Date("2026-03-02T15:30:00Z"),
    );

    expect(result).toEqual({ available: false, reason: "blocked_date" });
  });

  it("returns already_booked for a conflicting booking", () => {
    const bookings: BookingInput[] = [
      {
        startsAt: new Date("2026-03-02T15:00:00Z"),
        endsAt: new Date("2026-03-02T15:30:00Z"),
        status: "confirmed",
      },
    ];

    const result = isSlotAvailable(
      [weekdayRule],
      [],
      bookings,
      new Date("2026-03-02T15:00:00Z"),
      new Date("2026-03-02T15:30:00Z"),
    );

    expect(result).toEqual({ available: false, reason: "already_booked" });
  });

  it("returns buffer_conflict when buffer overlaps", () => {
    const bookings: BookingInput[] = [
      {
        startsAt: new Date("2026-03-02T15:00:00Z"),
        endsAt: new Date("2026-03-02T15:30:00Z"),
        status: "confirmed",
      },
    ];

    const result = isSlotAvailable(
      [weekdayRule],
      [],
      bookings,
      new Date("2026-03-02T15:30:00Z"), // Right after booking
      new Date("2026-03-02T16:00:00Z"),
      0,
      30, // 30 min buffer after
    );

    expect(result).toEqual({ available: false, reason: "buffer_conflict" });
  });

  it("ignores cancelled bookings", () => {
    const bookings: BookingInput[] = [
      {
        startsAt: new Date("2026-03-02T15:00:00Z"),
        endsAt: new Date("2026-03-02T15:30:00Z"),
        status: "cancelled",
      },
    ];

    const result = isSlotAvailable(
      [weekdayRule],
      [],
      bookings,
      new Date("2026-03-02T15:00:00Z"),
      new Date("2026-03-02T15:30:00Z"),
    );

    expect(result).toEqual({ available: true });
  });
});
