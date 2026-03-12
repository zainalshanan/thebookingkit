// Schema exports — all tables, enums, and inferred types
export * from "./schema/index.js";

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
