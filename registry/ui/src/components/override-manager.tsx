import React, { useState } from "react";
import { cn } from "../utils/cn.js";

/** An availability override entry */
export interface OverrideEntry {
  id?: string;
  date: Date;
  startTime?: string;
  endTime?: string;
  isUnavailable: boolean;
  reason?: string;
}

/** Props for the OverrideManager component */
export interface OverrideManagerProps {
  /** Existing overrides */
  overrides: OverrideEntry[];
  /** Callback when an override is added */
  onAdd: (override: Omit<OverrideEntry, "id">) => void;
  /** Callback when an override is removed */
  onRemove: (id: string) => void;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Interface for managing date-specific availability overrides.
 *
 * Allows providers to block specific dates or add custom hours
 * for one-off schedule changes.
 *
 * @example
 * ```tsx
 * <OverrideManager
 *   overrides={existingOverrides}
 *   onAdd={handleAddOverride}
 *   onRemove={handleRemoveOverride}
 * />
 * ```
 */
export function OverrideManager({
  overrides,
  onAdd,
  onRemove,
  className,
  style,
}: OverrideManagerProps) {
  const [selectedDate, setSelectedDate] = useState("");
  const [overrideType, setOverrideType] = useState<"unavailable" | "custom">("unavailable");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("");

  const handleAdd = () => {
    if (!selectedDate) return;

    const override: Omit<OverrideEntry, "id"> = {
      date: new Date(selectedDate + "T00:00:00"),
      isUnavailable: overrideType === "unavailable",
      reason: reason || undefined,
    };

    if (overrideType === "custom") {
      override.startTime = startTime;
      override.endTime = endTime;
    }

    onAdd(override);
    setSelectedDate("");
    setReason("");
  };

  return (
    <div className={cn("slotkit-override-manager", className)} style={style}>
      <h3>Schedule Overrides</h3>

      {/* Add override form */}
      <div className="slotkit-override-form">
        <div className="slotkit-field">
          <label htmlFor="override-date">Date</label>
          <input
            id="override-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate((e.target as HTMLInputElement).value)}
            className="slotkit-input"
          />
        </div>

        <div className="slotkit-field">
          <label>Override Type</label>
          <div className="slotkit-radio-group">
            <label>
              <input
                type="radio"
                value="unavailable"
                checked={overrideType === "unavailable"}
                onChange={() => setOverrideType("unavailable")}
              />
              Mark as Unavailable
            </label>
            <label>
              <input
                type="radio"
                value="custom"
                checked={overrideType === "custom"}
                onChange={() => setOverrideType("custom")}
              />
              Custom Hours
            </label>
          </div>
        </div>

        {overrideType === "custom" && (
          <div className="slotkit-time-range">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime((e.target as HTMLInputElement).value)}
              className="slotkit-time-input"
              aria-label="Override start time"
            />
            <span>to</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime((e.target as HTMLInputElement).value)}
              className="slotkit-time-input"
              aria-label="Override end time"
            />
          </div>
        )}

        <div className="slotkit-field">
          <label htmlFor="override-reason">Reason (optional)</label>
          <input
            id="override-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason((e.target as HTMLInputElement).value)}
            className="slotkit-input"
            placeholder="e.g., Public holiday, Dentist appointment"
          />
        </div>

        <button
          type="button"
          className="slotkit-button-primary"
          onClick={handleAdd}
          disabled={!selectedDate}
        >
          Add Override
        </button>
      </div>

      {/* Existing overrides list */}
      <div className="slotkit-override-list">
        {overrides.length === 0 && (
          <p className="slotkit-empty-message">No overrides set.</p>
        )}
        {overrides
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .map((override) => (
            <div key={override.id ?? override.date.toISOString()} className="slotkit-override-item">
              <div className="slotkit-override-info">
                <strong>
                  {override.date.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </strong>
                {override.isUnavailable ? (
                  <span className="slotkit-badge-unavailable">Unavailable</span>
                ) : (
                  <span className="slotkit-badge-custom">
                    {override.startTime} - {override.endTime}
                  </span>
                )}
                {override.reason && (
                  <span className="slotkit-override-reason">{override.reason}</span>
                )}
              </div>
              {override.id && (
                <button
                  type="button"
                  className="slotkit-remove-override"
                  onClick={() => onRemove(override.id!)}
                  aria-label={`Remove override for ${override.date.toLocaleDateString()}`}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
