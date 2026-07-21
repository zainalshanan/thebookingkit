import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  D1BookingLock,
  LockAcquisitionError,
  LockLeaseExpiredError,
  LockSchemaError,
  LockDriverError,
  isUniqueConstraintError,
} from "../lock.js";
import type { LockDb } from "../lock.js";

// ---------------------------------------------------------------------------
// Mock DB helper
// ---------------------------------------------------------------------------

/**
 * Creates a mock LockDb that simulates D1's INSERT UNIQUE constraint behaviour.
 * The first call to INSERT succeeds; concurrent (simultaneous) inserts for the
 * same key throw an error until the first caller releases.
 */
function createMockLockDb() {
  const held = new Set<string>();
  const runCalls: Array<{ sql: string; params: unknown[] }> = [];

  const db: LockDb = {
    async run(sql: string, params: unknown[] = []) {
      runCalls.push({ sql, params });

      if (sql.includes("INSERT INTO")) {
        const lockKey = params[0] as string;
        if (held.has(lockKey)) {
          throw new Error("UNIQUE constraint failed: booking_locks.lock_key");
        }
        held.add(lockKey);
      } else if (sql.includes("DELETE FROM") && sql.includes("lock_key = ?")) {
        // Release or stale cleanup
        const lockKey = params[0] as string;
        held.delete(lockKey);
      }
      return {};
    },
  };

  return { db, held, runCalls };
}

// ---------------------------------------------------------------------------
// D1BookingLock.withLock()
// ---------------------------------------------------------------------------

describe("D1BookingLock.withLock()", () => {
  it("executes the callback and returns its value", async () => {
    const { db } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });

    const result = await lock.withLock("barber-1:2026-03-09", async () => {
      return "booking-id-123";
    });

    expect(result).toBe("booking-id-123");
  });

  it("acquires then releases the lock (INSERT then DELETE called)", async () => {
    const { db, runCalls } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });

    await lock.withLock("barber-1:2026-03-09", async () => "ok");

    const insertCalls = runCalls.filter((c) => c.sql.includes("INSERT INTO"));
    // Two DELETE calls: one stale-lock cleanup before acquire, one release after
    const deleteCalls = runCalls.filter(
      (c) => c.sql.includes("DELETE FROM") && c.sql.includes("lock_key = ?"),
    );

    expect(insertCalls).toHaveLength(1);
    expect(deleteCalls).toHaveLength(2); // cleanup + release
    expect(insertCalls[0].params[0]).toBe("barber-1:2026-03-09");
    // The release DELETE is scoped by the fencing token: (lock_key, holder)
    const releaseCalls = deleteCalls.filter((c) => c.sql.includes("holder = ?"));
    expect(releaseCalls).toHaveLength(1);
    expect(releaseCalls[0].params[0]).toBe("barber-1:2026-03-09");
    // The holder released must be exactly the one that was inserted
    expect(releaseCalls[0].params[1]).toBe(insertCalls[0].params[3]);
  });

  it("releases the lock even when the callback throws", async () => {
    const { db, held } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });

    await expect(
      lock.withLock("barber-1:2026-03-09", async () => {
        throw new Error("Booking conflict!");
      }),
    ).rejects.toThrow("Booking conflict!");

    // Lock should be released after the throw
    expect(held.has("barber-1:2026-03-09")).toBe(false);
  });

  it("allows a second lock with a different key concurrently", async () => {
    const { db } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });

    const results = await Promise.all([
      lock.withLock("barber-1:2026-03-09", async () => "a"),
      lock.withLock("barber-2:2026-03-09", async () => "b"),
    ]);

    expect(results).toContain("a");
    expect(results).toContain("b");
  });

  it("retries and succeeds after the lock is released", async () => {
    // Simulate a lock that is held for 2 attempts then released
    let insertAttempts = 0;
    let released = false;

    const db: LockDb = {
      async run(sql: string, params: unknown[] = []) {
        if (sql.includes("INSERT INTO")) {
          insertAttempts++;
          if (!released) {
            released = insertAttempts >= 2; // release after 2nd attempt
            if (insertAttempts < 2) {
              throw new Error("UNIQUE constraint failed: booking_locks.lock_key");
            }
          }
        }
        return {};
      },
    };

    const lock = new D1BookingLock(db, {
      baseDelayMs: 1, // very short delay for tests
      maxRetries: 5,
    });

    const result = await lock.withLock("key", async () => "success");
    expect(result).toBe("success");
    expect(insertAttempts).toBe(2);
  });

  it("throws LockAcquisitionError when maxRetries is exhausted", async () => {
    const db: LockDb = {
      async run(sql: string) {
        if (sql.includes("INSERT INTO")) {
          throw new Error("UNIQUE constraint failed: booking_locks.lock_key");
        }
        return {};
      },
    };

    const lock = new D1BookingLock(db, {
      baseDelayMs: 1,
      maxRetries: 3,
    });

    await expect(lock.withLock("locked-key", async () => "never")).rejects.toThrow(
      LockAcquisitionError,
    );
  });

  it("LockAcquisitionError contains the lock key and retry count", async () => {
    const db: LockDb = {
      async run(sql: string) {
        if (sql.includes("INSERT INTO")) {
          throw new Error("UNIQUE constraint failed");
        }
        return {};
      },
    };

    const lock = new D1BookingLock(db, { baseDelayMs: 1, maxRetries: 2 });

    try {
      await lock.withLock("provider-123:2026-03-09", async () => "x");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LockAcquisitionError);
      const e = err as LockAcquisitionError;
      expect(e.message).toContain("provider-123:2026-03-09");
      expect(e.message).toContain("2");
      expect(e.code).toBe("LOCK_ACQUISITION_EXHAUSTED");
    }
  });

  it("cleans up stale locks before each acquire attempt", async () => {
    const { db, runCalls } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0, lockTtlMs: 5000 });

    await lock.withLock("stale-key", async () => "ok");

    // There should be a DELETE for stale cleanup (WHERE expires_at < ?)
    const staleCleanupcalls = runCalls.filter(
      (c) => c.sql.includes("DELETE") && c.sql.includes("expires_at <"),
    );
    expect(staleCleanupcalls.length).toBeGreaterThanOrEqual(1);
  });

  it("sets an expiry time on the lock row", async () => {
    const { db, runCalls } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0, lockTtlMs: 10_000 });

    await lock.withLock("ttl-key", async () => "ok");

    const insert = runCalls.find((c) => c.sql.includes("INSERT INTO"));
    expect(insert).toBeDefined();
    // params[1] is the expires_at value — should be a future UTC-Z string
    const expiresAt = insert!.params[1] as string;
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now() - 1000);
    expect(expiresAt).toMatch(/Z$/);
  });
});

// ---------------------------------------------------------------------------
// Simulated booking race condition
// ---------------------------------------------------------------------------

describe("D1BookingLock — race condition simulation", () => {
  it("prevents double booking when two requests arrive simultaneously", async () => {
    // Shared state: slot is available initially
    let slotBooked = false;
    const bookingIds: string[] = [];

    // Real UNIQUE constraint behaviour: first INSERT wins, second throws
    const held = new Set<string>();
    const db: LockDb = {
      async run(sql: string, params: unknown[] = []) {
        if (sql.includes("INSERT INTO")) {
          const key = params[0] as string;
          if (held.has(key)) throw new Error("UNIQUE constraint failed");
          held.add(key);
        } else if (sql.includes("DELETE FROM") && sql.includes("lock_key = ?")) {
          held.delete(params[0] as string);
        }
        return {};
      },
    };

    const lock = new D1BookingLock(db, { baseDelayMs: 5, maxRetries: 10 });

    const attemptBooking = async (requestId: string): Promise<string | null> => {
      try {
        return await lock.withLock("barber-1:2026-03-09-14:00", async () => {
          // Read phase: check availability
          if (slotBooked) {
            return null; // Slot already taken
          }
          // Write phase: book it
          slotBooked = true;
          bookingIds.push(requestId);
          return requestId;
        });
      } catch {
        return null;
      }
    };

    // Fire two "simultaneous" requests
    const [r1, r2] = await Promise.all([
      attemptBooking("request-1"),
      attemptBooking("request-2"),
    ]);

    // Exactly one should succeed, one should see the slot as taken
    const successes = [r1, r2].filter(Boolean);
    expect(successes).toHaveLength(1);
    expect(bookingIds).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Constructor validation
// ---------------------------------------------------------------------------

describe("D1BookingLock — constructor validation", () => {
  it("rejects a db without a run() method", () => {
    expect(() => new D1BookingLock({} as unknown as LockDb)).toThrow(TypeError);
    expect(() => new D1BookingLock(null as unknown as LockDb)).toThrow(TypeError);
  });

  it.each([
    'locks"; DROP TABLE bookings; --',
    "booking locks",
    "1locks",
    "",
    "locks;",
    "locks--",
  ])("rejects tableName %j", (tableName) => {
    const { db } = createMockLockDb();
    expect(() => new D1BookingLock(db, { tableName })).toThrow(RangeError);
  });

  it.each([0, -1, NaN, Infinity, -Infinity])(
    "rejects lockTtlMs %p",
    (lockTtlMs) => {
      const { db } = createMockLockDb();
      expect(() => new D1BookingLock(db, { lockTtlMs })).toThrow(RangeError);
    },
  );

  it.each([0, -1, 1.5, NaN, Infinity])("rejects maxRetries %p", (maxRetries) => {
    const { db } = createMockLockDb();
    expect(() => new D1BookingLock(db, { maxRetries })).toThrow(RangeError);
  });

  it.each([-1, NaN, Infinity])("rejects baseDelayMs %p", (baseDelayMs) => {
    const { db } = createMockLockDb();
    expect(() => new D1BookingLock(db, { baseDelayMs })).toThrow(RangeError);
  });

  it("accepts baseDelayMs of 0 (no backoff)", () => {
    const { db } = createMockLockDb();
    expect(() => new D1BookingLock(db, { baseDelayMs: 0 })).not.toThrow();
  });

  it("accepts maxRetries of 1 (single attempt, no retry)", async () => {
    const { db } = createMockLockDb();
    const lock = new D1BookingLock(db, { maxRetries: 1, baseDelayMs: 0 });
    await expect(lock.withLock("k", async () => "ok")).resolves.toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// withLock argument validation
// ---------------------------------------------------------------------------

describe("D1BookingLock.withLock() — argument validation", () => {
  it.each([
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
  ])("rejects %s as a lockKey", async (_label, lockKey) => {
    const { db } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });
    await expect(
      lock.withLock(lockKey as unknown as string, async () => "x"),
    ).rejects.toThrow(RangeError);
  });

  it("rejects a non-function callback", async () => {
    const { db } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });
    await expect(
      lock.withLock("k", "not a function" as unknown as () => Promise<void>),
    ).rejects.toThrow(TypeError);
  });

  it("does not touch the database when validation fails", async () => {
    const { db, runCalls } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });
    await expect(lock.withLock("", async () => "x")).rejects.toThrow(RangeError);
    expect(runCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Fencing token
// ---------------------------------------------------------------------------

describe("D1BookingLock — fencing token", () => {
  it("scopes release to the holder that acquired the lease", async () => {
    const { db, runCalls } = createMockLockDb();
    const lock = new D1BookingLock(db, {
      baseDelayMs: 0,
      generateHolder: () => "token-abc",
    });

    await lock.withLock("k", async () => "ok");

    const release = runCalls.find(
      (c) => c.sql.includes("DELETE FROM") && c.sql.includes("holder = ?"),
    );
    expect(release).toBeDefined();
    expect(release!.params).toEqual(["k", "token-abc"]);
  });

  it("exposes the holder token on the handle", async () => {
    const { db } = createMockLockDb();
    const lock = new D1BookingLock(db, {
      baseDelayMs: 0,
      generateHolder: () => "token-xyz",
    });

    const seen = await lock.withLock("k", async (handle) => handle.holder);
    expect(seen).toBe("token-xyz");
  });

  it("generates a unique token per acquisition by default", async () => {
    const { db } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });
    const tokens = new Set<string>();

    for (let i = 0; i < 50; i++) {
      await lock.withLock("k", async (h) => void tokens.add(h.holder));
    }
    expect(tokens.size).toBe(50);
  });

  it("purges stale locks by expiry, never by holder", async () => {
    const { db, runCalls } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });

    await lock.withLock("k", async () => "ok");

    const purge = runCalls.find(
      (c) => c.sql.includes("DELETE FROM") && c.sql.includes("expires_at < ?"),
    );
    // Reclaiming an expired lock is intentional (crashed-worker recovery);
    // scoping the purge by holder would make it impossible.
    expect(purge).toBeDefined();
    expect(purge!.sql).not.toContain("holder");
  });
});

// ---------------------------------------------------------------------------
// Lease expiry
// ---------------------------------------------------------------------------

describe("D1BookingLock — lease expiry", () => {
  it("throws LockLeaseExpiredError when the callback outlives the lease", async () => {
    const { db } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0, lockTtlMs: 20 });

    await expect(
      lock.withLock("k", async () => {
        await new Promise((r) => setTimeout(r, 50));
        return "done";
      }),
    ).rejects.toThrow(LockLeaseExpiredError);
  });

  it("preserves the callback result on the error for compensation", async () => {
    const { db } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0, lockTtlMs: 20 });

    const error = await lock
      .withLock("k", async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { bookingId: "bk_1" };
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(LockLeaseExpiredError);
    expect(error.code).toBe("LOCK_LEASE_EXPIRED");
    expect(error.result).toEqual({ bookingId: "bk_1" });
    expect(error.lockTtlMs).toBe(20);
    expect(error.heldForMs).toBeGreaterThanOrEqual(20);
  });

  it("still releases the lock when the lease expired", async () => {
    const { db, held } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0, lockTtlMs: 20 });

    await lock
      .withLock("k", async () => {
        await new Promise((r) => setTimeout(r, 50));
      })
      .catch(() => {});

    expect(held.has("k")).toBe(false);
  });

  it("returns normally when onLeaseExpiry is 'ignore'", async () => {
    const { db } = createMockLockDb();
    const lock = new D1BookingLock(db, {
      baseDelayMs: 0,
      lockTtlMs: 20,
      onLeaseExpiry: "ignore",
    });

    const result = await lock.withLock("k", async () => {
      await new Promise((r) => setTimeout(r, 50));
      return "done";
    });
    expect(result).toBe("done");
  });

  it("prefers the callback's own error over the expiry error", async () => {
    // Masking a real failure with a lease warning would lose the root cause.
    const { db } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0, lockTtlMs: 20 });

    await expect(
      lock.withLock("k", async () => {
        await new Promise((r) => setTimeout(r, 50));
        throw new Error("payment declined");
      }),
    ).rejects.toThrow("payment declined");
  });

  it("does not fire for a callback that finishes within the lease", async () => {
    const { db } = createMockLockDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0, lockTtlMs: 10_000 });
    await expect(lock.withLock("k", async () => "fast")).resolves.toBe("fast");
  });
});

// ---------------------------------------------------------------------------
// Lease extension
// ---------------------------------------------------------------------------

describe("D1BookingLock — handle.extend()", () => {
  function extendableDb(changes: unknown) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db: LockDb = {
      async run(sql, params = []) {
        calls.push({ sql, params });
        if (sql.startsWith("UPDATE")) return changes;
        return {};
      },
    };
    return { db, calls };
  }

  it("scopes the UPDATE by lock_key and holder", async () => {
    const { db, calls } = extendableDb({ meta: { changes: 1 } });
    const lock = new D1BookingLock(db, {
      baseDelayMs: 0,
      generateHolder: () => "tok",
    });

    await lock.withLock("k", async (h) => h.extend(60_000));

    const update = calls.find((c) => c.sql.startsWith("UPDATE"));
    expect(update!.sql).toContain("lock_key = ? AND holder = ?");
    expect(update!.params[1]).toBe("k");
    expect(update!.params[2]).toBe("tok");
  });

  it("returns false when the lease was already lost", async () => {
    const { db } = extendableDb({ meta: { changes: 0 } });
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });
    const result = await lock.withLock("k", async (h) => h.extend());
    expect(result).toBe(false);
  });

  it("throws LockDriverError when the row count is unreadable", async () => {
    const { db } = extendableDb({ ok: true });
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });
    await expect(lock.withLock("k", async (h) => h.extend())).rejects.toThrow(
      LockDriverError,
    );
  });

  it.each([0, -1, NaN, Infinity])("rejects an invalid ttl %p", async (ttl) => {
    const { db } = extendableDb({ meta: { changes: 1 } });
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });
    await expect(lock.withLock("k", async (h) => h.extend(ttl))).rejects.toThrow(
      RangeError,
    );
  });

  it("reports isExpired() accurately across the lease boundary", async () => {
    const { db } = extendableDb({ meta: { changes: 1 } });
    const lock = new D1BookingLock(db, {
      baseDelayMs: 0,
      lockTtlMs: 20,
      onLeaseExpiry: "ignore",
    });

    await lock.withLock("k", async (h) => {
      expect(h.isExpired()).toBe(false);
      await new Promise((r) => setTimeout(r, 40));
      expect(h.isExpired()).toBe(true);
      expect(await h.extend(10_000)).toBe(true);
      expect(h.isExpired()).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

describe("isUniqueConstraintError()", () => {
  it.each([
    "UNIQUE constraint failed: booking_locks.lock_key",
    "D1_ERROR: UNIQUE constraint failed: booking_locks.lock_key",
    "PRIMARY KEY must be unique",
    "SQLITE_CONSTRAINT_PRIMARYKEY: constraint failed",
    "sqlite_constraint_unique",
  ])("recognises %j", (message) => {
    expect(isUniqueConstraintError(new Error(message))).toBe(true);
  });

  it("recognises the constraint text through a wrapped cause chain", () => {
    // Drizzle and the D1 binding both re-wrap driver errors.
    const inner = new Error("UNIQUE constraint failed: booking_locks.lock_key");
    const middle = new Error("D1 query failed", { cause: inner });
    const outer = new Error("Failed to run statement", { cause: middle });
    expect(isUniqueConstraintError(outer)).toBe(true);
  });

  it("accepts a bare string error", () => {
    expect(isUniqueConstraintError("UNIQUE constraint failed")).toBe(true);
  });

  it.each([
    ["a missing table", "no such table: booking_locks"],
    ["a network failure", "Network connection lost"],
    ["a NOT NULL violation", "NOT NULL constraint failed: booking_locks.expires_at"],
    ["a FK violation", "FOREIGN KEY constraint failed"],
    ["a syntax error", "near \"INSER\": syntax error"],
  ])("does not treat %s as contention", (_label, message) => {
    expect(isUniqueConstraintError(new Error(message))).toBe(false);
  });

  it.each([null, undefined, 0, {}, []])("handles %p without throwing", (value) => {
    expect(() => isUniqueConstraintError(value)).not.toThrow();
    expect(isUniqueConstraintError(value)).toBe(false);
  });

  it("terminates on a circular cause chain", () => {
    const a = new Error("outer") as Error & { cause?: unknown };
    const b = new Error("inner") as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    expect(() => isUniqueConstraintError(a)).not.toThrow();
  });
});

describe("D1BookingLock — non-contention errors surface immediately", () => {
  it.each([
    "no such table: booking_locks",
    "Network connection lost",
    "NOT NULL constraint failed: booking_locks.expires_at",
    "D1_ERROR: database is locked",
  ])("rethrows %j without retrying", async (message) => {
    let inserts = 0;
    const db: LockDb = {
      async run(sql) {
        if (sql.includes("INSERT INTO")) {
          inserts++;
          throw new Error(message);
        }
        return {};
      },
    };

    const lock = new D1BookingLock(db, { baseDelayMs: 0, maxRetries: 5 });
    await expect(lock.withLock("k", async () => "x")).rejects.toThrow(message);
    // A real fault must not be masked as lock contention or burn the retry budget.
    expect(inserts).toBe(1);
  });

  it("does not swallow an error thrown by the stale-lock purge", async () => {
    const db: LockDb = {
      async run(sql) {
        if (sql.includes("expires_at < ?")) throw new Error("disk I/O error");
        return {};
      },
    };
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });
    await expect(lock.withLock("k", async () => "x")).rejects.toThrow("disk I/O error");
  });

  it("swallows a release failure so it cannot mask the callback result", async () => {
    const db: LockDb = {
      async run(sql) {
        if (sql.includes("DELETE FROM") && sql.includes("holder = ?")) {
          throw new Error("connection reset during release");
        }
        return {};
      },
    };
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });
    // The TTL reclaims the lock, so a failed release must not fail the booking.
    await expect(lock.withLock("k", async () => "booked")).resolves.toBe("booked");
  });
});

// ---------------------------------------------------------------------------
// Legacy schema auto-migration
// ---------------------------------------------------------------------------

describe("D1BookingLock — legacy schema auto-migration", () => {
  /** A lock table that rejects the holder column until ALTER TABLE runs. */
  function legacyDb(options?: { alterFails?: Error }) {
    let hasHolder = false;
    const calls: string[] = [];
    const db: LockDb = {
      async run(sql) {
        calls.push(sql);
        if (sql.startsWith("ALTER TABLE")) {
          if (options?.alterFails) throw options.alterFails;
          hasHolder = true;
          return {};
        }
        if (sql.includes("INSERT INTO") && !hasHolder) {
          throw new Error("table booking_locks has no column named holder");
        }
        return {};
      },
    };
    return { db, calls };
  }

  it("adds the holder column and retries the insert", async () => {
    const { db, calls } = legacyDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });

    await expect(lock.withLock("k", async () => "ok")).resolves.toBe("ok");
    expect(calls.some((s) => s.startsWith("ALTER TABLE"))).toBe(true);
  });

  it("migrates only once across many acquisitions", async () => {
    const { db, calls } = legacyDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });

    for (let i = 0; i < 5; i++) await lock.withLock("k", async () => "ok");
    expect(calls.filter((s) => s.startsWith("ALTER TABLE"))).toHaveLength(1);
  });

  it("treats a lost ALTER race as success", async () => {
    // Another worker migrated the table between our failed INSERT and our
    // ALTER, so the retry INSERT succeeds even though the ALTER errored.
    let attempts = 0;
    const racingDb: LockDb = {
      async run(sql) {
        if (sql.startsWith("ALTER TABLE")) {
          throw new Error("duplicate column name: holder");
        }
        if (sql.includes("INSERT INTO")) {
          attempts++;
          if (attempts === 1) {
            throw new Error("table booking_locks has no column named holder");
          }
        }
        return {};
      },
    };

    const lock = new D1BookingLock(racingDb, { baseDelayMs: 0 });
    await expect(lock.withLock("k", async () => "ok")).resolves.toBe("ok");
  });

  it("wraps a genuine ALTER failure in LockSchemaError", async () => {
    const { db } = legacyDb({ alterFails: new Error("database is readonly") });
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });
    await expect(lock.withLock("k", async () => "ok")).rejects.toThrow(LockSchemaError);
  });

  it("throws LockSchemaError with the exact remedy when autoMigrate is off", async () => {
    const { db } = legacyDb();
    const lock = new D1BookingLock(db, { baseDelayMs: 0, autoMigrate: false });

    const error = await lock.withLock("k", async () => "ok").catch((e) => e);
    expect(error).toBeInstanceOf(LockSchemaError);
    expect(error.code).toBe("LOCK_SCHEMA_OUTDATED");
    expect(error.message).toContain("ALTER TABLE booking_locks ADD COLUMN holder TEXT");
  });

  it("does not attempt migration for an unrelated missing column", async () => {
    const db: LockDb = {
      async run(sql) {
        if (sql.startsWith("ALTER TABLE")) throw new Error("should not be called");
        if (sql.includes("INSERT INTO")) {
          throw new Error("table booking_locks has no column named expires_at");
        }
        return {};
      },
    };
    const lock = new D1BookingLock(db, { baseDelayMs: 0 });
    await expect(lock.withLock("k", async () => "ok")).rejects.toThrow(
      /no column named expires_at/,
    );
  });
});

// ---------------------------------------------------------------------------
// LockAcquisitionError shape
// ---------------------------------------------------------------------------

describe("LockAcquisitionError", () => {
  it("exposes the lock key and attempt count as fields", async () => {
    const db: LockDb = {
      async run(sql) {
        if (sql.includes("INSERT INTO")) throw new Error("UNIQUE constraint failed");
        return {};
      },
    };
    const lock = new D1BookingLock(db, { baseDelayMs: 0, maxRetries: 3 });

    const error = await lock.withLock("prov:2026-06-15", async () => "x").catch((e) => e);
    expect(error).toBeInstanceOf(LockAcquisitionError);
    expect(error.code).toBe("LOCK_ACQUISITION_EXHAUSTED");
    expect(error.lockKey).toBe("prov:2026-06-15");
    expect(error.attempts).toBe(3);
  });

  it("makes exactly maxRetries insert attempts", async () => {
    let inserts = 0;
    const db: LockDb = {
      async run(sql) {
        if (sql.includes("INSERT INTO")) {
          inserts++;
          throw new Error("UNIQUE constraint failed");
        }
        return {};
      },
    };
    const lock = new D1BookingLock(db, { baseDelayMs: 0, maxRetries: 4 });
    await lock.withLock("k", async () => "x").catch(() => {});
    expect(inserts).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Lease-expiry detection regressions
//
// The expiry decision originally used `Date.now() >= lease.expiresAt` and threw
// away two authoritative signals. It was wrong in both directions; each is
// pinned below.
// ---------------------------------------------------------------------------

describe("D1BookingLock — lease expiry is decided by the release, not the clock", () => {
  /** A lock table whose release row count and latency are both controllable. */
  function controllableDb(options: {
    releaseMatches: boolean;
    releaseDelayMs?: number;
    reportRowCount?: boolean;
  }) {
    const db: LockDb = {
      async run(sql) {
        if (sql.includes("DELETE FROM") && sql.includes("holder = ?")) {
          if (options.releaseDelayMs) {
            await new Promise((r) => setTimeout(r, options.releaseDelayMs));
          }
          if (options.reportRowCount === false) return { ok: true };
          return { meta: { changes: options.releaseMatches ? 1 : 0 } };
        }
        return { meta: { changes: 1 } };
      },
    };
    return db;
  }

  it("does not report expiry when a slow release proves we still held the lock", async () => {
    // The callback used 10 ms of a 100 ms lease; only the release round-trip
    // pushed past it. Charging that to the lease invents a race that never
    // happened, and the DELETE matching our holder proves we never lost it.
    const lock = new D1BookingLock(
      controllableDb({ releaseMatches: true, releaseDelayMs: 140 }),
      { baseDelayMs: 0, lockTtlMs: 100 },
    );

    await expect(
      lock.withLock("k", async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "booked";
      }),
    ).resolves.toBe("booked");
  });

  it("reports expiry when the release matched nothing, even if the clock says otherwise", async () => {
    // A peer reclaimed the key (e.g. via a skewed clock) while our in-memory
    // lease still looked valid. The release deleting zero rows is the only
    // evidence, and it must not be ignored.
    const lock = new D1BookingLock(controllableDb({ releaseMatches: false }), {
      baseDelayMs: 0,
      lockTtlMs: 60_000,
    });

    const error = await lock.withLock("k", async () => "booked").catch((e) => e);
    expect(error).toBeInstanceOf(LockLeaseExpiredError);
    expect(error.result).toBe("booked");
  });

  it("falls back to the clock when the driver reports no row count", async () => {
    const lock = new D1BookingLock(
      controllableDb({ releaseMatches: true, reportRowCount: false }),
      { baseDelayMs: 0, lockTtlMs: 20 },
    );

    await expect(
      lock.withLock("k", async () => {
        await new Promise((r) => setTimeout(r, 50));
        return "x";
      }),
    ).rejects.toThrow(LockLeaseExpiredError);
  });

  it("reports elapsed time against the same origin as the TTL", async () => {
    // heldForMs was measured from after acquire() returned while expiresAt was
    // derived from before the INSERT, so the message could claim expiry while
    // showing heldForMs < lockTtlMs.
    const lock = new D1BookingLock(controllableDb({ releaseMatches: false }), {
      baseDelayMs: 0,
      lockTtlMs: 30,
    });

    const error = await lock
      .withLock("k", async () => {
        await new Promise((r) => setTimeout(r, 60));
        return "x";
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(LockLeaseExpiredError);
    expect(error.heldForMs).toBeGreaterThanOrEqual(error.lockTtlMs);
  });
});

describe("D1BookingLock — extend() ownership and monotonicity", () => {
  function extendDb(changes: number) {
    const seen: Array<{ sql: string; params: unknown[] }> = [];
    const db: LockDb = {
      async run(sql, params = []) {
        seen.push({ sql, params });
        return sql.startsWith("UPDATE")
          ? { meta: { changes } }
          : { meta: { changes: 1 } };
      },
    };
    return { db, seen };
  }

  it("never shortens a lease that already runs longer", async () => {
    const { db, seen } = extendDb(1);
    const lock = new D1BookingLock(db, { baseDelayMs: 0, lockTtlMs: 600_000 });

    await lock.withLock("k", async (h) => {
      const before = h.expiresAt;
      // A short extend must not hand the key to the stale-lock purge while the
      // caller is still working.
      expect(await h.extend(10)).toBe(true);
      expect(h.expiresAt).toBeGreaterThanOrEqual(before);
    });

    const update = seen.find((c) => c.sql.startsWith("UPDATE"));
    expect(update).toBeDefined();
  });

  it("still verifies ownership when the lease already covers the request", async () => {
    // Skipping the round trip here would make extend() answer "yes" for a lock
    // we no longer hold.
    const { db, seen } = extendDb(0);
    const lock = new D1BookingLock(db, { baseDelayMs: 0, lockTtlMs: 600_000 });

    await lock.withLock("k", async (h) => {
      expect(await h.extend(10)).toBe(false);
    }).catch(() => {});

    expect(seen.some((c) => c.sql.startsWith("UPDATE"))).toBe(true);
  });

  it("keeps the in-memory lease in step with the DB under concurrent extends", async () => {
    // Assigning on resolution order rather than execution order let the
    // in-memory lease run ahead of the stored value.
    let stored = 0;
    const db: LockDb = {
      async run(sql, params = []) {
        if (sql.startsWith("UPDATE")) {
          await new Promise((r) => setTimeout(r, Math.random() * 5));
          stored = new Date(params[0] as string).getTime();
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 1 } };
      },
    };

    const lock = new D1BookingLock(db, { baseDelayMs: 0, lockTtlMs: 1_000 });
    await lock.withLock("k", async (h) => {
      await Promise.all([h.extend(5_000), h.extend(90_000), h.extend(20_000)]);
      expect(h.expiresAt).toBe(stored);
    });
  });
});

describe("D1BookingLock — hardening regressions", () => {
  it("rejects a generateHolder that returns an empty token", async () => {
    // An empty token binds SQL NULL; `holder = ?` never matches NULL, so the
    // lock would leak for its whole TTL with no error anywhere.
    const { db } = createMockLockDb();
    const lock = new D1BookingLock(db, {
      baseDelayMs: 0,
      generateHolder: () => "" as string,
    });
    await expect(lock.withLock("k", async () => "x")).rejects.toThrow(RangeError);
  });

  it("rejects a generateHolder returning a non-string", async () => {
    const { db } = createMockLockDb();
    const lock = new D1BookingLock(db, {
      baseDelayMs: 0,
      generateHolder: () => undefined as unknown as string,
    });
    await expect(lock.withLock("k", async () => "x")).rejects.toThrow(RangeError);
  });

  it("rejects a lockTtlMs large enough to produce expanded-year timestamps", () => {
    // Past year 9999 toISOString() emits "+011533-...", which sorts below every
    // digit — the stale purge would match instantly and mutual exclusion would
    // vanish silently.
    const { db } = createMockLockDb();
    expect(() => new D1BookingLock(db, { lockTtlMs: 3e14 })).toThrow(/24.8 days/);
  });

  it("still accepts a generous but sane lease", () => {
    const { db } = createMockLockDb();
    expect(() => new D1BookingLock(db, { lockTtlMs: 86_400_000 })).not.toThrow();
  });

  it("re-migrates when the holder column disappears after a successful insert", async () => {
    // The migration latch was a one-way flag read when the rejection ARRIVED,
    // so a restored/swapped database was permanently unrecoverable, and an
    // in-flight insert could be hard-failed by a sibling that migrated first.
    let hasHolder = true;
    let alters = 0;
    const db: LockDb = {
      async run(sql) {
        if (sql.startsWith("ALTER TABLE")) { alters++; hasHolder = true; return {}; }
        if (sql.includes("INSERT INTO") && !hasHolder) {
          throw new Error("table booking_locks has no column named holder");
        }
        return {};
      },
    };

    const lock = new D1BookingLock(db, { baseDelayMs: 0 });
    await lock.withLock("k", async () => "first");
    hasHolder = false; // schema regression
    await expect(lock.withLock("k", async () => "second")).resolves.toBe("second");
    expect(alters).toBe(1);
  });
});

describe("isUniqueConstraintError() — wrapper shapes", () => {
  it("reads a code field when the message is generic", () => {
    expect(
      isUniqueConstraintError({
        message: "D1_ERROR: Error in prepared statement",
        code: "SQLITE_CONSTRAINT_PRIMARYKEY",
      }),
    ).toBe(true);
  });

  it("reads a numeric errcode (node:sqlite extended result code)", () => {
    expect(isUniqueConstraintError({ message: "constraint failed", errcode: 1555 })).toBe(true);
    expect(isUniqueConstraintError({ message: "constraint failed", errcode: 2067 })).toBe(true);
  });

  it("reads an AggregateError's nested errors", () => {
    const agg = new AggregateError(
      [new Error("UNIQUE constraint failed: booking_locks.lock_key")],
      "batch failed",
    );
    expect(isUniqueConstraintError(agg)).toBe(true);
  });

  it("walks deeper than five wrapper levels", () => {
    let error: Error = new Error("UNIQUE constraint failed");
    for (let i = 0; i < 7; i++) error = new Error(`wrap ${i}`, { cause: error });
    expect(isUniqueConstraintError(error)).toBe(true);
  });

  it("does not throw on a null-prototype rejection value", () => {
    const hostile = Object.create(null) as Record<string, unknown>;
    hostile.weird = true;
    expect(() => isUniqueConstraintError(hostile)).not.toThrow();
  });

  it("does not throw when message is a getter that throws", () => {
    const hostile = {
      get message(): string {
        throw new Error("getter boom");
      },
    };
    expect(() => isUniqueConstraintError(hostile)).not.toThrow();
  });

  it("still rejects unrelated errors carrying a code", () => {
    expect(
      isUniqueConstraintError({ message: "no such table", code: "SQLITE_ERROR" }),
    ).toBe(false);
  });
});
