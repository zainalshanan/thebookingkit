import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "./kiosk-calendar.css";
import {
  format,
  parse,
  startOfWeek,
  endOfWeek,
  getDay,
  addDays,
  subDays,
  startOfToday,
  addMilliseconds,
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

const DnDCalendar = withDragAndDrop(Calendar);

/** Statuses that cannot be rescheduled or dragged */
const NON_DRAGGABLE_STATUSES = ["completed", "cancelled", "no_show", "rejected"];

/** A resource (provider/room/equipment) shown as a column in day view */
export interface KioskResource {
  /** Unique identifier */
  id: string | number;
  /** Display label shown in the column header */
  title: string;
  /** Whether this resource is off for the day. Grays the column header and prevents drops. */
  isOff?: boolean;
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

/** Minimal conflict detail for the onConflictDetected callback */
export interface KioskConflictDetail {
  bookingId: string;
  startsAt: Date;
  endsAt: Date;
  customerName?: string;
  type?: string;
  /** Resource ID for multi-resource conflict filtering */
  resourceId?: string | number;
}

/** Staged reschedule state exposed to parent via callback */
export interface StagedReschedule {
  eventId: string;
  originalStart: Date;
  originalEnd: Date;
  newStart: Date;
  newEnd: Date;
  resourceId?: string | number;
}

/** Color coding mode */
export type KioskColorMode = "status" | "event_type" | "source";

/** Per-resource working-hours entry for slot styling */
export interface KioskScheduleEntry {
  /** Whether the resource is completely off for the day */
  isOff: boolean;
  /** Working hours start in "HH:MM" format */
  startTime: string;
  /** Working hours end in "HH:MM" format */
  endTime: string;
}

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
   * Only used when `rescheduleMode` is `false` (default).
   */
  onEventDrop?: (eventId: string, newStart: Date, newEnd: Date, resourceId?: string | number) => Promise<void>;
  /** Called when a booking is resized */
  onEventResize?: (eventId: string, newStart: Date, newEnd: Date) => Promise<void>;
  /**
   * Custom event style getter. Return a `{ style }` object to override the
   * default status/source color coding for a specific event.
   */
  eventStyleGetter?: (event: KioskEvent) => { style: React.CSSProperties } | undefined;
  /** Allow events to be resized by dragging their bottom edge. @default false */
  resizable?: boolean;
  /** Per-resource schedule map for dimming off-hours slots. Keyed by resource ID. */
  scheduleMap?: Map<string | number, KioskScheduleEntry>;
  /**
   * Controlled date value. When provided the calendar displays this date
   * instead of its own internal state (controlled/uncontrolled pattern).
   */
  date?: Date;
  /**
   * Called whenever the calendar navigates to a new date (prev/next/today
   * buttons or keyboard arrows). When a controlled `date` prop is supplied
   * the parent is responsible for updating the value via this callback.
   */
  onDateChange?: (date: Date) => void;

  // ── Two-Phase Reschedule (WP3) ──

  /**
   * When `true`, drag-and-drop enters a staged confirmation flow instead of
   * calling `onEventDrop` directly. The event visually moves to the new
   * position and a confirmation banner appears. @default false
   */
  rescheduleMode?: boolean;
  /**
   * Called when user drops an event in reschedule mode. The parent may
   * store the staged intent but should NOT commit the change yet.
   */
  onRescheduleStage?: (staged: StagedReschedule) => void;
  /**
   * Called when user confirms the staged reschedule from the banner.
   * Throw to trigger optimistic snap-back.
   */
  onRescheduleConfirm?: (staged: StagedReschedule, force?: boolean) => Promise<void>;
  /** Called when user cancels the staged reschedule */
  onRescheduleCancel?: () => void;

  // ── Conflict Detection (WP4) ──

  /**
   * Called instead of `onRescheduleConfirm` when conflicts are detected.
   * The parent renders a toast/dialog and calls `onForceOverride` or `onCancel`.
   */
  onConflictDetected?: (
    conflicts: KioskConflictDetail[],
    onForceOverride: () => void,
    onCancel: () => void,
  ) => void;
  /**
   * Bookings used for client-side conflict detection before confirming a
   * reschedule. When omitted, conflict checking is skipped (server handles it).
   */
  existingBookings?: KioskConflictDetail[];

  // ── Auto-Refresh (WP5) ──

  /** Auto-refresh interval in milliseconds. 0 = disabled. @default 0 */
  refreshInterval?: number;
  /** Called by the auto-refresh interval. Parent fetches fresh data. */
  onRefresh?: () => Promise<void>;
  /** Called when the calendar's idle state changes. `true` = safe to refresh. */
  onIdleChange?: (isIdle: boolean) => void;

  // ── Mobile (WP3) ──

  /**
   * Force all time slots to be selectable (clickable) regardless of event
   * status. Used for mobile tap-to-slot reschedule. @default false
   */
  forceSelectable?: boolean;

  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/** Internal event shape used by react-big-calendar */
interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: KioskEvent;
  resourceId?: string | number;
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
 * // Multi-provider with two-phase reschedule
 * <KioskCalendar
 *   events={bookings}
 *   resources={[
 *     { id: "dr-1", title: "Dr. Chen" },
 *     { id: "dr-2", title: "Dr. Patel", isOff: true },
 *   ]}
 *   defaultView="day"
 *   colorMode="status"
 *   rescheduleMode
 *   onRescheduleConfirm={async (staged) => {
 *     await rescheduleBooking(staged.eventId, staged.newStart, staged.newEnd);
 *   }}
 *   refreshInterval={30000}
 *   onRefresh={async () => { refetchBookings(); }}
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
  resizable = false,
  scheduleMap,
  date: controlledDate,
  onDateChange,
  rescheduleMode = false,
  onRescheduleStage,
  onRescheduleConfirm,
  onRescheduleCancel,
  onConflictDetected,
  existingBookings,
  refreshInterval = 0,
  onRefresh,
  onIdleChange,
  forceSelectable = false,
  className,
  style,
}: KioskCalendarProps) {
  const [view, setView] = useState<View>(defaultView);
  const [internalDate, setInternalDate] = useState<Date>(startOfToday());

  // When a controlled date is provided use it; otherwise fall back to internal state.
  const date = controlledDate ?? internalDate;

  // Stable ref for onDateChange to avoid stale closures in effects.
  const onDateChangeRef = useRef(onDateChange);
  useEffect(() => { onDateChangeRef.current = onDateChange; }, [onDateChange]);

  // Helper: update date via internal state and notify parent if a callback was given.
  // Uses functional setInternalDate to avoid depending on `date` (prevents stale closures).
  const setDate = useCallback((updater: Date | ((prev: Date) => Date)) => {
    if (controlledDate) {
      const next = typeof updater === "function" ? updater(controlledDate) : updater;
      onDateChangeRef.current?.(next);
    } else {
      setInternalDate((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        onDateChangeRef.current?.(next);
        return next;
      });
    }
  }, [controlledDate]);
  const [selectedEvent, setSelectedEvent] = useState<KioskEvent | null>(null);

  // ── Two-Phase Reschedule State (WP3) ──
  const [stagedReschedule, setStagedReschedule] = useState<StagedReschedule | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // ── Stale-Response Guard (WP5) ──
  const refreshSeqRef = useRef(0);

  // Whether there are multiple resources (enables column layout in day view
  // and the resource picker in week view).
  const hasMultipleResources = resources && resources.length > 1;

  // Build a set of off-resource IDs for drag prevention (WP8)
  const offResourceIds = useMemo(() => {
    const ids = new Set<string | number>();
    if (resources) {
      for (const r of resources) {
        if (r.isOff) ids.add(r.id);
      }
    }
    if (scheduleMap) {
      for (const [id, entry] of scheduleMap) {
        if (entry.isOff) ids.add(id);
      }
    }
    return ids;
  }, [resources, scheduleMap]);

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

  // ── Idle State (WP5) ──
  const isIdle = !selectedEvent && !stagedReschedule && !isConfirming;
  const prevIdleRef = useRef(isIdle);
  useEffect(() => {
    if (prevIdleRef.current !== isIdle) {
      prevIdleRef.current = isIdle;
      onIdleChange?.(isIdle);
    }
  }, [isIdle, onIdleChange]);

  // ── Auto-Refresh (WP5) ──
  // Store onRefresh in a ref to avoid resetting the interval when
  // the parent passes an un-memoized inline callback.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0) return;

    const id = setInterval(async () => {
      // Skip if admin is mid-action or no handler
      if (!prevIdleRef.current || !onRefreshRef.current) return;

      const seq = ++refreshSeqRef.current;
      try {
        await onRefreshRef.current();
        // Discard if a newer refresh has started
        if (seq !== refreshSeqRef.current) return;
      } catch {
        // Swallow refresh errors silently
      }
    }, refreshInterval);

    return () => clearInterval(id);
  }, [refreshInterval]);

  // ── Reschedule Cancel Handler (defined early for keyboard/event click refs) ──
  const handleRescheduleCancel = useCallback(() => {
    setStagedReschedule(null);
    onRescheduleCancel?.();
  }, [onRescheduleCancel]);

  // Clear staged reschedule if the source event disappears (e.g., from auto-refresh).
  useEffect(() => {
    if (stagedReschedule && !events.find((e) => e.id === stagedReschedule.eventId)) {
      setStagedReschedule(null);
    }
  }, [events, stagedReschedule]);

  // Keyboard navigation.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (stagedReschedule) {
          handleRescheduleCancel();
          return;
        }
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
  }, [view, stagedReschedule, handleRescheduleCancel, setDate]);

  // In week view with multiple resources, filter to the selected resource.
  // In day view, show all events (resource columns handle placement).
  // In solo mode (0–1 resources), show all events unfiltered.
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    const sourceEvents =
      view === "week" && hasMultipleResources && selectedResourceId
        ? events.filter((evt) => evt.resourceId === selectedResourceId)
        : events;

    return sourceEvents.map((evt) => {
      // If this event has a staged reschedule, show it at the new position
      const isStaged = stagedReschedule?.eventId === evt.id;
      return {
        id: evt.id,
        title: buildTitle(evt, showFields),
        start: isStaged ? stagedReschedule!.newStart : evt.startsAt,
        end: isStaged ? stagedReschedule!.newEnd : evt.endsAt,
        resource: evt,
        resourceId: isStaged ? (stagedReschedule!.resourceId ?? evt.resourceId) : evt.resourceId,
      };
    });
  }, [events, showFields, view, selectedResourceId, hasMultipleResources, stagedReschedule]);

  // Resources are only passed to react-big-calendar in day view when there
  // are multiple. In week view (or solo mode) we pass nothing, so RBC
  // renders a clean day/7-day grid without resource sub-columns.
  const activeResources = useMemo(
    () => (view === "day" && hasMultipleResources ? resources : undefined),
    [view, resources, hasMultipleResources],
  );

  // ── Custom ResourceHeader (WP8) ──
  const ResourceHeader = useCallback(
    ({ label, resource }: { label: string; resource: KioskResource }) => {
      const isResourceOff = resource?.isOff || offResourceIds.has(resource?.id);
      return (
        <span className={isResourceOff ? "tbk-resource-header-off" : undefined}>
          {label}
          {isResourceOff && <span className="tbk-day-off-badge">Day Off</span>}
        </span>
      );
    },
    [offResourceIds],
  );

  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      // Clicking an event while in reschedule mode cancels the reschedule
      if (stagedReschedule) {
        handleRescheduleCancel();
        return;
      }
      setSelectedEvent(event.resource);
      onEventClick?.(event.resource);
    },
    [onEventClick, stagedReschedule, handleRescheduleCancel],
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

  // ── Reschedule Confirm Handler (WP3 + WP4) ──
  const handleRescheduleConfirm = useCallback(
    async (force = false) => {
      if (!stagedReschedule || !onRescheduleConfirm || isConfirming) return;

      // WP4: Client-side conflict detection before confirming
      if (!force && existingBookings && existingBookings.length > 0 && onConflictDetected) {
        const ns = stagedReschedule.newStart.getTime();
        const ne = stagedReschedule.newEnd.getTime();
        const targetResource = stagedReschedule.resourceId;
        const conflicts = existingBookings.filter((b) => {
          if (b.bookingId === stagedReschedule.eventId) return false;
          // In multi-resource mode, only check bookings on the same resource
          if (targetResource && b.resourceId && b.resourceId !== targetResource) return false;
          const bs = b.startsAt.getTime();
          const be = b.endsAt.getTime();
          return ns < be && ne > bs;
        });
        if (conflicts.length > 0) {
          onConflictDetected(
            conflicts,
            () => handleRescheduleConfirm(true),
            handleRescheduleCancel,
          );
          return;
        }
      }

      setIsConfirming(true);
      try {
        await onRescheduleConfirm(stagedReschedule, force);
        setStagedReschedule(null);
      } catch {
        // Optimistic snap-back: revert to original position on error
        setStagedReschedule(null);
      } finally {
        setIsConfirming(false);
      }
    },
    [stagedReschedule, onRescheduleConfirm, isConfirming, existingBookings, onConflictDetected, handleRescheduleCancel],
  );

  const handleEventDrop = useCallback(
    async ({
      event,
      start,
      end,
      resourceId,
    }: {
      event: any;
      start: Date | string;
      end: Date | string;
      resourceId?: string | number;
      isAllDay?: boolean;
    }) => {
      const s = typeof start === "string" ? new Date(start) : start;
      const originalEvent: KioskEvent = event.resource;

      // WP8: Prevent drops on off-resource columns
      if (resourceId && offResourceIds.has(resourceId)) return;

      // WP3: Duration-preserving logic — preserve original booking duration
      const originalDuration = originalEvent.endsAt.getTime() - originalEvent.startsAt.getTime();
      const newEnd = addMilliseconds(s, originalDuration);

      if (rescheduleMode) {
        // Two-phase: stage for confirmation instead of immediate commit
        const staged: StagedReschedule = {
          eventId: event.id,
          originalStart: originalEvent.startsAt,
          originalEnd: originalEvent.endsAt,
          newStart: s,
          newEnd,
          resourceId,
        };

        // No-op check: skip if same time and same resource
        if (
          s.getTime() === originalEvent.startsAt.getTime() &&
          resourceId === originalEvent.resourceId
        ) {
          return;
        }

        setStagedReschedule(staged);
        setSelectedEvent(null);
        onRescheduleStage?.(staged);
        return;
      }

      // Legacy mode: immediate commit via onEventDrop
      if (!onEventDrop) return;
      const e = typeof end === "string" ? new Date(end) : end;
      await onEventDrop(event.id, s, e, resourceId);
    },
    [onEventDrop, rescheduleMode, onRescheduleStage, offResourceIds],
  );

  const handleEventResize = useCallback(
    async ({
      event,
      start,
      end,
    }: {
      event: any;
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

  const slotPropGetter = useCallback(
    (slotDate: Date, resourceId?: string | number) => {
      const baseClass = "tbk-kiosk-slot";
      const timeStr = format(slotDate, "h:mm a");

      const props: Record<string, any> = {
        className: baseClass,
        "data-time": timeStr,
      };

      if (!scheduleMap || !resourceId) return props;

      const schedule = scheduleMap.get(resourceId);
      if (!schedule) return props;

      if (schedule.isOff) {
        props.className = cn(baseClass, "tbk-slot-off");
        return props;
      }

      const toHours = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return h + m / 60;
      };

      const slotHour = slotDate.getHours() + slotDate.getMinutes() / 60;
      const start = toHours(schedule.startTime);
      const end = toHours(schedule.endTime);

      if (slotHour < start || slotHour >= end) {
        props.className = cn(baseClass, "tbk-slot-off");
      }

      return props;
    },
    [scheduleMap],
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
            backgroundColor: "var(--tbk-block-bg, #f1f5f9)",
            border: "2px dashed var(--tbk-block-border, #94a3b8)",
            color: "var(--tbk-block-text, #475569)",
            fontSize: "12px",
            padding: "2px 6px",
            opacity: 0.85,
          },
          className: "tbk-block-event",
          "data-block": "true",
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
      const isDraggable = !NON_DRAGGABLE_STATUSES.includes(evt.status);

      return {
        style: {
          backgroundColor: color,
          border: "none",
          borderRadius: "4px",
          color: "white",
          fontSize: "12px",
          padding: "2px 6px",
          cursor: isDraggable ? "grab" : "default",
          opacity: NON_DRAGGABLE_STATUSES.includes(evt.status) ? 0.45 : 1,
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

  // Staged reschedule banner text
  const bannerEvent = stagedReschedule
    ? events.find((e) => e.id === stagedReschedule.eventId)
    : null;

  return (
    <div
      ref={calendarRef}
      className={cn("tbk-kiosk-calendar", `tbk-view-${view}`, className)}
      style={style}
    >
      {/* ── Reschedule Confirmation Banner (WP3) ── */}
      {stagedReschedule && bannerEvent && (
        <div className="tbk-reschedule-banner" role="alert">
          <span>
            Move <strong>{bannerEvent.customerName}</strong> from{" "}
            {formatTime(stagedReschedule.originalStart)} to{" "}
            {formatTime(stagedReschedule.newStart)}
            {stagedReschedule.resourceId &&
              stagedReschedule.resourceId !== bannerEvent.resourceId &&
              ` (${resources?.find((r) => r.id === stagedReschedule.resourceId)?.title ?? "new resource"})`}
            ?
          </span>
          <div className="tbk-reschedule-banner-actions">
            <button
              type="button"
              className="tbk-reschedule-confirm"
              onClick={() => handleRescheduleConfirm()}
              disabled={isConfirming}
            >
              {isConfirming ? "Moving..." : "Confirm"}
            </button>
            <button
              type="button"
              className="tbk-reschedule-cancel"
              onClick={handleRescheduleCancel}
              disabled={isConfirming}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="tbk-kiosk-toolbar">
        {/* Left: navigation */}
        <div className="tbk-kiosk-nav">
          <button
            type="button"
            className="tbk-button-secondary"
            onClick={() => handleNavigate("prev")}
            aria-label="Previous"
          >
            &lsaquo;
          </button>
          <button
            type="button"
            className="tbk-button-secondary"
            onClick={() => handleNavigate("today")}
          >
            Today
          </button>
          <button
            type="button"
            className="tbk-button-secondary"
            onClick={() => handleNavigate("next")}
            aria-label="Next"
          >
            &rsaquo;
          </button>
        </div>

        {/* Centre: date heading + week-view resource picker */}
        <div className="tbk-kiosk-centre">
          <h2 className="tbk-kiosk-date">{dateHeading}</h2>

          {/*
           * Resource picker: only rendered in week view when multiple
           * resources exist. In day view the resource columns are already
           * visible, so a picker would be redundant. In solo mode there
           * is nothing to pick.
           */}
          {view === "week" && hasMultipleResources && (
            <div className="tbk-resource-picker" role="tablist">
              {resources!.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedResourceId === r.id}
                  className={cn(
                    "tbk-resource-pill",
                    selectedResourceId === r.id && "tbk-resource-pill-active",
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
        <div className="tbk-kiosk-view-switcher">
          {(["day", "week"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={cn(
                "tbk-button-secondary",
                view === v && "tbk-button-active",
              )}
              onClick={() => handleViewSwitch(v)}
            >
              {v === "day" ? "Day" : "Week"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Calendar ── */}
      <DnDCalendar
        localizer={localizer}
        events={calendarEvents}
        view={view}
        date={date}
        onView={setView}
        onNavigate={setDate}
        onSelectEvent={handleSelectEvent as any}
        onSelectSlot={handleSelectSlot as any}
        eventPropGetter={defaultEventStyleGetter as any}
        slotPropGetter={slotPropGetter as any}
        toolbar={false}
        selectable
        step={15}
        timeslots={4}
        min={new Date(1970, 0, 1, dayStartHour, 0, 0)}
        max={new Date(1970, 0, 1, dayEndHour, 0, 0)}
        style={{ height: "calc(100vh - 156px)" }}
        onEventDrop={handleEventDrop as any}
        onEventResize={handleEventResize as any}
        resizable={resizable}
        draggableAccessor={(event: any) => {
          const evt: KioskEvent = event.resource;
          // Non-draggable statuses
          if (NON_DRAGGABLE_STATUSES.includes(evt.status)) return false;
          // WP8: Prevent dragging events on off-resource columns
          if (evt.resourceId && offResourceIds.has(evt.resourceId)) return false;
          return true;
        }}
        // Resources are injected only in day view with multiple resources.
        // In week view this is undefined → clean 7-day grid.
        {...(activeResources
          ? {
              resources: activeResources,
              resourceIdAccessor: "id" as any,
              resourceTitleAccessor: "title" as any,
            }
          : {})}
        components={{
          ...(activeResources
            ? { resourceHeader: ResourceHeader as any }
            : {}),
        }}
      />

      {/* ── Event Detail Popover ── */}
      {selectedEvent && (
        <div
          className="tbk-kiosk-popover"
          role="dialog"
          aria-label="Event details"
        >
          <button
            type="button"
            className="tbk-popover-close"
            onClick={() => setSelectedEvent(null)}
            aria-label="Close"
          >
            &times;
          </button>

          {selectedEvent.isBlock ? (
            <>
              <h3>{selectedEvent.title}</h3>
              <p className="tbk-kiosk-popover-type">
                {selectedEvent.blockType ?? "Block"}
              </p>
              <dl className="tbk-detail-list">
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
              <dl className="tbk-detail-list">
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
