/**
 * Confirmation mode utilities for event types that require manual provider approval.
 *
 * When `requires_confirmation` is true on an event type, new bookings are created
 * with `pending` status instead of `confirmed`. The provider must then explicitly
 * confirm or reject. If no action is taken within the timeout window, the booking
 * is automatically rejected via the AUTO_REJECT_PENDING job.
 */

import type { BookingStatus } from "./types.js";

// Re-export so existing imports from confirmation-mode.ts continue to work.
export type { BookingStatus };

/** Default hours before a pending booking is auto-rejected */
export const CONFIRMATION_TIMEOUT_HOURS = 24;

/**
 * Determine the initial status for a new booking.
 *
 * @param requiresConfirmation - Whether the event type requires manual confirmation
 * @returns `'pending'` if confirmation is required, `'confirmed'` otherwise
 *
 * @example
 * ```ts
 * const status = getInitialBookingStatus(eventType.requiresConfirmation);
 * // → 'pending' | 'confirmed'
 * ```
 */
export function getInitialBookingStatus(
  requiresConfirmation: boolean,
): BookingStatus {
  return requiresConfirmation ? "pending" : "confirmed";
}

/**
 * Calculate the auto-rejection deadline for a pending booking.
 *
 * @param createdAt - When the booking was created
 * @param timeoutHours - Hours until auto-rejection (default: 24)
 * @returns The Date at which the booking should be auto-rejected
 *
 * @example
 * ```ts
 * const deadline = getAutoRejectDeadline(booking.createdAt);
 * await jobs.schedule(JOB_NAMES.AUTO_REJECT_PENDING, { bookingId }, deadline);
 * ```
 */
export function getAutoRejectDeadline(
  createdAt: Date,
  timeoutHours: number = CONFIRMATION_TIMEOUT_HOURS,
): Date {
  const clampedHours = Math.max(1, timeoutHours);
  return new Date(createdAt.getTime() + clampedHours * 60 * 60 * 1000);
}

/**
 * Check whether a pending booking is overdue for auto-rejection.
 *
 * @param createdAt - When the booking was created
 * @param now - Current time (defaults to `new Date()`)
 * @param timeoutHours - Rejection timeout in hours (default: 24)
 * @returns `true` if the booking has exceeded the confirmation timeout
 */
export function isPendingBookingOverdue(
  createdAt: Date,
  now: Date = new Date(),
  timeoutHours: number = CONFIRMATION_TIMEOUT_HOURS,
): boolean {
  return now >= getAutoRejectDeadline(createdAt, timeoutHours);
}

/** Payload for the AUTO_REJECT_PENDING background job */
export interface AutoRejectPayload {
  bookingId: string;
  actor?: string;
}

/** Payload for the booking status change event */
export interface BookingStatusChangePayload {
  bookingId: string;
  previousStatus: BookingStatus;
  newStatus: BookingStatus;
  actor: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}
