/**
 * Background job adapter interface.
 * Default implementation uses Inngest. Swap to Trigger.dev,
 * BullMQ, or Vercel Cron by implementing this interface.
 */
export interface JobAdapter {
  /** Enqueue a job for immediate execution */
  enqueue<T>(jobName: string, payload: T): Promise<void>;
  /** Schedule a job for future execution */
  schedule<T>(jobName: string, payload: T, runAt: Date): Promise<string>;
  /** Cancel a previously scheduled job */
  cancel(jobId: string): Promise<void>;
}

/** Common job names used by The Booking Kit */
export const JOB_NAMES = {
  SEND_CONFIRMATION_EMAIL: "thebookingkit/send-confirmation-email",
  SEND_REMINDER_EMAIL: "thebookingkit/send-reminder-email",
  SEND_CANCELLATION_EMAIL: "thebookingkit/send-cancellation-email",
  SEND_RESCHEDULE_EMAIL: "thebookingkit/send-reschedule-email",
  SYNC_CALENDAR_EVENT: "thebookingkit/sync-calendar-event",
  DELETE_CALENDAR_EVENT: "thebookingkit/delete-calendar-event",
  CHECK_CALENDAR_CONFLICTS: "thebookingkit/check-calendar-conflicts",
  AUTO_REJECT_PENDING: "thebookingkit/auto-reject-pending-booking",
  PROCESS_WEBHOOK: "thebookingkit/process-webhook",
  SEND_WALK_IN_NOTIFICATION: "thebookingkit/send-walk-in-notification",
  SEND_RESOURCE_BOOKING_CONFIRMATION: "thebookingkit/send-resource-booking-confirmation",
  PROCESS_RECURRING_SERIES: "thebookingkit/process-recurring-series",
  PROCESS_SLOT_RELEASE: "thebookingkit/process-slot-release",
  ADVANCE_WALK_IN_QUEUE: "thebookingkit/advance-walk-in-queue",
} as const;
