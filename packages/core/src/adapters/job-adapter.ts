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

/** Common job names used by SlotKit */
export const JOB_NAMES = {
  SEND_CONFIRMATION_EMAIL: "slotkit/send-confirmation-email",
  SEND_REMINDER_EMAIL: "slotkit/send-reminder-email",
  SEND_CANCELLATION_EMAIL: "slotkit/send-cancellation-email",
  SEND_RESCHEDULE_EMAIL: "slotkit/send-reschedule-email",
  SYNC_CALENDAR_EVENT: "slotkit/sync-calendar-event",
  DELETE_CALENDAR_EVENT: "slotkit/delete-calendar-event",
  CHECK_CALENDAR_CONFLICTS: "slotkit/check-calendar-conflicts",
  AUTO_REJECT_PENDING: "slotkit/auto-reject-pending-booking",
  PROCESS_WEBHOOK: "slotkit/process-webhook",
} as const;
