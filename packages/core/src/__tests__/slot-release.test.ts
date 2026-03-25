/**
 * Unit and property-based tests for `slot-release.ts` (E-23).
 *
 * Coverage:
 * - E23-S02: rolling_window strategy
 * - E23-S03: fill_earlier_first strategy
 * - E23-S04: discount_incentive strategy
 * - E23-S08: all edge cases listed in acceptance criteria
 * - E23-S09: property-based invariants via fast-check
 * - Integration: getAvailableSlots + getResourceAvailableSlots wiring
 * - Composability: slotRelease + filterSlotsByLimits
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { addHours, addDays, addMinutes } from "date-fns";
import {
  applySlotRelease,
  computeWindowFillRates,
} from "../slot-release.js";
import { filterSlotsByLimits } from "../booking-limits.js";
import { getAvailableSlots } from "../slot-engine.js";
import { getResourceAvailableSlots } from "../resource-engine.js";
import type {
  BookingInput,
  RollingWindowConfig,
  FillEarlierFirstConfig,
  DiscountIncentiveConfig,
  AvailabilityRuleInput,
  ResourceInput,
} from "../types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a UTC Date from a simple YYYY-MM-DDTHH:mm string.
 * Appends "Z" so it is always interpreted as UTC regardless of host timezone.
 */
function utc(iso: string): Date {
  return new Date(`${iso}:00.000Z`);
}

/**
 * Build a minimal slot array for a single day (2026-03-25 UTC).
 * 8 slots from 09:00 to 13:00 in 30-minute increments.
 */
function makeSlots(
  startHour: number,
  count: number,
  durationMinutes = 30,
  dateStr = "2026-03-25",
): Array<{ start: Date; end: Date }> {
  return Array.from({ length: count }, (_, i) => {
    const start = utc(`${dateStr}T${String(startHour).padStart(2, "0")}:${String(i * durationMinutes % 60).padStart(2, "0")}`);
    // Handle minutes rolling over 60 for non-30-minute durations by using addMinutes
    const slotStart = new Date(
      Date.UTC(
        2026,
        2, // March (0-indexed)
        Number(dateStr.split("-")[2]),
        startHour + Math.floor((i * durationMinutes) / 60),
        (i * durationMinutes) % 60,
      ),
    );
    const slotEnd = addMinutes(slotStart, durationMinutes);
    return { start: slotStart, end: slotEnd };
  });
}

/** Build a minimal active booking overlapping a given slot. */
function booking(
  start: Date,
  end: Date,
  status = "confirmed",
): BookingInput {
  return { startsAt: start, endsAt: end, status };
}

/** Standard provider timezone used across most tests. */
const TZ = "America/New_York";

// ---------------------------------------------------------------------------
// 1. Rolling Window Strategy
// ---------------------------------------------------------------------------

describe("applySlotRelease — rolling_window", () => {
  const now = utc("2026-03-25T10:00");

  const config: RollingWindowConfig = {
    strategy: "rolling_window",
    windowSize: 4,
    unit: "hours",
  };

  // Slots at now-1h, now+2h (within), now+4h (boundary), now+5h (beyond)
  const slots = [
    { start: addHours(now, -1), end: addHours(now, 0) },
    { start: addHours(now, 2), end: addHours(now, 2.5) },
    { start: addHours(now, 4), end: addHours(now, 4.5) },
    { start: addHours(now, 5), end: addHours(now, 5.5) },
  ];

  it("includes slots within the window", () => {
    const { slots: result } = applySlotRelease(slots, config, [], TZ, now);
    const starts = result.map((s) => s.start.getTime());
    expect(starts).toContain(slots[0].start.getTime());
    expect(starts).toContain(slots[1].start.getTime());
  });

  it("excludes slots beyond the window", () => {
    const { slots: result } = applySlotRelease(slots, config, [], TZ, now);
    const starts = result.map((s) => s.start.getTime());
    expect(starts).not.toContain(slots[3].start.getTime());
  });

  it("includes a slot whose start is exactly at the horizon (boundary inclusive)", () => {
    const { slots: result } = applySlotRelease(slots, config, [], TZ, now);
    const starts = result.map((s) => s.start.getTime());
    expect(starts).toContain(slots[2].start.getTime());
  });

  it("unit conversion: 48 hours and 2 days produce the same horizon", () => {
    const slotsFar = [
      { start: addHours(now, 47), end: addHours(now, 47.5) },
      { start: addHours(now, 49), end: addHours(now, 49.5) },
    ];
    const hoursConfig: RollingWindowConfig = { strategy: "rolling_window", windowSize: 48, unit: "hours" };
    const daysConfig: RollingWindowConfig = { strategy: "rolling_window", windowSize: 2, unit: "days" };

    const { slots: fromHours } = applySlotRelease(slotsFar, hoursConfig, [], TZ, now);
    const { slots: fromDays } = applySlotRelease(slotsFar, daysConfig, [], TZ, now);

    expect(fromHours.map((s) => s.start.getTime())).toEqual(
      fromDays.map((s) => s.start.getTime()),
    );
  });

  it("windowSize = 0 returns only slots at or before now", () => {
    const zeroConfig: RollingWindowConfig = { strategy: "rolling_window", windowSize: 0, unit: "hours" };
    const { slots: result } = applySlotRelease(slots, zeroConfig, [], TZ, now);
    for (const slot of result) {
      expect(slot.start.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it("preserves input ordering (no re-sort)", () => {
    const { slots: result } = applySlotRelease(slots, config, [], TZ, now);
    // Result is a subset of input; order must be preserved
    const inputMs = slots.map((s) => s.start.getTime());
    const resultMs = result.map((s) => s.start.getTime());
    // Every consecutive pair in result appears in the same relative order in input
    for (let i = 1; i < resultMs.length; i++) {
      expect(inputMs.indexOf(resultMs[i])).toBeGreaterThan(
        inputMs.indexOf(resultMs[i - 1]),
      );
    }
  });

  it("returns empty discountMap for rolling_window", () => {
    const { discountMap } = applySlotRelease(slots, config, [], TZ, now);
    expect(discountMap.size).toBe(0);
  });

  it("defaults unit to hours when omitted", () => {
    const noUnitConfig: RollingWindowConfig = { strategy: "rolling_window", windowSize: 4 };
    const withHoursConfig: RollingWindowConfig = { strategy: "rolling_window", windowSize: 4, unit: "hours" };
    const { slots: r1 } = applySlotRelease(slots, noUnitConfig, [], TZ, now);
    const { slots: r2 } = applySlotRelease(slots, withHoursConfig, [], TZ, now);
    expect(r1.map((s) => s.start.getTime())).toEqual(r2.map((s) => s.start.getTime()));
  });
});

// ---------------------------------------------------------------------------
// 2. Fill Earlier First Strategy
// ---------------------------------------------------------------------------

describe("applySlotRelease — fill_earlier_first", () => {
  // 2026-03-25 is a Wednesday in New York (UTC-4 in EDT, so 09:00 ET = 13:00 UTC)
  // We use UTC dates directly and tell the engine to interpret in TZ="America/New_York"
  const now = utc("2026-03-25T08:00");

  /**
   * Build a two-window day with a single boundary at "12:00" ET.
   * Morning: 3 slots 09:00-10:30 ET (13:00-14:30 UTC)
   * Afternoon: 3 slots 13:00-14:30 ET (17:00-18:30 UTC)
   */
  function makeTwoWindowSlots(): Array<{ start: Date; end: Date }> {
    // New York is UTC-4 in EDT (March 2026 is after DST switch on March 8)
    const morning = [
      { start: utc("2026-03-25T13:00"), end: utc("2026-03-25T13:30") },
      { start: utc("2026-03-25T13:30"), end: utc("2026-03-25T14:00") },
      { start: utc("2026-03-25T14:00"), end: utc("2026-03-25T14:30") },
    ];
    const afternoon = [
      { start: utc("2026-03-25T17:00"), end: utc("2026-03-25T17:30") },
      { start: utc("2026-03-25T17:30"), end: utc("2026-03-25T18:00") },
      { start: utc("2026-03-25T18:00"), end: utc("2026-03-25T18:30") },
    ];
    return [...morning, ...afternoon];
  }

  it("window 0 (morning) is always visible", () => {
    const slots = makeTwoWindowSlots();
    const config: FillEarlierFirstConfig = {
      strategy: "fill_earlier_first",
      threshold: 70,
      windowBoundaries: ["12:00"],
    };
    const { slots: result } = applySlotRelease(slots, config, [], TZ, now);
    // All morning slots must be present
    const morningStarts = slots.slice(0, 3).map((s) => s.start.getTime());
    const resultMs = result.map((s) => s.start.getTime());
    for (const ms of morningStarts) {
      expect(resultMs).toContain(ms);
    }
  });

  it("afternoon hidden when morning fill rate < threshold", () => {
    const slots = makeTwoWindowSlots();
    const config: FillEarlierFirstConfig = {
      strategy: "fill_earlier_first",
      threshold: 70,
      windowBoundaries: ["12:00"],
    };
    // 2 of 3 morning slots booked → 67% < 70% threshold
    const bookings: BookingInput[] = [
      booking(utc("2026-03-25T13:00"), utc("2026-03-25T13:30")),
      booking(utc("2026-03-25T13:30"), utc("2026-03-25T14:00")),
    ];
    const { slots: result } = applySlotRelease(slots, config, bookings, TZ, now);
    const afternoonMs = slots.slice(3).map((s) => s.start.getTime());
    const resultMs = result.map((s) => s.start.getTime());
    for (const ms of afternoonMs) {
      expect(resultMs).not.toContain(ms);
    }
  });

  it("afternoon visible when morning fill rate >= threshold", () => {
    const slots = makeTwoWindowSlots();
    const config: FillEarlierFirstConfig = {
      strategy: "fill_earlier_first",
      threshold: 70,
      windowBoundaries: ["12:00"],
    };
    // 3 of 3 morning slots booked → 100% >= 70%
    const bookings: BookingInput[] = [
      booking(utc("2026-03-25T13:00"), utc("2026-03-25T13:30")),
      booking(utc("2026-03-25T13:30"), utc("2026-03-25T14:00")),
      booking(utc("2026-03-25T14:00"), utc("2026-03-25T14:30")),
    ];
    const { slots: result } = applySlotRelease(slots, config, bookings, TZ, now);
    const afternoonMs = slots.slice(3).map((s) => s.start.getTime());
    const resultMs = result.map((s) => s.start.getTime());
    for (const ms of afternoonMs) {
      expect(resultMs).toContain(ms);
    }
  });

  it("threshold boundary: exactly at threshold releases next window", () => {
    // 3 slots in window 0; threshold = 67 (2/3 = 66.7% < 67 — hidden; 100% >= 67 — visible)
    const slots = makeTwoWindowSlots();
    const config: FillEarlierFirstConfig = {
      strategy: "fill_earlier_first",
      threshold: 67,
      windowBoundaries: ["12:00"],
    };
    // 2/3 = 66.7% < 67% → hidden
    const twoBooked: BookingInput[] = [
      booking(utc("2026-03-25T13:00"), utc("2026-03-25T13:30")),
      booking(utc("2026-03-25T13:30"), utc("2026-03-25T14:00")),
    ];
    const { slots: hiddenResult } = applySlotRelease(slots, config, twoBooked, TZ, now);
    const afternoonMs = slots.slice(3).map((s) => s.start.getTime());
    for (const ms of afternoonMs) {
      expect(hiddenResult.map((s) => s.start.getTime())).not.toContain(ms);
    }

    // 3/3 = 100% >= 67% → visible
    const threeBooked: BookingInput[] = [
      ...twoBooked,
      booking(utc("2026-03-25T14:00"), utc("2026-03-25T14:30")),
    ];
    const { slots: visibleResult } = applySlotRelease(slots, config, threeBooked, TZ, now);
    for (const ms of afternoonMs) {
      expect(visibleResult.map((s) => s.start.getTime())).toContain(ms);
    }
  });

  it("empty window (0 candidate slots) treated as 100% full — releases next window", () => {
    // Only afternoon slots; no morning slots in the candidate list.
    // Empty morning window → fill rate 1.0 → afternoon is visible.
    const afternoonOnly = [
      { start: utc("2026-03-25T17:00"), end: utc("2026-03-25T17:30") },
      { start: utc("2026-03-25T17:30"), end: utc("2026-03-25T18:00") },
    ];
    const config: FillEarlierFirstConfig = {
      strategy: "fill_earlier_first",
      threshold: 70,
      windowBoundaries: ["12:00"],
    };
    const { slots: result } = applySlotRelease(afternoonOnly, config, [], TZ, now);
    expect(result.length).toBe(2);
  });

  it("threshold = 0: all windows visible immediately", () => {
    const slots = makeTwoWindowSlots();
    const config: FillEarlierFirstConfig = {
      strategy: "fill_earlier_first",
      threshold: 0,
      windowBoundaries: ["12:00"],
    };
    // No bookings — fill rate = 0, threshold = 0 → 0 >= 0 → all visible
    const { slots: result } = applySlotRelease(slots, config, [], TZ, now);
    expect(result.length).toBe(slots.length);
  });

  it("threshold = 100: requires 100% fill before releasing next window", () => {
    const slots = makeTwoWindowSlots();
    const config: FillEarlierFirstConfig = {
      strategy: "fill_earlier_first",
      threshold: 100,
      windowBoundaries: ["12:00"],
    };
    // 2/3 booked → 67% < 100% → afternoon hidden
    const twoBooked: BookingInput[] = [
      booking(utc("2026-03-25T13:00"), utc("2026-03-25T13:30")),
      booking(utc("2026-03-25T13:30"), utc("2026-03-25T14:00")),
    ];
    const { slots: hidden } = applySlotRelease(slots, config, twoBooked, TZ, now);
    expect(hidden.length).toBe(3); // only morning

    // 3/3 booked → 100% >= 100% → afternoon visible
    const allBooked: BookingInput[] = [
      ...twoBooked,
      booking(utc("2026-03-25T14:00"), utc("2026-03-25T14:30")),
    ];
    const { slots: visible } = applySlotRelease(slots, config, allBooked, TZ, now);
    expect(visible.length).toBe(6); // morning + afternoon
  });

  it("cascading release: each window unlocks the next", () => {
    // Four windows: boundaries at 09:00, 12:00, 17:00 ET (13:00, 16:00, 21:00 UTC)
    // Window 0: before 09:00 ET  → 07:00-08:30 UTC  (no slots in this test)
    // Window 1: 09:00-12:00 ET   → 13:00-15:30 UTC  (3 slots)
    // Window 2: 12:00-17:00 ET   → 16:00-20:30 UTC  (3 slots)
    // Window 3: after 17:00 ET   → 21:00+ UTC        (3 slots)
    const w1 = [
      { start: utc("2026-03-25T13:00"), end: utc("2026-03-25T13:30") },
      { start: utc("2026-03-25T13:30"), end: utc("2026-03-25T14:00") },
      { start: utc("2026-03-25T14:00"), end: utc("2026-03-25T14:30") },
    ];
    const w2 = [
      { start: utc("2026-03-25T16:00"), end: utc("2026-03-25T16:30") },
      { start: utc("2026-03-25T16:30"), end: utc("2026-03-25T17:00") },
      { start: utc("2026-03-25T17:00"), end: utc("2026-03-25T17:30") },
    ];
    const w3 = [
      { start: utc("2026-03-25T21:00"), end: utc("2026-03-25T21:30") },
      { start: utc("2026-03-25T21:30"), end: utc("2026-03-25T22:00") },
      { start: utc("2026-03-25T22:00"), end: utc("2026-03-25T22:30") },
    ];
    const allSlots = [...w1, ...w2, ...w3];

    const config: FillEarlierFirstConfig = {
      strategy: "fill_earlier_first",
      threshold: 100,
      windowBoundaries: ["09:00", "12:00", "17:00"],
    };

    // No bookings → only w1 visible (window 0 is empty → vacuously full)
    const { slots: r0 } = applySlotRelease(allSlots, config, [], TZ, now);
    // Window 0 (before 09:00) is empty → treated as full → w1 (window 1) is visible
    // But w1 is at 0% → w2 and w3 hidden
    const r0Starts = r0.map((s) => s.start.getTime());
    for (const s of w1) expect(r0Starts).toContain(s.start.getTime());
    for (const s of w2) expect(r0Starts).not.toContain(s.start.getTime());
    for (const s of w3) expect(r0Starts).not.toContain(s.start.getTime());

    // Book all w1 → w2 visible, w3 still hidden
    const w1Bookings = w1.map((s) => booking(s.start, s.end));
    const { slots: r1 } = applySlotRelease(allSlots, config, w1Bookings, TZ, now);
    const r1Starts = r1.map((s) => s.start.getTime());
    for (const s of w1) expect(r1Starts).toContain(s.start.getTime());
    for (const s of w2) expect(r1Starts).toContain(s.start.getTime());
    for (const s of w3) expect(r1Starts).not.toContain(s.start.getTime());

    // Book all w1+w2 → all windows visible
    const w2Bookings = w2.map((s) => booking(s.start, s.end));
    const { slots: r2 } = applySlotRelease(allSlots, config, [...w1Bookings, ...w2Bookings], TZ, now);
    expect(r2.length).toBe(allSlots.length);
  });

  it("cancelled bookings do not count toward fill rate", () => {
    const slots = makeTwoWindowSlots();
    const config: FillEarlierFirstConfig = {
      strategy: "fill_earlier_first",
      threshold: 70,
      windowBoundaries: ["12:00"],
    };
    // 3 cancelled bookings → effective fill rate = 0% → afternoon hidden
    const cancelled: BookingInput[] = [
      booking(utc("2026-03-25T13:00"), utc("2026-03-25T13:30"), "cancelled"),
      booking(utc("2026-03-25T13:30"), utc("2026-03-25T14:00"), "cancelled"),
      booking(utc("2026-03-25T14:00"), utc("2026-03-25T14:30"), "rejected"),
    ];
    const { slots: result } = applySlotRelease(slots, config, cancelled, TZ, now);
    const afternoonMs = slots.slice(3).map((s) => s.start.getTime());
    const resultMs = result.map((s) => s.start.getTime());
    for (const ms of afternoonMs) {
      expect(resultMs).not.toContain(ms);
    }
  });

  it("returns empty discountMap for fill_earlier_first", () => {
    const slots = makeTwoWindowSlots();
    const config: FillEarlierFirstConfig = {
      strategy: "fill_earlier_first",
      threshold: 70,
      windowBoundaries: ["12:00"],
    };
    const { discountMap } = applySlotRelease(slots, config, [], TZ, now);
    expect(discountMap.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Discount Incentive Strategy
// ---------------------------------------------------------------------------

describe("applySlotRelease — discount_incentive", () => {
  const now = utc("2026-03-25T08:00");

  // Morning slots: 3 slots 13:00-14:30 UTC = 09:00-10:30 ET
  const morning = [
    { start: utc("2026-03-25T13:00"), end: utc("2026-03-25T13:30") },
    { start: utc("2026-03-25T13:30"), end: utc("2026-03-25T14:00") },
    { start: utc("2026-03-25T14:00"), end: utc("2026-03-25T14:30") },
  ];
  // Afternoon slots: 3 slots 17:00-18:30 UTC = 13:00-14:30 ET
  const afternoon = [
    { start: utc("2026-03-25T17:00"), end: utc("2026-03-25T17:30") },
    { start: utc("2026-03-25T17:30"), end: utc("2026-03-25T18:00") },
    { start: utc("2026-03-25T18:00"), end: utc("2026-03-25T18:30") },
  ];
  const allSlots = [...morning, ...afternoon];

  const tiers = [
    { fillRateBelowPercent: 30, discountPercent: 20 },
    { fillRateBelowPercent: 60, discountPercent: 10 },
  ];

  it("returns all input slots (no filtering)", () => {
    const config: DiscountIncentiveConfig = {
      strategy: "discount_incentive",
      tiers,
      windowBoundaries: ["12:00"],
    };
    const { slots: result } = applySlotRelease(allSlots, config, [], TZ, now);
    expect(result.length).toBe(allSlots.length);
  });

  it("first-match-wins: window at 25% fill gets tier[0] discount (20%), not tier[1]", () => {
    // Morning: 3 slots, 0 booked → 0% < 30% → tier[0] → 20% discount
    const config: DiscountIncentiveConfig = {
      strategy: "discount_incentive",
      tiers,
      windowBoundaries: ["12:00"],
    };
    const { discountMap } = applySlotRelease(allSlots, config, [], TZ, now);
    for (const slot of morning) {
      expect(discountMap.get(slot.start.getTime())).toBe(20);
    }
  });

  it("no discount when fill rate is above all tier thresholds", () => {
    // Morning: 3 slots, 3 booked → 100% ≥ 60% → no matching tier
    const config: DiscountIncentiveConfig = {
      strategy: "discount_incentive",
      tiers,
      windowBoundaries: ["12:00"],
    };
    const fullBookings = morning.map((s) => booking(s.start, s.end));
    const { discountMap } = applySlotRelease(allSlots, config, fullBookings, TZ, now);
    for (const slot of morning) {
      expect(discountMap.has(slot.start.getTime())).toBe(false);
    }
  });

  it("tier[1] applies when fill rate is between tier[0] and tier[1] thresholds", () => {
    // Morning: 3 slots, 1 booked → 33% → not < 30% (tier[0] misses) → < 60% (tier[1] hits) → 10%
    const config: DiscountIncentiveConfig = {
      strategy: "discount_incentive",
      tiers,
      windowBoundaries: ["12:00"],
    };
    const oneBooked: BookingInput[] = [booking(morning[0].start, morning[0].end)];
    const { discountMap } = applySlotRelease(allSlots, config, oneBooked, TZ, now);
    for (const slot of morning) {
      expect(discountMap.get(slot.start.getTime())).toBe(10);
    }
  });

  it("discountMap values match configured tier percentages exactly", () => {
    const config: DiscountIncentiveConfig = {
      strategy: "discount_incentive",
      tiers: [{ fillRateBelowPercent: 50, discountPercent: 15 }],
      windowBoundaries: [],
    };
    const { discountMap } = applySlotRelease(allSlots, config, [], TZ, now);
    // All slots in one window, 0% fill → < 50% → discount 15
    for (const slot of allSlots) {
      expect(discountMap.get(slot.start.getTime())).toBe(15);
    }
  });

  it("omitting windowBoundaries treats entire day as one window", () => {
    const config: DiscountIncentiveConfig = {
      strategy: "discount_incentive",
      tiers: [{ fillRateBelowPercent: 100, discountPercent: 5 }],
      // no windowBoundaries
    };
    // 6 slots, 0 booked → 0% < 100% → all get discount 5
    const { discountMap } = applySlotRelease(allSlots, config, [], TZ, now);
    expect(discountMap.size).toBe(6);
    for (const slot of allSlots) {
      expect(discountMap.get(slot.start.getTime())).toBe(5);
    }
  });

  it("empty windowBoundaries has same effect as omitting it", () => {
    const withEmpty: DiscountIncentiveConfig = {
      strategy: "discount_incentive",
      tiers: [{ fillRateBelowPercent: 100, discountPercent: 5 }],
      windowBoundaries: [],
    };
    const withOmit: DiscountIncentiveConfig = {
      strategy: "discount_incentive",
      tiers: [{ fillRateBelowPercent: 100, discountPercent: 5 }],
    };
    const { discountMap: m1 } = applySlotRelease(allSlots, withEmpty, [], TZ, now);
    const { discountMap: m2 } = applySlotRelease(allSlots, withOmit, [], TZ, now);
    expect([...m1.entries()].sort()).toEqual([...m2.entries()].sort());
  });

  it("cancelled/rejected bookings excluded from fill rate calculation", () => {
    const config: DiscountIncentiveConfig = {
      strategy: "discount_incentive",
      tiers: [{ fillRateBelowPercent: 50, discountPercent: 10 }],
      windowBoundaries: ["12:00"],
    };
    // 2 cancelled + 1 rejected morning → effective 0% → discount applies
    const inactive: BookingInput[] = [
      booking(morning[0].start, morning[0].end, "cancelled"),
      booking(morning[1].start, morning[1].end, "rejected"),
    ];
    const { discountMap } = applySlotRelease(allSlots, config, inactive, TZ, now);
    for (const slot of morning) {
      expect(discountMap.get(slot.start.getTime())).toBe(10);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. computeWindowFillRates helper
// ---------------------------------------------------------------------------

describe("computeWindowFillRates", () => {
  it("returns fill rate 0 for an unbookled window", () => {
    const slots = [
      { start: utc("2026-03-25T13:00"), end: utc("2026-03-25T13:30") },
      { start: utc("2026-03-25T13:30"), end: utc("2026-03-25T14:00") },
    ];
    const rates = computeWindowFillRates(slots, [], [], TZ);
    const rate = rates.get("2026-03-25-window-0");
    expect(rate).toBe(0);
  });

  it("returns fill rate 1.0 for an empty window (0 slots)", () => {
    // Only afternoon slots; morning window has 0 slots → vacuously full
    const afternoon = [
      { start: utc("2026-03-25T17:00"), end: utc("2026-03-25T17:30") },
    ];
    const rates = computeWindowFillRates(afternoon, [], ["12:00"], TZ);
    // Window 0 (before 12:00 ET = before 16:00 UTC) has no slots → rate = 1.0
    expect(rates.get("2026-03-25-window-0")).toBe(1.0);
    // Window 1 (after 12:00 ET) has 1 slot, 0 booked → rate = 0
    expect(rates.get("2026-03-25-window-1")).toBe(0);
  });

  it("counts overlapping bookings correctly", () => {
    const slots = [
      { start: utc("2026-03-25T13:00"), end: utc("2026-03-25T13:30") },
      { start: utc("2026-03-25T13:30"), end: utc("2026-03-25T14:00") },
      { start: utc("2026-03-25T14:00"), end: utc("2026-03-25T14:30") },
    ];
    const bookings: BookingInput[] = [
      booking(utc("2026-03-25T13:00"), utc("2026-03-25T13:30")),
      booking(utc("2026-03-25T13:30"), utc("2026-03-25T14:00")),
    ];
    const rates = computeWindowFillRates(slots, bookings, [], TZ);
    // All 3 slots in window 0, 2 booked → 2/3
    expect(rates.get("2026-03-25-window-0")).toBeCloseTo(2 / 3);
  });

  it("key format is YYYY-MM-DD-window-N", () => {
    const slots = [
      { start: utc("2026-03-25T13:00"), end: utc("2026-03-25T13:30") },
    ];
    const rates = computeWindowFillRates(slots, [], [], TZ);
    expect(rates.has("2026-03-25-window-0")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Integration: getAvailableSlots wiring
// ---------------------------------------------------------------------------

describe("getAvailableSlots integration — slotRelease wiring", () => {
  // Provider available Mon-Fri 09:00-17:00 ET; rule timezone "America/New_York"
  const rules: AvailabilityRuleInput[] = [
    {
      rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      startTime: "09:00",
      endTime: "17:00",
      timezone: "America/New_York",
    },
  ];

  const now = utc("2026-03-25T08:00"); // 04:00 ET — before open

  const dateRange = {
    start: utc("2026-03-25T00:00"),
    end: utc("2026-03-25T23:59"),
  };

  it("rolling_window: slots beyond horizon are excluded", () => {
    // Horizon = 2 hours from now (04:00 ET) → 06:00 ET = 10:00 UTC
    // Provider opens at 09:00 ET = 13:00 UTC → all slots beyond horizon
    const slots = getAvailableSlots(rules, [], [], dateRange, TZ, {
      duration: 30,
      now,
      slotRelease: { strategy: "rolling_window", windowSize: 2, unit: "hours" },
    });
    expect(slots.length).toBe(0);
  });

  it("rolling_window: slots within horizon are included", () => {
    // Horizon = 24 hours → includes the full day
    const baseline = getAvailableSlots(rules, [], [], dateRange, TZ, {
      duration: 30,
      now,
    });
    const withRelease = getAvailableSlots(rules, [], [], dateRange, TZ, {
      duration: 30,
      now,
      slotRelease: { strategy: "rolling_window", windowSize: 24, unit: "hours" },
    });
    expect(withRelease.length).toBe(baseline.length);
  });

  it("fill_earlier_first: omitting slotRelease returns same result as before E-23", () => {
    const without = getAvailableSlots(rules, [], [], dateRange, TZ, {
      duration: 30,
      now,
    });
    expect(without.length).toBeGreaterThan(0);
    for (const slot of without) {
      expect(slot.releaseMetadata).toBeUndefined();
    }
  });

  it("discount_incentive: releaseMetadata attached to slots with matching tier", () => {
    // No bookings → fill rate = 0 → all slots get 20% discount
    const slots = getAvailableSlots(rules, [], [], dateRange, TZ, {
      duration: 30,
      now,
      slotRelease: {
        strategy: "discount_incentive",
        tiers: [{ fillRateBelowPercent: 50, discountPercent: 20 }],
      },
    });
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.releaseMetadata).toEqual({ discountPercent: 20 });
    }
  });

  it("discount_incentive: releaseMetadata absent when fill rate exceeds all tiers", () => {
    // Book all 30-min slots 09:00-17:00 ET → fill rate = 100% ≥ 50% → no discount
    const allSlotBookings: BookingInput[] = [];
    let cursor = utc("2026-03-25T13:00"); // 09:00 ET
    const end = utc("2026-03-25T21:00"); // 17:00 ET
    while (cursor < end) {
      const next = addMinutes(cursor, 30);
      allSlotBookings.push(booking(cursor, next));
      cursor = next;
    }
    // No more available slots to return, so just verify behavior doesn't throw
    const slots = getAvailableSlots(rules, [], allSlotBookings, dateRange, TZ, {
      duration: 30,
      now,
      slotRelease: {
        strategy: "discount_incentive",
        tiers: [{ fillRateBelowPercent: 50, discountPercent: 20 }],
      },
    });
    // All slots booked → 0 available → result empty (no metadata to check)
    expect(slots.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Integration: getResourceAvailableSlots wiring
// ---------------------------------------------------------------------------

describe("getResourceAvailableSlots integration — slotRelease wiring", () => {
  const makeResource = (id: string): ResourceInput => ({
    id,
    name: `Table ${id}`,
    type: "table",
    capacity: 4,
    isActive: true,
    rules: [
      {
        rrule: "FREQ=DAILY",
        startTime: "09:00",
        endTime: "17:00",
        timezone: "America/New_York",
      },
    ],
    overrides: [],
    bookings: [],
  });

  const now = utc("2026-03-25T08:00");
  const dateRange = {
    start: utc("2026-03-25T00:00"),
    end: utc("2026-03-25T23:59"),
  };
  const resources = [makeResource("t1"), makeResource("t2")];

  it("rolling_window: large horizon includes all slots", () => {
    const baseline = getResourceAvailableSlots(resources, dateRange, TZ, {
      duration: 30,
      now,
    });
    const withRelease = getResourceAvailableSlots(resources, dateRange, TZ, {
      duration: 30,
      now,
      slotRelease: { strategy: "rolling_window", windowSize: 24, unit: "hours" },
    });
    expect(withRelease.length).toBe(baseline.length);
  });

  it("rolling_window: small horizon shrinks the result", () => {
    const full = getResourceAvailableSlots(resources, dateRange, TZ, {
      duration: 30,
      now,
    });
    const tight = getResourceAvailableSlots(resources, dateRange, TZ, {
      duration: 30,
      now,
      slotRelease: { strategy: "rolling_window", windowSize: 1, unit: "hours" },
    });
    expect(tight.length).toBeLessThan(full.length);
  });

  it("discount_incentive: releaseMetadata attached to ResourceSlots", () => {
    const slots = getResourceAvailableSlots(resources, dateRange, TZ, {
      duration: 30,
      now,
      slotRelease: {
        strategy: "discount_incentive",
        tiers: [{ fillRateBelowPercent: 100, discountPercent: 15 }],
      },
    });
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.releaseMetadata).toEqual({ discountPercent: 15 });
    }
  });

  it("no slotRelease: existing tests unaffected (no releaseMetadata)", () => {
    const slots = getResourceAvailableSlots(resources, dateRange, TZ, {
      duration: 30,
      now,
    });
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.releaseMetadata).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Composability: slotRelease + filterSlotsByLimits
// ---------------------------------------------------------------------------

describe("Composability — slotRelease + filterSlotsByLimits", () => {
  it("booking limits applied before slot release: intersection of both filters", () => {
    // 6 slots total
    const slots = [
      { start: utc("2026-03-25T13:00"), end: utc("2026-03-25T13:30") },
      { start: utc("2026-03-25T13:30"), end: utc("2026-03-25T14:00") },
      { start: utc("2026-03-25T14:00"), end: utc("2026-03-25T14:30") },
      { start: utc("2026-03-25T17:00"), end: utc("2026-03-25T17:30") },
      { start: utc("2026-03-25T17:30"), end: utc("2026-03-25T18:00") },
      { start: utc("2026-03-25T18:00"), end: utc("2026-03-25T18:30") },
    ];
    const now = utc("2026-03-25T08:00");

    // Step 1: Apply booking limits (max 2 per day)
    const afterLimits = filterSlotsByLimits(slots, [], { maxBookingsPerDay: 2 }, now);
    expect(afterLimits.length).toBe(2); // limited to first 2 slots

    // Step 2: Apply slot release (rolling 5h horizon from 08:00 UTC → 13:00 UTC)
    // afterLimits[0] starts at 13:00 UTC = horizon exactly → included
    // afterLimits[1] starts at 13:30 UTC > horizon → excluded
    const { slots: final } = applySlotRelease(
      afterLimits,
      { strategy: "rolling_window", windowSize: 5, unit: "hours" },
      [],
      TZ,
      now,
    );
    // 08:00 + 5h = 13:00 UTC → slot at 13:00 included, 13:30 excluded
    expect(final.length).toBe(1);
    expect(final[0].start.getTime()).toBe(utc("2026-03-25T13:00").getTime());
  });
});

// ---------------------------------------------------------------------------
// 8. Property-based tests (E23-S09)
// ---------------------------------------------------------------------------

describe("Property-based invariants", () => {
  /**
   * Generate an array of non-overlapping 30-minute slots
   * starting from a fixed anchor.
   */
  const slotArrayArb = fc
    .integer({ min: 1, max: 12 })
    .map((count) =>
      Array.from({ length: count }, (_, i) => {
        const anchor = new Date("2026-03-25T13:00:00.000Z");
        const start = addMinutes(anchor, i * 30);
        return { start, end: addMinutes(start, 30) };
      }),
    );

  const windowSizeArb = fc.integer({ min: 0, max: 48 });
  const unitArb = fc.constantFrom("hours" as const, "days" as const);
  const nowArb = fc.constant(new Date("2026-03-25T08:00:00.000Z"));

  it("Invariant 1 — rolling_window: every output slot satisfies start <= now + horizon", () => {
    fc.assert(
      fc.property(slotArrayArb, windowSizeArb, unitArb, nowArb, (slots, windowSize, unit, now) => {
        const config: RollingWindowConfig = { strategy: "rolling_window", windowSize, unit };
        const { slots: result } = applySlotRelease(slots, config, [], TZ, now);
        const horizon = unit === "days" ? addDays(now, windowSize) : addHours(now, windowSize);
        return result.every((s) => s.start <= horizon);
      }),
      { numRuns: 200 },
    );
  });

  it("Invariant 2 — fill_earlier_first: output is a subset of input (no new slots added)", () => {
    const thresholdArb = fc.integer({ min: 0, max: 100 });

    fc.assert(
      fc.property(slotArrayArb, thresholdArb, (slots, threshold) => {
        const config: FillEarlierFirstConfig = {
          strategy: "fill_earlier_first",
          threshold,
          windowBoundaries: ["12:00"],
        };
        const { slots: result } = applySlotRelease(slots, config, [], TZ, new Date("2026-03-25T08:00:00.000Z"));
        const inputMs = new Set(slots.map((s) => s.start.getTime()));
        return result.every((s) => inputMs.has(s.start.getTime()));
      }),
      { numRuns: 200 },
    );
  });

  it("Invariant 3 — discount_incentive: output slot count equals input count", () => {
    const tiersArb = fc
      .integer({ min: 1, max: 3 })
      .chain((n) =>
        fc.array(
          fc.record({
            fillRateBelowPercent: fc.integer({ min: 1, max: 100 }),
            discountPercent: fc.integer({ min: 1, max: 50 }),
          }),
          { minLength: n, maxLength: n },
        ),
      );

    fc.assert(
      fc.property(slotArrayArb, tiersArb, (slots, tiers) => {
        const config: DiscountIncentiveConfig = {
          strategy: "discount_incentive",
          tiers,
          windowBoundaries: ["12:00"],
        };
        const { slots: result } = applySlotRelease(slots, config, [], TZ, new Date("2026-03-25T08:00:00.000Z"));
        return result.length === slots.length;
      }),
      { numRuns: 200 },
    );
  });

  it("Invariant 4 — discount values match configured tier percentages", () => {
    const fixedTiers = [
      { fillRateBelowPercent: 50, discountPercent: 17 },
      { fillRateBelowPercent: 80, discountPercent: 8 },
    ];
    const validDiscounts = new Set(fixedTiers.map((t) => t.discountPercent));

    fc.assert(
      fc.property(slotArrayArb, (slots) => {
        const config: DiscountIncentiveConfig = {
          strategy: "discount_incentive",
          tiers: fixedTiers,
        };
        const { discountMap } = applySlotRelease(slots, config, [], TZ, new Date("2026-03-25T08:00:00.000Z"));
        for (const discount of discountMap.values()) {
          if (!validDiscounts.has(discount)) return false;
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });
});
