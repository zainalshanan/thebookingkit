# E-05 — Host & Admin Dashboard

> **Priority:** MVP · **Sprints:** 4–5 · **Story Points:** 36 · **Release:** R1

Build the host-facing management tools: provider authentication, availability editor, override manager, schedule dashboard, and booking management. These components give providers full control over their scheduling.

---

## User Stories

### 5.1 E05-S01 — Availability Editor `[Must]` · 8 pts

- [x] **Complete**

**As a** provider, **I want to** define my weekly recurring availability using a visual editor **so that** I can set my working hours without writing RRULE strings manually.

**Acceptance Criteria:**

- [x] `<AvailabilityEditor />` displays a week view (Mon–Sun) with draggable time blocks.
- [x] Provider clicks on a day to add a time range (e.g., 9:00 AM – 5:00 PM).
- [x] Multiple ranges per day are supported (e.g., 9–12 and 1–5 for a lunch break).
- [x] Saving generates a valid RRULE string for each unique pattern and stores it in `availability_rules`.
- [x] The editor validates that ranges don't overlap within the same day.
- [x] Existing rules are loaded and displayed when the editor opens.
- [x] A timezone selector shows the provider's current timezone (stored on the provider record).

---

### 5.2 E05-S02 — Override Manager `[Must]` · 5 pts

- [x] **Complete**

**As a** provider, **I want to** block specific dates or add extra hours **so that** I can handle vacations, holidays, and one-off schedule changes.

**Acceptance Criteria:**

- [x] `<OverrideManager />` shows a calendar view where dates with overrides are highlighted.
- [x] Provider selects a date and chooses: "Mark as unavailable" (blocks entire day) or "Custom hours" (specify start/end times).
- [x] Unavailable overrides create a row in `availability_overrides` with `is_unavailable = true`.
- [x] Custom hours overrides create a row with `is_unavailable = false` and the specified time range.
- [x] Provider can add an optional reason text (e.g., "Dentist appointment", "Public holiday").
- [x] Existing overrides are loaded; provider can edit or delete them.
- [x] Overrides take precedence over RRULE-based availability in slot computation.

---

### 5.3 E05-S03 — Admin Schedule View `[Must]` · 8 pts

- [x] **Complete**

**As a** provider, **I want to** see all my bookings in a weekly calendar view **so that** I have an at-a-glance view of my schedule.

**Acceptance Criteria:**

- [x] `<AdminScheduleView />` renders a week/month calendar using `react-big-calendar`.
- [x] Bookings are displayed as colored blocks: green (confirmed), yellow (pending), grey (cancelled), red (no-show).
- [x] Clicking a booking opens a detail popover with customer info, booking questions, and action buttons.
- [x] Provider can navigate between weeks and months.
- [x] Current day and time are highlighted.
- [x] The view filters by the provider's own bookings by default.

---

### 5.4 E05-S04 — Booking Lifecycle Actions `[Must]` · 5 pts

- [x] **Complete**

**As a** provider, **I want to** confirm, cancel, or mark bookings as no-show from my dashboard **so that** I can manage the lifecycle of each appointment without raw database access.

**Acceptance Criteria:**

- [x] Pending bookings show Confirm and Reject buttons.
- [x] Confirmed bookings show Cancel and Mark No-Show buttons.
- [x] Each action updates the booking status and logs a `booking_event` with the provider as actor.
- [x] Cancel prompts for an optional reason text stored in event metadata.
- [x] No-show marks the booking as `'no_show'` status.
- [x] A success toast notification confirms each action.
- [x] The calendar view updates in real time after status changes.

---

### 5.5 E05-S05 — Manual Booking Creation `[Should]` · 5 pts

- [x] **Complete**

**As a** provider, **I want to** manually create a booking from the admin dashboard **so that** I can book walk-in customers or phone appointments directly.

**Acceptance Criteria:**

- [x] A "New Booking" button opens a form with: event type selector, date/time picker, customer name, customer email.
- [x] The form validates against real availability (cannot create overlapping bookings).
- [x] Created booking goes directly to `'confirmed'` status.
- [x] A `booking_event` with `event_type 'created'` and `actor = provider` is logged.
- [x] The new booking appears immediately on the calendar view.

---

### 5.6 E05-S06 — Provider Authentication `[Must]` · 5 pts

- [x] **Complete**

**As a** provider, **I want to** sign up, log in, and reset my password to access the admin dashboard **so that** I can securely access my scheduling dashboard without the developer building auth from scratch.

**Acceptance Criteria:**

- [x] A `<ProviderAuth />` component wraps the default `AuthAdapter` (NextAuth.js) with pre-configured settings for email/password and OAuth (Google) login.
- [x] Signup flow creates both an auth user and a linked `providers` record with default timezone (auto-detected).
- [x] Login redirects to the admin dashboard; unauthenticated users are redirected to login.
- [x] Password reset flow sends a reset email and handles the token-based reset page.
- [x] Session management uses the `AuthAdapter` pattern integrated with Next.js middleware (works with App Router).
- [x] A `useProvider()` hook returns the authenticated provider's profile, loading state, and logout function.
- [x] Documentation includes a guide for developers who want to swap auth adapters (e.g., Clerk, Supabase Auth, Lucia) by implementing the `AuthAdapter` interface.
- [x] `withAuth()` middleware on all routes enforces that the authenticated user can only access their own data.
