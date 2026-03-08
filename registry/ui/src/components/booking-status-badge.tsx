import React from "react";
import { cn } from "../utils/cn.js";

/** Valid booking status values */
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "rescheduled"
  | "completed"
  | "no_show"
  | "rejected";

/** Props for the BookingStatusBadge component */
export interface BookingStatusBadgeProps {
  /** Current booking status */
  status: BookingStatus;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

const statusLabels: Record<BookingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  completed: "Completed",
  no_show: "No Show",
  rejected: "Rejected",
};

/**
 * Visual badge indicator for booking status.
 *
 * @example
 * ```tsx
 * <BookingStatusBadge status="confirmed" />
 * ```
 */
export function BookingStatusBadge({
  status,
  className,
  style,
}: BookingStatusBadgeProps) {
  return (
    <span
      className={cn("slotkit-status-badge", `slotkit-status-${status}`, className)}
      style={style}
      role="status"
    >
      {statusLabels[status]}
    </span>
  );
}
