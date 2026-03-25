/**
 * Integration test suite for @thebookingkit/core
 *
 * These tests validate that the public API modules compose correctly under
 * realistic end-to-end booking workflows. Every test exercises multiple modules
 * together; unit-level assertions belong in the individual module test files.
 *
 * Flows covered:
 *   Flow 1  — Barber shop end-to-end
 *   Flow 2  — Restaurant resource booking end-to-end
 *   Flow 3  — Team scheduling + recurring bookings
 *   Flow 4  — Walk-in queue + kiosk mode
 *   Flow 5  — Edge cases: cross-feature composition
 *   Flow 6  — Seats/group booking + resource capacity
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Slot engine
import { getAvailableSlots, isSlotAvailable } from "../slot-engine.js";

// Resource engine
import {
  getResourceAvailableSlots,
  assignResource,
  isResourceSlotAvailable,
  getResourcePoolSummary,
} from "../resource-engine.js";

// Booking limits
import {
  computeBookingLimits,
  filterSlotsByLimits,
} from "../booking-limits.js";

// Slot release
import { applySlotRelease, computeWindowFillRates } from "../slot-release.js";

// Confirmation mode
import {
  getInitialBookingStatus,
  getAutoRejectDeadline,
  isPendingBookingOverdue,
  CONFIRMATION_TIMEOUT_HOURS,
} from "../confirmation-mode.js";

// Team scheduling
import { getTeamSlots, assignHost } from "../team-scheduling.js";

// Recurring bookings
import {
  generateOccurrences,
  checkRecurringAvailability,
  cancelFutureOccurrences,
} from "../recurring-bookings.js";

// Seats
import {
  computeSeatAvailability,
  canReserveSeat,
  validateSeatReservation,
  SeatError,
} from "../seats.js";

// Walk-in
import {
  estimateWaitTime,
  isValidQueueTransition,
  validateQueueTransition,
  recomputeQueuePositions,
  recomputeWaitTimes,
  isAcceptingWalkIns,
  InvalidQueueTransitionError,
} from "../walk-in.js";

// Kiosk
import {
  findConflicts,
  canReschedule,
  validateReschedule,
  validateBreakBlock,
  breakBlockToOverride,
  resolveKioskSettings,
  DEFAULT_KIOSK_SETTINGS,
} from "../kiosk.js";

// Errors
import { ResourceUnavailableError } from "../errors.js";

// Types
import type {
  AvailabilityRuleInput,
  AvailabilityOverrideInput,
  BookingInput,
  ResourceInput,
} from "../types.js";
import type { WalkInQueueEntry } from "../walk-in.js";
import type { SeatAttendee } from "../seats.js";

// ---------------------------------------------------------------------------
// Shared time anchor: all tests live in the future relative to this point
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date("2026-03-23T08:00:00Z"); // Monday 08:00 UTC

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/** Build a simple weekday 9-5 availability rule in the given timezone. */
function makeWeekdayRule(timezone: string): AvailabilityRuleInput {
  return {
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    startTime: "09:00",
    endTime: "17:00",
    timezone,
  };
}

/** Build a UTC date range covering a single calendar day. */
function dayRange(isoDate: string): { start: Date; end: Date } {
  return {
    start: new Date(`${isoDate}T00:00:00Z`),
    end: new Date(`${isoDate}T23:59:59Z`),
  };
}

/** Create a confirmed booking occupying a specific UTC window. */
function makeBooking(
  startISO: string,
  endISO: string,
  id?: string,
  status: BookingInput["status"] = "confirmed",
  guestCount = 1,
): BookingInput {
  return {
    id,
    startsAt: new Date(startISO),
    endsAt: new Date(endISO),
    status,
    guestCount,
  };
}

/** Minimal walk-in queue entry factory. */
function makeQueueEntry(
  id: string,
  position: number,
  status: WalkInQueueEntry["status"],
  durationMinutes: number,
  serviceStartedAt?: Date,
): WalkInQueueEntry {
  const now = FIXED_NOW;
  return {
    id,
    bookingId: `booking-${id}`,
    providerId: "provider-1",
    queuePosition: position,
    estimatedWaitMinutes: 0,
    checkedInAt: now,
    serviceStartedAt: serviceStartedAt ?? null,
    completedAt: null,
    status,
    customerName: `Customer ${id}`,
    eventTypeId: "haircut",
    durationMinutes,
    createdAt: now,
    updatedAt: now,
  };
}

/** Build a seat attendee record. */
function makeAttendee(
  id: string,
  email: string,
  status: SeatAttendee["status"] = "confirmed",
): SeatAttendee {
  return {
    id,
    bookingId: `booking-${id}`,
    attendeeEmail: email,
    attendeeName: `Attendee ${id}`,
    status,
  };
}

// ---------------------------------------------------------------------------
// Flow 1 — Barber Shop End-to-End
// ---------------------------------------------------------------------------

describe("Flow 1: Barber Shop End-to-End", () => {
  // Provider is in New York; all times are relative to ET (UTC-4 during EDT)
  // 2026-03-23 is in EDT (clocks spring forward 2026-03-08), so UTC-4.
  // 09:00 ET = 13:00 UTC  |  17:00 ET = 21:00 UTC

  const TZ = "America/New_York";
  const rule = makeWeekdayRule(TZ);
  const MONDAY = "2026-03-23"; // The fixed-now date (Monday)
  const range = dayRange(MONDAY);
  const DURATION = 30;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("1a: initial slot grid — 16 thirty-minute slots Mon-Fri 9-5 ET", () => {
    const slots = getAvailableSlots([rule], [], [], range, TZ, {
      duration: DURATION,
      now: FIXED_NOW,
    });

    // 9:00–17:00 = 8 hours = 16 × 30-min slots
    expect(slots.length).toBe(16);
    expect(slots[0].localStart).toContain("09:00");
    expect(slots[slots.length - 1].localStart).toContain("16:30");
  });

  it("1b: booked slot disappears on recompute", () => {
    // Book the 10:00 ET slot (14:00 UTC)
    const booking = makeBooking(
      "2026-03-23T14:00:00Z",
      "2026-03-23T14:30:00Z",
      "b1",
    );

    const slotsAfter = getAvailableSlots([rule], [], [booking], range, TZ, {
      duration: DURATION,
      now: FIXED_NOW,
    });

    expect(slotsAfter.length).toBe(15);
    const bookedTimes = slotsAfter.map((s) => s.localStart);
    expect(bookedTimes.every((t) => !t.includes("10:00"))).toBe(true);
  });

  it("1c: booking limit enforced — max 3 per day", () => {
    // Fill 3 slots already booked on the same day
    const existingBookings: BookingInput[] = [
      makeBooking("2026-03-23T13:00:00Z", "2026-03-23T13:30:00Z", "b1"),
      makeBooking("2026-03-23T13:30:00Z", "2026-03-23T14:00:00Z", "b2"),
      makeBooking("2026-03-23T14:00:00Z", "2026-03-23T14:30:00Z", "b3"),
    ];

    const status = computeBookingLimits(
      existingBookings,
      { maxBookingsPerDay: 3 },
      new Date("2026-03-23T00:00:00Z"),
    );

    expect(status.canBook).toBe(false);
    expect(status.dailyCount).toBe(3);
    expect(status.dailyRemaining).toBe(0);

    // filterSlotsByLimits should yield no candidates because the cap is already met
    const rawSlots = getAvailableSlots([rule], [], existingBookings, range, TZ, {
      duration: DURATION,
      now: FIXED_NOW,
    });
    const shapedSlots = rawSlots.map((s) => ({
      start: new Date(s.startTime),
      end: new Date(s.endTime),
    }));

    const allowed = filterSlotsByLimits(shapedSlots, existingBookings, {
      maxBookingsPerDay: 3,
    }, FIXED_NOW);

    expect(allowed.length).toBe(0);
  });

  it("1d: fill_earlier_first — afternoon window hidden until morning window is fully filled", () => {
    // How fill_earlier_first works in practice:
    //
    // applySlotRelease receives only the AVAILABLE (unbooked) slots — not the full
    // original grid. As morning slots are booked they are removed from the available
    // pool, so computeWindowFillRates sees fewer and fewer morning candidates.
    // A window with 0 remaining candidates is treated as "vacuously full" (fill
    // rate = 1.0 >= any threshold), which releases the next window.
    //
    // Scenario: 8 morning slots (09:00–12:30 ET). Book all 8 → morning window
    // has 0 available slots → vacuously full → afternoon unlocked.
    // Book only 7 → 1 remaining slot in morning → fill rate = 0/1 = 0 < threshold
    // → afternoon still hidden.

    const afternoonBoundaryUTC = new Date("2026-03-23T17:00:00Z"); // 13:00 EDT

    const fillConfig = {
      strategy: "fill_earlier_first" as const,
      threshold: 70,
      windowBoundaries: ["13:00"], // splits day: window-0 = 09:00-13:00 ET, window-1 = 13:00-17:00 ET
    };

    // All 8 morning slot starts in UTC (09:00–12:30 EDT = 13:00–16:30 UTC)
    const allMorningBookings: BookingInput[] = [
      makeBooking("2026-03-23T13:00:00Z", "2026-03-23T13:30:00Z", "m1"),
      makeBooking("2026-03-23T13:30:00Z", "2026-03-23T14:00:00Z", "m2"),
      makeBooking("2026-03-23T14:00:00Z", "2026-03-23T14:30:00Z", "m3"),
      makeBooking("2026-03-23T14:30:00Z", "2026-03-23T15:00:00Z", "m4"),
      makeBooking("2026-03-23T15:00:00Z", "2026-03-23T15:30:00Z", "m5"),
      makeBooking("2026-03-23T15:30:00Z", "2026-03-23T16:00:00Z", "m6"),
      makeBooking("2026-03-23T16:00:00Z", "2026-03-23T16:30:00Z", "m7"),
      makeBooking("2026-03-23T16:30:00Z", "2026-03-23T17:00:00Z", "m8"),
    ];

    // 7 morning bookings: 1 morning slot remains → fill rate 0/1 = 0% < threshold
    const sevenBookings = allMorningBookings.slice(0, 7);
    const rawSlots7 = getAvailableSlots([rule], [], sevenBookings, range, TZ, {
      duration: DURATION,
      now: FIXED_NOW,
    });
    const shaped7 = rawSlots7.map((s) => ({
      start: new Date(s.startTime),
      end: new Date(s.endTime),
    }));
    const result7 = applySlotRelease(shaped7, fillConfig, sevenBookings, TZ, FIXED_NOW);

    const hasAfternoon7 = result7.slots.some(
      (s) => s.start.getTime() >= afternoonBoundaryUTC.getTime(),
    );
    expect(hasAfternoon7).toBe(false);

    // All 8 morning bookings: morning window is empty (0 candidates) → vacuously full
    // (fill rate = 1.0 >= any threshold) → afternoon now released
    const rawSlots8 = getAvailableSlots([rule], [], allMorningBookings, range, TZ, {
      duration: DURATION,
      now: FIXED_NOW,
    });
    const shaped8 = rawSlots8.map((s) => ({
      start: new Date(s.startTime),
      end: new Date(s.endTime),
    }));
    const result8 = applySlotRelease(shaped8, fillConfig, allMorningBookings, TZ, FIXED_NOW);

    const hasAfternoon8 = result8.slots.some(
      (s) => s.start.getTime() >= afternoonBoundaryUTC.getTime(),
    );
    expect(hasAfternoon8).toBe(true);
  });

  it("1e: confirmation mode — pending status and 24-hour auto-reject deadline", () => {
    // Booking created at fixed now
    const createdAt = FIXED_NOW;

    const status = getInitialBookingStatus(true);
    expect(status).toBe("pending");

    const deadline = getAutoRejectDeadline(createdAt);
    const expectedDeadline = new Date(
      FIXED_NOW.getTime() + CONFIRMATION_TIMEOUT_HOURS * 60 * 60 * 1000,
    );
    expect(deadline.getTime()).toBe(expectedDeadline.getTime());

    // Not yet overdue at creation
    expect(isPendingBookingOverdue(createdAt, FIXED_NOW)).toBe(false);

    // Overdue 25 hours later
    const twentyFiveHoursLater = new Date(
      FIXED_NOW.getTime() + 25 * 60 * 60 * 1000,
    );
    expect(isPendingBookingOverdue(createdAt, twentyFiveHoursLater)).toBe(true);
  });

  it("1f: kiosk reschedule — findConflicts + canReschedule + validateReschedule", () => {
    // Existing booking: 10:00–10:30 ET (14:00-14:30 UTC)
    const existingBooking = makeBooking(
      "2026-03-23T14:00:00Z",
      "2026-03-23T14:30:00Z",
      "existing-1",
    );

    // The booking to reschedule is confirmed — should be reschedulable
    expect(canReschedule("confirmed")).toBe(true);
    expect(canReschedule("completed")).toBe(false);
    expect(canReschedule("cancelled")).toBe(false);

    // Attempt to reschedule into a conflicting slot
    const conflictResult = validateReschedule(
      "confirmed",
      [rule],
      [],
      [existingBooking],
      new Date("2026-03-23T14:00:00Z"),
      new Date("2026-03-23T14:30:00Z"),
    );
    expect(conflictResult.valid).toBe(false);
    expect(conflictResult.reason).toBe("conflict");

    // Reschedule to a free slot: 11:00–11:30 ET (15:00-15:30 UTC)
    const validResult = validateReschedule(
      "confirmed",
      [rule],
      [],
      [existingBooking],
      new Date("2026-03-23T15:00:00Z"),
      new Date("2026-03-23T15:30:00Z"),
    );
    expect(validResult.valid).toBe(true);

    // findConflicts returns the overlapping booking
    const conflicts = findConflicts(
      [existingBooking].map((b) => ({
        id: b.id,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        status: b.status,
        customerName: "Jane Doe",
      })),
      new Date("2026-03-23T14:00:00Z"),
      new Date("2026-03-23T14:30:00Z"),
    );
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].bookingId).toBe("existing-1");
  });

  it("1g: break block validates against existing bookings and converts to override", () => {
    const existingBooking = makeBooking(
      "2026-03-23T14:00:00Z",
      "2026-03-23T14:30:00Z",
      "b1",
    );

    // Break overlapping an existing booking
    const conflictingBreak = {
      title: "Lunch",
      startTime: new Date("2026-03-23T14:00:00Z"),
      endTime: new Date("2026-03-23T15:00:00Z"),
      blockType: "break" as const,
      recurring: false,
    };

    const conflictResult = validateBreakBlock(conflictingBreak, [existingBooking]);
    expect(conflictResult.valid).toBe(false);
    expect(conflictResult.conflictingBookings.length).toBe(1);

    // Break on a free slot
    const freeBreak = {
      title: "Lunch",
      startTime: new Date("2026-03-23T17:00:00Z"),
      endTime: new Date("2026-03-23T18:00:00Z"),
      blockType: "break" as const,
      recurring: false,
    };

    const freeResult = validateBreakBlock(freeBreak, [existingBooking]);
    expect(freeResult.valid).toBe(true);

    // Convert the free break to an override
    const override = breakBlockToOverride(freeBreak, TZ);
    expect(override.isUnavailable).toBe(true);
    // The break is at 17:00 UTC which is 13:00 EDT
    expect(override.startTime).toBe("13:00");
    expect(override.endTime).toBe("14:00");
  });
});

// ---------------------------------------------------------------------------
// Flow 2 — Restaurant Resource Booking End-to-End
// ---------------------------------------------------------------------------

describe("Flow 2: Restaurant Resource Booking End-to-End", () => {
  const TZ = "America/Chicago"; // Restaurant in CT (UTC-5 CDT on 2026-03-23)
  // 2026-03-23 is CDT (spring forward 2026-03-08), so UTC-5.
  // Lunch: 11:30-14:00 CT = 16:30-19:00 UTC
  // Dinner: 17:30-22:00 CT = 22:30 UTC – 03:00 UTC next day

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Two-hour block for the day (lunch service)
  const lunchRule: AvailabilityRuleInput = {
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU",
    startTime: "11:30",
    endTime: "14:00",
    timezone: TZ,
  };

  // Dinner service rule (same days)
  const dinnerRule: AvailabilityRuleInput = {
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU",
    startTime: "17:30",
    endTime: "22:00",
    timezone: TZ,
  };

  function makeTable(
    id: string,
    name: string,
    type: string,
    capacity: number,
    bookings: BookingInput[] = [],
  ): ResourceInput {
    return {
      id,
      name,
      type,
      capacity,
      isActive: true,
      rules: [lunchRule, dinnerRule],
      overrides: [],
      bookings,
    };
  }

  const tables: ResourceInput[] = [
    makeTable("t2-1", "Table 2-1", "2-top", 2),
    makeTable("t2-2", "Table 2-2", "2-top", 2),
    makeTable("t2-3", "Table 2-3", "2-top", 2),
    makeTable("t2-4", "Table 2-4", "2-top", 2),
    makeTable("t2-5", "Table 2-5", "2-top", 2),
    makeTable("t4-1", "Table 4-1", "4-top", 4),
    makeTable("t4-2", "Table 4-2", "4-top", 4),
    makeTable("t4-3", "Table 4-3", "4-top", 4),
    makeTable("t8-1", "Table 8-1", "8-top", 8),
  ];

  const MONDAY = "2026-03-23";
  const range = dayRange(MONDAY);
  const SLOT_DURATION = 90; // 90-minute dining slot

  it("2a: party of 4 only gets 4-top and 8-top options", () => {
    const slots = getResourceAvailableSlots(tables, range, TZ, {
      duration: SLOT_DURATION,
      minCapacity: 4,
      now: FIXED_NOW,
    });

    expect(slots.length).toBeGreaterThan(0);

    // Every slot's available resources must have capacity >= 4
    for (const slot of slots) {
      for (const res of slot.availableResources) {
        const tableObj = tables.find((t) => t.id === res.resourceId)!;
        expect(tableObj.capacity).toBeGreaterThanOrEqual(4);
      }
    }

    // No 2-top IDs should appear
    const allIds = slots.flatMap((s) => s.availableResources.map((r) => r.resourceId));
    expect(allIds.some((id) => id.startsWith("t2-"))).toBe(false);
  });

  it("2b: best_fit assigns 4-top over 8-top for party of 4", () => {
    // A lunch slot: 11:30 CT = 16:30 UTC
    const slotStart = new Date("2026-03-23T16:30:00Z");
    const slotEnd = new Date("2026-03-23T18:00:00Z"); // 90 min

    const result = assignResource(tables, slotStart, slotEnd, {
      strategy: "best_fit",
      requestedCapacity: 4,
    });

    expect(result.reason).toBe("best_fit");
    // Should pick a 4-top (capacity 4), not the 8-top (capacity 8)
    const chosen = tables.find((t) => t.id === result.resourceId)!;
    expect(chosen.type).toBe("4-top");
    expect(chosen.capacity).toBe(4);
  });

  it("2c: booked slot shows reduced capacity", () => {
    const slotStart = new Date("2026-03-23T16:30:00Z");
    const slotEnd = new Date("2026-03-23T18:00:00Z");

    // Book t4-1 at lunch
    const tablesWithBooking = tables.map((t) =>
      t.id === "t4-1"
        ? { ...t, bookings: [makeBooking("2026-03-23T16:30:00Z", "2026-03-23T18:00:00Z", "b-t4-1")] }
        : t,
    );

    // isResourceSlotAvailable on the booked table
    const check = isResourceSlotAvailable(
      tablesWithBooking,
      "t4-1",
      slotStart,
      slotEnd,
    );
    expect(check.available).toBe(false);
    if (!check.available) {
      expect(check.reason).toBe("resource_booked");
    }

    // Pool-level check should still be available (other 4-tops free)
    const poolCheck = isResourceSlotAvailable(
      tablesWithBooking,
      undefined,
      slotStart,
      slotEnd,
    );
    expect(poolCheck.available).toBe(true);
  });

  it("2d: pool summary reports utilization correctly", () => {
    // A resource is considered "unavailable" in the summary only when its
    // remainingCapacity drops to 0 — i.e. the booking's guestCount fully fills
    // the table capacity.  For a 4-top with capacity=4 we must book guestCount=4
    // so that remaining = 4 - 4 = 0.

    const slotStart = new Date("2026-03-23T16:30:00Z");
    const slotEnd = new Date("2026-03-23T18:00:00Z");

    // Book all three 4-tops at full capacity (guestCount = 4 fills a 4-top)
    const allFourTopsBooked = tables.map((t) => {
      if (t.type === "4-top") {
        return {
          ...t,
          bookings: [
            makeBooking(
              slotStart.toISOString(),
              slotEnd.toISOString(),
              `b-${t.id}`,
              "confirmed",
              4, // fills all 4 seats → remainingCapacity = 0
            ),
          ],
        };
      }
      return t;
    });

    const summaries = getResourcePoolSummary(allFourTopsBooked, range, TZ, {
      duration: SLOT_DURATION,
      now: FIXED_NOW,
    });

    expect(summaries.length).toBeGreaterThan(0);

    // Find the lunch slot summary
    const lunchSummary = summaries.find(
      (s) => new Date(s.startTime).getTime() === slotStart.getTime(),
    );
    expect(lunchSummary).toBeDefined();

    if (lunchSummary) {
      // 3 four-tops are fully occupied out of 9 total → 3/9 = 33%
      expect(lunchSummary.utilizationPercent).toBe(33);

      // byType breakdown: 4-top should show 0 available (all 3 fully booked)
      expect(lunchSummary.byType["4-top"].available).toBe(0);
      expect(lunchSummary.byType["4-top"].total).toBe(3);

      // 5 two-tops and 1 eight-top still available at that slot
      expect(lunchSummary.byType["2-top"].available).toBe(5);
      expect(lunchSummary.byType["8-top"].available).toBe(1);
    }
  });

  it("2e: when all 4-tops are booked, best_fit falls back to 8-top for party of 4", () => {
    const slotStart = new Date("2026-03-23T16:30:00Z");
    const slotEnd = new Date("2026-03-23T18:00:00Z");

    const allFourTopsBooked = tables.map((t) => {
      if (t.type === "4-top") {
        return {
          ...t,
          bookings: [
            makeBooking(
              slotStart.toISOString(),
              slotEnd.toISOString(),
              `b-${t.id}`,
            ),
          ],
        };
      }
      return t;
    });

    const result = assignResource(allFourTopsBooked, slotStart, slotEnd, {
      strategy: "best_fit",
      requestedCapacity: 4,
    });

    // Only 8-top remains available with capacity >= 4
    expect(result.resourceId).toBe("t8-1");
  });

  it("2f: booking the 8-top causes ResourceUnavailableError for next party of 4+", () => {
    const slotStart = new Date("2026-03-23T16:30:00Z");
    const slotEnd = new Date("2026-03-23T18:00:00Z");

    // All 4-tops AND the 8-top are booked
    const allLargeTablesBooked = tables.map((t) => {
      if (t.type === "4-top" || t.type === "8-top") {
        return {
          ...t,
          bookings: [
            makeBooking(
              slotStart.toISOString(),
              slotEnd.toISOString(),
              `b-${t.id}`,
            ),
          ],
        };
      }
      return t;
    });

    expect(() =>
      assignResource(allLargeTablesBooked, slotStart, slotEnd, {
        strategy: "best_fit",
        requestedCapacity: 4,
      }),
    ).toThrow(ResourceUnavailableError);
  });

  it("2g: rolling_window release hides dinner slots beyond 24 hours", () => {
    // Now is 08:00 UTC Monday. 24 h horizon = 08:00 UTC Tuesday.
    // Dinner slots on Monday start at 22:30 UTC (17:30 CT) — within the window.
    // Dinner slots on TUESDAY start at 22:30 UTC Tuesday — beyond the 24 h horizon.
    const twoDayRange = {
      start: new Date("2026-03-23T00:00:00Z"),
      end: new Date("2026-03-24T23:59:59Z"),
    };

    const slots = getResourceAvailableSlots(tables, twoDayRange, TZ, {
      duration: SLOT_DURATION,
      now: FIXED_NOW,
      slotRelease: {
        strategy: "rolling_window",
        windowSize: 24,
        unit: "hours",
      },
    });

    const horizon = new Date(FIXED_NOW.getTime() + 24 * 60 * 60 * 1000);
    for (const slot of slots) {
      expect(new Date(slot.startTime).getTime()).toBeLessThanOrEqual(
        horizon.getTime(),
      );
    }
  });

  it("2h: discount_incentive annotates under-filled lunch slots", () => {
    // No bookings yet — fill rate is 0% < 30% threshold → should get 20% discount
    const slots = getResourceAvailableSlots(tables, range, TZ, {
      duration: SLOT_DURATION,
      now: FIXED_NOW,
      slotRelease: {
        strategy: "discount_incentive",
        tiers: [
          { fillRateBelowPercent: 30, discountPercent: 20 },
          { fillRateBelowPercent: 60, discountPercent: 10 },
        ],
        windowBoundaries: ["14:00", "17:30"],
      },
    });

    // All slots should be present (discount_incentive never filters)
    expect(slots.length).toBeGreaterThan(0);

    // Every slot in an unfilled window should carry releaseMetadata
    const lunchSlotStart = new Date("2026-03-23T16:30:00Z");
    const lunchSlot = slots.find(
      (s) => new Date(s.startTime).getTime() === lunchSlotStart.getTime(),
    );
    // Lunch is in window 0 (before 14:00 CT boundary at 19:00 UTC); fill rate = 0%
    // 0% < 30% → first tier applies → 20% discount
    expect(lunchSlot?.releaseMetadata?.discountPercent).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Flow 3 — Team Scheduling + Recurring Bookings
// ---------------------------------------------------------------------------

describe("Flow 3: Team Scheduling + Recurring Bookings", () => {
  const TZ = "UTC";
  const MONDAY = "2026-03-23";
  const range = dayRange(MONDAY);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Member A: Mon-Fri 09:00-17:00 UTC, no bookings
  // Member B: Mon-Wed 10:00-18:00 UTC, no bookings (starts later)
  // Member C: Mon-Fri 08:00-12:00 UTC only (part-time mornings)

  const memberA = {
    userId: "alice",
    role: "member" as const,
    priority: 1,
    weight: 100,
    rules: [makeWeekdayRule(TZ)],
    overrides: [],
    bookings: [],
  };

  const memberB = {
    userId: "bob",
    role: "member" as const,
    priority: 1,
    weight: 100,
    rules: [
      {
        rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE",
        startTime: "10:00",
        endTime: "18:00",
        timezone: TZ,
      },
    ],
    overrides: [],
    bookings: [],
  };

  const memberC = {
    userId: "carol",
    role: "member" as const,
    priority: 2,
    weight: 50,
    rules: [
      {
        rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
        startTime: "08:00",
        endTime: "12:00",
        timezone: TZ,
      },
    ],
    overrides: [],
    bookings: [],
  };

  it("3a: round_robin returns union of all members' schedules", () => {
    const teamSlots = getTeamSlots(
      [memberA, memberB, memberC],
      "round_robin",
      range,
      TZ,
      { duration: 60, now: FIXED_NOW },
    );

    expect(teamSlots.length).toBeGreaterThan(0);

    // The 08:00 slot should only have carol available (alice starts at 09:00,
    // bob starts at 10:00)
    const eightAm = teamSlots.find((s) => s.localStart.includes("08:00"));
    expect(eightAm).toBeDefined();
    if (eightAm) {
      expect(eightAm.availableMembers).toContain("carol");
      expect(eightAm.availableMembers).not.toContain("alice");
      expect(eightAm.availableMembers).not.toContain("bob");
    }

    // The 10:00 slot should have alice, bob, and carol
    const tenAm = teamSlots.find((s) => s.localStart.includes("10:00"));
    expect(tenAm).toBeDefined();
    if (tenAm) {
      expect(tenAm.availableMembers).toContain("alice");
      expect(tenAm.availableMembers).toContain("bob");
      expect(tenAm.availableMembers).toContain("carol");
    }
  });

  it("3b: assignHost load-balances by weight when priority is equal", () => {
    // alice and bob share priority 1 with equal weight 100.
    // Give bob more past bookings — alice should be selected.
    const result = assignHost(
      [memberA, memberB, memberC],
      ["alice", "bob"],
      [
        { userId: "alice", confirmedCount: 2 },
        { userId: "bob", confirmedCount: 5 },
      ],
    );

    // Alice has fewer bookings relative to her weight target → she is chosen
    expect(result.hostId).toBe("alice");
    expect(result.reason).toBe("weight_balanced");
  });

  it("3c: generateOccurrences produces 4 weekly occurrences on the correct calendar dates", () => {
    // date-fns addWeeks uses LOCAL calendar arithmetic; on machines with a DST
    // boundary inside the 4-week window the UTC millisecond gap between adjacent
    // occurrences can differ by ±1 h (DST shift). Asserting on ISO date strings
    // rather than raw millisecond diffs makes this test timezone-agnostic.
    const series = {
      startsAt: new Date("2026-03-23T09:00:00Z"),
      durationMinutes: 60,
      frequency: "weekly" as const,
      count: 4,
    };

    const occurrences = generateOccurrences(series);
    expect(occurrences.length).toBe(4);

    // Index values must be sequential
    expect(occurrences.map((o) => o.index)).toEqual([0, 1, 2, 3]);

    // Each occurrence must start exactly 7 calendar days after the previous
    // (verified by comparing ISO date components, not raw ms).
    // We extract UTC date (YYYY-MM-DD) for each occurrence and verify the
    // sequence advances by 7 days each time.
    const dates = occurrences.map((o) => o.startsAt.toISOString().slice(0, 10));
    expect(dates[0]).toBe("2026-03-23");
    expect(dates[1]).toBe("2026-03-30");
    expect(dates[2]).toBe("2026-04-06");
    expect(dates[3]).toBe("2026-04-13");

    // Duration check: each occurrence is exactly 60 minutes long
    for (const occ of occurrences) {
      const durationMs = occ.endsAt.getTime() - occ.startsAt.getTime();
      expect(durationMs).toBe(60 * 60 * 1000);
    }

    // Occurrences must be strictly ascending
    for (let i = 1; i < occurrences.length; i++) {
      expect(occurrences[i].startsAt.getTime()).toBeGreaterThan(
        occurrences[i - 1].startsAt.getTime(),
      );
    }
  });

  it("3d: checkRecurringAvailability reports all 4 slots free with no bookings", () => {
    const series = {
      startsAt: new Date("2026-03-23T09:00:00Z"),
      durationMinutes: 60,
      frequency: "weekly" as const,
      count: 4,
    };

    const occurrences = generateOccurrences(series);
    const result = checkRecurringAvailability(occurrences, []);

    expect(result.allAvailable).toBe(true);
    expect(result.conflicts.length).toBe(0);
    expect(result.occurrences.length).toBe(4);
  });

  it("3e: booking first occurrence leaves second occurrence available", () => {
    const series = {
      startsAt: new Date("2026-03-23T09:00:00Z"),
      durationMinutes: 60,
      frequency: "weekly" as const,
      count: 4,
    };

    const occurrences = generateOccurrences(series);

    // Book the first occurrence
    const firstOccBooking = makeBooking(
      "2026-03-23T09:00:00Z",
      "2026-03-23T10:00:00Z",
      "occ-0",
    );

    const result = checkRecurringAvailability(occurrences, [firstOccBooking]);

    expect(result.allAvailable).toBe(false);
    expect(result.conflicts).toContain(0);
    expect(result.conflicts).not.toContain(1);
    expect(result.conflicts).not.toContain(2);
    expect(result.conflicts).not.toContain(3);
  });

  it("3f: cancelFutureOccurrences skips past/terminal, cancels future confirmed bookings", () => {
    const now = FIXED_NOW;

    const seriesBookings = [
      // occurrence 0: in the past (before now) → skip
      {
        id: "occ-0",
        index: 0,
        startsAt: new Date("2026-03-16T09:00:00Z"),
        endsAt: new Date("2026-03-16T10:00:00Z"),
        status: "completed",
      },
      // occurrence 1: before now (already started in the past) → skip
      {
        id: "occ-1",
        index: 1,
        startsAt: new Date("2026-03-20T09:00:00Z"),
        endsAt: new Date("2026-03-20T10:00:00Z"),
        status: "confirmed",
      },
      // occurrence 2: future → cancel
      {
        id: "occ-2",
        index: 2,
        startsAt: new Date("2026-03-30T09:00:00Z"),
        endsAt: new Date("2026-03-30T10:00:00Z"),
        status: "confirmed",
      },
      // occurrence 3: future → cancel
      {
        id: "occ-3",
        index: 3,
        startsAt: new Date("2026-04-06T09:00:00Z"),
        endsAt: new Date("2026-04-06T10:00:00Z"),
        status: "confirmed",
      },
    ];

    const result = cancelFutureOccurrences(seriesBookings, now);

    expect(result.cancelledIds).toEqual(expect.arrayContaining(["occ-2", "occ-3"]));
    expect(result.skippedIds).toEqual(expect.arrayContaining(["occ-0", "occ-1"]));
    expect(result.cancelledIds.length).toBe(2);
    expect(result.skippedIds.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Flow 4 — Walk-In Queue + Kiosk Mode
// ---------------------------------------------------------------------------

describe("Flow 4: Walk-In Queue + Kiosk Mode", () => {
  const TZ = "America/New_York";
  const rule = makeWeekdayRule(TZ);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 2 scheduled bookings already on the books at 09:00 and 09:30 ET (13:00 and 13:30 UTC)
  const scheduledBookings: BookingInput[] = [
    makeBooking("2026-03-23T13:00:00Z", "2026-03-23T13:30:00Z", "sched-1"),
    makeBooking("2026-03-23T13:30:00Z", "2026-03-23T14:00:00Z", "sched-2"),
  ];

  it("4a: walk-in added, wait time estimated from empty queue with active booking", () => {
    // Now is 08:00 UTC. The 09:00 ET booking starts at 13:00 UTC (5 hours away).
    // No queue entries yet — estimate should be 0 (no one in queue, no current booking).
    const estimate = estimateWaitTime([], scheduledBookings, 30, FIXED_NOW);

    // No queue, no current booking in progress → immediate
    expect(estimate.estimatedMinutes).toBe(0);
    expect(estimate.queueLength).toBe(0);
  });

  it("4b: two walk-ins queue up, positions are 1 and 2", () => {
    const entry1 = makeQueueEntry("wq-1", 1, "queued", 30);
    const entry2 = makeQueueEntry("wq-2", 2, "queued", 30);
    const queue = [entry1, entry2];

    const recomputed = recomputeQueuePositions(queue);
    expect(recomputed[0].queuePosition).toBe(1);
    expect(recomputed[1].queuePosition).toBe(2);

    // A third walk-in's wait would be 30 + 30 = 60 min
    const estimate = estimateWaitTime(queue, [], 30, FIXED_NOW);
    expect(estimate.queueLength).toBe(2);
    expect(estimate.estimatedMinutes).toBe(60);
  });

  it("4c: starting service for first entry advances the queue", () => {
    const entry1 = makeQueueEntry("wq-1", 1, "in_service", 30, FIXED_NOW);
    const entry2 = makeQueueEntry("wq-2", 2, "queued", 30);

    // Valid transition: queued → in_service
    expect(isValidQueueTransition("queued", "in_service")).toBe(true);

    // Invalid: in_service → queued
    expect(isValidQueueTransition("in_service", "queued")).toBe(false);
    expect(() => validateQueueTransition("in_service", "queued")).toThrow(
      InvalidQueueTransitionError,
    );

    // After completing entry1, entry2 becomes position 1
    const updatedQueue = recomputeQueuePositions([entry2]);
    expect(updatedQueue[0].queuePosition).toBe(1);
  });

  it("4d: completing service updates queue wait times", () => {
    // entry1 is 20 min into a 30-min service → 10 min remaining
    const serviceStartedAt = new Date(FIXED_NOW.getTime() - 20 * 60 * 1000);
    const entry1 = makeQueueEntry("wq-1", 1, "in_service", 30, serviceStartedAt);
    const entry2 = makeQueueEntry("wq-2", 2, "queued", 45);

    const updated = recomputeWaitTimes([entry1, entry2], [], FIXED_NOW);

    // entry1 is in service → wait = 0
    const updatedEntry1 = updated.find((e) => e.id === "wq-1")!;
    expect(updatedEntry1.estimatedWaitMinutes).toBe(0);

    // entry2 waits for remaining time of entry1 (10 min)
    const updatedEntry2 = updated.find((e) => e.id === "wq-2")!;
    expect(updatedEntry2.estimatedWaitMinutes).toBe(10);
  });

  it("4e: validateBreakBlock catches conflict with existing scheduled booking", () => {
    const conflictingBreak = {
      title: "Quick Break",
      startTime: new Date("2026-03-23T13:00:00Z"),
      endTime: new Date("2026-03-23T13:30:00Z"),
      blockType: "break" as const,
      recurring: false,
    };

    const result = validateBreakBlock(conflictingBreak, scheduledBookings);
    expect(result.valid).toBe(false);
    expect(result.conflictingBookings.length).toBeGreaterThan(0);
    expect(result.conflictingBookings[0].id).toBe("sched-1");
  });

  it("4f: resolveKioskSettings merges provider settings over org defaults over system defaults", () => {
    const orgDefaults = {
      defaultView: "week" as const,
      autoLockMinutes: 10,
      showWalkInSidebar: false,
    };

    const providerSettings = {
      defaultView: "3day" as const,
      slotHeightPx: 60,
    };

    const resolved = resolveKioskSettings(providerSettings, orgDefaults);

    // Provider wins on defaultView
    expect(resolved.defaultView).toBe("3day");
    // Org wins on autoLockMinutes (provider didn't set it)
    expect(resolved.autoLockMinutes).toBe(10);
    // Provider wins on slotHeightPx
    expect(resolved.slotHeightPx).toBe(60);
    // Org sets showWalkInSidebar = false
    expect(resolved.showWalkInSidebar).toBe(false);
    // System defaults fill the rest
    expect(resolved.blockDensity).toBe(DEFAULT_KIOSK_SETTINGS.blockDensity);
  });

  it("4g: isAcceptingWalkIns checks working hours using the slot engine", () => {
    // Provider has Mon-Fri 09:00-17:00 ET.
    // FIXED_NOW is 08:00 UTC on Monday = 04:00 ET (before open).
    const stateBeforeOpen = isAcceptingWalkIns(true, [rule], [], FIXED_NOW);
    expect(stateBeforeOpen.acceptingWalkIns).toBe(true);
    expect(stateBeforeOpen.withinWorkingHours).toBe(false);

    // 14:00 UTC Monday = 10:00 ET (within hours)
    const duringHours = new Date("2026-03-23T14:00:00Z");
    const stateDuring = isAcceptingWalkIns(true, [rule], [], duringHours);
    expect(stateDuring.acceptingWalkIns).toBe(true);
    expect(stateDuring.withinWorkingHours).toBe(true);

    // Provider explicitly not accepting walk-ins
    const stateDisabled = isAcceptingWalkIns(false, [rule], [], duringHours);
    expect(stateDisabled.acceptingWalkIns).toBe(false);
    expect(stateDisabled.withinWorkingHours).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Flow 5 — Edge Cases: Cross-Feature Composition
// ---------------------------------------------------------------------------

describe("Flow 5: Edge Cases — Cross-Feature Composition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("5a: slot release + booking limits + buffer time all applied together", () => {
    const TZ = "UTC";
    const rule = makeWeekdayRule(TZ);
    const MONDAY = "2026-03-23";
    const range = dayRange(MONDAY);

    // 1 existing booking at 10:00 (with 15-min buffer before and after)
    const existingBooking = makeBooking(
      "2026-03-23T10:00:00Z",
      "2026-03-23T10:30:00Z",
      "buf-1",
    );

    // Step 1: get slots with buffer
    const rawSlots = getAvailableSlots([rule], [], [existingBooking], range, TZ, {
      duration: 30,
      bufferBefore: 15,
      bufferAfter: 15,
      now: FIXED_NOW,
    });

    // 09:30 (buffer before), 10:00 (booking), and 10:30 (buffer after) are all blocked
    const times = rawSlots.map((s) => s.localStart);
    expect(times.some((t) => t.includes("09:30"))).toBe(false);
    expect(times.some((t) => t.includes("10:00"))).toBe(false);
    expect(times.some((t) => t.includes("10:30"))).toBe(false);

    // Step 2: apply booking limits on top (max 1 future booking per day — already have 1)
    const shaped = rawSlots.map((s) => ({
      start: new Date(s.startTime),
      end: new Date(s.endTime),
    }));

    const limited = filterSlotsByLimits(shaped, [existingBooking], {
      maxBookingsPerDay: 1,
    }, FIXED_NOW);

    // All remaining candidate slots should be filtered out (daily cap already met)
    expect(limited.length).toBe(0);
  });

  it("5b: recurring booking + resource — same 4-top available weekly", () => {
    const TZ = "UTC";
    const tableRule: AvailabilityRuleInput = {
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      startTime: "10:00",
      endTime: "12:00",
      timezone: TZ,
    };

    const table: ResourceInput = {
      id: "table-1",
      name: "Reserved Table",
      type: "4-top",
      capacity: 4,
      isActive: true,
      rules: [tableRule],
      overrides: [],
      bookings: [],
    };

    // Generate 4 weekly occurrences
    const series = {
      startsAt: new Date("2026-03-23T10:00:00Z"),
      durationMinutes: 60,
      frequency: "weekly" as const,
      count: 4,
    };
    const occurrences = generateOccurrences(series);

    // Each occurrence must have the resource available
    for (const occ of occurrences) {
      const check = isResourceSlotAvailable(
        [table],
        "table-1",
        occ.startsAt,
        occ.endsAt,
      );
      expect(check.available).toBe(true);
    }

    // Book the first occurrence
    const firstBooking = makeBooking(
      "2026-03-23T10:00:00Z",
      "2026-03-23T11:00:00Z",
      "recurring-1",
    );
    const tableWithFirstBooked = {
      ...table,
      bookings: [firstBooking],
    };

    // First occurrence now conflicts at the resource level
    const check0 = isResourceSlotAvailable(
      [tableWithFirstBooked],
      "table-1",
      occurrences[0].startsAt,
      occurrences[0].endsAt,
    );
    expect(check0.available).toBe(false);

    // Second occurrence is still free at the resource level
    const check1 = isResourceSlotAvailable(
      [tableWithFirstBooked],
      "table-1",
      occurrences[1].startsAt,
      occurrences[1].endsAt,
    );
    expect(check1.available).toBe(true);
  });

  it("5c: DST transition day — slot computation produces valid non-overlapping results", () => {
    // 2026-03-08 is the US spring-forward day (clocks advance 02:00→03:00 ET).
    // Provider is in ET; their 9-5 schedule should still produce valid slots.
    const TZ = "America/New_York";
    const rule = makeWeekdayRule(TZ);

    // Pin time to before that date
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));

    const dstRange = {
      start: new Date("2026-03-08T00:00:00Z"),
      end: new Date("2026-03-08T23:59:59Z"),
    };

    const slots = getAvailableSlots([rule], [], [], dstRange, TZ, {
      duration: 30,
      now: new Date("2026-03-01T00:00:00Z"),
    });

    // Should produce slots — DST day is a Sunday, so the weekday rule won't fire.
    // Using a Monday around DST for validity: 2026-03-09 (first Monday after DST).
    const postDstRange = {
      start: new Date("2026-03-09T00:00:00Z"),
      end: new Date("2026-03-09T23:59:59Z"),
    };

    const postDstSlots = getAvailableSlots([rule], [], [], postDstRange, TZ, {
      duration: 30,
      now: new Date("2026-03-01T00:00:00Z"),
    });

    // 9 AM–5 PM EDT (UTC-4) = 16 slots
    expect(postDstSlots.length).toBe(16);

    // Verify no two slots overlap
    for (let i = 1; i < postDstSlots.length; i++) {
      const prevEnd = new Date(postDstSlots[i - 1].endTime).getTime();
      const currStart = new Date(postDstSlots[i].startTime).getTime();
      expect(currStart).toBeGreaterThanOrEqual(prevEnd);
    }

    // First slot should be 09:00 EDT on March 9
    expect(postDstSlots[0].localStart).toContain("09:00");
  });

  it("5d: midnight-crossing availability produces valid resource slots", () => {
    // A resource available from 22:00 to 02:00 UTC (crosses midnight)
    const TZ = "UTC";
    const lateNightRule: AvailabilityRuleInput = {
      rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU",
      startTime: "22:00",
      endTime: "02:00", // Crosses midnight
      timezone: TZ,
    };

    const resource: ResourceInput = {
      id: "late-room",
      name: "Late Night Room",
      type: "room",
      capacity: 10,
      isActive: true,
      rules: [lateNightRule],
      overrides: [],
      bookings: [],
    };

    const range = {
      start: new Date("2026-03-23T20:00:00Z"),
      end: new Date("2026-03-24T04:00:00Z"),
    };

    const slots = getResourceAvailableSlots([resource], range, TZ, {
      duration: 60,
      now: FIXED_NOW,
    });

    // Should produce slots spanning from 22:00 into 02:00 the next day
    expect(slots.length).toBeGreaterThan(0);

    // All slots must have valid, non-reversed start/end times
    for (const slot of slots) {
      expect(new Date(slot.endTime).getTime()).toBeGreaterThan(
        new Date(slot.startTime).getTime(),
      );
    }
  });

  it("5e: empty state — all functions return sensible defaults", () => {
    const emptyRange = dayRange("2026-03-23");

    // getAvailableSlots with no rules → empty array
    const slots = getAvailableSlots([], [], [], emptyRange, "UTC", {
      now: FIXED_NOW,
    });
    expect(slots).toEqual([]);

    // getResourceAvailableSlots with empty pool → empty array
    const resourceSlots = getResourceAvailableSlots([], emptyRange, "UTC", {
      now: FIXED_NOW,
    });
    expect(resourceSlots).toEqual([]);

    // getResourcePoolSummary with empty pool → empty array
    const summaries = getResourcePoolSummary([], emptyRange, "UTC", {
      now: FIXED_NOW,
    });
    expect(summaries).toEqual([]);

    // computeBookingLimits with no limits → canBook: true
    const limits = computeBookingLimits([], {}, new Date("2026-03-23T00:00:00Z"));
    expect(limits.canBook).toBe(true);
    expect(limits.dailyLimit).toBeNull();
    expect(limits.weeklyLimit).toBeNull();

    // filterSlotsByLimits with empty limits → all slots pass
    const limitResult = filterSlotsByLimits(
      [{ start: new Date("2026-03-23T09:00:00Z"), end: new Date("2026-03-23T09:30:00Z") }],
      [],
      {},
      FIXED_NOW,
    );
    expect(limitResult.length).toBe(1);

    // getTeamSlots with empty members → empty array
    const teamSlots = getTeamSlots([], "round_robin", emptyRange, "UTC", {
      now: FIXED_NOW,
    });
    expect(teamSlots).toEqual([]);

    // findConflicts with empty existing → no conflicts
    const conflicts = findConflicts(
      [],
      new Date("2026-03-23T10:00:00Z"),
      new Date("2026-03-23T10:30:00Z"),
    );
    expect(conflicts).toEqual([]);

    // applySlotRelease with empty slots → empty result
    const releaseResult = applySlotRelease(
      [],
      { strategy: "rolling_window", windowSize: 24, unit: "hours" },
      [],
      "UTC",
      FIXED_NOW,
    );
    expect(releaseResult.slots).toEqual([]);
    expect(releaseResult.discountMap.size).toBe(0);

    // computeWindowFillRates with empty slots → empty map
    const fillRates = computeWindowFillRates([], [], [], "UTC");
    expect(fillRates.size).toBe(0);

    // estimateWaitTime on empty queue, no bookings → 0 wait
    const estimate = estimateWaitTime([], [], 30, FIXED_NOW);
    expect(estimate.estimatedMinutes).toBe(0);
    expect(estimate.queueLength).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Flow 6 — Seats/Group Booking + Resource Capacity
// ---------------------------------------------------------------------------

describe("Flow 6: Seats/Group Booking + Resource Capacity", () => {
  const TZ = "UTC";
  const CLASS_START = new Date("2026-03-23T10:00:00Z");
  const CLASS_END = new Date("2026-03-23T11:00:00Z");
  const MAX_SEATS = 20;
  const CLASS_ID = "yoga-class-1";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Build a yoga studio resource with 20-capacity
  const studioRule: AvailabilityRuleInput = {
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    startTime: "09:00",
    endTime: "18:00",
    timezone: TZ,
  };

  it("6a: initial seat availability is full 20 seats", () => {
    const availability = computeSeatAvailability(MAX_SEATS, []);

    expect(availability.maxSeats).toBe(MAX_SEATS);
    expect(availability.bookedSeats).toBe(0);
    expect(availability.availableSeats).toBe(MAX_SEATS);
    expect(availability.isFull).toBe(false);
  });

  it("6b: reserving 5 seats leaves 15 remaining", () => {
    const attendees = Array.from({ length: 5 }, (_, i) =>
      makeAttendee(`a${i}`, `attendee${i}@example.com`),
    );

    const availability = computeSeatAvailability(MAX_SEATS, attendees);
    expect(availability.bookedSeats).toBe(5);
    expect(availability.availableSeats).toBe(15);
    expect(availability.isFull).toBe(false);
  });

  it("6c: canReserveSeat returns true when capacity available", () => {
    const attendees = Array.from({ length: 5 }, (_, i) =>
      makeAttendee(`a${i}`, `attendee${i}@example.com`),
    );

    // Can reserve 1 more
    expect(canReserveSeat(MAX_SEATS, attendees, 1)).toBe(true);
    // Can reserve 15 more (fills it exactly)
    expect(canReserveSeat(MAX_SEATS, attendees, 15)).toBe(true);
    // Cannot reserve 16 more (exceeds capacity)
    expect(canReserveSeat(MAX_SEATS, attendees, 16)).toBe(false);
  });

  it("6d: minCapacity filter — resource still visible for groups of 15 when 5 are booked", () => {
    // The yoga studio as a ResourceInput
    const studio: ResourceInput = {
      id: "studio-1",
      name: "Yoga Studio",
      type: "studio",
      capacity: MAX_SEATS,
      isActive: true,
      rules: [studioRule],
      overrides: [],
      bookings: [
        // 5 seats taken (guestCount = 5 on a single booking)
        makeBooking(
          CLASS_START.toISOString(),
          CLASS_END.toISOString(),
          "group-b1",
          "confirmed",
          5,
        ),
      ],
    };

    const range = {
      start: new Date("2026-03-23T00:00:00Z"),
      end: new Date("2026-03-23T23:59:59Z"),
    };

    // minCapacity = 15 → remaining capacity after 5 guests = 15
    // Resource should still appear
    const slots = getResourceAvailableSlots([studio], range, TZ, {
      duration: 60,
      minCapacity: 15,
      now: FIXED_NOW,
    });

    const classSlot = slots.find(
      (s) => new Date(s.startTime).getTime() === CLASS_START.getTime(),
    );
    expect(classSlot).toBeDefined();

    if (classSlot) {
      const studioEntry = classSlot.availableResources.find(
        (r) => r.resourceId === "studio-1",
      );
      expect(studioEntry).toBeDefined();
      // Remaining = 20 - 5 = 15
      expect(studioEntry?.remainingCapacity).toBe(15);
    }
  });

  it("6e: filling to capacity causes canReserveSeat to return false", () => {
    const attendees = Array.from({ length: MAX_SEATS }, (_, i) =>
      makeAttendee(`a${i}`, `attendee${i}@example.com`),
    );

    const availability = computeSeatAvailability(MAX_SEATS, attendees);
    expect(availability.isFull).toBe(true);
    expect(availability.availableSeats).toBe(0);

    expect(canReserveSeat(MAX_SEATS, attendees)).toBe(false);

    // validateSeatReservation throws SeatError
    expect(() =>
      validateSeatReservation(MAX_SEATS, attendees, "new@example.com"),
    ).toThrow(SeatError);
  });

  it("6f: cancelling 2 seats reopens capacity", () => {
    // Start full
    const attendees: SeatAttendee[] = Array.from({ length: MAX_SEATS }, (_, i) =>
      makeAttendee(`a${i}`, `attendee${i}@example.com`),
    );

    const fullAvailability = computeSeatAvailability(MAX_SEATS, attendees);
    expect(fullAvailability.isFull).toBe(true);

    // Cancel 2 attendees
    const withCancellations: SeatAttendee[] = attendees.map((a, i) =>
      i < 2 ? { ...a, status: "cancelled" } : a,
    );

    const afterCancel = computeSeatAvailability(MAX_SEATS, withCancellations);
    expect(afterCancel.bookedSeats).toBe(18);
    expect(afterCancel.availableSeats).toBe(2);
    expect(afterCancel.isFull).toBe(false);

    // Can now reserve 2 seats again
    expect(canReserveSeat(MAX_SEATS, withCancellations, 2)).toBe(true);
    expect(canReserveSeat(MAX_SEATS, withCancellations, 3)).toBe(false);
  });

  it("6g: validateSeatReservation throws on duplicate attendee", () => {
    const attendees: SeatAttendee[] = [
      makeAttendee("a1", "alice@example.com"),
    ];

    expect(() =>
      validateSeatReservation(MAX_SEATS, attendees, "alice@example.com"),
    ).toThrow(SeatError);
  });

  it("6h: resource slot drops from available list when fully occupied by seat bookings", () => {
    // Book the entire 20-capacity studio with a single group booking
    const studio: ResourceInput = {
      id: "studio-1",
      name: "Yoga Studio",
      type: "studio",
      capacity: MAX_SEATS,
      isActive: true,
      rules: [studioRule],
      overrides: [],
      bookings: [
        makeBooking(
          CLASS_START.toISOString(),
          CLASS_END.toISOString(),
          "full-class",
          "confirmed",
          MAX_SEATS, // full group
        ),
      ],
    };

    const check = isResourceSlotAvailable(
      [studio],
      "studio-1",
      CLASS_START,
      CLASS_END,
    );

    // Resource is fully booked
    expect(check.available).toBe(false);
  });

  it("6i: seat module + resource engine consistent — both see capacity as exhausted", () => {
    // Model a yoga class where the resource tracks group bookings
    const studio: ResourceInput = {
      id: "studio-1",
      name: "Yoga Studio",
      type: "studio",
      capacity: MAX_SEATS,
      isActive: true,
      rules: [studioRule],
      overrides: [],
      bookings: [
        makeBooking(
          CLASS_START.toISOString(),
          CLASS_END.toISOString(),
          "full-class",
          "confirmed",
          MAX_SEATS,
        ),
      ],
    };

    // Seat module perspective
    const attendees: SeatAttendee[] = Array.from({ length: MAX_SEATS }, (_, i) =>
      makeAttendee(`a${i}`, `attendee${i}@example.com`),
    );
    const seatAvailability = computeSeatAvailability(MAX_SEATS, attendees);
    expect(seatAvailability.isFull).toBe(true);

    // Resource engine perspective
    const resourceCheck = isResourceSlotAvailable(
      [studio],
      "studio-1",
      CLASS_START,
      CLASS_END,
    );
    expect(resourceCheck.available).toBe(false);

    // Both agree: fully booked
    expect(seatAvailability.isFull && !resourceCheck.available).toBe(true);
  });
});
