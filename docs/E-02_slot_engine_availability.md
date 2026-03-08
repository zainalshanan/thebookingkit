# E-02 — Slot Engine & Availability Logic

> **Priority:** MVP · **Sprints:** 1–2 · **Story Points:** 39 · **Release:** R1

Build the core scheduling math in `@slotkit/core`: RRULE expansion, timezone conversion, the three-step slot computation pipeline, and the `useAvailability` React hook. This is the intellectual heart of the project.

---

## User Stories

### 2.1 E02-S01 — RRULE Parser `[Must]` · 8 pts

- [x] **Complete**

**As a** developer, **I want to** call `parseRecurrence(rruleString)` and get concrete date/time occurrences **so that** I don't have to understand the RRULE spec to work with recurring schedules.

**Acceptance Criteria:**

- [x] `parseRecurrence` accepts a valid RRULE string and a date range (`startDate`, `endDate`).
- [x] Returns an array of `{ date, startTime, endTime }` objects for each occurrence in the range.
- [x] Handles `FREQ=WEEKLY` with `BYDAY` (e.g., `MO,WE,FR`) correctly.
- [x] Handles `UNTIL` and `COUNT` termination correctly.
- [x] Handles `EXDATE` exclusions (e.g., holidays) correctly.
- [x] Throws a typed `InvalidRRuleError` for malformed strings with a descriptive message.
- [x] Tested with 10+ RRULE variations including edge cases.

---

### 2.2 E02-S02 — UTC Normalization with DST Handling `[Must]` · 5 pts

- [x] **Complete**

**As a** developer, **I want to** call `normalizeToUTC(localTime, timezone)` and get correct UTC times across DST transitions **so that** timezone math never produces off-by-one-hour bugs in my app.

**Acceptance Criteria:**

- [x] `normalizeToUTC` accepts a local datetime string and an IANA timezone identifier.
- [x] Returns a UTC ISO-8601 datetime string.
- [x] Correctly handles spring-forward DST: a time in the "gap" is adjusted to the next valid time.
- [x] Correctly handles fall-back DST: an ambiguous time defaults to the first occurrence (standard time).
- [x] Throws a typed `InvalidTimezoneError` for unrecognized timezone strings.
- [x] Property-based test: for 1000 random datetimes across 20 timezones, roundtrip UTC→local→UTC is identity.

---

### 2.3 E02-S03 — Three-Step Slot Computation Pipeline `[Must]` · 13 pts

- [x] **Complete**

**As a** developer, **I want to** call `getAvailableSlots(providerId, dateRange, timezone, options)` and get the final list of bookable slots **so that** the complex three-step pipeline (Base → Mask → Filter) is handled for me.

**Acceptance Criteria:**

- [x] Accepts `providerId`, `dateRange` (`{ start, end }`), `timezone` (IANA), and `options` (`{ duration, buffer, eventTypeId }`).
- [x] Step 1 (Base): Expands provider's `availability_rules` via RRULE for the date range, generating raw slots at the configured duration interval.
- [x] Step 2 (Mask): Applies `availability_overrides` — removes slots on blocked days, adds slots for extra-hours days.
- [x] Step 3 (Filter): Subtracts existing non-cancelled bookings and applies buffer time before/after each booking.
- [x] Returns `Slot[]` where each Slot has `{ startTime: UTC, endTime: UTC, localStart: string, localEnd: string }`.
- [x] Slots are sorted chronologically.
- [x] For a provider with Mon–Fri 9–5 availability, 30min slots, and one booking at 10:00, calling for a Monday returns all slots except 10:00 (and respects buffer).
- [x] Performance: computes 30 days of slots for a single provider in < 100ms.

---

### 2.4 E02-S04 — `useAvailability` React Hook `[Must]` · 8 pts

- [x] **Complete**

**As a** developer, **I want to** use the `useAvailability` React hook in my component and get reactive slot data **so that** I have a single-line integration point that handles fetching, caching, and recomputation.

**Acceptance Criteria:**

- [x] `useAvailability({ providerId, date, duration, timezone, buffer?, eventTypeId? })` returns `{ slots, isLoading, error }`.
- [x] Re-fetches and recomputes when `date` or `providerId` changes.
- [x] Returns `isLoading: true` during computation, `false` after.
- [x] Returns typed error if provider not found or database query fails.
- [x] Slots are returned in the customer's timezone (formatted `localStart`, `localEnd`).
- [x] Hook is SSR-compatible (does not throw during server-side rendering).

---

### 2.5 E02-S05 — Single Slot Availability Check `[Should]` · 3 pts

- [x] **Complete**

**As a** developer, **I want to** call `isSlotAvailable(providerId, startTime, endTime)` for a quick single-slot check **so that** I can validate a specific slot before attempting to book it.

**Acceptance Criteria:**

- [x] Returns `true` if the slot falls within an availability window and does not overlap any non-cancelled booking.
- [x] Returns `false` with a reason string if unavailable (`'outside_availability'`, `'already_booked'`, `'blocked_date'`, `'buffer_conflict'`).
- [x] Queries the database once with an efficient query (not full slot recomputation).
- [x] Execution time < 50ms at p99.

---

### 2.6 E02-S06 — Timezone & DST Test Suite `[Must]` · 2 pts

- [x] **Complete**

**As a** developer, **I want to** have a comprehensive test suite covering timezone and DST edge cases **so that** I can trust the slot engine in production across all timezones.

**Acceptance Criteria:**

- [x] Test matrix covers: US Eastern (spring/fall DST), Europe/London (GMT/BST), Australia/Sydney (southern hemisphere DST), Asia/Tokyo (no DST), UTC.
- [x] Tests cover: slot generation across a DST transition day, booking at the exact DST boundary, availability override on a DST day.
- [x] Property-based tests with fast-check: random provider schedules + random bookings always produce non-overlapping slots.
- [x] Core logic test coverage > 95% lines.
- [x] All tests pass in CI on Node.js 18 and 20.
