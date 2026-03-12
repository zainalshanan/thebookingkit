/**
 * Kiosk Mode & Interactive Schedule Management (E-20)
 *
 * Configuration, validation, and utilities for the kiosk calendar view.
 * Handles display settings, reschedule validation, break management,
 * and multi-provider resource views.
 *
 * @module kiosk
 */

import { addMinutes, areIntervalsOverlapping } from "date-fns";
import { isSlotAvailable } from "./slot-engine.js";
import type {
  AvailabilityRuleInput,
  AvailabilityOverrideInput,
  BookingInput,
} from "./types.js";

// ---------------------------------------------------------------------------
// Kiosk Settings (E20-S02)
// ---------------------------------------------------------------------------

/** Block density mode for calendar event display */
export type BlockDensityMode = "compact" | "standard" | "detailed";

/** Color coding mode for calendar blocks */
export type ColorCodingMode = "status" | "event_type" | "source";

/** Kiosk calendar view type */
export type KioskViewType = "day" | "3day" | "week";

/** Fields that can be shown on calendar blocks */
export interface KioskFieldVisibility {
  /** Show customer name (default: true) */
  customerName: boolean;
  /** Show customer email (default: false) */
  customerEmail: boolean;
  /** Show customer phone (default: false) */
  customerPhone: boolean;
  /** Show service/event type name (default: true) */
  serviceName: boolean;
  /** Show booking status (default: true) */
  bookingStatus: boolean;
  /** Show price (default: false) */
  price: boolean;
  /** Show location (default: true) */
  location: boolean;
  /** Show booking notes (default: false) */
  notes: boolean;
  /** Show custom question responses (default: false) */
  customResponses: boolean;
}

/** Full kiosk display settings */
export interface KioskSettings {
  /** Default calendar view */
  defaultView: KioskViewType;
  /** Block density */
  blockDensity: BlockDensityMode;
  /** Color coding mode */
  colorCoding: ColorCodingMode;
  /** Fields shown on compact block view */
  compactFields: Partial<KioskFieldVisibility>;
  /** Fields shown on expanded detail popover */
  detailFields: Partial<KioskFieldVisibility>;
  /** Auto-lock timeout in minutes (0 = disabled) */
  autoLockMinutes: number;
  /** PIN hash for kiosk lock (empty = no PIN required) */
  pinHash: string;
  /** Show walk-in queue sidebar */
  showWalkInSidebar: boolean;
  /** Time slot height in pixels (for zoom) */
  slotHeightPx: number;
  /** Start hour for day view (0-23) */
  dayStartHour: number;
  /** End hour for day view (0-23) */
  dayEndHour: number;
}

/** Default field visibility */
const DEFAULT_COMPACT_FIELDS: KioskFieldVisibility = {
  customerName: true,
  customerEmail: false,
  customerPhone: false,
  serviceName: true,
  bookingStatus: false,
  price: false,
  location: false,
  notes: false,
  customResponses: false,
};

/** Default detail popover fields */
const DEFAULT_DETAIL_FIELDS: KioskFieldVisibility = {
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  serviceName: true,
  bookingStatus: true,
  price: true,
  location: true,
  notes: true,
  customResponses: true,
};

/** Default kiosk settings */
export const DEFAULT_KIOSK_SETTINGS: KioskSettings = {
  defaultView: "day",
  blockDensity: "standard",
  colorCoding: "status",
  compactFields: DEFAULT_COMPACT_FIELDS,
  detailFields: DEFAULT_DETAIL_FIELDS,
  autoLockMinutes: 5,
  pinHash: "",
  showWalkInSidebar: true,
  slotHeightPx: 48,
  dayStartHour: 6,
  dayEndHour: 22,
};

/**
 * Validate kiosk settings structure.
 *
 * @param settings - Settings to validate
 * @returns Validation result with errors
 */
export function validateKioskSettings(settings: Partial<KioskSettings>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (
    settings.defaultView &&
    !["day", "3day", "week"].includes(settings.defaultView)
  ) {
    errors.push(
      `Invalid defaultView: "${settings.defaultView}". Must be "day", "3day", or "week".`,
    );
  }

  if (
    settings.blockDensity &&
    !["compact", "standard", "detailed"].includes(settings.blockDensity)
  ) {
    errors.push(
      `Invalid blockDensity: "${settings.blockDensity}". Must be "compact", "standard", or "detailed".`,
    );
  }

  if (
    settings.colorCoding &&
    !["status", "event_type", "source"].includes(settings.colorCoding)
  ) {
    errors.push(
      `Invalid colorCoding: "${settings.colorCoding}". Must be "status", "event_type", or "source".`,
    );
  }

  if (settings.autoLockMinutes !== undefined) {
    if (settings.autoLockMinutes < 0) {
      errors.push("autoLockMinutes must be >= 0.");
    }
  }

  if (settings.slotHeightPx !== undefined) {
    if (settings.slotHeightPx < 20 || settings.slotHeightPx > 200) {
      errors.push("slotHeightPx must be between 20 and 200.");
    }
  }

  if (settings.dayStartHour !== undefined) {
    if (settings.dayStartHour < 0 || settings.dayStartHour > 23) {
      errors.push("dayStartHour must be between 0 and 23.");
    }
  }

  if (settings.dayEndHour !== undefined) {
    if (settings.dayEndHour < 1 || settings.dayEndHour > 24) {
      errors.push("dayEndHour must be between 1 and 24.");
    }
    if (
      settings.dayStartHour !== undefined &&
      settings.dayEndHour <= settings.dayStartHour
    ) {
      errors.push("dayEndHour must be greater than dayStartHour.");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Merge provider kiosk settings with organizational defaults.
 *
 * Provider settings take precedence over org defaults.
 *
 * @param providerSettings - Provider-level settings (partial)
 * @param orgDefaults - Organization-level defaults (partial)
 * @returns Fully resolved kiosk settings
 */
export function resolveKioskSettings(
  providerSettings?: Partial<KioskSettings>,
  orgDefaults?: Partial<KioskSettings>,
): KioskSettings {
  return {
    ...DEFAULT_KIOSK_SETTINGS,
    ...orgDefaults,
    ...providerSettings,
    compactFields: {
      ...DEFAULT_COMPACT_FIELDS,
      ...orgDefaults?.compactFields,
      ...providerSettings?.compactFields,
    },
    detailFields: {
      ...DEFAULT_DETAIL_FIELDS,
      ...orgDefaults?.detailFields,
      ...providerSettings?.detailFields,
    },
  };
}

// ---------------------------------------------------------------------------
// Reschedule Validation (E20-S04)
// ---------------------------------------------------------------------------

/** Result of a reschedule validation */
export interface RescheduleValidation {
  /** Whether the reschedule is allowed */
  valid: boolean;
  /** Reason if not valid */
  reason?: "conflict" | "outside_availability" | "buffer_conflict" | "blocked_date" | "invalid_status";
  /** Conflicting booking details if reason is 'conflict' */
  conflictDetails?: {
    bookingId: string;
    startsAt: Date;
    endsAt: Date;
  };
}

/** Booking status values that cannot be rescheduled */
const NON_RESCHEDULABLE_STATUSES = [
  "completed",
  "cancelled",
  "no_show",
  "rejected",
] as const;

/**
 * Validate whether a booking can be rescheduled to a new time.
 *
 * Checks conflicts, availability, and buffer time without actually
 * performing the reschedule.
 *
 * @param bookingStatus - Current booking status
 * @param rules - Provider's availability rules
 * @param overrides - Provider's availability overrides
 * @param existingBookings - Other bookings for the provider (excluding the one being rescheduled)
 * @param newStart - Proposed new start time
 * @param newEnd - Proposed new end time
 * @param bufferBefore - Buffer before in minutes
 * @param bufferAfter - Buffer after in minutes
 * @returns Validation result
 */
export function validateReschedule(
  bookingStatus: string,
  rules: AvailabilityRuleInput[],
  overrides: AvailabilityOverrideInput[],
  existingBookings: Array<BookingInput & { id?: string }>,
  newStart: Date,
  newEnd: Date,
  bufferBefore: number = 0,
  bufferAfter: number = 0,
): RescheduleValidation {
  // Check if the booking can be rescheduled based on status
  if (
    NON_RESCHEDULABLE_STATUSES.includes(
      bookingStatus as (typeof NON_RESCHEDULABLE_STATUSES)[number],
    )
  ) {
    return { valid: false, reason: "invalid_status" };
  }

  // Check availability at the new time
  const availability = isSlotAvailable(
    rules,
    overrides,
    existingBookings,
    newStart,
    newEnd,
    bufferBefore,
    bufferAfter,
  );

  if (!availability.available) {
    const reason = availability.reason;

    // Try to find the specific conflicting booking
    if (reason === "already_booked" || reason === "buffer_conflict") {
      const activeBookings = existingBookings.filter(
        (b) => b.status !== "cancelled" && b.status !== "rejected",
      );
      for (const booking of activeBookings) {
        const bookingStartWithBuffer = addMinutes(
          booking.startsAt,
          -bufferBefore,
        );
        const bookingEndWithBuffer = addMinutes(booking.endsAt, bufferAfter);

        if (
          areIntervalsOverlapping(
            { start: newStart, end: newEnd },
            { start: bookingStartWithBuffer, end: bookingEndWithBuffer },
          )
        ) {
          return {
            valid: false,
            reason: reason === "already_booked" ? "conflict" : "buffer_conflict",
            conflictDetails: {
              bookingId: (booking as BookingInput & { id?: string }).id ?? "unknown",
              startsAt: booking.startsAt,
              endsAt: booking.endsAt,
            },
          };
        }
      }
    }

    return {
      valid: false,
      reason: reason as RescheduleValidation["reason"],
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Break / Block Types (E20-S03)
// ---------------------------------------------------------------------------

/** Types of time blocks a provider can create */
export type BlockType = "break" | "personal" | "meeting" | "closed";

/** Input for creating a break/block on the calendar */
export interface BreakBlockInput {
  /** Title (e.g., "Lunch Break") */
  title: string;
  /** Start time */
  startTime: Date;
  /** End time */
  endTime: Date;
  /** Type of block */
  blockType: BlockType;
  /** Whether this recurs daily for the rest of the week */
  recurring: boolean;
}

/**
 * Validate a break/block against existing bookings.
 *
 * @param block - The proposed break/block
 * @param existingBookings - Active bookings for the provider
 * @returns Validation result
 */
export function validateBreakBlock(
  block: BreakBlockInput,
  existingBookings: BookingInput[],
): { valid: boolean; conflictingBookings: BookingInput[] } {
  if (block.endTime <= block.startTime) {
    return { valid: false, conflictingBookings: [] };
  }

  const activeBookings = existingBookings.filter(
    (b) =>
      b.status !== "cancelled" &&
      b.status !== "rejected" &&
      b.status !== "no_show",
  );

  const conflicts = activeBookings.filter((booking) =>
    areIntervalsOverlapping(
      { start: block.startTime, end: block.endTime },
      { start: booking.startsAt, end: booking.endsAt },
    ),
  );

  return {
    valid: conflicts.length === 0,
    conflictingBookings: conflicts,
  };
}

/**
 * Convert a break/block to an availability override for storage.
 *
 * @param block - The break/block to convert
 * @param providerTimezone - Provider's timezone for date extraction
 * @returns An AvailabilityOverrideInput for the DB
 */
export function breakBlockToOverride(
  block: BreakBlockInput,
): AvailabilityOverrideInput {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: block.startTime,
    isUnavailable: true,
    startTime: `${pad(block.startTime.getHours())}:${pad(block.startTime.getMinutes())}`,
    endTime: `${pad(block.endTime.getHours())}:${pad(block.endTime.getMinutes())}`,
  };
}

// ---------------------------------------------------------------------------
// Multi-Provider Kiosk (E20-S06)
// ---------------------------------------------------------------------------

/** Provider info for kiosk resource view */
export interface KioskProvider {
  /** Provider ID */
  id: string;
  /** Display name */
  displayName: string;
  /** Whether currently accepting walk-ins */
  acceptingWalkIns: boolean;
  /** Walk-in queue count */
  queueCount: number;
  /** Whether this column is visible */
  visible: boolean;
}

/**
 * Filter providers for the kiosk resource view.
 *
 * @param providers - All available providers
 * @param visibleIds - IDs of providers to show (empty = show all)
 * @returns Filtered and annotated provider list
 */
export function resolveKioskProviders(
  providers: Omit<KioskProvider, "visible">[],
  visibleIds?: string[],
): KioskProvider[] {
  return providers.map((p) => ({
    ...p,
    visible: visibleIds ? visibleIds.includes(p.id) : true,
  }));
}
