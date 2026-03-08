# E-14 — REST API

> **Priority:** Post-MVP · **Sprints:** 14–15 · **Story Points:** 21 · **Release:** R4

Full REST API as Next.js API routes, mirroring all UI capabilities for programmatic access by external systems and mobile apps.

---

## User Stories

### 14.1 E14-S01 — Core CRUD Endpoints `[Must]` · 8 pts

- [ ] **Complete**

**As a** developer, **I want to** manage event types, availability, and bookings via REST API **so that** I can build custom UIs or integrations without using the provided components.

**Acceptance Criteria:**

- [ ] API routes: `/api/event-types` (CRUD), `/api/availability` (CRUD rules + overrides), `/api/bookings` (create, list, cancel, reschedule, confirm, reject, mark no-show).
- [ ] All endpoints return JSON with consistent error format: `{ error: { code, message, details } }`.
- [ ] List endpoints support pagination (cursor-based), filtering, and sorting.
- [ ] Create/update endpoints validate input and return 400 with descriptive errors on failure.
- [ ] API reference is auto-generated from route schemas using a documentation tool.

---

### 14.2 E14-S02 — API Authentication `[Must]` · 5 pts

- [ ] **Complete**

**As a** developer, **I want to** authenticate API requests with API keys or signed tokens **so that** my API endpoints are secure and scoped to the correct provider/team.

**Acceptance Criteria:**

- [ ] Provider API keys are generated from the admin dashboard and stored hashed in the database.
- [ ] API key is passed via `Authorization: Bearer <key>` header.
- [ ] Each key is scoped to a specific provider or team.
- [ ] Public endpoints (slot queries) optionally accept no auth or a read-only key.
- [ ] Rate limiting: 120 requests/minute per API key (configurable).

---

### 14.3 E14-S03 — Slot Computation Endpoint `[Must]` · 5 pts

- [ ] **Complete**

**As a** developer, **I want to** compute available slots via API without using React hooks **so that** I can build server-side or non-React integrations.

**Acceptance Criteria:**

- [ ] `GET /api/slots?providerId=x&eventTypeId=y&start=date&end=date&timezone=tz` returns `Slot[]`.
- [ ] Response includes slot `startTime` (UTC), `endTime` (UTC), `localStart`, `localEnd`.
- [ ] Supports team slot computation: `GET /api/slots?teamId=x&strategy=ROUND_ROBIN`.
- [ ] Response time < 200ms at p95 for a 30-day range.

---

### 14.4 E14-S04 — Extended Resource Endpoints `[Should]` · 3 pts

- [ ] **Complete**

**As a** developer, **I want to** access team management, routing forms, and webhooks via API **so that** I can programmatically configure all aspects of the booking system.

**Acceptance Criteria:**

- [ ] API routes: `/api/teams` (CRUD + member management), `/api/routing-forms` (CRUD + rules), `/api/webhooks` (CRUD + delivery logs).
- [ ] Team member operations: add, remove, update role/priority/weight.
- [ ] Webhook operations include a test endpoint that sends a sample payload.
- [ ] All operations respect authorization middleware (API key determines access scope).
