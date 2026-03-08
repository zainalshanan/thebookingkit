import React, { useState, useCallback } from "react";
import { cn } from "../utils/cn.js";

/** A time range for a day of the week */
export interface TimeRange {
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
}

/** Weekly availability schedule */
export type WeeklySchedule = Record<string, TimeRange[]>;

/** Props for the AvailabilityEditor component */
export interface AvailabilityEditorProps {
  /** Current weekly schedule */
  value: WeeklySchedule;
  /** Callback when schedule changes */
  onChange: (schedule: WeeklySchedule) => void;
  /** Callback when schedule is saved */
  onSave?: (schedule: WeeklySchedule) => void;
  /** Provider's timezone */
  timezone?: string;
  /** Callback when timezone is changed */
  onTimezoneChange?: (timezone: string) => void;
  /** Whether the editor is in a saving state */
  isSaving?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

const DAYS_OF_WEEK = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

/**
 * Visual editor for weekly recurring availability hours.
 *
 * Providers define their available hours for each day of the week.
 * Multiple time ranges per day are supported (e.g., 9-12 and 1-5).
 * Generates RRULE-compatible schedules.
 *
 * @example
 * ```tsx
 * <AvailabilityEditor
 *   value={schedule}
 *   onChange={setSchedule}
 *   onSave={handleSave}
 *   timezone="America/New_York"
 * />
 * ```
 */
export function AvailabilityEditor({
  value,
  onChange,
  onSave,
  timezone,
  onTimezoneChange,
  isSaving = false,
  className,
  style,
}: AvailabilityEditorProps) {
  const addTimeRange = useCallback(
    (day: string) => {
      const existing = value[day] ?? [];
      const lastEnd = existing.length > 0 ? existing[existing.length - 1].endTime : "09:00";
      onChange({
        ...value,
        [day]: [...existing, { startTime: lastEnd, endTime: "17:00" }],
      });
    },
    [value, onChange],
  );

  const removeTimeRange = useCallback(
    (day: string, index: number) => {
      const existing = value[day] ?? [];
      onChange({
        ...value,
        [day]: existing.filter((_, i) => i !== index),
      });
    },
    [value, onChange],
  );

  const updateTimeRange = useCallback(
    (day: string, index: number, field: "startTime" | "endTime", val: string) => {
      const existing = value[day] ?? [];
      const updated = existing.map((range, i) =>
        i === index ? { ...range, [field]: val } : range,
      );
      onChange({ ...value, [day]: updated });
    },
    [value, onChange],
  );

  const copyToAllDays = useCallback(
    (sourceDay: string) => {
      const sourceRanges = value[sourceDay] ?? [];
      const newSchedule: WeeklySchedule = {};
      for (const day of DAYS_OF_WEEK) {
        newSchedule[day.key] = [...sourceRanges.map((r) => ({ ...r }))];
      }
      onChange(newSchedule);
    },
    [value, onChange],
  );

  return (
    <div className={cn("slotkit-availability-editor", className)} style={style}>
      {timezone && (
        <div className="slotkit-editor-timezone">
          <span>Timezone: {timezone}</span>
          {onTimezoneChange && (
            <select
              value={timezone}
              onChange={(e) => onTimezoneChange((e.target as HTMLSelectElement).value)}
              className="slotkit-timezone-select"
              aria-label="Provider timezone"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="slotkit-days-list">
        {DAYS_OF_WEEK.map((day) => {
          const ranges = value[day.key] ?? [];
          return (
            <div key={day.key} className="slotkit-day-row">
              <div className="slotkit-day-label">
                <span>{day.label}</span>
              </div>
              <div className="slotkit-day-ranges">
                {ranges.length === 0 && (
                  <span className="slotkit-unavailable-label">Unavailable</span>
                )}
                {ranges.map((range, idx) => (
                  <div key={idx} className="slotkit-time-range">
                    <input
                      type="time"
                      value={range.startTime}
                      onChange={(e) =>
                        updateTimeRange(day.key, idx, "startTime", (e.target as HTMLInputElement).value)
                      }
                      className="slotkit-time-input"
                      aria-label={`${day.label} start time ${idx + 1}`}
                    />
                    <span className="slotkit-time-separator">to</span>
                    <input
                      type="time"
                      value={range.endTime}
                      onChange={(e) =>
                        updateTimeRange(day.key, idx, "endTime", (e.target as HTMLInputElement).value)
                      }
                      className="slotkit-time-input"
                      aria-label={`${day.label} end time ${idx + 1}`}
                    />
                    <button
                      type="button"
                      className="slotkit-remove-range"
                      onClick={() => removeTimeRange(day.key, idx)}
                      aria-label={`Remove time range ${idx + 1} for ${day.label}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <div className="slotkit-day-actions">
                  <button
                    type="button"
                    className="slotkit-add-range"
                    onClick={() => addTimeRange(day.key)}
                  >
                    + Add hours
                  </button>
                  {ranges.length > 0 && (
                    <button
                      type="button"
                      className="slotkit-copy-all"
                      onClick={() => copyToAllDays(day.key)}
                    >
                      Copy to all days
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {onSave && (
        <button
          type="button"
          className="slotkit-button-primary"
          onClick={() => onSave(value)}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save Availability"}
        </button>
      )}
    </div>
  );
}

/**
 * Convert a WeeklySchedule to RRULE strings for storage.
 *
 * Groups days with the same time ranges into single RRULE strings.
 */
export function scheduleToRRules(
  schedule: WeeklySchedule,
): Array<{ rrule: string; startTime: string; endTime: string }> {
  const dayMap: Record<string, string> = {
    monday: "MO",
    tuesday: "TU",
    wednesday: "WE",
    thursday: "TH",
    friday: "FR",
    saturday: "SA",
    sunday: "SU",
  };

  // Group days by their time ranges
  const groups = new Map<string, { days: string[]; startTime: string; endTime: string }>();

  for (const [dayKey, ranges] of Object.entries(schedule)) {
    const rruleDay = dayMap[dayKey];
    if (!rruleDay) continue;

    for (const range of ranges) {
      const key = `${range.startTime}-${range.endTime}`;
      const existing = groups.get(key);
      if (existing) {
        existing.days.push(rruleDay);
      } else {
        groups.set(key, {
          days: [rruleDay],
          startTime: range.startTime,
          endTime: range.endTime,
        });
      }
    }
  }

  return Array.from(groups.values()).map((group) => ({
    rrule: `FREQ=WEEKLY;BYDAY=${group.days.join(",")}`,
    startTime: group.startTime,
    endTime: group.endTime,
  }));
}

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];
