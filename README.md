# The Booking Kit

**The Headless Booking Primitive** — an open-source TypeScript toolkit for building production-grade booking and scheduling systems.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-434%20passing-brightgreen)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-336791)](https://www.postgresql.org/)

**[Documentation](https://thebookingkit.dev)** | **[Live Demo](https://demo.thebookingkit.dev)** | **[GitHub](https://github.com/thebookingkit/thebookingkit)**

---

## What is The Booking Kit?

The Booking Kit gives you the database schema, scheduling math, and UI components to build a booking system — without locking you into a SaaS platform. It's designed for developers building with Next.js and Postgres who want full control over their booking flow.

**Philosophy: "Hide the Math, Expose the UI."** The hard parts (timezone-aware slot computation, RRULE expansion, double-booking prevention, team scheduling algorithms) are encapsulated in `@thebookingkit/core`. The UI components are copy-paste source code you own entirely, following the [shadcn/ui](https://ui.shadcn.com/) convention.

### Who is it for?

- **SaaS builders** adding booking to their platform (clinics, salons, studios, tutoring)
- **Agencies** building custom scheduling for clients
- **Solo developers** who need Cal.com-level features without the Cal.com codebase

---

## Features

### Core Scheduling Engine
- **Slot computation pipeline** — Three-step: RRULE expansion → override masking → booking/buffer filtering
- **Timezone-safe** — All math in UTC, display in any IANA timezone via `date-fns-tz`
- **Double-booking prevention** — Postgres `EXCLUDE USING gist` constraint + `SERIALIZABLE` transactions with automatic retry
- **Buffer time** — Configurable before/after padding between appointments
- **Booking limits** — Daily, weekly, monthly caps with rolling window support

### Event Types & Configuration
- **Custom booking questions** — Text, textarea, select, multiselect, checkbox, phone, number fields
- **Confirmation mode** — Auto-confirm or require manual approval with auto-reject deadlines
- **Recurring bookings** — Weekly, biweekly, monthly series with individual occurrence management
- **Group/seat bookings** — Capacity management with per-attendee tracking

### Team Scheduling
- **Round-robin** — Distribute bookings evenly across team members
- **Collective** — All members must be available (group interviews, panels)
- **Managed events** — Organization-level templates with locked/overridable fields
- **Fixed assignment** — Direct booking with a specific team member

### Payments & Pricing
- **Stripe integration** — Payment intents, setup intents, holds, captures, refunds via `PaymentAdapter`
- **Cancellation policies** — Tiered fee schedules based on hours before appointment
- **No-show fees** — Automatic hold capture for missed appointments

### Workflow Automation
- **Trigger-condition-action engine** — React to booking events with custom workflows
- **Built-in actions** — Send email, send SMS, fire webhook, update booking status, sync calendar
- **Template variables** — `{{customer.name}}`, `{{booking.date}}`, `{{event.title}}`, etc.

### Notifications & Calendar
- **Email templates** — Confirmation, reminder, cancellation, reschedule with HTML + plaintext
- **Google Calendar sync** — Two-way sync via `CalendarAdapter`
- **ICS attachments** — Auto-generated calendar invites

### Developer Tools
- **Webhooks** — HMAC-SHA256 signed payloads with replay protection and exponential backoff retry
- **REST API utilities** — API key auth, rate limiting (token bucket), cursor-based pagination
- **Embed modes** — Inline, popup, and floating widget with snippet generation
- **CLI utilities** — Component registry, dependency resolution, migration helpers
- **Multi-tenancy** — Organization isolation, RBAC (owner/admin/member), cascading settings resolution
- **Routing forms** — Pre-booking questionnaires that route to different event types or providers
- **GDPR compliance** — Built-in SQL functions to anonymize customer PII while maintaining audit trails

---

## Packages

| Package | Path | Description |
|---|---|---|
| `@thebookingkit/core` | `packages/core/` | Framework-agnostic scheduling engine, business logic, and adapter interfaces |
| `@thebookingkit/db` | `packages/db/` | Drizzle ORM schema (23 tables), migrations, and type exports for PostgreSQL 15+ |
| `@thebookingkit/ui` | `registry/ui/` | 21 React components (shadcn/ui convention) — booking calendar, slot picker, admin views |

### Framework Agnostic

- **`@thebookingkit/core`** is pure TypeScript with zero framework dependencies. It runs in Node.js, Deno, Bun, and edge runtimes.
- **`@thebookingkit/db`** uses standard Postgres via Drizzle ORM. The database-level constraints work regardless of your backend framework.
- **`@thebookingkit/ui`** provides React components. If you use Svelte, Vue, or Solid, use `@thebookingkit/core` for the math and build your own UI.

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ (local, Neon, Supabase, Railway, Vercel Postgres, AWS RDS)

### 1. Install

```bash
npm install @thebookingkit/core @thebookingkit/db
```

### 2. Set up the database

```bash
# Configure your Postgres connection
echo 'DATABASE_URL="postgresql://user:pass@localhost:5432/thebookingkit"' > .env

# Push the schema (creates tables, enums, indexes)
npx drizzle-kit push

# Apply custom SQL migrations (btree_gist, audit triggers, GDPR functions)
npx tsx packages/db/src/migrate.ts
```

### 3. Compute available slots

```typescript
import { getAvailableSlots } from "@thebookingkit/core";

const slots = getAvailableSlots({
  rules: [
    {
      rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      startTime: "09:00",
      endTime: "17:00",
      timezone: "America/New_York",
    },
  ],
  overrides: [],
  bookings: existingBookings,
  dateRange: { start: new Date("2026-03-09"), end: new Date("2026-03-14") },
  slotDuration: 30,
  bufferBefore: 0,
  bufferAfter: 15,
});
// Returns: Slot[] with { start, end } in UTC
```

### 4. Add UI components

Copy components from `registry/ui/src/components/` into your project:

```tsx
import { BookingCalendar } from "./components/booking-calendar";
import { TimeSlotPicker } from "./components/time-slot-picker";
import { BookingQuestions } from "./components/booking-questions";
import { BookingConfirmation } from "./components/booking-confirmation";

function BookingPage() {
  return (
    <>
      <BookingCalendar
        availableDates={dates}
        selectedDate={selected}
        onDateSelect={setSelected}
      />
      <TimeSlotPicker
        slots={slots}
        selectedSlot={slot}
        onSlotSelect={setSlot}
      />
      <BookingQuestions
        questions={eventType.questions}
        onSubmit={handleSubmit}
      />
    </>
  );
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Your Next.js App                   │
├──────────┬──────────────────┬────────────────────────┤
│  @thebookingkit/ui               │     API Routes          │
│  21 React components       │     (your code)         │
│  Copy-paste, you own them  │                         │
├──────────┴──────────────────┤                        │
│        @thebookingkit/core        │                        │
│  Slot engine, scheduling    │                        │
│  math, business logic       │                        │
├─────────────────────────────┼────────────────────────┤
│        @thebookingkit/db          │    Adapter Interfaces   │
│  Drizzle schema, 23 tables  │    Auth · Email · Jobs  │
│  PostgreSQL 15+             │    Calendar · Payment   │
└─────────────────────────────┴────────────────────────┘
```

### Slot Computation Pipeline

```
RRULE rules  →  Base windows  →  Apply overrides  →  Subtract bookings  →  Available slots
                 (expand)         (mask)               (filter + buffer)
```

### Adapter Pattern

External dependencies are abstracted behind TypeScript interfaces:

| Adapter | Default | Alternatives |
|---|---|---|
| `AuthAdapter` | NextAuth.js | Supabase Auth, Clerk, Lucia |
| `EmailAdapter` | Resend | SendGrid, AWS SES, Postmark |
| `CalendarAdapter` | Google Calendar | Outlook, CalDAV |
| `JobAdapter` | Inngest | Trigger.dev, BullMQ |
| `PaymentAdapter` | Stripe | — |
| `StorageAdapter` | Env var encryption | Vault, KMS |
| `SmsAdapter` | — | Twilio, MessageBird |

---

## UI Components

### Customer-Facing

| Component | Description |
|---|---|
| `BookingCalendar` | Date picker highlighting available dates |
| `TimeSlotPicker` | Time slot grid for selected date |
| `BookingQuestions` | Dynamic form from event type question config |
| `BookingConfirmation` | Summary and confirm step |
| `BookingStatusBadge` | Status pill (confirmed, pending, cancelled) |
| `BookingManagementView` | Customer booking list with cancel/reschedule |
| `RecurringBookingPicker` | Series frequency, count, and occurrence preview |
| `SeatsPicker` | Attendee count selector for group events |
| `RoutingForm` | Pre-booking questionnaire with conditional routing |
| `PaymentGate` | Payment step wrapper |
| `EmbedConfigurator` | Embed snippet generator with live preview |

### Host/Admin

| Component | Description |
|---|---|
| `AvailabilityEditor` | Weekly schedule builder with RRULE output |
| `OverrideManager` | Date-specific availability overrides |
| `AdminScheduleView` | Calendar view of bookings (react-big-calendar) |
| `BookingLifecycleActions` | Confirm, reject, cancel, no-show action buttons |
| `ManualBookingForm` | Admin-side booking creation |
| `ProviderAuth` | Auth wrapper component |
| `TeamAssignmentEditor` | Team member config with strategy selector |
| `WorkflowBuilder` | Visual workflow trigger/condition/action editor |
| `WebhookManager` | Webhook subscription CRUD with delivery logs |
| `PaymentHistory` | Payment and refund ledger |

---

## Database

23 tables managed by Drizzle ORM with full TypeScript type inference:

| Group | Tables |
|---|---|
| **Core** | `providers`, `event_types`, `availability_rules`, `availability_overrides`, `bookings`, `booking_events` |
| **Teams** | `teams`, `team_members`, `team_event_types` |
| **Payments** | `payments` |
| **Workflows** | `workflows`, `workflow_logs` |
| **Webhooks** | `webhook_subscriptions`, `webhook_deliveries` |
| **Recurring** | `recurring_series` |
| **Seats** | `seat_attendees` |
| **API** | `api_keys` |
| **Multi-Tenancy** | `organizations`, `organization_members` |
| **Other** | `out_of_office`, `routing_forms` |

Key infrastructure:
- `btree_gist` extension with `EXCLUDE` constraint for double-booking prevention
- Append-only `booking_events` audit trail for every status change
- GDPR anonymization SQL function for PII removal
- Automatic `updated_at` trigger on all tables

---

## Development

```bash
# Clone and install
git clone https://github.com/thebookingkit/thebookingkit.git
cd thebookingkit
npm install

# Run all tests (434 tests across 21 files)
turbo test

# Build all packages
turbo build

# Type check
turbo typecheck

# Database
npm run db:push       # Push schema to Postgres
npm run db:migrate    # Run migration files
npm run db:seed       # Seed sample data
```

### Project Structure

```
thebookingkit/
├── packages/
│   ├── core/                 # @thebookingkit/core
│   │   └── src/
│   │       ├── slot-engine.ts          # Three-step slot computation
│   │       ├── rrule-parser.ts         # RRULE expansion with EXDATE
│   │       ├── timezone.ts             # UTC normalization & conversion
│   │       ├── booking-limits.ts       # Daily/weekly/monthly caps
│   │       ├── team-scheduling.ts      # Round-robin, collective, managed
│   │       ├── payments.ts             # Cancellation policies & fees
│   │       ├── workflows.ts            # Trigger-condition-action engine
│   │       ├── webhooks.ts             # HMAC signing & retry logic
│   │       ├── recurring-bookings.ts   # Series generation
│   │       ├── seats.ts                # Group/capacity booking
│   │       ├── multi-tenancy.ts        # Org RBAC & settings
│   │       ├── routing-forms.ts        # Pre-booking routing
│   │       ├── api.ts                  # REST API utilities
│   │       ├── embed.ts                # Embed snippet generation
│   │       ├── cli.ts                  # CLI utilities
│   │       ├── auth.ts                 # Auth middleware
│   │       ├── adapters/               # Interface definitions
│   │       └── __tests__/              # 434 tests
│   ├── db/                   # @thebookingkit/db
│   │   └── src/
│   │       ├── schema/
│   │       │   ├── tables.ts           # 23 Postgres tables
│   │       │   └── enums.ts            # Status & type enums
│   │       ├── migrations/             # Custom SQL migrations
│   │       ├── client.ts               # Database connection
│   │       └── seed.ts                 # Sample data
│   └── ui/                   # @thebookingkit/ui
│       └── src/
│           ├── components/             # 21 React components
│           ├── hooks/                  # useAvailability, useProvider
│           └── utils/                  # cn() utility
├── docs/                     # Epic specs & PRD
├── turbo.json
└── package.json
```

---

## Deployment

### Database

The Booking Kit requires Postgres 15+ with the `btree_gist` extension. Works with any provider:

```bash
# Set production DATABASE_URL, then:
npx drizzle-kit migrate --config=packages/db/drizzle.config.ts
npx tsx packages/db/src/migrate.ts
```

### Application

Deploy your Next.js app to Vercel, Railway, or any Node.js host. Set environment variables:

```
DATABASE_URL=          # Postgres connection string
RESEND_API_KEY=        # Email (or your adapter's key)
STRIPE_SECRET_KEY=     # Payments (if using Stripe)
INNGEST_EVENT_KEY=     # Background jobs (if using Inngest)
GOOGLE_CLIENT_ID=      # Calendar sync (if using Google Calendar)
GOOGLE_CLIENT_SECRET=
```

### Background Jobs

The Booking Kit uses a `JobAdapter` interface. With Inngest (recommended):

1. Expose the API route at `app/api/inngest/route.ts`
2. Connect to Inngest Cloud
3. Set `INNGEST_EVENT_KEY` in production

---

## Tech Stack

| Category | Technology |
|---|---|
| Language | TypeScript 5.x (strict mode) |
| Framework | Next.js 14+ (App Router) |
| Database | PostgreSQL 15+ via Drizzle ORM |
| Auth | NextAuth.js 5.x (pluggable) |
| Jobs | Inngest 3.x (pluggable) |
| Testing | Vitest + fast-check (property-based) |
| UI | shadcn/ui, react-day-picker, react-big-calendar, react-hook-form |
| Dates | date-fns 3.x + date-fns-tz 3.x |
| Monorepo | Turborepo + npm workspaces |

---

## Roadmap

16 epics implemented covering the full booking lifecycle. Upcoming features:

| Feature | Description |
|---|---|
| **Slot Waitlist** | Join a queue when slots are full, auto-offer on cancellation |
| **Dynamic Pricing** | Peak/off-peak pricing, surge pricing, early bird discounts |
| **Walk-In Queue** | Hybrid appointment + walk-in scheduling for physical locations |
| **Kiosk Mode** | Full-screen drag-and-drop calendar for reception desks and tablets |

See the [full documentation](https://thebookingkit.dev) and the [live demo](https://demo.thebookingkit.dev) for more.

---

## Links

- **Documentation:** [thebookingkit.dev](https://thebookingkit.dev)
- **Live Demo:** [demo.thebookingkit.dev](https://demo.thebookingkit.dev)

---

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`turbo test`)
5. Submit a pull request

---

## Publishing (Maintainers Only)

> **These steps are for the repository owner only.** Contributors do not need to publish packages.

### 1. Bump versions

Update `version` in each package's `package.json`:

```bash
# packages/core/package.json
# packages/server/package.json
# packages/d1/package.json
# packages/cli/package.json
# Also update the version in packages/cli/src/bin.ts (.version("x.x.x"))
```

### 2. Build all packages

```bash
turbo build --filter='./packages/*'
```

### 3. Run tests

```bash
turbo test
```

### 4. Publish to npm

Publish each package separately (2FA browser prompt per package):

```bash
npm -w @thebookingkit/core publish
npm -w @thebookingkit/server publish
npm -w @thebookingkit/d1 publish
npm -w @thebookingkit/cli publish
```

> `@thebookingkit/db` is private and not published to npm.

### 5. Commit and push

```bash
git add -A
git commit -m "chore: release v0.x.x"
git push
```

---

## License

[MIT](LICENSE) — use The Booking Kit in personal and commercial projects.
