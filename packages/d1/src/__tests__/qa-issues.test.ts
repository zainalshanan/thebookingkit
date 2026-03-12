/**
 * QA Issue Validation Tests — D1 Package
 *
 * These tests validate bugs identified in the QA audit.
 * Each test is expected to FAIL until the corresponding fix is applied.
 */
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, vi } from "vitest";
import { D1BookingLock, LockAcquisitionError } from "../lock.js";
import type { LockDb } from "../lock.js";
import { d1LocalDayQuery, d1OverrideRowsToInputs } from "../booking-helpers.js";
import { weeklyScheduleToRules } from "../schedule-adapter.js";
import { D1DateCodec, D1DateDecodeError } from "../codec.js";
import { buildMigrationSql } from "../migration.js";
import type { WeeklySchedule } from "../schedule-adapter.js";

// ---------------------------------------------------------------------------
// H6 — Lock acquire() catches ALL errors, not just UNIQUE constraint
// ---------------------------------------------------------------------------
describe("H6 — Lock acquire catches all errors", () => {
  it("should propagate infrastructure errors instead of masking them as LockAcquisitionError", async () => {
    const db: LockDb = {
      async run(sql: string) {
        if (sql.includes("INSERT INTO")) {
          // Simulate a missing table error, NOT a UNIQUE constraint
          throw new Error("no such table: booking_locks");
        }
        return {};
      },
    };

    const lock = new D1BookingLock(db, {
      maxRetries: 2,
      baseDelayMs: 1,
      lockTtlMs: 100,
    });

    // BUG: Currently catches ALL errors in the INSERT, retries, then throws
    // LockAcquisitionError("Could not acquire booking lock...") which is misleading.
    // It should detect "no such table" is not a UNIQUE constraint and rethrow immediately.
    try {
      await lock.withLock("test-key", async () => "result");
      expect.fail("Should have thrown");
    } catch (error) {
      // Currently throws LockAcquisitionError — WRONG
      // Should throw the original "no such table" error
      expect(error).not.toBeInstanceOf(LockAcquisitionError);
      expect((error as Error).message).toContain("no such table");
    }
  });
});

// ---------------------------------------------------------------------------
// M1 — d1LocalDayQuery adds flat 24h — wrong on DST transition days
// ---------------------------------------------------------------------------
describe("M1 — d1LocalDayQuery DST handling", () => {
  it("should produce correct bounds on Australian spring-forward day", () => {
    // Australia/Sydney springs forward on first Sunday of October
    // On 2026-10-04 (Sunday), clocks go from 02:00 to 03:00 AEST→AEDT
    // The local day is only 23 hours long
    const { bounds } = d1LocalDayQuery("2026-10-04", "Australia/Sydney");

    // Midnight AEST (UTC+10) = 2026-10-03T14:00:00Z
    const gte = new Date(bounds.gte);
    // Next midnight AEDT (UTC+11) = 2026-10-04T13:00:00Z (23 hours later, not 24)
    const lte = new Date(bounds.lte);

    // Add 1ms back because lte is trimmed by 1ms for the exclusive upper bound.
    // We are testing DST-correct span (23h vs 24h flat), not sub-millisecond precision.
    const spanMs = lte.getTime() - gte.getTime() + 1;
    const hoursDiff = spanMs / (60 * 60 * 1000);

    // BUG: Currently adds flat 24 hours, giving 24h span instead of 23h
    // The lte should be 2026-10-04T13:00:00Z but is 2026-10-03T14:00:00Z + 24h = 2026-10-04T14:00:00Z
    expect(hoursDiff).toBe(23); // Fails: currently returns 24
  });

  it("should produce correct bounds on Australian fall-back day", () => {
    // Australia/Sydney falls back on first Sunday of April
    // On 2026-04-05 (Sunday), clocks go from 03:00 to 02:00 AEDT→AEST
    // The local day is 25 hours long
    const { bounds } = d1LocalDayQuery("2026-04-05", "Australia/Sydney");

    const gte = new Date(bounds.gte);
    const lte = new Date(bounds.lte);
    // Add 1ms back because lte is trimmed by 1ms for the exclusive upper bound.
    const spanMs = lte.getTime() - gte.getTime() + 1;
    const hoursDiff = spanMs / (60 * 60 * 1000);

    // BUG: Currently adds flat 24 hours instead of 25
    expect(hoursDiff).toBe(25); // Fails: currently returns 24
  });
});

// ---------------------------------------------------------------------------
// M2 — d1LocalDayQuery inclusive lte at next midnight boundary
// ---------------------------------------------------------------------------
describe("M2 — d1LocalDayQuery inclusive boundary", () => {
  it("lte should exclude exactly the start of the next day", () => {
    const { bounds } = d1LocalDayQuery("2026-03-09", "Australia/Sydney");

    // bounds.lte should be < next day midnight, not equal to it
    // A booking starting at exactly next midnight should NOT be included
    const lte = new Date(bounds.lte);
    const gte = new Date(bounds.gte);

    // The lte bound equals next midnight — any booking starting at exactly that
    // time would be included with <= comparison, which is wrong
    // Ideally lte should be midnight - 1ms, or the query should use < instead of <=
    const nextMidnight = new Date(gte.getTime() + 24 * 60 * 60 * 1000);

    // BUG: lte === nextMidnight (inclusive of next day start)
    expect(lte.getTime()).toBeLessThan(nextMidnight.getTime());
  });
});

// ---------------------------------------------------------------------------
// M3 — weeklyScheduleToRules silently drops invalid HH:mm
// ---------------------------------------------------------------------------
describe("M3 — weeklyScheduleToRules silent drops", () => {
  it("should throw or warn when HH:mm format is invalid (missing leading zero)", () => {
    const schedule: WeeklySchedule = {
      monday: { startTime: "9:00", endTime: "17:00", isOff: false }, // Missing leading zero!
      tuesday: { startTime: "09:00", endTime: "17:00", isOff: false },
      wednesday: { startTime: null, endTime: null, isOff: true },
      thursday: { startTime: null, endTime: null, isOff: true },
      friday: { startTime: null, endTime: null, isOff: true },
      saturday: { startTime: null, endTime: null, isOff: true },
      sunday: { startTime: null, endTime: null, isOff: true },
    };

    const rules = weeklyScheduleToRules(schedule, "Australia/Sydney");

    // BUG: Monday is silently dropped because "9:00" doesn't match /^\d{2}:\d{2}$/
    // Only Tuesday produces a rule. The barber sees no Monday availability with no error.
    // This test documents the silent drop. Ideally it should either:
    // (a) accept "9:00" by normalizing it, or (b) throw an error
    const rruleStrings = rules.map((r) => r.rrule);
    const hasMondayRule = rruleStrings.some((r) => r.includes("MO"));

    expect(hasMondayRule).toBe(true); // FAILS: Monday is silently dropped
  });
});

// ---------------------------------------------------------------------------
// M4 — isHHmm regex accepts invalid times like "99:99"
// ---------------------------------------------------------------------------
describe("M4 — isHHmm accepts out-of-range times", () => {
  it("should reject '25:61' as invalid time", () => {
    const schedule: WeeklySchedule = {
      monday: { startTime: "25:00", endTime: "30:00", isOff: false },
      tuesday: { startTime: null, endTime: null, isOff: true },
      wednesday: { startTime: null, endTime: null, isOff: true },
      thursday: { startTime: null, endTime: null, isOff: true },
      friday: { startTime: null, endTime: null, isOff: true },
      saturday: { startTime: null, endTime: null, isOff: true },
      sunday: { startTime: null, endTime: null, isOff: true },
    };

    const rules = weeklyScheduleToRules(schedule, "UTC");

    // BUG: "25:00" passes isHHmm validation and produces a rule
    // Should be rejected as invalid time
    expect(rules).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// M5 — Stale lock cleanup threshold is wrong (2x TTL)
// ---------------------------------------------------------------------------
describe("M5 — Stale lock cleanup threshold", () => {
  it("should clean up a lock that has expired (past its TTL)", async () => {
    const lockTtlMs = 1000; // 1 second TTL
    let storedExpiresAt: string | null = null;
    let deleteThreshold: string | null = null;

    const db: LockDb = {
      async run(sql: string, params: unknown[] = []) {
        if (sql.includes("DELETE FROM") && sql.includes("expires_at")) {
          // Capture the stale threshold used for cleanup
          deleteThreshold = params[1] as string;
        }
        if (sql.includes("INSERT INTO")) {
          storedExpiresAt = params[1] as string;
        }
        return {};
      },
    };

    const lock = new D1BookingLock(db, {
      lockTtlMs,
      maxRetries: 1,
      baseDelayMs: 1,
    });

    await lock.withLock("test", async () => {});

    // The lock stores expiresAt = now + lockTtlMs
    // The cleanup should delete locks where expiresAt < now
    // BUG: cleanup uses staleThreshold = now - lockTtlMs, which means
    // a lock must be expired for > lockTtlMs before cleanup (2x TTL total)
    expect(deleteThreshold).not.toBeNull();
    expect(storedExpiresAt).not.toBeNull();

    const deleteTime = new Date(deleteThreshold!).getTime();
    const expiresTime = new Date(storedExpiresAt!).getTime();

    // The delete threshold should be >= now (cleaning up anything that has expired)
    // BUG: deleteThreshold = now - lockTtlMs, which is ~2x before expiresAt
    // An expired lock (expiresAt in the past) won't be cleaned up for another lockTtlMs
    const now = Date.now();
    expect(deleteTime).toBeGreaterThanOrEqual(now - 100); // Should be ~now, not now - TTL
  });
});

// ---------------------------------------------------------------------------
// M6 — D1DateCodec.encode() fallback to native Date parsing
// ---------------------------------------------------------------------------
describe("M6 — D1DateCodec encode fallback", () => {
  it("should reject ambiguous date strings instead of using native Date()", () => {
    // "March 9, 2026" would be accepted by native Date() but is ambiguous
    expect(() => {
      D1DateCodec.encode("March 9, 2026");
    }).toThrow(); // Currently PASSES because the fallback accepts it!

    // "03/09/2026" — US format, accepted by V8 but ambiguous (is it MM/DD or DD/MM?)
    expect(() => {
      D1DateCodec.encode("03/09/2026");
    }).toThrow(); // BUG: This PASSES in V8 (returns a valid date) but shouldn't be accepted
  });
});

// ---------------------------------------------------------------------------
// M8 — Lock release swallows all errors silently
// ---------------------------------------------------------------------------
describe("M8 — Lock release error handling", () => {
  it("should expose release failures somehow (callback, warning, etc.)", async () => {
    let releaseFailed = false;

    const db: LockDb = {
      async run(sql: string) {
        if (sql.includes("DELETE FROM") && !sql.includes("expires_at")) {
          // Release DELETE fails
          releaseFailed = true;
          throw new Error("D1 connection lost");
        }
        return {};
      },
    };

    const lock = new D1BookingLock(db, {
      lockTtlMs: 10000,
      maxRetries: 1,
      baseDelayMs: 1,
    });

    // The withLock should complete successfully (release is best-effort)
    // but there should be some way to know the release failed
    const result = await lock.withLock("test", async () => "ok");
    expect(result).toBe("ok");

    // BUG: Release failure is completely silent. No callback, no warning, no event.
    // The lock will stay held until TTL expires.
    expect(releaseFailed).toBe(true);

    // This test PASSES but documents the issue: there's no observability
    // into release failures. Adding an onError callback would help.
  });
});

// ---------------------------------------------------------------------------
// D1-C1 — SQL injection via tableName in lock.ts
// ---------------------------------------------------------------------------
describe("D1-C1 — SQL injection via tableName in lock.ts", () => {
  it("rejects malicious tableName at construction time", () => {
    const db: LockDb = { async run() { return {}; } };

    expect(() => {
      new D1BookingLock(db, {
        tableName: "locks; DROP TABLE bookings; --",
        maxRetries: 1,
        baseDelayMs: 1,
        lockTtlMs: 1000,
      });
    }).toThrow(RangeError);
  });

  it("rejects a tableName containing SQL metacharacters", () => {
    const db: LockDb = { async run() { return {}; } };

    expect(() => {
      new D1BookingLock(db, { tableName: "'; DROP TABLE users; --" });
    }).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// D1-C2 — SQL injection via identifiers in migration.ts
// ---------------------------------------------------------------------------
describe("D1-C2 — SQL injection via identifiers in buildMigrationSql", () => {
  it("rejects malicious column names in the updates object", () => {
    const maliciousColName = "col = 1; DROP TABLE bookings; --";
    const updates: Record<string, string> = {
      [maliciousColName]: "2026-03-09T14:00:00.000Z",
    };

    expect(() => buildMigrationSql("bookings", "id", "row-1", updates)).toThrow(RangeError);
  });

  it("rejects malicious tableName", () => {
    const maliciousTable = "bookings; DROP TABLE users; --";
    const updates = { starts_at: "2026-03-09T14:00:00.000Z" };

    expect(() => buildMigrationSql(maliciousTable, "id", "row-1", updates)).toThrow(RangeError);
  });

  it("rejects malicious primaryKey", () => {
    const maliciousPk = "id OR 1=1; --";
    const updates = { starts_at: "2026-03-09T14:00:00.000Z" };

    expect(() => buildMigrationSql("bookings", maliciousPk, "row-1", updates)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// D1-M7 — d1OverrideRowsToInputs date-only string decode
// ---------------------------------------------------------------------------
describe("D1-M7 — d1OverrideRowsToInputs date-only string decode", () => {
  it("should throw D1DateDecodeError when date column contains a date-only string", () => {
    // A date-only string "2026-03-10" has no time component — it is ambiguous
    // (is it midnight UTC? local midnight? start of day?). The codec should
    // reject it, but the last-resort `new Date(raw)` path in decode() accepts it.
    const rows = [
      {
        date: "2026-03-10",
        startTime: "09:00",
        endTime: "17:00",
        isUnavailable: false,
      },
    ];

    // BUG: decode() falls through to new Date("2026-03-10") which succeeds in V8.
    // The call should throw D1DateDecodeError but currently returns a Date object.
    expect(() => {
      d1OverrideRowsToInputs(rows);
    }).toThrow(D1DateDecodeError);
  });

  it("date-only string now correctly throws (fix verified)", () => {
    const rows = [
      {
        date: "2026-03-10",
        startTime: "09:00",
        endTime: "17:00",
        isUnavailable: false,
      },
    ];

    expect(() => {
      d1OverrideRowsToInputs(rows);
    }).toThrow(D1DateDecodeError);
  });
});

// ---------------------------------------------------------------------------
// D1-M8 — d1LocalDayQuery no timezone validation
// ---------------------------------------------------------------------------
describe("D1-M8 — d1LocalDayQuery no timezone validation", () => {
  it("should throw an error when given an invalid IANA timezone", () => {
    // d1LocalDayQuery delegates to normalizeToUTC which calls isValidTimezone.
    // An invalid timezone should produce a clear error, not a cryptic one.
    expect(() => {
      d1LocalDayQuery("2026-03-09", "Invalid/Timezone");
    }).toThrow();
  });

  it("error thrown for invalid timezone should be clear (InvalidTimezoneError from core)", () => {
    // The error that propagates is InvalidTimezoneError from @thebookingkit/core.
    // This test documents that the error IS clear (test is expected to PASS).
    // However the error originates from core, not from d1LocalDayQuery itself —
    // d1LocalDayQuery performs no upfront timezone validation of its own.
    let caughtError: unknown;
    try {
      d1LocalDayQuery("2026-03-09", "Not_A_Timezone");
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError).toBeInstanceOf(Error);

    const msg = (caughtError as Error).message;
    // The message should reference the bad timezone value, not an internal stack trace
    expect(msg).toContain("Not_A_Timezone");

    // BUG: d1LocalDayQuery has no dedicated validation — the error only
    // surfaces because normalizeToUTC validates internally. If the call order
    // were different (or if date-fns-tz silently accepted bad TZs), d1LocalDayQuery
    // would silently produce wrong output with no error.
    expect((caughtError as Error).name).toBe("InvalidTimezoneError");
  });

  it("does not validate timezone before calling normalizeToUTC (documents coupling)", () => {
    // d1LocalDayQuery has no guard of the form:
    //   if (!isValidTimezone(timezone)) throw new RangeError(...)
    // This means the error message is owned by @thebookingkit/core, not by this function.
    // A well-designed function should validate its own inputs early and clearly.
    //
    // This test confirms that the function itself does not throw a RangeError
    // with its own message — it throws whatever normalizeToUTC throws.
    let caughtError: unknown;
    try {
      d1LocalDayQuery("2026-03-09", "Bad/Tz");
    } catch (e) {
      caughtError = e;
    }

    // The error is NOT a plain RangeError from d1LocalDayQuery
    // (it would say something like `d1LocalDayQuery: invalid timezone`)
    const isD1OwnedRangeError =
      caughtError instanceof RangeError &&
      (caughtError as RangeError).message.startsWith("d1LocalDayQuery");

    // BUG: d1LocalDayQuery does not produce its own validation message
    expect(isD1OwnedRangeError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D1-L1 — Silent discard of inverted time windows
// ---------------------------------------------------------------------------
describe("D1-L1 — weeklyScheduleToRules silently drops inverted windows", () => {
  it("throws RangeError for a schedule with startTime after endTime", () => {
    const schedule: WeeklySchedule = {
      monday: { startTime: "17:00", endTime: "09:00", isOff: false }, // inverted
      tuesday: { startTime: null, endTime: null, isOff: true },
      wednesday: { startTime: null, endTime: null, isOff: true },
      thursday: { startTime: null, endTime: null, isOff: true },
      friday: { startTime: null, endTime: null, isOff: true },
      saturday: { startTime: null, endTime: null, isOff: true },
      sunday: { startTime: null, endTime: null, isOff: true },
    };

    expect(() => weeklyScheduleToRules(schedule, "UTC")).toThrow(RangeError);
  });

  it("should throw or warn when startTime is after endTime — currently does neither", () => {
    const schedule: WeeklySchedule = {
      monday: { startTime: "17:00", endTime: "09:00", isOff: false },
      tuesday: { startTime: "09:00", endTime: "17:00", isOff: false }, // valid day
      wednesday: { startTime: null, endTime: null, isOff: true },
      thursday: { startTime: null, endTime: null, isOff: true },
      friday: { startTime: null, endTime: null, isOff: true },
      saturday: { startTime: null, endTime: null, isOff: true },
      sunday: { startTime: null, endTime: null, isOff: true },
    };

    // BUG: Should throw (or at least warn) about the Monday misconfiguration.
    // Currently: silently drops Monday and returns only the Tuesday rule.
    expect(() => {
      weeklyScheduleToRules(schedule, "UTC");
    }).toThrow(); // FAILS — no error is thrown
  });

  it("midnight-crossing schedules (e.g. 22:00 to 02:00) now throw RangeError", () => {
    const schedule: WeeklySchedule = {
      monday: { startTime: "22:00", endTime: "02:00", isOff: false }, // night shift
      tuesday: { startTime: null, endTime: null, isOff: true },
      wednesday: { startTime: null, endTime: null, isOff: true },
      thursday: { startTime: null, endTime: null, isOff: true },
      friday: { startTime: null, endTime: null, isOff: true },
      saturday: { startTime: null, endTime: null, isOff: true },
      sunday: { startTime: null, endTime: null, isOff: true },
    };

    expect(() => weeklyScheduleToRules(schedule, "UTC")).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// D1-L2 — BookingConflictError imported but never used in lock.ts
// ---------------------------------------------------------------------------
describe("D1-L2 — BookingConflictError unused import in lock.ts", () => {
  it("lock.ts no longer imports BookingConflictError (fix verified)", async () => {
    const lockFileContent = fs.readFileSync(
      path.resolve(__dirname, "../lock.ts"),
      "utf-8",
    ) as string;

    // The unused import line has been removed (JSDoc refs may remain)
    expect(lockFileContent).not.toMatch(/import\s*\{[^}]*BookingConflictError[^}]*\}/);
  });

  it("withLock does not throw BookingConflictError on its own", async () => {
    // Confirm that D1BookingLock itself never throws BookingConflictError.
    // Only the callback provided by the caller would throw it.
    const db: LockDb = {
      async run() { return {}; },
    };

    const lock = new D1BookingLock(db, { maxRetries: 1, baseDelayMs: 1 });

    // A callback that does NOT throw BookingConflictError
    const result = await lock.withLock("test-key", async () => "done");
    expect(result).toBe("done");

    // If lock.ts runtime code threw BookingConflictError internally,
    // the above would fail. Since it does not, this confirms the import is dead.
  });
});
