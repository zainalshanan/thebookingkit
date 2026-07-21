/**
 * Regression test for the advisory lock's fencing-token gap.
 *
 * ## The defect
 *
 * Before the fencing token, `D1BookingLock.release()` was:
 *
 * ```sql
 * DELETE FROM booking_locks WHERE lock_key = ?
 * ```
 *
 * No notion of *who* owned the row. That is safe only while every holder
 * finishes inside its lease. It does not, because leases expire: a worker that
 * stalls past `lockTtlMs` has its lock purged and reclaimed by the next
 * request — deliberate crashed-worker recovery. When the stalled worker
 * eventually finishes, its cleanup deletes the **new** holder's row, silently
 * unlocking a slot that holder is actively writing to. A third request then
 * walks straight in, and two writers run the read-check-write sequence
 * concurrently: a double booking.
 *
 * ## What is and is not fixed
 *
 * The fencing token does **not** stop the stalled holder and the new holder
 * from overlapping — reclaiming an expired lock is the intended behaviour, and
 * the stalled worker's own writes are what `insertBookingIfFree()` exists to
 * reject. What it fixes is the *cascade*: release is now scoped to the holder,
 * so a lapsed holder cannot unlock anyone else's slot. `LockLeaseExpiredError`
 * additionally tells the lapsed holder that its critical section was no longer
 * protected, instead of returning as though nothing happened.
 *
 * ## How this is verified
 *
 * `LegacyD1BookingLock` in the harness is a port of the pre-fix release
 * semantics. Its fidelity was validated by running this exact scenario against
 * the real shipped source from a git worktree at the pre-fix commit; every
 * observed field matched. The port lets this test live in the repo permanently
 * without depending on a worktree.
 */

import { describe, it, expect } from "vitest";
import { D1BookingLock, LockAcquisitionError, LockLeaseExpiredError } from "../lock.js";
import {
  LegacyD1BookingLock,
  runStalledHolderScenario,
  makeLockTable,
  type LockCtor,
} from "./fencing-regression-harness.js";

describe("Fencing token — the pre-fix gap was real", () => {
  it("legacy release lets a lapsed holder unlock a slot another holder is using", async () => {
    const r = await runStalledHolderScenario(LegacyD1BookingLock as unknown as LockCtor);

    // A's unscoped release destroyed B's lock row while B was still inside.
    expect(r.lockSurvivedARelease).toBe(false);
    // With the row gone, C acquired the "free" lock immediately...
    expect(r.entered).toEqual(["A", "B", "C"]);
    expect(r.cOutcome).toBe("entered");
    // ...putting two writers in the critical section at once. This is the
    // double booking: both would read the slot as free and both would insert.
    expect(r.bAndCConcurrent).toBe(true);
    // And A was never told its lease had lapsed.
    expect(r.aOutcome).toBe("returned normally");
  });

  it("current release leaves the live holder's lock intact", async () => {
    const r = await runStalledHolderScenario(D1BookingLock as unknown as LockCtor);

    // A's release matched no row, because B owns the key now.
    expect(r.lockSurvivedARelease).toBe(true);
    // C is refused, so the critical section stays exclusive.
    expect(r.entered).toEqual(["A", "B"]);
    expect(r.cOutcome).toBe("LockAcquisitionError");
    expect(r.bAndCConcurrent).toBe(false);
    // A learns its lease lapsed rather than assuming it was protected.
    expect(r.aOutcome).toBe("LockLeaseExpiredError");
  });

  it("the two implementations disagree on every observable", async () => {
    const legacy = await runStalledHolderScenario(
      LegacyD1BookingLock as unknown as LockCtor,
    );
    const current = await runStalledHolderScenario(D1BookingLock as unknown as LockCtor);

    expect(current.lockSurvivedARelease).not.toBe(legacy.lockSurvivedARelease);
    expect(current.entered).not.toEqual(legacy.entered);
    expect(current.bAndCConcurrent).not.toBe(legacy.bAndCConcurrent);
    expect(current.aOutcome).not.toBe(legacy.aOutcome);
    expect(current.cOutcome).not.toBe(legacy.cOutcome);
  });
});

describe("Fencing token — release is ownership-scoped", () => {
  it("emits holder in the release predicate, and only there", async () => {
    const { db } = makeLockTable();
    const seen: string[] = [];
    const spy = {
      async run(sql: string, params?: unknown[]) {
        seen.push(sql);
        return db.run(sql, params);
      },
    };

    await new D1BookingLock(spy, { baseDelayMs: 0 }).withLock("k", async () => "ok");

    const release = seen.find(
      (s) => s.includes("DELETE FROM") && !s.includes("expires_at <"),
    );
    const purge = seen.find((s) => s.includes("expires_at <"));

    expect(release).toContain("lock_key = ? AND holder = ?");
    // The stale purge must stay unscoped, or a crashed worker's lock would
    // never be reclaimable by anyone.
    expect(purge).not.toContain("holder");
  });

  it("a lapsed holder's release is a no-op against a reclaimed key", async () => {
    const { db, rows } = makeLockTable();
    const KEY = "prov_1:2026-06-15";

    // B currently holds the key.
    rows.set(KEY, {
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      holder: "holder-B",
    });

    // A, whose lease lapsed long ago, runs its cleanup.
    await db.run(`DELETE FROM booking_locks WHERE lock_key = ? AND holder = ?`, [
      KEY,
      "holder-A",
    ]);

    expect(rows.get(KEY)?.holder).toBe("holder-B");
  });

  it("does not block a holder from releasing its own lock", async () => {
    const { db, rows } = makeLockTable();
    await new D1BookingLock(db, { baseDelayMs: 0 }).withLock("k", async () => "ok");
    // A correct fix must still release normally — otherwise every lock would
    // linger until its TTL and throughput would collapse.
    expect(rows.size).toBe(0);
  });
});

describe("Fencing token — error types", () => {
  it("exposes LockLeaseExpiredError and LockAcquisitionError as the harness reports", async () => {
    // The scenario compares error *names*; assert those map to the real classes
    // so a rename cannot silently weaken the regression test above.
    expect(new LockLeaseExpiredError("k", 100, 10, "r").name).toBe(
      "LockLeaseExpiredError",
    );
    expect(new LockAcquisitionError("k", 5).name).toBe("LockAcquisitionError");
  });
});
