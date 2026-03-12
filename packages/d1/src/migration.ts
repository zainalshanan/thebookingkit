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
