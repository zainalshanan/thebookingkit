/**
 * Abstract interface for SMS delivery.
 *
 * Default implementation: Twilio.
 * Alternatives: AWS SNS, Vonage, or mock for testing.
 */

/** Options for sending an SMS */
export interface SendSmsOptions {
  /** Recipient phone number (E.164 format) */
  to: string;
  /** SMS body text */
  body: string;
  /** Sender phone number or alphanumeric sender ID */
  from?: string;
}

/** Result of an SMS send operation */
export interface SmsResult {
  /** Message ID from the SMS provider */
  messageId: string;
  /** Delivery status */
  status: "queued" | "sent" | "delivered" | "failed";
}

/**
 * SMS delivery adapter interface.
 *
 * Implementations handle sending SMS messages via a provider
 * (e.g., Twilio, AWS SNS).
 */
export interface SmsAdapter {
  /** Send an SMS message */
  send(options: SendSmsOptions): Promise<SmsResult>;
}
