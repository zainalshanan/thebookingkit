import React, { useState, useMemo } from "react";
import { cn } from "../utils/cn.js";

/** A generated occurrence for display */
export interface OccurrenceDisplay {
  index: number;
  startsAt: Date;
  endsAt: Date;
  isConflict?: boolean;
}

/** Props for the RecurringBookingPicker component */
export interface RecurringBookingPickerProps {
  /** Available frequencies */
  frequencies?: { value: string; label: string }[];
  /** Maximum number of occurrences allowed */
  maxOccurrences?: number;
  /** Generated occurrences to display (after computing) */
  occurrences?: OccurrenceDisplay[];
  /** Called when frequency/count changes to generate occurrences */
  onConfigChange: (frequency: string, count: number) => void;
  /** Called when the user confirms the recurring series */
  onConfirm: (frequency: string, count: number) => void;
  /** Called when cancelled */
  onCancel?: () => void;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

const DEFAULT_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

/**
 * Recurring booking picker shown after initial slot selection.
 *
 * Allows the customer to choose frequency and number of occurrences,
 * see all generated dates, and identify any conflicts.
 *
 * @example
 * ```tsx
 * <RecurringBookingPicker
 *   occurrences={occurrences}
 *   onConfigChange={(freq, count) => generateOccurrences(freq, count)}
 *   onConfirm={(freq, count) => bookSeries(freq, count)}
 * />
 * ```
 */
export function RecurringBookingPicker({
  frequencies = DEFAULT_FREQUENCIES,
  maxOccurrences = 12,
  occurrences,
  onConfigChange,
  onConfirm,
  onCancel,
  className,
  style,
}: RecurringBookingPickerProps) {
  const [frequency, setFrequency] = useState(frequencies[0]?.value ?? "weekly");
  const [count, setCount] = useState(4);

  const conflicts = useMemo(
    () => occurrences?.filter((o) => o.isConflict) ?? [],
    [occurrences],
  );

  const handleFrequencyChange = (newFreq: string) => {
    setFrequency(newFreq);
    onConfigChange(newFreq, count);
  };

  const handleCountChange = (newCount: number) => {
    const clamped = Math.max(1, Math.min(maxOccurrences, newCount));
    setCount(clamped);
    onConfigChange(frequency, clamped);
  };

  return (
    <div
      className={cn("slotkit-recurring-picker", className)}
      style={style}
    >
      <h3 className="slotkit-recurring-title">Recurring Booking</h3>

      <div className="slotkit-recurring-config">
        <div className="slotkit-field">
          <label htmlFor="recurring-freq" className="slotkit-label">
            Frequency
          </label>
          <select
            id="recurring-freq"
            className="slotkit-select"
            value={frequency}
            onChange={(e) => handleFrequencyChange(e.target.value)}
          >
            {frequencies.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="slotkit-field">
          <label htmlFor="recurring-count" className="slotkit-label">
            Number of sessions
          </label>
          <input
            id="recurring-count"
            type="number"
            className="slotkit-input"
            min={1}
            max={maxOccurrences}
            value={count}
            onChange={(e) => handleCountChange(parseInt(e.target.value, 10))}
          />
        </div>
      </div>

      {/* Occurrence list */}
      {occurrences && occurrences.length > 0 && (
        <div className="slotkit-occurrences-list">
          <h4>Sessions</h4>
          <ul>
            {occurrences.map((occ) => (
              <li
                key={occ.index}
                className={cn(
                  "slotkit-occurrence-item",
                  occ.isConflict && "slotkit-occurrence-conflict",
                )}
              >
                <span className="slotkit-occurrence-date">
                  {occ.startsAt.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="slotkit-occurrence-time">
                  {occ.startsAt.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {" – "}
                  {occ.endsAt.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                {occ.isConflict && (
                  <span className="slotkit-badge slotkit-badge-warning">
                    Unavailable
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Conflict warning */}
      {conflicts.length > 0 && (
        <p className="slotkit-recurring-warning">
          {conflicts.length} session(s) have scheduling conflicts. Please adjust
          the frequency or number of sessions.
        </p>
      )}

      <div className="slotkit-form-actions">
        <button
          className="slotkit-button-primary"
          onClick={() => onConfirm(frequency, count)}
          disabled={conflicts.length > 0}
        >
          Confirm {count} Sessions
        </button>
        {onCancel && (
          <button
            className="slotkit-button-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
