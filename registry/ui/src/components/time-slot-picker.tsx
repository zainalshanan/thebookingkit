import React, { useMemo } from "react";
import type { Slot } from "@slotkit/core";
import { cn } from "../utils/cn.js";

/** Props for the TimeSlotPicker component */
export interface TimeSlotPickerProps {
  /** Available slots for the selected date */
  slots: Slot[];
  /** Whether slots are being loaded */
  isLoading?: boolean;
  /** Currently selected slot */
  selectedSlot?: Slot | null;
  /** Callback when a slot is selected */
  onSelect: (slot: Slot) => void;
  /** Time format: 12h or 24h */
  timeFormat?: "12h" | "24h";
  /** Group slots by period (Morning, Afternoon, Evening) */
  groupByPeriod?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

interface SlotGroup {
  label: string;
  slots: Slot[];
}

/**
 * Displays available time slots for a selected date.
 *
 * Slots are shown as selectable buttons, optionally grouped
 * by period (Morning, Afternoon, Evening).
 *
 * @example
 * ```tsx
 * <TimeSlotPicker
 *   slots={availableSlots}
 *   isLoading={isLoading}
 *   selectedSlot={selected}
 *   onSelect={setSelected}
 *   groupByPeriod
 * />
 * ```
 */
export function TimeSlotPicker({
  slots,
  isLoading = false,
  selectedSlot,
  onSelect,
  timeFormat = "12h",
  groupByPeriod = false,
  className,
  style,
}: TimeSlotPickerProps) {
  const groups = useMemo(() => {
    if (!groupByPeriod) return [{ label: "", slots }];

    const morning: Slot[] = [];
    const afternoon: Slot[] = [];
    const evening: Slot[] = [];

    for (const slot of slots) {
      const hour = parseInt(slot.localStart.split("T")[1]?.split(":")[0] ?? "0", 10);
      if (hour < 12) {
        morning.push(slot);
      } else if (hour < 17) {
        afternoon.push(slot);
      } else {
        evening.push(slot);
      }
    }

    const result: SlotGroup[] = [];
    if (morning.length > 0) result.push({ label: "Morning", slots: morning });
    if (afternoon.length > 0) result.push({ label: "Afternoon", slots: afternoon });
    if (evening.length > 0) result.push({ label: "Evening", slots: evening });
    return result;
  }, [slots, groupByPeriod]);

  if (isLoading) {
    return (
      <div className={cn("slotkit-timeslot-picker slotkit-loading", className)} style={style}>
        <div className="slotkit-skeleton" role="status" aria-label="Loading time slots">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="slotkit-skeleton-slot" />
          ))}
        </div>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className={cn("slotkit-timeslot-picker slotkit-empty", className)} style={style}>
        <p>No times available for this date. Please select another date.</p>
      </div>
    );
  }

  return (
    <div className={cn("slotkit-timeslot-picker", className)} style={style}>
      {groups.map((group) => (
        <div key={group.label} className="slotkit-slot-group">
          {group.label && (
            <h3 className="slotkit-slot-group-label">{group.label}</h3>
          )}
          <div className="slotkit-slot-grid">
            {group.slots.map((slot) => {
              const isSelected = selectedSlot?.startTime === slot.startTime;
              return (
                <button
                  key={slot.startTime}
                  type="button"
                  className={cn(
                    "slotkit-slot-button",
                    isSelected && "slotkit-slot-selected",
                  )}
                  onClick={() => onSelect(slot)}
                  aria-pressed={isSelected}
                  aria-label={`Select ${formatTime(slot.localStart, timeFormat)}`}
                >
                  {formatTime(slot.localStart, timeFormat)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTime(localStart: string, format: "12h" | "24h"): string {
  const timePart = localStart.split("T")[1]; // "HH:mm:ss"
  if (!timePart) return localStart;

  const [hours, minutes] = timePart.split(":").map(Number);

  if (format === "24h") {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  return `${h12}:${String(minutes).padStart(2, "0")} ${period}`;
}
