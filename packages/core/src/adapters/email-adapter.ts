/**
 * Email sending adapter interface.
 * Default implementation uses Resend. Swap to SendGrid, AWS SES,
 * or Postmark by implementing this interface.
 */
export interface EmailAdapter {
  /** Send a single email */
  send(options: SendEmailOptions): Promise<EmailResult>;
  /** Send multiple emails in a batch */
  sendBatch(emails: SendEmailOptions[]): Promise<EmailResult[]>;
  /** Get delivery status of a previously sent email */
  getDeliveryStatus?(messageId: string): Promise<EmailDeliveryStatus>;
}

/** Options for sending an email */
export interface SendEmailOptions {
  /** Recipient email address */
  to: string;
  /** Subject line */
  subject: string;
  /** HTML body */
  html: string;
  /** Plain text body (fallback) */
  text?: string;
  /** From address (defaults to configured sender) */
  from?: string;
  /** Reply-to address */
  replyTo?: string;
  /** Additional headers (List-Unsubscribe, etc.) */
  headers?: Record<string, string>;
  /** File attachments */
  attachments?: EmailAttachment[];
  /** Tags for categorization */
  tags?: Record<string, string>;
}

/** An email attachment */
export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

/** Result of sending an email */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** Delivery status of an email */
export interface EmailDeliveryStatus {
  status: "sent" | "delivered" | "bounced" | "complained" | "failed";
  timestamp: Date;
}

/**
 * Generate an ICS calendar attachment for a booking.
 */
export function generateICSAttachment(booking: {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  location?: string;
  description?: string;
  organizerEmail?: string;
  attendeeEmail: string;
}): EmailAttachment {
  const formatICSDate = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SlotKit//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.id}@slotkit`,
    `DTSTART:${formatICSDate(booking.startsAt)}`,
    `DTEND:${formatICSDate(booking.endsAt)}`,
    `SUMMARY:${escapeICS(booking.title)}`,
    booking.location ? `LOCATION:${escapeICS(booking.location)}` : "",
    booking.description ? `DESCRIPTION:${escapeICS(booking.description)}` : "",
    booking.organizerEmail ? `ORGANIZER:mailto:${booking.organizerEmail}` : "",
    `ATTENDEE:mailto:${booking.attendeeEmail}`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return {
    filename: "booking.ics",
    content: ics,
    contentType: "text/calendar",
  };
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
