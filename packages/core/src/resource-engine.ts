/**
 * Resource slot engine: capacity-aware availability, auto-assignment, and pool
 * summary computation for physical or virtual bookable resources (tables, rooms,
 * courts, desks, yoga mats, etc.).
 *
 * Architecture mirrors `team-scheduling.ts`: compute availability per resource
 * using the shared slot pipeline, then merge results into a pool-level view.
 *
 * Four public functions:
 * - `getResourceAvailableSlots`  — capacity-filtered slot list for a resource pool
 * - `assignResource`             — auto-select best resource for a booking
 * - `isResourceSlotAvailable`    — quick single-slot check (specific or pool)
 * - `getResourcePoolSummary`     — admin dashboard utilization snapshot
 */

import { addMinutes, areIntervalsOverlapping } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { parseRecurrence } from "./rrule-parser.js";
import {
  expandRules,
  applyOverrides,
  generateCandidateSlots,
  formatDateOnly,
  formatDateInTimezone,
  formatInTimezone,
} from "./slot-pipeline.js";
import { applySlotRelease } from "./slot-release.js";
import { ResourceUnavailableError } from "./errors.js";
import type {
  DateRange,
  ResourceInput,
  ResourceSlot,
  AvailableResource,
  ResourceAssignmentResult,
  ResourceSlotAvailabilityResult,
  ResourcePoolSummary,
  ResourceSlotOptions,
  BookingInput,
} from "./types.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return active bookings — those whose status is not "cancelled" or "rejected".
 *
 * @param bookings - All bookings associated with a resource
 * @returns Bookings that are still active
 */
function getActiveBookings(bookings: BookingInput[]): BookingInput[] {
  return bookings.filter(
    (b) => b.status !== "cancelled" && b.status !== "rejected",
  );
}

/**
 * Pre-processed booking boundary used in the hot capacity-check loop.
 *
 * Storing pre-buffered epoch millisecond boundaries avoids repeated
 * `addMinutes` calls (which allocate new Date objects) and `areIntervalsOverlapping`
 * calls (which take object literal arguments) on every candidate slot.
 */
interface BufferedBooking {
  /** bufferedStart in epoch ms: booking.startsAt - bufferBefore */
  bufferedStartMs: number;
  /** bufferedEnd in epoch ms: booking.endsAt + bufferAfter */
  bufferedEndMs: number;
  /** Raw booking start in epoch ms (used for direct-overlap detection) */
  startsAtMs: number;
  /** Raw booking end in epoch ms (used for direct-overlap detection) */
  endsAtMs: number;
  /** Party size this booking consumes */
  guestCount: number;
}

/**
 * Pre-process a resource's active bookings into epoch-millisecond boundaries.
 *
 * Called once per resource before the candidate-slot loop, eliminating
 * per-slot `addMinutes` allocations and `areIntervalsOverlapping` objects.
 *
 * @param bookings - All bookings for the resource
 * @param bufferBeforeMs - Buffer in milliseconds to subtract from each booking start
 * @param bufferAfterMs - Buffer in milliseconds to add to each booking end
 * @returns Pre-computed boundary objects for every active booking
 */
function precomputeActiveBookings(
  bookings: BookingInput[],
  bufferBeforeMs: number,
  bufferAfterMs: number,
): BufferedBooking[] {
  const result: BufferedBooking[] = [];
  for (const b of bookings) {
    if (b.status === "cancelled" || b.status === "rejected") continue;
    const startsAtMs = b.startsAt.getTime();
    const endsAtMs = b.endsAt.getTime();
    result.push({
      bufferedStartMs: startsAtMs - bufferBeforeMs,
      bufferedEndMs: endsAtMs + bufferAfterMs,
      startsAtMs,
      endsAtMs,
      guestCount: b.guestCount ?? 1,
    });
  }
  return result;
}

/**
 * Compute remaining capacity using pre-buffered epoch-ms boundaries.
 *
 * All comparisons are integer arithmetic — no Date allocations or object
 * literal arguments in the hot path.
 *
 * @param capacity - Maximum capacity of the resource
 * @param bufferedBookings - Pre-computed from `precomputeActiveBookings`
 * @param slotStartMs - Candidate slot start in epoch ms
 * @param slotEndMs - Candidate slot end in epoch ms
 * @returns Remaining capacity (≥ 0)
 */
function computeRemainingCapacityFast(
  capacity: number,
  bufferedBookings: BufferedBooking[],
  slotStartMs: number,
  slotEndMs: number,
): number {
  let occupied = 0;
  for (const booking of bufferedBookings) {
    // areIntervalsOverlapping semantics: overlap when start < otherEnd && end > otherStart
    if (slotStartMs < booking.bufferedEndMs && slotEndMs > booking.bufferedStartMs) {
      occupied += booking.guestCount;
    }
  }
  return Math.max(0, capacity - occupied);
}

/**
 * Compute the remaining capacity for a resource at a given time window,
 * accounting for overlapping active bookings.
 *
 * Buffer expansion is applied per booking: the effective blocked range of an
 * existing booking is `[startsAt - bufferBefore, endsAt + bufferAfter]`.
 *
 * This function is used by `isResourceSlotAvailable` and `checkSingleResource`
 * where pre-computation per resource is not worth the overhead (single call path).
 *
 * @param resource - The resource to evaluate
 * @param slotStart - Proposed slot start (UTC)
 * @param slotEnd - Proposed slot end (UTC)
 * @param bufferBefore - Minutes of buffer before the slot to block
 * @param bufferAfter - Minutes of buffer after the slot to block
 * @returns Remaining capacity (resource.capacity minus the sum of guestCount
 *   for every active booking that overlaps the buffered window). Can be zero
 *   but never negative.
 */
function computeRemainingCapacity(
  resource: ResourceInput,
  slotStart: Date,
  slotEnd: Date,
  bufferBefore: number,
  bufferAfter: number,
): number {
  const active = getActiveBookings(resource.bookings);
  let occupiedCapacity = 0;

  for (const booking of active) {
    const bufferedStart = addMinutes(booking.startsAt, -bufferBefore);
    const bufferedEnd = addMinutes(booking.endsAt, bufferAfter);

    if (
      areIntervalsOverlapping(
        { start: slotStart, end: slotEnd },
        { start: bufferedStart, end: bufferedEnd },
      )
    ) {
      occupiedCapacity += booking.guestCount ?? 1;
    }
  }

  return Math.max(0, resource.capacity - occupiedCapacity);
}

/**
 * Check whether a booking overlaps a time window, respecting buffer time.
 *
 * @param booking - The booking to test
 * @param slotStart - Proposed start time (UTC)
 * @param slotEnd - Proposed end time (UTC)
 * @param bufferBefore - Minutes of pre-slot buffer applied to booking boundaries
 * @param bufferAfter - Minutes of post-slot buffer applied to booking boundaries
 * @returns `true` when the booking's buffered interval overlaps with the slot
 */
function bookingOverlaps(
  booking: BookingInput,
  slotStart: Date,
  slotEnd: Date,
  bufferBefore: number,
  bufferAfter: number,
): boolean {
  return areIntervalsOverlapping(
    { start: slotStart, end: slotEnd },
    {
      start: addMinutes(booking.startsAt, -bufferBefore),
      end: addMinutes(booking.endsAt, bufferAfter),
    },
  );
}

/**
 * Determine the provider timezone for a resource.
 *
 * Falls back to "UTC" when the resource has no availability rules (e.g. a
 * resource whose schedule is entirely driven by overrides).
 *
 * @param resource - The resource whose timezone to resolve
 * @returns IANA timezone string
 */
function resolveResourceTz(resource: ResourceInput): string {
  return resource.rules.length > 0 ? resource.rules[0].timezone : "UTC";
}

// ---------------------------------------------------------------------------
// 1. getResourceAvailableSlots
// ---------------------------------------------------------------------------

/**
 * Compute capacity-aware available slots for a pool of bookable resources.
 *
 * The function runs the three-step pipeline independently for each active
 * resource, then merges results by time slot (keyed on `startTime|endTime`).
 * A slot is included in the result only if at least one resource has a
 * remaining capacity of ≥ 1 at that time.
 *
 * Filtering:
 * - Inactive resources (`isActive !== true`) are excluded.
 * - `options.resourceType` limits computation to a specific type.
 * - `options.minCapacity` filters out resources too small for the party.
 * - `options.bufferBefore`/`bufferAfter` apply per resource.
 * - Slots whose `end` is before `options.now` (default `new Date()`) are
 *   discarded so callers never see bookable times in the past.
 *
 * Merge semantics:
 * - Each `ResourceSlot` carries `availableResources` — the list of resources
 *   still available at that time with per-resource `remainingCapacity`.
 * - Slots are sorted chronologically; ties are broken by total remaining
 *   capacity (highest first).
 *
 * @param resources - The pool of bookable resources with their scheduling data
 * @param dateRange - UTC date range to compute slots within
 * @param customerTimezone - IANA timezone for `localStart`/`localEnd` formatting
 * @param options - Duration, buffer, interval, type filter, and capacity filter
 * @returns Sorted array of `ResourceSlot` objects ready for API consumption
 */
export function getResourceAvailableSlots(
  resources: ResourceInput[],
  dateRange: DateRange,
  customerTimezone: string,
  options?: ResourceSlotOptions,
): ResourceSlot[] {
  const duration = options?.duration ?? 30;
  const bufferBefore = options?.bufferBefore ?? 0;
  const bufferAfter = options?.bufferAfter ?? 0;
  const slotInterval = options?.slotInterval ?? duration;
  const now = options?.now ?? new Date();

  // --- Filter the pool ---
  let pool = resources.filter((r) => r.isActive === true);

  if (options?.resourceType !== undefined) {
    pool = pool.filter((r) => r.type === options.resourceType);
  }

  if (options?.minCapacity !== undefined) {
    const min = options.minCapacity;
    pool = pool.filter((r) => r.capacity >= min);
  }

  if (pool.length === 0) return [];

  // Buffer times in milliseconds — computed once, used in pre-computation below
  const bufferBeforeMs = bufferBefore * 60_000;
  const bufferAfterMs = bufferAfter * 60_000;
  const nowMs = now.getTime();

  // --- Per-resource pipeline ---
  // Key: epoch-ms tuple "startMs|endMs" → map of resourceId → AvailableResource
  // Using epoch-ms strings avoids calling toISOString() in the hot candidate loop;
  // ISO strings are derived once during result assembly.
  const slotMap = new Map<string, Map<string, AvailableResource>>();

  for (const resource of pool) {
    const resourceTz = resolveResourceTz(resource);

    // Step 1: Expand rules into raw UTC windows
    const rawWindows = expandRules(resource.rules, dateRange);

    // Step 2: Apply overrides
    const maskedWindows = applyOverrides(rawWindows, resource.overrides, resourceTz);

    // Step 3: Chop into candidate slots
    const candidates = generateCandidateSlots(maskedWindows, duration, slotInterval);

    // Pre-compute buffered booking boundaries once per resource (not per candidate).
    // This converts active-booking filtering + addMinutes + areIntervalsOverlapping
    // into a single integer-comparison loop in the hot path below.
    const bufferedBookings = precomputeActiveBookings(
      resource.bookings,
      bufferBeforeMs,
      bufferAfterMs,
    );

    // Step 4: Capacity-aware filter
    for (const candidate of candidates) {
      const slotEndMs = candidate.end.getTime();

      // Discard past slots — compare epoch ms (no Date construction)
      if (slotEndMs <= nowMs) continue;

      const slotStartMs = candidate.start.getTime();

      const remaining = computeRemainingCapacityFast(
        resource.capacity,
        bufferedBookings,
        slotStartMs,
        slotEndMs,
      );

      if (remaining < 1) continue;

      // Use epoch-ms tuple as map key — avoids toISOString() in the hot loop
      const key = `${slotStartMs}|${slotEndMs}`;
      let resourcesAtSlot = slotMap.get(key);
      if (!resourcesAtSlot) {
        resourcesAtSlot = new Map<string, AvailableResource>();
        slotMap.set(key, resourcesAtSlot);
      }

      resourcesAtSlot.set(resource.id, {
        resourceId: resource.id,
        resourceName: resource.name,
        resourceType: resource.type,
        remainingCapacity: remaining,
      });
    }
  }

  if (slotMap.size === 0) return [];

  // --- Build ResourceSlot[] from the merged map ---
  // ISO strings and timezone formatting happen once per unique slot, not per resource.
  const result: ResourceSlot[] = [];

  for (const [key, resourcesAtSlot] of slotMap.entries()) {
    const pipeIdx = key.indexOf("|");
    const startMs = Number(key.slice(0, pipeIdx));
    const endMs = Number(key.slice(pipeIdx + 1));
    const start = new Date(startMs);
    const end = new Date(endMs);
    const startISO = start.toISOString();
    const endISO = end.toISOString();
    const availableResources = Array.from(resourcesAtSlot.values());

    result.push({
      startTime: startISO,
      endTime: endISO,
      localStart: formatInTimezone(start, customerTimezone),
      localEnd: formatInTimezone(end, customerTimezone),
      availableResources,
    });
  }

  // Sort chronologically by epoch ms; break ties by total remaining capacity (descending)
  result.sort((a, b) => {
    const timeDiff =
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    if (timeDiff !== 0) return timeDiff;

    const totalA = a.availableResources.reduce(
      (sum, r) => sum + r.remainingCapacity,
      0,
    );
    const totalB = b.availableResources.reduce(
      (sum, r) => sum + r.remainingCapacity,
      0,
    );
    return totalB - totalA;
  });

  // --- Step 4B: Slot Release Strategy for resource pool (opt-in, E-23) ---
  // Applied after pool merge and sort, before returning to caller. When
  // slotRelease is undefined this block is skipped — zero overhead.
  if (options?.slotRelease) {
    // Extract raw { start, end } pairs from the assembled result.
    const candidates = result.map((rs) => ({
      start: new Date(rs.startTime),
      end: new Date(rs.endTime),
    }));

    // Aggregate all pool bookings for pool-level fill rate computation.
    const allPoolBookings = pool.flatMap((r) => r.bookings);

    // Derive provider timezone from the first rule of the first pool resource.
    const providerTz =
      pool.length > 0 && pool[0].rules.length > 0
        ? pool[0].rules[0].timezone
        : "UTC";

    const releaseResult = applySlotRelease(
      candidates,
      options.slotRelease,
      allPoolBookings,
      providerTz,
      now,
    );

    // Filter result to only surviving slots.
    const survivingMs = new Set(
      releaseResult.slots.map((s) => s.start.getTime()),
    );
    const filtered = result.filter((rs) =>
      survivingMs.has(new Date(rs.startTime).getTime()),
    );

    // Apply discount metadata from discount_incentive strategy (no-op for others).
    if (releaseResult.discountMap.size > 0) {
      for (const rs of filtered) {
        const discount = releaseResult.discountMap.get(
          new Date(rs.startTime).getTime(),
        );
        if (discount !== undefined) {
          rs.releaseMetadata = { discountPercent: discount };
        }
      }
    }

    return filtered;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 2. assignResource
// ---------------------------------------------------------------------------

/**
 * Automatically select the best resource from a pool for a given time window.
 *
 * The function applies the requested allocation `strategy` after narrowing the
 * pool to resources that are active, match the optional `resourceType`, have
 * sufficient capacity for the party (`requestedCapacity`), and are free at the
 * requested time (no overlapping active bookings within buffer boundaries).
 *
 * Strategies:
 * - `"best_fit"` (default) — smallest resource whose `capacity >= requestedCapacity`
 * - `"first_available"` — first free resource in array order
 * - `"round_robin"` — resource with the lowest `bookingCount` in `options.pastCounts`
 * - `"largest_first"` — resource with the highest `capacity`
 *
 * Error escalation:
 * 1. No resource matches the requested `resourceType` → `"no_matching_type"`
 * 2. No matching resource has sufficient `capacity` → `"no_capacity"`
 * 3. All capacity-sufficient resources are booked → `"all_booked"`
 *
 * @param resources - The pool of bookable resources
 * @param startTime - Requested booking start time (UTC)
 * @param endTime - Requested booking end time (UTC)
 * @param options - Strategy, capacity, buffer, and round-robin counts
 * @returns The selected resource's id, name, and a reason string
 * @throws {ResourceUnavailableError} When no resource can be assigned
 */
export function assignResource(
  resources: ResourceInput[],
  startTime: Date,
  endTime: Date,
  options?: ResourceSlotOptions,
): ResourceAssignmentResult {
  const bufferBefore = options?.bufferBefore ?? 0;
  const bufferAfter = options?.bufferAfter ?? 0;
  const strategy = options?.strategy ?? "best_fit";
  const requestedCapacity =
    options?.requestedCapacity ?? options?.minCapacity ?? 1;

  // --- Step 1: active resources ---
  let pool = resources.filter((r) => r.isActive === true);

  // --- Step 2: type filter ---
  if (options?.resourceType !== undefined) {
    pool = pool.filter((r) => r.type === options.resourceType);
  }

  if (pool.length === 0) {
    throw new ResourceUnavailableError("no_matching_type");
  }

  // --- Step 3: capacity filter ---
  const capacityFiltered = pool.filter(
    (r) => r.capacity >= requestedCapacity,
  );

  if (capacityFiltered.length === 0) {
    throw new ResourceUnavailableError("no_capacity");
  }

  // --- Step 4: availability filter (no overlapping active bookings) ---
  const freeResources = capacityFiltered.filter((resource) => {
    const active = getActiveBookings(resource.bookings);
    return !active.some((booking) =>
      bookingOverlaps(booking, startTime, endTime, bufferBefore, bufferAfter),
    );
  });

  if (freeResources.length === 0) {
    throw new ResourceUnavailableError("all_booked");
  }

  // --- Step 5: apply strategy ---
  let chosen: ResourceInput;
  let reason: string;

  switch (strategy) {
    case "first_available": {
      // Keep original array order — freeResources preserves insertion order
      chosen = freeResources[0];
      reason = "first_available";
      break;
    }

    case "largest_first": {
      const sorted = [...freeResources].sort((a, b) => b.capacity - a.capacity);
      chosen = sorted[0];
      reason = "largest_first";
      break;
    }

    case "round_robin": {
      const pastCounts = options?.pastCounts ?? [];
      const countMap = new Map<string, number>(
        pastCounts.map((pc) => [pc.resourceId, pc.bookingCount]),
      );

      // Pick resource with the lowest booking count; break ties by array order
      const sorted = [...freeResources].sort((a, b) => {
        const countA = countMap.get(a.id) ?? 0;
        const countB = countMap.get(b.id) ?? 0;
        if (countA !== countB) return countA - countB;
        // Preserve original array order for ties
        return freeResources.indexOf(a) - freeResources.indexOf(b);
      });
      chosen = sorted[0];
      reason = "round_robin";
      break;
    }

    case "best_fit":
    default: {
      // Sort by capacity ascending — pick the smallest that fits
      const sorted = [...freeResources].sort((a, b) => a.capacity - b.capacity);
      chosen = sorted[0];
      reason = "best_fit";
      break;
    }
  }

  return {
    resourceId: chosen.id,
    resourceName: chosen.name,
    reason,
  };
}

// ---------------------------------------------------------------------------
// 3. isResourceSlotAvailable
// ---------------------------------------------------------------------------

/**
 * Quick availability check for a single time window, either for a specific
 * resource or for any resource in the pool.
 *
 * When `resourceId` is provided the check is scoped to that one resource:
 * 1. Not found or inactive → `{ available: false, reason: "resource_inactive" }`
 * 2. Override blocks the date → `{ available: false, reason: "blocked_date" }`
 * 3. Start/end falls outside all availability windows → `"outside_availability"`
 * 4. Overlapping booking (exact overlap) → `"resource_booked"`
 * 5. Overlapping booking (buffer-only) → `"buffer_conflict"`
 * 6. Otherwise → `{ available: true, remainingCapacity }`
 *
 * When `resourceId` is `undefined` the check is a pool-level query: any
 * active resource that passes all checks is sufficient; the best (highest)
 * `remainingCapacity` across passing resources is returned.
 *
 * @param resources - The resource pool to search
 * @param resourceId - Resource to check, or `undefined` for a pool-level check
 * @param startTime - Proposed slot start time (UTC)
 * @param endTime - Proposed slot end time (UTC)
 * @param bufferBefore - Buffer minutes before the slot (default 0)
 * @param bufferAfter - Buffer minutes after the slot (default 0)
 * @param options - Optional `options.now` for test determinism
 * @returns Availability result with remaining capacity or failure reason
 */
export function isResourceSlotAvailable(
  resources: ResourceInput[],
  resourceId: string | undefined,
  startTime: Date,
  endTime: Date,
  bufferBefore = 0,
  bufferAfter = 0,
  options?: ResourceSlotOptions,
): ResourceSlotAvailabilityResult {
  if (resourceId !== undefined) {
    return checkSingleResource(
      resources,
      resourceId,
      startTime,
      endTime,
      bufferBefore,
      bufferAfter,
    );
  }

  // Pool-level check — return available if ANY active resource passes
  const active = resources.filter((r) => r.isActive === true);
  let bestCapacity = -1;

  for (const resource of active) {
    const result = checkSingleResource(
      resources,
      resource.id,
      startTime,
      endTime,
      bufferBefore,
      bufferAfter,
    );
    if (result.available && result.remainingCapacity > bestCapacity) {
      bestCapacity = result.remainingCapacity;
    }
  }

  if (bestCapacity >= 0) {
    return { available: true, remainingCapacity: bestCapacity };
  }

  // All resources failed; return the most specific reason from the last resource
  // (outside_availability is the most common pool-level failure)
  return { available: false, reason: "outside_availability" };
}

/**
 * Internal: run the availability check for one specific resource.
 *
 * @param resources - Full resource pool (used for lookup)
 * @param resourceId - ID of the resource to check
 * @param startTime - Proposed slot start (UTC)
 * @param endTime - Proposed slot end (UTC)
 * @param bufferBefore - Buffer minutes before the slot
 * @param bufferAfter - Buffer minutes after the slot
 * @returns Availability result
 */
function checkSingleResource(
  resources: ResourceInput[],
  resourceId: string,
  startTime: Date,
  endTime: Date,
  bufferBefore: number,
  bufferAfter: number,
): ResourceSlotAvailabilityResult {
  const resource = resources.find((r) => r.id === resourceId);

  if (!resource || resource.isActive !== true) {
    return { available: false, reason: "resource_inactive" };
  }

  const resourceTz = resolveResourceTz(resource);
  const slotDateStr = formatDateInTimezone(startTime, resourceTz);

  // --- Check blocked overrides (isUnavailable = true) ---
  for (const override of resource.overrides) {
    if (
      override.isUnavailable &&
      formatDateOnly(override.date) === slotDateStr
    ) {
      return { available: false, reason: "blocked_date" };
    }
  }

  // --- Check if slot falls within any availability window ---
  let withinAvailability = false;

  for (const rule of resource.rules) {
    if (rule.validFrom && startTime < rule.validFrom) continue;
    if (rule.validUntil && startTime > rule.validUntil) continue;

    const checkRange: DateRange = {
      start: new Date(startTime.getTime() - 24 * 60 * 60 * 1000),
      end: new Date(startTime.getTime() + 24 * 60 * 60 * 1000),
    };

    const occurrences = parseRecurrence(
      rule.rrule,
      checkRange,
      rule.startTime,
      rule.endTime,
    );

    for (const occ of occurrences) {
      const windowStart = fromZonedTime(
        `${occ.date}T${occ.startTime}:00`,
        rule.timezone,
      );
      let windowEnd = fromZonedTime(
        `${occ.date}T${occ.endTime}:00`,
        rule.timezone,
      );

      // Midnight-crossing correction (C1 fix)
      if (windowEnd <= windowStart) {
        windowEnd = addMinutes(windowEnd, 24 * 60);
      }

      if (startTime >= windowStart && endTime <= windowEnd) {
        withinAvailability = true;
        break;
      }
    }

    if (withinAvailability) break;
  }

  // --- Check replacement overrides (isUnavailable = false with hours) ---
  if (!withinAvailability) {
    for (const override of resource.overrides) {
      if (
        !override.isUnavailable &&
        override.startTime &&
        override.endTime &&
        formatDateOnly(override.date) === slotDateStr
      ) {
        const windowStart = fromZonedTime(
          `${slotDateStr}T${override.startTime}:00`,
          resourceTz,
        );
        const windowEnd = fromZonedTime(
          `${slotDateStr}T${override.endTime}:00`,
          resourceTz,
        );

        if (startTime >= windowStart && endTime <= windowEnd) {
          withinAvailability = true;
          break;
        }
      }
    }
  }

  if (!withinAvailability) {
    return { available: false, reason: "outside_availability" };
  }

  // --- Check booking conflicts ---
  const active = getActiveBookings(resource.bookings);

  for (const booking of active) {
    const bufferedStart = addMinutes(booking.startsAt, -bufferBefore);
    const bufferedEnd = addMinutes(booking.endsAt, bufferAfter);

    if (
      areIntervalsOverlapping(
        { start: startTime, end: endTime },
        { start: bufferedStart, end: bufferedEnd },
      )
    ) {
      // Distinguish direct overlap from buffer-only conflict
      if (
        areIntervalsOverlapping(
          { start: startTime, end: endTime },
          { start: booking.startsAt, end: booking.endsAt },
        )
      ) {
        return { available: false, reason: "resource_booked" };
      }
      return { available: false, reason: "buffer_conflict" };
    }
  }

  // --- Compute remaining capacity ---
  const remainingCapacity = computeRemainingCapacity(
    resource,
    startTime,
    endTime,
    bufferBefore,
    bufferAfter,
  );

  return { available: true, remainingCapacity };
}

// ---------------------------------------------------------------------------
// 4. getResourcePoolSummary
// ---------------------------------------------------------------------------

/**
 * Produce a utilization summary for each available time slot across the
 * resource pool.
 *
 * The function runs the same per-resource pipeline as `getResourceAvailableSlots`
 * but instead of returning slots with resource lists it returns aggregated
 * metrics for each unique slot time: total resource count, available count,
 * `utilizationPercent`, and a per-type breakdown.
 *
 * Designed for admin dashboards that need a live capacity overview (e.g. a
 * restaurant host screen or gym manager board). The function is pure and
 * deterministic when `options.now` is provided, making it safe for polling.
 *
 * @param resources - The pool of bookable resources with their scheduling data
 * @param dateRange - UTC date range for the summary
 * @param customerTimezone - IANA timezone for `localStart`/`localEnd` formatting
 * @param options - Duration, buffer, interval, type filter, and `options.now`
 * @returns Array of `ResourcePoolSummary` objects sorted chronologically
 */
export function getResourcePoolSummary(
  resources: ResourceInput[],
  dateRange: DateRange,
  customerTimezone: string,
  options?: ResourceSlotOptions,
): ResourcePoolSummary[] {
  const duration = options?.duration ?? 30;
  const bufferBefore = options?.bufferBefore ?? 0;
  const bufferAfter = options?.bufferAfter ?? 0;
  const slotInterval = options?.slotInterval ?? duration;
  const now = options?.now ?? new Date();

  // --- Active resources (optionally type-filtered) ---
  let pool = resources.filter((r) => r.isActive === true);

  if (options?.resourceType !== undefined) {
    pool = pool.filter((r) => r.type === options.resourceType);
  }

  if (pool.length === 0) return [];

  const totalActiveResources = pool.length;

  // Buffer times in milliseconds — computed once for use in pre-computation
  const bufferBeforeMs = bufferBefore * 60_000;
  const bufferAfterMs = bufferAfter * 60_000;
  const nowMs = now.getTime();

  // Key: epoch-ms tuple "startMs|endMs" (avoids toISOString in the hot loop)
  // Value: set of resource IDs that are available at that slot
  const availableAtSlot = new Map<string, Set<string>>();
  // Track all unique slot keys in insertion order (for stable sort)
  const allSlotKeys = new Set<string>();

  for (const resource of pool) {
    const resourceTz = resolveResourceTz(resource);

    const rawWindows = expandRules(resource.rules, dateRange);
    const maskedWindows = applyOverrides(rawWindows, resource.overrides, resourceTz);
    const candidates = generateCandidateSlots(maskedWindows, duration, slotInterval);

    // Pre-compute buffered booking boundaries once per resource
    const bufferedBookings = precomputeActiveBookings(
      resource.bookings,
      bufferBeforeMs,
      bufferAfterMs,
    );

    for (const candidate of candidates) {
      const slotEndMs = candidate.end.getTime();
      if (slotEndMs <= nowMs) continue;

      const slotStartMs = candidate.start.getTime();
      const key = `${slotStartMs}|${slotEndMs}`;
      allSlotKeys.add(key);

      const remaining = computeRemainingCapacityFast(
        resource.capacity,
        bufferedBookings,
        slotStartMs,
        slotEndMs,
      );

      if (remaining >= 1) {
        let available = availableAtSlot.get(key);
        if (!available) {
          available = new Set<string>();
          availableAtSlot.set(key, available);
        }
        available.add(resource.id);
      } else {
        // Ensure the key exists in the map even when fully booked
        if (!availableAtSlot.has(key)) {
          availableAtSlot.set(key, new Set<string>());
        }
      }
    }
  }

  // --- Build summaries ---
  // ISO strings and timezone formatting happen once per unique slot
  const summaries: ResourcePoolSummary[] = [];

  for (const key of allSlotKeys) {
    const pipeIdx = key.indexOf("|");
    const startMs = Number(key.slice(0, pipeIdx));
    const endMs = Number(key.slice(pipeIdx + 1));
    const start = new Date(startMs);
    const end = new Date(endMs);
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    const availableSet = availableAtSlot.get(key) ?? new Set<string>();
    const availableCount = availableSet.size;

    const utilizationPercent =
      totalActiveResources === 0
        ? 0
        : Math.round(
            ((totalActiveResources - availableCount) / totalActiveResources) *
              100,
          );

    // --- byType breakdown ---
    const byType: Record<string, { total: number; available: number }> = {};

    for (const resource of pool) {
      if (!byType[resource.type]) {
        byType[resource.type] = { total: 0, available: 0 };
      }
      byType[resource.type].total += 1;
      if (availableSet.has(resource.id)) {
        byType[resource.type].available += 1;
      }
    }

    summaries.push({
      startTime: startISO,
      endTime: endISO,
      localStart: formatInTimezone(start, customerTimezone),
      localEnd: formatInTimezone(end, customerTimezone),
      totalResources: totalActiveResources,
      availableResources: availableCount,
      utilizationPercent,
      byType,
    });
  }

  // Sort chronologically by epoch ms
  summaries.sort(
    (a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  return summaries;
}
