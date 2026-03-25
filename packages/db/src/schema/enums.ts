import { pgEnum } from "drizzle-orm/pg-core";

/** Booking lifecycle status */
export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "cancelled",
  "rescheduled",
  "completed",
  "no_show",
  "rejected",
]);

/** Booking event types for the audit trail */
export const bookingEventTypeEnum = pgEnum("booking_event_type", [
  "created",
  "confirmed",
  "cancelled",
  "rescheduled",
  "completed",
  "no_show",
  "rejected",
  "updated",
  "payment_received",
  "payment_failed",
]);

/** Payment status */
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "authorized",
  "succeeded",
  "failed",
  "refunded",
  "partially_refunded",
  "released",
]);

/** Payment type */
export const paymentTypeEnum = pgEnum("payment_type", [
  "prepayment",
  "no_show_hold",
  "cancellation_fee",
]);

/** Location type for event types */
export const locationTypeEnum = pgEnum("location_type", [
  "in_person",
  "video",
  "phone",
  "custom",
]);

/** Team assignment strategy */
export const assignmentStrategyEnum = pgEnum("assignment_strategy", [
  "round_robin",
  "collective",
  "managed",
  "fixed",
]);

/** Team member role */
export const teamMemberRoleEnum = pgEnum("team_member_role", [
  "admin",
  "member",
]);

/** Booking question field types */
export const questionFieldTypeEnum = pgEnum("question_field_type", [
  "short_text",
  "long_text",
  "single_select",
  "multi_select",
  "phone",
  "email",
  "number",
  "checkbox",
]);

/** Recurring booking frequency */
export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "weekly",
  "biweekly",
  "monthly",
]);

/** Booking seat status */
export const seatStatusEnum = pgEnum("seat_status", [
  "confirmed",
  "cancelled",
]);

/** Workflow trigger types */
export const workflowTriggerEnum = pgEnum("workflow_trigger", [
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
]);

/** Workflow action types */
export const workflowActionTypeEnum = pgEnum("workflow_action_type", [
  "send_email",
  "send_sms",
  "fire_webhook",
  "update_status",
  "create_calendar_event",
]);

/** Email delivery status */
export const emailDeliveryStatusEnum = pgEnum("email_delivery_status", [
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
]);

/** Booking source — how the booking was created */
export const bookingSourceEnum = pgEnum("booking_source", [
  "online",
  "walk_in",
  "phone",
  "admin",
]);

/** Walk-in queue entry status */
export const walkInStatusEnum = pgEnum("walk_in_status", [
  "queued",
  "in_service",
  "completed",
  "no_show",
  "cancelled",
]);
