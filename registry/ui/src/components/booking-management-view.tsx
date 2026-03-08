import React, { useState } from "react";
import { cn } from "../utils/cn.js";
import { BookingStatusBadge, type BookingStatus } from "./booking-status-badge.js";

/** A single booking detail item */
export interface BookingDetail {
  bookingId: string;
  eventTitle: string;
  providerName: string;
  startsAt: string; // ISO datetime string
  endsAt: string;
  timezone: string;
  location?: string;
  status: BookingStatus;
  customerName: string;
  customerEmail: string;
  /** Question key → response value */
  questionResponses?: Record<string, string>;
}

/** Props for the BookingManagementView component */
export interface BookingManagementViewProps {
  /** The booking to display */
  booking: BookingDetail;
  /** Called when customer cancels the booking. Should update status server-side. */
  onCancel?: (bookingId: string) => Promise<void>;
  /** Called when customer wants to reschedule. Open the reschedule flow. */
  onReschedule?: (bookingId: string) => void;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

type ManagementState =
  | { mode: "view" }
  | { mode: "cancel-confirm" }
  | { mode: "cancelling" }
  | { mode: "cancelled" }
  | { mode: "error"; message: string };

/**
 * Booking management view for customers arriving via a signed management URL.
 *
 * Displays booking details with Cancel and Reschedule actions.
 * Cancellation prompts for confirmation before proceeding.
 *
 * @example
 * ```tsx
 * <BookingManagementView
 *   booking={booking}
 *   onCancel={async (id) => { await api.cancelBooking(id); }}
 *   onReschedule={(id) => router.push(`/reschedule/${id}`)}
 * />
 * ```
 */
export function BookingManagementView({
  booking,
  onCancel,
  onReschedule,
  className,
  style,
}: BookingManagementViewProps) {
  const [state, setState] = useState<ManagementState>({ mode: "view" });

  const isCancellable =
    booking.status === "pending" || booking.status === "confirmed";
  const isReschedulable = booking.status === "confirmed";
  const isTerminal =
    booking.status === "cancelled" ||
    booking.status === "rejected" ||
    booking.status === "completed" ||
    booking.status === "no_show";

  const handleCancelClick = () => setState({ mode: "cancel-confirm" });
  const handleCancelAbort = () => setState({ mode: "view" });

  const handleCancelConfirm = async () => {
    if (!onCancel) return;
    setState({ mode: "cancelling" });
    try {
      await onCancel(booking.bookingId);
      setState({ mode: "cancelled" });
    } catch (err) {
      setState({
        mode: "error",
        message:
          err instanceof Error ? err.message : "Failed to cancel booking.",
      });
    }
  };

  const { dateStr, timeStr } = formatBookingTime(
    booking.startsAt,
    booking.endsAt,
    booking.timezone,
  );

  if (state.mode === "cancelled") {
    return (
      <div
        className={cn("slotkit-management-view slotkit-management-cancelled", className)}
        style={style}
      >
        <h2>Booking Cancelled</h2>
        <p>Your booking has been successfully cancelled.</p>
        <dl className="slotkit-detail-list">
          <dt>Event</dt>
          <dd>{booking.eventTitle}</dd>
          <dt>Date</dt>
          <dd>{dateStr}</dd>
          <dt>Time</dt>
          <dd>{timeStr} ({booking.timezone})</dd>
        </dl>
      </div>
    );
  }

  return (
    <div className={cn("slotkit-management-view", className)} style={style}>
      <div className="slotkit-management-header">
        <h2>Manage Your Booking</h2>
        <BookingStatusBadge status={booking.status} />
      </div>

      <dl className="slotkit-detail-list">
        <dt>Booking ID</dt>
        <dd className="slotkit-booking-id">{booking.bookingId}</dd>
        <dt>Service</dt>
        <dd>{booking.eventTitle}</dd>
        <dt>Provider</dt>
        <dd>{booking.providerName}</dd>
        <dt>Date</dt>
        <dd>{dateStr}</dd>
        <dt>Time</dt>
        <dd>
          {timeStr} ({booking.timezone})
        </dd>
        {booking.location && (
          <>
            <dt>Location</dt>
            <dd>{booking.location}</dd>
          </>
        )}
        <dt>Name</dt>
        <dd>{booking.customerName}</dd>
        <dt>Email</dt>
        <dd>{booking.customerEmail}</dd>
      </dl>

      {booking.questionResponses &&
        Object.keys(booking.questionResponses).length > 0 && (
          <div className="slotkit-responses-section">
            <h3>Your Responses</h3>
            <dl className="slotkit-detail-list">
              {Object.entries(booking.questionResponses).map(([key, value]) => (
                <React.Fragment key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        )}

      {state.mode === "error" && (
        <div className="slotkit-alert slotkit-alert-error" role="alert">
          <p>{state.message}</p>
          <button
            type="button"
            className="slotkit-button-secondary"
            onClick={() => setState({ mode: "view" })}
          >
            Dismiss
          </button>
        </div>
      )}

      {state.mode === "cancel-confirm" && (
        <div className="slotkit-alert slotkit-alert-warning" role="alertdialog">
          <p>
            Are you sure you want to cancel this booking? This action cannot be undone.
          </p>
          <div className="slotkit-alert-actions">
            <button
              type="button"
              className="slotkit-button-danger"
              onClick={handleCancelConfirm}
            >
              Yes, Cancel Booking
            </button>
            <button
              type="button"
              className="slotkit-button-secondary"
              onClick={handleCancelAbort}
            >
              Keep Booking
            </button>
          </div>
        </div>
      )}

      {!isTerminal && state.mode !== "cancel-confirm" && (
        <div className="slotkit-management-actions">
          {isReschedulable && onReschedule && (
            <button
              type="button"
              className="slotkit-button-secondary"
              onClick={() => onReschedule(booking.bookingId)}
            >
              Reschedule
            </button>
          )}
          {isCancellable && onCancel && (
            <button
              type="button"
              className="slotkit-button-danger"
              onClick={handleCancelClick}
              disabled={state.mode === "cancelling"}
            >
              {state.mode === "cancelling" ? "Cancelling..." : "Cancel Booking"}
            </button>
          )}
        </div>
      )}

      {isTerminal && (
        <p className="slotkit-terminal-note">
          This booking is {booking.status} and can no longer be modified.
        </p>
      )}
    </div>
  );
}

function formatBookingTime(
  startsAt: string,
  endsAt: string,
  timezone: string,
): { dateStr: string; timeStr: string } {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  const dateStr = start.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  });

  const startTime = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  });

  const endTime = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  });

  return { dateStr, timeStr: `${startTime} – ${endTime}` };
}
