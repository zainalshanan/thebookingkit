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
}

/** Date range for queries */
export interface DateRange {
  start: Date;
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
