# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Booking Kit ("The Headless Booking Primitive") is an open-source, MIT-licensed developer toolkit for building production-grade booking systems. It provides a Drizzle ORM database schema, scheduling math engine, and copy-paste UI components (shadcn/ui convention) for Next.js applications backed by any Postgres 15+ instance.

Philosophy: **"Hide the Math, Expose the UI."** The scheduling logic is encapsulated in `@thebookingkit/core`; UI components are copy-paste source code developers own entirely.

## Architecture

### Monorepo Structure (Turborepo)

| Package | Path | Purpose |
|---|---|---|
| `@thebookingkit/core` | `packages/core/` | Slot engine, timezone utils, RRULE parser, team scheduling algorithms |
| `@thebookingkit/db` | `packages/db/` | Drizzle ORM schema, migrations, type exports |
| `@thebookingkit/cli` | `packages/cli/` | Scaffolding CLI: init, add, migrate, generate, diff, update |
| `@thebookingkit/embed` | `packages/embed/` | Lightweight embed script for non-Next.js sites |
| UI Components | `registry/ui/` | 17+ React components (shadcn convention) |
| Documentation | `apps/docs/` | Astro Starlight documentation site |
| Barber Shop Demo | `apps/demo/` | Full working example application |

### Three System Layers

1. **Logic Package (`@thebookingkit/core`)** — Framework-agnostic scheduling math. Key APIs: `useAvailability`, `getAvailableSlots`, `getTeamSlots`, `assignHost`, `isSlotAvailable`. Uses `date-fns`/`date-fns-tz` for time, `rrule` for recurrence.
2. **UI Components (copy-paste)** — React components built on shadcn/ui, react-day-picker, react-big-calendar, react-hook-form. Developers own the source.
3. **Backend (Postgres + Next.js + Inngest)** — Drizzle ORM schema, Next.js API routes, Inngest background jobs. Middleware-based auth via pluggable `AuthAdapter` (NextAuth.js default).

### Slot Computation Pipeline (Three-Step)

1. **Base Layer:** Expand `availability_rules` via RRULE into time windows
2. **Mask Layer:** Apply `availability_overrides` and `out_of_office` entries
3. **Filter Layer:** Subtract existing bookings, apply buffer time, enforce booking limits

### Adapter Pattern

External dependencies are abstracted behind TypeScript interfaces with swappable implementations:
- `AuthAdapter` — NextAuth.js default; alternatives: Supabase Auth, Clerk, Lucia
- `JobAdapter` — Inngest default; alternatives: Trigger.dev, BullMQ, Vercel Cron
- `EmailAdapter` — Resend default; alternatives: SendGrid, AWS SES, Postmark
- `CalendarAdapter` — Google Calendar OAuth default
- `StorageAdapter` — Env var encryption key default

### Double-Booking Prevention

Database-level `EXCLUDE USING gist` constraint with `btree_gist` extension. Bookings run in `SERIALIZABLE` transactions with `withSerializableRetry()` (catches SQLSTATE 40001, retries up to 3x with jittered exponential backoff).

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript 5.x (strict mode)
- **Database:** PostgreSQL 15+ (any provider) via Drizzle ORM
- **Auth:** NextAuth.js 5.x (Auth.js) via AuthAdapter
- **Background Jobs:** Inngest 3.x via JobAdapter
- **Testing:** Vitest with fast-check for property-based testing
- **UI:** shadcn/ui, react-day-picker 9.x, react-big-calendar 1.x, react-hook-form 7.x
- **Dates:** date-fns 3.x + date-fns-tz 3.x
- **Monorepo:** Turborepo + Changesets
- **Docs:** Astro Starlight
- **CI/CD:** GitHub Actions (lint, typecheck, test, build)

## Development Commands

```bash
# Install dependencies
npm install

# Build all packages
turbo build

# Run all tests
turbo test

# Lint
turbo lint

# Type check
turbo typecheck

# Database migrations
npx drizzle-kit push    # Push schema to database
npx drizzle-kit migrate # Run migration files

# Run the demo app
turbo dev --filter=demo

# Add a UI component (CLI)
npx @thebookingkit/cli add <component-name>
```

## Key Conventions

- All tables include `id` (UUID), `created_at`, `updated_at` columns
- Optional `organization_id` on tables for multi-tenancy readiness
- Booking status state machine: `pending` -> `confirmed` -> `completed`/`cancelled`/`rescheduled`/`no_show`; `pending` -> `rejected`
- Every booking state change is recorded in `booking_events` (append-only audit trail)
- JSDoc comments required on all exported functions, types, and component props
- Test coverage targets: >95% core logic, >85% UI, >90% API routes
- Branch strategy: `main` <- `develop` <- `feature/*` | `fix/*` | `docs/*`
- Squash merge to `main`; changelog via Changesets

## Change Workflow — Registry Components

When modifying any component in `registry/ui/src/components/`:

1. **Build** — Run `turbo build --filter=@thebookingkit/ui` (or the relevant package build script) to verify the component compiles without errors.
2. **Test** — Run `turbo test --filter=@thebookingkit/ui` to ensure all component tests pass.
3. **Sync copies** — Copy the updated source to `apps/docs/public/registry/components/<component>.tsx` so the docs site serves the latest version for the CLI `add` command.
4. **Update docs** — If the component's props, behavior, or usage changed, update the corresponding MDX file in `apps/docs/src/content/docs/components/`.
5. **Update demo** — If the demo app (`apps/demo/`) uses the component, update it there too. Run `turbo dev --filter=demo` to verify.
6. **Changelog** — Add a changeset entry via `npx changeset` describing what changed and why.
7. **Commit** — Do NOT commit without explicit permission from the owner. Stage the changes and present a summary for review first.

## Change Workflow — Packages (`packages/*`)

When modifying any package (`@thebookingkit/core`, `@thebookingkit/d1`, `@thebookingkit/db`, `@thebookingkit/cli`, `@thebookingkit/embed`):

1. **Build** — Run the package's build script (e.g., `cd packages/d1 && npm run build` or `turbo build --filter=@thebookingkit/d1`). The package MUST compile cleanly before anything else.
2. **Test** — Run the package's test suite (e.g., `npm test` or `turbo test --filter=@thebookingkit/d1`). All tests must pass. If you changed behavior, add or update tests to cover it.
3. **Changelog** — Run `npx changeset` and create an entry. Use `patch` for bug fixes, `minor` for new features/exports, `major` for breaking changes.
4. **Update docs** — If exported APIs, types, or behaviors changed, update the relevant documentation in `apps/docs/`. Check for outdated examples in MDX files.
5. **Update consumers** — If the change affects the demo app or registry components, update those too and verify they still work.
6. **Publish** — Do NOT publish (`npm publish` / `npx changeset publish`) without explicit permission from the owner. Present the changeset summary and version bump for review first.
7. **Commit** — Do NOT commit without explicit permission from the owner. Stage all changes and present a summary for review.

## Project Status

This project is in the planning/documentation phase. The `docs/` directory contains the full PRD (`PRD.md`) and 16 epic specifications (`E-01` through `E-16`) with detailed user stories and acceptance criteria. MVP scope covers Epics 1-6 (database schema, slot engine, event types, booking flow, admin dashboard, notifications/calendar sync).
