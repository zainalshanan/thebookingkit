import React, { useCallback, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import {
  format,
  parse,
  startOfWeek,
  getDay,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  startOfToday,
} from "date-fns";
import { cn } from "../utils/cn.js";
import { BookingStatusBadge, type BookingStatus } from "./booking-status-badge.js";

const locales = { "en-US": {} };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

/** A booking record for display in the schedule */
export interface ScheduleBooking {
  id: string;
  title: string;
  customerName: string;
  customerEmail: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  eventTitle: string;
  location?: string;
  questionResponses?: Record<string, string>;
}

/** Props for the AdminScheduleView component */
export interface AdminScheduleViewProps {
  /** Bookings to display on the calendar */
  bookings: ScheduleBooking[];
  /** Default calendar view */
  defaultView?: View;
  /** Timezone label to display (for UI only; dates should be pre-converted) */
  timezone?: string;
  /** Callback when a booking event is clicked */
  onBookingClick?: (booking: ScheduleBooking) => void;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

const STATUS_COLORS: Record<BookingStatus, string> = {
  confirmed: "#16a34a",
  pending: "#ca8a04",
  cancelled: "#6b7280",
  no_show: "#dc2626",
  completed: "#2563eb",
  rejected: "#9ca3af",
  rescheduled: "#7c3aed",
};

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: ScheduleBooking;
}

/**
 * Admin schedule view showing all bookings in a weekly/monthly calendar.
 *
 * Uses react-big-calendar with color-coded booking status blocks.
 * Clicking a booking block opens an inline detail popover.
 *
 * @example
 * ```tsx
 * <AdminScheduleView
 *   bookings={providerBookings}
 *   defaultView="week"
 *   onBookingClick={(b) => openDetailModal(b)}
 * />
 * ```
 */
export function AdminScheduleView({
  bookings,
  defaultView = "week",
  timezone,
  onBookingClick,
  className,
  style,
}: AdminScheduleViewProps) {
  const [view, setView] = useState<View>(defaultView);
  const [date, setDate] = useState<Date>(startOfToday());
  const [selectedBooking, setSelectedBooking] = useState<ScheduleBooking | null>(null);

  const events: CalendarEvent[] = useMemo(
    () =>
      bookings.map((b) => ({
        id: b.id,
        title: `${b.customerName} — ${b.eventTitle}`,
        start: b.startsAt,
        end: b.endsAt,
        resource: b,
      })),
    [bookings],
  );

  const handleNavigate = useCallback(
    (direction: "prev" | "next" | "today") => {
      if (direction === "today") {
        setDate(startOfToday());
        return;
      }
      if (view === "week") {
        setDate((d) =>
          direction === "prev" ? subWeeks(d, 1) : addWeeks(d, 1),
        );
      } else {
        setDate((d) =>
          direction === "prev" ? subMonths(d, 1) : addMonths(d, 1),
        );
      }
    },
    [view],
  );

  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      setSelectedBooking(event.resource);
      onBookingClick?.(event.resource);
    },
    [onBookingClick],
  );

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    const color = STATUS_COLORS[event.resource.status] ?? "#6b7280";
    return {
      style: {
        backgroundColor: color,
        border: "none",
        borderRadius: "4px",
        color: "white",
        fontSize: "12px",
        padding: "2px 6px",
      },
    };
  }, []);

  return (
    <div
      className={cn("slotkit-admin-schedule", className)}
      style={style}
    >
      {/* Toolbar */}
      <div className="slotkit-schedule-toolbar">
        <div className="slotkit-schedule-nav">
          <button
            type="button"
            className="slotkit-button-secondary"
            onClick={() => handleNavigate("prev")}
            aria-label="Previous"
          >
            &lsaquo;
          </button>
          <button
            type="button"
            className="slotkit-button-secondary"
            onClick={() => handleNavigate("today")}
          >
            Today
          </button>
          <button
            type="button"
            className="slotkit-button-secondary"
            onClick={() => handleNavigate("next")}
            aria-label="Next"
          >
            &rsaquo;
          </button>
        </div>
        <div className="slotkit-schedule-view-switcher">
          {(["week", "month"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              className={cn(
                "slotkit-button-secondary",
                view === v && "slotkit-button-active",
              )}
              onClick={() => setView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        {timezone && (
          <span className="slotkit-schedule-timezone">{timezone}</span>
        )}
      </div>

      {/* Calendar */}
      <Calendar<CalendarEvent>
        localizer={localizer}
        events={events}
        view={view}
        date={date}
        onView={setView}
        onNavigate={setDate}
        onSelectEvent={handleSelectEvent}
        eventPropGetter={eventStyleGetter}
        toolbar={false}
        style={{ height: 600 }}
      />

      {/* Status legend */}
      <div className="slotkit-schedule-legend">
        {(Object.entries(STATUS_COLORS) as [BookingStatus, string][]).map(
          ([status, color]) => (
            <span key={status} className="slotkit-legend-item">
              <span
                className="slotkit-legend-dot"
                style={{ backgroundColor: color }}
              />
              <span>{status}</span>
            </span>
          ),
        )}
      </div>

      {/* Detail popover */}
      {selectedBooking && (
        <div
          className="slotkit-booking-popover"
          role="dialog"
          aria-label="Booking details"
        >
          <button
            type="button"
            className="slotkit-popover-close"
            onClick={() => setSelectedBooking(null)}
            aria-label="Close"
          >
            &times;
          </button>
          <BookingStatusBadge status={selectedBooking.status} />
          <h3>{selectedBooking.eventTitle}</h3>
          <dl className="slotkit-detail-list">
            <dt>Customer</dt>
            <dd>{selectedBooking.customerName}</dd>
            <dt>Email</dt>
            <dd>{selectedBooking.customerEmail}</dd>
            <dt>Time</dt>
            <dd>
              {selectedBooking.startsAt.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              –{" "}
              {selectedBooking.endsAt.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </dd>
            {selectedBooking.location && (
              <>
                <dt>Location</dt>
                <dd>{selectedBooking.location}</dd>
              </>
            )}
          </dl>
          {selectedBooking.questionResponses &&
            Object.keys(selectedBooking.questionResponses).length > 0 && (
              <>
                <h4>Responses</h4>
                <dl className="slotkit-detail-list">
                  {Object.entries(selectedBooking.questionResponses).map(
                    ([key, value]) => (
                      <React.Fragment key={key}>
                        <dt>{key}</dt>
                        <dd>{value}</dd>
                      </React.Fragment>
                    ),
                  )}
                </dl>
              </>
            )}
        </div>
      )}
    </div>
  );
}
