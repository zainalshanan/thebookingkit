// Errors
export {
  BookingConflictError,
  SerializationRetryExhaustedError,
  UnauthorizedError,
  ForbiddenError,
} from "./errors.js";

// Serialization retry utility
export {
  withSerializableRetry,
  type SerializableRetryOptions,
} from "./serialization-retry.js";

// Auth middleware & adapters
export {
  withAuth,
  assertProviderOwnership,
  assertCustomerAccess,
  type AuthUser,
  type AuthSession,
  type AuthAdapter,
  type AuthenticatedRequest,
  type WithAuthOptions,
} from "./auth.js";

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

// Booking Tokens
export {
  generateBookingToken,
  verifyBookingToken,
} from "./booking-tokens.js";

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

// Adapters
export type {
  EmailAdapter,
  SendEmailOptions,
  EmailResult,
  EmailDeliveryStatus,
  EmailAttachment,
  CalendarAdapter,
  CalendarEventOptions,
  CalendarEventResult,
  CalendarConflict,
  JobAdapter,
  StorageAdapter,
} from "./adapters/index.js";
export { generateICSAttachment, JOB_NAMES } from "./adapters/index.js";

// Notification Jobs
export {
  sendConfirmationEmail,
  sendReminderEmail,
  sendCancellationEmail,
  sendRescheduleEmail,
  scheduleAutoReject,
  syncBookingToCalendar,
  deleteBookingFromCalendar,
  formatDateTimeForEmail,
  formatDurationForEmail,
  type NotificationBookingData,
  type ConfirmationEmailPayload,
  type ReminderEmailPayload,
  type CancellationEmailPayload,
  type RescheduleEmailPayload,
  type CalendarSyncPayload,
  type CalendarDeletePayload,
  type AutoRejectPendingPayload,
} from "./notification-jobs.js";

// Email Templates
export {
  interpolateTemplate,
  CONFIRMATION_EMAIL_HTML,
  CONFIRMATION_EMAIL_TEXT,
  REMINDER_EMAIL_HTML,
  CANCELLATION_EMAIL_HTML,
  RESCHEDULE_EMAIL_HTML,
  type EmailTemplateVars,
} from "./email-templates.js";

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
