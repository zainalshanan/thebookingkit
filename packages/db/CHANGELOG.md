# @thebookingkit/db

## 0.2.0

### Minor Changes — Resource & Capacity Booking (2026-03-17)

Adds three new tables and a migration for resource-based booking.

### New Features

#### Schema (`schema/tables.ts`)

- **`resources`** table — Bookable physical units (tables, rooms, courts) with `type`, `capacity`, `location`, and `is_active` fields.
- **`resourceAvailabilityRules`** table — RRULE-based recurring availability per resource (mirrors `availabilityRules`).
- **`resourceAvailabilityOverrides`** table — Date-specific availability exceptions per resource (mirrors `availabilityOverrides`).
- **`bookings.resource_id`** — Nullable FK to `resources` with `ON DELETE SET NULL`. Existing bookings are unaffected.
- **`EXCLUDE USING gist`** constraint on `(resource_id, tstzrange(starts_at, ends_at))` prevents overlapping bookings on the same resource. Scoped with `WHERE resource_id IS NOT NULL`.

#### Migration (`0005_resources.sql`)

- Creates all three tables with indexes
- Adds `resource_id` column and index to `bookings`
- Adds resource EXCLUDE constraint
- Updates `create_booking()` function with optional `p_resource_id UUID DEFAULT NULL` parameter (backward-compatible)
- All statements use `IF NOT EXISTS` for idempotent re-runs

#### Type Exports

- `Resource`, `NewResource`, `ResourceAvailabilityRule`, `NewResourceAvailabilityRule`, `ResourceAvailabilityOverride`, `NewResourceAvailabilityOverride`

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
