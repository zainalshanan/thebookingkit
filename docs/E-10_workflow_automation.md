# E-10 — Workflow Automation Engine

> **Priority:** Post-MVP · **Sprints:** 10–11 · **Story Points:** 26 · **Release:** R3

Trigger-condition-action automation framework for sending emails, SMS, and custom webhook calls based on booking lifecycle events.

---

## User Stories

### 10.1 E10-S01 — Workflow CRUD & Execution `[Must]` · 8 pts

- [x] **Complete**

**As a** provider, **I want to** create a workflow with a trigger, conditions, and one or more actions **so that** I can automate repetitive tasks around my bookings without code.

**Acceptance Criteria:**

- [x] Workflow model: one trigger (e.g., `BOOKING_CREATED`), optional conditions (e.g., `event_type = 'consultation'`), one or more actions (e.g., send email, send SMS).
- [x] Workflows are stored in the `workflows` table with `trigger`, `conditions` (JSON), `actions` (JSON array), and `is_active` flag.
- [x] An Inngest function evaluates workflows when booking events occur.
- [x] Execution is logged in `workflow_logs` with: `workflow_id`, `booking_id`, `action_type`, `status`, `error`, `executed_at`.

---

### 10.2 E10-S02 — Template Variables `[Must]` · 5 pts

- [x] **Complete**

**As a** provider, **I want to** use template variables in my workflow messages **so that** my automated messages are personalized with booking details.

**Acceptance Criteria:**

- [x] Templates support variables: `{booking.title}`, `{booking.startTime}`, `{booking.endTime}`, `{booking.date}`, `{attendee.name}`, `{attendee.email}`, `{host.name}`, `{event.location}`, `{event.duration}`, `{booking.managementUrl}`.
- [x] Variables are resolved at execution time from the booking and event type data.
- [x] Missing variables render as empty strings (not template literals).
- [x] Default templates are provided for: confirmation, 24h reminder, 1h reminder, cancellation, follow-up.

---

### 10.3 E10-S03 — Visual Workflow Builder `[Should]` · 8 pts

- [x] **Complete**

**As a** provider, **I want to** use a visual `<WorkflowBuilder />` to create and manage workflows **so that** I can set up automation without editing JSON or database rows.

**Acceptance Criteria:**

- [x] Step 1: Select trigger from a dropdown (booking created, cancelled, rescheduled, before start, after end, payment received, no-show).
- [x] Step 2: Optionally add conditions (event type filter, status filter).
- [x] Step 3: Add actions with configuration (email: to, subject, body template; SMS: to, body template; webhook: URL, payload).
- [x] Step 4: Toggle active/inactive.
- [x] Workflow execution history is viewable per workflow with status and error details.

---

### 10.4 E10-S04 — SMS Action via Twilio `[Could]` · 5 pts

- [x] **Complete**

**As a** provider, **I want to** send SMS reminders via workflow automation **so that** my customers get text message reminders on their phone.

**Acceptance Criteria:**

- [x] SMS action integrates with Twilio (API key configured per provider or globally).
- [x] Provider enters their Twilio credentials in settings.
- [x] SMS action sends to the customer's phone number (from `booking_questions_responses` or a dedicated phone field).
- [x] SMS delivery status is logged in `workflow_logs`.
- [x] SMS templates support the same variable system as email templates.
