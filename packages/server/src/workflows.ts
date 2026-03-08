/**
 * Workflow automation engine.
 *
 * Trigger-condition-action framework that automates tasks
 * based on booking lifecycle events.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported workflow trigger events */
export type WorkflowTrigger =
  | "booking_created"
  | "booking_confirmed"
  | "booking_cancelled"
  | "booking_rescheduled"
  | "before_event"
  | "after_event"
  | "payment_received"
  | "payment_failed"
  | "no_show_confirmed"
  | "form_submitted";

/** Supported workflow action types */
export type WorkflowActionType =
  | "send_email"
  | "send_sms"
  | "fire_webhook"
  | "update_status"
  | "create_calendar_event";

/** Condition operator for filtering */
export type ConditionOperator = "equals" | "not_equals" | "contains" | "in";

/** A single workflow condition */
export interface WorkflowCondition {
  /** The field to check (e.g., "event_type_id", "status", "customer_email") */
  field: string;
  /** Comparison operator */
  operator: ConditionOperator;
  /** Value(s) to compare against */
  value: string | string[];
}

/** Email action configuration */
export interface EmailActionConfig {
  type: "send_email";
  /** Recipient: "customer", "host", or a specific email address */
  to: string;
  /** Email subject (supports template variables) */
  subject: string;
  /** Email body template (supports template variables) */
  body: string;
}

/** SMS action configuration */
export interface SmsActionConfig {
  type: "send_sms";
  /** Phone number field key or literal number */
  to: string;
  /** SMS body template (supports template variables) */
  body: string;
}

/** Webhook action configuration */
export interface WebhookActionConfig {
  type: "fire_webhook";
  /** Target URL */
  url: string;
  /** Payload template (JSON string with template variables) */
  payload?: string;
  /** HTTP method (default: POST) */
  method?: "POST" | "PUT" | "PATCH";
  /** Custom headers */
  headers?: Record<string, string>;
}

/** Status update action configuration */
export interface StatusUpdateActionConfig {
  type: "update_status";
  /** New status to set */
  status: string;
}

/** Calendar event action configuration */
export interface CalendarEventActionConfig {
  type: "create_calendar_event";
  /** Additional notes for the calendar event */
  notes?: string;
}

/** Union of all action configurations */
export type WorkflowAction =
  | EmailActionConfig
  | SmsActionConfig
  | WebhookActionConfig
  | StatusUpdateActionConfig
  | CalendarEventActionConfig;

/** A complete workflow definition */
export interface WorkflowDefinition {
  id: string;
  name: string;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  isActive: boolean;
}

/** Context data passed when evaluating a workflow */
export interface WorkflowContext {
  bookingId?: string;
  eventTypeId?: string;
  providerId?: string;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  status?: string;
  startsAt?: Date;
  endsAt?: Date;
  hostName?: string;
  eventTitle?: string;
  eventDuration?: number;
  eventLocation?: string;
  managementUrl?: string;
  /** Additional fields for condition evaluation */
  [key: string]: unknown;
}

/** Result of a workflow execution log entry */
export interface WorkflowLogEntry {
  workflowId: string;
  bookingId?: string;
  actionType: WorkflowActionType;
  status: "success" | "error" | "skipped";
  error?: string;
  executedAt: Date;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Error thrown when workflow validation fails */
export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowValidationError";
  }
}

// ---------------------------------------------------------------------------
// Template Variables
// ---------------------------------------------------------------------------

/** Standard template variables available in workflow messages */
export const TEMPLATE_VARIABLES = [
  "{booking.title}",
  "{booking.startTime}",
  "{booking.endTime}",
  "{booking.date}",
  "{attendee.name}",
  "{attendee.email}",
  "{host.name}",
  "{event.location}",
  "{event.duration}",
  "{booking.managementUrl}",
] as const;

/**
 * Resolve template variables in a string using workflow context.
 *
 * Missing variables are replaced with empty strings.
 *
 * @param template - The template string with `{variable}` placeholders
 * @param context - The workflow context with booking/event data
 * @returns The resolved string
 */
export function resolveTemplateVariables(
  template: string,
  context: WorkflowContext,
): string {
  const vars: Record<string, string> = {
    "{booking.title}": context.eventTitle ?? "",
    "{booking.startTime}": context.startsAt
      ? formatTime(context.startsAt)
      : "",
    "{booking.endTime}": context.endsAt ? formatTime(context.endsAt) : "",
    "{booking.date}": context.startsAt ? formatDate(context.startsAt) : "",
    "{attendee.name}": context.customerName ?? "",
    "{attendee.email}": context.customerEmail ?? "",
    "{host.name}": context.hostName ?? "",
    "{event.location}": context.eventLocation ?? "",
    "{event.duration}": context.eventDuration
      ? `${context.eventDuration} minutes`
      : "",
    "{booking.managementUrl}": context.managementUrl ?? "",
  };

  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(key, value);
  }

  return result;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Default Templates
// ---------------------------------------------------------------------------

/** Default workflow templates for common scenarios */
export const DEFAULT_TEMPLATES = {
  confirmation: {
    subject: "Booking Confirmed: {booking.title}",
    body: "Hi {attendee.name},\n\nYour booking for {booking.title} on {booking.date} at {booking.startTime} has been confirmed.\n\nDuration: {event.duration}\nLocation: {event.location}\n\nManage your booking: {booking.managementUrl}\n\nBest regards,\n{host.name}",
  },
  reminder_24h: {
    subject: "Reminder: {booking.title} tomorrow",
    body: "Hi {attendee.name},\n\nThis is a reminder that you have a booking for {booking.title} tomorrow at {booking.startTime}.\n\nLocation: {event.location}\n\nManage your booking: {booking.managementUrl}\n\nSee you soon,\n{host.name}",
  },
  reminder_1h: {
    subject: "Reminder: {booking.title} in 1 hour",
    body: "Hi {attendee.name},\n\nYour booking for {booking.title} starts in 1 hour at {booking.startTime}.\n\nLocation: {event.location}\n\nSee you soon,\n{host.name}",
  },
  cancellation: {
    subject: "Booking Cancelled: {booking.title}",
    body: "Hi {attendee.name},\n\nYour booking for {booking.title} on {booking.date} at {booking.startTime} has been cancelled.\n\nIf you'd like to rebook, please visit our booking page.\n\nBest regards,\n{host.name}",
  },
  followup: {
    subject: "How was your {booking.title}?",
    body: "Hi {attendee.name},\n\nThank you for your recent {booking.title} with {host.name}.\n\nWe hope you had a great experience! If you'd like to book again, we'd love to see you.\n\nBest regards,\n{host.name}",
  },
} as const;

// ---------------------------------------------------------------------------
// Condition Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a workflow's conditions are met for the given context.
 *
 * If no conditions are defined, returns true (unconditional trigger).
 * All conditions must match (AND logic).
 *
 * @param conditions - Array of workflow conditions
 * @param context - The workflow context data
 * @returns Whether all conditions are satisfied
 */
export function evaluateConditions(
  conditions: WorkflowCondition[],
  context: WorkflowContext,
): boolean {
  if (conditions.length === 0) return true;

  return conditions.every((condition) => {
    const fieldValue = String(context[condition.field] ?? "");

    switch (condition.operator) {
      case "equals":
        return fieldValue === String(condition.value);
      case "not_equals":
        return fieldValue !== String(condition.value);
      case "contains":
        return fieldValue
          .toLowerCase()
          .includes(String(condition.value).toLowerCase());
      case "in": {
        const values = Array.isArray(condition.value)
          ? condition.value
          : [condition.value];
        return values.includes(fieldValue);
      }
      default:
        return false;
    }
  });
}

// ---------------------------------------------------------------------------
// Workflow Validation
// ---------------------------------------------------------------------------

/** Valid triggers for workflows */
const VALID_TRIGGERS: WorkflowTrigger[] = [
  "booking_created",
  "booking_confirmed",
  "booking_cancelled",
  "booking_rescheduled",
  "before_event",
  "after_event",
  "payment_received",
  "payment_failed",
  "no_show_confirmed",
  "form_submitted",
];

/** Valid action types */
const VALID_ACTION_TYPES: WorkflowActionType[] = [
  "send_email",
  "send_sms",
  "fire_webhook",
  "update_status",
  "create_calendar_event",
];

/**
 * Validate a workflow definition.
 *
 * @param workflow - The workflow to validate
 * @throws {WorkflowValidationError} If the workflow is invalid
 */
export function validateWorkflow(workflow: WorkflowDefinition): void {
  if (!workflow.name || workflow.name.trim().length === 0) {
    throw new WorkflowValidationError("Workflow name is required");
  }

  if (!VALID_TRIGGERS.includes(workflow.trigger)) {
    throw new WorkflowValidationError(
      `Invalid trigger: "${workflow.trigger}". Must be one of: ${VALID_TRIGGERS.join(", ")}`,
    );
  }

  if (!Array.isArray(workflow.actions) || workflow.actions.length === 0) {
    throw new WorkflowValidationError(
      "Workflow must have at least one action",
    );
  }

  for (const action of workflow.actions) {
    if (!VALID_ACTION_TYPES.includes(action.type)) {
      throw new WorkflowValidationError(
        `Invalid action type: "${action.type}"`,
      );
    }

    validateAction(action);
  }

  for (const condition of workflow.conditions) {
    if (!condition.field || condition.field.trim().length === 0) {
      throw new WorkflowValidationError("Condition field is required");
    }

    if (!["equals", "not_equals", "contains", "in"].includes(condition.operator)) {
      throw new WorkflowValidationError(
        `Invalid condition operator: "${condition.operator}"`,
      );
    }
  }
}

function validateAction(action: WorkflowAction): void {
  switch (action.type) {
    case "send_email":
      if (!action.to) {
        throw new WorkflowValidationError("Email action requires 'to' field");
      }
      if (!action.subject) {
        throw new WorkflowValidationError(
          "Email action requires 'subject' field",
        );
      }
      if (!action.body) {
        throw new WorkflowValidationError("Email action requires 'body' field");
      }
      break;

    case "send_sms":
      if (!action.to) {
        throw new WorkflowValidationError("SMS action requires 'to' field");
      }
      if (!action.body) {
        throw new WorkflowValidationError("SMS action requires 'body' field");
      }
      break;

    case "fire_webhook":
      if (!action.url) {
        throw new WorkflowValidationError(
          "Webhook action requires 'url' field",
        );
      }
      break;

    case "update_status":
      if (!action.status) {
        throw new WorkflowValidationError(
          "Status update action requires 'status' field",
        );
      }
      break;

    case "create_calendar_event":
      // No required fields
      break;
  }
}

// ---------------------------------------------------------------------------
// Workflow Matching
// ---------------------------------------------------------------------------

/**
 * Find all active workflows that match a given trigger and context.
 *
 * @param workflows - All available workflows
 * @param trigger - The trigger event that occurred
 * @param context - The workflow context data
 * @returns Workflows that should be executed
 */
export function matchWorkflows(
  workflows: WorkflowDefinition[],
  trigger: WorkflowTrigger,
  context: WorkflowContext,
): WorkflowDefinition[] {
  return workflows.filter(
    (w) =>
      w.isActive &&
      w.trigger === trigger &&
      evaluateConditions(w.conditions, context),
  );
}
