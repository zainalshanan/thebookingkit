/**
 * Walk-In Queue & Hybrid Scheduling (E-19)
 *
 * Enables providers to accept walk-in customers alongside scheduled appointments.
 * Walk-ins are placed in gaps between existing bookings and queued entries,
 * with automatic wait time estimation and queue management.
 *
 * @module walk-in
 */

import { addMinutes, areIntervalsOverlapping } from "date-fns";
import { getAvailableSlots, isSlotAvailable } from "./slot-engine.js";
import type {
  AvailabilityRuleInput,
  AvailabilityOverrideInput,
  BookingInput,
  Slot,
} from "./types.js";

// ---------------------------------------------------------------------------
// Enums & Constants
// ---------------------------------------------------------------------------

/** How the booking was created */
export type BookingSource = "online" | "walk_in" | "phone" | "admin";

/** Walk-in queue entry lifecycle */
export type WalkInStatus =
  | "queued"
  | "in_service"
  | "completed"
  | "no_show"
  | "cancelled";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A walk-in queue entry */
export interface WalkInQueueEntry {
  /** Unique queue entry ID */
  id: string;
  /** Associated booking ID (created when walk-in is added) */
  bookingId: string;
  /** Provider serving this walk-in */
  providerId: string;
  /** Position in queue (1-based) */
  queuePosition: number;
  /** Computed estimated wait in minutes */
  estimatedWaitMinutes: number;
  /** When the customer checked in / was added */
  checkedInAt: Date;
  /** When the provider began service */
  serviceStartedAt: Date | null;
  /** When service was completed */
  completedAt: Date | null;
  /** Current lifecycle status */
  status: WalkInStatus;
  /** Customer name */
  customerName: string;
  /** Customer email (optional for walk-ins) */
  customerEmail?: string;
  /** Customer phone (optional) */
  customerPhone?: string;
  /** Service/event type ID */
  eventTypeId: string;
  /** Service duration in minutes */
  durationMinutes: number;
  /** Optional notes */
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for adding a walk-in */
export interface AddWalkInInput {
  /** Provider ID to queue under */
  providerId: string;
  /** Event type / service ID */
  eventTypeId: string;
  /** Service duration in minutes */
  durationMinutes: number;
  /** Customer name (required) */
  customerName: string;
  /** Customer email (optional for walk-ins) */
  customerEmail?: string;
  /** Customer phone (optional) */
  customerPhone?: string;
  /** Optional notes */
  notes?: string;
  /** Buffer before in minutes (default: 0) */
  bufferBefore?: number;
  /** Buffer after in minutes (default: 0) */
  bufferAfter?: number;
}

/** Result of adding a walk-in */
export interface AddWalkInResult {
  /** The walk-in queue entry */
  queueEntry: WalkInQueueEntry;
  /** Estimated start time for this walk-in */
  estimatedStartTime: Date;
  /** Estimated wait in minutes */
  estimatedWaitMinutes: number;
  /** Position in queue */
  queuePosition: number;
}

/** Wait time estimation result */
export interface WaitTimeEstimate {
  /** Estimated wait in minutes */
  estimatedMinutes: number;
  /** Number of people in queue */
  queueLength: number;
  /** Next available start time */
  nextAvailableAt: Date;
}

/** Provider walk-in state */
export interface ProviderWalkInState {
  /** Whether the provider is accepting walk-ins */
  acceptingWalkIns: boolean;
  /** Whether the provider is within working hours */
  withinWorkingHours: boolean;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when walk-ins are disabled for a provider */
export class WalkInsDisabledError extends Error {
  public readonly code = "WALK_INS_DISABLED";

  constructor(message = "This provider is not currently accepting walk-ins.") {
    super(message);
    this.name = "WalkInsDisabledError";
  }
}

/** Thrown when a queue entry is not found */
export class QueueEntryNotFoundError extends Error {
  public readonly code = "QUEUE_ENTRY_NOT_FOUND";

  constructor(entryId: string) {
    super(`Queue entry "${entryId}" not found.`);
    this.name = "QueueEntryNotFoundError";
  }
}

/** Thrown when a queue state transition is invalid */
export class InvalidQueueTransitionError extends Error {
  public readonly code = "INVALID_QUEUE_TRANSITION";

  constructor(from: WalkInStatus, to: WalkInStatus) {
    super(`Cannot transition walk-in from "${from}" to "${to}".`);
    this.name = "InvalidQueueTransitionError";
  }
}

// ---------------------------------------------------------------------------
// Queue State Machine
// ---------------------------------------------------------------------------

/** Valid state transitions for walk-in queue entries */
const VALID_TRANSITIONS: Record<WalkInStatus, WalkInStatus[]> = {
  queued: ["in_service", "no_show", "cancelled"],
  in_service: ["completed", "no_show"],
  completed: [],
  no_show: [],
  cancelled: [],
};

/**
 * Check if a walk-in status transition is valid.
 *
 * @param from - Current status
 * @param to - Target status
 * @returns Whether the transition is allowed
 */
export function isValidQueueTransition(
  from: WalkInStatus,
  to: WalkInStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Wait Time Estimation
// ---------------------------------------------------------------------------

/**
 * Estimate wait time for a new walk-in joining a provider's queue.
 *
 * Calculates based on: active queue entries ahead, their service durations,
 * and remaining time on any in-progress appointment.
 *
 * @param queue - Current queue entries (ordered by position)
 * @param existingBookings - Provider's scheduled bookings
 * @param serviceDuration - Duration of the requested service in minutes
 * @param now - Current time (default: new Date())
 * @returns Wait time estimate
 */
export function estimateWaitTime(
  queue: WalkInQueueEntry[],
  existingBookings: BookingInput[],
  serviceDuration: number,
  now: Date = new Date(),
): WaitTimeEstimate {
  const activeQueue = queue.filter(
    (e) => e.status === "queued" || e.status === "in_service",
  );

  if (activeQueue.length === 0) {
    // No queue — check if there's a current booking in progress
    const currentBooking = findCurrentBooking(existingBookings, now);
    if (currentBooking) {
      const remainingMs = currentBooking.endsAt.getTime() - now.getTime();
      const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
      return {
        estimatedMinutes: remainingMinutes,
        queueLength: 0,
        nextAvailableAt: currentBooking.endsAt,
      };
    }
    return {
      estimatedMinutes: 0,
      queueLength: 0,
      nextAvailableAt: now,
    };
  }

  // Calculate total time for all queued entries ahead
  let totalWaitMinutes = 0;

  // If someone is currently in service, account for remaining time
  const inService = activeQueue.find((e) => e.status === "in_service");
  if (inService && inService.serviceStartedAt) {
    const elapsed = (now.getTime() - inService.serviceStartedAt.getTime()) / 60000;
    const remaining = Math.max(0, inService.durationMinutes - elapsed);
    totalWaitMinutes += remaining;
  }

  // Add durations of all queued entries
  const queued = activeQueue.filter((e) => e.status === "queued");
  for (const entry of queued) {
    totalWaitMinutes += entry.durationMinutes;
  }

  // Also check scheduled bookings that fall during the wait window
  const waitEndTime = addMinutes(now, totalWaitMinutes + serviceDuration);
  const blockingBookings = existingBookings.filter(
    (b) =>
      b.status !== "cancelled" &&
      b.status !== "rejected" &&
      areIntervalsOverlapping(
        { start: now, end: waitEndTime },
        { start: b.startsAt, end: b.endsAt },
      ),
  );

  // Merge overlapping booking intervals before summing to avoid double-counting
  const mergedIntervals = mergeIntervals(
    blockingBookings
      .filter((b) => b.startsAt > now)
      .map((b) => ({ start: b.startsAt, end: b.endsAt })),
  );

  // Add merged blocked time
  for (const interval of mergedIntervals) {
    const duration = (interval.end.getTime() - interval.start.getTime()) / 60000;
    totalWaitMinutes += duration;
  }

  const estimatedMinutes = Math.ceil(totalWaitMinutes);
  const nextAvailableAt = addMinutes(now, estimatedMinutes);

  return {
    estimatedMinutes,
    queueLength: activeQueue.length,
    nextAvailableAt,
  };
}

/**
 * Find the next available gap for a walk-in in the provider's schedule.
 *
 * Considers existing bookings, queued walk-ins, and availability windows
 * to find when the provider can start this walk-in.
 *
 * @param queue - Current queue entries
 * @param existingBookings - Provider's bookings
 * @param durationMinutes - Required service duration
 * @param bufferBefore - Buffer before in minutes
 * @param bufferAfter - Buffer after in minutes
 * @param now - Current time
 * @returns The estimated start time for the walk-in
 */
export function findNextAvailableGap(
  queue: WalkInQueueEntry[],
  existingBookings: BookingInput[],
  durationMinutes: number,
  bufferBefore: number = 0,
  bufferAfter: number = 0,
  now: Date = new Date(),
): Date {
  const activeQueue = queue.filter(
    (e) => e.status === "queued" || e.status === "in_service",
  );

  // Collect all occupied intervals (bookings + queued walk-ins)
  const occupiedIntervals: Array<{ start: Date; end: Date }> = [];

  // Add existing bookings
  const activeBookings = existingBookings.filter(
    (b) => b.status !== "cancelled" && b.status !== "rejected",
  );
  for (const booking of activeBookings) {
    occupiedIntervals.push({
      start: addMinutes(booking.startsAt, -bufferBefore),
      end: addMinutes(booking.endsAt, bufferAfter),
    });
  }

  // Estimate start times for queued walk-ins
  let nextQueuedStart = now;
  const inService = activeQueue.find((e) => e.status === "in_service");
  if (inService && inService.serviceStartedAt) {
    const elapsed =
      (now.getTime() - inService.serviceStartedAt.getTime()) / 60000;
    const remaining = Math.max(0, inService.durationMinutes - elapsed);
    nextQueuedStart = addMinutes(now, remaining);
  }

  for (const entry of activeQueue.filter((e) => e.status === "queued")) {
    occupiedIntervals.push({
      start: nextQueuedStart,
      end: addMinutes(nextQueuedStart, entry.durationMinutes),
    });
    nextQueuedStart = addMinutes(nextQueuedStart, entry.durationMinutes);
  }

  // Sort intervals by start time
  occupiedIntervals.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Find the first gap that fits the duration
  let candidateStart = nextQueuedStart > now ? nextQueuedStart : now;

  for (const interval of occupiedIntervals) {
    if (interval.start.getTime() <= candidateStart.getTime()) {
      // Interval overlaps or is before candidate — push candidate past it
      if (interval.end.getTime() > candidateStart.getTime()) {
        candidateStart = interval.end;
      }
      continue;
    }

    // There's a gap before this interval — check if duration fits
    const gapEnd = interval.start;
    const candidateEnd = addMinutes(candidateStart, durationMinutes);

    if (candidateEnd <= gapEnd) {
      return candidateStart; // Found a gap
    }

    // Gap too small, move past this interval
    candidateStart = interval.end;
  }

  return candidateStart;
}

// ---------------------------------------------------------------------------
// Queue Management
// ---------------------------------------------------------------------------

/**
 * Validate that a queue status transition is allowed.
 *
 * @param current - Current status
 * @param target - Target status
 * @throws InvalidQueueTransitionError if the transition is not valid
 */
export function validateQueueTransition(
  current: WalkInStatus,
  target: WalkInStatus,
): void {
  if (!isValidQueueTransition(current, target)) {
    throw new InvalidQueueTransitionError(current, target);
  }
}

/**
 * Compute updated queue positions after a change (removal, completion, etc.).
 *
 * Takes the active queue entries and returns them with normalized positions
 * starting from 1. The input order is preserved.
 *
 * @param entries - Queue entries in desired order
 * @returns Entries with updated queuePosition values
 */
export function recomputeQueuePositions(
  entries: WalkInQueueEntry[],
): WalkInQueueEntry[] {
  return entries.map((entry, index) => ({
    ...entry,
    queuePosition: index + 1,
  }));
}

/**
 * Reorder queue entries by the given ID order.
 *
 * @param entries - Current queue entries
 * @param orderedIds - Entry IDs in the desired order
 * @returns Reordered entries with updated positions
 * @throws Error if orderedIds contains IDs not in entries
 */
export function reorderQueue(
  entries: WalkInQueueEntry[],
  orderedIds: string[],
): WalkInQueueEntry[] {
  const entryMap = new Map(entries.map((e) => [e.id, e]));

  // Validate all IDs exist
  for (const id of orderedIds) {
    if (!entryMap.has(id)) {
      throw new Error(`Queue entry "${id}" not found in current queue.`);
    }
  }

  // Build reordered list
  const orderedIdSet = new Set(orderedIds);
  const reordered = orderedIds
    .map((id) => entryMap.get(id)!)
    .filter((e) => e.status === "queued"); // Only reorder queued entries

  // Append queued entries whose IDs were not in orderedIds
  const remaining = entries.filter(
    (e) => e.status === "queued" && !orderedIdSet.has(e.id),
  );

  // Keep in-service entry at position 1 if it exists
  const inService = entries.find((e) => e.status === "in_service");
  const result: WalkInQueueEntry[] = [];

  if (inService) {
    result.push({ ...inService, queuePosition: 1 });
  }

  // Add reordered queued entries followed by any unordered remainders
  const allQueued = [...reordered, ...remaining];
  for (let i = 0; i < allQueued.length; i++) {
    result.push({
      ...allQueued[i],
      queuePosition: (inService ? 2 : 1) + i,
    });
  }

  return result;
}

/**
 * Recompute estimated wait times for all queued entries.
 *
 * @param queue - Active queue entries ordered by position
 * @param existingBookings - Scheduled bookings for the provider
 * @param now - Current time
 * @returns Queue entries with updated estimatedWaitMinutes
 */
export function recomputeWaitTimes(
  queue: WalkInQueueEntry[],
  existingBookings: BookingInput[],
  now: Date = new Date(),
): WalkInQueueEntry[] {
  const result: WalkInQueueEntry[] = [];
  let cumulativeMinutes = 0;

  // Account for in-service entry's remaining time
  const inService = queue.find((e) => e.status === "in_service");
  if (inService && inService.serviceStartedAt) {
    const elapsed =
      (now.getTime() - inService.serviceStartedAt.getTime()) / 60000;
    const remaining = Math.max(0, inService.durationMinutes - elapsed);
    cumulativeMinutes += remaining;
    result.push({ ...inService, estimatedWaitMinutes: 0 });
  }

  // Process queued entries
  const queued = queue
    .filter((e) => e.status === "queued")
    .sort((a, b) => a.queuePosition - b.queuePosition);

  const activeBookings = existingBookings.filter(
    (b) => b.status !== "cancelled" && b.status !== "rejected",
  );

  for (const entry of queued) {
    // Check if any scheduled booking falls in the way
    const entryStart = addMinutes(now, cumulativeMinutes);
    const entryEnd = addMinutes(entryStart, entry.durationMinutes);

    for (const booking of activeBookings) {
      if (
        booking.startsAt > now &&
        areIntervalsOverlapping(
          { start: entryStart, end: entryEnd },
          { start: booking.startsAt, end: booking.endsAt },
        )
      ) {
        // Push past the booking
        const bookingDuration =
          (booking.endsAt.getTime() - booking.startsAt.getTime()) / 60000;
        cumulativeMinutes += bookingDuration;
      }
    }

    result.push({
      ...entry,
      estimatedWaitMinutes: Math.ceil(cumulativeMinutes),
    });

    cumulativeMinutes += entry.durationMinutes;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Walk-In Availability Checks
// ---------------------------------------------------------------------------

/**
 * Check if a provider is currently accepting walk-ins.
 *
 * @param acceptingWalkIns - The provider's accepting_walk_ins toggle
 * @param rules - Provider's availability rules
 * @param overrides - Provider's availability overrides
 * @param now - Current time
 * @returns Whether walk-ins can be accepted right now
 */
export function isAcceptingWalkIns(
  acceptingWalkIns: boolean,
  rules: AvailabilityRuleInput[],
  overrides: AvailabilityOverrideInput[],
  now: Date = new Date(),
): ProviderWalkInState {
  if (!acceptingWalkIns) {
    return { acceptingWalkIns: false, withinWorkingHours: false };
  }

  // Check if "now" falls within any availability window
  const checkEnd = addMinutes(now, 1); // 1-minute slot just to check
  const result = isSlotAvailable(rules, overrides, [], now, checkEnd);

  return {
    acceptingWalkIns: true,
    withinWorkingHours: result.available,
  };
}

// ---------------------------------------------------------------------------
// Walk-In Analytics
// ---------------------------------------------------------------------------

/** Walk-in analytics for a provider over a date range */
export interface WalkInAnalytics {
  /** Total walk-ins in the period */
  totalWalkIns: number;
  /** Average wait time in minutes */
  averageWaitMinutes: number;
  /** No-show count */
  noShowCount: number;
  /** No-show rate (0-1) */
  noShowRate: number;
  /** Completed count */
  completedCount: number;
  /** Cancelled count */
  cancelledCount: number;
  /** Walk-ins per hour histogram (0-23 → count) */
  hourlyDistribution: Record<number, number>;
  /** Walk-ins per day-of-week histogram (0=Sun → count) */
  dailyDistribution: Record<number, number>;
  /** Walk-in vs total booking ratio (0-1) */
  walkInRatio: number;
  /** Average service duration in minutes */
  averageServiceDuration: number;
}

/**
 * Compute walk-in analytics for a provider.
 *
 * @param entries - Walk-in queue entries in the date range
 * @param totalBookings - Total bookings (all sources) in the date range
 * @returns Computed analytics
 */
export function computeWalkInAnalytics(
  entries: WalkInQueueEntry[],
  totalBookings: number,
): WalkInAnalytics {
  const total = entries.length;
  if (total === 0) {
    return {
      totalWalkIns: 0,
      averageWaitMinutes: 0,
      noShowCount: 0,
      noShowRate: 0,
      completedCount: 0,
      cancelledCount: 0,
      hourlyDistribution: {},
      dailyDistribution: {},
      walkInRatio: 0,
      averageServiceDuration: 0,
    };
  }

  const completed = entries.filter((e) => e.status === "completed");
  const noShows = entries.filter((e) => e.status === "no_show");
  const cancelled = entries.filter((e) => e.status === "cancelled");

  // Average wait time (from check-in to service start)
  const waits = completed
    .filter((e) => e.serviceStartedAt)
    .map(
      (e) =>
        (e.serviceStartedAt!.getTime() - e.checkedInAt.getTime()) / 60000,
    );
  const averageWaitMinutes =
    waits.length > 0 ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;

  // Average service duration (from service start to completion)
  const durations = completed
    .filter((e) => e.serviceStartedAt && e.completedAt)
    .map(
      (e) =>
        (e.completedAt!.getTime() - e.serviceStartedAt!.getTime()) / 60000,
    );
  const averageServiceDuration =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

  // Hourly distribution (UTC hours)
  const hourlyDistribution: Record<number, number> = {};
  for (const entry of entries) {
    const hour = entry.checkedInAt.getUTCHours();
    hourlyDistribution[hour] = (hourlyDistribution[hour] ?? 0) + 1;
  }

  // Daily distribution (UTC day of week)
  const dailyDistribution: Record<number, number> = {};
  for (const entry of entries) {
    const day = entry.checkedInAt.getUTCDay();
    dailyDistribution[day] = (dailyDistribution[day] ?? 0) + 1;
  }

  return {
    totalWalkIns: total,
    averageWaitMinutes: Math.round(averageWaitMinutes),
    noShowCount: noShows.length,
    noShowRate: noShows.length / total,
    completedCount: completed.length,
    cancelledCount: cancelled.length,
    hourlyDistribution,
    dailyDistribution,
    walkInRatio: totalBookings > 0 ? total / totalBookings : 0,
    averageServiceDuration: Math.round(averageServiceDuration),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Merge an array of potentially overlapping date intervals into a minimal set
 * of non-overlapping intervals sorted by start time.
 */
function mergeIntervals(
  intervals: Array<{ start: Date; end: Date }>,
): Array<{ start: Date; end: Date }> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const merged: Array<{ start: Date; end: Date }> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = sorted[i].end > last.end ? sorted[i].end : last.end;
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

/** Find the booking currently in progress */
function findCurrentBooking(
  bookings: BookingInput[],
  now: Date,
): BookingInput | null {
  const active = bookings.filter(
    (b) => b.status !== "cancelled" && b.status !== "rejected",
  );
  for (const booking of active) {
    if (booking.startsAt <= now && booking.endsAt > now) {
      return booking;
    }
  }
  return null;
}
