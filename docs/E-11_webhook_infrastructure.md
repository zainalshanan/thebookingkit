# E-11 — Webhook Infrastructure

> **Priority:** Post-MVP · **Sprints:** 11–12 · **Story Points:** 21 · **Release:** R3

Typed, event-driven webhook system for integrating with external services. Includes HMAC signing, retry logic, and delivery logging.

---

## User Stories

### 11.1 E11-S01 — Webhook Subscriptions `[Must]` · 5 pts

- [ ] **Complete**

**As a** developer, **I want to** subscribe to booking lifecycle events via webhooks **so that** I can integrate the booking system with my own backend services.

**Acceptance Criteria:**

- [ ] Developer creates a webhook subscription with: `subscriber_url`, selected triggers, and optional secret key.
- [ ] Subscriptions can be scoped to: all events (user-level), specific event type, or team.
- [ ] Supported triggers: `BOOKING_CREATED`, `BOOKING_CONFIRMED`, `BOOKING_CANCELLED`, `BOOKING_RESCHEDULED`, `BOOKING_REJECTED`, `BOOKING_PAID`, `BOOKING_NO_SHOW`, `FORM_SUBMITTED`, `OOO_CREATED`.
- [ ] Webhooks are stored in the `webhooks` table with `is_active` flag.

---

### 11.2 E11-S02 — Signed Payloads with Replay Protection `[Must]` · 8 pts

- [ ] **Complete**

**As a** developer, **I want to** receive signed webhook payloads with replay attack protection and a consistent schema **so that** I can verify payload authenticity, prevent replay attacks, and parse data reliably.

**Acceptance Criteria:**

- [ ] All webhook payloads follow the envelope: `{ triggerEvent, createdAt, payload: { bookingId, eventType, startTime, endTime, organizer, attendees, status, responses, metadata } }`.
- [ ] If a secret is configured, payloads include an `X-SlotKit-Signature` header with `HMAC-SHA256(secret, timestamp + '.' + rawBody)`.
- [ ] An `X-SlotKit-Timestamp` header is included with the Unix timestamp (seconds) of when the webhook was dispatched.
- [ ] The verification documentation and helper function instruct developers to reject payloads where the timestamp is older than 5 minutes (configurable tolerance window), preventing replay attacks.
- [ ] A `verifyWebhookSignature(payload, signature, timestamp, secret, { toleranceSeconds?: 300 })` utility is exported from `@slotkit/core` that returns `{ valid: boolean, reason?: string }`.
- [ ] The helper returns `{ valid: false, reason: 'timestamp_expired' }` for payloads outside the tolerance window, and `{ valid: false, reason: 'signature_mismatch' }` for tampered payloads.
- [ ] All datetime fields are ISO 8601 UTC.
- [ ] A TypeScript type definition for the webhook payload is exported from `@slotkit/core`.

---

### 11.3 E11-S03 — Retry Logic & Delivery Logging `[Must]` · 5 pts

- [ ] **Complete**

**As a** developer, **I want to** have failed webhook deliveries retried automatically **so that** temporary outages in my service don't cause me to miss events.

**Acceptance Criteria:**

- [ ] Failed deliveries (non-2xx response or timeout) are retried up to 3 times with exponential backoff (10s, 60s, 300s).
- [ ] Each delivery attempt is logged in `webhook_deliveries` with: `webhook_id`, `trigger`, `payload` hash, `response_code`, `delivered_at`.
- [ ] After 3 failures, the delivery is marked as `'failed'` and no further retries occur.
- [ ] A `<WebhookManager />` admin component shows delivery history with success/failure status.

---

### 11.4 E11-S04 — Custom Payload Templates `[Could]` · 3 pts

- [ ] **Complete**

**As a** developer, **I want to** use custom payload templates for my webhooks **so that** I can shape the webhook data to match my external service's expected format.

**Acceptance Criteria:**

- [ ] Webhook subscriptions support an optional `payload_template` (JSON string with `{{variable}}` placeholders).
- [ ] Variables follow the same system as workflow templates.
- [ ] If no template is specified, the full default envelope is sent.
- [ ] A test button sends a sample payload to the subscriber URL for validation.
