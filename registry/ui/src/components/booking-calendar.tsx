import React, { useMemo } from "react";
import { DayPicker } from "react-day-picker";
import { addDays, isBefore, startOfDay } from "date-fns";
import { cn } from "../utils/cn.js";

/** Props for the BookingCalendar component */
export interface BookingCalendarProps {
  /** Currently selected date */
  selected?: Date;
  /** Callback when a date is selected */
  onSelect: (date: Date) => void;
  /** Dates that have available slots (all other future dates are disabled) */
  availableDates?: Date[];
  /** Maximum days in the future that can be booked */
  maxFutureDays?: number;
  /** Customer's timezone (displayed below calendar) */
  timezone?: string;
  /** Callback when timezone is changed */
  onTimezoneChange?: (timezone: string) => void;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Customer-facing date picker calendar for booking.
 *
 * Renders a month-view calendar using react-day-picker.
 * Dates with no available slots are visually disabled.
 * Past dates and dates beyond maxFutureDays are disabled.
 *
 * @example
 * ```tsx
 * <BookingCalendar
 *   selected={selectedDate}
 *   onSelect={setSelectedDate}
 *   availableDates={datesWithSlots}
 *   maxFutureDays={60}
 *   timezone="America/New_York"
 * />
 * ```
 */
export function BookingCalendar({
  selected,
  onSelect,
  availableDates,
  maxFutureDays = 60,
  timezone,
  onTimezoneChange,
  className,
  style,
}: BookingCalendarProps) {
  const today = startOfDay(new Date());
  const maxDate = addDays(today, maxFutureDays);

  const availableSet = useMemo(() => {
    if (!availableDates) return null;
    const set = new Set<string>();
    for (const d of availableDates) {
      set.add(d.toISOString().split("T")[0]);
    }
    return set;
  }, [availableDates]);

  const disabledMatcher = (date: Date) => {
    // Past dates
    if (isBefore(date, today)) return true;
    // Beyond max future
    if (date > maxDate) return true;
    // If we have available dates, disable dates not in the set
    if (availableSet) {
      const key = date.toISOString().split("T")[0];
      return !availableSet.has(key);
    }
    return false;
  };

  return (
    <div className={cn("slotkit-booking-calendar", className)} style={style}>
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={(day) => day && onSelect(day)}
        disabled={disabledMatcher}
        fromDate={today}
        toDate={maxDate}
        showOutsideDays={false}
      />
      {timezone && (
        <div className="slotkit-timezone-display">
          <span>Timezone: {timezone}</span>
          {onTimezoneChange && (
            <TimezoneSelector
              value={timezone}
              onChange={onTimezoneChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Simple timezone selector dropdown */
function TimezoneSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (tz: string) => void;
}) {
  const commonTimezones = [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Anchorage",
    "Pacific/Honolulu",
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

  return (
    <select
      className="slotkit-timezone-select"
      value={value}
      onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
      aria-label="Select timezone"
    >
      {commonTimezones.map((tz) => (
        <option key={tz} value={tz}>
          {tz.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
