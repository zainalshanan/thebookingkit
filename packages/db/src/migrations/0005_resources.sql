-- E-22: Resource & Capacity-Based Booking
-- Adds resources, resource availability rules/overrides tables, and
-- attaches an optional resource_id to bookings with a per-resource
-- EXCLUDE constraint that prevents double-booking the same resource.

-- ---------------------------------------------------------------------------
-- resources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resources (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        REFERENCES organizations(id),
  name              TEXT        NOT NULL,
  slug              VARCHAR(255) NOT NULL UNIQUE,
  type              VARCHAR(100) NOT NULL,
  capacity          INTEGER     NOT NULL DEFAULT 1,
  location          TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  metadata          JSONB       DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resources_organization_id_idx ON resources(organization_id);
CREATE INDEX IF NOT EXISTS resources_type_idx             ON resources(type);
CREATE INDEX IF NOT EXISTS resources_slug_idx             ON resources(slug);

-- ---------------------------------------------------------------------------
-- resource_availability_rules  (mirrors availability_rules)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resource_availability_rules (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id  UUID        NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  rrule        TEXT        NOT NULL,
  start_time   VARCHAR(5),
  end_time     VARCHAR(5),
  timezone     VARCHAR(100),
  valid_from   TIMESTAMPTZ,
  valid_until  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resource_availability_rules_resource_id_idx
  ON resource_availability_rules(resource_id);

-- ---------------------------------------------------------------------------
-- resource_availability_overrides  (mirrors availability_overrides)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resource_availability_overrides (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id     UUID        NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  date            TIMESTAMPTZ NOT NULL,
  start_time      VARCHAR(5),
  end_time        VARCHAR(5),
  is_unavailable  BOOLEAN     NOT NULL DEFAULT FALSE,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resource_availability_overrides_resource_id_idx
  ON resource_availability_overrides(resource_id);
CREATE INDEX IF NOT EXISTS resource_availability_overrides_date_idx
  ON resource_availability_overrides(date);

-- ---------------------------------------------------------------------------
-- Extend bookings with an optional resource_id
-- ---------------------------------------------------------------------------
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES resources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_resource_id_idx ON bookings(resource_id);

-- ---------------------------------------------------------------------------
-- Per-resource EXCLUDE constraint — prevents two active bookings for the same
-- resource from overlapping in time.
-- Uses the btree_gist extension (already enabled in 0001_setup_extensions.sql).
-- The WHERE predicate limits the constraint to rows where resource_id IS NOT NULL,
-- so provider-only bookings (resource_id = NULL) are unaffected.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_resource_no_overlap'
  ) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_resource_no_overlap
      EXCLUDE USING gist (
        resource_id WITH =,
        tstzrange(starts_at, ends_at) WITH &&
      ) WHERE (status NOT IN ('cancelled', 'rejected', 'rescheduled') AND resource_id IS NOT NULL);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Update create_booking() to accept an optional p_resource_id parameter.
-- Backward-compatible: existing callers that omit the parameter get NULL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_booking(
  p_provider_id    UUID,
  p_event_type_id  UUID,
  p_starts_at      TIMESTAMPTZ,
  p_ends_at        TIMESTAMPTZ,
  p_customer_email TEXT,
  p_customer_name  TEXT,
  p_customer_phone TEXT    DEFAULT NULL,
  p_metadata       JSONB   DEFAULT '{}'::jsonb,
  p_resource_id    UUID    DEFAULT NULL
)
RETURNS bookings
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking               bookings%ROWTYPE;
  v_requires_confirmation BOOLEAN;
  v_initial_status        booking_status;
BEGIN
  -- Look up whether this event type requires manual confirmation
  SELECT requires_confirmation INTO v_requires_confirmation
    FROM event_types
   WHERE id = p_event_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event type % not found', p_event_type_id
      USING ERRCODE = 'P0002'; -- no_data_found
  END IF;

  -- Determine initial booking status
  IF v_requires_confirmation THEN
    v_initial_status := 'pending';
  ELSE
    v_initial_status := 'confirmed';
  END IF;

  -- Insert the booking.
  -- The EXCLUDE constraint (bookings_no_overlap) raises SQLSTATE 23P01 on
  -- provider overlap; bookings_resource_no_overlap raises 23P01 on resource
  -- overlap (when resource_id IS NOT NULL).
  -- Serialization contention raises SQLSTATE 40001 — handled by
  -- withSerializableRetry() at the application layer.
  INSERT INTO bookings (
    provider_id,
    event_type_id,
    starts_at,
    ends_at,
    customer_email,
    customer_name,
    customer_phone,
    status,
    metadata,
    resource_id
  ) VALUES (
    p_provider_id,
    p_event_type_id,
    p_starts_at,
    p_ends_at,
    p_customer_email,
    p_customer_name,
    p_customer_phone,
    v_initial_status,
    p_metadata,
    p_resource_id
  )
  RETURNING * INTO v_booking;

  -- The audit trigger (0002) automatically logs the 'created' event
  -- to booking_events, so we don't need to do it here.

  RETURN v_booking;
END;
$$;
