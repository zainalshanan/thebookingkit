/**
 * D1BookingLock — application-level optimistic lock for double-booking prevention.
 *
 * ## Background
 *
 * PostgreSQL provides the `EXCLUDE USING gist` constraint (with `btree_gist`)
 * to prevent overlapping booking rows at the database level. SQLite / D1 has
 * no equivalent range-exclusion constraint.
 *
 * D1 serializes writes to a single primary (there is no concurrent write path),
 * but that serialization is at the connection level — it does NOT make a
 * read-then-write sequence atomic. Two requests that arrive simultaneously will
 * both read the same empty slot, both pass the availability check, and both
 * insert, producing a double booking.
 *
 * ## Strategy: Advisory lock via a dedicated table
 *
 * We use a `booking_locks` table as a Compare-And-Swap mutex:
 *
 *   1. INSERT a lock row with a unique key (provider_id + ISO date string).
 *   2. Execute the availability check and INSERT.
 *   3. DELETE the lock row.
 *
 * Because D1 serializes writes, step 1 from the second concurrent request will
 * fail with a UNIQUE constraint violation while the first holds the lock.
 * The second request retries with exponential backoff.
 *
 * ## Required schema
 *
 * Add this table to your Drizzle SQLite schema:
 *
 * ```ts
 * export const bookingLocks = sqliteTable("booking_locks", {
 *   lockKey:   text("lock_key").primaryKey(),
 *   expiresAt: text("expires_at").notNull(),  // UTC-Z string
 *   createdAt: text("created_at").notNull(),  // UTC-Z string
 * });
 * ```
 *
 * And add this migration to your D1 setup:
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS booking_locks (
 *   lock_key   TEXT PRIMARY KEY,
 *   expires_at TEXT NOT NULL,
 *   created_at TEXT NOT NULL
 * );
 * ```
 *
 * ## Usage
 *
 * ```ts
 * const lock = new D1BookingLock(db, "booking_locks");
 *
 * await lock.withLock(`${barberId}:${dateStr}`, async () => {
 *   // This block is serialized — safe to read then write
 *   const existing = await db.select()...
 *   const available = isSlotAvailable(rules, [], existing, start, end);
 *   if (!available) throw new BookingConflictError();
 *   await db.insert(bookings).values({ ... });
 * });
 * ```
 */

/** Minimum shape of the DB client required by D1BookingLock. */
export interface LockDb {
  /** Execute a raw SQL statement (for INSERT and DELETE on the lock table). */
  run(sql: string, params?: unknown[]): Promise<unknown>;
}

/** Options for configuring D1BookingLock behaviour. */
export interface D1BookingLockOptions {
  /**
   * Name of the advisory lock table in your D1 schema.
   * Must have columns: lock_key (TEXT PK), expires_at (TEXT), created_at (TEXT).
   * @default "booking_locks"
   */
  tableName?: string;

  /**
   * How long a lock is considered valid before it is treated as stale and
   * can be overwritten (in milliseconds). This is a safety valve for crashed
   * workers that never released the lock.
   * @default 10_000 (10 seconds)
   */
  lockTtlMs?: number;

  /**
   * Maximum number of acquire attempts before giving up.
   * @default 5
   */
  maxRetries?: number;

  /**
   * Base delay between retry attempts in milliseconds.
   * Actual delay = baseDelayMs * 2^attempt + jitter.
   * @default 100
   */
  baseDelayMs?: number;
}

/**
 * Thrown when all lock acquisition attempts are exhausted without success.
 */
export class LockAcquisitionError extends Error {
  public readonly code = "LOCK_ACQUISITION_EXHAUSTED";

  constructor(lockKey: string, maxRetries: number) {
    super(
      `Could not acquire booking lock for "${lockKey}" after ${maxRetries} attempts. ` +
        `The slot may be in the process of being booked — please try again.`,
    );
    this.name = "LockAcquisitionError";
  }
}

/**
 * Application-level advisory lock for D1 / SQLite booking flows.
 *
 * Each instance targets one lock table. Create one per request handler or
 * share a single instance in a module-level singleton.
 */
export class D1BookingLock {
  private readonly db: LockDb;
  private readonly tableName: string;
  private readonly lockTtlMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(db: LockDb, options?: D1BookingLockOptions) {
    this.db = db;
    const tableName = options?.tableName ?? "booking_locks";
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new RangeError(
        `D1BookingLock: invalid tableName "${tableName}". Must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.`,
      );
    }
    this.tableName = tableName;
    this.lockTtlMs = options?.lockTtlMs ?? 10_000;
    this.maxRetries = options?.maxRetries ?? 5;
    this.baseDelayMs = options?.baseDelayMs ?? 100;
  }

  /**
   * Acquire a lock, run the provided callback, then release the lock.
   * Retries with jittered exponential backoff if the lock is held.
   *
   * The callback should perform the full read-check-write sequence.
   * If the callback throws, the lock is released and the error propagates.
   *
   * @param lockKey - Unique key identifying the resource being locked.
   *   A good convention is `"${providerId}:${dateStr}"`.
   * @param fn - Async callback containing the availability check and insert.
   * @returns The return value of the callback.
   * @throws LockAcquisitionError when retries are exhausted.
   * @throws BookingConflictError if the callback detects a conflict.
   */
  async withLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
    await this.acquire(lockKey);

    try {
      return await fn();
    } finally {
      await this.release(lockKey);
    }
  }

  /**
   * Attempt to insert the lock row. Retries with exponential backoff when
   * the INSERT fails due to a UNIQUE constraint (lock already held).
   * Also cleans up stale locks (expired TTL) before each attempt.
   */
  private async acquire(lockKey: string): Promise<void> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      // Purge stale locks first to handle crashed workers
      const staleThreshold = new Date().toISOString();
      await this.db.run(
        `DELETE FROM ${this.tableName} WHERE lock_key = ? AND expires_at < ?`,
        [lockKey, staleThreshold],
      );

      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.lockTtlMs).toISOString();
      const createdAt = now.toISOString();

      try {
        await this.db.run(
          `INSERT INTO ${this.tableName} (lock_key, expires_at, created_at) VALUES (?, ?, ?)`,
          [lockKey, expiresAt, createdAt],
        );
        return; // Lock acquired
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Only retry on UNIQUE constraint violations — rethrow everything else
        if (!message.includes("UNIQUE constraint")) {
          throw error;
        }
        if (attempt < this.maxRetries - 1) {
          await sleep(this.backoffMs(attempt));
        }
      }
    }

    throw new LockAcquisitionError(lockKey, this.maxRetries);
  }

  /** Release the lock by deleting the row. */
  private async release(lockKey: string): Promise<void> {
    try {
      await this.db.run(
        `DELETE FROM ${this.tableName} WHERE lock_key = ?`,
        [lockKey],
      );
    } catch {
      // Best-effort. The TTL will expire the lock automatically.
    }
  }

  /** Jittered exponential backoff: baseMs * 2^attempt + [0, baseMs) jitter */
  private backoffMs(attempt: number): number {
    const exponential = this.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * this.baseDelayMs;
    return Math.min(exponential + jitter, 5_000); // cap at 5 s
  }
}

/** A minimal lock implementation for use in environments where you own the
 * SQL execution (e.g. you use Drizzle's `db.run` or the raw D1 `prepare/run`
 * API). This wraps `D1BookingLock` with a simpler constructor signature. */
export function createD1BookingLock(
  /** Any object that exposes a `run(sql, params)` method */
  db: LockDb,
  options?: D1BookingLockOptions,
): D1BookingLock {
  return new D1BookingLock(db, options);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
