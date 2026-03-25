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
);
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
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  capacity    INTEGER NOT NULL DEFAULT 1,
  is_active   INTEGER NOT NULL DEFAULT 1,
  location    TEXT,
  metadata    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resource_availability_rules (
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
);

CREATE TABLE IF NOT EXISTS resource_availability_overrides (
  id             TEXT PRIMARY KEY,
  resource_id    TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  start_time     TEXT,
  end_time       TEXT,
  is_unavailable INTEGER NOT NULL DEFAULT 0,
  reason         TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resource_availability_rules_resource_id
  ON resource_availability_rules (resource_id);

CREATE INDEX IF NOT EXISTS idx_resource_availability_overrides_resource_id
  ON resource_availability_overrides (resource_id);

CREATE INDEX IF NOT EXISTS idx_resources_type
  ON resources (type);
`.trim();
