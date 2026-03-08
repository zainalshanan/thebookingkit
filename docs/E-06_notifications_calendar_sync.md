# E-06 — Notifications & Calendar Sync

> **Priority:** MVP · **Sprints:** 5–6 · **Story Points:** 31 · **Release:** R1

Implement email notifications for key booking events, email deliverability safeguards, and two-way Google Calendar sync. These are delivered as Inngest background jobs (or equivalent via `JobAdapter`) that developers deploy to their own stack.

---

## User Stories

### 6.1 E06-S01 — Booking Confirmation Email `[Must]` · 8 pts

- [x] **Complete**

**As a** customer, **I want to** receive a confirmation email when my booking is created **so that** I have proof of my appointment and can add it to my calendar.

**Acceptance Criteria:**

- [x] An Inngest function triggers on new booking insertion (via booking event).
- [x] Email is sent to `customer_email` with: event type name, date/time (in customer's timezone), provider name, location, and a booking management link.
- [x] Email includes an `.ics` calendar attachment for one-click add to any calendar app.
- [x] Email template is customizable (HTML template file with variable placeholders).
- [x] Provider also receives a notification email about the new booking.
- [x] The function uses Resend (default) or SendGrid (configurable) as the email provider via `EmailAdapter`.
- [x] All transactional emails include a mandatory unsubscribe/opt-out link in the footer that, when clicked, sets an `email_opt_out` flag on the customer's record.
- [x] Subsequent booking-related emails for that customer are suppressed when `email_opt_out = true` (except booking confirmation, which is transactional and required).

---

### 6.2 E06-S02 — Reminder Emails `[Must]` · 5 pts

- [x] **Complete**

**As a** customer, **I want to** receive a reminder email before my appointment **so that** I'm less likely to forget or no-show.

**Acceptance Criteria:**

- [x] A scheduled Inngest cron function checks for bookings starting in the next 24h and 1h.
- [x] Reminder emails are sent only for confirmed bookings where the customer has not opted out of email communications.
- [x] Reminder includes: event type, time, provider, location, reschedule/cancel link, and an unsubscribe link.
- [x] The reminder intervals are configurable per event type (default: 24h and 1h).
- [x] Bookings that have already received a reminder are flagged to prevent duplicates.
- [x] Cancelled bookings do not receive reminders.

---

### 6.3 E06-S03 — Cancellation & Reschedule Notifications `[Must]` · 3 pts

- [x] **Complete**

**As a** customer, **I want to** receive a notification when my booking is cancelled or rescheduled **so that** I'm immediately informed of changes to my appointment.

**Acceptance Criteria:**

- [x] Cancellation by either party triggers an email to both customer and provider.
- [x] Email includes: cancellation reason (if provided), original booking details.
- [x] Rescheduling triggers an email with both old and new date/time details.
- [x] Emails are sent from the same Inngest function infrastructure as confirmations.

---

### 6.4 E06-S04 — Google Calendar Sync `[Should]` · 8 pts

- [x] **Complete**

**As a** provider, **I want to** connect my Google Calendar so bookings sync automatically **so that** I see all my bookings in my existing calendar without manual entry.

**Acceptance Criteria:**

- [x] A Next.js API route handles Google OAuth flow for calendar access via `CalendarAdapter`.
- [x] On new confirmed booking: an event is created on the provider's Google Calendar with title, customer info, and notes.
- [x] On booking cancellation: the corresponding Google Calendar event is deleted.
- [x] On booking reschedule: the Google Calendar event is updated with new time.
- [x] OAuth tokens are stored securely (encrypted at rest via `StorageAdapter`).
- [x] A setup guide documents the Google Cloud Console configuration required.

---

### 6.5 E06-S05 — External Calendar Conflict Checking `[Could]` · 2 pts

- [x] **Complete**

**As a** provider, **I want to** have my Google Calendar events block availability automatically **so that** customers can't book during my personal appointments.

**Acceptance Criteria:**

- [x] An Inngest cron function periodically fetches upcoming events from the provider's connected Google Calendar(s).
- [x] External events are treated as bookings during slot computation (Filter step).
- [x] Provider configures which calendar(s) to check for conflicts.
- [x] Sync frequency is configurable (default: every 5 minutes via cron).
- [x] Only event times are used for conflict detection; event details are not stored.

---

### 6.6 E06-S06 — Email Deliverability Safeguards `[Should]` · 5 pts

- [x] **Complete**

**As a** developer, **I want to** have email deliverability safeguards including bounce handling and domain reputation protection **so that** my booking emails reliably reach customers' inboxes and my sender domain isn't blacklisted.

**Acceptance Criteria:**

- [x] The email Inngest function registers a webhook with the email provider (Resend/SendGrid) to receive delivery status callbacks: delivered, bounced, complained, dropped.
- [x] Bounce events (hard bounce) automatically set a `bounced_at` flag on the customer email record; subsequent sends to that address are skipped with a logged warning.
- [x] Spam complaint events are logged and the customer is automatically opted out of future non-transactional emails.
- [x] An `email_delivery_log` table records: `booking_id`, `email_type` (confirmation, reminder, cancellation), `recipient`, `status` (sent, delivered, bounced, complained), and timestamp.
- [x] All outgoing emails include proper headers: `List-Unsubscribe`, `List-Unsubscribe-Post` (RFC 8058 one-click unsubscribe), and a `Reply-To` set to the provider's email.
- [x] Documentation includes a setup guide for configuring SPF, DKIM, and DMARC records for the sending domain to maximize deliverability.
