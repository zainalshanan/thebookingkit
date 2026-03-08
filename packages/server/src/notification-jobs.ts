/**
 * Notification job payload types and helper functions for E-06.
 *
 * These types are used by background job functions (Inngest, Trigger.dev, BullMQ, etc.)
 * when sending booking notification emails and syncing calendar events.
 *
 * The actual job implementation lives in the consumer app (or a provided Inngest
 * functions file), but the payload shapes and builder functions are framework-agnostic.
 */

import type { EmailAdapter, CalendarAdapter, JobAdapter } from "./adapters/index.js";
import { generateICSAttachment } from "./adapters/index.js";
import {
  interpolateTemplate,
  CONFIRMATION_EMAIL_HTML,
  CONFIRMATION_EMAIL_TEXT,
  REMINDER_EMAIL_HTML,
  CANCELLATION_EMAIL_HTML,
  RESCHEDULE_EMAIL_HTML,
  type EmailTemplateVars,
} from "./email-templates.js";
import { JOB_NAMES } from "./adapters/job-adapter.js";

// ---------------------------------------------------------------------------
// Payload types for each notification job
// ---------------------------------------------------------------------------

/** Common booking data included in every notification payload */
export interface NotificationBookingData {
  bookingId: string;
  eventTitle: string;
  providerName: string;
  providerEmail: string;
  customerName: string;
  customerEmail: string;
  /** ISO datetime strings */
  startsAt: string;
  endsAt: string;
  timezone: string;
  location?: string;
  /** Signed management URL for the customer */
  managementUrl?: string;
  /** Unsubscribe URL */
  unsubscribeUrl?: string;
}

/** Payload for SEND_CONFIRMATION_EMAIL job */
export interface ConfirmationEmailPayload extends NotificationBookingData {
  /** Whether to also send a notification to the provider */
  notifyProvider?: boolean;
}

/** Payload for SEND_REMINDER_EMAIL job */
export interface ReminderEmailPayload extends NotificationBookingData {
  /** How many hours before the appointment this reminder is for (e.g., 24 or 1) */
  reminderHours: number;
}

/** Payload for SEND_CANCELLATION_EMAIL job */
export interface CancellationEmailPayload extends NotificationBookingData {
  /** Who initiated the cancellation */
  cancelledBy: "customer" | "provider" | "system";
  /** Optional reason for cancellation */
  reason?: string;
}

/** Payload for SEND_RESCHEDULE_EMAIL job */
export interface RescheduleEmailPayload extends NotificationBookingData {
  /** Original booking datetime strings */
  oldStartsAt: string;
  oldEndsAt: string;
}

/** Payload for SYNC_CALENDAR_EVENT job */
export interface CalendarSyncPayload {
  bookingId: string;
  providerId: string;
  /** External calendar event ID (for updates/deletes) */
  externalEventId?: string;
  eventTitle: string;
  customerName: string;
  customerEmail: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location?: string;
  description?: string;
}

/** Payload for DELETE_CALENDAR_EVENT job */
export interface CalendarDeletePayload {
  bookingId: string;
  providerId: string;
  externalEventId: string;
}

/** Payload for AUTO_REJECT_PENDING job */
export interface AutoRejectPendingPayload {
  bookingId: string;
  /** Actor to record in the booking_event */
  actor?: string;
}

// ---------------------------------------------------------------------------
// Helper functions for building notification payloads
// ---------------------------------------------------------------------------

/**
 * Format a UTC datetime string in a given timezone for email templates.
 *
 * @returns `{ date, time }` formatted for the email template variables
 */
export function formatDateTimeForEmail(
  isoString: string,
  timezone: string,
): { date: string; time: string } {
  const dt = new Date(isoString);
  const date = dt.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  });
  const time = dt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  });
  return { date, time };
}

/**
 * Calculate duration in human-readable form from start/end ISO strings.
 */
export function formatDurationForEmail(startsAt: string, endsAt: string): string {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} minutes`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder === 0
    ? `${hours} hour${hours !== 1 ? "s" : ""}`
    : `${hours}h ${remainder}m`;
}

// ---------------------------------------------------------------------------
// Job execution helpers (framework-agnostic)
// ---------------------------------------------------------------------------

/**
 * Send a booking confirmation email to the customer (and optionally the provider).
 *
 * Call this from your Inngest/Trigger.dev/BullMQ job handler.
 *
 * @example
 * ```ts
 * // In your Inngest function:
 * export const sendConfirmation = inngest.createFunction(
 *   { id: "send-confirmation-email" },
 *   { event: JOB_NAMES.SEND_CONFIRMATION_EMAIL },
 *   async ({ event }) => {
 *     await sendConfirmationEmail(event.data, emailAdapter);
 *   },
 * );
 * ```
 */
export async function sendConfirmationEmail(
  payload: ConfirmationEmailPayload,
  emailAdapter: EmailAdapter,
): Promise<void> {
  const { date, time } = formatDateTimeForEmail(payload.startsAt, payload.timezone);
  const duration = formatDurationForEmail(payload.startsAt, payload.endsAt);

  const vars: EmailTemplateVars = {
    bookingId: payload.bookingId,
    eventTitle: payload.eventTitle,
    providerName: payload.providerName,
    customerName: payload.customerName,
    customerEmail: payload.customerEmail,
    date,
    time,
    duration,
    timezone: payload.timezone,
    location: payload.location,
    managementUrl: payload.managementUrl,
    unsubscribeUrl: payload.unsubscribeUrl,
  };

  const icsAttachment = generateBookingICS(payload);

  await emailAdapter.send({
    to: payload.customerEmail,
    subject: `Booking Confirmed: ${payload.eventTitle} on ${date}`,
    html: interpolateTemplate(CONFIRMATION_EMAIL_HTML, vars),
    text: interpolateTemplate(CONFIRMATION_EMAIL_TEXT, vars),
    attachments: icsAttachment ? [icsAttachment] : undefined,
    headers: buildEmailHeaders(payload.unsubscribeUrl),
  });

  if (payload.notifyProvider) {
    await emailAdapter.send({
      to: payload.providerEmail,
      subject: `New Booking: ${payload.customerName} — ${payload.eventTitle}`,
      html: interpolateTemplate(CONFIRMATION_EMAIL_HTML, {
        ...vars,
        customerName: payload.customerName,
      }),
      text: interpolateTemplate(CONFIRMATION_EMAIL_TEXT, vars),
      headers: buildEmailHeaders(),
    });
  }
}

/**
 * Send a reminder email to the customer before their appointment.
 */
export async function sendReminderEmail(
  payload: ReminderEmailPayload,
  emailAdapter: EmailAdapter,
): Promise<void> {
  const { date, time } = formatDateTimeForEmail(payload.startsAt, payload.timezone);

  const vars: EmailTemplateVars = {
    bookingId: payload.bookingId,
    eventTitle: payload.eventTitle,
    providerName: payload.providerName,
    customerName: payload.customerName,
    customerEmail: payload.customerEmail,
    date,
    time,
    duration: formatDurationForEmail(payload.startsAt, payload.endsAt),
    timezone: payload.timezone,
    location: payload.location,
    managementUrl: payload.managementUrl,
    unsubscribeUrl: payload.unsubscribeUrl,
  };

  const label =
    payload.reminderHours >= 24
      ? `${payload.reminderHours / 24} day`
      : `${payload.reminderHours} hour`;

  await emailAdapter.send({
    to: payload.customerEmail,
    subject: `Reminder: ${payload.eventTitle} in ${label}${Number(label.split(" ")[0]) !== 1 ? "s" : ""}`,
    html: interpolateTemplate(REMINDER_EMAIL_HTML, vars),
    headers: buildEmailHeaders(payload.unsubscribeUrl),
  });
}

/**
 * Send cancellation notification emails to customer and provider.
 */
export async function sendCancellationEmail(
  payload: CancellationEmailPayload,
  emailAdapter: EmailAdapter,
): Promise<void> {
  const { date, time } = formatDateTimeForEmail(payload.startsAt, payload.timezone);

  const vars: EmailTemplateVars = {
    bookingId: payload.bookingId,
    eventTitle: payload.eventTitle,
    providerName: payload.providerName,
    customerName: payload.customerName,
    customerEmail: payload.customerEmail,
    date,
    time,
    duration: formatDurationForEmail(payload.startsAt, payload.endsAt),
    timezone: payload.timezone,
    location: payload.location,
    unsubscribeUrl: payload.unsubscribeUrl,
    cancelReason: payload.reason,
  };

  await emailAdapter.send({
    to: payload.customerEmail,
    subject: `Booking Cancelled: ${payload.eventTitle}`,
    html: interpolateTemplate(CANCELLATION_EMAIL_HTML, vars),
    headers: buildEmailHeaders(payload.unsubscribeUrl),
  });

  await emailAdapter.send({
    to: payload.providerEmail,
    subject: `Booking Cancelled by ${payload.cancelledBy}: ${payload.customerName}`,
    html: interpolateTemplate(CANCELLATION_EMAIL_HTML, vars),
    headers: buildEmailHeaders(),
  });
}

/**
 * Send reschedule notification emails to customer and provider.
 */
export async function sendRescheduleEmail(
  payload: RescheduleEmailPayload,
  emailAdapter: EmailAdapter,
): Promise<void> {
  const { date: newDate, time: newTime } = formatDateTimeForEmail(
    payload.startsAt,
    payload.timezone,
  );
  const { date: oldDate, time: oldTime } = formatDateTimeForEmail(
    payload.oldStartsAt,
    payload.timezone,
  );

  const vars: EmailTemplateVars = {
    bookingId: payload.bookingId,
    eventTitle: payload.eventTitle,
    providerName: payload.providerName,
    customerName: payload.customerName,
    customerEmail: payload.customerEmail,
    date: newDate,
    time: newTime,
    duration: formatDurationForEmail(payload.startsAt, payload.endsAt),
    timezone: payload.timezone,
    location: payload.location,
    managementUrl: payload.managementUrl,
    unsubscribeUrl: payload.unsubscribeUrl,
    oldDate,
    oldTime,
    newDate,
    newTime,
  };

  await emailAdapter.send({
    to: payload.customerEmail,
    subject: `Booking Rescheduled: ${payload.eventTitle}`,
    html: interpolateTemplate(RESCHEDULE_EMAIL_HTML, vars),
    headers: buildEmailHeaders(payload.unsubscribeUrl),
  });

  await emailAdapter.send({
    to: payload.providerEmail,
    subject: `Booking Rescheduled: ${payload.customerName} — ${payload.eventTitle}`,
    html: interpolateTemplate(RESCHEDULE_EMAIL_HTML, vars),
    headers: buildEmailHeaders(),
  });
}

/**
 * Schedule the auto-rejection of a pending booking using the job adapter.
 *
 * Call this immediately after creating a booking that requires confirmation.
 *
 * @param bookingId - ID of the pending booking
 * @param deadline - Date at which to auto-reject (from `getAutoRejectDeadline`)
 * @param jobs - Your `JobAdapter` instance
 * @returns The scheduled job ID (store it if you need to cancel on manual confirm/reject)
 */
export async function scheduleAutoReject(
  bookingId: string,
  deadline: Date,
  jobs: JobAdapter,
): Promise<string> {
  const payload: AutoRejectPendingPayload = { bookingId, actor: "system" };
  return jobs.schedule(JOB_NAMES.AUTO_REJECT_PENDING, payload, deadline);
}

/**
 * Sync a confirmed booking to the provider's connected calendar.
 */
export async function syncBookingToCalendar(
  payload: CalendarSyncPayload,
  calendarAdapter: CalendarAdapter,
): Promise<string | undefined> {
  const result = await calendarAdapter.createEvent({
    title: `${payload.eventTitle} — ${payload.customerName}`,
    description: `Customer: ${payload.customerName} (${payload.customerEmail})`,
    startsAt: new Date(payload.startsAt),
    endsAt: new Date(payload.endsAt),
    timezone: payload.timezone,
    location: payload.location,
    attendees: [payload.customerEmail],
  });
  return result.eventId;
}

/**
 * Delete a calendar event when a booking is cancelled.
 */
export async function deleteBookingFromCalendar(
  externalEventId: string,
  calendarAdapter: CalendarAdapter,
): Promise<void> {
  await calendarAdapter.deleteEvent(externalEventId);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildEmailHeaders(
  unsubscribeUrl?: string,
): Record<string, string> | undefined {
  if (!unsubscribeUrl) return undefined;
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

function generateBookingICS(
  payload: NotificationBookingData,
): { filename: string; content: string; contentType: string } | null {
  try {
    const attachment = generateICSAttachment({
      id: payload.bookingId,
      title: payload.eventTitle,
      startsAt: new Date(payload.startsAt),
      endsAt: new Date(payload.endsAt),
      location: payload.location,
      description: `Booking with ${payload.providerName}`,
      organizerEmail: payload.providerEmail,
      attendeeEmail: payload.customerEmail,
    });
    return {
      filename: attachment.filename,
      content: attachment.content as string,
      contentType: attachment.contentType ?? "text/calendar",
    };
  } catch {
    return null;
  }
}

export { JOB_NAMES };
