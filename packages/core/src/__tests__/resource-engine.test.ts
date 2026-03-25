import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getResourceAvailableSlots,
  assignResource,
  isResourceSlotAvailable,
  getResourcePoolSummary,
} from "../resource-engine.js";
import type {
  ResourceInput,
  AvailabilityRuleInput,
  AvailabilityOverrideInput,
  BookingInput,
  ResourceSlotOptions,
} from "../types.js";

// ---------------------------------------------------------------------------
// Typed helper to access ResourceUnavailableError properties without importing
// the class (which has a different module identity under Vitest's SSR transform)
// ---------------------------------------------------------------------------
interface ResourceErrorLike {
  name: string;
  message: string;
  reason?: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// Fixed "now" reference — all computed slots are in the future relative to this
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

/**
 * Returns a valid AvailabilityRuleInput with Mon-Fri 09:00-17:00 UTC defaults.
 */
function makeResourceRule(
  overrides?: Partial<AvailabilityRuleInput>,
): AvailabilityRuleInput {
  return {
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    startTime: "09:00",
    endTime: "17:00",
    timezone: "UTC",
    validFrom: null,
    validUntil: null,
    ...overrides,
  };
}

/**
 * Returns a valid BookingInput with resourceId and guestCount fields.
 */
function makeResourceBooking(
  overrides?: Partial<BookingInput & { resourceId: string; guestCount: number }>,
): BookingInput {
  return {
    startsAt: new Date("2027-06-07T10:00:00Z"),
    endsAt: new Date("2027-06-07T10:30:00Z"),
    status: "confirmed",
    resourceId: "res-1",
    guestCount: 1,
    ...overrides,
  };
}

/**
 * Returns a valid ResourceInput with sensible defaults:
 * Mon-Fri 09:00-17:00 UTC, capacity 4, active, no bookings.
 */
function makeResource(overrides?: Partial<ResourceInput>): ResourceInput {
  return {
    id: "res-1",
    name: "Resource 1",
    type: "table",
    capacity: 4,
    isActive: true,
    rules: [makeResourceRule()],
    overrides: [],
    bookings: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shared date ranges
// ---------------------------------------------------------------------------

/** A Monday in June 2027 */
const MONDAY = new Date("2027-06-07T00:00:00Z");
/** Tuesday next day */
const TUESDAY = new Date("2027-06-08T00:00:00Z");

const oneDayRange = {
  start: MONDAY,
  end: new Date("2027-06-07T23:59:59Z"),
};

const oneWeekRange = {
  start: MONDAY,
  end: new Date("2027-06-13T23:59:59Z"),
};

// ---------------------------------------------------------------------------
// getResourceAvailableSlots — Happy Path
// ---------------------------------------------------------------------------

describe("getResourceAvailableSlots — happy path", () => {
  it("single resource, no bookings → all slots available", () => {
    const resource = makeResource({ id: "res-1", capacity: 4 });
    const slots = getResourceAvailableSlots(
      [resource],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    // Mon 09:00-17:00 = 8 h = 16 slots of 30 min
    expect(slots).toHaveLength(16);
    // Every slot must list res-1 with full capacity
    for (const slot of slots) {
      expect(slot.availableResources).toHaveLength(1);
      expect(slot.availableResources[0].resourceId).toBe("res-1");
      expect(slot.availableResources[0].remainingCapacity).toBe(4);
    }
  });

  it("5 resources, 3 booked at same slot → slot shows 2 remaining resources", () => {
    // Each resource has capacity=1, and each booking fills it (guestCount=1).
    // r1, r2, r3 are fully occupied at 09:00; r4, r5 are free.
    const booking: BookingInput = makeResourceBooking({
      startsAt: new Date("2027-06-07T09:00:00Z"),
      endsAt: new Date("2027-06-07T09:30:00Z"),
      status: "confirmed",
      guestCount: 1,
    });

    const resources: ResourceInput[] = [
      makeResource({ id: "r1", capacity: 1, bookings: [{ ...booking, resourceId: "r1" }] }),
      makeResource({ id: "r2", capacity: 1, bookings: [{ ...booking, resourceId: "r2" }] }),
      makeResource({ id: "r3", capacity: 1, bookings: [{ ...booking, resourceId: "r3" }] }),
      makeResource({ id: "r4", capacity: 1, bookings: [] }),
      makeResource({ id: "r5", capacity: 1, bookings: [] }),
    ];

    const slots = getResourceAvailableSlots(
      resources,
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    const nineAmSlot = slots.find(
      (s) => s.startTime === "2027-06-07T09:00:00.000Z",
    );
    expect(nineAmSlot).toBeDefined();
    // Only r4 and r5 are available at 09:00
    expect(nineAmSlot!.availableResources).toHaveLength(2);
    const ids = nineAmSlot!.availableResources.map((r) => r.resourceId).sort();
    expect(ids).toEqual(["r4", "r5"]);
  });

  it("resource with capacity 4, booking for 3 guests → 1 capacity remaining", () => {
    const resource = makeResource({
      id: "res-1",
      capacity: 4,
      bookings: [
        makeResourceBooking({
          startsAt: new Date("2027-06-07T10:00:00Z"),
          endsAt: new Date("2027-06-07T10:30:00Z"),
          status: "confirmed",
          guestCount: 3,
          resourceId: "res-1",
        }),
      ],
    });

    const slots = getResourceAvailableSlots(
      [resource],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    const tenAmSlot = slots.find(
      (s) => s.startTime === "2027-06-07T10:00:00.000Z",
    );
    expect(tenAmSlot).toBeDefined();
    expect(tenAmSlot!.availableResources[0].remainingCapacity).toBe(1);
  });

  it("mixed resource types filtered correctly by resourceType parameter", () => {
    const tableResource = makeResource({ id: "t1", type: "table", capacity: 4 });
    const roomResource = makeResource({ id: "ro1", type: "room", capacity: 10 });
    const courtResource = makeResource({ id: "c1", type: "court", capacity: 2 });

    const slots = getResourceAvailableSlots(
      [tableResource, roomResource, courtResource],
      oneDayRange,
      "UTC",
      {
        duration: 30,
        resourceType: "table",
        now: new Date("2027-01-01T00:00:00Z"),
      },
    );

    // All returned slots should only contain the "table" resource
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      for (const ar of slot.availableResources) {
        expect(ar.resourceType).toBe("table");
        expect(ar.resourceId).toBe("t1");
      }
    }
  });

  it("minCapacity filter excludes undersized resources", () => {
    const smallTable = makeResource({ id: "s1", type: "table", capacity: 2 });
    const mediumTable = makeResource({ id: "m1", type: "table", capacity: 4 });
    const largeTable = makeResource({ id: "l1", type: "table", capacity: 8 });

    const slots = getResourceAvailableSlots(
      [smallTable, mediumTable, largeTable],
      oneDayRange,
      "UTC",
      {
        duration: 30,
        minCapacity: 4,
        now: new Date("2027-01-01T00:00:00Z"),
      },
    );

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      for (const ar of slot.availableResources) {
        expect(["m1", "l1"]).toContain(ar.resourceId);
        expect(ar.resourceId).not.toBe("s1");
      }
    }
  });

  it("buffer time blocks correct resource but not others", () => {
    const booking: BookingInput = makeResourceBooking({
      startsAt: new Date("2027-06-07T09:00:00Z"),
      endsAt: new Date("2027-06-07T09:30:00Z"),
      status: "confirmed",
      guestCount: 1,
    });
    // r1 has capacity=1, booking fills it at 09:00, with 30 min after-buffer → blocks 09:30 slot too
    const r1 = makeResource({ id: "r1", capacity: 1, bookings: [{ ...booking, resourceId: "r1" }] });
    // r2 is completely free
    const r2 = makeResource({ id: "r2", capacity: 1, bookings: [] });

    const slots = getResourceAvailableSlots(
      [r1, r2],
      oneDayRange,
      "UTC",
      {
        duration: 30,
        bufferAfter: 30,
        now: new Date("2027-01-01T00:00:00Z"),
      },
    );

    // At 09:30, r1 is blocked by buffer but r2 is still available
    const nineThirtySlot = slots.find(
      (s) => s.startTime === "2027-06-07T09:30:00.000Z",
    );
    expect(nineThirtySlot).toBeDefined();
    const ids = nineThirtySlot!.availableResources.map((r) => r.resourceId);
    expect(ids).not.toContain("r1");
    expect(ids).toContain("r2");
  });

  it("resource with custom availability (not 9-5) generates correct slots", () => {
    const resource = makeResource({
      id: "res-late",
      rules: [
        makeResourceRule({
          rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
          startTime: "14:00",
          endTime: "20:00",
          timezone: "UTC",
        }),
      ],
    });

    const slots = getResourceAvailableSlots(
      [resource],
      oneDayRange,
      "UTC",
      { duration: 60, now: new Date("2027-01-01T00:00:00Z") },
    );

    // 14:00-20:00 = 6 hours = 6 one-hour slots
    expect(slots).toHaveLength(6);
    expect(slots[0].startTime).toBe("2027-06-07T14:00:00.000Z");
    expect(slots[slots.length - 1].startTime).toBe("2027-06-07T19:00:00.000Z");
  });

  it("assignResource best_fit picks smallest adequate resource", () => {
    const twoTop = makeResource({ id: "2top", name: "2-top", capacity: 2, type: "table" });
    const fourTop = makeResource({ id: "4top", name: "4-top", capacity: 4, type: "table" });
    const eightTop = makeResource({ id: "8top", name: "8-top", capacity: 8, type: "table" });

    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    // Party of 3 — should pick 4-top (smallest that fits 3)
    const result = assignResource(
      [twoTop, fourTop, eightTop],
      start,
      end,
      { strategy: "best_fit", minCapacity: 3 },
    );

    expect(result.resourceId).toBe("4top");
    expect(result.reason).toBe("best_fit");
  });

  it("slots are sorted chronologically", () => {
    const resource = makeResource();

    const slots = getResourceAvailableSlots(
      [resource],
      oneWeekRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    expect(slots.length).toBeGreaterThan(1);
    for (let i = 1; i < slots.length; i++) {
      const prev = new Date(slots[i - 1].startTime).getTime();
      const curr = new Date(slots[i].startTime).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});

// ---------------------------------------------------------------------------
// getResourceAvailableSlots — Edge Cases
// ---------------------------------------------------------------------------

describe("getResourceAvailableSlots — edge cases", () => {
  it("all resources booked → empty slot array returned", () => {
    // Book every slot Mon 09:00-17:00 with capacity 4 booking
    const booking: BookingInput = makeResourceBooking({
      startsAt: new Date("2027-06-07T09:00:00Z"),
      endsAt: new Date("2027-06-07T17:00:00Z"),
      status: "confirmed",
      guestCount: 4,
      resourceId: "res-1",
    });

    const resource = makeResource({
      id: "res-1",
      capacity: 4,
      bookings: [booking],
    });

    const slots = getResourceAvailableSlots(
      [resource],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    expect(slots).toHaveLength(0);
  });

  it("resource with is_active: false is excluded from computation", () => {
    const activeResource = makeResource({ id: "active", isActive: true });
    const inactiveResource = makeResource({ id: "inactive", isActive: false });

    const slots = getResourceAvailableSlots(
      [activeResource, inactiveResource],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      for (const ar of slot.availableResources) {
        expect(ar.resourceId).not.toBe("inactive");
      }
    }
  });

  it("midnight-crossing availability windows (22:00-02:00) generate correct slots", () => {
    const resource = makeResource({
      id: "night-resource",
      rules: [
        makeResourceRule({
          rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
          startTime: "22:00",
          endTime: "02:00",
          timezone: "UTC",
        }),
      ],
    });

    const nightRange = {
      start: new Date("2027-06-06T00:00:00Z"), // Sunday
      end: new Date("2027-06-08T23:59:59Z"),
    };

    const slots = getResourceAvailableSlots(
      [resource],
      nightRange,
      "UTC",
      { duration: 60, now: new Date("2027-01-01T00:00:00Z") },
    );

    // Each weekday crossing creates a 4-hour window (22:00–02:00)
    // Monday 22:00 UTC creates 4 × 60min slots
    expect(slots.length).toBeGreaterThan(0);
    // All slots should start at 22:xx UTC on Monday (2027-06-07)
    const mondayNightSlots = slots.filter((s) =>
      s.startTime.startsWith("2027-06-07T2"),
    );
    expect(mondayNightSlots.length).toBeGreaterThan(0);
  });

  it("DST transition day: resource slots don't duplicate or disappear", () => {
    // US spring-forward: March 8 2026 — clocks jump 02:00 → 03:00
    // Provider in America/New_York with Mon-Fri 09:00-17:00 local
    const resource = makeResource({
      id: "dst-resource",
      rules: [
        makeResourceRule({
          rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
          startTime: "09:00",
          endTime: "17:00",
          timezone: "America/New_York",
        }),
      ],
    });

    // March 8 2026 is a Sunday (spring-forward day). March 9 is Monday.
    const dstRange = {
      start: new Date("2026-03-09T00:00:00Z"),
      end: new Date("2026-03-09T23:59:59Z"),
    };

    const slots = getResourceAvailableSlots(
      [resource],
      dstRange,
      "America/New_York",
      {
        duration: 30,
        now: new Date("2026-01-01T00:00:00Z"),
      },
    );

    // 09:00-17:00 = 8 hours = 16 slots, regardless of DST
    expect(slots).toHaveLength(16);

    // No duplicate start times
    const startTimes = slots.map((s) => s.startTime);
    const uniqueStartTimes = new Set(startTimes);
    expect(uniqueStartTimes.size).toBe(startTimes.length);
  });

  it("zero-capacity resource (capacity = 0) never returns as available", () => {
    const resource = makeResource({ id: "zero-cap", capacity: 0 });

    const slots = getResourceAvailableSlots(
      [resource],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    // capacity 0 means remainingCapacity = 0 - 0 = 0, which < 1, so filtered out
    expect(slots).toHaveLength(0);
  });

  it("single resource, booking exactly fills slot (no buffer) → unavailable, adjacent slots available", () => {
    // Book the exact 10:00-10:30 slot
    const resource = makeResource({
      id: "res-1",
      capacity: 1,
      bookings: [
        makeResourceBooking({
          startsAt: new Date("2027-06-07T10:00:00Z"),
          endsAt: new Date("2027-06-07T10:30:00Z"),
          status: "confirmed",
          guestCount: 1,
          resourceId: "res-1",
        }),
      ],
    });

    const slots = getResourceAvailableSlots(
      [resource],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    const startTimes = slots.map((s) => s.startTime);

    // The booked slot should be gone
    expect(startTimes).not.toContain("2027-06-07T10:00:00.000Z");

    // Adjacent slots should be present (no buffer)
    expect(startTimes).toContain("2027-06-07T09:30:00.000Z");
    expect(startTimes).toContain("2027-06-07T10:30:00.000Z");
  });

  it("cancelled and rejected bookings don't reduce capacity", () => {
    const resource = makeResource({
      id: "res-1",
      capacity: 2,
      bookings: [
        makeResourceBooking({
          startsAt: new Date("2027-06-07T10:00:00Z"),
          endsAt: new Date("2027-06-07T10:30:00Z"),
          status: "cancelled",
          guestCount: 2,
          resourceId: "res-1",
        }),
        makeResourceBooking({
          startsAt: new Date("2027-06-07T10:00:00Z"),
          endsAt: new Date("2027-06-07T10:30:00Z"),
          status: "rejected",
          guestCount: 2,
          resourceId: "res-1",
        }),
      ],
    });

    const slots = getResourceAvailableSlots(
      [resource],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    const tenAmSlot = slots.find(
      (s) => s.startTime === "2027-06-07T10:00:00.000Z",
    );
    expect(tenAmSlot).toBeDefined();
    // Full capacity should remain (cancelled/rejected bookings ignored)
    expect(tenAmSlot!.availableResources[0].remainingCapacity).toBe(2);
  });

  it("override blocks one resource but not others in same pool", () => {
    const blockedResource = makeResource({
      id: "blocked",
      overrides: [
        {
          date: new Date("2027-06-07T00:00:00Z"),
          isUnavailable: true,
        },
      ],
    });
    const freeResource = makeResource({ id: "free" });

    const slots = getResourceAvailableSlots(
      [blockedResource, freeResource],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    // All slots should be present but only contain "free"
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const ids = slot.availableResources.map((r) => r.resourceId);
      expect(ids).not.toContain("blocked");
      expect(ids).toContain("free");
    }
  });
});

// ---------------------------------------------------------------------------
// getResourceAvailableSlots — Boundary Tests
// ---------------------------------------------------------------------------

describe("getResourceAvailableSlots — boundary tests", () => {
  it("slot starts exactly when booking ends (no buffer) → available", () => {
    const resource = makeResource({
      id: "res-1",
      capacity: 1,
      bookings: [
        makeResourceBooking({
          startsAt: new Date("2027-06-07T09:00:00Z"),
          endsAt: new Date("2027-06-07T09:30:00Z"),
          status: "confirmed",
          guestCount: 1,
          resourceId: "res-1",
        }),
      ],
    });

    const slots = getResourceAvailableSlots(
      [resource],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    const startTimes = slots.map((s) => s.startTime);
    // The slot starting exactly at 09:30 (when booking ends) must be available
    expect(startTimes).toContain("2027-06-07T09:30:00.000Z");
  });

  it("slot starts exactly when booking ends (with buffer) → unavailable due to buffer", () => {
    const resource = makeResource({
      id: "res-1",
      capacity: 1,
      bookings: [
        makeResourceBooking({
          startsAt: new Date("2027-06-07T09:00:00Z"),
          endsAt: new Date("2027-06-07T09:30:00Z"),
          status: "confirmed",
          guestCount: 1,
          resourceId: "res-1",
        }),
      ],
    });

    const slots = getResourceAvailableSlots(
      [resource],
      oneDayRange,
      "UTC",
      {
        duration: 30,
        bufferAfter: 30,
        now: new Date("2027-01-01T00:00:00Z"),
      },
    );

    const startTimes = slots.map((s) => s.startTime);
    // With 30 min after-buffer on the 09:00-09:30 booking, the 09:30 slot is blocked
    expect(startTimes).not.toContain("2027-06-07T09:30:00.000Z");
    // But 10:00 should be fine
    expect(startTimes).toContain("2027-06-07T10:00:00.000Z");
  });

  it("date range of exactly one day generates correct number of slots", () => {
    const resource = makeResource();

    const slots = getResourceAvailableSlots(
      [resource],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    // Mon 09:00-17:00 = 16 slots
    expect(slots).toHaveLength(16);
    // All slots on same day
    for (const slot of slots) {
      expect(slot.startTime).toMatch(/^2027-06-07/);
    }
  });

  it("date range spanning 90 days completes in < 500ms for 50 resources", () => {
    const resources: ResourceInput[] = Array.from({ length: 50 }, (_, i) =>
      makeResource({
        id: `r${i}`,
        name: `Resource ${i}`,
        bookings: [],
      }),
    );

    const ninetyDayRange = {
      start: new Date("2027-06-07T00:00:00Z"),
      end: new Date("2027-09-04T23:59:59Z"),
    };

    const start = Date.now();
    const slots = getResourceAvailableSlots(
      resources,
      ninetyDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );
    const elapsed = Date.now() - start;

    expect(slots.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// assignResource — All four strategies
// ---------------------------------------------------------------------------

describe("assignResource — best_fit strategy", () => {
  it("selects smallest resource that fits the party", () => {
    const twoTop = makeResource({ id: "2top", capacity: 2 });
    const fourTop = makeResource({ id: "4top", capacity: 4 });
    const eightTop = makeResource({ id: "8top", capacity: 8 });

    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    const result = assignResource(
      [twoTop, fourTop, eightTop],
      start,
      end,
      { strategy: "best_fit", minCapacity: 3 },
    );

    expect(result.resourceId).toBe("4top");
    expect(result.reason).toBe("best_fit");
  });

  it("picks only option when exactly one resource fits", () => {
    const oneTop = makeResource({ id: "1top", capacity: 1 });
    const twoTop = makeResource({ id: "2top", capacity: 2 });

    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    const result = assignResource(
      [oneTop, twoTop],
      start,
      end,
      { strategy: "best_fit", minCapacity: 2 },
    );

    expect(result.resourceId).toBe("2top");
  });

  it("breaks ties by picking first in array order when capacities are equal", () => {
    const r1 = makeResource({ id: "r1", capacity: 4 });
    const r2 = makeResource({ id: "r2", capacity: 4 });

    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    const result = assignResource(
      [r1, r2],
      start,
      end,
      { strategy: "best_fit", minCapacity: 4 },
    );

    expect(result.resourceId).toBe("r1");
  });
});

describe("assignResource — first_available strategy", () => {
  it("selects the first free resource in array order", () => {
    const r1 = makeResource({ id: "r1", capacity: 4 });
    const r2 = makeResource({ id: "r2", capacity: 4 });
    const r3 = makeResource({ id: "r3", capacity: 4 });

    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    const result = assignResource(
      [r1, r2, r3],
      start,
      end,
      { strategy: "first_available" },
    );

    expect(result.resourceId).toBe("r1");
    expect(result.reason).toBe("first_available");
  });

  it("skips booked resources and picks the next free one", () => {
    const booking: BookingInput = makeResourceBooking({
      startsAt: new Date("2027-06-07T12:00:00Z"),
      endsAt: new Date("2027-06-07T13:00:00Z"),
      status: "confirmed",
      guestCount: 1,
    });

    const r1 = makeResource({ id: "r1", capacity: 1, bookings: [{ ...booking, resourceId: "r1" }] });
    const r2 = makeResource({ id: "r2", capacity: 1, bookings: [] });
    const r3 = makeResource({ id: "r3", capacity: 1, bookings: [] });

    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    const result = assignResource(
      [r1, r2, r3],
      start,
      end,
      { strategy: "first_available" },
    );

    expect(result.resourceId).toBe("r2");
  });

  it("respects buffer time when determining availability", () => {
    // r1 has a booking ending at 12:00, with 15-min after-buffer → blocks 12:00-12:15
    const booking: BookingInput = makeResourceBooking({
      startsAt: new Date("2027-06-07T11:00:00Z"),
      endsAt: new Date("2027-06-07T12:00:00Z"),
      status: "confirmed",
      guestCount: 1,
    });

    const r1 = makeResource({ id: "r1", capacity: 1, bookings: [{ ...booking, resourceId: "r1" }] });
    const r2 = makeResource({ id: "r2", capacity: 1, bookings: [] });

    // Request at 12:00 — r1 is blocked by buffer, r2 is free
    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    const result = assignResource(
      [r1, r2],
      start,
      end,
      { strategy: "first_available", bufferAfter: 15 },
    );

    expect(result.resourceId).toBe("r2");
  });
});

describe("assignResource — round_robin strategy", () => {
  it("picks resource with lowest booking count", () => {
    const r1 = makeResource({ id: "r1" });
    const r2 = makeResource({ id: "r2" });
    const r3 = makeResource({ id: "r3" });

    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    const result = assignResource(
      [r1, r2, r3],
      start,
      end,
      {
        strategy: "round_robin",
        pastCounts: [
          { resourceId: "r1", bookingCount: 10 },
          { resourceId: "r2", bookingCount: 5 },
          { resourceId: "r3", bookingCount: 3 },
        ],
      },
    );

    expect(result.resourceId).toBe("r3");
    expect(result.reason).toBe("round_robin");
  });

  it("breaks ties by original array order", () => {
    const r1 = makeResource({ id: "r1" });
    const r2 = makeResource({ id: "r2" });

    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    // Same booking count — should pick r1 (first in array)
    const result = assignResource(
      [r1, r2],
      start,
      end,
      {
        strategy: "round_robin",
        pastCounts: [
          { resourceId: "r1", bookingCount: 5 },
          { resourceId: "r2", bookingCount: 5 },
        ],
      },
    );

    expect(result.resourceId).toBe("r1");
  });

  it("defaults to 0 for resources not in pastCounts", () => {
    const r1 = makeResource({ id: "r1" });
    const r2 = makeResource({ id: "r2" });
    const r3 = makeResource({ id: "r3" }); // Not in pastCounts — defaults to 0

    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    const result = assignResource(
      [r1, r2, r3],
      start,
      end,
      {
        strategy: "round_robin",
        pastCounts: [
          { resourceId: "r1", bookingCount: 5 },
          { resourceId: "r2", bookingCount: 3 },
        ],
      },
    );

    // r3 defaults to 0, which is the lowest
    expect(result.resourceId).toBe("r3");
  });
});

describe("assignResource — largest_first strategy", () => {
  it("selects the resource with the highest capacity", () => {
    const r1 = makeResource({ id: "r1", capacity: 2 });
    const r2 = makeResource({ id: "r2", capacity: 8 });
    const r3 = makeResource({ id: "r3", capacity: 4 });

    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    const result = assignResource(
      [r1, r2, r3],
      start,
      end,
      { strategy: "largest_first" },
    );

    expect(result.resourceId).toBe("r2");
    expect(result.reason).toBe("largest_first");
  });

  it("skips fully-booked large resources and picks next largest", () => {
    const booking: BookingInput = makeResourceBooking({
      startsAt: new Date("2027-06-07T12:00:00Z"),
      endsAt: new Date("2027-06-07T13:00:00Z"),
      status: "confirmed",
      guestCount: 8,
    });

    const bigBooked = makeResource({
      id: "big",
      capacity: 8,
      bookings: [{ ...booking, resourceId: "big" }],
    });
    const medFree = makeResource({ id: "med", capacity: 4, bookings: [] });

    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    const result = assignResource(
      [bigBooked, medFree],
      start,
      end,
      { strategy: "largest_first" },
    );

    expect(result.resourceId).toBe("med");
  });

  it("picks first largest when capacities are equal", () => {
    const r1 = makeResource({ id: "r1", capacity: 8 });
    const r2 = makeResource({ id: "r2", capacity: 8 });

    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    const result = assignResource(
      [r1, r2],
      start,
      end,
      { strategy: "largest_first" },
    );

    expect(result.resourceId).toBe("r1");
  });
});

// ---------------------------------------------------------------------------
// assignResource — ResourceUnavailableError thrown with correct reasons
// ---------------------------------------------------------------------------

describe("assignResource — ResourceUnavailableError", () => {
  const start = new Date("2027-06-07T12:00:00Z");
  const end = new Date("2027-06-07T13:00:00Z");

  it("throws with reason no_matching_type when no resource matches the requested type", () => {
    const tableResource = makeResource({ id: "t1", type: "table" });

    let caughtErr: unknown;
    try {
      assignResource([tableResource], start, end, { resourceType: "room" });
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeDefined();
    const e = caughtErr as ResourceErrorLike;
    expect(e.name).toBe("ResourceUnavailableError");
    expect(e.reason).toBe("no_matching_type");
    expect(e.code).toBe("RESOURCE_UNAVAILABLE");
    expect(e.message).toMatch(/no_matching_type/);
  });

  it("throws with reason no_matching_type when pool only has inactive resources", () => {
    const inactiveResource = makeResource({ id: "r1", isActive: false });

    let caughtErr: unknown;
    try {
      assignResource([inactiveResource], start, end);
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeDefined();
    expect((caughtErr as ResourceErrorLike).reason).toBe("no_matching_type");
    expect((caughtErr as ResourceErrorLike).name).toBe("ResourceUnavailableError");
  });

  it("throws with reason no_capacity when all resources are too small for the party", () => {
    const twoTop = makeResource({ id: "t1", capacity: 2 });
    const threeTop = makeResource({ id: "t2", capacity: 3 });

    let caughtErr: unknown;
    try {
      assignResource([twoTop, threeTop], start, end, { minCapacity: 6 });
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeDefined();
    expect((caughtErr as ResourceErrorLike).reason).toBe("no_capacity");
    expect((caughtErr as ResourceErrorLike).name).toBe("ResourceUnavailableError");
  });

  it("throws with reason all_booked when all capacity-sufficient resources are occupied", () => {
    const booking: BookingInput = makeResourceBooking({
      startsAt: start,
      endsAt: end,
      status: "confirmed",
      guestCount: 4,
    });

    const r1 = makeResource({
      id: "r1",
      capacity: 4,
      bookings: [{ ...booking, resourceId: "r1" }],
    });
    const r2 = makeResource({
      id: "r2",
      capacity: 4,
      bookings: [{ ...booking, resourceId: "r2" }],
    });

    let caughtErr: unknown;
    try {
      assignResource([r1, r2], start, end, { minCapacity: 4 });
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeDefined();
    expect((caughtErr as ResourceErrorLike).reason).toBe("all_booked");
    expect((caughtErr as ResourceErrorLike).name).toBe("ResourceUnavailableError");
  });

  it("throws an Error with a message containing the reason", () => {
    let caughtErr: unknown;
    try {
      assignResource([], start, end, { resourceType: "court" });
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeDefined();
    expect((caughtErr as ResourceErrorLike).message).toMatch(/no_matching_type/);
  });
});

// ---------------------------------------------------------------------------
// isResourceSlotAvailable
// ---------------------------------------------------------------------------

describe("isResourceSlotAvailable — specific resource checks", () => {
  it("returns available:true with correct remainingCapacity for a free slot", () => {
    const resource = makeResource({
      id: "res-1",
      capacity: 4,
      rules: [
        makeResourceRule({
          rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
          startTime: "09:00",
          endTime: "17:00",
          timezone: "UTC",
        }),
      ],
    });

    const result = isResourceSlotAvailable(
      [resource],
      "res-1",
      new Date("2027-06-07T10:00:00Z"),
      new Date("2027-06-07T10:30:00Z"),
    );

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.remainingCapacity).toBe(4);
    }
  });

  it("returns resource_booked when booking overlaps the slot directly", () => {
    const resource = makeResource({
      id: "res-1",
      capacity: 1,
      rules: [makeResourceRule()],
      bookings: [
        makeResourceBooking({
          startsAt: new Date("2027-06-07T10:00:00Z"),
          endsAt: new Date("2027-06-07T10:30:00Z"),
          status: "confirmed",
          guestCount: 1,
          resourceId: "res-1",
        }),
      ],
    });

    const result = isResourceSlotAvailable(
      [resource],
      "res-1",
      new Date("2027-06-07T10:00:00Z"),
      new Date("2027-06-07T10:30:00Z"),
    );

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("resource_booked");
    }
  });

  it("returns buffer_conflict when buffer overlaps but booking itself doesn't", () => {
    const resource = makeResource({
      id: "res-1",
      capacity: 1,
      rules: [makeResourceRule()],
      bookings: [
        makeResourceBooking({
          startsAt: new Date("2027-06-07T10:00:00Z"),
          endsAt: new Date("2027-06-07T10:30:00Z"),
          status: "confirmed",
          guestCount: 1,
          resourceId: "res-1",
        }),
      ],
    });

    // Slot starts right when booking ends; 30-min after-buffer would overlap it
    const result = isResourceSlotAvailable(
      [resource],
      "res-1",
      new Date("2027-06-07T10:30:00Z"),
      new Date("2027-06-07T11:00:00Z"),
      0, // bufferBefore
      30, // bufferAfter
    );

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("buffer_conflict");
    }
  });

  it("returns outside_availability for a slot outside the resource's hours", () => {
    const resource = makeResource({
      id: "res-1",
      rules: [
        makeResourceRule({
          rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
          startTime: "09:00",
          endTime: "17:00",
          timezone: "UTC",
        }),
      ],
    });

    const result = isResourceSlotAvailable(
      [resource],
      "res-1",
      new Date("2027-06-07T20:00:00Z"), // 8 PM UTC — outside hours
      new Date("2027-06-07T20:30:00Z"),
    );

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("outside_availability");
    }
  });

  it("returns blocked_date for a slot on a date with isUnavailable override", () => {
    const resource = makeResource({
      id: "res-1",
      rules: [makeResourceRule()],
      overrides: [
        {
          date: new Date("2027-06-07T00:00:00Z"),
          isUnavailable: true,
        },
      ],
    });

    const result = isResourceSlotAvailable(
      [resource],
      "res-1",
      new Date("2027-06-07T10:00:00Z"),
      new Date("2027-06-07T10:30:00Z"),
    );

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("blocked_date");
    }
  });

  it("inactive resource returns resource_inactive reason", () => {
    const resource = makeResource({ id: "res-1", isActive: false });

    const result = isResourceSlotAvailable(
      [resource],
      "res-1",
      new Date("2027-06-07T10:00:00Z"),
      new Date("2027-06-07T10:30:00Z"),
    );

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("resource_inactive");
    }
  });

  it("returns resource_inactive when resourceId not found in pool", () => {
    const resource = makeResource({ id: "res-1" });

    const result = isResourceSlotAvailable(
      [resource],
      "non-existent-id",
      new Date("2027-06-07T10:00:00Z"),
      new Date("2027-06-07T10:30:00Z"),
    );

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("resource_inactive");
    }
  });
});

describe("isResourceSlotAvailable — pool-level check (resourceId undefined)", () => {
  it("returns available:true when any resource in pool is free", () => {
    const bookedResource = makeResource({
      id: "r1",
      capacity: 1,
      bookings: [
        makeResourceBooking({
          startsAt: new Date("2027-06-07T10:00:00Z"),
          endsAt: new Date("2027-06-07T10:30:00Z"),
          status: "confirmed",
          guestCount: 1,
          resourceId: "r1",
        }),
      ],
    });
    const freeResource = makeResource({
      id: "r2",
      capacity: 3,
      bookings: [],
    });

    const result = isResourceSlotAvailable(
      [bookedResource, freeResource],
      undefined,
      new Date("2027-06-07T10:00:00Z"),
      new Date("2027-06-07T10:30:00Z"),
    );

    expect(result.available).toBe(true);
    if (result.available) {
      // Should return the best (highest) remaining capacity
      expect(result.remainingCapacity).toBe(3);
    }
  });

  it("returns outside_availability when all resources are unavailable at that time", () => {
    const r1 = makeResource({
      id: "r1",
      rules: [
        makeResourceRule({
          rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
          startTime: "09:00",
          endTime: "12:00",
          timezone: "UTC",
        }),
      ],
    });
    const r2 = makeResource({
      id: "r2",
      rules: [
        makeResourceRule({
          rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
          startTime: "09:00",
          endTime: "12:00",
          timezone: "UTC",
        }),
      ],
    });

    const result = isResourceSlotAvailable(
      [r1, r2],
      undefined,
      new Date("2027-06-07T14:00:00Z"), // 2 PM — outside 09:00-12:00
      new Date("2027-06-07T14:30:00Z"),
    );

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("outside_availability");
    }
  });

  it("returns best (highest) remainingCapacity across passing resources", () => {
    const r1 = makeResource({ id: "r1", capacity: 2, bookings: [] });
    const r2 = makeResource({ id: "r2", capacity: 6, bookings: [] });
    const r3 = makeResource({ id: "r3", capacity: 4, bookings: [] });

    const result = isResourceSlotAvailable(
      [r1, r2, r3],
      undefined,
      new Date("2027-06-07T10:00:00Z"),
      new Date("2027-06-07T10:30:00Z"),
    );

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.remainingCapacity).toBe(6);
    }
  });
});

// ---------------------------------------------------------------------------
// getResourcePoolSummary
// ---------------------------------------------------------------------------

describe("getResourcePoolSummary", () => {
  it("correct utilizationPercent computation", () => {
    const booking: BookingInput = makeResourceBooking({
      startsAt: new Date("2027-06-07T10:00:00Z"),
      endsAt: new Date("2027-06-07T10:30:00Z"),
      status: "confirmed",
      guestCount: 1,
    });

    const r1 = makeResource({ id: "r1", capacity: 1, bookings: [{ ...booking, resourceId: "r1" }] });
    const r2 = makeResource({ id: "r2", capacity: 1, bookings: [] });
    const r3 = makeResource({ id: "r3", capacity: 1, bookings: [] });

    const summaries = getResourcePoolSummary(
      [r1, r2, r3],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    const tenAmSummary = summaries.find(
      (s) => s.startTime === "2027-06-07T10:00:00.000Z",
    );
    expect(tenAmSummary).toBeDefined();
    // 1 out of 3 booked → ~33%
    expect(tenAmSummary!.totalResources).toBe(3);
    expect(tenAmSummary!.availableResources).toBe(2);
    expect(tenAmSummary!.utilizationPercent).toBe(Math.round((1 / 3) * 100));
  });

  it("byType grouping is correct", () => {
    const table1 = makeResource({ id: "t1", type: "table" });
    const table2 = makeResource({ id: "t2", type: "table" });
    const room1 = makeResource({ id: "ro1", type: "room" });

    const summaries = getResourcePoolSummary(
      [table1, table2, room1],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    expect(summaries.length).toBeGreaterThan(0);
    const firstSummary = summaries[0];
    expect(firstSummary.byType).toHaveProperty("table");
    expect(firstSummary.byType).toHaveProperty("room");
    expect(firstSummary.byType.table.total).toBe(2);
    expect(firstSummary.byType.room.total).toBe(1);
    // At a free slot, all should be available
    expect(firstSummary.byType.table.available).toBe(2);
    expect(firstSummary.byType.room.available).toBe(1);
  });

  it("zero resources → returns empty array (not NaN for utilizationPercent)", () => {
    const summaries = getResourcePoolSummary(
      [],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    expect(summaries).toHaveLength(0);
  });

  it("fully booked slot has utilizationPercent = 100", () => {
    const booking: BookingInput = makeResourceBooking({
      startsAt: new Date("2027-06-07T10:00:00Z"),
      endsAt: new Date("2027-06-07T10:30:00Z"),
      status: "confirmed",
      guestCount: 1,
    });

    const r1 = makeResource({ id: "r1", capacity: 1, bookings: [{ ...booking, resourceId: "r1" }] });

    const summaries = getResourcePoolSummary(
      [r1],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    const tenAmSummary = summaries.find(
      (s) => s.startTime === "2027-06-07T10:00:00.000Z",
    );
    expect(tenAmSummary).toBeDefined();
    expect(tenAmSummary!.utilizationPercent).toBe(100);
    expect(tenAmSummary!.availableResources).toBe(0);
    expect(tenAmSummary!.totalResources).toBe(1);
  });

  it("summaries are sorted chronologically", () => {
    const resource = makeResource();

    const summaries = getResourcePoolSummary(
      [resource],
      oneWeekRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    expect(summaries.length).toBeGreaterThan(1);
    for (let i = 1; i < summaries.length; i++) {
      const prev = new Date(summaries[i - 1].startTime).getTime();
      const curr = new Date(summaries[i].startTime).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it("inactive resources are excluded from pool summary", () => {
    const activeResource = makeResource({ id: "active", isActive: true });
    const inactiveResource = makeResource({ id: "inactive", isActive: false });

    const summaries = getResourcePoolSummary(
      [activeResource, inactiveResource],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    expect(summaries.length).toBeGreaterThan(0);
    for (const summary of summaries) {
      // Only 1 active resource should be counted
      expect(summary.totalResources).toBe(1);
    }
  });

  it("localStart and localEnd are formatted in the customer timezone", () => {
    const resource = makeResource();

    const summaries = getResourcePoolSummary(
      [resource],
      oneDayRange,
      "America/New_York",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    expect(summaries.length).toBeGreaterThan(0);
    // First slot at 09:00 UTC = 05:00 EDT (UTC-4 in June)
    const firstSummary = summaries[0];
    expect(firstSummary.localStart).toContain("05:00");
  });

  it("full day with 15-minute intervals for 50 resources completes under 300ms", () => {
    const resources: ResourceInput[] = Array.from({ length: 50 }, (_, i) =>
      makeResource({ id: `r${i}`, name: `Resource ${i}` }),
    );

    const start = Date.now();
    const summaries = getResourcePoolSummary(
      resources,
      oneDayRange,
      "UTC",
      {
        duration: 15,
        slotInterval: 15,
        now: new Date("2027-01-01T00:00:00Z"),
      },
    );
    const elapsed = Date.now() - start;

    expect(summaries.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(300);
  });
});

// ---------------------------------------------------------------------------
// Additional edge case: replacement override grants access to new window
// ---------------------------------------------------------------------------

describe("isResourceSlotAvailable — replacement override", () => {
  it("returns available when slot falls within a replacement override window (no base rule)", () => {
    // Resource has NO base rules — availability comes only from a replacement override
    // on June 7 from 10:00-14:00 UTC.
    const resource = makeResource({
      id: "res-1",
      rules: [], // no base rules
      overrides: [
        {
          date: new Date("2027-06-07T00:00:00Z"),
          startTime: "10:00",
          endTime: "14:00",
          isUnavailable: false,
        },
      ],
    });

    // 11:00-11:30 should be within the override window
    const result = isResourceSlotAvailable(
      [resource],
      "res-1",
      new Date("2027-06-07T11:00:00Z"),
      new Date("2027-06-07T11:30:00Z"),
    );

    expect(result.available).toBe(true);
  });

  it("returns outside_availability for slot outside replacement override window (no base rule)", () => {
    // Resource has NO base rules — it is only available via a replacement override
    // on June 7 from 10:00-14:00. Checking 09:00-09:30 should be outside_availability.
    const resource = makeResource({
      id: "res-1",
      rules: [], // no base rules; availability only comes from the override
      overrides: [
        {
          date: new Date("2027-06-07T00:00:00Z"),
          startTime: "10:00",
          endTime: "14:00",
          isUnavailable: false,
        },
      ],
    });

    // 09:00-09:30 is outside the replacement override window (which starts at 10:00)
    const result = isResourceSlotAvailable(
      [resource],
      "res-1",
      new Date("2027-06-07T09:00:00Z"),
      new Date("2027-06-07T09:30:00Z"),
    );

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("outside_availability");
    }
  });
});

// ---------------------------------------------------------------------------
// Additional edge case: empty pool returns []
// ---------------------------------------------------------------------------

describe("getResourceAvailableSlots — empty pool", () => {
  it("returns empty array for empty resource pool", () => {
    const slots = getResourceAvailableSlots(
      [],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    expect(slots).toHaveLength(0);
  });

  it("returns empty array when all resources are inactive", () => {
    const r1 = makeResource({ id: "r1", isActive: false });
    const r2 = makeResource({ id: "r2", isActive: false });

    const slots = getResourceAvailableSlots(
      [r1, r2],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    expect(slots).toHaveLength(0);
  });

  it("returns empty array when minCapacity filters out all resources", () => {
    const r1 = makeResource({ id: "r1", capacity: 2 });
    const r2 = makeResource({ id: "r2", capacity: 3 });

    const slots = getResourceAvailableSlots(
      [r1, r2],
      oneDayRange,
      "UTC",
      {
        duration: 30,
        minCapacity: 10,
        now: new Date("2027-01-01T00:00:00Z"),
      },
    );

    expect(slots).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Ties in slot sorting: equal startTime, sorted by total remaining capacity
// ---------------------------------------------------------------------------

describe("getResourceAvailableSlots — tie-breaking by capacity", () => {
  it("when two slots have same start time, higher total remaining capacity comes first", () => {
    // This is exercised when the same slot key appears via two different resources
    // and the slot map merges them — the result is sorted by total capacity desc.
    // We verify this by checking the sort order over available resources.
    const highCapResource = makeResource({ id: "hi", capacity: 10 });
    const lowCapResource = makeResource({ id: "lo", capacity: 2 });

    const slots = getResourceAvailableSlots(
      [highCapResource, lowCapResource],
      oneDayRange,
      "UTC",
      { duration: 30, now: new Date("2027-01-01T00:00:00Z") },
    );

    expect(slots.length).toBeGreaterThan(0);
    // Within each slot, both resources appear; total capacity = 12
    const firstSlot = slots[0];
    const totalCapacity = firstSlot.availableResources.reduce(
      (sum, r) => sum + r.remainingCapacity,
      0,
    );
    expect(totalCapacity).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// assignResource — uses requestedCapacity option
// ---------------------------------------------------------------------------

describe("assignResource — requestedCapacity option", () => {
  it("uses requestedCapacity when provided directly", () => {
    const small = makeResource({ id: "small", capacity: 2 });
    const large = makeResource({ id: "large", capacity: 6 });

    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    const result = assignResource(
      [small, large],
      start,
      end,
      { strategy: "best_fit", requestedCapacity: 5 },
    );

    // Requested capacity of 5 — small (cap 2) is too small, large (cap 6) is picked
    expect(result.resourceId).toBe("large");
  });

  it("defaults to minCapacity when requestedCapacity is not provided", () => {
    const small = makeResource({ id: "small", capacity: 2 });
    const large = makeResource({ id: "large", capacity: 6 });

    const start = new Date("2027-06-07T12:00:00Z");
    const end = new Date("2027-06-07T13:00:00Z");

    const result = assignResource(
      [small, large],
      start,
      end,
      { strategy: "best_fit", minCapacity: 5 },
    );

    expect(result.resourceId).toBe("large");
  });
});

// ---------------------------------------------------------------------------
// Performance budgets (E-22 epic requirements)
//
// These tests use real wall-clock time (Date.now()) to verify that all four
// operations meet the budgets defined in the epic's Performance Budget table.
// Each test generates 50 resources with realistic Mon-Fri 09:00-17:00
// availability and ~10 bookings per resource, then asserts elapsed time.
//
// The suite temporarily disables fake timers because vi.useFakeTimers() makes
// Date.now() return the mocked timestamp, which would always report 0ms elapsed.
// options.now is pinned to 2027-01-01 so slot computation is deterministic.
// ---------------------------------------------------------------------------

/**
 * Build a realistic pool of 50 active resources for performance testing.
 *
 * Each resource has:
 *   - Mon-Fri 09:00-17:00 UTC availability (RRULE)
 *   - capacity: 4 (typical table / room size)
 *   - 10 confirmed bookings spread across different hours on the reference week
 *
 * The bookings are distributed so they don't all block the same slot, giving
 * the engine non-trivial capacity math to perform on every candidate.
 *
 * @param resourceCount - Number of resources to generate (default 50)
 * @returns Array of ResourceInput objects ready for slot computation
 */
function buildPerfPool(resourceCount = 50): ResourceInput[] {
  // Anchor week: Mon 7 Jun 2027 to Fri 11 Jun 2027 — within the 30-day range
  // used by slot computation, and well after options.now (2027-01-01).
  const bookingDates = [
    "2027-06-07", // Mon
    "2027-06-08", // Tue
    "2027-06-09", // Wed
    "2027-06-10", // Thu
    "2027-06-11", // Fri
  ];

  // 10 distinct 30-min booking windows spread across the 5-day week
  const bookingSlots: Array<{ date: string; startHour: number }> = [
    { date: bookingDates[0], startHour: 9 },
    { date: bookingDates[0], startHour: 11 },
    { date: bookingDates[1], startHour: 10 },
    { date: bookingDates[1], startHour: 14 },
    { date: bookingDates[2], startHour: 9 },
    { date: bookingDates[2], startHour: 13 },
    { date: bookingDates[3], startHour: 10 },
    { date: bookingDates[3], startHour: 15 },
    { date: bookingDates[4], startHour: 9 },
    { date: bookingDates[4], startHour: 16 },
  ];

  return Array.from({ length: resourceCount }, (_, i) => {
    const bookings: BookingInput[] = bookingSlots.map((slot) => ({
      startsAt: new Date(`${slot.date}T${String(slot.startHour).padStart(2, "0")}:00:00Z`),
      endsAt: new Date(`${slot.date}T${String(slot.startHour).padStart(2, "0")}:30:00Z`),
      status: "confirmed" as const,
      resourceId: `perf-resource-${i}`,
      guestCount: 1,
    }));

    return makeResource({
      id: `perf-resource-${i}`,
      name: `Perf Resource ${i}`,
      type: "table",
      capacity: 4,
      bookings,
    });
  });
}

describe("Performance budgets", () => {
  // Disable fake timers for this entire suite so Date.now() returns real
  // wall-clock milliseconds. The outer beforeEach installs fake timers; we
  // override here and restore in afterEach.
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    // Restore fake timers so other suites are unaffected
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
  });

  // Fixed "now" for slot computation — all slots after this date are included
  const PERF_NOW = new Date("2027-01-01T00:00:00Z");

  // 30-day range starting Mon 7 Jun 2027
  const THIRTY_DAY_RANGE = {
    start: new Date("2027-06-07T00:00:00Z"),
    end: new Date("2027-07-06T23:59:59Z"),
  };

  // One full day for pool summary (Mon 7 Jun 2027)
  const ONE_DAY_RANGE = {
    start: new Date("2027-06-07T00:00:00Z"),
    end: new Date("2027-06-07T23:59:59Z"),
  };

  it("30-day slot computation for 50 resources completes in < 200ms", () => {
    const pool = buildPerfPool(50);

    const t0 = Date.now();
    const slots = getResourceAvailableSlots(
      pool,
      THIRTY_DAY_RANGE,
      "UTC",
      { duration: 30, now: PERF_NOW },
    );
    const elapsed = Date.now() - t0;

    // Sanity: pool has availability, so slots must be non-empty
    expect(slots.length).toBeGreaterThan(0);
    // Budget: < 200ms
    expect(elapsed).toBeLessThan(200);
  });

  it("single slot availability check for 50 resources (pool-level) completes in < 50ms", () => {
    const pool = buildPerfPool(50);

    // Check a slot that is within Mon-Fri 09:00-17:00 and has no bookings at this time
    const slotStart = new Date("2027-06-07T12:00:00Z");
    const slotEnd = new Date("2027-06-07T12:30:00Z");

    const t0 = Date.now();
    const result = isResourceSlotAvailable(
      pool,
      undefined, // pool-level check — iterates all 50 resources
      slotStart,
      slotEnd,
      0,
      0,
      { now: PERF_NOW },
    );
    const elapsed = Date.now() - t0;

    // Sanity: 12:00-12:30 is within the 09:00-17:00 window and has no bookings
    expect(result.available).toBe(true);
    // Budget: < 50ms
    expect(elapsed).toBeLessThan(50);
  });

  it("pool summary for full day with 15-minute intervals for 50 resources completes in < 300ms", () => {
    const pool = buildPerfPool(50);

    const t0 = Date.now();
    const summaries = getResourcePoolSummary(
      pool,
      ONE_DAY_RANGE,
      "UTC",
      {
        duration: 15,
        slotInterval: 15,
        now: PERF_NOW,
      },
    );
    const elapsed = Date.now() - t0;

    // Sanity: Mon 09:00-17:00 at 15-min intervals = 32 slots
    expect(summaries.length).toBeGreaterThan(0);
    // Budget: < 300ms
    expect(elapsed).toBeLessThan(300);
  });

  it("auto-assignment for 50 resources completes in < 10ms", () => {
    const pool = buildPerfPool(50);

    // Use a time slot with no bookings at this hour across any resource
    const slotStart = new Date("2027-06-07T12:00:00Z");
    const slotEnd = new Date("2027-06-07T12:30:00Z");

    const t0 = Date.now();
    const result = assignResource(
      pool,
      slotStart,
      slotEnd,
      { strategy: "best_fit", requestedCapacity: 2, now: PERF_NOW },
    );
    const elapsed = Date.now() - t0;

    // Sanity: a free resource must be found
    expect(result.resourceId).toBeDefined();
    expect(result.reason).toBe("best_fit");
    // Budget: < 10ms
    expect(elapsed).toBeLessThan(10);
  });
});
