import { describe, it, expect } from "vitest";
import {
  estimateWaitTime,
  findNextAvailableGap,
  isValidQueueTransition,
  validateQueueTransition,
  recomputeQueuePositions,
  reorderQueue,
  recomputeWaitTimes,
  isAcceptingWalkIns,
  computeWalkInAnalytics,
  WalkInsDisabledError,
  QueueEntryNotFoundError,
  InvalidQueueTransitionError,
  type WalkInQueueEntry,
  type WalkInStatus,
} from "../walk-in.js";
import type { BookingInput, AvailabilityRuleInput } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueueEntry(
  overrides: Partial<WalkInQueueEntry> & { id: string },
): WalkInQueueEntry {
  const now = new Date("2026-03-09T10:00:00Z");
  return {
    bookingId: `booking-${overrides.id}`,
    providerId: "provider-1",
    queuePosition: 1,
    estimatedWaitMinutes: 0,
    checkedInAt: now,
    serviceStartedAt: null,
    completedAt: null,
    status: "queued",
    customerName: "Test Customer",
    eventTypeId: "event-1",
    durationMinutes: 30,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeBooking(
  startsAt: string,
  endsAt: string,
  status: BookingInput["status"] = "confirmed",
): BookingInput {
  return {
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    status,
  };
}

const RULES: AvailabilityRuleInput[] = [
  {
    rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    startTime: "09:00",
    endTime: "17:00",
    timezone: "UTC",
  },
];

// ---------------------------------------------------------------------------
// Queue State Machine
// ---------------------------------------------------------------------------

describe("Queue State Machine", () => {
  it("allows queued → in_service", () => {
    expect(isValidQueueTransition("queued", "in_service")).toBe(true);
  });

  it("allows queued → no_show", () => {
    expect(isValidQueueTransition("queued", "no_show")).toBe(true);
  });

  it("allows queued → cancelled", () => {
    expect(isValidQueueTransition("queued", "cancelled")).toBe(true);
  });

  it("allows in_service → completed", () => {
    expect(isValidQueueTransition("in_service", "completed")).toBe(true);
  });

  it("allows in_service → no_show", () => {
    expect(isValidQueueTransition("in_service", "no_show")).toBe(true);
  });

  it("disallows completed → anything", () => {
    expect(isValidQueueTransition("completed", "queued")).toBe(false);
    expect(isValidQueueTransition("completed", "in_service")).toBe(false);
    expect(isValidQueueTransition("completed", "cancelled")).toBe(false);
  });

  it("disallows no_show → anything", () => {
    expect(isValidQueueTransition("no_show", "queued")).toBe(false);
  });

  it("disallows cancelled → anything", () => {
    expect(isValidQueueTransition("cancelled", "queued")).toBe(false);
  });

  it("disallows queued → completed (must go through in_service)", () => {
    expect(isValidQueueTransition("queued", "completed")).toBe(false);
  });

  it("validateQueueTransition throws on invalid transition", () => {
    expect(() => validateQueueTransition("completed", "queued")).toThrow(
      InvalidQueueTransitionError,
    );
  });

  it("validateQueueTransition does not throw on valid transition", () => {
    expect(() =>
      validateQueueTransition("queued", "in_service"),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Wait Time Estimation
// ---------------------------------------------------------------------------

describe("estimateWaitTime", () => {
  const now = new Date("2026-03-09T10:00:00Z");

  it("returns 0 wait when queue is empty and no current booking", () => {
    const result = estimateWaitTime([], [], 30, now);
    expect(result.estimatedMinutes).toBe(0);
    expect(result.queueLength).toBe(0);
    expect(result.nextAvailableAt).toEqual(now);
  });

  it("returns remaining booking time when queue is empty but booking in progress", () => {
    const bookings = [
      makeBooking("2026-03-09T09:30:00Z", "2026-03-09T10:15:00Z"),
    ];
    const result = estimateWaitTime([], bookings, 30, now);
    expect(result.estimatedMinutes).toBe(15);
    expect(result.queueLength).toBe(0);
  });

  it("accounts for in-service walk-in remaining time", () => {
    const inService = makeQueueEntry({
      id: "1",
      status: "in_service",
      serviceStartedAt: new Date("2026-03-09T09:50:00Z"),
      durationMinutes: 30,
    });
    const result = estimateWaitTime([inService], [], 30, now);
    // 10 minutes elapsed of 30 → 20 minutes remaining
    expect(result.estimatedMinutes).toBe(20);
    expect(result.queueLength).toBe(1);
  });

  it("sums queued entry durations", () => {
    const entries = [
      makeQueueEntry({ id: "1", queuePosition: 1, durationMinutes: 20 }),
      makeQueueEntry({ id: "2", queuePosition: 2, durationMinutes: 15 }),
    ];
    const result = estimateWaitTime(entries, [], 30, now);
    expect(result.estimatedMinutes).toBe(35);
    expect(result.queueLength).toBe(2);
  });

  it("combines in-service remaining + queued durations", () => {
    const entries = [
      makeQueueEntry({
        id: "1",
        status: "in_service",
        serviceStartedAt: new Date("2026-03-09T09:50:00Z"),
        durationMinutes: 30,
        queuePosition: 1,
      }),
      makeQueueEntry({
        id: "2",
        queuePosition: 2,
        durationMinutes: 20,
      }),
    ];
    const result = estimateWaitTime(entries, [], 30, now);
    // 20 (remaining in-service) + 20 (queued) = 40
    expect(result.estimatedMinutes).toBe(40);
    expect(result.queueLength).toBe(2);
  });

  it("ignores completed/cancelled entries", () => {
    const entries = [
      makeQueueEntry({ id: "1", status: "completed", durationMinutes: 30 }),
      makeQueueEntry({ id: "2", status: "cancelled", durationMinutes: 30 }),
      makeQueueEntry({ id: "3", status: "queued", durationMinutes: 15 }),
    ];
    const result = estimateWaitTime(entries, [], 30, now);
    expect(result.estimatedMinutes).toBe(15);
    expect(result.queueLength).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Find Next Available Gap
// ---------------------------------------------------------------------------

describe("findNextAvailableGap", () => {
  const now = new Date("2026-03-09T10:00:00Z");

  it("returns now when queue is empty and no bookings", () => {
    const result = findNextAvailableGap([], [], 30, 0, 0, now);
    expect(result).toEqual(now);
  });

  it("returns after current booking when one is in progress", () => {
    const bookings = [
      makeBooking("2026-03-09T09:30:00Z", "2026-03-09T10:30:00Z"),
    ];
    const result = findNextAvailableGap([], bookings, 30, 0, 0, now);
    expect(result).toEqual(new Date("2026-03-09T10:30:00Z"));
  });

  it("places after queued entries", () => {
    const queue = [
      makeQueueEntry({ id: "1", queuePosition: 1, durationMinutes: 20 }),
      makeQueueEntry({ id: "2", queuePosition: 2, durationMinutes: 15 }),
    ];
    const result = findNextAvailableGap(queue, [], 30, 0, 0, now);
    // Queue occupies 10:00-10:20, 10:20-10:35 → next at 10:35
    expect(result).toEqual(new Date("2026-03-09T10:35:00Z"));
  });

  it("respects buffer time around bookings", () => {
    const bookings = [
      makeBooking("2026-03-09T10:30:00Z", "2026-03-09T11:00:00Z"),
    ];
    const result = findNextAvailableGap([], bookings, 30, 5, 5, now);
    // Booking occupies 10:25-11:05 with buffers → walk-in at now (10:00) fits
    // since 10:00 + 30 = 10:30 > 10:25 (buffer start) — wait, the walk-in at 10:00 ends at 10:30
    // which overlaps with booking buffer at 10:25... so pushed to 11:05
    expect(result).toEqual(new Date("2026-03-09T11:05:00Z"));
  });
});

// ---------------------------------------------------------------------------
// Queue Management
// ---------------------------------------------------------------------------

describe("recomputeQueuePositions", () => {
  it("renumbers positions starting from 1", () => {
    const entries = [
      makeQueueEntry({ id: "a", queuePosition: 3 }),
      makeQueueEntry({ id: "b", queuePosition: 7 }),
      makeQueueEntry({ id: "c", queuePosition: 12 }),
    ];
    const result = recomputeQueuePositions(entries);
    expect(result.map((e) => e.queuePosition)).toEqual([1, 2, 3]);
  });

  it("preserves entry order", () => {
    const entries = [
      makeQueueEntry({ id: "b", queuePosition: 5 }),
      makeQueueEntry({ id: "a", queuePosition: 2 }),
    ];
    const result = recomputeQueuePositions(entries);
    expect(result[0].id).toBe("b");
    expect(result[1].id).toBe("a");
  });
});

describe("reorderQueue", () => {
  it("reorders queued entries by given ID order", () => {
    const entries = [
      makeQueueEntry({ id: "a", queuePosition: 1 }),
      makeQueueEntry({ id: "b", queuePosition: 2 }),
      makeQueueEntry({ id: "c", queuePosition: 3 }),
    ];
    const result = reorderQueue(entries, ["c", "a", "b"]);
    expect(result.map((e) => e.id)).toEqual(["c", "a", "b"]);
    expect(result.map((e) => e.queuePosition)).toEqual([1, 2, 3]);
  });

  it("keeps in-service entry at position 1", () => {
    const entries = [
      makeQueueEntry({ id: "a", status: "in_service", queuePosition: 1 }),
      makeQueueEntry({ id: "b", queuePosition: 2 }),
      makeQueueEntry({ id: "c", queuePosition: 3 }),
    ];
    const result = reorderQueue(entries, ["a", "c", "b"]);
    expect(result[0].id).toBe("a");
    expect(result[0].queuePosition).toBe(1);
    expect(result[1].id).toBe("c");
    expect(result[1].queuePosition).toBe(2);
  });

  it("throws if unknown ID is provided", () => {
    const entries = [makeQueueEntry({ id: "a" })];
    expect(() => reorderQueue(entries, ["unknown"])).toThrow(
      'Queue entry "unknown" not found',
    );
  });
});

describe("recomputeWaitTimes", () => {
  const now = new Date("2026-03-09T10:00:00Z");

  it("sets 0 wait for in-service entry", () => {
    const queue = [
      makeQueueEntry({
        id: "1",
        status: "in_service",
        serviceStartedAt: new Date("2026-03-09T09:50:00Z"),
        durationMinutes: 30,
        queuePosition: 1,
      }),
    ];
    const result = recomputeWaitTimes(queue, [], now);
    expect(result[0].estimatedWaitMinutes).toBe(0);
  });

  it("computes cumulative wait for queued entries", () => {
    const queue = [
      makeQueueEntry({
        id: "1",
        status: "in_service",
        serviceStartedAt: new Date("2026-03-09T09:50:00Z"),
        durationMinutes: 30,
        queuePosition: 1,
      }),
      makeQueueEntry({
        id: "2",
        status: "queued",
        durationMinutes: 20,
        queuePosition: 2,
      }),
      makeQueueEntry({
        id: "3",
        status: "queued",
        durationMinutes: 15,
        queuePosition: 3,
      }),
    ];
    const result = recomputeWaitTimes(queue, [], now);
    // In-service: 0 wait
    // Entry 2: 20 min remaining from in-service
    // Entry 3: 20 + 20 = 40 min
    expect(result[0].estimatedWaitMinutes).toBe(0);
    expect(result[1].estimatedWaitMinutes).toBe(20);
    expect(result[2].estimatedWaitMinutes).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// Walk-In Availability
// ---------------------------------------------------------------------------

describe("isAcceptingWalkIns", () => {
  // Monday 2026-03-09 is actually a Monday
  const mondayMorning = new Date("2026-03-09T10:00:00Z");

  it("returns false when toggle is off", () => {
    const result = isAcceptingWalkIns(false, RULES, [], mondayMorning);
    expect(result.acceptingWalkIns).toBe(false);
  });

  it("returns true + within hours when toggle is on and within availability", () => {
    const result = isAcceptingWalkIns(true, RULES, [], mondayMorning);
    expect(result.acceptingWalkIns).toBe(true);
    expect(result.withinWorkingHours).toBe(true);
  });

  it("returns true + outside hours on weekend", () => {
    // 2026-03-08 is a Sunday
    const sunday = new Date("2026-03-08T10:00:00Z");
    const result = isAcceptingWalkIns(true, RULES, [], sunday);
    expect(result.acceptingWalkIns).toBe(true);
    expect(result.withinWorkingHours).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Walk-In Analytics
// ---------------------------------------------------------------------------

describe("computeWalkInAnalytics", () => {
  it("returns zeros for empty entries", () => {
    const result = computeWalkInAnalytics([], 0);
    expect(result.totalWalkIns).toBe(0);
    expect(result.averageWaitMinutes).toBe(0);
    expect(result.walkInRatio).toBe(0);
  });

  it("computes correct stats", () => {
    const entries = [
      makeQueueEntry({
        id: "1",
        status: "completed",
        checkedInAt: new Date("2026-03-09T10:00:00Z"),
        serviceStartedAt: new Date("2026-03-09T10:10:00Z"),
        completedAt: new Date("2026-03-09T10:40:00Z"),
        durationMinutes: 30,
      }),
      makeQueueEntry({
        id: "2",
        status: "completed",
        checkedInAt: new Date("2026-03-09T11:00:00Z"),
        serviceStartedAt: new Date("2026-03-09T11:20:00Z"),
        completedAt: new Date("2026-03-09T11:50:00Z"),
        durationMinutes: 30,
      }),
      makeQueueEntry({
        id: "3",
        status: "no_show",
        checkedInAt: new Date("2026-03-09T12:00:00Z"),
        durationMinutes: 30,
      }),
    ];

    const result = computeWalkInAnalytics(entries, 10);

    expect(result.totalWalkIns).toBe(3);
    expect(result.completedCount).toBe(2);
    expect(result.noShowCount).toBe(1);
    expect(result.noShowRate).toBeCloseTo(1 / 3);
    // Wait: (10 + 20) / 2 = 15
    expect(result.averageWaitMinutes).toBe(15);
    // Service duration: (30 + 30) / 2 = 30
    expect(result.averageServiceDuration).toBe(30);
    // Walk-in ratio: 3/10
    expect(result.walkInRatio).toBeCloseTo(0.3);
    // Hourly: hour 10→1, hour 11→1, hour 12→1
    expect(result.hourlyDistribution[10]).toBe(1);
    expect(result.hourlyDistribution[11]).toBe(1);
    expect(result.hourlyDistribution[12]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Error Classes
// ---------------------------------------------------------------------------

describe("Error Classes", () => {
  it("WalkInsDisabledError has correct properties", () => {
    const err = new WalkInsDisabledError();
    expect(err.code).toBe("WALK_INS_DISABLED");
    expect(err.name).toBe("WalkInsDisabledError");
    expect(err.message).toContain("not currently accepting");
  });

  it("QueueEntryNotFoundError includes entry ID", () => {
    const err = new QueueEntryNotFoundError("abc-123");
    expect(err.code).toBe("QUEUE_ENTRY_NOT_FOUND");
    expect(err.message).toContain("abc-123");
  });

  it("InvalidQueueTransitionError includes statuses", () => {
    const err = new InvalidQueueTransitionError("completed", "queued");
    expect(err.code).toBe("INVALID_QUEUE_TRANSITION");
    expect(err.message).toContain("completed");
    expect(err.message).toContain("queued");
  });
});
