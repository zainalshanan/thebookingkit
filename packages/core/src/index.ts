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
  SmsAdapter,
  SendSmsOptions,
  SmsResult,
  PaymentAdapter,
  CreatePaymentIntentOptions,
  CreatePaymentIntentResult,
  CreateSetupIntentOptions,
  CreateSetupIntentResult,
  CaptureResult,
  RefundResult,
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

// Workflows
export {
  resolveTemplateVariables,
  evaluateConditions,
  validateWorkflow,
  matchWorkflows,
  DEFAULT_TEMPLATES,
  TEMPLATE_VARIABLES,
  WorkflowValidationError,
  type WorkflowTrigger,
  type WorkflowActionType,
  type ConditionOperator,
  type WorkflowCondition,
  type EmailActionConfig,
  type SmsActionConfig,
  type WebhookActionConfig,
  type StatusUpdateActionConfig,
  type CalendarEventActionConfig,
  type WorkflowAction,
  type WorkflowDefinition,
  type WorkflowContext,
  type WorkflowLogEntry,
} from "./workflows.js";

// Webhooks
export {
  signWebhookPayload,
  verifyWebhookSignature,
  createWebhookEnvelope,
  resolvePayloadTemplate,
  matchWebhookSubscriptions,
  getRetryDelay,
  isSuccessResponse,
  validateWebhookSubscription,
  WebhookValidationError,
  DEFAULT_RETRY_CONFIG,
  WEBHOOK_TRIGGERS,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  DEFAULT_TOLERANCE_SECONDS,
  type WebhookTrigger,
  type WebhookAttendee,
  type WebhookPayload,
  type WebhookEnvelope,
  type WebhookSubscription,
  type WebhookDeliveryResult,
  type WebhookRetryConfig,
  type WebhookVerificationResult,
} from "./webhooks.js";

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

// REST API Utilities
export {
  createErrorResponse,
  createSuccessResponse,
  createPaginatedResponse,
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  hasScope,
  isKeyExpired,
  checkRateLimit,
  encodeCursor,
  decodeCursor,
  validateSlotQueryParams,
  parseSortParam,
  API_ERROR_CODES,
  type ApiError,
  type ApiErrorResponse,
  type ApiSuccessResponse,
  type ApiMeta,
  type PaginatedResponse,
  type ApiErrorCode,
  type ApiKeyRecord,
  type ApiKeyScope,
  type GeneratedApiKey,
  type RateLimitState,
  type RateLimitResult,
  type ValidationDetail,
  type ValidationResult,
} from "./api.js";

// CLI Utilities
export {
  COMPONENT_REGISTRY,
  findComponent,
  resolveComponentDependencies,
  listComponents,
  createManifestEntry,
  hasLocalModifications,
  generateSlotkitConfig,
  generateEnvTemplate,
  parseMigrationFiles,
  getPendingMigrations,
  DEFAULT_MANIFEST,
  type ComponentRegistryEntry,
  type ManifestEntry,
  type SlotKitManifest,
  type SlotKitConfig,
  type MigrationFile,
} from "./cli.js";
