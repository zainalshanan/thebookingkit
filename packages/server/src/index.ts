// Re-export core errors used by server modules
export {
  BookingConflictError,
  SerializationRetryExhaustedError,
  UnauthorizedError,
  ForbiddenError,
} from "@slotkit/core";

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

// Booking Tokens
export {
  generateBookingToken,
  verifyBookingToken,
} from "./booking-tokens.js";

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

// Multi-Tenancy
export {
  resolveEffectiveSettings,
  getRolePermissions,
  roleHasPermission,
  assertOrgPermission,
  assertTenantScope,
  buildOrgBookingUrl,
  parseOrgBookingPath,
  TenantAuthorizationError,
  GLOBAL_DEFAULTS,
  type OrgRole,
  type OrgMember,
  type OrgBranding,
  type OrgSettings,
  type ProviderSettings,
  type EventTypeSettings,
  type GlobalDefaults,
  type ResolvedSettings,
  type OrgPermission,
} from "./multi-tenancy.js";
