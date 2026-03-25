/**
 * D1 migration utilities — helpers for the one-time data migration from
 * legacy local-ISO date storage to the canonical UTC-Z format.
 *
 * Run these utilities in a one-off migration script (not in your hot path).
 *
 * ## Background
 *
 * Before `@thebookingkit/d1` was introduced, `forza-barber-v2` stored booking
 * times as local ISO strings without a Z suffix (e.g. "2026-03-09T14:00:00").
 * These values round-trip correctly when parsed with `new Date(raw)` on
 * servers/workers where the system timezone is UTC, but silently produce wrong
 * results when the runtime uses a non-UTC local timezone (e.g. when running
 * integration tests locally on a developer machine set to Sydney time).
 *
 * The migration strategy is:
 *
 *   1. Read all existing date string values from the affected columns.
 *   2. For each value, use `D1DateCodec.isLegacyFormat()` to detect legacy rows.
 *   3. If legacy, interpret the value as UTC (which is how Cloudflare workers
 *      wrote it — workers always run in UTC) and re-write it as UTC-Z.
 *   4. For future correctness, always use `D1DateCodec.encode()` on all writes.
 */

import { D1DateCodec } from "./codec.js";

/**
 * Description of a column that needs migration.
 */
export interface MigrationColumn {
  /** Column name as it appears in the SQL table */
  name: string;
  /**
   * How to interpret the legacy local-ISO strings during migration.
   * - "utc" (default): Append "Z" — treats stored values as already-UTC.
   *   Use this for Cloudflare Workers, which always execute in UTC.
   * - "tz": Convert from the named timezone to UTC.
   *   Use this if your legacy app ran on a server with a non-UTC local TZ.
   */
  legacyInterpretation?: "utc" | "tz";
  /**
   * The IANA timezone to use when `legacyInterpretation` is "tz".
   * Required if legacyInterpretation === "tz".
   */
  timezone?: string;
}

/**
 * A migration plan for a single table.
 */
export interface TableMigrationPlan {
  /** Table name */
  tableName: string;
  /** Primary key column name (for the UPDATE WHERE clause) */
  primaryKey?: string;
  /** Columns containing date strings to migrate */
  columns: MigrationColumn[];
}

/**
 * Analyse a batch of D1 rows and return those that contain legacy-format
 * date values in the specified columns.
 *
 * Use this for dry-run analysis before applying the migration.
 *
 * @param rows - Array of row objects (plain key/value from D1).
 * @param columns - Column definitions to inspect.
 * @returns Rows that have at least one legacy-format date column.
 */
export function findLegacyRows(
  rows: Record<string, unknown>[],
  columns: MigrationColumn[],
): Record<string, unknown>[] {
  return rows.filter((row) =>
    columns.some((col) => {
      const val = row[col.name];
      return typeof val === "string" && D1DateCodec.isLegacyFormat(val);
    }),
  );
}

/**
 * Transform a single row object by re-encoding all legacy date columns to
 * the canonical UTC-Z format.
 *
 * Returns a partial row object containing only the columns that changed.
 * If no columns needed migration the return value is an empty object `{}`.
 *
 * @param row - A raw D1 row object.
 * @param columns - Column definitions to migrate.
 * @returns Partial row with migrated values (only changed columns).
 */
export function migrateRowDates(
  row: Record<string, unknown>,
  columns: MigrationColumn[],
): Record<string, string> {
  const updates: Record<string, string> = {};

  for (const col of columns) {
    const val = row[col.name];
    if (typeof val !== "string") continue;
    if (!D1DateCodec.isLegacyFormat(val)) continue;

    if (col.legacyInterpretation === "tz" && col.timezone) {
      // Interpret as a local time in the given timezone
      updates[col.name] = D1DateCodec.encode(val, { timezone: col.timezone });
    } else {
      // Default: interpret as UTC (Cloudflare Workers always run in UTC)
      updates[col.name] = D1DateCodec.encode(val + "Z");
    }
  }

  return updates;
}

/**
 * Generate the SQL UPDATE statement to migrate a single row.
 *
 * @param tableName - Target table name.
 * @param primaryKey - Primary key column name.
 * @param rowId - The primary key value for the row.
 * @param updates - The column/value pairs to update (from `migrateRowDates`).
 * @returns SQL string and params array ready for `db.run(sql, params)`.
 */
function validateIdentifier(name: string, label: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new RangeError(
      `buildMigrationSql: invalid ${label} "${name}". Must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.`,
    );
  }
}

export function buildMigrationSql(
  tableName: string,
  primaryKey: string,
  rowId: string,
  updates: Record<string, string>,
): { sql: string; params: string[] } {
  const entries = Object.entries(updates);
  if (entries.length === 0) {
    throw new Error("buildMigrationSql: updates object is empty — nothing to migrate.");
  }

  validateIdentifier(tableName, "tableName");
  validateIdentifier(primaryKey, "primaryKey");
  for (const [col] of entries) {
    validateIdentifier(col, "column name");
  }

  const setClauses = entries.map(([col]) => `${col} = ?`).join(", ");
  const params = [...entries.map(([, v]) => v), rowId];

  return {
    sql: `UPDATE ${tableName} SET ${setClauses} WHERE ${primaryKey} = ?`,
    params,
  };
}

/**
 * A ready-to-use SQL statement that creates the `booking_locks` advisory lock
 * table required by `D1BookingLock`.
 *
 * Run this once as part of your D1 migration setup:
 *
 * ```ts
 * await db.run(BOOKING_LOCKS_DDL);
 * ```
 */
export const BOOKING_LOCKS_DDL = `
CREATE TABLE IF NOT EXISTS booking_locks (
  lock_key   TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
)
`.trim();

/**
 * Ready-to-use SQL statements that create the three resource tables required
 * by E-22 resource-capacity booking in a SQLite / Cloudflare D1 database.
 *
 * Differences from the PostgreSQL schema in `@thebookingkit/db`:
 * - Dates stored as TEXT (UTC-Z format via D1DateCodec) — no native TIMESTAMPTZ.
 * - No `EXCLUDE USING gist` range constraint — use `D1ResourceBookingLock` instead.
 * - No `btree_gist` extension dependency.
 * - `is_active` stored as INTEGER (0/1) — SQLite has no native BOOLEAN type.
 * - `metadata` stored as TEXT (JSON string) — SQLite has no native JSONB type.
 *
 * @deprecated Since v0.1.6 the resource tables are included in {@link ALL_DDL}.
 * Use `ALL_DDL` for full schema setup. `RESOURCE_DDL` is retained for backward
 * compatibility with existing migration scripts that reference it directly.
 *
 * Run this once as part of your D1 migration setup:
 *
 * ```ts
 * // Run all three statements (split on ";\n\n")
 * for (const stmt of RESOURCE_DDL.split(";\n\n")) {
 *   const trimmed = stmt.trim();
 *   if (trimmed) await db.run(trimmed + ";");
 * }
 * ```
 *
 * Or use it with the Cloudflare D1 `batch()` API:
 *
 * ```ts
 * const stmts = RESOURCE_DDL
 *   .split(";\n\n")
 *   .map(s => s.trim())
 *   .filter(Boolean)
 *   .map(s => db.prepare(s + ";"));
 * await db.batch(stmts);
 * ```
 */
export const RESOURCE_DDL = `
CREATE TABLE IF NOT EXISTS resources (
  id              TEXT PRIMARY KEY,
  organization_id TEXT,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  type            TEXT NOT NULL,
  capacity        INTEGER NOT NULL DEFAULT 1,
  is_active       INTEGER NOT NULL DEFAULT 1,
  location        TEXT,
  metadata        TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);\n\nCREATE TABLE IF NOT EXISTS resource_availability_rules (
  id          TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  rrule       TEXT NOT NULL,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  timezone    TEXT NOT NULL,
  valid_from  TEXT,
  valid_until TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);\n\nCREATE TABLE IF NOT EXISTS resource_availability_overrides (
  id             TEXT PRIMARY KEY,
  resource_id    TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  start_time     TEXT,
  end_time       TEXT,
  is_unavailable INTEGER NOT NULL DEFAULT 0,
  reason         TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS idx_resource_availability_rules_resource_id
  ON resource_availability_rules (resource_id);\n\nCREATE INDEX IF NOT EXISTS idx_resource_availability_overrides_resource_id
  ON resource_availability_overrides (resource_id);\n\nCREATE INDEX IF NOT EXISTS idx_resources_type
  ON resources (type)
`.trim();

// ---------------------------------------------------------------------------
// Domain-scoped DDL constants
//
// Each constant covers one logical domain from packages/db/src/schema/tables.ts.
// SQLite/D1 translation rules applied throughout:
//   - uuid / varchar / jsonb / timestamptz  →  TEXT
//   - boolean                               →  INTEGER (0 = false, 1 = true)
//   - No EXCLUDE USING gist, no extensions, no pg enums
//   - CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
// ---------------------------------------------------------------------------

/**
 * DDL for the `organizations` table (multi-tenancy root).
 *
 * Mirrors `packages/db/src/schema/tables.ts` → `organizations`.
 */
export const ORGANIZATIONS_DDL = `
CREATE TABLE IF NOT EXISTS organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  settings   TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
`.trim();

/**
 * DDL for the `teams` and `team_members` tables.
 *
 * Mirrors `packages/db/src/schema/tables.ts` → `teams`, `teamMembers`.
 */
export const TEAMS_DDL = `
CREATE TABLE IF NOT EXISTS teams (
  id                  TEXT PRIMARY KEY,
  organization_id     TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  assignment_strategy TEXT NOT NULL DEFAULT 'round_robin',
  settings            TEXT NOT NULL DEFAULT '{}',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);\n\nCREATE TABLE IF NOT EXISTS team_members (
  id         TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member',
  priority   INTEGER NOT NULL DEFAULT 0,
  weight     INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS team_members_team_id_idx ON team_members (team_id);\n\nCREATE INDEX IF NOT EXISTS team_members_user_id_idx ON team_members (user_id)
`.trim();

/**
 * DDL for the `providers` table (individual booking hosts / staff members).
 *
 * Mirrors `packages/db/src/schema/tables.ts` → `providers`.
 */
export const PROVIDERS_DDL = `
CREATE TABLE IF NOT EXISTS providers (
  id                  TEXT PRIMARY KEY,
  organization_id     TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id             TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  email               TEXT,
  timezone            TEXT NOT NULL DEFAULT 'America/New_York',
  accepting_walk_ins  INTEGER NOT NULL DEFAULT 0,
  stripe_account_id   TEXT,
  metadata            TEXT NOT NULL DEFAULT '{}',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS providers_user_id_idx ON providers (user_id)
`.trim();

/**
 * DDL for the `event_types` table.
 *
 * Mirrors `packages/db/src/schema/tables.ts` → `eventTypes`.
 */
export const EVENT_TYPES_DDL = `
CREATE TABLE IF NOT EXISTS event_types (
  id                      TEXT PRIMARY KEY,
  provider_id             TEXT REFERENCES providers(id) ON DELETE CASCADE,
  team_id                 TEXT REFERENCES teams(id) ON DELETE SET NULL,
  organization_id         TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
  title                   TEXT NOT NULL,
  slug                    TEXT NOT NULL UNIQUE,
  description             TEXT,
  duration_minutes        INTEGER NOT NULL DEFAULT 30,
  buffer_before           INTEGER NOT NULL DEFAULT 0,
  buffer_after            INTEGER NOT NULL DEFAULT 0,
  price_cents             INTEGER DEFAULT 0,
  currency                TEXT DEFAULT 'USD',
  location_type           TEXT NOT NULL DEFAULT 'in_person',
  location_value          TEXT,
  booking_limits          TEXT NOT NULL DEFAULT '{}',
  requires_confirmation   INTEGER NOT NULL DEFAULT 0,
  is_recurring            INTEGER NOT NULL DEFAULT 0,
  max_seats               INTEGER NOT NULL DEFAULT 1,
  no_show_fee_cents       INTEGER DEFAULT 0,
  cancellation_policy     TEXT NOT NULL DEFAULT '[]',
  custom_questions        TEXT NOT NULL DEFAULT '[]',
  minimum_notice_minutes  INTEGER DEFAULT 0,
  max_future_days         INTEGER DEFAULT 60,
  slot_interval           INTEGER,
  walk_ins_enabled        INTEGER NOT NULL DEFAULT 0,
  is_active               INTEGER NOT NULL DEFAULT 1,
  metadata                TEXT NOT NULL DEFAULT '{}',
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS event_types_provider_id_idx ON event_types (provider_id)
`.trim();

/**
 * DDL for the availability domain: `availability_rules`, `availability_overrides`,
 * and `out_of_office`.
 *
 * Mirrors `packages/db/src/schema/tables.ts` → `availabilityRules`,
 * `availabilityOverrides`, `outOfOffice`.
 */
export const AVAILABILITY_DDL = `
CREATE TABLE IF NOT EXISTS availability_rules (
  id            TEXT PRIMARY KEY,
  provider_id   TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  event_type_id TEXT REFERENCES event_types(id) ON DELETE CASCADE,
  rrule         TEXT NOT NULL,
  start_time    TEXT NOT NULL,
  end_time      TEXT NOT NULL,
  timezone      TEXT NOT NULL,
  valid_from    TEXT,
  valid_until   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS availability_rules_provider_id_idx ON availability_rules (provider_id);\n\nCREATE TABLE IF NOT EXISTS availability_overrides (
  id             TEXT PRIMARY KEY,
  provider_id    TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  start_time     TEXT,
  end_time       TEXT,
  is_unavailable INTEGER NOT NULL DEFAULT 0,
  reason         TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS availability_overrides_provider_id_idx ON availability_overrides (provider_id);\n\nCREATE INDEX IF NOT EXISTS availability_overrides_date_idx ON availability_overrides (date);\n\nCREATE TABLE IF NOT EXISTS out_of_office (
  id                   TEXT PRIMARY KEY,
  provider_id          TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  start_date           TEXT NOT NULL,
  end_date             TEXT NOT NULL,
  reason               TEXT,
  redirect_to_user_id  TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS out_of_office_provider_id_idx ON out_of_office (provider_id)
`.trim();

/**
 * DDL for the bookings domain: `bookings`, `booking_events`,
 * `booking_seats`, and `booking_questions_responses`.
 *
 * Mirrors `packages/db/src/schema/tables.ts` → `bookings`, `bookingEvents`,
 * `bookingSeats`, `bookingQuestionsResponses`.
 *
 * Note: The PostgreSQL `EXCLUDE USING gist` double-booking constraint is omitted
 * because SQLite does not support it. Use `D1BookingLock` for advisory locking.
 */
export const BOOKINGS_DDL = `
CREATE TABLE IF NOT EXISTS bookings (
  id                   TEXT PRIMARY KEY,
  event_type_id        TEXT NOT NULL REFERENCES event_types(id) ON DELETE RESTRICT,
  provider_id          TEXT NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  team_id              TEXT REFERENCES teams(id),
  customer_email       TEXT NOT NULL,
  customer_name        TEXT NOT NULL,
  customer_phone       TEXT,
  starts_at            TEXT NOT NULL,
  ends_at              TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  source               TEXT NOT NULL DEFAULT 'online',
  payment_status       TEXT,
  recurring_booking_id TEXT REFERENCES recurring_bookings(id) ON DELETE RESTRICT,
  resource_id          TEXT REFERENCES resources(id) ON DELETE SET NULL,
  metadata             TEXT NOT NULL DEFAULT '{}',
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS bookings_provider_id_idx ON bookings (provider_id);\n\nCREATE INDEX IF NOT EXISTS bookings_event_type_id_idx ON bookings (event_type_id);\n\nCREATE INDEX IF NOT EXISTS bookings_customer_email_idx ON bookings (customer_email);\n\nCREATE INDEX IF NOT EXISTS bookings_starts_at_idx ON bookings (starts_at);\n\nCREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status);\n\nCREATE INDEX IF NOT EXISTS bookings_resource_id_idx ON bookings (resource_id);\n\nCREATE INDEX IF NOT EXISTS bookings_provider_starts_at_idx ON bookings (provider_id, starts_at);\n\nCREATE TABLE IF NOT EXISTS booking_events (
  id         TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  actor      TEXT NOT NULL,
  metadata   TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS booking_events_booking_id_idx ON booking_events (booking_id);\n\nCREATE TABLE IF NOT EXISTS booking_seats (
  id             TEXT PRIMARY KEY,
  booking_id     TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  attendee_email TEXT NOT NULL,
  attendee_name  TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'confirmed',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS booking_seats_booking_id_idx ON booking_seats (booking_id);\n\nCREATE TABLE IF NOT EXISTS booking_questions_responses (
  id             TEXT PRIMARY KEY,
  booking_id     TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  question_key   TEXT NOT NULL,
  response_value TEXT,
  created_at     TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS booking_questions_booking_id_idx ON booking_questions_responses (booking_id)
`.trim();

/**
 * DDL for the `recurring_bookings` table (series parent record).
 *
 * Mirrors `packages/db/src/schema/tables.ts` → `recurringBookings`.
 *
 * Note: `RECURRING_DDL` must be applied **before** `BOOKINGS_DDL` because
 * `bookings.recurring_booking_id` holds a foreign key to this table. In
 * `ALL_DDL` the ordering is already correct.
 */
export const RECURRING_DDL = `
CREATE TABLE IF NOT EXISTS recurring_bookings (
  id             TEXT PRIMARY KEY,
  event_type_id  TEXT NOT NULL REFERENCES event_types(id) ON DELETE RESTRICT,
  provider_id    TEXT NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  customer_email TEXT NOT NULL,
  frequency      TEXT NOT NULL,
  count          INTEGER NOT NULL,
  starts_at      TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
)
`.trim();

/**
 * DDL for the `payments` table.
 *
 * Mirrors `packages/db/src/schema/tables.ts` → `payments`.
 */
export const PAYMENTS_DDL = `
CREATE TABLE IF NOT EXISTS payments (
  id                        TEXT PRIMARY KEY,
  booking_id                TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  stripe_payment_intent_id  TEXT,
  amount_cents              INTEGER NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'USD',
  status                    TEXT NOT NULL DEFAULT 'pending',
  payment_type              TEXT NOT NULL,
  refund_amount_cents       INTEGER DEFAULT 0,
  metadata                  TEXT NOT NULL DEFAULT '{}',
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS payments_booking_id_idx ON payments (booking_id)
`.trim();

/**
 * DDL for the routing domain: `routing_forms` and `routing_submissions`.
 *
 * Mirrors `packages/db/src/schema/tables.ts` → `routingForms`,
 * `routingSubmissions`.
 */
export const ROUTING_DDL = `
CREATE TABLE IF NOT EXISTS routing_forms (
  id              TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
  team_id         TEXT REFERENCES teams(id),
  title           TEXT NOT NULL,
  fields          TEXT NOT NULL DEFAULT '[]',
  routing_rules   TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);\n\nCREATE TABLE IF NOT EXISTS routing_submissions (
  id                      TEXT PRIMARY KEY,
  form_id                 TEXT NOT NULL REFERENCES routing_forms(id) ON DELETE CASCADE,
  responses               TEXT NOT NULL DEFAULT '{}',
  routed_to_event_type_id TEXT REFERENCES event_types(id),
  routed_to_provider_id   TEXT REFERENCES providers(id),
  created_at              TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS routing_submissions_form_id_idx ON routing_submissions (form_id)
`.trim();

/**
 * DDL for the workflows domain: `workflows` and `workflow_logs`.
 *
 * Mirrors `packages/db/src/schema/tables.ts` → `workflows`, `workflowLogs`.
 */
export const WORKFLOWS_DDL = `
CREATE TABLE IF NOT EXISTS workflows (
  id              TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,
  trigger         TEXT NOT NULL,
  conditions      TEXT NOT NULL DEFAULT '{}',
  actions         TEXT NOT NULL DEFAULT '[]',
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);\n\nCREATE TABLE IF NOT EXISTS workflow_logs (
  id          TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  booking_id  TEXT REFERENCES bookings(id),
  action_type TEXT NOT NULL,
  status      TEXT NOT NULL,
  error       TEXT,
  executed_at TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS workflow_logs_workflow_id_idx ON workflow_logs (workflow_id)
`.trim();

/**
 * DDL for the webhooks domain: `webhooks` and `webhook_deliveries`.
 *
 * Mirrors `packages/db/src/schema/tables.ts` → `webhooks`, `webhookDeliveries`.
 */
export const WEBHOOKS_DDL = `
CREATE TABLE IF NOT EXISTS webhooks (
  id              TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
  team_id         TEXT REFERENCES teams(id),
  event_type_id   TEXT REFERENCES event_types(id),
  subscriber_url  TEXT NOT NULL,
  triggers        TEXT NOT NULL DEFAULT '[]',
  secret          TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);\n\nCREATE TABLE IF NOT EXISTS webhook_deliveries (
  id            TEXT PRIMARY KEY,
  webhook_id    TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  trigger       TEXT NOT NULL,
  payload       TEXT NOT NULL,
  response_code INTEGER,
  delivered_at  TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS webhook_deliveries_webhook_id_idx ON webhook_deliveries (webhook_id)
`.trim();

/**
 * DDL for the `email_delivery_log` table.
 *
 * Mirrors `packages/db/src/schema/tables.ts` → `emailDeliveryLog`.
 */
export const EMAIL_DDL = `
CREATE TABLE IF NOT EXISTS email_delivery_log (
  id         TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id),
  email_type TEXT NOT NULL,
  recipient  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'sent',
  bounced_at TEXT,
  created_at TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS email_delivery_log_booking_id_idx ON email_delivery_log (booking_id)
`.trim();

/**
 * DDL for the `customer_preferences` table (email opt-out / GDPR).
 *
 * Mirrors `packages/db/src/schema/tables.ts` → `customerPreferences`.
 */
export const CUSTOMER_DDL = `
CREATE TABLE IF NOT EXISTS customer_preferences (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  email_opt_out  INTEGER NOT NULL DEFAULT 0,
  bounced_at     TEXT,
  anonymized_at  TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
)
`.trim();

/**
 * DDL for the `walk_in_queue` table (E-19 walk-in queue).
 *
 * Mirrors `packages/db/src/schema/tables.ts` → `walkInQueue`.
 */
export const WALK_IN_DDL = `
CREATE TABLE IF NOT EXISTS walk_in_queue (
  id                      TEXT PRIMARY KEY,
  booking_id              TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider_id             TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  queue_position          INTEGER NOT NULL,
  estimated_wait_minutes  INTEGER NOT NULL DEFAULT 0,
  checked_in_at           TEXT NOT NULL,
  service_started_at      TEXT,
  completed_at            TEXT,
  status                  TEXT NOT NULL DEFAULT 'queued',
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);\n\nCREATE INDEX IF NOT EXISTS walk_in_queue_provider_id_idx ON walk_in_queue (provider_id);\n\nCREATE INDEX IF NOT EXISTS walk_in_queue_booking_id_idx ON walk_in_queue (booking_id);\n\nCREATE INDEX IF NOT EXISTS walk_in_queue_status_idx ON walk_in_queue (status)
`.trim();

/**
 * Convenience aggregate that applies the entire TheBookingKit schema to a
 * SQLite / Cloudflare D1 database in a single call.
 *
 * Tables are ordered by foreign-key dependency so the statements can be
 * executed sequentially without violating FK constraints.
 *
 * Usage — run each statement individually:
 *
 * ```ts
 * for (const stmt of ALL_DDL.split(";\n\n")) {
 *   const trimmed = stmt.trim();
 *   if (trimmed) await db.exec(trimmed + ";");
 * }
 * ```
 *
 * Usage — batch API:
 *
 * ```ts
 * const stmts = ALL_DDL
 *   .split(";\n\n")
 *   .map(s => s.trim())
 *   .filter(Boolean)
 *   .map(s => db.prepare(s + ";"));
 * await db.batch(stmts);
 * ```
 */
export const ALL_DDL = [
  ORGANIZATIONS_DDL,
  TEAMS_DDL,
  PROVIDERS_DDL,
  EVENT_TYPES_DDL,
  AVAILABILITY_DDL,
  RECURRING_DDL,
  BOOKINGS_DDL,
  PAYMENTS_DDL,
  ROUTING_DDL,
  WORKFLOWS_DDL,
  WEBHOOKS_DDL,
  EMAIL_DDL,
  CUSTOMER_DDL,
  WALK_IN_DDL,
  RESOURCE_DDL,
  BOOKING_LOCKS_DDL,
].join(";\n\n");
