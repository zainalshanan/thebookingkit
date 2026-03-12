/** Variables available in email templates */
export interface EmailTemplateVars {
  bookingId: string;
  eventTitle: string;
  providerName: string;
  customerName: string;
  customerEmail: string;
  date: string;
  time: string;
  duration: string;
  timezone: string;
  location?: string;
  managementUrl?: string;
  unsubscribeUrl?: string;
  cancelReason?: string;
  oldDate?: string;
  oldTime?: string;
  newDate?: string;
  newTime?: string;
}

/**
 * Interpolate template variables into a template string.
 * Variables use the format `{variableName}`.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function interpolateTemplate(
  template: string,
  vars: EmailTemplateVars,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = (vars as unknown as Record<string, string | undefined>)[key];
    return value != null ? escapeHtml(value) : match;
  });
}

/** Default booking confirmation email template (HTML) */
export const CONFIRMATION_EMAIL_HTML = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Booking Confirmed</h2>
  <p>Hi {customerName},</p>
  <p>Your booking has been confirmed. Here are the details:</p>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 8px; font-weight: bold;">Service</td><td style="padding: 8px;">{eventTitle}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Provider</td><td style="padding: 8px;">{providerName}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Date</td><td style="padding: 8px;">{date}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Time</td><td style="padding: 8px;">{time} ({timezone})</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Duration</td><td style="padding: 8px;">{duration}</td></tr>
  </table>
  <p style="margin-top: 20px;">
    <a href="{managementUrl}" style="display: inline-block; padding: 12px 24px; background: #0070f3; color: white; text-decoration: none; border-radius: 6px;">
      Manage Booking
    </a>
  </p>
  <p style="margin-top: 30px; font-size: 12px; color: #666;">
    <a href="{unsubscribeUrl}">Unsubscribe</a> from booking notifications.
  </p>
</div>
`.trim();

/** Default booking confirmation email (plain text) */
export const CONFIRMATION_EMAIL_TEXT = `
Booking Confirmed

Hi {customerName},

Your booking has been confirmed:

Service: {eventTitle}
Provider: {providerName}
Date: {date}
Time: {time} ({timezone})
Duration: {duration}

Manage your booking: {managementUrl}

To unsubscribe: {unsubscribeUrl}
`.trim();

/** Default reminder email template */
export const REMINDER_EMAIL_HTML = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Appointment Reminder</h2>
  <p>Hi {customerName},</p>
  <p>This is a reminder about your upcoming appointment:</p>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 8px; font-weight: bold;">Service</td><td style="padding: 8px;">{eventTitle}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Provider</td><td style="padding: 8px;">{providerName}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Date</td><td style="padding: 8px;">{date}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Time</td><td style="padding: 8px;">{time} ({timezone})</td></tr>
  </table>
  <p style="margin-top: 20px;">
    <a href="{managementUrl}" style="display: inline-block; padding: 12px 24px; background: #0070f3; color: white; text-decoration: none; border-radius: 6px;">
      Manage Booking
    </a>
  </p>
  <p style="margin-top: 30px; font-size: 12px; color: #666;">
    <a href="{unsubscribeUrl}">Unsubscribe</a>
  </p>
</div>
`.trim();

/** Default cancellation email template */
export const CANCELLATION_EMAIL_HTML = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Booking Cancelled</h2>
  <p>Hi {customerName},</p>
  <p>Your booking has been cancelled:</p>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 8px; font-weight: bold;">Service</td><td style="padding: 8px;">{eventTitle}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Date</td><td style="padding: 8px;">{date}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Time</td><td style="padding: 8px;">{time} ({timezone})</td></tr>
  </table>
  <p style="margin-top: 30px; font-size: 12px; color: #666;">
    <a href="{unsubscribeUrl}">Unsubscribe</a>
  </p>
</div>
`.trim();

/** Default reschedule email template */
export const RESCHEDULE_EMAIL_HTML = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Booking Rescheduled</h2>
  <p>Hi {customerName},</p>
  <p>Your booking has been rescheduled:</p>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 8px; font-weight: bold;">Service</td><td style="padding: 8px;">{eventTitle}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">Previous</td><td style="padding: 8px;">{oldDate} at {oldTime}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">New Date</td><td style="padding: 8px;">{newDate}</td></tr>
    <tr><td style="padding: 8px; font-weight: bold;">New Time</td><td style="padding: 8px;">{newTime} ({timezone})</td></tr>
  </table>
  <p style="margin-top: 20px;">
    <a href="{managementUrl}" style="display: inline-block; padding: 12px 24px; background: #0070f3; color: white; text-decoration: none; border-radius: 6px;">
      Manage Booking
    </a>
  </p>
  <p style="margin-top: 30px; font-size: 12px; color: #666;">
    <a href="{unsubscribeUrl}">Unsubscribe</a>
  </p>
</div>
`.trim();
