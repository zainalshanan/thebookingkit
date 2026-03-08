# E-12 — Recurring Bookings & Seats / Group Bookings

> **Priority:** Post-MVP · **Sprints:** 12–13 · **Story Points:** 21 · **Release:** R3

Enable repeating booking series and multi-attendee time slots for group events, classes, and workshops.

---

## User Stories

### 12.1 E12-S01 — Recurring Booking Series `[Must]` · 8 pts

- [ ] **Complete**

**As a** customer, **I want to** book a recurring appointment series **so that** I can set up weekly or biweekly sessions without booking each one individually.

**Acceptance Criteria:**

- [ ] Event types with `is_recurring = true` show a `<RecurringBookingPicker />` after slot selection.
- [ ] Customer selects frequency (weekly, biweekly, monthly) and number of occurrences (max configurable per event type).
- [ ] System validates all occurrences for availability before confirming.
- [ ] A `recurring_bookings` parent record is created; individual bookings link via `recurring_booking_id`.
- [ ] If any occurrence is unavailable, the customer is shown which dates conflict and can adjust.

---

### 12.2 E12-S02 — Recurring Series Management `[Must]` · 5 pts

- [ ] **Complete**

**As a** customer, **I want to** cancel a single occurrence or the entire recurring series **so that** I have flexibility to adjust my schedule without losing the whole series.

**Acceptance Criteria:**

- [ ] Cancelling one occurrence updates only that booking's status; other occurrences remain confirmed.
- [ ] Cancelling the series cancels all future occurrences (past/completed ones are unaffected).
- [ ] The management link for a recurring booking shows all occurrences with individual cancel options.
- [ ] A "Cancel All Future" button is available for series management.

---

### 12.3 E12-S03 — Seats / Group Bookings `[Must]` · 5 pts

- [ ] **Complete**

**As a** customer, **I want to** book a seat in a group event with limited capacity **so that** I can sign up for classes or group sessions.

**Acceptance Criteria:**

- [ ] Event types with `max_seats > 1` display remaining seat count on the slot picker.
- [ ] `<SeatsPicker />` shows available seats and allows the customer to reserve one.
- [ ] Each attendee creates a `booking_seats` record linked to the booking time slot.
- [ ] When all seats are filled, the slot is no longer shown as available.
- [ ] Each attendee receives individual confirmation and can cancel independently without affecting other attendees.

---

### 12.4 E12-S04 — Group Booking Dashboard View `[Should]` · 3 pts

- [ ] **Complete**

**As a** provider, **I want to** view group booking attendance on my dashboard **so that** I can see who has signed up for each group session.

**Acceptance Criteria:**

- [ ] The admin schedule view shows group events with an attendee count badge (e.g., "4/10 seats").
- [ ] Clicking opens the attendee list with names, emails, and individual statuses.
- [ ] Provider can manually add or remove attendees from the dashboard.
