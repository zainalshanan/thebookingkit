/**
 * Shared harness for the fencing-token regression test.
 *
 * Contains two things:
 *
 * 1. `LegacyD1BookingLock` — a faithful port of the pre-fencing-token release
 *    semantics that shipped in @thebookingkit/d1 <= 0.3.1. Its fidelity is not
 *    assumed: it is asserted against the real shipped source (via a git
 *    worktree) whenever that source is available.
 *
 * 2. `runStalledHolderScenario` — a fully deterministic three-request scenario
 *    that exposes the difference between the two release strategies. It uses
 *    explicit promise gates rather than wall-clock sleeps, so the interleaving
 *    is identical on an idle laptop and a saturated CI runner.
 *
 * This file is a test helper, not part of the package's public API. It is
 *  excluded from the published build along with the rest of `__tests__`.
 */

/** Minimal DB shape, mirroring `LockDb` without importing it. */
interface HarnessDb {
  run(sql: string, params?: unknown[]): Promise<unknown>;
}

/** The subset of `D1BookingLock`'s surface the scenario drives. */
export interface LockLike {
  withLock<T>(lockKey: string, fn: (handle?: unknown) => Promise<T>): Promise<T>;
}

/** Constructor shape shared by the legacy and current locks. */
export type LockCtor = new (
  db: HarnessDb,
  options?: {
    lockTtlMs?: number;
    baseDelayMs?: number;
    maxRetries?: number;
    tableName?: string;
  },
) => LockLike;

// ---------------------------------------------------------------------------
// Legacy implementation (pre-fix)
// ---------------------------------------------------------------------------

/**
 * The advisory lock exactly as it behaved before the fencing token was added.
 *
 * The single behavioural difference that matters is in `release()`: it deletes
 * by `lock_key` alone, with no notion of who owns the row. Everything else —
 * stale purge, CAS insert, backoff — matches the original.
 */
export class LegacyD1BookingLock implements LockLike {
  private readonly db: HarnessDb;
  private readonly tableName: string;
  private readonly lockTtlMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(
    db: HarnessDb,
    options?: {
      lockTtlMs?: number;
      baseDelayMs?: number;
      maxRetries?: number;
      tableName?: string;
    },
  ) {
    this.db = db;
    this.tableName = options?.tableName ?? "booking_locks";
    this.lockTtlMs = options?.lockTtlMs ?? 10_000;
    this.maxRetries = options?.maxRetries ?? 5;
    this.baseDelayMs = options?.baseDelayMs ?? 100;
  }

  async withLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
    await this.acquire(lockKey);
    try {
      return await fn();
    } finally {
      await this.release(lockKey);
    }
  }

  private async acquire(lockKey: string): Promise<void> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const staleThreshold = new Date().toISOString();
      await this.db.run(
        `DELETE FROM ${this.tableName} WHERE lock_key = ? AND expires_at < ?`,
        [lockKey, staleThreshold],
      );

      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.lockTtlMs).toISOString();

      try {
        await this.db.run(
          `INSERT INTO ${this.tableName} (lock_key, expires_at, created_at) VALUES (?, ?, ?)`,
          [lockKey, expiresAt, now.toISOString()],
        );
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("UNIQUE constraint")) throw error;
        if (attempt < this.maxRetries - 1) {
          await new Promise((r) =>
            setTimeout(r, this.baseDelayMs * Math.pow(2, attempt)),
          );
        }
      }
    }
    const error = new Error(
      `Could not acquire booking lock for "${lockKey}" after ${this.maxRetries} attempts.`,
    );
    error.name = "LockAcquisitionError";
    throw error;
  }

  /** The gap: deletes the row for this key regardless of who currently owns it. */
  private async release(lockKey: string): Promise<void> {
    try {
      await this.db.run(`DELETE FROM ${this.tableName} WHERE lock_key = ?`, [
        lockKey,
      ]);
    } catch {
      // Best-effort, as in the original.
    }
  }
}

// ---------------------------------------------------------------------------
// booking_locks simulation
// ---------------------------------------------------------------------------

/**
 * An in-memory `booking_locks` table with SQLite semantics.
 *
 * It honours whichever statement shape the lock under test emits, so each
 * implementation gets exactly the behaviour its own SQL asks for:
 * - legacy: `DELETE ... WHERE lock_key = ?`                 (unscoped)
 * - current: `DELETE ... WHERE lock_key = ? AND holder = ?` (ownership-scoped)
 */
export function makeLockTable() {
  const rows = new Map<string, { expiresAt: string; holder?: string }>();

  const db: HarnessDb = {
    async run(sql: string, params: unknown[] = []) {
      // The current lock may probe for the holder column on a legacy table.
      if (sql.includes("ALTER TABLE")) return { meta: { changes: 0 } };

      if (sql.includes("INSERT INTO")) {
        const [key, expiresAt, , holder] = params as string[];
        if (rows.has(key)) {
          throw new Error("UNIQUE constraint failed: booking_locks.lock_key");
        }
        rows.set(key, { expiresAt, holder });
        return { meta: { changes: 1 } };
      }

      if (sql.includes("DELETE FROM")) {
        // Stale purge — scoped by expiry, never by holder.
        if (sql.includes("expires_at < ?")) {
          const [key, threshold] = params as string[];
          const row = rows.get(key);
          if (row && row.expiresAt < threshold) {
            rows.delete(key);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        // Release.
        const [key, holder] = params as string[];
        const row = rows.get(key);
        if (!row) return { meta: { changes: 0 } };
        if (sql.includes("holder = ?") && row.holder !== holder) {
          return { meta: { changes: 0 } };
        }
        rows.delete(key);
        return { meta: { changes: 1 } };
      }

      if (sql.includes("UPDATE")) {
        const [expiresAt, key, holder] = params as string[];
        const row = rows.get(key);
        if (row && row.holder === holder) {
          row.expiresAt = expiresAt;
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      }

      return { meta: { changes: 0 } };
    },
  };

  return { db, rows };
}

// ---------------------------------------------------------------------------
// Deterministic scenario
// ---------------------------------------------------------------------------

/** A one-shot promise gate. */
function gate() {
  let open!: () => void;
  const passed = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { passed, open };
}

/** Yield long enough for a 1 ms lease to be unambiguously expired. */
const elapseLease = () => new Promise((r) => setTimeout(r, 5));

/** What the scenario observed. Compared field-by-field across implementations. */
export interface ScenarioOutcome {
  /** Requests that reached the critical section, in order. */
  entered: string[];
  /** True if B and C were ever inside the critical section together. */
  bAndCConcurrent: boolean;
  /** Whether a lock row still existed, and was owned, right after A released. */
  lockSurvivedARelease: boolean;
  /** How A's `withLock` settled. */
  aOutcome: string;
  /** How C's acquisition attempt settled. */
  cOutcome: string;
}

const KEY = "prov_1:2026-06-15";

/**
 * The stalled-holder scenario, sequenced by explicit gates so the interleaving
 * is identical on every machine:
 *
 * 1. A acquires a 1 ms lease and stalls inside the critical section.
 * 2. The lease elapses. B purges the stale row and acquires the key.
 * 3. A finally finishes and releases. **This is the divergence.**
 *      - unscoped release: deletes B's row, unlocking a slot B is still using
 *      - scoped release:   holder mismatch, deletes nothing
 * 4. C tries to acquire while B is still inside.
 *      - if B's row is gone, C gets in and two writers run concurrently
 *
 * Note that A and B overlapping is *inherent to lease expiry* and happens under
 * both implementations — reclaiming an expired lock is deliberate
 * crashed-worker recovery. What the fencing token prevents is the cascade in
 * steps 3–4, and what `LockLeaseExpiredError` adds is telling A about it.
 *
 * @param LockClass - The lock implementation to exercise.
 * @returns The observed outcome, for comparison against another implementation.
 */
export async function runStalledHolderScenario(
  LockClass: LockCtor,
): Promise<ScenarioOutcome> {
  const { db, rows } = makeLockTable();

  const entered: string[] = [];
  const inside = new Set<string>();
  let bAndCConcurrent = false;
  let lockSurvivedARelease = false;
  let aOutcome = "returned normally";
  let cOutcome = "entered";

  const enter = (who: string) => {
    entered.push(who);
    inside.add(who);
    if (inside.has("B") && inside.has("C")) bAndCConcurrent = true;
  };

  const aInside = gate();
  const aMayFinish = gate();
  const bInside = gate();
  const bMayFinish = gate();

  // ── A: acquires a lease that will expire while it is still working ────────
  const a = new LockClass(db, { lockTtlMs: 1, baseDelayMs: 0, maxRetries: 1 })
    .withLock(KEY, async () => {
      enter("A");
      aInside.open();
      await aMayFinish.passed;
      inside.delete("A");
      return "A";
    })
    .catch((e: Error) => {
      aOutcome = e.name;
    });

  await aInside.passed;
  await elapseLease();

  // ── B: reclaims the expired lease (crashed-worker recovery) ───────────────
  const b = new LockClass(db, { lockTtlMs: 10_000, baseDelayMs: 0, maxRetries: 1 })
    .withLock(KEY, async () => {
      enter("B");
      bInside.open();
      await bMayFinish.passed;
      inside.delete("B");
      return "B";
    })
    .catch((e: Error) => e.name);

  await bInside.passed;

  // ── A finishes and releases — the divergence ──────────────────────────────
  aMayFinish.open();
  await a;

  lockSurvivedARelease = Boolean(rows.get(KEY)?.holder);

  // ── C: attempts to acquire while B is still inside ────────────────────────
  await new LockClass(db, { lockTtlMs: 10_000, baseDelayMs: 0, maxRetries: 1 })
    .withLock(KEY, async () => {
      enter("C");
      inside.delete("C");
      return "C";
    })
    .catch((e: Error) => {
      cOutcome = e.name;
    });

  bMayFinish.open();
  await b;

  return { entered, bAndCConcurrent, lockSurvivedARelease, aOutcome, cOutcome };
}
