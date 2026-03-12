# @thebookingkit/db

## 0.1.5

### Minor Changes — QA Audit (2026-03-12)

9 bugs fixed in `@thebookingkit/db`.

### Bug Fixes

#### Critical

- **C1** — EXCLUDE constraint `bookings_no_overlap` now excludes `'rescheduled'` status alongside `'cancelled'` and `'rejected'`, preventing double-booking when rescheduling (`0001_setup_extensions.sql`)
- **C2** — Audit trigger ELSE branch uses `'updated'` as fallback event type instead of `'confirmed'`, preventing spurious confirmed events on non-status field updates (`0002_booking_audit_trigger.sql`)
- **C3** — Removed unconditional `v_metadata := '{}'::jsonb` line that silently discarded metadata computed in the IF/ELSIF/ELSE branches (`0002_booking_audit_trigger.sql`)

#### High

- **H4** — Added `.unique()` constraint to `teams.slug` column, preventing duplicate team slugs (`schema/tables.ts`)
- **H5** — Added `.unique()` constraint to `eventTypes.slug` column, preventing duplicate event type slugs (`schema/tables.ts`)

#### Medium

- **M4** — Changed `bookingEvents.bookingId` foreign key from `onDelete: "cascade"` to `onDelete: "restrict"`, protecting audit trail from accidental deletion when a booking is hard-deleted (`schema/tables.ts`)
- **M6** — Added `WalkInQueue` and `NewWalkInQueue` type exports to package index (`index.ts`)
- **M8** — Added `CREATE EXTENSION IF NOT EXISTS pgcrypto` to setup migration so the `digest()` function used by GDPR `anonymize_customer()` is available on fresh databases (`0001_setup_extensions.sql`)

#### Low

- **L5** — Added `"test": "vitest run"` script and `vitest` devDependency to `package.json`

## 0.1.1

### Patch Changes

- Initial release of The Booking Kit packages.
