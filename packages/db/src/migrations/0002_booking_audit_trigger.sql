-- Audit trail trigger: automatically log booking state changes
-- Fires on INSERT and UPDATE of the bookings table

CREATE OR REPLACE FUNCTION booking_audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type booking_event_type;
  v_metadata jsonb := jsonb_build_object();
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'created';
    v_metadata := jsonb_build_object(
      'status', NEW.status,
      'starts_at', NEW.starts_at,
      'ends_at', NEW.ends_at,
      'customer_email', NEW.customer_email
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Determine event type from status change
    IF NEW.status != OLD.status THEN
      v_event_type := NEW.status::booking_event_type;
    ELSE
      -- Non-status change (e.g. metadata update)
      v_event_type := 'updated'; -- fallback; neutral event type for non-status updates
      v_metadata := jsonb_build_object('update', 'non_status_change');
    END IF;

    -- Build metadata with changed fields
    IF NEW.status != OLD.status THEN
      v_metadata := v_metadata || jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status);
    END IF;
    IF NEW.starts_at != OLD.starts_at THEN
      v_metadata := v_metadata || jsonb_build_object('old_starts_at', OLD.starts_at, 'new_starts_at', NEW.starts_at);
    END IF;
    IF NEW.ends_at != OLD.ends_at THEN
      v_metadata := v_metadata || jsonb_build_object('old_ends_at', OLD.ends_at, 'new_ends_at', NEW.ends_at);
    END IF;
  END IF;

  INSERT INTO booking_events (booking_id, event_type, actor, metadata)
  VALUES (NEW.id, v_event_type, COALESCE(current_setting('app.current_user_id', true), 'system'), v_metadata);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS booking_audit_trigger ON bookings;

CREATE TRIGGER booking_audit_trigger
  AFTER INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION booking_audit_trigger_fn();

-- Prevent UPDATE and DELETE on booking_events (append-only)
CREATE OR REPLACE FUNCTION prevent_booking_events_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'booking_events table is append-only. UPDATE and DELETE operations are not allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_booking_events_update ON booking_events;
DROP TRIGGER IF EXISTS prevent_booking_events_delete ON booking_events;

CREATE TRIGGER prevent_booking_events_update
  BEFORE UPDATE ON booking_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_booking_events_modification();

CREATE TRIGGER prevent_booking_events_delete
  BEFORE DELETE ON booking_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_booking_events_modification();
