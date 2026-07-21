/**
 * D1BookingLock — application-level advisory lock for D1 / SQLite booking flows.
 *
 * ## Read this first
 *
 * This lock is **defence in depth, not the guarantee**. It is an *advisory*
 * lock: it only protects a slot if every writer remembers to take it, and it
 * relies on a lease that can expire mid-operation. For an actual guarantee that
 * a slot cannot be double-booked, use {@link insertBookingIfFree} from this same
 * package — it performs the conflict check and the INSERT in one atomic SQL
 * statement, so no lock is required and no code path can bypass it.
 *
 * The recommended pattern uses both: the lock to serialise expensive work and
 * keep contention low, and the atomic guard as the authoritative check.
 *
 * ```ts
 * await lock.withLock(`${barberId}:${dateStr}`, async () => {
 *   const existing = await fetchBookings(...);
 *   const ok = isSlotAvailable(rules, [], d1BookingRowsToInputs(existing), start, end);
 *   if (!ok.available) throw new BookingConflictError();   // fast, friendly rejection
 *   await insertBookingOrThrow(db, values);                // authoritative, race-proof
 * });
 * ```
 *
 * ## Background
 *
 * PostgreSQL provides `EXCLUDE USING gist` (with `btree_gist`) to prevent
 * overlapping booking rows at the database level. SQLite / D1 has no
 * range-exclusion constraint.
 *
 * D1 serialises writes to a single primary, but that serialisation is at the
 * statement level — it does NOT make a read-then-write *sequence* atomic. Two
 * requests arriving together will both read the same empty slot, both pass the
 * availability check, and both insert.
 *
 * ## Strategy: compare-and-swap on a lock table
 *
 * 1. `INSERT` a lock row keyed by `lock_key` (the PRIMARY KEY).
 * 2. Run the caller's read-check-write callback.
 * 3. `DELETE` the lock row — but only if we still own it.
 *
 * Because `lock_key` is the primary key, a second concurrent request's INSERT
 * fails with a UNIQUE constraint violation while the first holds the lock. The
 * loser retries with jittered exponential backoff.
 *
 * ## Fencing token
 *
 * Every acquisition writes a random `holder` token. Release is
 * `DELETE ... WHERE lock_key = ? AND holder = ?`, so a holder whose lease
 * expired — and whose lock was therefore reclaimed by another request — can
 * never delete the *new* holder's lock row. Without this, a slow worker's
 * cleanup would silently unlock a slot another request was actively using.
 *
 * A lease can still expire while its holder is mid-callback (a stalled worker,
 * a slow D1 round-trip). That is detected: `withLock` throws
 * {@link LockLeaseExpiredError} if the lease elapsed before the callback
 * finished, so the race is reported rather than hidden. Combine with
 * {@link insertBookingIfFree} and the write itself is rejected too.
 *
 * ## Required schema
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS booking_locks (
 *   lock_key   TEXT PRIMARY KEY,
 *   expires_at TEXT NOT NULL,
 *   created_at TEXT NOT NULL,
 *   holder     TEXT
 * );
 * ```
 *
 * Exported as `BOOKING_LOCKS_DDL`. Tables created before the `holder` column
 * existed are upgraded automatically on first use (see `autoMigrate`).
 */

import { extractChanges } from "./booking-guard.js";

/**
 * Internal record of one acquired lease.
 *
 * `acquiredAt` is the instant the stored `expires_at` was derived from, so
 * elapsed time and the TTL always share an origin. `expiresAt` is mutated by
 * `extendLease()` and is therefore the live view of the lease.
 */
interface Lease {
  lockKey: string;
  holder: string;
  expiresAt: number;
  acquiredAt: number;
}

/** Minimum shape of the DB client required by D1BookingLock. */
export interface LockDb {
  /** Execute a raw SQL statement (for INSERT, UPDATE and DELETE on the lock table). */
  run(sql: string, params?: unknown[]): Promise<unknown>;
}

/** Options for configuring D1BookingLock behaviour. */
export interface D1BookingLockOptions {
  /**
   * Name of the advisory lock table in your D1 schema.
   * Must have columns: lock_key (TEXT PK), expires_at (TEXT), created_at (TEXT),
   * holder (TEXT).
   * @default "booking_locks"
   */
  tableName?: string;

  /**
   * How long a lock is considered valid before it is treated as stale and can
   * be reclaimed (in milliseconds). This is a safety valve for crashed workers
   * that never released the lock.
   *
   * Set this comfortably above your worst-case critical-section duration. If a
   * callback outlives the lease, `withLock` throws {@link LockLeaseExpiredError}.
   * @default 10_000 (10 seconds)
   */
  lockTtlMs?: number;

  /**
   * Maximum number of acquire attempts before giving up. Must be at least 1.
   * @default 5
   */
  maxRetries?: number;

  /**
   * Base delay between retry attempts in milliseconds.
   * Actual delay = baseDelayMs * 2^attempt + jitter, capped at 5 s.
   * @default 100
   */
  baseDelayMs?: number;

  /**
   * What to do when the lease expires before the callback returns.
   *
   * - `"throw"` — throw {@link LockLeaseExpiredError} (default). Safest: the
   *   caller learns the critical section was no longer protected.
   * - `"ignore"` — return the callback's value regardless. Only safe when the
   *   write itself is race-proof (i.e. you used {@link insertBookingIfFree}).
   * @default "throw"
   */
  onLeaseExpiry?: "throw" | "ignore";

  /**
   * When true, a lock table missing the `holder` column is upgraded in place
   * via `ALTER TABLE ... ADD COLUMN holder TEXT` on first use. This keeps
   * deployments created before the fencing token was introduced working
   * without a manual migration step.
   *
   * Set to false to forbid runtime DDL; a missing column then raises
   * {@link LockSchemaError} telling you which statement to run.
   * @default true
   */
  autoMigrate?: boolean;

  /**
   * Override the fencing-token generator. Defaults to `crypto.randomUUID()`,
   * falling back to a random string when `crypto` is unavailable.
   * Supplied primarily for deterministic tests.
   */
  generateHolder?: () => string;
}

/**
 * Thrown when all lock acquisition attempts are exhausted without success.
 */
export class LockAcquisitionError extends Error {
  public readonly code = "LOCK_ACQUISITION_EXHAUSTED";

  constructor(
    public readonly lockKey: string,
    public readonly attempts: number,
  ) {
    super(
      `Could not acquire booking lock for "${lockKey}" after ${attempts} attempts. ` +
        `The slot may be in the process of being booked — please try again.`,
    );
    this.name = "LockAcquisitionError";
  }
}

/**
 * Thrown when the lock lease expired before the critical section finished.
 *
 * The callback already ran to completion, so any writes it performed may have
 * raced with another request that reclaimed the expired lock. The callback's
 * return value is preserved on `result` so callers can compensate.
 *
 * Remedies, in order of preference:
 * 1. Perform the write with {@link insertBookingIfFree} — then the database
 *    rejects the racing insert and this error is purely informational.
 * 2. Raise `lockTtlMs` above your worst-case critical-section duration.
 * 3. Call `handle.extend()` from inside a long-running callback.
 */
export class LockLeaseExpiredError extends Error {
  public readonly code = "LOCK_LEASE_EXPIRED";

  constructor(
    public readonly lockKey: string,
    public readonly heldForMs: number,
    public readonly lockTtlMs: number,
    /** Whatever the callback returned before the expiry was detected. */
    public readonly result: unknown,
  ) {
    super(
      `Booking lock "${lockKey}" expired during the critical section: held for ` +
        `${heldForMs} ms with a ${lockTtlMs} ms TTL. Another request may have reclaimed ` +
        `the lock and written a conflicting booking. Use insertBookingIfFree() so the ` +
        `database rejects the race, raise lockTtlMs, or call handle.extend() during long work.`,
    );
    this.name = "LockLeaseExpiredError";
  }
}

/**
 * Thrown when the lock table is missing the `holder` column and `autoMigrate`
 * is disabled (or the automatic upgrade failed).
 */
export class LockSchemaError extends Error {
  public readonly code = "LOCK_SCHEMA_OUTDATED";

  constructor(tableName: string, cause?: unknown) {
    super(
      `The "${tableName}" table is missing the "holder" column required for fencing-token ` +
        `safety. Run: ALTER TABLE ${tableName} ADD COLUMN holder TEXT; ` +
        `(or leave autoMigrate enabled to have this applied automatically).`,
    );
    this.name = "LockSchemaError";
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Thrown when a lease extension cannot be confirmed because the database
 * driver's result exposes no affected-row count.
 *
 * Reporting a successful extension without evidence would defeat the purpose of
 * the lease, so this fails loudly instead.
 */
export class LockDriverError extends Error {
  public readonly code = "LOCK_DRIVER_NO_ROW_COUNT";

  constructor(received: unknown) {
    super(
      `Could not confirm the lease extension: the database driver returned no readable ` +
        `row count (expected "meta.changes", "changes", or "rowsAffected"; received ` +
        `${safeDescribe(received)}). Lease extension cannot be verified with this driver.`,
    );
    this.name = "LockDriverError";
  }
}

/**
 * Handle passed to the `withLock` callback, describing the lease currently held.
 */
export interface LockHandle {
  /** The key this lock was acquired under. */
  readonly lockKey: string;
  /** The fencing token proving ownership of this lease. */
  readonly holder: string;
  /** Epoch milliseconds at which the lease expires. Updated by `extend()`. */
  readonly expiresAt: number;
  /** True when the lease has already elapsed. */
  isExpired(): boolean;
  /**
   * Push the lease expiry further out. Use inside long-running callbacks.
   *
   * @param ttlMs - New lease duration from now. Defaults to the configured `lockTtlMs`.
   * @returns `true` if the lease was renewed; `false` if the lock was already
   *   lost (reclaimed by another request), in which case the critical section
   *   is no longer protected and should be aborted.
   * @throws LockDriverError when the driver reports no row count.
   */
  extend(ttlMs?: number): Promise<boolean>;
}

/**
 * Application-level advisory lock for D1 / SQLite booking flows.
 *
 * Each instance targets one lock table. Create one per request handler or share
 * a single module-level instance.
 */
export class D1BookingLock {
  private readonly db: LockDb;
  private readonly tableName: string;
  private readonly lockTtlMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly onLeaseExpiry: "throw" | "ignore";
  private readonly autoMigrate: boolean;
  private readonly generateHolder: () => string;

  constructor(db: LockDb, options?: D1BookingLockOptions) {
    if (typeof db?.run !== "function") {
      throw new TypeError(
        "D1BookingLock: `db` must expose a run(sql, params) method.",
      );
    }
    this.db = db;

    const tableName = options?.tableName ?? "booking_locks";
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new RangeError(
        `D1BookingLock: invalid tableName "${tableName}". Must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.`,
      );
    }
    this.tableName = tableName;

    this.lockTtlMs = requireDuration(options?.lockTtlMs ?? 10_000, "lockTtlMs");
    this.maxRetries = requirePositiveInt(options?.maxRetries ?? 5, "maxRetries");
    this.baseDelayMs = requireNonNegative(
      options?.baseDelayMs ?? 100,
      "baseDelayMs",
    );
    this.onLeaseExpiry = options?.onLeaseExpiry ?? "throw";
    this.autoMigrate = options?.autoMigrate ?? true;
    this.generateHolder = options?.generateHolder ?? defaultHolder;
  }

  /**
   * Acquire a lock, run the provided callback, then release the lock.
   * Retries with jittered exponential backoff if the lock is held.
   *
   * The callback should perform the full read-check-write sequence. If it
   * throws, the lock is released and the error propagates unchanged.
   *
   * @param lockKey - Unique key identifying the resource being locked.
   *   Convention: `` `${providerId}:${dateStr}` ``.
   * @param fn - Async callback containing the availability check and insert.
   *   Receives a {@link LockHandle} for lease introspection and extension.
   * @returns The return value of the callback.
   * @throws RangeError when `lockKey` is empty or not a string.
   * @throws LockAcquisitionError when retries are exhausted.
   * @throws LockLeaseExpiredError when the lease elapsed mid-callback
   *   (unless `onLeaseExpiry` is `"ignore"`).
   */
  async withLock<T>(
    lockKey: string,
    fn: (handle: LockHandle) => Promise<T>,
  ): Promise<T> {
    if (typeof lockKey !== "string" || lockKey.length === 0) {
      throw new RangeError(
        `D1BookingLock: lockKey must be a non-empty string, received ${safeDescribe(lockKey)}.`,
      );
    }
    if (typeof fn !== "function") {
      throw new TypeError("D1BookingLock: `fn` must be a function.");
    }

    const lease = await this.acquire(lockKey);

    let result: T;
    let stillOwned: boolean | null = null;
    try {
      result = await fn(this.buildHandle(lease));
    } finally {
      // Always release, even when the callback threw. Ownership-scoped so a
      // lease we already lost is left alone for its new owner.
      stillOwned = await this.release(lockKey, lease.holder);
    }

    // Whether the lease survived is answered by the release itself, not by the
    // clock. The DELETE is scoped to our holder token, so deleting our row
    // proves we still owned the lock at the end of the critical section, and
    // deleting nothing proves we did not.
    //
    // Using `Date.now()` here instead would be wrong in both directions: a slow
    // release round-trip would report an expiry that never happened, and a lock
    // reclaimed by a peer with a skewed clock would go unreported — the exact
    // case this error exists to surface. The clock is consulted only when the
    // driver reports no row count, and then solely as a fallback.
    const leaseLost =
      stillOwned === null ? Date.now() >= lease.expiresAt : !stillOwned;

    if (leaseLost && this.onLeaseExpiry === "throw") {
      throw new LockLeaseExpiredError(
        lockKey,
        Date.now() - lease.acquiredAt,
        this.lockTtlMs,
        result,
      );
    }

    return result;
  }

  /**
   * Build the caller-facing handle for an acquired lease.
   * `expiresAt` is mutated in place by `extend()` so the handle stays accurate.
   */
  private buildHandle(lease: Lease): LockHandle {
    const self = this;

    // Concurrent extends would otherwise assign `lease.expiresAt` in promise
    // resolution order while the row is written in statement execution order,
    // letting the in-memory lease drift ahead of the stored one. Chaining keeps
    // at most one extend in flight, so the two can never disagree.
    let pending: Promise<boolean> = Promise.resolve(true);

    return {
      lockKey: lease.lockKey,
      holder: lease.holder,
      get expiresAt() {
        return lease.expiresAt;
      },
      isExpired() {
        return Date.now() >= lease.expiresAt;
      },
      extend(ttlMs?: number): Promise<boolean> {
        const duration = requireDuration(ttlMs ?? self.lockTtlMs, "extend(ttlMs)");
        const run = () => self.extendLease(lease, duration);
        pending = pending.then(run, run);
        return pending;
      },
    };
  }

  /**
   * Push a lease's expiry out and mirror it in memory.
   *
   * Expiry only ever moves forward: a short `ttlMs` must not shorten a lease
   * that already runs longer, which would hand the key to the stale-lock purge
   * while the caller is still working.
   *
   * @returns `true` if the lease is held and now extends at least `duration`
   *   into the future; `false` if the lock has already been lost.
   */
  private async extendLease(lease: Lease, duration: number): Promise<boolean> {
    // Clamp forward rather than skipping the write when the lease already runs
    // longer. Short-circuiting would avoid a round trip but would also skip the
    // ownership check, letting `extend()` report `true` for a lock we had
    // already lost — the precise question callers use it to answer.
    const nextExpiry = Math.max(Date.now() + duration, lease.expiresAt);

    const result = await this.db.run(
      `UPDATE ${this.tableName} SET expires_at = ? WHERE lock_key = ? AND holder = ?`,
      [new Date(nextExpiry).toISOString(), lease.lockKey, lease.holder],
    );

    const changes = extractChanges(result);
    if (changes === null) throw new LockDriverError(result);
    if (changes > 0) {
      lease.expiresAt = nextExpiry;
      return true;
    }
    return false;
  }

  /**
   * Attempt to insert the lock row, retrying with exponential backoff while the
   * lock is held by someone else. Stale locks (expired TTL) are purged before
   * each attempt so a crashed worker cannot block a slot forever.
   */
  private async acquire(lockKey: string): Promise<Lease> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      // Purge a stale lock first, to recover from crashed workers. Scoped by
      // expiry so a live lock is never stolen.
      await this.db.run(
        `DELETE FROM ${this.tableName} WHERE lock_key = ? AND expires_at < ?`,
        [lockKey, new Date().toISOString()],
      );

      const holder = this.buildHolder();
      // `acquiredAt` is the same instant the stored `expires_at` is derived
      // from, so elapsed time and the TTL are always measured against one
      // origin. Taking it after the INSERT instead would let the round-trip
      // silently consume lease the caller believes it still has, and would make
      // `heldForMs` and `lockTtlMs` incomparable in the expiry error.
      const acquiredAt = Date.now();
      const expiresAt = acquiredAt + this.lockTtlMs;

      try {
        await this.insertLockRow(lockKey, holder, expiresAt);
        return { lockKey, holder, expiresAt, acquiredAt };
      } catch (error) {
        // Only a uniqueness violation means "someone else holds it" — every
        // other failure is a real fault and must surface immediately rather
        // than being masked as lock contention.
        if (!isUniqueConstraintError(error)) throw error;
        if (attempt < this.maxRetries - 1) {
          await sleep(this.backoffMs(attempt));
        }
      }
    }

    throw new LockAcquisitionError(lockKey, this.maxRetries);
  }

  /**
   * Insert the lock row, upgrading the table schema once if the `holder`
   * column is missing from a pre-fencing-token deployment.
   */
  private async insertLockRow(
    lockKey: string,
    holder: string,
    expiresAt: number,
  ): Promise<void> {
    const params = [
      lockKey,
      new Date(expiresAt).toISOString(),
      new Date().toISOString(),
      holder,
    ];
    const sql =
      `INSERT INTO ${this.tableName} (lock_key, expires_at, created_at, holder) ` +
      `VALUES (?, ?, ?, ?)`;

    try {
      await this.db.run(sql, params);
    } catch (error) {
      // Decided purely from this error, never from remembered state. A cached
      // "already migrated" flag would be read when the rejection *arrives*
      // rather than when the statement was *issued*, so an INSERT already in
      // flight against the legacy table would be hard-failed by a sibling
      // request that migrated in the meantime. It would also make a schema
      // regression — a restored or swapped database — permanently unrecoverable
      // for the lifetime of the instance.
      if (!isMissingHolderColumnError(error)) throw error;
      await this.addHolderColumn(error);
      await this.db.run(sql, params);
    }
  }

  /**
   * Add the `holder` column to a legacy lock table.
   * A concurrent worker may win this race; a duplicate-column error is success.
   */
  private async addHolderColumn(originalError: unknown): Promise<void> {
    if (!this.autoMigrate) {
      throw new LockSchemaError(this.tableName, originalError);
    }
    try {
      await this.db.run(
        `ALTER TABLE ${this.tableName} ADD COLUMN holder TEXT`,
      );
    } catch (alterError) {
      if (!isDuplicateColumnError(alterError)) {
        throw new LockSchemaError(this.tableName, alterError);
      }
    }
  }

  /**
   * Release the lock by deleting the row we own.
   *
   * The `holder` predicate is what makes this safe: if our lease expired and
   * another request reclaimed the key, this deletes nothing instead of
   * unlocking a slot that request is actively using.
   *
   * @returns `true` if our row was deleted — proof we still held the lease;
   *   `false` if it matched nothing, meaning the lock had already been lost;
   *   `null` if that cannot be determined, because the release failed or the
   *   driver reports no affected-row count.
   */
  private async release(
    lockKey: string,
    holder: string,
  ): Promise<boolean | null> {
    try {
      const result = await this.db.run(
        `DELETE FROM ${this.tableName} WHERE lock_key = ? AND holder = ?`,
        [lockKey, holder],
      );
      const changes = extractChanges(result);
      return changes === null ? null : changes > 0;
    } catch {
      // Best-effort: a failed release must never mask the callback's outcome.
      // The TTL reclaims the lock regardless.
      return null;
    }
  }

  /**
   * Produce a fencing token, rejecting a generator that cannot supply one.
   *
   * An empty or non-string token would bind SQL NULL, and `WHERE holder = ?`
   * never matches NULL — so release would silently delete nothing and the lock
   * would leak for its whole TTL with no error raised anywhere. Every other
   * option is validated at construction; this one can only be checked on use.
   */
  private buildHolder(): string {
    const holder = this.generateHolder();
    if (typeof holder !== "string" || holder.length === 0) {
      throw new RangeError(
        `D1BookingLock: generateHolder() must return a non-empty string, received ` +
          `${safeDescribe(holder)}. An empty token cannot identify the lock's owner, ` +
          `so the lock could never be released.`,
      );
    }
    return holder;
  }

  /** Jittered exponential backoff: baseMs * 2^attempt + [0, baseMs) jitter. */
  private backoffMs(attempt: number): number {
    const exponential = this.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * this.baseDelayMs;
    return Math.min(exponential + jitter, 5_000); // cap at 5 s
  }
}

/**
 * Factory helper to create a `D1BookingLock` without the `new` keyword.
 *
 * @param db - Any object exposing a `run(sql, params)` method.
 * @param options - Optional lock configuration.
 * @returns A configured `D1BookingLock`.
 */
export function createD1BookingLock(
  db: LockDb,
  options?: D1BookingLockOptions,
): D1BookingLock {
  return new D1BookingLock(db, options);
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Collect the message text of an error and its nested `cause` chain.
 *
 * D1 and Drizzle both wrap driver errors, so the SQLite text we need to match
 * on is frequently one or two `cause` levels down.
 */
function errorText(error: unknown, depth = 0): string {
  if (depth > 8 || error === null || error === undefined) return "";
  if (typeof error === "string") return error;
  if (typeof error !== "object") return stringify(error);

  // Drivers scatter the signal across several fields: `node:sqlite` reports
  // `code`/`errcode`/`errstr` alongside a generic message, and D1 and Drizzle
  // both re-wrap through `cause`. An AggregateError hides the real error in
  // `errors`. Missing any of these classifies contention as a hard fault.
  //
  // Every read goes through `readProp`, because a rejection value may define a
  // throwing getter — and a classifier that throws would replace the driver's
  // real error with its own.
  const message = readProp(error, "message");
  const parts = [
    typeof message === "string" ? message : stringify(error),
    asText(readProp(error, "code")),
    asText(readProp(error, "errstr")),
    asText(readProp(error, "errcode")),
    errorText(readProp(error, "cause"), depth + 1),
  ];

  const nested = readProp(error, "errors");
  if (Array.isArray(nested)) {
    for (const item of nested) {
      parts.push(errorText(item, depth + 1));
    }
  }

  return parts.join(" ");
}

/** Read a property without letting a throwing getter escape. */
function readProp(target: unknown, key: string): unknown {
  try {
    return (target as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/** Render a string or number field for matching; ignore anything else. */
function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/**
 * `String(value)` that cannot itself throw.
 *
 * A driver may reject with a null-prototype object or one whose `message`
 * getter throws. Letting that escape would replace the driver's real fault with
 * a `TypeError` raised inside the classifier.
 */
function stringify(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "";
  }
}

/**
 * Detect a primary-key/unique violation on the lock table.
 *
 * Covers modern SQLite ("UNIQUE constraint failed"), older builds
 * ("PRIMARY KEY must be unique"), and D1's `D1_ERROR:`-prefixed wrapper.
 *
 * @param error - The error thrown by the driver.
 * @returns True when the error means "this lock is already held".
 */
export function isUniqueConstraintError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return (
    text.includes("unique constraint") ||
    text.includes("primary key must be unique") ||
    text.includes("sqlite_constraint_primarykey") ||
    text.includes("sqlite_constraint_unique") ||
    // node:sqlite extended result codes: 1555 = SQLITE_CONSTRAINT_PRIMARYKEY,
    // 2067 = SQLITE_CONSTRAINT_UNIQUE. Surfaced as numeric `errcode`.
    text.includes("1555") ||
    text.includes("2067")
  );
}

/** Detect "table X has no column named holder" / "no such column: holder". */
function isMissingHolderColumnError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return (
    text.includes("no column named holder") ||
    text.includes("no such column: holder") ||
    (text.includes("holder") && text.includes("has no column"))
  );
}

/** Detect a lost race on `ALTER TABLE ... ADD COLUMN holder`. */
function isDuplicateColumnError(error: unknown): boolean {
  return errorText(error).toLowerCase().includes("duplicate column name");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Default fencing token: a UUID, or random hex where `crypto` is absent. */
function defaultHolder(): string {
  const maybeCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof maybeCrypto?.randomUUID === "function") {
    return maybeCrypto.randomUUID();
  }
  return `h_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/**
 * Largest accepted lease duration: 2^31-1 ms, about 24.8 days.
 *
 * Beyond roughly 2.5e14 ms the derived expiry lands past year 9999, where
 * `Date.toISOString()` switches to the expanded form (`+011533-03-05T…`). `"+"`
 * sorts below every digit, so the stale-lock purge's `expires_at < ?` string
 * comparison would match immediately and the lock would be reclaimable the
 * instant it was taken — silently removing all mutual exclusion. No real lease
 * approaches this, so the bound is set at a value that is obviously safe.
 */
const MAX_LEASE_MS = 2_147_483_647;

/** Validate a lease duration: positive, finite, and within `MAX_LEASE_MS`. */
function requireDuration(value: number, label: string): number {
  requirePositive(value, label);
  if (value > MAX_LEASE_MS) {
    throw new RangeError(
      `D1BookingLock: ${label} must not exceed ${MAX_LEASE_MS} ms (~24.8 days), ` +
        `received ${value}. Longer leases produce expanded-year timestamps that break ` +
        `the stale-lock comparison and would disable mutual exclusion entirely.`,
    );
  }
  return value;
}

/** Validate a finite number strictly greater than zero. */
function requirePositive(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `D1BookingLock: ${label} must be a finite number greater than 0, received ${safeDescribe(value)}.`,
    );
  }
  return value;
}

/** Validate a finite integer of at least 1. */
function requirePositiveInt(value: number, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new RangeError(
      `D1BookingLock: ${label} must be an integer of at least 1, received ${safeDescribe(value)}.`,
    );
  }
  return value;
}

/** Validate a finite number of zero or greater. */
function requireNonNegative(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `D1BookingLock: ${label} must be a finite number of 0 or greater, received ${safeDescribe(value)}.`,
    );
  }
  return value;
}

/** Render an unknown value for an error message without throwing. */
function safeDescribe(value: unknown): string {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
