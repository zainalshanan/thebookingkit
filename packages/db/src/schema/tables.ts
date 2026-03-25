import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  bookingStatusEnum,
  bookingEventTypeEnum,
  paymentStatusEnum,
  paymentTypeEnum,
  locationTypeEnum,
  assignmentStrategyEnum,
  teamMemberRoleEnum,
  recurringFrequencyEnum,
  seatStatusEnum,
  workflowTriggerEnum,
  workflowActionTypeEnum,
  emailDeliveryStatusEnum,
  bookingSourceEnum,
  walkInStatusEnum,
} from "./enums.js";

// ---------------------------------------------------------------------------
// Shared column helpers
// ---------------------------------------------------------------------------
const idColumn = () => uuid("id").primaryKey().defaultRandom();
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// Organizations (multi-tenancy, optional)
// ---------------------------------------------------------------------------
export const organizations = pgTable("organizations", {
  id: idColumn(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  settings: jsonb("settings").default({}),
  ...timestamps(),
});

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
export const teams = pgTable("teams", {
  id: idColumn(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  assignmentStrategy: assignmentStrategyEnum("assignment_strategy")
    .notNull()
    .default("round_robin"),
  settings: jsonb("settings").default({}),
  ...timestamps(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    id: idColumn(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: teamMemberRoleEnum("role").notNull().default("member"),
    priority: integer("priority").notNull().default(0),
    weight: integer("weight").notNull().default(100),
    ...timestamps(),
  },
  (table) => [
    index("team_members_team_id_idx").on(table.teamId),
    index("team_members_user_id_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------
export const providers = pgTable(
  "providers",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
    userId: text("user_id").notNull().unique(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    timezone: varchar("timezone", { length: 100 })
      .notNull()
      .default("America/New_York"),
    acceptingWalkIns: boolean("accepting_walk_ins").notNull().default(false),
    stripeAccountId: text("stripe_account_id"),
    metadata: jsonb("metadata").default({}),
    ...timestamps(),
  },
  (table) => [index("providers_user_id_idx").on(table.userId)],
);

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------
export const eventTypes = pgTable(
  "event_types",
  {
    id: idColumn(),
    providerId: uuid("provider_id").references(() => providers.id, {
      onDelete: "cascade",
    }),
    teamId: uuid("team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    bufferBefore: integer("buffer_before").notNull().default(0),
    bufferAfter: integer("buffer_after").notNull().default(0),
    priceCents: integer("price_cents").default(0),
    currency: varchar("currency", { length: 3 }).default("USD"),
    locationType: locationTypeEnum("location_type")
      .notNull()
      .default("in_person"),
    locationValue: text("location_value"),
    bookingLimits: jsonb("booking_limits").default({}),
    requiresConfirmation: boolean("requires_confirmation")
      .notNull()
      .default(false),
    isRecurring: boolean("is_recurring").notNull().default(false),
    maxSeats: integer("max_seats").notNull().default(1),
    noShowFeeCents: integer("no_show_fee_cents").default(0),
    cancellationPolicy: jsonb("cancellation_policy").default([]),
    customQuestions: jsonb("custom_questions").default([]),
    minimumNoticeMinutes: integer("minimum_notice_minutes").default(0),
    maxFutureDays: integer("max_future_days").default(60),
    slotInterval: integer("slot_interval"),
    walkInsEnabled: boolean("walk_ins_enabled").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").default({}),
    ...timestamps(),
  },
  (table) => [
    index("event_types_provider_id_idx").on(table.providerId),
  ],
);

// ---------------------------------------------------------------------------
// Availability Rules (RRULE-based)
// ---------------------------------------------------------------------------
export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: idColumn(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    eventTypeId: uuid("event_type_id").references(() => eventTypes.id, {
      onDelete: "cascade",
    }),
    rrule: text("rrule").notNull(),
    startTime: varchar("start_time", { length: 5 }).notNull(), // "09:00"
    endTime: varchar("end_time", { length: 5 }).notNull(), // "17:00"
    timezone: varchar("timezone", { length: 100 }).notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("availability_rules_provider_id_idx").on(table.providerId),
  ],
);

// ---------------------------------------------------------------------------
// Availability Overrides (date-specific)
// ---------------------------------------------------------------------------
export const availabilityOverrides = pgTable(
  "availability_overrides",
  {
    id: idColumn(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    date: timestamp("date", { mode: "date", withTimezone: true }).notNull(),
    startTime: varchar("start_time", { length: 5 }), // null if fully unavailable
    endTime: varchar("end_time", { length: 5 }),
    isUnavailable: boolean("is_unavailable").notNull().default(false),
    reason: text("reason"),
    ...timestamps(),
  },
  (table) => [
    index("availability_overrides_provider_id_idx").on(table.providerId),
    index("availability_overrides_date_idx").on(table.date),
  ],
);

// ---------------------------------------------------------------------------
// Out of Office
// ---------------------------------------------------------------------------
export const outOfOffice = pgTable(
  "out_of_office",
  {
    id: idColumn(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    reason: text("reason"),
    redirectToUserId: text("redirect_to_user_id"),
    ...timestamps(),
  },
  (table) => [
    index("out_of_office_provider_id_idx").on(table.providerId),
  ],
);

// ---------------------------------------------------------------------------
// Recurring Bookings (parent record for series)
// ---------------------------------------------------------------------------
export const recurringBookings = pgTable("recurring_bookings", {
  id: idColumn(),
  eventTypeId: uuid("event_type_id")
    .notNull()
    .references(() => eventTypes.id, { onDelete: "restrict" }),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "restrict" }),
  customerEmail: text("customer_email").notNull(),
  frequency: recurringFrequencyEnum("frequency").notNull(),
  count: integer("count").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  ...timestamps(),
});

// ---------------------------------------------------------------------------
// Bookings (core table with exclusion constraint)
// ---------------------------------------------------------------------------
export const bookings = pgTable(
  "bookings",
  {
    id: idColumn(),
    eventTypeId: uuid("event_type_id")
      .notNull()
      .references(() => eventTypes.id, { onDelete: "restrict" }),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    teamId: uuid("team_id").references(() => teams.id),
    customerEmail: text("customer_email").notNull(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: bookingStatusEnum("status").notNull().default("pending"),
    source: bookingSourceEnum("source").notNull().default("online"),
    paymentStatus: paymentStatusEnum("payment_status"),
    recurringBookingId: uuid("recurring_booking_id").references(
      () => recurringBookings.id,
      { onDelete: "restrict" },
    ),
    resourceId: uuid("resource_id").references(() => resources.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").default({}),
    ...timestamps(),
  },
  (table) => [
    index("bookings_provider_id_idx").on(table.providerId),
    index("bookings_event_type_id_idx").on(table.eventTypeId),
    index("bookings_customer_email_idx").on(table.customerEmail),
    index("bookings_starts_at_idx").on(table.startsAt),
    index("bookings_status_idx").on(table.status),
    index("bookings_resource_id_idx").on(table.resourceId),
    index("bookings_provider_starts_at_idx").on(table.providerId, table.startsAt),
  ],
);

// ---------------------------------------------------------------------------
// Booking Events (immutable audit trail)
// ---------------------------------------------------------------------------
export const bookingEvents = pgTable(
  "booking_events",
  {
    id: idColumn(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    eventType: bookingEventTypeEnum("event_type").notNull(),
    actor: text("actor").notNull(), // user ID or 'system'
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("booking_events_booking_id_idx").on(table.bookingId),
  ],
);

// ---------------------------------------------------------------------------
// Booking Question Responses
// ---------------------------------------------------------------------------
export const bookingQuestionsResponses = pgTable(
  "booking_questions_responses",
  {
    id: idColumn(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    questionKey: text("question_key").notNull(),
    responseValue: text("response_value"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("booking_questions_booking_id_idx").on(table.bookingId),
  ],
);

// ---------------------------------------------------------------------------
// Booking Seats (group bookings)
// ---------------------------------------------------------------------------
export const bookingSeats = pgTable(
  "booking_seats",
  {
    id: idColumn(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    attendeeEmail: text("attendee_email").notNull(),
    attendeeName: text("attendee_name").notNull(),
    status: seatStatusEnum("status").notNull().default("confirmed"),
    ...timestamps(),
  },
  (table) => [index("booking_seats_booking_id_idx").on(table.bookingId)],
);

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export const payments = pgTable(
  "payments",
  {
    id: idColumn(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    paymentType: paymentTypeEnum("payment_type").notNull(),
    refundAmountCents: integer("refund_amount_cents").default(0),
    metadata: jsonb("metadata").default({}),
    ...timestamps(),
  },
  (table) => [index("payments_booking_id_idx").on(table.bookingId)],
);

// ---------------------------------------------------------------------------
// Routing Forms
// ---------------------------------------------------------------------------
export const routingForms = pgTable("routing_forms", {
  id: idColumn(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  teamId: uuid("team_id").references(() => teams.id),
  title: text("title").notNull(),
  fields: jsonb("fields").notNull().default([]),
  routingRules: jsonb("routing_rules").notNull().default([]),
  ...timestamps(),
});

export const routingSubmissions = pgTable(
  "routing_submissions",
  {
    id: idColumn(),
    formId: uuid("form_id")
      .notNull()
      .references(() => routingForms.id, { onDelete: "cascade" }),
    responses: jsonb("responses").notNull().default({}),
    routedToEventTypeId: uuid("routed_to_event_type_id").references(
      () => eventTypes.id,
    ),
    routedToProviderId: uuid("routed_to_provider_id").references(
      () => providers.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("routing_submissions_form_id_idx").on(table.formId)],
);

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------
export const workflows = pgTable("workflows", {
  id: idColumn(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  trigger: workflowTriggerEnum("trigger").notNull(),
  conditions: jsonb("conditions").default({}),
  actions: jsonb("actions").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export const workflowLogs = pgTable(
  "workflow_logs",
  {
    id: idColumn(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id),
    actionType: workflowActionTypeEnum("action_type").notNull(),
    status: text("status").notNull(),
    error: text("error"),
    executedAt: timestamp("executed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("workflow_logs_workflow_id_idx").on(table.workflowId),
  ],
);

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
export const webhooks = pgTable("webhooks", {
  id: idColumn(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  teamId: uuid("team_id").references(() => teams.id),
  eventTypeId: uuid("event_type_id").references(() => eventTypes.id),
  subscriberUrl: text("subscriber_url").notNull(),
  triggers: jsonb("triggers").notNull().default([]),
  secret: text("secret"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: idColumn(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(),
    payload: jsonb("payload").notNull(),
    responseCode: integer("response_code"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("webhook_deliveries_webhook_id_idx").on(table.webhookId),
  ],
);

// ---------------------------------------------------------------------------
// Email Delivery Log
// ---------------------------------------------------------------------------
export const emailDeliveryLog = pgTable(
  "email_delivery_log",
  {
    id: idColumn(),
    bookingId: uuid("booking_id").references(() => bookings.id),
    emailType: text("email_type").notNull(),
    recipient: text("recipient").notNull(),
    status: emailDeliveryStatusEnum("status").notNull().default("sent"),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_delivery_log_booking_id_idx").on(table.bookingId),
  ],
);

// ---------------------------------------------------------------------------
// Customer Preferences
// ---------------------------------------------------------------------------
export const customerPreferences = pgTable("customer_preferences", {
  id: idColumn(),
  email: text("email").notNull().unique(),
  emailOptOut: boolean("email_opt_out").notNull().default(false),
  bouncedAt: timestamp("bounced_at", { withTimezone: true }),
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  ...timestamps(),
});

// ---------------------------------------------------------------------------
// Resources (E-22) — bookable physical/virtual units (tables, rooms, courts)
// ---------------------------------------------------------------------------
export const resources = pgTable(
  "resources",
  {
    id: idColumn(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    type: varchar("type", { length: 100 }).notNull(),
    capacity: integer("capacity").notNull().default(1),
    location: text("location"),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").default({}),
    ...timestamps(),
  },
  (table) => [
    index("resources_organization_id_idx").on(table.organizationId),
    index("resources_type_idx").on(table.type),
  ],
);

// ---------------------------------------------------------------------------
// Resource Availability Rules (RRULE-based, mirrors availability_rules)
// ---------------------------------------------------------------------------
export const resourceAvailabilityRules = pgTable(
  "resource_availability_rules",
  {
    id: idColumn(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    rrule: text("rrule").notNull(),
    startTime: varchar("start_time", { length: 5 }).notNull(), // "09:00"
    endTime: varchar("end_time", { length: 5 }).notNull(), // "17:00"
    timezone: varchar("timezone", { length: 100 }).notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("resource_availability_rules_resource_id_idx").on(table.resourceId),
  ],
);

// ---------------------------------------------------------------------------
// Resource Availability Overrides (date-specific, mirrors availability_overrides)
// ---------------------------------------------------------------------------
export const resourceAvailabilityOverrides = pgTable(
  "resource_availability_overrides",
  {
    id: idColumn(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    date: timestamp("date", { mode: "date", withTimezone: true }).notNull(),
    startTime: varchar("start_time", { length: 5 }), // null if fully unavailable
    endTime: varchar("end_time", { length: 5 }),
    isUnavailable: boolean("is_unavailable").notNull().default(false),
    reason: text("reason"),
    ...timestamps(),
  },
  (table) => [
    index("resource_availability_overrides_resource_id_idx").on(
      table.resourceId,
    ),
    index("resource_availability_overrides_date_idx").on(table.date),
  ],
);

// ---------------------------------------------------------------------------
// Walk-In Queue (E-19)
// ---------------------------------------------------------------------------
export const walkInQueue = pgTable(
  "walk_in_queue",
  {
    id: idColumn(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    queuePosition: integer("queue_position").notNull(),
    estimatedWaitMinutes: integer("estimated_wait_minutes").notNull().default(0),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    serviceStartedAt: timestamp("service_started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: walkInStatusEnum("status").notNull().default("queued"),
    ...timestamps(),
  },
  (table) => [
    index("walk_in_queue_provider_id_idx").on(table.providerId),
    index("walk_in_queue_booking_id_idx").on(table.bookingId),
    index("walk_in_queue_status_idx").on(table.status),
  ],
);
