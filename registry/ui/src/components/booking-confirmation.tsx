import React, { useState } from "react";
import type { Slot } from "@slotkit/core";
import type { BookingFormData } from "./booking-questions.js";
import { cn } from "../utils/cn.js";

/** Props for the BookingConfirmation component */
export interface BookingConfirmationProps {
  /** Event type title */
  eventTitle: string;
  /** Event type duration in minutes */
  duration: number;
  /** Provider's display name */
  providerName: string;
  /** Location description */
  location?: string;
  /** The selected time slot */
  slot: Slot;
  /** Customer's timezone */
  timezone: string;
  /** Customer's form data (name, email, responses) */
  formData: BookingFormData;
  /** Callback to create the booking */
  onConfirm: () => Promise<{ bookingId: string } | void>;
  /** Callback to go back and change selection */
  onBack?: () => void;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/** Booking result state */
type BookingState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; bookingId: string }
  | { status: "conflict" }
  | { status: "error"; message: string };

/**
 * Booking confirmation summary view.
 *
 * Displays all booking details for review before the customer confirms.
 * Handles success, conflict, and error states.
 *
 * @example
 * ```tsx
 * <BookingConfirmation
 *   eventTitle="30-Minute Consultation"
 *   duration={30}
 *   providerName="Alice Johnson"
 *   slot={selectedSlot}
 *   timezone="America/New_York"
 *   formData={customerData}
 *   onConfirm={handleConfirm}
 * />
 * ```
 */
export function BookingConfirmation({
  eventTitle,
  duration,
  providerName,
  location,
  slot,
  timezone,
  formData,
  onConfirm,
  onBack,
  className,
  style,
}: BookingConfirmationProps) {
  const [state, setState] = useState<BookingState>({ status: "idle" });

  const handleConfirm = async () => {
    setState({ status: "submitting" });
    try {
      const result = await onConfirm();
      setState({
        status: "success",
        bookingId: result?.bookingId ?? "confirmed",
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("conflict") ||
          error.message.includes("no longer available") ||
          error.message.includes("BOOKING_CONFLICT"))
      ) {
        setState({ status: "conflict" });
      } else {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "An unexpected error occurred",
        });
      }
    }
  };

  if (state.status === "success") {
    return (
      <div className={cn("slotkit-booking-confirmation slotkit-success", className)} style={style}>
        <div className="slotkit-success-icon" aria-hidden="true">
          &#10003;
        </div>
        <h2>Booking Confirmed!</h2>
        <p>Your booking has been confirmed.</p>
        <dl className="slotkit-confirmation-details">
          <dt>Booking ID</dt>
          <dd>{state.bookingId}</dd>
          <dt>Event</dt>
          <dd>{eventTitle}</dd>
          <dt>Date &amp; Time</dt>
          <dd>{formatSlotDisplay(slot, timezone)}</dd>
          <dt>Duration</dt>
          <dd>{duration} minutes</dd>
        </dl>
      </div>
    );
  }

  return (
    <div className={cn("slotkit-booking-confirmation", className)} style={style}>
      <h2>Confirm Your Booking</h2>

      <dl className="slotkit-confirmation-details">
        <dt>Service</dt>
        <dd>{eventTitle}</dd>
        <dt>Provider</dt>
        <dd>{providerName}</dd>
        <dt>Date &amp; Time</dt>
        <dd>{formatSlotDisplay(slot, timezone)}</dd>
        <dt>Duration</dt>
        <dd>{duration} minutes</dd>
        {location && (
          <>
            <dt>Location</dt>
            <dd>{location}</dd>
          </>
        )}
        <dt>Name</dt>
        <dd>{formData.name}</dd>
        <dt>Email</dt>
        <dd>{formData.email}</dd>
        {formData.phone && (
          <>
            <dt>Phone</dt>
            <dd>{formData.phone}</dd>
          </>
        )}
      </dl>

      {Object.keys(formData.responses).length > 0 && (
        <div className="slotkit-responses-review">
          <h3>Your Responses</h3>
          <dl>
            {Object.entries(formData.responses).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      )}

      {state.status === "conflict" && (
        <div className="slotkit-alert slotkit-alert-warning" role="alert">
          <p>This time slot is no longer available. Please select a different time.</p>
          {onBack && (
            <button
              type="button"
              className="slotkit-button-secondary"
              onClick={onBack}
            >
              Choose Another Time
            </button>
          )}
        </div>
      )}

      {state.status === "error" && (
        <div className="slotkit-alert slotkit-alert-error" role="alert">
          <p>{state.message}</p>
          <button
            type="button"
            className="slotkit-button-secondary"
            onClick={handleConfirm}
          >
            Try Again
          </button>
        </div>
      )}

      <div className="slotkit-confirmation-actions">
        {onBack && state.status !== "conflict" && (
          <button
            type="button"
            className="slotkit-button-secondary"
            onClick={onBack}
            disabled={state.status === "submitting"}
          >
            Back
          </button>
        )}
        {state.status !== "conflict" && (
          <button
            type="button"
            className="slotkit-button-primary"
            onClick={handleConfirm}
            disabled={state.status === "submitting"}
          >
            {state.status === "submitting" ? "Confirming..." : "Confirm Booking"}
          </button>
        )}
      </div>
    </div>
  );
}

function formatSlotDisplay(slot: Slot, timezone: string): string {
  const date = new Date(slot.startTime);
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  });

  // Extract time from localStart
  const timePart = slot.localStart.split("T")[1];
  const [h, m] = (timePart ?? "00:00").split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  const timeStr = `${h12}:${String(m).padStart(2, "0")} ${period}`;

  return `${dateStr} at ${timeStr} (${timezone})`;
}
