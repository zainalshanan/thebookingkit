-- Adds deposit support: a new payment_type value and per-event-type configuration.
-- Backwards-compatible: existing rows default to 0 for both deposit columns.

ALTER TYPE payment_type ADD VALUE IF NOT EXISTS 'deposit';

ALTER TABLE event_types
  ADD COLUMN IF NOT EXISTS deposit_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_percentage integer DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_types_deposit_pct_chk'
  ) THEN
    ALTER TABLE event_types
      ADD CONSTRAINT event_types_deposit_pct_chk
      CHECK (deposit_percentage BETWEEN 0 AND 100);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_types_deposit_cents_chk'
  ) THEN
    ALTER TABLE event_types
      ADD CONSTRAINT event_types_deposit_cents_chk
      CHECK (deposit_cents >= 0);
  END IF;
END$$;
