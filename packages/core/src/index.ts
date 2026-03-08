// Errors
export {
  BookingConflictError,
  SerializationRetryExhaustedError,
  UnauthorizedError,
  ForbiddenError,
} from "./errors.js";

// Types
export type {
  Slot,
  DateOccurrence,
  SlotComputeOptions,
  DateRange,
  AvailabilityRuleInput,
  AvailabilityOverrideInput,
  BookingInput,
  SlotAvailabilityResult,
} from "./types.js";

// RRULE Parser
export { parseRecurrence, InvalidRRuleError } from "./rrule-parser.js";

// Timezone utilities
export {
  normalizeToUTC,
  utcToLocal,
  isValidTimezone,
  getTimezoneOffset,
  InvalidTimezoneError,
} from "./timezone.js";

// Slot Engine
export { getAvailableSlots, isSlotAvailable } from "./slot-engine.js";

// Booking Limits
export {
  computeBookingLimits,
  filterSlotsByLimits,
  type BookingLimitsConfig,
  type LimitStatus,
} from "./booking-limits.js";

// Event Types
export {
  validateEventType,
  generateSlug,
  validateQuestionResponses,
  EventTypeValidationError,
  type BookingQuestion,
  type QuestionFieldType,
} from "./event-types.js";

// Confirmation Mode
export {
  getInitialBookingStatus,
  getAutoRejectDeadline,
  isPendingBookingOverdue,
  CONFIRMATION_TIMEOUT_HOURS,
  type BookingStatus,
  type AutoRejectPayload,
  type BookingStatusChangePayload,
} from "./confirmation-mode.js";

// Routing Forms
export {
  validateRoutingForm,
  evaluateRoutingRules,
  validateRoutingResponses,
  computeRoutingAnalytics,
  RoutingFormValidationError,
  type RoutingFieldType,
  type RoutingField,
  type RoutingOperator,
  type RoutingCondition,
  type RoutingLogic,
  type RoutingRule,
  type RoutingFormDefinition,
  type RoutingResponses,
  type RoutingResult,
  type RoutingAnalytics,
  type RoutingSubmission,
} from "./routing-forms.js";

// Payments
export {
  evaluateCancellationFee,
  validateCancellationPolicy,
  computePaymentSummary,
  requiresPayment,
  hasNoShowFee,
  validatePaymentAmount,
  validateCurrency,
  formatPaymentAmount,
  PaymentValidationError,
  type CancellationPolicy,
  type CancellationPolicyTier,
  type CancellationFeeResult,
  type PaymentRecord,
  type PaymentSummary,
  type PaymentType,
  type HoldStatus,
} from "./payments.js";

// Team Scheduling
export {
  getTeamSlots,
  assignHost,
  resolveManagedEventType,
  isFieldLocked,
  propagateTemplateChanges,
  type AssignmentStrategy,
  type TeamMemberInput,
  type TeamSlot,
  type MemberBookingCount,
  type AssignmentResult,
  type ManagedFieldLock,
  type ManagedEventTypeTemplate,
  type MemberEventTypeOverride,
  type ResolvedManagedEventType,
} from "./team-scheduling.js";

// Recurring Bookings
export {
  generateOccurrences,
  checkRecurringAvailability,
  cancelFutureOccurrences,
  isValidFrequency,
  RecurringBookingError,
  type RecurringFrequency,
  type RecurringSeriesInput,
  type RecurringOccurrence,
  type RecurringAvailabilityResult,
  type SeriesBooking,
  type SeriesCancellationResult,
} from "./recurring-bookings.js";

// Seats / Group Bookings
export {
  computeSeatAvailability,
  canReserveSeat,
  isGroupEvent,
  computeGroupEventSummary,
  formatSeatCount,
  validateSeatReservation,
  SeatError,
  type SeatAttendee,
  type SeatAvailability,
  type GroupEventSummary,
} from "./seats.js";

// Embed
export {
  validateEmbedConfig,
  generateEmbedSnippet,
  generateAllSnippets,
  buildEmbedUrl,
  EmbedConfigError,
  type EmbedMode,
  type EmbedBranding,
  type EmbedConfig,
  type EmbedSnippet,
} from "./embed.js";
