/**
 * Atomic overlap-guarded INSERT — the D1/SQLite equivalent of PostgreSQL's
 * `EXCLUDE USING gist` double-booking constraint.
 *
 * ## Why this exists
 *
 * `D1BookingLock` serialises a read-check-write sequence, but it is an
 * *advisory* lock: correctness depends on every writer remembering to take it,
 * and on no writer overrunning the lock TTL. Neither is guaranteed.
 *
 * This module removes that dependency. It builds a **single SQL statement**
 * that performs the conflict check and the INSERT together:
 *
 * ```sql
 * INSERT INTO "bookings" ("id", "provider_id", "starts_at", "ends_at", "status")
 * SELECT ?, ?, ?, ?, ?
 * WHERE NOT EXISTS (
 *   SELECT 1 FROM "bookings"
 *   WHERE "provider_id" = ?
 *     AND ("status" IS NULL OR "status" NOT IN ('cancelled', 'rejected', 'no_show'))
 *     AND "starts_at" < ?
 *     AND "ends_at"   > ?
 * )
 * ```
 *
 * SQLite executes a single statement inside an implicit transaction holding the
 * write lock, and D1 serialises all writes against one primary. The `NOT EXISTS`
 * subquery therefore cannot be invalidated between evaluation and insertion.
 * If a competing booking landed first, zero rows are inserted and `meta.changes`
 * is `0` — which this module surfaces as a `BookingConflictError`.
 *
 * This holds with **no application lock at all** — unlike an advisory lock,
 * correctness does not depend on every writer remembering to cooperate.
 *
 * ## What this does NOT do
 *
 * The statement is atomic, but it is only as correct as the data it compares
 * against. It cannot prevent an overlap created by a write that bypasses it
 * entirely — a hand-written `INSERT`, a Drizzle `db.insert()`, an admin script.
 * `BOOKINGS_UNIQUE_SLOT_DDL` exists as a schema-level backstop for exactly that
 * case, and it only catches identical start times.
 *
 * Three further preconditions are load-bearing. Each is validated where it can
 * be, and each fails OPEN (a booking is wrongly accepted) if violated:
 *
 * 1. `starts_at`/`ends_at` must have **TEXT** affinity. Under `INTEGER`
 *    affinity, SQLite's storage-class ordering makes every string comparison
 *    against them constant, so nothing ever conflicts.
 * 2. Existing rows must already be canonical UTC-Z. A legacy local-ISO row
 *    (`2026-06-15T19:00:00`, no `Z`) does not block a canonical insert at the
 *    same instant. Run `findLegacyRows()` / `migrateRowDates()` first.
 * 3. `GuardDb.run` must actually bind its `params` argument (see {@link GuardDb}).
 *
 * ## Overlap semantics
 *
 * Intervals are treated as half-open `[startsAt, endsAt)`, matching the slot
 * engine. Two bookings overlap when `existing.starts_at < new.ends_at AND
 * existing.ends_at > new.starts_at`. Back-to-back bookings (10:00–10:30 and
 * 10:30–11:00) therefore do **not** conflict.
 *
 * ## Which bookings block
 *
 * A row blocks unless its status is in `INACTIVE_STATUSES`
 * (`cancelled`, `rejected`, `no_show`, `rescheduled`) — identical to
 * `getActiveBookings()` in `@thebookingkit/core` and to the PostgreSQL
 * `EXCLUDE USING gist` predicates, so all three backends agree on occupancy.
 * The predicate is `NOT IN`, so any status added in future blocks by default:
 * the safe direction.
 *
 * ## Prerequisite: canonical date format
 *
 * The guard compares date columns **lexicographically as TEXT**. That is exact
 * for the canonical UTC-Z format produced by `D1DateCodec.encode()`, because
 * that format is fixed-width and zero-padded. Rows written in legacy local-ISO
 * form (no `Z` suffix) will compare incorrectly. Run `findLegacyRows()` and
 * `migrateRowDates()` before relying on this guard. All parameters bound by
 * this module are encoded through `D1DateCodec.encode()` automatically.
 *
 * @example
 * ```ts
 * import { insertBookingIfFree } from "@thebookingkit/d1";
 *
 * const result = await insertBookingIfFree(db, {
 *   id: crypto.randomUUID(),
 *   provider_id: barberId,
 *   event_type_id: eventTypeId,
 *   customer_email: email,
 *   customer_name: name,
 *   starts_at: slot.startTime,   // Date — encoded automatically
 *   ends_at: slot.endTime,
 *   status: "confirmed",
 *   created_at: new Date(),
 *   updated_at: new Date(),
 * });
 *
 * if (!result.inserted) {
 *   return Response.json({ error: "Slot just taken" }, { status: 409 });
 * }
 * ```
 */

import { BookingConflictError } from "@thebookingkit/core";
import { D1DateCodec } from "./codec.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Statuses whose bookings do NOT block a slot.
 *
 * Mirrors `INACTIVE_STATUSES` in `@thebookingkit/core`'s slot pipeline so that
 * the database-level guard and the in-memory slot engine agree exactly. A
 * `no_show` did not happen, and a `rescheduled` booking moved to a new row, so
 * in both cases the original slot is free.
 */
export const D1_INACTIVE_STATUSES: readonly string[] = [
  "cancelled",
  "rejected",
  "no_show",
  "rescheduled",
];

/** Identifier pattern permitted for interpolated table/column names. */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Column names used by the overlap guard. Override these when your schema
 * deviates from the default `bookings` layout, or to guard a different table
 * entirely (e.g. resource bookings scoped by `resource_id`).
 */
export interface BookingGuardColumns {
  /** Table to insert into and check for overlaps. @default "bookings" */
  table?: string;
  /**
   * The column defining mutual exclusivity — only rows sharing this value can
   * conflict. Use `"provider_id"` for staff bookings, `"resource_id"` for
   * tables/rooms/courts.
   * @default "provider_id"
   */
  scope?: string;
  /** Interval start column. @default "starts_at" */
  startsAt?: string;
  /** Interval end column. @default "ends_at" */
  endsAt?: string;
  /** Booking status column. @default "status" */
  status?: string;
  /** Primary key column, used only by `excludeId`. @default "id" */
  id?: string;
}

/** Options controlling how the overlap guard is built. */
export interface InsertIfFreeOptions {
  /** Column/table name overrides. */
  columns?: BookingGuardColumns;
  /**
   * Statuses that do NOT block a slot. Defaults to `D1_INACTIVE_STATUSES`.
   * Pass an empty array to make every existing row block.
   */
  inactiveStatuses?: readonly string[];
  /**
   * Widen the interval used for the *conflict check* without changing the
   * values actually inserted. Use this to enforce buffer time: pass the
   * buffer-expanded window here while `values` carries the true appointment
   * times.
   *
   * @example
   * ```ts
   * // 15-minute buffer before and after
   * conflictWindow: {
   *   startsAt: subMinutes(slot.startTime, 15),
   *   endsAt:   addMinutes(slot.endTime, 15),
   * }
   * ```
   */
  conflictWindow?: { startsAt: Date | string; endsAt: Date | string };
  /**
   * Ignore this row id when checking for conflicts. Required when rescheduling
   * a booking into an overlapping window — otherwise the row being moved
   * conflicts with itself.
   */
  excludeId?: string;
}

/** A built SQL statement plus its bound parameters. */
export interface GuardedStatement {
  /** Parameterised SQL — safe to pass straight to `db.prepare(...).bind(...)`. */
  sql: string;
  /** Positional bind parameters, in order. */
  params: unknown[];
}

/**
 * Minimum DB shape required by `insertBookingIfFree`.
 *
 * **This is not satisfied by a raw D1 binding or a Drizzle instance.** `env.DB`
 * exposes `prepare`/`batch`/`exec` but no `run`, and Drizzle's `run(query)`
 * takes a single argument, so passing it directly would silently discard
 * `params` and bind every `?` as NULL — which the guard would report as a
 * successful insert. Write a three-line adapter:
 *
 * ```ts
 * // Raw D1 binding
 * const db: GuardDb = {
 *   run: (sql, params = []) => env.DB.prepare(sql).bind(...params).run(),
 * };
 *
 * // Drizzle (drizzle-orm/d1) — reach through to the underlying binding
 * const db: GuardDb = {
 *   run: (sql, params = []) => drizzle.$client.prepare(sql).bind(...params).run(),
 * };
 * ```
 */
export interface GuardDb {
  /**
   * Execute a write statement, binding `params` positionally, and return the
   * driver result. The result must expose an affected-row count — D1
   * (`meta.changes`), Drizzle (`rowsAffected`), and `node:sqlite` (`changes`)
   * are all recognised.
   */
  run(sql: string, params?: unknown[]): Promise<unknown>;
}

/** Outcome of an overlap-guarded insert. */
export interface InsertIfFreeResult {
  /** `true` when the row was written; `false` when a conflicting booking exists. */
  inserted: boolean;
  /** Rows actually written — `1` on success, `0` on conflict. */
  changes: number;
  /** The statement that was executed, for logging or debugging. */
  statement: GuardedStatement;
}

/**
 * Thrown when the database driver's result does not expose an affected-row
 * count, so the guard cannot tell whether the insert succeeded.
 *
 * Silently assuming success here would reintroduce double bookings, so this is
 * a hard failure. Use `buildInsertIfFree()` and inspect the driver result
 * yourself if your driver reports row counts in a non-standard shape.
 */
export class GuardResultError extends Error {
  public readonly code = "GUARD_RESULT_UNREADABLE";

  constructor(received: unknown) {
    super(
      "insertBookingIfFree() could not determine the affected row count from the " +
        "database result, so it cannot confirm whether the booking was written. " +
        `Expected "meta.changes", "changes", or "rowsAffected"; received: ${describe(received)}. ` +
        "Use buildInsertIfFree() and inspect your driver's result directly.",
    );
    this.name = "GuardResultError";
  }
}

// ---------------------------------------------------------------------------
// Statement builder
// ---------------------------------------------------------------------------

/**
 * Build an atomic overlap-guarded INSERT statement without executing it.
 *
 * Use this when you need to run the statement through your own driver, put it
 * in a `db.batch([...])`, or inspect the SQL. Most callers want
 * `insertBookingIfFree()` instead.
 *
 * @param values - Column/value pairs to insert. Must include the scope, start,
 *   and end columns. `Date` values in the start/end columns are encoded to the
 *   canonical UTC-Z string automatically; all other values are bound as-is.
 * @param options - Column overrides, buffer window, and reschedule exclusion.
 * @returns The parameterised SQL and its bind parameters.
 * @throws RangeError when `values` is empty, a required column is missing or
 *   null, an identifier is not a valid SQL identifier, or the conflict window
 *   is inverted (end at or before start).
 *
 * @example
 * ```ts
 * const { sql, params } = buildInsertIfFree({
 *   id, provider_id, starts_at: start, ends_at: end, status: "confirmed",
 * });
 * const res = await env.DB.prepare(sql).bind(...params).run();
 * if (res.meta.changes === 0) throw new BookingConflictError();
 * ```
 */
export function buildInsertIfFree(
  values: Record<string, unknown>,
  options?: InsertIfFreeOptions,
): GuardedStatement {
  const cols = resolveColumns(options?.columns);
  const inactive = options?.inactiveStatuses ?? D1_INACTIVE_STATUSES;

  const columnNames = Object.keys(values);
  if (columnNames.length === 0) {
    throw new RangeError(
      "buildInsertIfFree: `values` must contain at least one column.",
    );
  }
  for (const name of columnNames) {
    assertIdentifier(name, "values key");
  }

  // SQLite resolves column names case-insensitively and, given duplicates in an
  // INSERT column list, the first-listed one wins. JavaScript object keys are
  // case-SENSITIVE, so `{ STARTS_AT, ..., starts_at }` reaches the guard as two
  // distinct keys while SQLite stores only the first. The guard would then check
  // one interval and write a different one — a double booking reported as
  // success. Reject any case-insensitive collision rather than guess intent.
  assertNoCaseInsensitiveCollisions(columnNames, cols);

  // The scope + interval columns must be present — without them the guard has
  // nothing to compare against and would silently degrade to a plain INSERT.
  requirePresent(values, cols.scope, "scope");
  requirePresent(values, cols.startsAt, "startsAt");
  requirePresent(values, cols.endsAt, "endsAt");

  // A NULL primary key is accepted by SQLite's `id TEXT PRIMARY KEY` (a
  // long-standing quirk), and such a row can never be named by `excludeId`,
  // so it becomes permanently un-excludable during a reschedule.
  if (
    Object.prototype.hasOwnProperty.call(values, cols.id) &&
    (values[cols.id] === null || values[cols.id] === undefined)
  ) {
    throw new RangeError(
      `buildInsertIfFree: the "${cols.id}" column is ${describe(values[cols.id])}. ` +
        `SQLite permits NULL in a TEXT PRIMARY KEY, and a NULL id can never be ` +
        `matched by excludeId, so the row would be un-excludable when rescheduling.`,
    );
  }

  if (!Array.isArray(inactive)) {
    throw new RangeError(
      `buildInsertIfFree: inactiveStatuses must be an array, received ${describe(inactive)}.`,
    );
  }
  for (const status of inactive) {
    if (typeof status !== "string") {
      throw new RangeError(
        `buildInsertIfFree: inactiveStatuses must be strings, received ${describe(status)}.`,
      );
    }
  }

  // Encode the interval columns so stored values are always canonical UTC-Z.
  const encodedValues: Record<string, unknown> = { ...values };
  encodedValues[cols.startsAt] = encodeBound(
    values[cols.startsAt],
    cols.startsAt,
  );
  encodedValues[cols.endsAt] = encodeBound(values[cols.endsAt], cols.endsAt);

  // The conflict window defaults to the inserted interval but may be widened
  // to account for buffer time.
  const windowStart = options?.conflictWindow
    ? encodeBound(options.conflictWindow.startsAt, "conflictWindow.startsAt")
    : (encodedValues[cols.startsAt] as string);
  const windowEnd = options?.conflictWindow
    ? encodeBound(options.conflictWindow.endsAt, "conflictWindow.endsAt")
    : (encodedValues[cols.endsAt] as string);

  if (windowEnd <= windowStart) {
    throw new RangeError(
      `buildInsertIfFree: conflict window end (${windowEnd}) must be strictly after ` +
        `its start (${windowStart}). A zero-length or inverted interval can never be guarded.`,
    );
  }

  // The conflict window may be WIDER than the booking (that is what buffer time
  // is) but never narrower: a window that does not cover the whole interval
  // leaves part of the appointment unguarded, so a sign error in a buffer
  // calculation would silently switch the guard off for most of the booking.
  const insertedStart = encodedValues[cols.startsAt] as string;
  const insertedEnd = encodedValues[cols.endsAt] as string;
  if (windowStart > insertedStart || windowEnd < insertedEnd) {
    throw new RangeError(
      `buildInsertIfFree: conflictWindow (${windowStart} .. ${windowEnd}) must fully ` +
        `contain the inserted interval (${insertedStart} .. ${insertedEnd}). ` +
        `A narrower window would leave part of the booking unguarded.`,
    );
  }

  const quotedCols = columnNames.map(quote).join(", ");
  const placeholders = columnNames.map(() => "?").join(", ");
  const insertParams = columnNames.map((name) => encodedValues[name]);

  // Guard predicate. `status IS NULL OR ...` keeps rows with a NULL status
  // blocking: SQL's three-valued logic would otherwise let `NOT IN` evaluate to
  // NULL and quietly drop them from the conflict check.
  const conditions: string[] = [`${quote(cols.scope)} = ?`];
  const guardParams: unknown[] = [encodedValues[cols.scope]];

  if (inactive.length > 0) {
    const statusPlaceholders = inactive.map(() => "?").join(", ");
    conditions.push(
      `(${quote(cols.status)} IS NULL OR ${quote(cols.status)} NOT IN (${statusPlaceholders}))`,
    );
    guardParams.push(...inactive);
  }

  // Half-open overlap: existing.start < new.end AND existing.end > new.start
  conditions.push(`${quote(cols.startsAt)} < ?`);
  guardParams.push(windowEnd);
  conditions.push(`${quote(cols.endsAt)} > ?`);
  guardParams.push(windowStart);

  if (options?.excludeId !== undefined) {
    // A non-string binds as SQL NULL, and `"id" <> NULL` evaluates to NULL for
    // every row. Under three-valued logic that nulls the entire WHERE clause,
    // so NOT EXISTS is always true and the guard degrades to an unconditional
    // INSERT. `excludeId: null` — trivially produced by `row.reschedule_of ?? null`
    // — would therefore silently disable double-booking protection.
    if (typeof options.excludeId !== "string" || options.excludeId.length === 0) {
      throw new RangeError(
        `buildInsertIfFree: excludeId must be a non-empty string, received ` +
          `${describe(options.excludeId)}. A non-string binds as NULL, which would ` +
          `null the whole conflict predicate and disable the guard entirely.`,
      );
    }
    conditions.push(`${quote(cols.id)} <> ?`);
    guardParams.push(options.excludeId);
  }

  const sql =
    `INSERT INTO ${quote(cols.table)} (${quotedCols}) ` +
    `SELECT ${placeholders} ` +
    `WHERE NOT EXISTS (SELECT 1 FROM ${quote(cols.table)} WHERE ${conditions.join(" AND ")})`;

  return { sql, params: [...insertParams, ...guardParams] };
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * Insert a booking only if the slot is still free, atomically.
 *
 * This is the recommended way to write bookings on D1. It needs no advisory
 * lock and no retry loop: the conflict check and the insert are one statement,
 * so concurrent requests cannot interleave between them.
 *
 * @param db - Any object exposing `run(sql, params)` that returns the driver
 *   result (raw D1 binding wrapper, Drizzle, or `node:sqlite`).
 * @param values - Column/value pairs to insert. See `buildInsertIfFree`.
 * @param options - Column overrides, buffer window, and reschedule exclusion.
 * @returns `{ inserted, changes, statement }`. `inserted` is `false` when the
 *   slot was taken — no error is thrown, so callers can branch on it.
 * @throws RangeError for malformed input (see `buildInsertIfFree`).
 * @throws GuardResultError when the driver result has no readable row count.
 *
 * @example
 * ```ts
 * const { inserted } = await insertBookingIfFree(db, values);
 * if (!inserted) return conflictResponse();
 * ```
 */
export async function insertBookingIfFree(
  db: GuardDb,
  values: Record<string, unknown>,
  options?: InsertIfFreeOptions,
): Promise<InsertIfFreeResult> {
  const statement = buildInsertIfFree(values, options);
  const result = await db.run(statement.sql, statement.params);
  const changes = extractChanges(result);

  if (changes === null) {
    throw new GuardResultError(result);
  }

  return { inserted: changes > 0, changes, statement };
}

/**
 * Same as `insertBookingIfFree`, but throws `BookingConflictError` instead of
 * returning `inserted: false`.
 *
 * Use this when the surrounding handler already maps `BookingConflictError` to
 * an HTTP 409, keeping the D1 path identical to the PostgreSQL path.
 *
 * @param db - Any object exposing `run(sql, params)`.
 * @param values - Column/value pairs to insert.
 * @param options - Column overrides, buffer window, and reschedule exclusion.
 * @returns The successful result (`inserted` is always `true`).
 * @throws BookingConflictError when the slot is already taken.
 * @throws GuardResultError when the driver result has no readable row count.
 */
export async function insertBookingOrThrow(
  db: GuardDb,
  values: Record<string, unknown>,
  options?: InsertIfFreeOptions,
): Promise<InsertIfFreeResult> {
  const result = await insertBookingIfFree(db, values, options);
  if (!result.inserted) {
    throw new BookingConflictError();
  }
  return result;
}

/**
 * Read an affected-row count out of a database driver result.
 *
 * Recognises the three shapes this package can encounter:
 * - D1: `{ meta: { changes: number } }`
 * - Drizzle: `{ rowsAffected: number }`
 * - `node:sqlite` / better-sqlite3: `{ changes: number }`
 *
 * @param result - Whatever the driver's `run()` resolved to.
 * @returns The row count, or `null` when no recognised count is present.
 */
export function extractChanges(result: unknown): number | null {
  if (typeof result !== "object" || result === null) return null;

  const record = result as Record<string, unknown>;

  const meta = record.meta;
  if (typeof meta === "object" && meta !== null) {
    const metaChanges = (meta as Record<string, unknown>).changes;
    const coerced = toCount(metaChanges);
    if (coerced !== null) return coerced;
  }

  const direct = toCount(record.changes);
  if (direct !== null) return direct;

  return toCount(record.rowsAffected);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Coerce a driver row count to a non-negative integer, or null if unusable. */
function toCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  // node:sqlite returns BigInt row counts when values exceed Number.MAX_SAFE_INTEGER
  if (typeof value === "bigint" && value >= 0n) {
    return Number(value);
  }
  return null;
}

/** Fill in default table/column names. */
function resolveColumns(
  overrides?: BookingGuardColumns,
): Required<BookingGuardColumns> {
  const resolved: Required<BookingGuardColumns> = {
    table: overrides?.table ?? "bookings",
    scope: overrides?.scope ?? "provider_id",
    startsAt: overrides?.startsAt ?? "starts_at",
    endsAt: overrides?.endsAt ?? "ends_at",
    status: overrides?.status ?? "status",
    id: overrides?.id ?? "id",
  };

  for (const [key, value] of Object.entries(resolved)) {
    assertIdentifier(value, `columns.${key}`);
  }

  if (resolved.startsAt === resolved.endsAt) {
    throw new RangeError(
      `buildInsertIfFree: columns.startsAt and columns.endsAt must differ ` +
        `(both are "${resolved.startsAt}"). An interval needs two distinct columns.`,
    );
  }

  return resolved;
}

/**
 * Reject identifiers that are not plain SQL identifiers.
 *
 * Table and column names are interpolated into the statement (they cannot be
 * bound as parameters), so this is the injection boundary. Values always go
 * through bind parameters and are never interpolated.
 */
function assertIdentifier(value: string, label: string): void {
  if (typeof value !== "string" || !IDENTIFIER_RE.test(value)) {
    throw new RangeError(
      `buildInsertIfFree: invalid ${label} "${value}". ` +
        `Identifiers must match ${IDENTIFIER_RE}.`,
    );
  }
}

/** Ensure a guard-critical column is present and non-null in `values`. */
function requirePresent(
  values: Record<string, unknown>,
  column: string,
  role: string,
): void {
  if (!Object.prototype.hasOwnProperty.call(values, column)) {
    throw new RangeError(
      `buildInsertIfFree: values is missing the ${role} column "${column}". ` +
        `Without it the overlap guard cannot be applied and the insert would be unprotected.`,
    );
  }
  if (values[column] === null || values[column] === undefined) {
    throw new RangeError(
      `buildInsertIfFree: the ${role} column "${column}" is ${describe(values[column])}. ` +
        `A null scope or interval bound cannot be guarded against overlaps.`,
    );
  }
}

/** Encode an interval bound to the canonical UTC-Z string. */
function encodeBound(value: unknown, label: string): string {
  if (!(value instanceof Date) && typeof value !== "string") {
    throw new RangeError(
      `buildInsertIfFree: ${label} must be a Date or an ISO string, received ${describe(value)}.`,
    );
  }

  const encoded = D1DateCodec.encode(value);

  // Outside years 1000-9999, `Date.toISOString()` emits the expanded form
  // (`+010000-01-01T…` / `-000001-…`). "+" and "-" sort below every digit, so
  // such a value compares as earlier than every normal timestamp and the
  // overlap predicate silently stops matching. Fixed-width 4-digit years are
  // what make the lexicographic comparison equal to chronological order.
  if (!/^\d{4}-/.test(encoded)) {
    throw new RangeError(
      `buildInsertIfFree: ${label} encodes to "${encoded}", which is outside the ` +
        `four-digit year range. Lexicographic date comparison — which this guard ` +
        `depends on — is only equivalent to chronological order for years 1000-9999.`,
    );
  }

  return encoded;
}

/**
 * Reject `values` keys that collide case-insensitively, with each other or with
 * a guard-critical column.
 *
 * SQLite treats `STARTS_AT` and `starts_at` as the same column; JavaScript does
 * not. Left unchecked, the guard binds its predicate from one key while SQLite
 * stores the value of the other.
 */
function assertNoCaseInsensitiveCollisions(
  columnNames: string[],
  cols: Required<BookingGuardColumns>,
): void {
  const seen = new Map<string, string>();
  for (const name of columnNames) {
    const key = name.toLowerCase();
    const previous = seen.get(key);
    if (previous !== undefined) {
      throw new RangeError(
        `buildInsertIfFree: values contains "${previous}" and "${name}", which SQLite ` +
          `treats as the same column. The guard would check one value and store the other.`,
      );
    }
    seen.set(key, name);
  }

  // A key that differs only by case from a guard column is equally dangerous:
  // the guard reads `values[cols.startsAt]` and finds nothing, or finds the
  // wrong one, while SQLite writes to the same underlying column.
  for (const critical of [cols.scope, cols.startsAt, cols.endsAt, cols.status, cols.id]) {
    const match = seen.get(critical.toLowerCase());
    if (match !== undefined && match !== critical) {
      throw new RangeError(
        `buildInsertIfFree: values key "${match}" differs only in case from the ` +
          `"${critical}" column the guard checks. SQLite would treat them as the same ` +
          `column, so the guarded interval and the stored interval could diverge.`,
      );
    }
  }
}

/** Render an unknown value for inclusion in an error message. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

/** Wrap an identifier in SQLite double quotes. */
function quote(identifier: string): string {
  return `"${identifier}"`;
}
