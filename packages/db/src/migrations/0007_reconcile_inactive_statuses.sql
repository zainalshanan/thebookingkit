-- ---------------------------------------------------------------------------
-- 0007: Reconcile slot-occupancy semantics across all three backends.
--
-- The PostgreSQL EXCLUDE constraints and @thebookingkit/core's slot engine
-- disagreed about which terminal statuses free a slot — and were inverted on
-- both of them:
--
--                  core / D1 (before)   PostgreSQL (before)
--   no_show        free                 BLOCKS
--   rescheduled    BLOCKS               free
--
-- A booking accepted by the slot engine could therefore be rejected by the
-- database constraint, and vice versa.
--
-- Both now use the full set of terminal states:
--   cancelled, rejected, no_show, rescheduled
--
-- Rationale:
--   * `rescheduled` marks a booking that moved to a NEW row. The original row
--     keeps its original starts_at/ends_at, so if it kept blocking, every
--     reschedule would permanently burn the slot it left. PostgreSQL already
--     had this right; core did not.
--   * `no_show` means the appointment did not happen, so the slot it occupied
--     is free. core already had this right; PostgreSQL did not.
--   * `completed` is deliberately still blocking: the appointment happened and
--     the slot was genuinely consumed.
--
-- This migration only ever makes the constraints MORE permissive (it removes
-- `no_show` rows from the exclusion set and keeps `rescheduled` excluded), so
-- it cannot fail on existing data — no row that satisfies the old constraint
-- can violate the new one.
--
-- Matching definitions live in:
--   packages/core/src/slot-pipeline.ts  -> INACTIVE_STATUSES
--   packages/d1/src/booking-guard.ts    -> D1_INACTIVE_STATUSES
--   packages/d1/src/migration.ts        -> BOOKINGS_UNIQUE_SLOT_DDL
-- Changing one without the others reintroduces the divergence.
-- ---------------------------------------------------------------------------

-- Provider-scoped overlap constraint (created in 0001_setup_extensions.sql)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_no_overlap'
  ) THEN
    ALTER TABLE bookings DROP CONSTRAINT bookings_no_overlap;
  END IF;

  ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
    EXCLUDE USING gist (
      provider_id WITH =,
      tstzrange(starts_at, ends_at) WITH &&
    ) WHERE (status NOT IN ('cancelled', 'rejected', 'no_show', 'rescheduled'));
END $$;

-- Resource-scoped overlap constraint (created in 0005_resources.sql)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_resource_no_overlap'
  ) THEN
    ALTER TABLE bookings DROP CONSTRAINT bookings_resource_no_overlap;
  END IF;

  ALTER TABLE bookings ADD CONSTRAINT bookings_resource_no_overlap
    EXCLUDE USING gist (
      resource_id WITH =,
      tstzrange(starts_at, ends_at) WITH &&
    ) WHERE (
      status NOT IN ('cancelled', 'rejected', 'no_show', 'rescheduled')
      AND resource_id IS NOT NULL
    );
END $$;
