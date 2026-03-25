// Schema exports — all tables, enums, and inferred types
export * from "./schema/index.js";

// ---------------------------------------------------------------------------
// Enum union types — derived from pgEnum definitions for use without Drizzle
// ---------------------------------------------------------------------------
import {
  bookingStatusEnum,
  paymentStatusEnum,
  bookingEventTypeEnum,
  paymentTypeEnum,
  locationTypeEnum,
  assignmentStrategyEnum,
  teamMemberRoleEnum,
  questionFieldTypeEnum,
  recurringFrequencyEnum,
  seatStatusEnum,
  workflowTriggerEnum,
  workflowActionTypeEnum,
  emailDeliveryStatusEnum,
  bookingSourceEnum,
  walkInStatusEnum,
} from "./schema/index.js";

/** Union of all valid booking status values as stored in the database */
export type BookingStatusDb = (typeof bookingStatusEnum.enumValues)[number];
/** Union of all valid payment status values as stored in the database */
export type PaymentStatusDb = (typeof paymentStatusEnum.enumValues)[number];
/** Union of all valid booking event type values as stored in the database */
export type BookingEventTypeDb = (typeof bookingEventTypeEnum.enumValues)[number];
/** Union of all valid payment type values as stored in the database */
export type PaymentTypeDb = (typeof paymentTypeEnum.enumValues)[number];
/** Union of all valid location type values as stored in the database */
export type LocationTypeDb = (typeof locationTypeEnum.enumValues)[number];
/** Union of all valid assignment strategy values as stored in the database */
export type AssignmentStrategyDb = (typeof assignmentStrategyEnum.enumValues)[number];
/** Union of all valid team member role values as stored in the database */
export type TeamMemberRoleDb = (typeof teamMemberRoleEnum.enumValues)[number];
/** Union of all valid question field type values as stored in the database */
export type QuestionFieldTypeDb = (typeof questionFieldTypeEnum.enumValues)[number];
/** Union of all valid recurring frequency values as stored in the database */
export type RecurringFrequencyDb = (typeof recurringFrequencyEnum.enumValues)[number];
/** Union of all valid seat status values as stored in the database */
export type SeatStatusDb = (typeof seatStatusEnum.enumValues)[number];
/** Union of all valid workflow trigger values as stored in the database */
export type WorkflowTriggerDb = (typeof workflowTriggerEnum.enumValues)[number];
/** Union of all valid workflow action type values as stored in the database */
export type WorkflowActionTypeDb = (typeof workflowActionTypeEnum.enumValues)[number];
/** Union of all valid email delivery status values as stored in the database */
export type EmailDeliveryStatusDb = (typeof emailDeliveryStatusEnum.enumValues)[number];
/** Union of all valid booking source values as stored in the database */
export type BookingSourceDb = (typeof bookingSourceEnum.enumValues)[number];
/** Union of all valid walk-in status values as stored in the database */
export type WalkInStatusDb = (typeof walkInStatusEnum.enumValues)[number];

// Database client
export { createDb, type Database } from "./client.js";

// Migration runner
export { runCustomMigrations } from "./migrate.js";

// ---------------------------------------------------------------------------
// Inferred TypeScript types from Drizzle schema
// ---------------------------------------------------------------------------
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import {
  organizations,
  teams,
  teamMembers,
  providers,
  eventTypes,
  availabilityRules,
  availabilityOverrides,
  outOfOffice,
  bookings,
  bookingEvents,
  bookingQuestionsResponses,
  bookingSeats,
  recurringBookings,
  payments,
  routingForms,
  routingSubmissions,
  workflows,
  workflowLogs,
  webhooks,
  webhookDeliveries,
  emailDeliveryLog,
  customerPreferences,
  walkInQueue,
  resources,
  resourceAvailabilityRules,
  resourceAvailabilityOverrides,
} from "./schema/index.js";

// --- Select types (read from DB) ---
export type Organization = InferSelectModel<typeof organizations>;
export type Team = InferSelectModel<typeof teams>;
export type TeamMember = InferSelectModel<typeof teamMembers>;
export type Provider = InferSelectModel<typeof providers>;
export type EventType = InferSelectModel<typeof eventTypes>;
export type AvailabilityRule = InferSelectModel<typeof availabilityRules>;
export type AvailabilityOverride = InferSelectModel<typeof availabilityOverrides>;
export type OutOfOffice = InferSelectModel<typeof outOfOffice>;
export type Booking = InferSelectModel<typeof bookings>;
export type BookingEvent = InferSelectModel<typeof bookingEvents>;
export type BookingQuestionResponse = InferSelectModel<typeof bookingQuestionsResponses>;
export type BookingSeat = InferSelectModel<typeof bookingSeats>;
export type RecurringBooking = InferSelectModel<typeof recurringBookings>;
export type Payment = InferSelectModel<typeof payments>;
export type RoutingForm = InferSelectModel<typeof routingForms>;
export type RoutingSubmission = InferSelectModel<typeof routingSubmissions>;
export type Workflow = InferSelectModel<typeof workflows>;
export type WorkflowLog = InferSelectModel<typeof workflowLogs>;
export type Webhook = InferSelectModel<typeof webhooks>;
export type WebhookDelivery = InferSelectModel<typeof webhookDeliveries>;
export type EmailDeliveryLogEntry = InferSelectModel<typeof emailDeliveryLog>;
export type CustomerPreference = InferSelectModel<typeof customerPreferences>;
export type WalkInQueue = InferSelectModel<typeof walkInQueue>;
export type Resource = InferSelectModel<typeof resources>;
export type ResourceAvailabilityRule = InferSelectModel<typeof resourceAvailabilityRules>;
export type ResourceAvailabilityOverride = InferSelectModel<typeof resourceAvailabilityOverrides>;

// --- Insert types (write to DB) ---
export type NewOrganization = InferInsertModel<typeof organizations>;
export type NewTeam = InferInsertModel<typeof teams>;
export type NewTeamMember = InferInsertModel<typeof teamMembers>;
export type NewProvider = InferInsertModel<typeof providers>;
export type NewEventType = InferInsertModel<typeof eventTypes>;
export type NewAvailabilityRule = InferInsertModel<typeof availabilityRules>;
export type NewAvailabilityOverride = InferInsertModel<typeof availabilityOverrides>;
export type NewOutOfOffice = InferInsertModel<typeof outOfOffice>;
export type NewBooking = InferInsertModel<typeof bookings>;
export type NewBookingEvent = InferInsertModel<typeof bookingEvents>;
export type NewBookingQuestionResponse = InferInsertModel<typeof bookingQuestionsResponses>;
export type NewBookingSeat = InferInsertModel<typeof bookingSeats>;
export type NewRecurringBooking = InferInsertModel<typeof recurringBookings>;
export type NewPayment = InferInsertModel<typeof payments>;
export type NewRoutingForm = InferInsertModel<typeof routingForms>;
export type NewRoutingSubmission = InferInsertModel<typeof routingSubmissions>;
export type NewWorkflow = InferInsertModel<typeof workflows>;
export type NewWorkflowLog = InferInsertModel<typeof workflowLogs>;
export type NewWebhook = InferInsertModel<typeof webhooks>;
export type NewWebhookDelivery = InferInsertModel<typeof webhookDeliveries>;
export type NewEmailDeliveryLogEntry = InferInsertModel<typeof emailDeliveryLog>;
export type NewCustomerPreference = InferInsertModel<typeof customerPreferences>;
export type NewWalkInQueue = InferInsertModel<typeof walkInQueue>;
export type NewResource = InferInsertModel<typeof resources>;
export type NewResourceAvailabilityRule = InferInsertModel<typeof resourceAvailabilityRules>;
export type NewResourceAvailabilityOverride = InferInsertModel<typeof resourceAvailabilityOverrides>;
