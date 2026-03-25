/** A computed time slot available for booking */
export interface Slot {
  /** Start time in UTC ISO-8601 */
  startTime: string;
  /** End time in UTC ISO-8601 */
  endTime: string;
  /** Start time formatted in the customer's local timezone */
  localStart: string;
  /** End time formatted in the customer's local timezone */
  localEnd: string;
  /** Release metadata populated only by the `discount_incentive` strategy (E-23) */
  releaseMetadata?: { discountPercent: number };
}

/** A date occurrence from RRULE expansion */
export interface DateOccurrence {
  /** The date of the occurrence (YYYY-MM-DD) */
  date: string;
  /** Start time (HH:mm) */
  startTime: string;
  /** End time (HH:mm) */
  endTime: string;
}

/** Options for slot computation */
export interface SlotComputeOptions {
  /** Slot duration in minutes */
  duration?: number;
  /** Buffer time in minutes before each slot */
  bufferBefore?: number;
  /** Buffer time in minutes after each slot */
  bufferAfter?: number;
  /** Filter slots for a specific event type */
  eventTypeId?: string;
  /** Slot interval in minutes (default: same as duration) */
  slotInterval?: number;
  /**
   * The reference point for filtering out past slots.
   * Defaults to `new Date()` when omitted. Inject an explicit value in tests
   * or server-side rendering to make slot generation fully deterministic.
   */
  now?: Date;
  /**
   * Slot release strategy controlling when slots become visible to customers.
   * Omit (or leave `undefined`) to preserve default behavior — all available
   * slots are returned with no additional filtering or annotation.
   *
   * Three strategies are supported:
   * - `"rolling_window"` — hide slots beyond a sliding time horizon from now.
   * - `"fill_earlier_first"` — unlock later windows only once earlier windows
   *   reach a fill-rate threshold.
   * - `"discount_incentive"` — return all slots but annotate slow-filling
   *   windows with a discount percentage via `Slot.releaseMetadata`.
   *
   * @see SlotReleaseConfig
   */
  slotRelease?: SlotReleaseConfig;
}

/**
 * Date range for slot queries.
 *
 * Both `start` and `end` **must be UTC Date objects**. The RRULE expansion
 * uses `start` as `dtstart`, which determines the time-of-day reference for
 * generated occurrences. Passing local-time dates (e.g. constructed without
 * a `Z` suffix on a non-UTC server) will shift the RRULE boundary and can
 * cause occurrences to be silently excluded.
 *
 * @example
 * ```ts
 * // Correct — explicit UTC
 * const dateRange = {
 *   start: new Date("2026-03-09T00:00:00.000Z"),
 *   end:   new Date("2026-03-09T23:59:59.999Z"),
 * };
 *
 * // Also correct
 * const day = new Date(Date.UTC(2026, 2, 9));
 * const dateRange = {
 *   start: day,
 *   end:   new Date(Date.UTC(2026, 2, 9, 23, 59, 59, 999)),
 * };
 *
 * // WRONG — on a non-UTC server this silently shifts the range
 * const dateRange = {
 *   start: new Date("2026-03-09T00:00:00"),   // parsed as local time!
 *   end:   new Date("2026-03-09T23:59:59"),
 * };
 * ```
 */
export interface DateRange {
  /** Start of range — must be a UTC Date */
  start: Date;
  /** End of range — must be a UTC Date */
  end: Date;
}

/** Availability rule as stored in the database */
export interface AvailabilityRuleInput {
  rrule: string;
  startTime: string;
  endTime: string;
  timezone: string;
  validFrom?: Date | null;
  validUntil?: Date | null;
}

/** Availability override as stored in the database */
export interface AvailabilityOverrideInput {
  date: Date;
  startTime?: string | null;
  endTime?: string | null;
  isUnavailable: boolean;
}

/** Existing booking for conflict checking */
export interface BookingInput {
  startsAt: Date;
  endsAt: Date;
  status: string;
  /** Resource ID for resource-based bookings. Omit for provider-only mode. */
  resourceId?: string;
  /** Number of guests/seats this booking occupies. Defaults to 1. */
  guestCount?: number;
}

// ---------------------------------------------------------------------------
// Conflict Detection Types (Kiosk backport)
// ---------------------------------------------------------------------------

/** Minimal booking shape for overlap/conflict checks */
export interface ConflictCheckBooking {
  /** Booking ID (optional for backward compatibility) */
  id?: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  /** Customer name for human-readable conflict descriptions */
  customerName?: string;
  /** Booking type (e.g. "booking", "break") */
  type?: string;
}

/** A detected conflict returned by findConflicts() */
export interface ConflictDetail {
  /** Booking ID of the conflicting booking */
  bookingId: string;
  startsAt: Date;
  endsAt: Date;
  /** Customer name if available */
  customerName?: string;
  /** Booking type */
  type?: string;
}

/** Result of isSlotAvailable check */
export type SlotAvailabilityResult =
  | { available: true }
  | {
      available: false;
      reason:
        | "outside_availability"
        | "already_booked"
        | "blocked_date"
        | "buffer_conflict";
    };

// ---------------------------------------------------------------------------
// Resource Booking Types (E-22)
// ---------------------------------------------------------------------------

/**
 * A bookable resource (table, room, court, desk) with its scheduling data.
 * Mirrors the `TeamMemberInput` pattern: one entry per physical/virtual unit.
 */
export interface ResourceInput {
  /** Unique identifier for this resource */
  id: string;
  /** Display name of the resource (e.g. "Table 5", "Studio A") */
  name: string;
  /** Free-form category string (e.g. "table", "room", "court", "desk") */
  type: string;
  /** Maximum party size this resource can accommodate (not concurrent bookings) */
  capacity: number;
  /** Whether this resource participates in slot computation */
  isActive: boolean;
  /** Resource availability rules (RRULE-based) */
  rules: AvailabilityRuleInput[];
  /** Resource availability overrides (date-specific exceptions) */
  overrides: AvailabilityOverrideInput[];
  /** Existing bookings on this resource for conflict checking */
  bookings: BookingInput[];
}

/**
 * Alias for an array of `ResourceInput` objects passed to resource slot functions.
 * Represents the full pool of bookable resources.
 */
export type ResourcePoolInput = ResourceInput[];

/** A single available resource within a time slot */
export interface AvailableResource {
  /** Unique identifier of the resource */
  resourceId: string;
  /** Display name of the resource */
  resourceName: string;
  /** Free-form type string (e.g. "table", "room") */
  resourceType: string;
  /** Remaining capacity after accounting for overlapping bookings' guest counts */
  remainingCapacity: number;
}

/** A computed resource slot with available resources attached */
export interface ResourceSlot extends Slot {
  /** Resources still available at this slot, with their remaining capacities */
  availableResources: AvailableResource[];
}

/** Strategy for auto-assigning a resource to a booking */
export type ResourceAssignmentStrategy =
  | "best_fit"
  | "first_available"
  | "round_robin"
  | "largest_first";

/** Result of resource auto-assignment */
export interface ResourceAssignmentResult {
  /** Unique identifier of the assigned resource */
  resourceId: string;
  /** Display name of the assigned resource */
  resourceName: string;
  /** Human-readable reason for the selection (e.g. "best_fit", "round_robin") */
  reason: string;
}

/**
 * Resource slot availability check result.
 *
 * Mirrors the shape of `SlotAvailabilityResult` for developer familiarity,
 * extended with resource-specific failure reasons and remaining capacity.
 */
export type ResourceSlotAvailabilityResult =
  | { available: true; remainingCapacity: number }
  | {
      available: false;
      reason:
        | "outside_availability"
        | "resource_booked"
        | "blocked_date"
        | "buffer_conflict"
        | "resource_inactive";
    };

/** Resource pool summary for a single time slot */
export interface ResourcePoolSummary {
  /** Slot start time in UTC ISO-8601 */
  startTime: string;
  /** Slot end time in UTC ISO-8601 */
  endTime: string;
  /** Slot start formatted in the customer's local timezone */
  localStart: string;
  /** Slot end formatted in the customer's local timezone */
  localEnd: string;
  /** Total number of resources in the pool */
  totalResources: number;
  /** Number of resources still available at this slot */
  availableResources: number;
  /** Percentage of resources currently booked, rounded to the nearest integer */
  utilizationPercent: number;
  /** Per-type breakdown of total vs available resources */
  byType: Record<string, { total: number; available: number }>;
}

/** Options for resource slot computation, extending the base `SlotComputeOptions` */
export interface ResourceSlotOptions extends SlotComputeOptions {
  /** Only include resources that can accommodate at least this many guests */
  minCapacity?: number;
  /** Filter to resources of this type only */
  resourceType?: string;
  /** Assignment strategy used by `assignResource()` (default: "best_fit") */
  strategy?: ResourceAssignmentStrategy;
  /**
   * Past booking counts per resource, used for `round_robin` balancing.
   * Provide `{ resourceId, bookingCount }` entries for each resource.
   */
  pastCounts?: Array<{ resourceId: string; bookingCount: number }>;
  /** Requested party size for `assignResource()` (default: 1) */
  requestedCapacity?: number;
}

// ---------------------------------------------------------------------------
// Slot Release Strategy Types (E-23)
// ---------------------------------------------------------------------------

/**
 * Discriminant string identifying which slot release strategy is active.
 *
 * - `"fill_earlier_first"` — hold later windows until earlier ones fill to a threshold.
 * - `"rolling_window"` — expose only slots within a sliding time horizon from now.
 * - `"discount_incentive"` — show all slots but tag slow-filling windows with a discount.
 */
export type SlotReleaseStrategy =
  | "fill_earlier_first"
  | "rolling_window"
  | "discount_incentive";

/**
 * Configuration for the `fill_earlier_first` release strategy.
 *
 * Partitions each day into time windows delimited by `windowBoundaries` (HH:mm
 * strings in provider local time). Window N+1 remains hidden until window N's
 * fill rate reaches `threshold` percent. Window 0 is always visible.
 *
 * @example
 * ```ts
 * const config: FillEarlierFirstConfig = {
 *   strategy: "fill_earlier_first",
 *   threshold: 70,
 *   windowBoundaries: ["09:00", "12:00", "17:00"],
 * };
 * ```
 */
export interface FillEarlierFirstConfig {
  strategy: "fill_earlier_first";
  /**
   * Percentage (0–100) of earlier-window slots that must be booked before the
   * next window becomes visible. `0` means all windows are always visible;
   * `100` requires every slot in the prior window to be booked.
   */
  threshold: number;
  /**
   * HH:mm time boundaries (in provider timezone) that split each day into
   * windows. Must be in ascending order; validation is the caller's
   * responsibility. For example `["12:00"]` creates two windows: before noon
   * and noon-onwards.
   */
  windowBoundaries: string[];
}

/**
 * Configuration for the `rolling_window` release strategy.
 *
 * Only slots whose `start` falls at or before `now + windowSize` (in the
 * given `unit`) are returned. Slots beyond the horizon are hidden.
 *
 * @example
 * ```ts
 * // Restaurant releasing dinner slots up to 48 hours in advance
 * const config: RollingWindowConfig = {
 *   strategy: "rolling_window",
 *   windowSize: 48,
 *   unit: "hours",
 * };
 * ```
 */
export interface RollingWindowConfig {
  strategy: "rolling_window";
  /** How far ahead (in `unit`) from `now` slots should be visible. */
  windowSize: number;
  /** Unit for `windowSize`. Defaults to `"hours"` when omitted. */
  unit?: "hours" | "days";
}

/**
 * Configuration for the `discount_incentive` release strategy.
 *
 * All slots are returned, but those in windows below the fill-rate thresholds
 * are annotated with a discount percentage via `Slot.releaseMetadata`. The
 * first matching tier (lowest `fillRateBelowPercent` threshold that exceeds the
 * window's actual fill rate) wins.
 *
 * @example
 * ```ts
 * const config: DiscountIncentiveConfig = {
 *   strategy: "discount_incentive",
 *   tiers: [
 *     { fillRateBelowPercent: 30, discountPercent: 20 },
 *     { fillRateBelowPercent: 60, discountPercent: 10 },
 *   ],
 *   windowBoundaries: ["12:00", "17:00"],
 * };
 * ```
 */
export interface DiscountIncentiveConfig {
  strategy: "discount_incentive";
  /**
   * Discount tiers ordered by ascending `fillRateBelowPercent`. The first tier
   * whose threshold exceeds the window's fill rate is applied; subsequent tiers
   * are ignored (first-match-wins).
   */
  tiers: Array<{
    /** Apply this tier when window fill rate is strictly below this percentage */
    fillRateBelowPercent: number;
    /** Discount percentage to attach to slots in the matching window */
    discountPercent: number;
  }>;
  /**
   * HH:mm time boundaries (in provider timezone) used to partition each day
   * into fill-rate windows. When omitted or empty the entire calendar day is
   * treated as a single window.
   */
  windowBoundaries?: string[];
}

/**
 * Discriminated union of all slot release strategy configurations.
 *
 * Pass one of these as `SlotComputeOptions.slotRelease` to activate the
 * corresponding strategy. Omit the field entirely for default behavior (all
 * available slots returned without additional filtering or annotation).
 */
export type SlotReleaseConfig =
  | FillEarlierFirstConfig
  | RollingWindowConfig
  | DiscountIncentiveConfig;
