-- GDPR Right to be Forgotten: anonymize all PII for a given customer email.
-- Preserves referential integrity and audit trail structure.

CREATE OR REPLACE FUNCTION anonymize_customer(p_email TEXT)
RETURNS jsonb AS $$
DECLARE
  v_hash TEXT;
  v_anon_email TEXT;
  v_tables_affected INTEGER := 0;
  v_rows_updated INTEGER := 0;
  v_count INTEGER;
BEGIN
  -- Generate a deterministic hash-based placeholder email
  v_hash := LEFT(encode(digest(p_email, 'sha256'), 'hex'), 12);
  v_anon_email := 'redacted-' || v_hash || '@anonymized.local';

  -- 1. Anonymize bookings
  UPDATE bookings
  SET customer_email = v_anon_email,
      customer_name = 'Anonymized Customer',
      customer_phone = NULL,
      updated_at = NOW()
  WHERE customer_email = p_email;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_tables_affected := v_tables_affected + 1;
    v_rows_updated := v_rows_updated + v_count;
  END IF;

  -- 2. Anonymize booking_seats
  UPDATE booking_seats
  SET attendee_email = v_anon_email,
      attendee_name = 'Anonymized Attendee'
  WHERE attendee_email = p_email;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_tables_affected := v_tables_affected + 1;
    v_rows_updated := v_rows_updated + v_count;
  END IF;

  -- 3. Anonymize booking_questions_responses (redact response values for bookings with this email)
  UPDATE booking_questions_responses
  SET response_value = '[REDACTED]'
  WHERE booking_id IN (SELECT id FROM bookings WHERE customer_email = v_anon_email);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_tables_affected := v_tables_affected + 1;
    v_rows_updated := v_rows_updated + v_count;
  END IF;

  -- 4. Anonymize routing_submissions
  UPDATE routing_submissions
  SET responses = '{"[REDACTED]": "[REDACTED]"}'::jsonb
  WHERE responses::text LIKE '%' || replace(replace(p_email, '%', '\%'), '_', '\_') || '%' ESCAPE '\';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_tables_affected := v_tables_affected + 1;
    v_rows_updated := v_rows_updated + v_count;
  END IF;

  -- 5. Redact PII in booking_events metadata (preserve event_type and timestamps)
  -- We must temporarily allow updates on booking_events for GDPR compliance
  -- Disable the append-only trigger temporarily
  ALTER TABLE booking_events DISABLE TRIGGER prevent_booking_events_update;

  UPDATE booking_events
  SET metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{customer_email}', '"[REDACTED]"'::jsonb, false
    ),
    '{customer_name}', '"[REDACTED]"'::jsonb, false
  )
  WHERE booking_id IN (SELECT id FROM bookings WHERE customer_email = v_anon_email)
    AND metadata IS NOT NULL
    AND (metadata ? 'customer_email' OR metadata ? 'customer_name');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_tables_affected := v_tables_affected + 1;
    v_rows_updated := v_rows_updated + v_count;
  END IF;

  -- Re-enable the append-only trigger
  ALTER TABLE booking_events ENABLE TRIGGER prevent_booking_events_update;

  -- 6. Redact customer-identifying metadata in payments (preserve financial data)
  UPDATE payments
  SET metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{customer_email}', '"[REDACTED]"'::jsonb, false
  )
  WHERE booking_id IN (SELECT id FROM bookings WHERE customer_email = v_anon_email)
    AND metadata IS NOT NULL
    AND metadata ? 'customer_email';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_tables_affected := v_tables_affected + 1;
    v_rows_updated := v_rows_updated + v_count;
  END IF;

  -- 7. Update customer_preferences
  UPDATE customer_preferences
  SET email = v_anon_email,
      anonymized_at = NOW()
  WHERE email = p_email;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_tables_affected := v_tables_affected + 1;
    v_rows_updated := v_rows_updated + v_count;
  END IF;

  -- 8. Anonymize recurring_bookings
  UPDATE recurring_bookings
  SET customer_email = v_anon_email,
      updated_at = NOW()
  WHERE customer_email = p_email;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_tables_affected := v_tables_affected + 1;
    v_rows_updated := v_rows_updated + v_count;
  END IF;

  RETURN jsonb_build_object(
    'tables_affected', v_tables_affected,
    'rows_updated', v_rows_updated,
    'anonymized_email', v_anon_email
  );
END;
$$ LANGUAGE plpgsql;
