# E-08 — Routing Forms

> **Priority:** Post-MVP · **Sprints:** 8–9 · **Story Points:** 18 · **Release:** R2

Pre-booking intake forms that collect information and dynamically route the customer to the correct event type or provider based on their responses.

---

## User Stories

### 8.1 E08-S01 — Routing Form Builder `[Must]` · 8 pts

- [ ] **Complete**

**As an** admin, **I want to** create a routing form with custom fields and conditional routing rules **so that** customers are automatically directed to the right service or provider.

**Acceptance Criteria:**

- [ ] Admin defines a routing form with: title, description, and an array of fields (dropdown, text, radio, checkbox).
- [ ] Routing rules are defined as: IF `field_x = value_y` THEN route to `event_type_z` (or `provider_id` / team round-robin).
- [ ] Multiple rules can be chained with AND/OR logic.
- [ ] A fallback route is required for unmatched responses.
- [ ] Form definition is stored in `routing_forms` table.

---

### 8.2 E08-S02 — Customer Routing Experience `[Must]` · 5 pts

- [ ] **Complete**

**As a** customer, **I want to** fill out a routing form and seamlessly enter the booking flow for the matched event type **so that** I don't have to know which specific service or provider I need.

**Acceptance Criteria:**

- [ ] `<RoutingForm />` component renders the form fields dynamically.
- [ ] On submission, routing rules are evaluated client-side and the matched event type is loaded.
- [ ] The customer seamlessly transitions to `<BookingCalendar />` for the routed event type.
- [ ] Routing submission is logged in `routing_submissions` with responses, matched event type, and timestamp.
- [ ] If no route matches, the fallback route is used.

---

### 8.3 E08-S03 — Routing Form Analytics `[Could]` · 5 pts

- [ ] **Complete**

**As an** admin, **I want to** view routing form analytics to see submission patterns **so that** I can optimize my routing rules and identify drop-off points.

**Acceptance Criteria:**

- [ ] Admin dashboard shows: total submissions, completion rate, route distribution (% per event type).
- [ ] Submissions are filterable by date range.
- [ ] Each submission links to its resulting booking (if one was created).
