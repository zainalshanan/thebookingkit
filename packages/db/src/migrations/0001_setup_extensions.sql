-- Enable btree_gist extension for EXCLUDE constraint support
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Enable pgcrypto extension for digest() used by GDPR anonymization
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Double-booking prevention: EXCLUDE constraint on bookings table
-- Prevents overlapping time ranges for the same provider (excluding cancelled/rejected)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_no_overlap'
  ) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
      EXCLUDE USING gist (
        provider_id WITH =,
        tstzrange(starts_at, ends_at) WITH &&
      ) WHERE (status NOT IN ('cancelled', 'rejected', 'rescheduled'));
  END IF;
END $$;
