import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import {
  format,
  parse,
  startOfWeek,
  endOfWeek,
  getDay,
  addDays,
  subDays,
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

/** A resource (provider/room/equipment) shown as a column in day view */
export interface KioskResource {
  /** Unique identifier */
  id: string | number;
  /** Display label shown in the column header */
  title: string;
}

/** A booking/event for the kiosk calendar */
export interface KioskEvent {
  id: string;
  title: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  serviceName: string;
  source: "online" | "walk_in" | "phone" | "admin";
  notes?: string;
  priceCents?: number;
  location?: string;
  /** Resource ID — determines column placement in day view and filtering in week view */
  resourceId?: string | number;
  /** Whether this is a break/block (not a booking) */
  isBlock?: boolean;
  blockType?: "break" | "personal" | "meeting" | "closed";
}

/** Color coding mode */
export type KioskColorMode = "status" | "event_type" | "source";

/** Props for the KioskCalendar component */
export interface KioskCalendarProps {
  /** Events to display */
  events: KioskEvent[];
  /**
   * Resources (providers, rooms, equipment, etc.) shown as columns.
   *
   * - **Day view**: all resources render as side-by-side columns for one day.
   *   Drag-and-drop between columns reassigns the resource.
   * - **Week view**: a resource picker appears in the toolbar so the user
   *   can view one resource's schedule across 7 days.
   * - **Solo mode**: omit this prop (or pass a single resource) and the
   *   calendar renders a standard single-column timeline — no picker,
   *   no resource headers.
   */
  resources?: KioskResource[];
  /** Default view */
  defaultView?: "day" | "week";
  /** Color coding mode */
  colorMode?: KioskColorMode;
  /** Fields to show on compact event blocks */
  showFields?: {
    customerName?: boolean;
    serviceName?: boolean;
    status?: boolean;
    price?: boolean;
    notes?: boolean;
  };
  /** Start hour for the time grid (0–23). @default 6 */
  dayStartHour?: number;
  /** End hour for the time grid (0–23). @default 22 */
  dayEndHour?: number;
  /** Slot height in pixels (controls vertical zoom). @default 48 */
  slotHeight?: number;
  /**
   * First day of the week for the week view grid.
   * 0 = Sunday, 1 = Monday. @default 1
   */
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Called when a booking is clicked */
  onEventClick?: (event: KioskEvent) => void;
  /** Called when an empty time slot is selected. resourceId is the column's resource in day view. */
  onSlotDoubleClick?: (start: Date, end: Date, resourceId?: string | number) => void;
  /**
   * Called when a booking is dragged to a new time (or a new resource column).
   * `resourceId` is the target resource when dragging between columns in day view.
   */
  onEventDrop?: (eventId: string, newStart: Date, newEnd: Date, resourceId?: string | number) => Promise<void>;
  /** Called when a booking is resized */
  onEventResize?: (eventId: string, newStart: Date, newEnd: Date) => Promise<void>;
  /**
   * Custom event style getter. Return a `{ style }` object to override the
   * default status/source color coding for a specific event.
   */
  eventStyleGetter?: (event: KioskEvent) => { style: React.CSSProperties } | undefined;
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

const SOURCE_COLORS: Record<string, string> = {
  online: "#2563eb",
  walk_in: "#f59e0b",
  phone: "#8b5cf6",
  admin: "#64748b",
};

/**
 * Full-screen interactive calendar for admin/reception use.
 *
 * Implements the industry-standard two-mode layout used by booking
 * platforms (Vagaro, Fresha, Square Appointments, Boulevard):
 *
 * - **Day view** — all resources as side-by-side columns for one day.
 *   Staff see every provider/room at once and can drag bookings
 *   between columns to reassign resources.
 *
 * - **Week view** — one resource's schedule across 7 days (configurable
 *   start day). A resource picker appears in the toolbar so staff can
 *   switch between providers. This answers "is Dr. Chen free Thursday
 *   afternoon?" without the unreadable N×7 column grid.
 *
 * - **Solo mode** — omit the `resources` prop and the calendar renders
 *   a clean single-column timeline for both views. Ideal for solo
 *   practitioners, single-room studios, or equipment scheduling.
 *
 * The view state drives which resources are passed to the underlying
 * react-big-calendar instance: resources are injected only in day view
 * (when more than one exists) and stripped entirely in week view.
 *
 * @example
 * ```tsx
 * // Multi-provider (salon, clinic, barbershop)
 * <KioskCalendar
 *   events={bookings}
 *   resources={[
 *     { id: "dr-1", title: "Dr. Chen" },
 *     { id: "dr-2", title: "Dr. Patel" },
 *   ]}
 *   defaultView="day"
 *   colorMode="status"
 *   onEventDrop={async (id, start, end, resourceId) => {
 *     await rescheduleBooking(id, start, end, resourceId);
 *   }}
 * />
 *
 * // Solo practitioner (no resource columns)
 * <KioskCalendar
 *   events={myBookings}
 *   defaultView="week"
 *   colorMode="source"
 *   onEventClick={(e) => openDetail(e)}
 * />
 * ```
 */
export function KioskCalendar({
  events,
  resources,
  defaultView = "day",
  colorMode = "status",
  showFields = { customerName: true, serviceName: true, status: true },
  dayStartHour = 6,
  dayEndHour = 22,
  slotHeight = 48,
  weekStartsOn = 1,
  onEventClick,
  onSlotDoubleClick,
  onEventDrop,
  onEventResize,
  eventStyleGetter: customStyleGetter,
  className,
  style,
}: KioskCalendarProps) {
  const [view, setView] = useState<View>(defaultView);
  const [date, setDate] = useState<Date>(startOfToday());
  const [selectedEvent, setSelectedEvent] = useState<KioskEvent | null>(null);

  // Whether there are multiple resources (enables column layout in day view
  // and the resource picker in week view).
  const hasMultipleResources = resources && resources.length > 1;

  // Week-view resource selection: default to first resource.
  const [selectedResourceId, setSelectedResourceId] = useState<string | number>(
    resources?.[0]?.id ?? "",
  );
  const calendarRef = useRef<HTMLDivElement>(null);

  // When resources arrive async and we have no selection, pick the first.
  useEffect(() => {
    if (resources && resources.length > 0 && !selectedResourceId) {
      setSelectedResourceId(resources[0].id);
    }
  }, [resources, selectedResourceId]);

  // Auto-scroll to current time indicator on mount.
  useEffect(() => {
    const scrollTarget = calendarRef.current?.querySelector(
      ".rbc-current-time-indicator",
    );
    scrollTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // Keyboard navigation.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedEvent(null);
        return;
      }
      if (e.key === "ArrowLeft") {
        setDate((d) => subDays(d, view === "week" ? 7 : 1));
        return;
      }
      if (e.key === "ArrowRight") {
        setDate((d) => addDays(d, view === "week" ? 7 : 1));
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [view]);

  interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    resource: KioskEvent;
    resourceId?: string | number;
  }

  // In week view with multiple resources, filter to the selected resource.
  // In day view, show all events (resource columns handle placement).
  // In solo mode (0–1 resources), show all events unfiltered.
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    const sourceEvents =
      view === "week" && hasMultipleResources && selectedResourceId
        ? events.filter((evt) => evt.resourceId === selectedResourceId)
        : events;

    return sourceEvents.map((evt) => ({
      id: evt.id,
      title: buildTitle(evt, showFields),
      start: evt.startsAt,
      end: evt.endsAt,
      resource: evt,
      resourceId: evt.resourceId,
    }));
  }, [events, showFields, view, selectedResourceId, hasMultipleResources]);

  // Resources are only passed to react-big-calendar in day view when there
  // are multiple. In week view (or solo mode) we pass nothing, so RBC
  // renders a clean day/7-day grid without resource sub-columns.
  const activeResources = useMemo(
    () => (view === "day" && hasMultipleResources ? resources : undefined),
    [view, resources, hasMultipleResources],
  );

  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      setSelectedEvent(event.resource);
      onEventClick?.(event.resource);
    },
    [onEventClick],
  );

  const handleSelectSlot = useCallback(
    ({ start, end, resourceId }: { start: Date; end: Date; resourceId?: string | number }) => {
      // In day view, resourceId comes from the clicked column.
      // In week view, resources aren't passed to RBC so resourceId is undefined —
      // fall back to the currently selected resource from the picker.
      const resolvedResourceId = resourceId ?? (view === "week" ? selectedResourceId : undefined);
      onSlotDoubleClick?.(start, end, resolvedResourceId || undefined);
    },
    [onSlotDoubleClick, view, selectedResourceId],
  );

  const handleEventDrop = useCallback(
    async ({
      event,
      start,
      end,
      resourceId,
    }: {
      event: CalendarEvent;
      start: Date | string;
      end: Date | string;
      resourceId?: string | number;
    }) => {
      if (!onEventDrop) return;
      const s = typeof start === "string" ? new Date(start) : start;
      const e = typeof end === "string" ? new Date(end) : end;
      await onEventDrop(event.id, s, e, resourceId);
    },
    [onEventDrop],
  );

  const handleEventResize = useCallback(
    async ({
      event,
      start,
      end,
    }: {
      event: CalendarEvent;
      start: Date | string;
      end: Date | string;
    }) => {
      if (!onEventResize) return;
      const s = typeof start === "string" ? new Date(start) : start;
      const e = typeof end === "string" ? new Date(end) : end;
      await onEventResize(event.id, s, e);
    },
    [onEventResize],
  );

  const defaultEventStyleGetter = useCallback(
    (event: CalendarEvent) => {
      const evt = event.resource;

      // Let the consumer override if they provided a custom getter.
      if (customStyleGetter) {
        const custom = customStyleGetter(evt);
        if (custom) return custom;
      }

      // Block/break styling
      if (evt.isBlock) {
        return {
          style: {
            backgroundColor: "var(--slotkit-block-bg, #f1f5f9)",
            border: "2px dashed var(--slotkit-block-border, #94a3b8)",
            color: "var(--slotkit-block-text, #475569)",
            fontSize: "12px",
            padding: "2px 6px",
            opacity: 0.85,
          },
        };
      }

      // Walk-in styling (dashed border to distinguish from scheduled)
      if (evt.source === "walk_in") {
        const color =
          colorMode === "source"
            ? SOURCE_COLORS.walk_in
            : getEventColor(evt, colorMode);
        return {
          style: {
            backgroundColor: color,
            border: "2px dashed rgba(255,255,255,0.4)",
            borderRadius: "4px",
            color: "white",
            fontSize: "12px",
            padding: "2px 6px",
          },
        };
      }

      // Regular booking
      const color = getEventColor(evt, colorMode);
      const isDraggable = ![
        "completed",
        "cancelled",
        "no_show",
        "rejected",
      ].includes(evt.status);

      return {
        style: {
          backgroundColor: color,
          border: "none",
          borderRadius: "4px",
          color: "white",
          fontSize: "12px",
          padding: "2px 6px",
          cursor: isDraggable ? "grab" : "default",
          opacity: ["cancelled", "rejected", "no_show"].includes(evt.status)
            ? 0.45
            : 1,
        },
      };
    },
    [colorMode, customStyleGetter],
  );

  const handleNavigate = (direction: "prev" | "next" | "today") => {
    if (direction === "today") {
      setDate(startOfToday());
    } else if (direction === "prev") {
      setDate((d) => subDays(d, view === "week" ? 7 : 1));
    } else {
      setDate((d) => addDays(d, view === "week" ? 7 : 1));
    }
  };

  const handleViewSwitch = (newView: "day" | "week") => {
    setView(newView);
    if (
      newView === "week" &&
      hasMultipleResources &&
      !selectedResourceId
    ) {
      setSelectedResourceId(resources![0].id);
    }
  };

  // Heading text: single date for day view, week range for week view.
  const dateHeading =
    view === "week"
      ? `${format(startOfWeek(date, { weekStartsOn }), "MMM d")} – ${format(
          endOfWeek(date, { weekStartsOn }),
          "MMM d, yyyy",
        )}`
      : format(date, "EEEE, MMM d, yyyy");

  return (
    <div
      ref={calendarRef}
      className={cn("slotkit-kiosk-calendar", `slotkit-view-${view}`, className)}
      style={style}
    >
      {/* ── Toolbar ── */}
      <div className="slotkit-kiosk-toolbar">
        {/* Left: navigation */}
        <div className="slotkit-kiosk-nav">
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

        {/* Centre: date heading + week-view resource picker */}
        <div className="slotkit-kiosk-centre">
          <h2 className="slotkit-kiosk-date">{dateHeading}</h2>

          {/*
           * Resource picker: only rendered in week view when multiple
           * resources exist. In day view the resource columns are already
           * visible, so a picker would be redundant. In solo mode there
           * is nothing to pick.
           */}
          {view === "week" && hasMultipleResources && (
            <div className="slotkit-resource-picker" role="tablist">
              {resources!.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedResourceId === r.id}
                  className={cn(
                    "slotkit-resource-pill",
                    selectedResourceId === r.id && "slotkit-resource-pill-active",
                  )}
                  onClick={() => setSelectedResourceId(r.id)}
                >
                  {r.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: view switcher */}
        <div className="slotkit-kiosk-view-switcher">
          {(["day", "week"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={cn(
                "slotkit-button-secondary",
                view === v && "slotkit-button-active",
              )}
              onClick={() => handleViewSwitch(v)}
            >
              {v === "day" ? "Day" : "Week"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Calendar ── */}
      <Calendar<CalendarEvent, KioskResource>
        localizer={localizer}
        events={calendarEvents}
        view={view}
        date={date}
        onView={setView}
        onNavigate={setDate}
        onSelectEvent={handleSelectEvent}
        onSelectSlot={handleSelectSlot}
        eventPropGetter={defaultEventStyleGetter}
        toolbar={false}
        selectable
        step={15}
        timeslots={4}
        min={new Date(1970, 0, 1, dayStartHour, 0, 0)}
        max={new Date(1970, 0, 1, dayEndHour, 0, 0)}
        style={{ height: "calc(100vh - 156px)" }}
        // Resources are injected only in day view with multiple resources.
        // In week view this is undefined → clean 7-day grid.
        {...(activeResources
          ? {
              resources: activeResources,
              resourceIdAccessor: "id" as any,
              resourceTitleAccessor: "title" as any,
            }
          : {})}
      />

      {/* ── Event Detail Popover ── */}
      {selectedEvent && (
        <div
          className="slotkit-kiosk-popover"
          role="dialog"
          aria-label="Event details"
        >
          <button
            type="button"
            className="slotkit-popover-close"
            onClick={() => setSelectedEvent(null)}
            aria-label="Close"
          >
            &times;
          </button>

          {selectedEvent.isBlock ? (
            <>
              <h3>{selectedEvent.title}</h3>
              <p className="slotkit-kiosk-popover-type">
                {selectedEvent.blockType ?? "Block"}
              </p>
              <dl className="slotkit-detail-list">
                <dt>Time</dt>
                <dd>
                  {formatTime(selectedEvent.startsAt)} &ndash;{" "}
                  {formatTime(selectedEvent.endsAt)}
                </dd>
              </dl>
            </>
          ) : (
            <>
              <BookingStatusBadge status={selectedEvent.status} />
              <h3 style={{ marginTop: "8px", marginBottom: "4px" }}>
                {selectedEvent.serviceName}
              </h3>
              <dl className="slotkit-detail-list">
                <dt>Customer</dt>
                <dd>{selectedEvent.customerName}</dd>
                {selectedEvent.customerEmail && (
                  <>
                    <dt>Email</dt>
                    <dd>{selectedEvent.customerEmail}</dd>
                  </>
                )}
                {selectedEvent.customerPhone && (
                  <>
                    <dt>Phone</dt>
                    <dd>{selectedEvent.customerPhone}</dd>
                  </>
                )}
                <dt>Time</dt>
                <dd>
                  {formatTime(selectedEvent.startsAt)} &ndash;{" "}
                  {formatTime(selectedEvent.endsAt)}
                </dd>
                <dt>Source</dt>
                <dd>{selectedEvent.source.replace("_", " ")}</dd>
                {selectedEvent.priceCents != null &&
                  selectedEvent.priceCents > 0 && (
                    <>
                      <dt>Price</dt>
                      <dd>${(selectedEvent.priceCents / 100).toFixed(2)}</dd>
                    </>
                  )}
                {selectedEvent.location && (
                  <>
                    <dt>Location</dt>
                    <dd>{selectedEvent.location}</dd>
                  </>
                )}
                {selectedEvent.notes && (
                  <>
                    <dt>Notes</dt>
                    <dd>{selectedEvent.notes}</dd>
                  </>
                )}
              </dl>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTitle(
  event: KioskEvent,
  fields: KioskCalendarProps["showFields"],
): string {
  if (event.isBlock) return event.title;
  const parts: string[] = [];
  if (fields?.customerName !== false) parts.push(event.customerName);
  if (fields?.serviceName !== false) parts.push(event.serviceName);
  return parts.join(" — ") || event.title;
}

function getEventColor(event: KioskEvent, mode: KioskColorMode): string {
  if (mode === "source") return SOURCE_COLORS[event.source] ?? "#6b7280";
  return STATUS_COLORS[event.status] ?? "#6b7280";
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
