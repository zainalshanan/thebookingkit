import React, { useState } from "react";
import { cn } from "../utils/cn.js";
import type { BookingStatus } from "./booking-status-badge.js";

/** Props for the BookingLifecycleActions component */
export interface BookingLifecycleActionsProps {
  /** ID of the booking to act on */
  bookingId: string;
  /** Current booking status */
  status: BookingStatus;
  /** Called when provider confirms a pending booking */
  onConfirm?: (bookingId: string) => Promise<void>;
  /** Called when provider rejects a pending booking */
  onReject?: (bookingId: string, reason?: string) => Promise<void>;
  /** Called when provider cancels a confirmed booking */
  onCancel?: (bookingId: string, reason?: string) => Promise<void>;
  /** Called when provider marks a booking as no-show */
  onNoShow?: (bookingId: string) => Promise<void>;
  /** Called on successful action (e.g., show toast notification) */
  onSuccess?: (action: string, bookingId: string) => void;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

type ActionMode =
  | "idle"
  | "confirm-reject-reason"
  | "cancel-reason"
  | "processing"
  | "done";

/**
 * Booking lifecycle action buttons for the provider's admin dashboard.
 *
 * - Pending bookings: Confirm + Reject buttons
 * - Confirmed bookings: Cancel + No-show buttons
 * - Terminal statuses: no actions shown
 *
 * Each destructive action prompts for an optional reason before executing.
 *
 * @example
 * ```tsx
 * <BookingLifecycleActions
 *   bookingId={booking.id}
 *   status={booking.status}
 *   onConfirm={async (id) => await api.confirmBooking(id)}
 *   onCancel={async (id, reason) => await api.cancelBooking(id, reason)}
 *   onSuccess={(action) => toast.success(`Booking ${action}`)}
 * />
 * ```
 */
export function BookingLifecycleActions({
  bookingId,
  status,
  onConfirm,
  onReject,
  onCancel,
  onNoShow,
  onSuccess,
  className,
  style,
}: BookingLifecycleActionsProps) {
  const [mode, setMode] = useState<ActionMode>("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "reject" | "cancel" | null
  >(null);

  const isTerminal =
    status === "cancelled" ||
    status === "rejected" ||
    status === "completed" ||
    status === "no_show";

  if (isTerminal || mode === "done") {
    return null;
  }

  const handleAction = async (
    action: string,
    fn: () => Promise<void>,
  ) => {
    setMode("processing");
    setError(null);
    try {
      await fn();
      onSuccess?.(action, bookingId);
      setMode("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      setMode("idle");
    }
  };

  const handleConfirm = () =>
    handleAction("confirmed", () => onConfirm!(bookingId));

  const handleNoShow = () =>
    handleAction("marked as no-show", () => onNoShow!(bookingId));

  const handleReasonSubmit = () => {
    if (pendingAction === "reject") {
      handleAction("rejected", () => onReject!(bookingId, reason || undefined));
    } else if (pendingAction === "cancel") {
      handleAction("cancelled", () => onCancel!(bookingId, reason || undefined));
    }
    setReason("");
    setPendingAction(null);
  };

  const openReasonPrompt = (action: "reject" | "cancel") => {
    setPendingAction(action);
    setMode(action === "reject" ? "confirm-reject-reason" : "cancel-reason");
    setReason("");
  };

  const cancelPrompt = () => {
    setMode("idle");
    setPendingAction(null);
    setReason("");
  };

  const isProcessing = mode === "processing";
  const showReasonPrompt =
    mode === "confirm-reject-reason" || mode === "cancel-reason";

  return (
    <div
      className={cn("slotkit-lifecycle-actions", className)}
      style={style}
    >
      {error && (
        <div className="slotkit-alert slotkit-alert-error" role="alert">
          {error}
        </div>
      )}

      {showReasonPrompt ? (
        <div className="slotkit-reason-prompt">
          <label htmlFor={`reason-${bookingId}`} className="slotkit-label">
            {pendingAction === "reject"
              ? "Rejection reason (optional)"
              : "Cancellation reason (optional)"}
          </label>
          <textarea
            id={`reason-${bookingId}`}
            className="slotkit-textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Add a reason..."
          />
          <div className="slotkit-reason-actions">
            <button
              type="button"
              className={cn(
                pendingAction === "reject"
                  ? "slotkit-button-danger"
                  : "slotkit-button-danger",
              )}
              onClick={handleReasonSubmit}
              disabled={isProcessing}
            >
              {isProcessing
                ? "Processing..."
                : pendingAction === "reject"
                  ? "Confirm Rejection"
                  : "Confirm Cancellation"}
            </button>
            <button
              type="button"
              className="slotkit-button-secondary"
              onClick={cancelPrompt}
              disabled={isProcessing}
            >
              Go Back
            </button>
          </div>
        </div>
      ) : (
        <div className="slotkit-action-buttons">
          {status === "pending" && (
            <>
              {onConfirm && (
                <button
                  type="button"
                  className="slotkit-button-primary"
                  onClick={handleConfirm}
                  disabled={isProcessing}
                >
                  {isProcessing ? "Processing..." : "Confirm"}
                </button>
              )}
              {onReject && (
                <button
                  type="button"
                  className="slotkit-button-danger"
                  onClick={() => openReasonPrompt("reject")}
                  disabled={isProcessing}
                >
                  Reject
                </button>
              )}
            </>
          )}

          {status === "confirmed" && (
            <>
              {onCancel && (
                <button
                  type="button"
                  className="slotkit-button-danger"
                  onClick={() => openReasonPrompt("cancel")}
                  disabled={isProcessing}
                >
                  Cancel
                </button>
              )}
              {onNoShow && (
                <button
                  type="button"
                  className="slotkit-button-secondary"
                  onClick={handleNoShow}
                  disabled={isProcessing}
                >
                  {isProcessing ? "Processing..." : "Mark No-Show"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
