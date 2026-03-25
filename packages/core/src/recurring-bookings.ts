/**
 * Recurring bookings logic.
 *
 * Generates occurrence dates for recurring booking series,
 * validates availability across all occurrences, and provides
 * series management operations.
 */

import { addWeeks, addMonths } from "date-fns";
import { getActiveBookings } from "./slot-pipeline.js";
import type { BookingInput } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported recurring frequencies */
export type RecurringFrequency = "weekly" | "biweekly" | "monthly";

/** Input for creating a recurring booking series */
export interface RecurringSeriesInput {
  /** First occurrence start time */
  startsAt: Date;
  /** Duration in minutes */
  durationMinutes: number;
  /** Recurrence frequency */
  frequency: RecurringFrequency;
  /** Number of occurrences (including the first) */
  count: number;
}

/** A single occurrence in a recurring series */
export interface RecurringOccurrence {
  /** Index in the series (0-based) */
  index: number;
  /** Start time */
  startsAt: Date;
  /** End time */
  endsAt: Date;
}

/** Result of validating recurring availability */
export interface RecurringAvailabilityResult {
  /** Whether all occurrences are available */
  allAvailable: boolean;
  /** All generated occurrences */
  occurrences: RecurringOccurrence[];
  /** Indices of unavailable occurrences */
  conflicts: number[];
}

/** A booking in a recurring series for management */
export interface SeriesBooking {
  id: string;
  index: number;
  startsAt: Date;
  endsAt: Date;
  status: string;
}

/** Result of a series cancellation */
export interface SeriesCancellationResult {
  /** Booking IDs that were cancelled */
  cancelledIds: string[];
  /** Booking IDs that were skipped (already completed/cancelled) */
  skippedIds: string[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Error thrown when recurring booking validation fails */
export class RecurringBookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecurringBookingError";
  }
}

// ---------------------------------------------------------------------------
// Occurrence Generation
// ---------------------------------------------------------------------------

/**
 * Generate all occurrence dates for a recurring series.
 *
 * @param input - The recurring series configuration
 * @returns Array of occurrences with start and end times
 * @throws {RecurringBookingError} If input is invalid
 */
export function generateOccurrences(
  input: RecurringSeriesInput,
): RecurringOccurrence[] {
  if (input.count < 1) {
    throw new RecurringBookingError("Count must be at least 1");
  }

  if (input.count > 52) {
    throw new RecurringBookingError("Count cannot exceed 52 occurrences");
  }

  if (input.durationMinutes < 1) {
    throw new RecurringBookingError("Duration must be at least 1 minute");
  }

  const occurrences: RecurringOccurrence[] = [];

  for (let i = 0; i < input.count; i++) {
    const startsAt = advanceDate(input.startsAt, input.frequency, i);
    const endsAt = new Date(
      startsAt.getTime() + input.durationMinutes * 60 * 1000,
    );

    occurrences.push({ index: i, startsAt, endsAt });
  }

  return occurrences;
}

function advanceDate(
  base: Date,
  frequency: RecurringFrequency,
  steps: number,
): Date {
  switch (frequency) {
    case "weekly":
      return addWeeks(base, steps);
    case "biweekly":
      return addWeeks(base, steps * 2);
    case "monthly":
      return addMonths(base, steps);
  }
}

// ---------------------------------------------------------------------------
// Availability Validation
// ---------------------------------------------------------------------------

/**
 * Check availability for all occurrences in a recurring series.
 *
 * @param occurrences - The generated occurrences to check
 * @param existingBookings - Existing bookings to check for conflicts
 * @returns Availability result with any conflicts
 */
export function checkRecurringAvailability(
  occurrences: RecurringOccurrence[],
  existingBookings: BookingInput[],
): RecurringAvailabilityResult {
  const activeBookings = getActiveBookings(existingBookings);

  const conflicts: number[] = [];

  for (const occurrence of occurrences) {
    const hasConflict = activeBookings.some(
      (booking) =>
        occurrence.startsAt < booking.endsAt &&
        occurrence.endsAt > booking.startsAt,
    );

    if (hasConflict) {
      conflicts.push(occurrence.index);
    }
  }

  return {
    allAvailable: conflicts.length === 0,
    occurrences,
    conflicts,
  };
}

// ---------------------------------------------------------------------------
// Series Management
// ---------------------------------------------------------------------------

/**
 * Determine which bookings to cancel when cancelling future occurrences.
 *
 * Filters out already completed, cancelled, or past bookings.
 *
 * @param seriesBookings - All bookings in the series
 * @param now - Current time
 * @returns Cancellation result with IDs to cancel and IDs to skip
 */
export function cancelFutureOccurrences(
  seriesBookings: SeriesBooking[],
  now: Date = new Date(),
): SeriesCancellationResult {
  const cancelledIds: string[] = [];
  const skippedIds: string[] = [];

  for (const booking of seriesBookings) {
    const isPast = booking.startsAt <= now;
    const isTerminal =
      booking.status === "cancelled" ||
      booking.status === "completed" ||
      booking.status === "rejected" ||
      booking.status === "no_show";

    if (isPast || isTerminal) {
      skippedIds.push(booking.id);
    } else {
      cancelledIds.push(booking.id);
    }
  }

  return { cancelledIds, skippedIds };
}

/**
 * Validate recurring frequency.
 *
 * @param frequency - The frequency string to validate
 * @returns Whether it's a valid RecurringFrequency
 */
export function isValidFrequency(
  frequency: string,
): frequency is RecurringFrequency {
  return ["weekly", "biweekly", "monthly"].includes(frequency);
}
