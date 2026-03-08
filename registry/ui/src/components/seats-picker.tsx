import React from "react";
import { cn } from "../utils/cn.js";

/** Props for the SeatsPicker component */
export interface SeatsPickerProps {
  /** Total seat capacity */
  maxSeats: number;
  /** Number of currently booked seats */
  bookedSeats: number;
  /** Called when the user reserves a seat */
  onReserve: () => void;
  /** Whether the seat is being reserved */
  isReserving?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Seats picker for group events showing available capacity
 * and allowing seat reservation.
 *
 * @example
 * ```tsx
 * <SeatsPicker
 *   maxSeats={10}
 *   bookedSeats={4}
 *   onReserve={() => reserveSeat()}
 * />
 * ```
 */
export function SeatsPicker({
  maxSeats,
  bookedSeats,
  onReserve,
  isReserving,
  className,
  style,
}: SeatsPickerProps) {
  const availableSeats = Math.max(0, maxSeats - bookedSeats);
  const isFull = availableSeats === 0;
  const fillPercentage = (bookedSeats / maxSeats) * 100;

  return (
    <div className={cn("slotkit-seats-picker", className)} style={style}>
      <div className="slotkit-seats-info">
        <span className="slotkit-seats-count">
          {availableSeats} of {maxSeats} seats available
        </span>

        <div className="slotkit-seats-bar">
          <div
            className={cn(
              "slotkit-seats-fill",
              isFull && "slotkit-seats-full",
            )}
            style={{ width: `${Math.min(100, fillPercentage)}%` }}
          />
        </div>
      </div>

      <button
        className="slotkit-button-primary"
        onClick={onReserve}
        disabled={isFull || isReserving}
      >
        {isReserving
          ? "Reserving..."
          : isFull
            ? "Fully Booked"
            : "Reserve a Seat"}
      </button>
    </div>
  );
}
