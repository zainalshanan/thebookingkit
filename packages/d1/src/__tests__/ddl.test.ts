import { describe, it, expect } from "vitest";
import {
  ORGANIZATIONS_DDL,
  TEAMS_DDL,
  PROVIDERS_DDL,
  EVENT_TYPES_DDL,
  AVAILABILITY_DDL,
  BOOKINGS_DDL,
  RECURRING_DDL,
  PAYMENTS_DDL,
  ROUTING_DDL,
  WORKFLOWS_DDL,
  WEBHOOKS_DDL,
  EMAIL_DDL,
  CUSTOMER_DDL,
  WALK_IN_DDL,
  RESOURCE_DDL,
  BOOKING_LOCKS_DDL,
  ALL_DDL,
} from "../migration.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** PostgreSQL-only syntax patterns that must not appear in SQLite DDL. */
const PG_ONLY_PATTERNS = [
  /\bJSONB\b/i,
  /\bUUID\b/i,
  /\bTIMESTAMPTZ\b/i,
  /EXCLUDE\s+USING\s+gist/i,
  /CREATE\s+EXTENSION/i,
  /\bSERIAL\b/i,
  /\bBIGSERIAL\b/i,
  /::text/i,
];

function assertNoPostgresOnlySyntax(ddl: string, label: string): void {
  for (const pattern of PG_ONLY_PATTERNS) {
    expect(
      pattern.test(ddl),
      `${label} must not contain PostgreSQL-only syntax matching ${pattern}`,
    ).toBe(false);
  }
}

function assertNonEmpty(ddl: string, label: string): void {
  expect(typeof ddl, `${label} should be a string`).toBe("string");
  expect(ddl.length, `${label} should be non-empty`).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Individual domain DDL — basic shape
// ---------------------------------------------------------------------------

describe("ORGANIZATIONS_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(ORGANIZATIONS_DDL, "ORGANIZATIONS_DDL"));
  it("contains CREATE TABLE IF NOT EXISTS organizations", () => {
    expect(ORGANIZATIONS_DDL).toContain("CREATE TABLE IF NOT EXISTS organizations");
  });
  it("includes expected columns", () => {
    expect(ORGANIZATIONS_DDL).toContain("name");
    expect(ORGANIZATIONS_DDL).toContain("slug");
    expect(ORGANIZATIONS_DDL).toContain("settings");
    expect(ORGANIZATIONS_DDL).toContain("created_at");
    expect(ORGANIZATIONS_DDL).toContain("updated_at");
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(ORGANIZATIONS_DDL, "ORGANIZATIONS_DDL"));
});

describe("TEAMS_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(TEAMS_DDL, "TEAMS_DDL"));
  it("contains CREATE TABLE IF NOT EXISTS teams", () => {
    expect(TEAMS_DDL).toContain("CREATE TABLE IF NOT EXISTS teams");
  });
  it("contains CREATE TABLE IF NOT EXISTS team_members", () => {
    expect(TEAMS_DDL).toContain("CREATE TABLE IF NOT EXISTS team_members");
  });
  it("includes expected teams columns", () => {
    expect(TEAMS_DDL).toContain("assignment_strategy");
    expect(TEAMS_DDL).toContain("settings");
    expect(TEAMS_DDL).toContain("organization_id");
  });
  it("includes expected team_members columns", () => {
    expect(TEAMS_DDL).toContain("team_id");
    expect(TEAMS_DDL).toContain("user_id");
    expect(TEAMS_DDL).toContain("role");
    expect(TEAMS_DDL).toContain("priority");
    expect(TEAMS_DDL).toContain("weight");
  });
  it("includes indexes for team_members", () => {
    expect(TEAMS_DDL).toContain("team_members_team_id_idx");
    expect(TEAMS_DDL).toContain("team_members_user_id_idx");
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(TEAMS_DDL, "TEAMS_DDL"));
});

describe("PROVIDERS_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(PROVIDERS_DDL, "PROVIDERS_DDL"));
  it("contains CREATE TABLE IF NOT EXISTS providers", () => {
    expect(PROVIDERS_DDL).toContain("CREATE TABLE IF NOT EXISTS providers");
  });
  it("includes expected columns", () => {
    expect(PROVIDERS_DDL).toContain("user_id");
    expect(PROVIDERS_DDL).toContain("display_name");
    expect(PROVIDERS_DDL).toContain("email");
    expect(PROVIDERS_DDL).toContain("timezone");
    expect(PROVIDERS_DDL).toContain("accepting_walk_ins");
    expect(PROVIDERS_DDL).toContain("stripe_account_id");
    expect(PROVIDERS_DDL).toContain("metadata");
  });
  it("uses INTEGER for boolean column accepting_walk_ins", () => {
    expect(PROVIDERS_DDL).toMatch(/accepting_walk_ins\s+INTEGER/);
  });
  it("includes providers_user_id_idx index", () => {
    expect(PROVIDERS_DDL).toContain("providers_user_id_idx");
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(PROVIDERS_DDL, "PROVIDERS_DDL"));
});

describe("EVENT_TYPES_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(EVENT_TYPES_DDL, "EVENT_TYPES_DDL"));
  it("contains CREATE TABLE IF NOT EXISTS event_types", () => {
    expect(EVENT_TYPES_DDL).toContain("CREATE TABLE IF NOT EXISTS event_types");
  });
  it("includes expected columns", () => {
    expect(EVENT_TYPES_DDL).toContain("provider_id");
    expect(EVENT_TYPES_DDL).toContain("team_id");
    expect(EVENT_TYPES_DDL).toContain("organization_id");
    expect(EVENT_TYPES_DDL).toContain("title");
    expect(EVENT_TYPES_DDL).toContain("slug");
    expect(EVENT_TYPES_DDL).toContain("duration_minutes");
    expect(EVENT_TYPES_DDL).toContain("buffer_before");
    expect(EVENT_TYPES_DDL).toContain("buffer_after");
    expect(EVENT_TYPES_DDL).toContain("price_cents");
    expect(EVENT_TYPES_DDL).toContain("location_type");
    expect(EVENT_TYPES_DDL).toContain("booking_limits");
    expect(EVENT_TYPES_DDL).toContain("requires_confirmation");
    expect(EVENT_TYPES_DDL).toContain("is_recurring");
    expect(EVENT_TYPES_DDL).toContain("max_seats");
    expect(EVENT_TYPES_DDL).toContain("no_show_fee_cents");
    expect(EVENT_TYPES_DDL).toContain("cancellation_policy");
    expect(EVENT_TYPES_DDL).toContain("custom_questions");
    expect(EVENT_TYPES_DDL).toContain("minimum_notice_minutes");
    expect(EVENT_TYPES_DDL).toContain("max_future_days");
    expect(EVENT_TYPES_DDL).toContain("slot_interval");
    expect(EVENT_TYPES_DDL).toContain("walk_ins_enabled");
    expect(EVENT_TYPES_DDL).toContain("is_active");
    expect(EVENT_TYPES_DDL).toContain("metadata");
  });
  it("uses INTEGER for boolean columns", () => {
    expect(EVENT_TYPES_DDL).toMatch(/requires_confirmation\s+INTEGER/);
    expect(EVENT_TYPES_DDL).toMatch(/is_recurring\s+INTEGER/);
    expect(EVENT_TYPES_DDL).toMatch(/walk_ins_enabled\s+INTEGER/);
    expect(EVENT_TYPES_DDL).toMatch(/is_active\s+INTEGER/);
  });
  it("includes event_types_provider_id_idx index", () => {
    expect(EVENT_TYPES_DDL).toContain("event_types_provider_id_idx");
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(EVENT_TYPES_DDL, "EVENT_TYPES_DDL"));
});

describe("AVAILABILITY_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(AVAILABILITY_DDL, "AVAILABILITY_DDL"));
  it("contains CREATE TABLE IF NOT EXISTS availability_rules", () => {
    expect(AVAILABILITY_DDL).toContain("CREATE TABLE IF NOT EXISTS availability_rules");
  });
  it("contains CREATE TABLE IF NOT EXISTS availability_overrides", () => {
    expect(AVAILABILITY_DDL).toContain("CREATE TABLE IF NOT EXISTS availability_overrides");
  });
  it("contains CREATE TABLE IF NOT EXISTS out_of_office", () => {
    expect(AVAILABILITY_DDL).toContain("CREATE TABLE IF NOT EXISTS out_of_office");
  });
  it("includes expected availability_rules columns", () => {
    expect(AVAILABILITY_DDL).toContain("rrule");
    expect(AVAILABILITY_DDL).toContain("start_time");
    expect(AVAILABILITY_DDL).toContain("end_time");
    expect(AVAILABILITY_DDL).toContain("timezone");
    expect(AVAILABILITY_DDL).toContain("valid_from");
    expect(AVAILABILITY_DDL).toContain("valid_until");
  });
  it("includes expected availability_overrides columns", () => {
    expect(AVAILABILITY_DDL).toContain("is_unavailable");
    expect(AVAILABILITY_DDL).toContain("reason");
  });
  it("includes expected out_of_office columns", () => {
    expect(AVAILABILITY_DDL).toContain("start_date");
    expect(AVAILABILITY_DDL).toContain("end_date");
    expect(AVAILABILITY_DDL).toContain("redirect_to_user_id");
  });
  it("includes indexes", () => {
    expect(AVAILABILITY_DDL).toContain("availability_rules_provider_id_idx");
    expect(AVAILABILITY_DDL).toContain("availability_overrides_provider_id_idx");
    expect(AVAILABILITY_DDL).toContain("availability_overrides_date_idx");
    expect(AVAILABILITY_DDL).toContain("out_of_office_provider_id_idx");
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(AVAILABILITY_DDL, "AVAILABILITY_DDL"));
});

describe("RECURRING_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(RECURRING_DDL, "RECURRING_DDL"));
  it("contains CREATE TABLE IF NOT EXISTS recurring_bookings", () => {
    expect(RECURRING_DDL).toContain("CREATE TABLE IF NOT EXISTS recurring_bookings");
  });
  it("includes expected columns", () => {
    expect(RECURRING_DDL).toContain("event_type_id");
    expect(RECURRING_DDL).toContain("provider_id");
    expect(RECURRING_DDL).toContain("customer_email");
    expect(RECURRING_DDL).toContain("frequency");
    expect(RECURRING_DDL).toContain("count");
    expect(RECURRING_DDL).toContain("starts_at");
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(RECURRING_DDL, "RECURRING_DDL"));
});

describe("BOOKINGS_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(BOOKINGS_DDL, "BOOKINGS_DDL"));
  it("contains CREATE TABLE IF NOT EXISTS bookings", () => {
    expect(BOOKINGS_DDL).toContain("CREATE TABLE IF NOT EXISTS bookings");
  });
  it("contains CREATE TABLE IF NOT EXISTS booking_events", () => {
    expect(BOOKINGS_DDL).toContain("CREATE TABLE IF NOT EXISTS booking_events");
  });
  it("contains CREATE TABLE IF NOT EXISTS booking_seats", () => {
    expect(BOOKINGS_DDL).toContain("CREATE TABLE IF NOT EXISTS booking_seats");
  });
  it("contains CREATE TABLE IF NOT EXISTS booking_questions_responses", () => {
    expect(BOOKINGS_DDL).toContain("CREATE TABLE IF NOT EXISTS booking_questions_responses");
  });
  it("includes expected bookings columns", () => {
    expect(BOOKINGS_DDL).toContain("event_type_id");
    expect(BOOKINGS_DDL).toContain("provider_id");
    expect(BOOKINGS_DDL).toContain("team_id");
    expect(BOOKINGS_DDL).toContain("customer_email");
    expect(BOOKINGS_DDL).toContain("customer_name");
    expect(BOOKINGS_DDL).toContain("customer_phone");
    expect(BOOKINGS_DDL).toContain("starts_at");
    expect(BOOKINGS_DDL).toContain("ends_at");
    expect(BOOKINGS_DDL).toContain("status");
    expect(BOOKINGS_DDL).toContain("source");
    expect(BOOKINGS_DDL).toContain("payment_status");
    expect(BOOKINGS_DDL).toContain("recurring_booking_id");
    expect(BOOKINGS_DDL).toContain("resource_id");
    expect(BOOKINGS_DDL).toContain("metadata");
  });
  it("includes expected booking_events columns", () => {
    expect(BOOKINGS_DDL).toContain("booking_id");
    expect(BOOKINGS_DDL).toContain("event_type");
    expect(BOOKINGS_DDL).toContain("actor");
  });
  it("includes expected booking_seats columns", () => {
    expect(BOOKINGS_DDL).toContain("attendee_email");
    expect(BOOKINGS_DDL).toContain("attendee_name");
  });
  it("includes expected booking_questions_responses columns", () => {
    expect(BOOKINGS_DDL).toContain("question_key");
    expect(BOOKINGS_DDL).toContain("response_value");
  });
  it("includes bookings indexes", () => {
    expect(BOOKINGS_DDL).toContain("bookings_provider_id_idx");
    expect(BOOKINGS_DDL).toContain("bookings_event_type_id_idx");
    expect(BOOKINGS_DDL).toContain("bookings_customer_email_idx");
    expect(BOOKINGS_DDL).toContain("bookings_starts_at_idx");
    expect(BOOKINGS_DDL).toContain("bookings_status_idx");
    expect(BOOKINGS_DDL).toContain("bookings_resource_id_idx");
    expect(BOOKINGS_DDL).toContain("bookings_provider_starts_at_idx");
  });
  it("includes booking sub-table indexes", () => {
    expect(BOOKINGS_DDL).toContain("booking_events_booking_id_idx");
    expect(BOOKINGS_DDL).toContain("booking_seats_booking_id_idx");
    expect(BOOKINGS_DDL).toContain("booking_questions_booking_id_idx");
  });
  it("does not contain EXCLUDE USING gist", () => {
    expect(BOOKINGS_DDL).not.toMatch(/EXCLUDE\s+USING\s+gist/i);
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(BOOKINGS_DDL, "BOOKINGS_DDL"));
});

describe("PAYMENTS_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(PAYMENTS_DDL, "PAYMENTS_DDL"));
  it("contains CREATE TABLE IF NOT EXISTS payments", () => {
    expect(PAYMENTS_DDL).toContain("CREATE TABLE IF NOT EXISTS payments");
  });
  it("includes expected columns", () => {
    expect(PAYMENTS_DDL).toContain("booking_id");
    expect(PAYMENTS_DDL).toContain("stripe_payment_intent_id");
    expect(PAYMENTS_DDL).toContain("amount_cents");
    expect(PAYMENTS_DDL).toContain("currency");
    expect(PAYMENTS_DDL).toContain("status");
    expect(PAYMENTS_DDL).toContain("payment_type");
    expect(PAYMENTS_DDL).toContain("refund_amount_cents");
    expect(PAYMENTS_DDL).toContain("metadata");
  });
  it("includes payments_booking_id_idx index", () => {
    expect(PAYMENTS_DDL).toContain("payments_booking_id_idx");
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(PAYMENTS_DDL, "PAYMENTS_DDL"));
});

describe("ROUTING_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(ROUTING_DDL, "ROUTING_DDL"));
  it("contains CREATE TABLE IF NOT EXISTS routing_forms", () => {
    expect(ROUTING_DDL).toContain("CREATE TABLE IF NOT EXISTS routing_forms");
  });
  it("contains CREATE TABLE IF NOT EXISTS routing_submissions", () => {
    expect(ROUTING_DDL).toContain("CREATE TABLE IF NOT EXISTS routing_submissions");
  });
  it("includes expected routing_forms columns", () => {
    expect(ROUTING_DDL).toContain("organization_id");
    expect(ROUTING_DDL).toContain("team_id");
    expect(ROUTING_DDL).toContain("title");
    expect(ROUTING_DDL).toContain("fields");
    expect(ROUTING_DDL).toContain("routing_rules");
  });
  it("includes expected routing_submissions columns", () => {
    expect(ROUTING_DDL).toContain("form_id");
    expect(ROUTING_DDL).toContain("responses");
    expect(ROUTING_DDL).toContain("routed_to_event_type_id");
    expect(ROUTING_DDL).toContain("routed_to_provider_id");
  });
  it("includes routing_submissions_form_id_idx index", () => {
    expect(ROUTING_DDL).toContain("routing_submissions_form_id_idx");
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(ROUTING_DDL, "ROUTING_DDL"));
});

describe("WORKFLOWS_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(WORKFLOWS_DDL, "WORKFLOWS_DDL"));
  it("contains CREATE TABLE IF NOT EXISTS workflows", () => {
    expect(WORKFLOWS_DDL).toContain("CREATE TABLE IF NOT EXISTS workflows");
  });
  it("contains CREATE TABLE IF NOT EXISTS workflow_logs", () => {
    expect(WORKFLOWS_DDL).toContain("CREATE TABLE IF NOT EXISTS workflow_logs");
  });
  it("includes expected workflows columns", () => {
    expect(WORKFLOWS_DDL).toContain("organization_id");
    expect(WORKFLOWS_DDL).toContain("name");
    expect(WORKFLOWS_DDL).toContain("trigger");
    expect(WORKFLOWS_DDL).toContain("conditions");
    expect(WORKFLOWS_DDL).toContain("actions");
    expect(WORKFLOWS_DDL).toContain("is_active");
  });
  it("includes expected workflow_logs columns", () => {
    expect(WORKFLOWS_DDL).toContain("workflow_id");
    expect(WORKFLOWS_DDL).toContain("booking_id");
    expect(WORKFLOWS_DDL).toContain("action_type");
    expect(WORKFLOWS_DDL).toContain("status");
    expect(WORKFLOWS_DDL).toContain("error");
    expect(WORKFLOWS_DDL).toContain("executed_at");
  });
  it("includes workflow_logs_workflow_id_idx index", () => {
    expect(WORKFLOWS_DDL).toContain("workflow_logs_workflow_id_idx");
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(WORKFLOWS_DDL, "WORKFLOWS_DDL"));
});

describe("WEBHOOKS_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(WEBHOOKS_DDL, "WEBHOOKS_DDL"));
  it("contains CREATE TABLE IF NOT EXISTS webhooks", () => {
    expect(WEBHOOKS_DDL).toContain("CREATE TABLE IF NOT EXISTS webhooks");
  });
  it("contains CREATE TABLE IF NOT EXISTS webhook_deliveries", () => {
    expect(WEBHOOKS_DDL).toContain("CREATE TABLE IF NOT EXISTS webhook_deliveries");
  });
  it("includes expected webhooks columns", () => {
    expect(WEBHOOKS_DDL).toContain("organization_id");
    expect(WEBHOOKS_DDL).toContain("team_id");
    expect(WEBHOOKS_DDL).toContain("event_type_id");
    expect(WEBHOOKS_DDL).toContain("subscriber_url");
    expect(WEBHOOKS_DDL).toContain("triggers");
    expect(WEBHOOKS_DDL).toContain("secret");
    expect(WEBHOOKS_DDL).toContain("is_active");
  });
  it("includes expected webhook_deliveries columns", () => {
    expect(WEBHOOKS_DDL).toContain("webhook_id");
    expect(WEBHOOKS_DDL).toContain("trigger");
    expect(WEBHOOKS_DDL).toContain("payload");
    expect(WEBHOOKS_DDL).toContain("response_code");
    expect(WEBHOOKS_DDL).toContain("delivered_at");
  });
  it("includes webhook_deliveries_webhook_id_idx index", () => {
    expect(WEBHOOKS_DDL).toContain("webhook_deliveries_webhook_id_idx");
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(WEBHOOKS_DDL, "WEBHOOKS_DDL"));
});

describe("EMAIL_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(EMAIL_DDL, "EMAIL_DDL"));
  it("contains CREATE TABLE IF NOT EXISTS email_delivery_log", () => {
    expect(EMAIL_DDL).toContain("CREATE TABLE IF NOT EXISTS email_delivery_log");
  });
  it("includes expected columns", () => {
    expect(EMAIL_DDL).toContain("booking_id");
    expect(EMAIL_DDL).toContain("email_type");
    expect(EMAIL_DDL).toContain("recipient");
    expect(EMAIL_DDL).toContain("status");
    expect(EMAIL_DDL).toContain("bounced_at");
    expect(EMAIL_DDL).toContain("created_at");
  });
  it("includes email_delivery_log_booking_id_idx index", () => {
    expect(EMAIL_DDL).toContain("email_delivery_log_booking_id_idx");
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(EMAIL_DDL, "EMAIL_DDL"));
});

describe("CUSTOMER_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(CUSTOMER_DDL, "CUSTOMER_DDL"));
  it("contains CREATE TABLE IF NOT EXISTS customer_preferences", () => {
    expect(CUSTOMER_DDL).toContain("CREATE TABLE IF NOT EXISTS customer_preferences");
  });
  it("includes expected columns", () => {
    expect(CUSTOMER_DDL).toContain("email");
    expect(CUSTOMER_DDL).toContain("email_opt_out");
    expect(CUSTOMER_DDL).toContain("bounced_at");
    expect(CUSTOMER_DDL).toContain("anonymized_at");
    expect(CUSTOMER_DDL).toContain("created_at");
    expect(CUSTOMER_DDL).toContain("updated_at");
  });
  it("uses INTEGER for boolean column email_opt_out", () => {
    expect(CUSTOMER_DDL).toMatch(/email_opt_out\s+INTEGER/);
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(CUSTOMER_DDL, "CUSTOMER_DDL"));
});

describe("WALK_IN_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(WALK_IN_DDL, "WALK_IN_DDL"));
  it("contains CREATE TABLE IF NOT EXISTS walk_in_queue", () => {
    expect(WALK_IN_DDL).toContain("CREATE TABLE IF NOT EXISTS walk_in_queue");
  });
  it("includes expected columns", () => {
    expect(WALK_IN_DDL).toContain("booking_id");
    expect(WALK_IN_DDL).toContain("provider_id");
    expect(WALK_IN_DDL).toContain("queue_position");
    expect(WALK_IN_DDL).toContain("estimated_wait_minutes");
    expect(WALK_IN_DDL).toContain("checked_in_at");
    expect(WALK_IN_DDL).toContain("service_started_at");
    expect(WALK_IN_DDL).toContain("completed_at");
    expect(WALK_IN_DDL).toContain("status");
  });
  it("includes walk_in_queue indexes", () => {
    expect(WALK_IN_DDL).toContain("walk_in_queue_provider_id_idx");
    expect(WALK_IN_DDL).toContain("walk_in_queue_booking_id_idx");
    expect(WALK_IN_DDL).toContain("walk_in_queue_status_idx");
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(WALK_IN_DDL, "WALK_IN_DDL"));
});

// ---------------------------------------------------------------------------
// ALL_DDL aggregate
// ---------------------------------------------------------------------------

describe("ALL_DDL", () => {
  it("is a non-empty string", () => assertNonEmpty(ALL_DDL, "ALL_DDL"));

  it("contains all domain DDL constants", () => {
    // Spot-check a distinctive identifier from each domain constant
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS organizations");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS teams");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS team_members");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS providers");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS event_types");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS availability_rules");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS availability_overrides");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS out_of_office");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS recurring_bookings");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS bookings");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS booking_events");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS booking_seats");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS booking_questions_responses");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS payments");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS routing_forms");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS routing_submissions");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS workflows");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS workflow_logs");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS webhooks");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS webhook_deliveries");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS email_delivery_log");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS customer_preferences");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS walk_in_queue");
    // Resource tables (from RESOURCE_DDL backward-compat constant)
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS resources");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS resource_availability_rules");
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS resource_availability_overrides");
    // Advisory lock table (from BOOKING_LOCKS_DDL)
    expect(ALL_DDL).toContain("CREATE TABLE IF NOT EXISTS booking_locks");
  });

  it("joins domain constants with the ';\n\n' separator", () => {
    // ALL_DDL is built by joining with ";\n\n", so splitting by that delimiter
    // should yield at least as many segments as there are domain constants.
    const segments = ALL_DDL.split(";\n\n").filter((s) => s.trim().length > 0);
    expect(segments.length).toBeGreaterThanOrEqual(16);
  });

  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(ALL_DDL, "ALL_DDL"));

  it("places organizations before tables that reference it", () => {
    const orgPos = ALL_DDL.indexOf("CREATE TABLE IF NOT EXISTS organizations");
    const teamsPos = ALL_DDL.indexOf("CREATE TABLE IF NOT EXISTS teams");
    const providersPos = ALL_DDL.indexOf("CREATE TABLE IF NOT EXISTS providers");
    expect(orgPos).toBeGreaterThanOrEqual(0);
    expect(teamsPos).toBeGreaterThan(orgPos);
    expect(providersPos).toBeGreaterThan(orgPos);
  });

  it("places recurring_bookings before bookings (FK dependency)", () => {
    const recurringPos = ALL_DDL.indexOf("CREATE TABLE IF NOT EXISTS recurring_bookings");
    const bookingsPos = ALL_DDL.indexOf("CREATE TABLE IF NOT EXISTS bookings");
    expect(recurringPos).toBeGreaterThanOrEqual(0);
    expect(bookingsPos).toBeGreaterThan(recurringPos);
  });

  it("places event_types before bookings (FK dependency)", () => {
    const eventTypesPos = ALL_DDL.indexOf("CREATE TABLE IF NOT EXISTS event_types");
    const bookingsPos = ALL_DDL.indexOf("CREATE TABLE IF NOT EXISTS bookings");
    expect(eventTypesPos).toBeGreaterThanOrEqual(0);
    expect(bookingsPos).toBeGreaterThan(eventTypesPos);
  });
});

// ---------------------------------------------------------------------------
// RESOURCE_DDL backward-compatibility — verify @deprecated constant unchanged
// ---------------------------------------------------------------------------

describe("RESOURCE_DDL (backward-compat)", () => {
  it("is a non-empty string", () => assertNonEmpty(RESOURCE_DDL, "RESOURCE_DDL"));
  it("still contains the three original resource tables", () => {
    expect(RESOURCE_DDL).toContain("CREATE TABLE IF NOT EXISTS resources");
    expect(RESOURCE_DDL).toContain("CREATE TABLE IF NOT EXISTS resource_availability_rules");
    expect(RESOURCE_DDL).toContain("CREATE TABLE IF NOT EXISTS resource_availability_overrides");
  });
  it("has no PostgreSQL-only syntax", () => assertNoPostgresOnlySyntax(RESOURCE_DDL, "RESOURCE_DDL"));
  it("is included in ALL_DDL", () => {
    // Every distinctive table in RESOURCE_DDL must also appear in ALL_DDL
    const tables = [
      "CREATE TABLE IF NOT EXISTS resources",
      "CREATE TABLE IF NOT EXISTS resource_availability_rules",
      "CREATE TABLE IF NOT EXISTS resource_availability_overrides",
    ];
    for (const t of tables) {
      expect(ALL_DDL).toContain(t);
    }
  });
});
