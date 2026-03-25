/**
 * Slot Release Strategy — Step 4B of the three-step slot computation pipeline.
 *
 * This module provides the `applySlotRelease()` dispatcher and three concrete
 * strategy implementations. It follows the `booking-limits.ts` composable-filter
 * pattern: pure functions that accept raw `{ start, end }` slot arrays and return
 * a `SlotReleaseResult` containing the surviving slots and an optional discount map.
 *
 * Integration points:
 * - `slot-engine.ts`    — called after the availableSlots conflict filter, before `formatSlots`.
 * - `resource-engine.ts`— called after the pool-level slot map is assembled, before result assembly.
 *
 * Strategies:
 * - `"rolling_window"`      — filter slots whose start exceeds `now + windowSize`.
 * - `"fill_earlier_first"`  — hide later time windows until earlier ones hit a fill threshold.
 * - `"discount_incentive"`  — annotate slow-filling windows with a discount percentage.
 *
 * @module slot-release
 */

import { addHours, addDays, areIntervalsOverlapping } from "date-fns";
import { toZonedTime, format } from "date-fns-tz";
import { formatDateInTimezone } from "./slot-pipeline.js";
import type {
  SlotReleaseConfig,
  FillEarlierFirstConfig,
  RollingWindowConfig,
  DiscountIncentiveConfig,
  BookingInput,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The return type of `applySlotRelease()`.
 *
 * - `slots` — the surviving slot array after applying the release strategy.
 *   For `discount_incentive` this equals the original input (no filtering).
 * - `discountMap` — maps each slot's start time in epoch milliseconds to its
 *   discount percentage. Only populated by `discount_incentive`; empty Map for
 *   the other two strategies.
 */
export interface SlotReleaseResult {
  /** Surviving slots after applying the release strategy */
  slots: Array<{ start: Date; end: Date }>;
  /**
   * Map of slot start-time (epoch ms) → discount percentage.
   * Non-empty only when the `discount_incentive` strategy is active.
   */
  discountMap: Map<number, number>;
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

/**
 * Apply the configured slot release strategy to a set of candidate slots.
 *
 * Acts as the Step-4B gate in the slot pipeline: called after booking-conflict
 * filtering and before `formatSlots`. When `config.strategy` is
 * `"discount_incentive"`, all slots pass through; the returned `discountMap`
 * carries per-slot discount percentages that the caller applies to the formatted
 * output. For the other two strategies, `discountMap` is an empty `Map`.
 *
 * This function is pure and deterministic when `now` is provided explicitly.
 *
 * @param slots - Available UTC slot candidates that have already passed the
 *   conflict filter in the calling engine.
 * @param config - Discriminated union specifying which strategy to apply and its
 *   configuration parameters.
 * @param existingBookings - All bookings for the provider or resource pool. Active
 *   bookings (status != "cancelled" | "rejected") are used to compute window fill
 *   rates for `fill_earlier_first` and `discount_incentive`. Ignored by
 *   `rolling_window`.
 * @param providerTimezone - IANA timezone string of the provider. Used to convert
 *   UTC slot times into local time for window boundary matching.
 * @param now - Reference point for rolling window horizon calculation. Inject a
 *   stable value in tests or SSR contexts for deterministic output.
 * @returns `SlotReleaseResult` containing the surviving slots and an optional
 *   discount map keyed by slot start time in epoch milliseconds.
 */
export function applySlotRelease(
  slots: Array<{ start: Date; end: Date }>,
  config: SlotReleaseConfig,
  existingBookings: BookingInput[],
  providerTimezone: string,
  now: Date,
): SlotReleaseResult {
  switch (config.strategy) {
    case "rolling_window":
      return {
        slots: applyRollingWindow(slots, config, now),
        discountMap: new Map(),
      };

    case "fill_earlier_first":
      return {
        slots: applyFillEarlierFirst(slots, config, existingBookings, providerTimezone),
        discountMap: new Map(),
      };

    case "discount_incentive":
      return applyDiscountIncentive(slots, config, existingBookings, providerTimezone);
  }
}

// ---------------------------------------------------------------------------
// Strategy: rolling_window
// ---------------------------------------------------------------------------

/**
 * Return only slots whose start time falls at or before `now + windowSize`.
 *
 * Slots starting strictly after the horizon are excluded. The boundary is
 * inclusive: a slot whose start equals `now + windowSize` exactly is kept.
 * Input ordering is preserved (no re-sorting).
 *
 * @param slots - UTC candidate slots
 * @param config - Rolling window configuration
 * @param now - Current reference time
 * @returns Filtered slots within the rolling horizon
 */
function applyRollingWindow(
  slots: Array<{ start: Date; end: Date }>,
  config: RollingWindowConfig,
  now: Date,
): Array<{ start: Date; end: Date }> {
  const unit = config.unit ?? "hours";
  const horizon =
    unit === "days"
      ? addDays(now, config.windowSize)
      : addHours(now, config.windowSize);

  return slots.filter((slot) => slot.start <= horizon);
}

// ---------------------------------------------------------------------------
// Strategy: fill_earlier_first
// ---------------------------------------------------------------------------

/**
 * Filter slots so that each day's windows are released progressively.
 *
 * Each calendar day (in provider local time) is partitioned into time windows
 * using `config.windowBoundaries`. Window 0 is always visible. Window N+1
 * becomes visible only when window N's fill rate reaches or exceeds
 * `config.threshold / 100`. An empty window (0 candidate slots) has a fill
 * rate of 1.0 (vacuously full) and immediately releases the next window.
 *
 * DST handling: boundaries are applied in provider local time using
 * `toZonedTime()` so that e.g. "12:00" always means local noon even on
 * clock-change days.
 *
 * @param slots - Available UTC candidate slots
 * @param config - Fill-earlier-first configuration
 * @param existingBookings - All bookings (active ones counted for fill rates)
 * @param providerTimezone - IANA timezone for local-time window partitioning
 * @returns Slots from windows that have been released by prior-window fill rates
 */
function applyFillEarlierFirst(
  slots: Array<{ start: Date; end: Date }>,
  config: FillEarlierFirstConfig,
  existingBookings: BookingInput[],
  providerTimezone: string,
): Array<{ start: Date; end: Date }> {
  const thresholdRate = config.threshold / 100;

  // Group slots by local calendar day
  const slotsByDay = groupSlotsByDay(slots, providerTimezone);
  const fillRates = computeWindowFillRates(
    slots,
    existingBookings,
    config.windowBoundaries,
    providerTimezone,
  );

  const result: Array<{ start: Date; end: Date }> = [];

  for (const [day, daySlots] of slotsByDay.entries()) {
    for (const slot of daySlots) {
      const windowIdx = getWindowIndex(slot.start, config.windowBoundaries, providerTimezone);

      // Window 0 is always visible; for N > 0, every prior window must have
      // reached the threshold before this slot is released.
      let released = true;
      for (let prior = 0; prior < windowIdx; prior++) {
        const key = makeWindowKey(day, prior);
        const rate = fillRates.get(key) ?? 0;
        if (rate < thresholdRate) {
          released = false;
          break;
        }
      }

      if (released) {
        result.push(slot);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Strategy: discount_incentive
// ---------------------------------------------------------------------------

/**
 * Return all input slots unchanged, populating `discountMap` for slots in
 * windows whose fill rate qualifies for a discount tier.
 *
 * Windows are partitioned in the same way as `fill_earlier_first`. For each
 * window the first tier (in config order) whose `fillRateBelowPercent` exceeds
 * the window's actual fill rate is selected (first-match-wins). Slots in
 * windows with no matching tier receive no entry in `discountMap`.
 *
 * When `config.windowBoundaries` is omitted or empty, each calendar day is
 * treated as a single window (window index 0).
 *
 * @param slots - Available UTC candidate slots (returned unchanged)
 * @param config - Discount incentive configuration with tiers
 * @param existingBookings - All bookings (active ones counted for fill rates)
 * @param providerTimezone - IANA timezone for local-time window partitioning
 * @returns All slots plus a `discountMap` keyed by slot start epoch ms
 */
function applyDiscountIncentive(
  slots: Array<{ start: Date; end: Date }>,
  config: DiscountIncentiveConfig,
  existingBookings: BookingInput[],
  providerTimezone: string,
): SlotReleaseResult {
  const boundaries = config.windowBoundaries ?? [];

  const fillRates = computeWindowFillRates(
    slots,
    existingBookings,
    boundaries,
    providerTimezone,
  );

  const discountMap = new Map<number, number>();

  for (const slot of slots) {
    const day = formatDateInTimezone(slot.start, providerTimezone);
    const windowIdx = getWindowIndex(slot.start, boundaries, providerTimezone);
    const key = makeWindowKey(day, windowIdx);
    const fillRate = fillRates.get(key) ?? 0;

    // First-match-wins: iterate tiers in config order
    for (const tier of config.tiers) {
      if (fillRate < tier.fillRateBelowPercent / 100) {
        discountMap.set(slot.start.getTime(), tier.discountPercent);
        break;
      }
    }
  }

  return { slots, discountMap };
}

// ---------------------------------------------------------------------------
// Shared helper: computeWindowFillRates
// ---------------------------------------------------------------------------

/**
 * Compute fill rates for each day × window combination across a set of slots.
 *
 * Algorithm:
 * 1. Group candidate slots by local calendar day (in provider timezone).
 * 2. Within each day, partition slots into windows using `windowBoundaries`.
 * 3. Count overlapping *active* bookings per window using
 *    `areIntervalsOverlapping`.
 * 4. `fillRate = activeBookingCount / totalSlots`. An empty window (0 slots)
 *    has a fill rate of `1.0` (vacuously full) so the next window releases
 *    immediately.
 *
 * Active bookings are those whose `status` is neither `"cancelled"` nor
 * `"rejected"` — consistent with the slot-engine convention.
 *
 * Cross-window bookings (spanning a boundary) are counted in both windows
 * (conservative behaviour that prevents premature release on boundaries).
 *
 * @param slots - All candidate UTC slots for the date range
 * @param existingBookings - All bookings for the provider or pool
 * @param windowBoundaries - Ascending HH:mm boundary strings in provider tz
 * @param providerTimezone - IANA timezone for local time extraction
 * @returns Map keyed by `"YYYY-MM-DD-window-N"` → fill rate in [0.0, 1.0]
 */
export function computeWindowFillRates(
  slots: Array<{ start: Date; end: Date }>,
  existingBookings: BookingInput[],
  windowBoundaries: string[],
  providerTimezone: string,
): Map<string, number> {
  const activeBookings = existingBookings.filter(
    (b) => b.status !== "cancelled" && b.status !== "rejected",
  );

  // Group slots by day × window
  // counts[key] = { total, booked }
  const counts = new Map<string, { total: number; booked: number }>();

  for (const slot of slots) {
    const day = formatDateInTimezone(slot.start, providerTimezone);
    const windowIdx = getWindowIndex(slot.start, windowBoundaries, providerTimezone);
    const key = makeWindowKey(day, windowIdx);

    let entry = counts.get(key);
    if (!entry) {
      entry = { total: 0, booked: 0 };
      counts.set(key, entry);
    }
    entry.total += 1;

    // Count overlapping active bookings for this slot
    for (const booking of activeBookings) {
      if (
        areIntervalsOverlapping(
          { start: slot.start, end: slot.end },
          { start: booking.startsAt, end: booking.endsAt },
        )
      ) {
        entry.booked += 1;
        // Each slot counts at most once per booking — but we still need to check
        // all bookings, so we do not break; multiple bookings can overlap a slot.
      }
    }
  }

  // Build fill rate map; empty windows get rate 1.0 (vacuously full)
  const fillRateMap = new Map<string, number>();

  // Enumerate all day × window combinations implied by the slots
  const slotsByDay = groupSlotsByDay(slots, providerTimezone);
  const windowCount = windowBoundaries.length + 1;

  for (const day of slotsByDay.keys()) {
    for (let w = 0; w < windowCount; w++) {
      const key = makeWindowKey(day, w);
      const entry = counts.get(key);

      if (!entry || entry.total === 0) {
        // Empty window — treated as 100% full
        fillRateMap.set(key, 1.0);
      } else {
        fillRateMap.set(key, entry.booked / entry.total);
      }
    }
  }

  return fillRateMap;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Group an array of UTC slots by their local calendar date in the provider
 * timezone.
 *
 * @param slots - UTC candidate slots
 * @param providerTimezone - IANA timezone for local date projection
 * @returns Map keyed by "YYYY-MM-DD" → slots on that local date
 */
function groupSlotsByDay(
  slots: Array<{ start: Date; end: Date }>,
  providerTimezone: string,
): Map<string, Array<{ start: Date; end: Date }>> {
  const byDay = new Map<string, Array<{ start: Date; end: Date }>>();

  for (const slot of slots) {
    const day = formatDateInTimezone(slot.start, providerTimezone);
    let daySlots = byDay.get(day);
    if (!daySlots) {
      daySlots = [];
      byDay.set(day, daySlots);
    }
    daySlots.push(slot);
  }

  return byDay;
}

/**
 * Determine which window index a slot belongs to based on its local start time
 * and the sorted window boundary strings.
 *
 * Window index 0 covers times before the first boundary.
 * Window index N covers times at or after boundary[N-1] and before boundary[N].
 * Window index `boundaries.length` covers times at or after the last boundary.
 *
 * Example with boundaries ["09:00", "17:00"]:
 * - "08:30" → window 0
 * - "09:00" → window 1
 * - "17:00" → window 2
 *
 * @param slotStart - UTC slot start time
 * @param windowBoundaries - Ascending HH:mm boundary strings in provider tz
 * @param providerTimezone - IANA timezone for local time extraction
 * @returns Zero-based window index
 */
function getWindowIndex(
  slotStart: Date,
  windowBoundaries: string[],
  providerTimezone: string,
): number {
  if (windowBoundaries.length === 0) return 0;

  const zonedDate = toZonedTime(slotStart, providerTimezone);
  const localTime = format(zonedDate, "HH:mm", { timeZone: providerTimezone });

  let windowIdx = 0;
  for (const boundary of windowBoundaries) {
    if (localTime >= boundary) {
      windowIdx++;
    } else {
      break;
    }
  }

  return windowIdx;
}

/**
 * Build the composite string key used to index fill rate entries.
 *
 * @param day - Local calendar date string "YYYY-MM-DD"
 * @param windowIndex - Zero-based window index within that day
 * @returns Composite key in the form "YYYY-MM-DD-window-N"
 */
function makeWindowKey(day: string, windowIndex: number): string {
  return `${day}-window-${windowIndex}`;
}
