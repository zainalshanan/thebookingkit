/**
 * Webhook infrastructure for event-driven integrations.
 *
 * Includes typed payloads, HMAC-SHA256 signing with replay protection,
 * retry logic, and custom payload templates.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { validateExternalUrl } from "./url-validation.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported webhook trigger events */
export type WebhookTrigger =
  | "BOOKING_CANCELLED"
  | "BOOKING_COMPLETED"
  | "BOOKING_CONFIRMED"
  | "BOOKING_CREATED"
  | "BOOKING_NO_SHOW"
  | "BOOKING_PAID"
  | "BOOKING_REJECTED"
  | "BOOKING_RESCHEDULED"
  | "FORM_SUBMITTED"
  | "OCCURRENCE_CANCELLED"
  | "OCCURRENCE_RESCHEDULED"
  | "OOO_CREATED"
  | "PAYMENT_REFUNDED"
  | "RECURRING_SERIES_CREATED"
  | "RESOURCE_BOOKED"
  | "RESOURCE_RELEASED"
  | "SLOT_RELEASED"
  | "WALK_IN_ADDED"
  | "WALK_IN_CANCELLED"
  | "WALK_IN_COMPLETED"
  | "WALK_IN_STARTED";

/** Attendee in a webhook payload */
export interface WebhookAttendee {
  email: string;
  name: string;
  phone?: string;
}

/** Standard webhook payload body */
export interface WebhookPayload {
  bookingId: string;
  eventType: string;
  startTime: string;
  endTime: string;
  organizer: { name: string; email: string };
  attendees: WebhookAttendee[];
  status: string;
  responses?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** Full webhook envelope */
export interface WebhookEnvelope {
  triggerEvent: WebhookTrigger;
  createdAt: string;
  payload: WebhookPayload;
}

/** A webhook subscription definition */
export interface WebhookSubscription {
  id: string;
  subscriberUrl: string;
  triggers: WebhookTrigger[];
  secret?: string;
  isActive: boolean;
  /** Optional scope */
  eventTypeId?: string;
  teamId?: string;
  /** Optional custom payload template (JSON with {{variable}} placeholders) */
  payloadTemplate?: string;
}

/** Result of a webhook delivery attempt */
export interface WebhookDeliveryResult {
  webhookId: string;
  trigger: WebhookTrigger;
  responseCode: number | null;
  success: boolean;
  attempt: number;
  deliveredAt: Date;
  error?: string;
}

/** Retry configuration for webhook delivery */
export interface WebhookRetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Backoff delays in seconds for each retry (default: [10, 60, 300]) */
  backoffSeconds: number[];
}

/** Result of signature verification */
export interface WebhookVerificationResult {
  valid: boolean;
  reason?: "timestamp_expired" | "signature_mismatch";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default retry configuration */
export const DEFAULT_RETRY_CONFIG: WebhookRetryConfig = {
  maxRetries: 3,
  backoffSeconds: [10, 60, 300],
};

/** All valid webhook triggers */
export const WEBHOOK_TRIGGERS: WebhookTrigger[] = [
  "BOOKING_CANCELLED",
  "BOOKING_COMPLETED",
  "BOOKING_CONFIRMED",
  "BOOKING_CREATED",
  "BOOKING_NO_SHOW",
  "BOOKING_PAID",
  "BOOKING_REJECTED",
  "BOOKING_RESCHEDULED",
  "FORM_SUBMITTED",
  "OCCURRENCE_CANCELLED",
  "OCCURRENCE_RESCHEDULED",
  "OOO_CREATED",
  "PAYMENT_REFUNDED",
  "RECURRING_SERIES_CREATED",
  "RESOURCE_BOOKED",
  "RESOURCE_RELEASED",
  "SLOT_RELEASED",
  "WALK_IN_ADDED",
  "WALK_IN_CANCELLED",
  "WALK_IN_COMPLETED",
  "WALK_IN_STARTED",
];

/** Signature header name */
export const SIGNATURE_HEADER = "X-BookingKit-Signature";

/** Timestamp header name */
export const TIMESTAMP_HEADER = "X-BookingKit-Timestamp";

/** Default tolerance window in seconds (5 minutes) */
export const DEFAULT_TOLERANCE_SECONDS = 300;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Error thrown when webhook validation fails */
export class WebhookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookValidationError";
  }
}

// ---------------------------------------------------------------------------
// Signing & Verification
// ---------------------------------------------------------------------------

/**
 * Create an HMAC-SHA256 signature for a webhook payload.
 *
 * Signature = HMAC-SHA256(secret, timestamp + '.' + rawBody)
 *
 * @param rawBody - The raw JSON string of the payload
 * @param secret - The webhook secret key
 * @param timestampSeconds - Unix timestamp in seconds
 * @returns The hex-encoded HMAC signature
 */
export function signWebhookPayload(
  rawBody: string,
  secret: string,
  timestampSeconds: number,
): string {
  const message = `${timestampSeconds}.${rawBody}`;
  return createHmac("sha256", secret).update(message).digest("hex");
}

/**
 * Verify a webhook signature with replay protection.
 *
 * @param rawBody - The raw JSON string of the received payload
 * @param signature - The value of the X-BookingKit-Signature header
 * @param timestampSeconds - The value of the X-BookingKit-Timestamp header (Unix seconds)
 * @param secret - The webhook secret key
 * @param options - Optional configuration
 * @param options.toleranceSeconds - Maximum age of the timestamp in seconds (default: 300)
 * @returns Verification result with reason if invalid
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  timestampSeconds: number,
  secret: string,
  options?: { toleranceSeconds?: number },
): WebhookVerificationResult {
  const tolerance = options?.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const age = nowSeconds - timestampSeconds;

  // Check replay protection
  if (age > tolerance || age < -tolerance) {
    return { valid: false, reason: "timestamp_expired" };
  }

  // Verify HMAC
  const expectedSignature = signWebhookPayload(
    rawBody,
    secret,
    timestampSeconds,
  );

  // Constant-time comparison — both buffers must be the same length
  const a = Buffer.from(expectedSignature, "hex");
  const b = Buffer.from(signature, "hex");

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "signature_mismatch" };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Envelope Construction
// ---------------------------------------------------------------------------

/**
 * Create a standard webhook envelope.
 *
 * @param trigger - The trigger event
 * @param payload - The webhook payload data
 * @returns The full webhook envelope
 */
export function createWebhookEnvelope(
  trigger: WebhookTrigger,
  payload: WebhookPayload,
): WebhookEnvelope {
  return {
    triggerEvent: trigger,
    createdAt: new Date().toISOString(),
    payload,
  };
}

// ---------------------------------------------------------------------------
// Custom Payload Templates
// ---------------------------------------------------------------------------

/**
 * Resolve a custom payload template with webhook data.
 *
 * Replaces `{{variable}}` placeholders with values from the envelope.
 * Supported variables: triggerEvent, createdAt, bookingId, eventType,
 * startTime, endTime, status, and any workflow template variables.
 *
 * @param template - The JSON template string with {{variable}} placeholders
 * @param envelope - The webhook envelope
 * @returns The resolved JSON string
 */
export function resolvePayloadTemplate(
  template: string,
  envelope: WebhookEnvelope,
): string {
  const vars: Record<string, string> = {
    "{{triggerEvent}}": envelope.triggerEvent,
    "{{createdAt}}": envelope.createdAt,
    "{{bookingId}}": envelope.payload.bookingId,
    "{{eventType}}": envelope.payload.eventType,
    "{{startTime}}": envelope.payload.startTime,
    "{{endTime}}": envelope.payload.endTime,
    "{{status}}": envelope.payload.status,
    "{{organizerName}}": envelope.payload.organizer.name,
    "{{organizerEmail}}": envelope.payload.organizer.email,
  };

  // Use a single-pass regex replacement to prevent second-pass template injection:
  // a substituted value that itself contains "{{...}}" cannot be resolved again
  // because we only iterate the original template positions once.
  return template.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
    const placeholder = `{{${varName}}}`;
    const value = vars[placeholder];
    if (value === undefined) return _match; // leave unknown placeholders intact

    // JSON-escape the substituted value so it is safe inside a JSON string context
    return value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
  });
}

// ---------------------------------------------------------------------------
// Subscription Matching
// ---------------------------------------------------------------------------

/**
 * Find all active webhook subscriptions that match a trigger and optional scope.
 *
 * @param subscriptions - All available webhook subscriptions
 * @param trigger - The trigger event that occurred
 * @param scope - Optional scope filters (eventTypeId, teamId)
 * @returns Matching subscriptions
 */
export function matchWebhookSubscriptions(
  subscriptions: WebhookSubscription[],
  trigger: WebhookTrigger,
  scope?: { eventTypeId?: string; teamId?: string },
): WebhookSubscription[] {
  return subscriptions.filter((sub) => {
    if (!sub.isActive) return false;
    if (!sub.triggers.includes(trigger)) return false;

    // Scope filtering: subscription must match if it has a scope
    if (sub.eventTypeId && scope?.eventTypeId !== sub.eventTypeId) {
      return false;
    }
    if (sub.teamId && scope?.teamId !== sub.teamId) {
      return false;
    }

    return true;
  });
}

// ---------------------------------------------------------------------------
// Retry Logic
// ---------------------------------------------------------------------------

/**
 * Determine the delay before the next retry attempt.
 *
 * @param attempt - The current attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in seconds, or null if max retries exceeded
 */
export function getRetryDelay(
  attempt: number,
  config: WebhookRetryConfig = DEFAULT_RETRY_CONFIG,
): number | null {
  if (attempt >= config.maxRetries) return null;
  return config.backoffSeconds[attempt] ?? config.backoffSeconds[config.backoffSeconds.length - 1];
}

/**
 * Determine if a response code indicates success (2xx).
 *
 * @param statusCode - HTTP response status code
 * @returns Whether the delivery was successful
 */
export function isSuccessResponse(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a webhook subscription.
 *
 * @param subscription - The subscription to validate
 * @throws {WebhookValidationError} If the subscription is invalid
 */
export function validateWebhookSubscription(
  subscription: Omit<WebhookSubscription, "id">,
): void {
  if (!subscription.subscriberUrl) {
    throw new WebhookValidationError("Subscriber URL is required");
  }

  try {
    validateExternalUrl(subscription.subscriberUrl, "subscriber URL");
  } catch (err) {
    throw new WebhookValidationError(
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!Array.isArray(subscription.triggers) || subscription.triggers.length === 0) {
    throw new WebhookValidationError(
      "At least one trigger is required",
    );
  }

  for (const trigger of subscription.triggers) {
    if (!WEBHOOK_TRIGGERS.includes(trigger)) {
      throw new WebhookValidationError(
        `Invalid trigger: "${trigger}". Must be one of: ${WEBHOOK_TRIGGERS.join(", ")}`,
      );
    }
  }
}
