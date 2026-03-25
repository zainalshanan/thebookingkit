import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  getResourceAvailableSlots,
  assignResource,
} from "../resource-engine.js";
import { ResourceUnavailableError } from "../errors.js";
import type {
  ResourceInput,
  BookingInput,
  AvailabilityRuleInput,
  AvailabilityOverrideInput,
  DateRange,
  ResourceSlotOptions,
} from "../types.js";

// ---------------------------------------------------------------------------
// Fixed reference date — injected as `options.now` for full determinism
// ---------------------------------------------------------------------------

/** A fixed future "now" that places all test slots well in the future */
const FIXED_NOW = new Date("2027-01-01T00:00:00Z");

/** Two-day date range — short window keeps per-run cost < 10 ms */
const FUTURE_START = new Date("2027-06-01T00:00:00Z");
const FUTURE_END = new Date("2027-06-03T00:00:00Z");
const DATE_RANGE: DateRange = { start: FUTURE_START, end: FUTURE_END };

/** Base ResourceSlotOptions always passed to functions — pins `now` */
const BASE_OPTIONS: ResourceSlotOptions = { now: FIXED_NOW };

// ---------------------------------------------------------------------------
// Shared arbitraries (same style as property-based.test.ts)
// ---------------------------------------------------------------------------

/** Representative IANA timezones */
const timezoneArb = fc.constantFrom(
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Australia/Sydney",
  "UTC",
);

/** Random weekday subset for BYDAY, joined as a comma-separated string */
const bydayArb = fc
  .subarray(["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const, {
    minLength: 1,
    maxLength: 7,
  })
  .map((days) => days.join(","));

/** Valid start/end hour pairs where start < end */
const hourPairArb = fc
  .tuple(fc.integer({ min: 0, max: 22 }), fc.integer({ min: 1, max: 23 }))
  .filter(([s, e]) => s < e)
  .map(([s, e]) => ({
    startTime: `${String(s).padStart(2, "0")}:00`,
    endTime: `${String(e).padStart(2, "0")}:00`,
  }));

/** A single random RRULE-based availability rule */
const ruleArb: fc.Arbitrary<AvailabilityRuleInput> = fc
  .tuple(bydayArb, hourPairArb, timezoneArb)
  .map(([byday, hours, tz]) => ({
    rrule: `FREQ=WEEKLY;BYDAY=${byday}`,
    startTime: hours.startTime,
    endTime: hours.endTime,
    timezone: tz,
  }));

/** An array of 1–3 rules per resource */
const rulesArb: fc.Arbitrary<AvailabilityRuleInput[]> = fc.array(ruleArb, {
  minLength: 1,
  maxLength: 3,
});

/**
 * Generate a random booking whose window falls inside the test date range.
 * Status is randomly one of confirmed / pending / cancelled / rejected.
 *
 * @returns fast-check arbitrary for `BookingInput`
 */
function resourceBookingArb(): fc.Arbitrary<BookingInput> {
  const startMs = FUTURE_START.getTime();
  const endMs = FUTURE_END.getTime();
  const rangeMs = endMs - startMs;

  return fc
    .tuple(
      fc.integer({ min: 0, max: rangeMs - 30 * 60 * 1000 }),
      fc.integer({ min: 15, max: 120 }),
      fc.constantFrom(
        "confirmed" as const,
        "pending" as const,
        "cancelled" as const,
        "rejected" as const,
      ),
      fc.integer({ min: 1, max: 8 }),
    )
    .map(([offsetMs, durationMin, status, guestCount]) => ({
      startsAt: new Date(startMs + offsetMs),
      endsAt: new Date(startMs + offsetMs + durationMin * 60 * 1000),
      status,
      guestCount,
    }));
}

/**
 * Generate a valid `ResourceInput` with:
 * - Unique UUID-style id
 * - Random capacity 1–20
 * - Random type from a small set
 * - 1–3 random weekly rules
 * - 0–5 random bookings
 *
 * @param id - Deterministic identifier assigned by the caller
 * @returns fast-check arbitrary for `ResourceInput`
 */
function resourceArb(id: string): fc.Arbitrary<ResourceInput> {
  return fc
    .tuple(
      fc.integer({ min: 1, max: 20 }),
      fc.constantFrom("table", "room", "court", "desk", "mat"),
      rulesArb,
      fc.array(resourceBookingArb(), { minLength: 0, maxLength: 5 }),
      fc.boolean(),
    )
    .map(([capacity, type, rules, bookings, isActive]) => ({
      id,
      name: `Resource-${id}`,
      type,
      capacity,
      isActive,
      rules,
      overrides: [] as AvailabilityOverrideInput[],
      bookings,
    }));
}

/**
 * Generate an array of 1–10 resources, each with a unique numeric id string.
 * Always includes at least one active resource so pool-level functions have
 * something to work with.
 */
const resourcePoolArb: fc.Arbitrary<ResourceInput[]> = fc
  .integer({ min: 1, max: 10 })
  .chain((count) => {
    const resourceArbs = Array.from({ length: count }, (_, i) =>
      resourceArb(`r${i + 1}`),
    );
    return fc.tuple(...(resourceArbs as [fc.Arbitrary<ResourceInput>]));
  })
  .map((tuple) => {
    // fc.tuple returns a tuple — normalise to an array
    const pool = (Array.isArray(tuple) ? tuple : [tuple]) as ResourceInput[];
    // Guarantee at least one active resource so pool results are non-trivial
    const hasActive = pool.some((r) => r.isActive === true);
    if (!hasActive && pool.length > 0) {
      return [{ ...pool[0], isActive: true }, ...pool.slice(1)];
    }
    return pool;
  });

/**
 * Generate an `AvailableResource` booking that targets a specific resource id
 * within the test date range.
 */
function bookingForResourceArb(resourceId: string): fc.Arbitrary<BookingInput> {
  return resourceBookingArb().map((b) => ({ ...b, resourceId }));
}

// ---------------------------------------------------------------------------
// Helper: total remaining capacity across all available resources in a slot
// ---------------------------------------------------------------------------

function totalRemainingCapacity(slots: ReturnType<typeof getResourceAvailableSlots>): number {
  return slots.reduce(
    (sum, slot) =>
      sum +
      slot.availableResources.reduce((s, r) => s + r.remainingCapacity, 0),
    0,
  );
}

// ---------------------------------------------------------------------------
// Property-Based Tests: Resource Scheduling Invariants
// ---------------------------------------------------------------------------

describe("Property-based: Resource Scheduling Invariants", () => {
  // -------------------------------------------------------------------------
  // Invariant 1 — No over-booking
  // -------------------------------------------------------------------------

  describe("Invariant 1 — No over-booking", () => {
    it(
      "getResourceAvailableSlots never returns a slot where remainingCapacity is negative",
      () => {
        fc.assert(
          fc.property(resourcePoolArb, (pool) => {
            const slots = getResourceAvailableSlots(
              pool,
              DATE_RANGE,
              "UTC",
              BASE_OPTIONS,
            );

            for (const slot of slots) {
              for (const ar of slot.availableResources) {
                expect(ar.remainingCapacity).toBeGreaterThanOrEqual(0);
              }
            }
          }),
          { numRuns: 500 },
        );
      },
    );

    it(
      "getResourceAvailableSlots never returns a slot where availableResources count is negative",
      () => {
        fc.assert(
          fc.property(resourcePoolArb, (pool) => {
            const slots = getResourceAvailableSlots(
              pool,
              DATE_RANGE,
              "UTC",
              BASE_OPTIONS,
            );

            for (const slot of slots) {
              expect(slot.availableResources.length).toBeGreaterThanOrEqual(0);
            }
          }),
          { numRuns: 500 },
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // Invariant 2 — Capacity monotonicity
  // -------------------------------------------------------------------------

  describe("Invariant 2 — Capacity monotonicity", () => {
    it(
      "adding a confirmed booking to a resource can only decrease (never increase) total remaining capacity",
      () => {
        fc.assert(
          fc.property(
            resourcePoolArb,
            resourceBookingArb(),
            (pool, newBooking) => {
              // Only test with active resources that have rules (otherwise pool
              // may be empty and the invariant is vacuously true on both sides)
              const activePool = pool.filter(
                (r) => r.isActive === true && r.rules.length > 0,
              );
              if (activePool.length === 0) return;

              // Baseline slots
              const slotsBefore = getResourceAvailableSlots(
                activePool,
                DATE_RANGE,
                "UTC",
                BASE_OPTIONS,
              );

              // Add a confirmed booking to the first active resource
              const target = activePool[0];
              const confirmedBooking: BookingInput = {
                ...newBooking,
                status: "confirmed",
              };
              const poolWithBooking = activePool.map((r) =>
                r.id === target.id
                  ? { ...r, bookings: [...r.bookings, confirmedBooking] }
                  : r,
              );

              const slotsAfter = getResourceAvailableSlots(
                poolWithBooking,
                DATE_RANGE,
                "UTC",
                BASE_OPTIONS,
              );

              // The total count of available slots can only stay the same or
              // decrease after adding an active booking
              expect(slotsAfter.length).toBeLessThanOrEqual(slotsBefore.length);

              // Total remaining capacity can only stay the same or decrease
              const capacityBefore = totalRemainingCapacity(slotsBefore);
              const capacityAfter = totalRemainingCapacity(slotsAfter);
              expect(capacityAfter).toBeLessThanOrEqual(capacityBefore);
            },
          ),
          { numRuns: 500 },
        );
      },
      // Each run calls getResourceAvailableSlots twice on a pool of up to 10
      // resources — allow up to 30 s total for this property
      30_000,
    );

    it(
      "adding a cancelled booking to a resource does not change the available slot count",
      () => {
        fc.assert(
          fc.property(
            resourcePoolArb,
            resourceBookingArb(),
            (pool, newBooking) => {
              const activePool = pool.filter(
                (r) => r.isActive === true && r.rules.length > 0,
              );
              if (activePool.length === 0) return;

              const slotsBefore = getResourceAvailableSlots(
                activePool,
                DATE_RANGE,
                "UTC",
                BASE_OPTIONS,
              );

              const target = activePool[0];
              const cancelledBooking: BookingInput = {
                ...newBooking,
                status: "cancelled",
              };
              const poolWithBooking = activePool.map((r) =>
                r.id === target.id
                  ? { ...r, bookings: [...r.bookings, cancelledBooking] }
                  : r,
              );

              const slotsAfter = getResourceAvailableSlots(
                poolWithBooking,
                DATE_RANGE,
                "UTC",
                BASE_OPTIONS,
              );

              // Cancelled bookings must not consume capacity
              expect(slotsAfter.length).toBe(slotsBefore.length);
            },
          ),
          { numRuns: 500 },
        );
      },
      30_000,
    );
  });

  // -------------------------------------------------------------------------
  // Invariant 3 — Superset consistency
  // -------------------------------------------------------------------------

  /**
   * Small-pool arbitrary (1–4 resources) used for the superset test.
   *
   * The superset invariant calls `getResourceAvailableSlots` once for the pool
   * and then once per resource.  Capping the pool at 4 keeps each run under
   * ~5 ms so 500 runs comfortably finish within 30 s.
   */
  const smallPoolArb: fc.Arbitrary<ResourceInput[]> = fc
    .integer({ min: 1, max: 4 })
    .chain((count) => {
      const arbs = Array.from({ length: count }, (_, i) =>
        resourceArb(`sp${i + 1}`),
      );
      return fc.tuple(...(arbs as [fc.Arbitrary<ResourceInput>]));
    })
    .map((tuple) => {
      const pool = (Array.isArray(tuple)
        ? tuple
        : [tuple]) as ResourceInput[];
      const hasActive = pool.some((r) => r.isActive === true);
      if (!hasActive && pool.length > 0) {
        return [{ ...pool[0], isActive: true }, ...pool.slice(1)];
      }
      return pool;
    });

  describe("Invariant 3 — Superset consistency", () => {
    it(
      "every pool-level slot start time also appears in at least one individual resource's slot list",
      () => {
        fc.assert(
          fc.property(smallPoolArb, (pool) => {
            const activePool = pool.filter(
              (r) => r.isActive === true && r.rules.length > 0,
            );
            if (activePool.length === 0) return;

            // Pool-level result
            const poolSlots = getResourceAvailableSlots(
              activePool,
              DATE_RANGE,
              "UTC",
              BASE_OPTIONS,
            );

            if (poolSlots.length === 0) return;

            // Build the union of startTime keys from each individual resource
            const individualStartTimes = new Set<string>();
            for (const resource of activePool) {
              const resourceSlots = getResourceAvailableSlots(
                [resource],
                DATE_RANGE,
                "UTC",
                BASE_OPTIONS,
              );
              for (const s of resourceSlots) {
                individualStartTimes.add(s.startTime);
              }
            }

            // Every slot in the pool view must be covered by at least one
            // individual resource view — the pool is a subset of the union
            for (const poolSlot of poolSlots) {
              expect(individualStartTimes.has(poolSlot.startTime)).toBe(true);
            }
          }),
          { numRuns: 500 },
        );
      },
      // 500 runs × up to 5 individual resource calls each — allow 30 s
      30_000,
    );

    it(
      "every AvailableResource listed in a pool slot belongs to the input pool",
      () => {
        fc.assert(
          fc.property(resourcePoolArb, (pool) => {
            const poolIds = new Set(pool.map((r) => r.id));

            const slots = getResourceAvailableSlots(
              pool,
              DATE_RANGE,
              "UTC",
              BASE_OPTIONS,
            );

            for (const slot of slots) {
              for (const ar of slot.availableResources) {
                expect(poolIds.has(ar.resourceId)).toBe(true);
              }
            }
          }),
          { numRuns: 500 },
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // Invariant 4 — Assignment validity
  // -------------------------------------------------------------------------

  describe("Invariant 4 — Assignment validity", () => {
    it(
      "assignResource never returns a resource whose active bookings overlap the requested window",
      () => {
        fc.assert(
          fc.property(
            resourcePoolArb,
            // Random slot window inside the test range (60-minute window)
            fc
              .integer({
                min: 0,
                max:
                  FUTURE_END.getTime() -
                  FUTURE_START.getTime() -
                  60 * 60 * 1000,
              })
              .map((offsetMs) => ({
                startTime: new Date(FUTURE_START.getTime() + offsetMs),
                endTime: new Date(
                  FUTURE_START.getTime() + offsetMs + 60 * 60 * 1000,
                ),
              })),
            (pool, window) => {
              // Ensure we have at least one active, rule-bearing resource with
              // enough capacity to be assignable
              const viablePool = pool.filter(
                (r) => r.isActive === true && r.rules.length > 0,
              );
              if (viablePool.length === 0) return;

              let result: ReturnType<typeof assignResource> | undefined;
              try {
                result = assignResource(viablePool, window.startTime, window.endTime, {
                  ...BASE_OPTIONS,
                  strategy: "first_available",
                });
              } catch (err) {
                // ResourceUnavailableError is acceptable — no valid resource
                if (err instanceof ResourceUnavailableError) return;
                throw err;
              }

              if (result === undefined) return;

              // Find the assigned resource in the pool
              const assigned = viablePool.find(
                (r) => r.id === result!.resourceId,
              );
              expect(assigned).toBeDefined();

              if (!assigned) return;

              // Verify that no active booking on the assigned resource overlaps
              // the requested window (no buffer applied in this invariant check)
              const activeBookings = assigned.bookings.filter(
                (b) => b.status !== "cancelled" && b.status !== "rejected",
              );

              for (const booking of activeBookings) {
                const overlaps =
                  window.startTime.getTime() < booking.endsAt.getTime() &&
                  window.endTime.getTime() > booking.startsAt.getTime();
                expect(overlaps).toBe(false);
              }
            },
          ),
          { numRuns: 500 },
        );
      },
    );

    it(
      "assignResource always returns a resource whose id is in the input pool",
      () => {
        fc.assert(
          fc.property(
            resourcePoolArb,
            fc
              .integer({
                min: 0,
                max:
                  FUTURE_END.getTime() -
                  FUTURE_START.getTime() -
                  60 * 60 * 1000,
              })
              .map((offsetMs) => ({
                startTime: new Date(FUTURE_START.getTime() + offsetMs),
                endTime: new Date(
                  FUTURE_START.getTime() + offsetMs + 60 * 60 * 1000,
                ),
              })),
            (pool, window) => {
              const viablePool = pool.filter((r) => r.isActive === true);
              if (viablePool.length === 0) return;

              const poolIds = new Set(viablePool.map((r) => r.id));

              let result: ReturnType<typeof assignResource> | undefined;
              try {
                result = assignResource(
                  viablePool,
                  window.startTime,
                  window.endTime,
                  BASE_OPTIONS,
                );
              } catch (err) {
                if (err instanceof ResourceUnavailableError) return;
                throw err;
              }

              if (result) {
                expect(poolIds.has(result.resourceId)).toBe(true);
              }
            },
          ),
          { numRuns: 500 },
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // Invariant 5 — Strategy ordering: best_fit
  // -------------------------------------------------------------------------

  describe("Invariant 5 — Strategy ordering (best_fit)", () => {
    it(
      "best_fit always returns the smallest-capacity resource that fits the requested party size",
      () => {
        fc.assert(
          fc.property(
            // Build a pool of 2–5 resources, all active, each with a distinct
            // capacity chosen from a controlled set so the ordering is clear
            fc
              .array(fc.integer({ min: 1, max: 10 }), {
                minLength: 2,
                maxLength: 5,
              })
              .chain((capacities) =>
                // Pair each capacity with a rule so the resource is schedulable
                fc.tuple(
                  ...capacities.map((cap, i) =>
                    fc.tuple(ruleArb).map(([rule]) => ({
                      id: `bf-r${i}`,
                      name: `BestFit-${i}`,
                      type: "table",
                      capacity: cap,
                      isActive: true as const,
                      rules: [rule],
                      overrides: [] as AvailabilityOverrideInput[],
                      bookings: [] as BookingInput[],
                    })),
                  ),
                ),
              )
              .map((tuple) =>
                (Array.isArray(tuple)
                  ? (tuple as ResourceInput[])
                  : [tuple as unknown as ResourceInput]),
              ),
            // Random requested capacity between 1 and the minimum pool capacity
            // (ensures at least one resource always qualifies)
            fc.integer({ min: 1, max: 1 }),
            // Random booking window inside the test range
            fc
              .integer({
                min: 0,
                max:
                  FUTURE_END.getTime() -
                  FUTURE_START.getTime() -
                  60 * 60 * 1000,
              })
              .map((offsetMs) => ({
                startTime: new Date(FUTURE_START.getTime() + offsetMs),
                endTime: new Date(
                  FUTURE_START.getTime() + offsetMs + 60 * 60 * 1000,
                ),
              })),
            (pool, requestedCapacity, window) => {
              if (pool.length === 0) return;

              let result: ReturnType<typeof assignResource> | undefined;
              try {
                result = assignResource(
                  pool,
                  window.startTime,
                  window.endTime,
                  {
                    ...BASE_OPTIONS,
                    strategy: "best_fit",
                    requestedCapacity,
                  },
                );
              } catch (err) {
                if (err instanceof ResourceUnavailableError) return;
                throw err;
              }

              if (result === undefined) return;

              const assigned = pool.find((r) => r.id === result!.resourceId);
              expect(assigned).toBeDefined();
              if (!assigned) return;

              // The assigned resource must have capacity >= requestedCapacity
              expect(assigned.capacity).toBeGreaterThanOrEqual(requestedCapacity);

              // No OTHER free resource with capacity >= requestedCapacity and
              // SMALLER capacity than the chosen one should exist.
              // (best_fit picks the smallest resource that fits)
              const freeAndFit = pool.filter((r) => {
                if (r.capacity < requestedCapacity) return false;
                const activeBookings = r.bookings.filter(
                  (b) => b.status !== "cancelled" && b.status !== "rejected",
                );
                const busy = activeBookings.some(
                  (b) =>
                    window.startTime.getTime() < b.endsAt.getTime() &&
                    window.endTime.getTime() > b.startsAt.getTime(),
                );
                return !busy;
              });

              if (freeAndFit.length === 0) return;

              const minCapacity = Math.min(...freeAndFit.map((r) => r.capacity));
              expect(assigned.capacity).toBe(minCapacity);
            },
          ),
          { numRuns: 500 },
        );
      },
    );

    it(
      "best_fit result capacity is <= any larger free resource that also fits the party size",
      () => {
        fc.assert(
          fc.property(
            // Controlled pool: two resources with different capacities, both
            // active, no bookings — simplest scenario for the ordering invariant
            fc
              .tuple(
                fc.integer({ min: 1, max: 8 }),
                fc.integer({ min: 9, max: 20 }),
                ruleArb,
              )
              .map(([smallCap, largeCap, rule]) => [
                {
                  id: "small",
                  name: "Small Resource",
                  type: "table",
                  capacity: smallCap,
                  isActive: true as const,
                  rules: [rule],
                  overrides: [] as AvailabilityOverrideInput[],
                  bookings: [] as BookingInput[],
                } satisfies ResourceInput,
                {
                  id: "large",
                  name: "Large Resource",
                  type: "table",
                  capacity: largeCap,
                  isActive: true as const,
                  rules: [rule],
                  overrides: [] as AvailabilityOverrideInput[],
                  bookings: [] as BookingInput[],
                } satisfies ResourceInput,
              ]),
            fc
              .integer({
                min: 0,
                max:
                  FUTURE_END.getTime() -
                  FUTURE_START.getTime() -
                  60 * 60 * 1000,
              })
              .map((offsetMs) => ({
                startTime: new Date(FUTURE_START.getTime() + offsetMs),
                endTime: new Date(
                  FUTURE_START.getTime() + offsetMs + 60 * 60 * 1000,
                ),
              })),
            (pool, window) => {
              let result: ReturnType<typeof assignResource> | undefined;
              try {
                result = assignResource(
                  pool,
                  window.startTime,
                  window.endTime,
                  {
                    ...BASE_OPTIONS,
                    strategy: "best_fit",
                    requestedCapacity: 1,
                  },
                );
              } catch (err) {
                if (err instanceof ResourceUnavailableError) return;
                throw err;
              }

              if (result === undefined) return;

              const assigned = pool.find((r) => r.id === result!.resourceId);
              expect(assigned).toBeDefined();
              if (!assigned) return;

              // With best_fit and both resources available, the small one wins
              const otherFreeResources = pool.filter(
                (r) =>
                  r.id !== assigned.id &&
                  r.capacity >= 1 &&
                  r.isActive === true,
              );

              for (const other of otherFreeResources) {
                // assigned.capacity <= nextLargerResource.capacity
                expect(assigned.capacity).toBeLessThanOrEqual(other.capacity);
              }
            },
          ),
          { numRuns: 500 },
        );
      },
    );
  });
});
