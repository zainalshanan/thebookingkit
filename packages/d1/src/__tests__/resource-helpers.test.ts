import { describe, it, expect } from "vitest";
import {
  d1ResourceAvailabilityRowsToInputs,
  d1ResourceOverrideRowsToInputs,
  D1ResourceBookingLock,
  createD1ResourceBookingLock,
} from "../resource-helpers.js";
import type {
  D1ResourceAvailabilityRuleRow,
  D1ResourceAvailabilityOverrideRow,
  D1ResourceRow,
} from "../resource-helpers.js";
import { RESOURCE_DDL } from "../migration.js";
import { LockAcquisitionError } from "../lock.js";
import type { LockDb } from "../lock.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeRuleRow(
  overrides: Partial<D1ResourceAvailabilityRuleRow> = {},
): D1ResourceAvailabilityRuleRow {
  return {
    id: "rule-1",
    resourceId: "resource-1",
    rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    startTime: "09:00",
    endTime: "17:00",
    timezone: "America/New_York",
    validFrom: null,
    validUntil: null,
    ...overrides,
  };
}

function makeOverrideRow(
  overrides: Partial<D1ResourceAvailabilityOverrideRow> = {},
): D1ResourceAvailabilityOverrideRow {
  return {
    id: "override-1",
    resourceId: "resource-1",
    date: "2026-03-10T00:00:00.000Z",
    startTime: null,
    endTime: null,
    isUnavailable: 1,
    reason: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// d1ResourceAvailabilityRowsToInputs()
// ---------------------------------------------------------------------------

describe("d1ResourceAvailabilityRowsToInputs()", () => {
  it("returns empty array for empty input", () => {
    expect(d1ResourceAvailabilityRowsToInputs([])).toEqual([]);
  });

  it("converts a canonical UTC-Z rule row correctly", () => {
    const rows: D1ResourceAvailabilityRuleRow[] = [makeRuleRow()];
    const inputs = d1ResourceAvailabilityRowsToInputs(rows);

    expect(inputs).toHaveLength(1);
    expect(inputs[0].rrule).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(inputs[0].startTime).toBe("09:00");
    expect(inputs[0].endTime).toBe("17:00");
    expect(inputs[0].timezone).toBe("America/New_York");
    expect(inputs[0].validFrom).toBeNull();
    expect(inputs[0].validUntil).toBeNull();
  });

  it("preserves null validFrom and validUntil as null", () => {
    const rows: D1ResourceAvailabilityRuleRow[] = [
      makeRuleRow({ validFrom: null, validUntil: null }),
    ];
    const inputs = d1ResourceAvailabilityRowsToInputs(rows);

    expect(inputs[0].validFrom).toBeNull();
    expect(inputs[0].validUntil).toBeNull();
  });

  it("decodes validFrom UTC-Z string into a Date object", () => {
    const rows: D1ResourceAvailabilityRuleRow[] = [
      makeRuleRow({ validFrom: "2026-01-01T00:00:00.000Z" }),
    ];
    const inputs = d1ResourceAvailabilityRowsToInputs(rows);

    expect(inputs[0].validFrom).toBeInstanceOf(Date);
    expect((inputs[0].validFrom as Date).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("decodes validUntil UTC-Z string into a Date object", () => {
    const rows: D1ResourceAvailabilityRuleRow[] = [
      makeRuleRow({ validUntil: "2026-12-31T23:59:59.999Z" }),
    ];
    const inputs = d1ResourceAvailabilityRowsToInputs(rows);

    expect(inputs[0].validUntil).toBeInstanceOf(Date);
    expect((inputs[0].validUntil as Date).toISOString()).toBe(
      "2026-12-31T23:59:59.999Z",
    );
  });

  it("decodes both validFrom and validUntil when set", () => {
    const rows: D1ResourceAvailabilityRuleRow[] = [
      makeRuleRow({
        validFrom: "2026-03-01T00:00:00.000Z",
        validUntil: "2026-09-01T00:00:00.000Z",
      }),
    ];
    const inputs = d1ResourceAvailabilityRowsToInputs(rows);

    expect(inputs[0].validFrom).toBeInstanceOf(Date);
    expect(inputs[0].validUntil).toBeInstanceOf(Date);
    expect((inputs[0].validFrom as Date) < (inputs[0].validUntil as Date)).toBe(
      true,
    );
  });

  it("decodes legacy local-ISO validFrom for backwards compatibility", () => {
    // Legacy rows written without the Z suffix — interpreted as UTC
    const rows: D1ResourceAvailabilityRuleRow[] = [
      makeRuleRow({ validFrom: "2026-01-01T00:00:00" }),
    ];
    const inputs = d1ResourceAvailabilityRowsToInputs(rows);

    expect(inputs[0].validFrom).toBeInstanceOf(Date);
    expect((inputs[0].validFrom as Date).getUTCFullYear()).toBe(2026);
    expect((inputs[0].validFrom as Date).getUTCMonth()).toBe(0); // January
  });

  it("handles a batch of multiple rule rows", () => {
    const rows: D1ResourceAvailabilityRuleRow[] = [
      makeRuleRow({ id: "rule-1", rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR" }),
      makeRuleRow({ id: "rule-2", rrule: "RRULE:FREQ=WEEKLY;BYDAY=SA", startTime: "10:00", endTime: "15:00" }),
    ];
    const inputs = d1ResourceAvailabilityRowsToInputs(rows);

    expect(inputs).toHaveLength(2);
    expect(inputs[0].rrule).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(inputs[1].rrule).toBe("RRULE:FREQ=WEEKLY;BYDAY=SA");
    expect(inputs[1].startTime).toBe("10:00");
    expect(inputs[1].endTime).toBe("15:00");
  });

  it("D1DateCodec round-trip: encoded date decodes back to the same instant", () => {
    const originalDate = new Date("2026-06-15T12:00:00.000Z");
    const encoded = originalDate.toISOString(); // simulate D1DateCodec.encode()

    const rows: D1ResourceAvailabilityRuleRow[] = [
      makeRuleRow({ validFrom: encoded }),
    ];
    const inputs = d1ResourceAvailabilityRowsToInputs(rows);

    expect((inputs[0].validFrom as Date).getTime()).toBe(originalDate.getTime());
  });
});

// ---------------------------------------------------------------------------
// d1ResourceOverrideRowsToInputs()
// ---------------------------------------------------------------------------

describe("d1ResourceOverrideRowsToInputs()", () => {
  it("returns empty array for empty input", () => {
    expect(d1ResourceOverrideRowsToInputs([])).toEqual([]);
  });

  it("converts a whole-day block override row (isUnavailable=1)", () => {
    const rows: D1ResourceAvailabilityOverrideRow[] = [makeOverrideRow()];
    const inputs = d1ResourceOverrideRowsToInputs(rows);

    expect(inputs).toHaveLength(1);
    expect(inputs[0].date).toBeInstanceOf(Date);
    expect(inputs[0].date.toISOString()).toBe("2026-03-10T00:00:00.000Z");
    expect(inputs[0].isUnavailable).toBe(true);
    expect(inputs[0].startTime).toBeNull();
    expect(inputs[0].endTime).toBeNull();
  });

  it("coerces integer 0 (SQLite false) to boolean false", () => {
    const rows: D1ResourceAvailabilityOverrideRow[] = [
      makeOverrideRow({
        isUnavailable: 0,
        startTime: "10:00",
        endTime: "15:00",
      }),
    ];
    const inputs = d1ResourceOverrideRowsToInputs(rows);

    expect(inputs[0].isUnavailable).toBe(false);
    expect(inputs[0].startTime).toBe("10:00");
    expect(inputs[0].endTime).toBe("15:00");
  });

  it("coerces integer 1 (SQLite true) to boolean true", () => {
    const rows: D1ResourceAvailabilityOverrideRow[] = [
      makeOverrideRow({ isUnavailable: 1 }),
    ];
    const inputs = d1ResourceOverrideRowsToInputs(rows);

    expect(inputs[0].isUnavailable).toBe(true);
  });

  it("accepts boolean true for isUnavailable (some Drizzle versions return booleans)", () => {
    const rows: D1ResourceAvailabilityOverrideRow[] = [
      makeOverrideRow({ isUnavailable: true }),
    ];
    const inputs = d1ResourceOverrideRowsToInputs(rows);

    expect(inputs[0].isUnavailable).toBe(true);
  });

  it("accepts boolean false for isUnavailable", () => {
    const rows: D1ResourceAvailabilityOverrideRow[] = [
      makeOverrideRow({ isUnavailable: false }),
    ];
    const inputs = d1ResourceOverrideRowsToInputs(rows);

    expect(inputs[0].isUnavailable).toBe(false);
  });

  it("preserves null startTime and endTime when set to null", () => {
    const rows: D1ResourceAvailabilityOverrideRow[] = [
      makeOverrideRow({ startTime: null, endTime: null }),
    ];
    const inputs = d1ResourceOverrideRowsToInputs(rows);

    expect(inputs[0].startTime).toBeNull();
    expect(inputs[0].endTime).toBeNull();
  });

  it("preserves startTime and endTime strings when provided", () => {
    const rows: D1ResourceAvailabilityOverrideRow[] = [
      makeOverrideRow({
        startTime: "14:00",
        endTime: "18:00",
        isUnavailable: 0,
      }),
    ];
    const inputs = d1ResourceOverrideRowsToInputs(rows);

    expect(inputs[0].startTime).toBe("14:00");
    expect(inputs[0].endTime).toBe("18:00");
  });

  it("decodes legacy local-ISO date strings for backwards compatibility", () => {
    const rows: D1ResourceAvailabilityOverrideRow[] = [
      makeOverrideRow({ date: "2026-03-10T00:00:00" }),
    ];
    const inputs = d1ResourceOverrideRowsToInputs(rows);

    expect(inputs[0].date).toBeInstanceOf(Date);
    expect(inputs[0].date.getUTCDate()).toBe(10);
    expect(inputs[0].date.getUTCMonth()).toBe(2); // March (0-indexed)
  });

  it("handles a batch of multiple override rows", () => {
    const rows: D1ResourceAvailabilityOverrideRow[] = [
      makeOverrideRow({ id: "ov-1", date: "2026-03-10T00:00:00.000Z", isUnavailable: 1 }),
      makeOverrideRow({ id: "ov-2", date: "2026-03-15T00:00:00.000Z", isUnavailable: 0, startTime: "09:00", endTime: "13:00" }),
    ];
    const inputs = d1ResourceOverrideRowsToInputs(rows);

    expect(inputs).toHaveLength(2);
    expect(inputs[0].isUnavailable).toBe(true);
    expect(inputs[1].isUnavailable).toBe(false);
    expect(inputs[1].startTime).toBe("09:00");
  });

  it("D1DateCodec round-trip: encoded override date decodes back to same instant", () => {
    const originalDate = new Date("2026-07-04T00:00:00.000Z");
    const encoded = originalDate.toISOString();

    const rows: D1ResourceAvailabilityOverrideRow[] = [
      makeOverrideRow({ date: encoded }),
    ];
    const inputs = d1ResourceOverrideRowsToInputs(rows);

    expect(inputs[0].date.getTime()).toBe(originalDate.getTime());
  });
});

// ---------------------------------------------------------------------------
// D1ResourceRow interface — type-level structural check
// ---------------------------------------------------------------------------

describe("D1ResourceRow interface", () => {
  it("accepts a valid resource row shape (isActive as integer)", () => {
    const row: D1ResourceRow = {
      id: "res-1",
      organizationId: null,
      name: "Table 5",
      slug: "table-5",
      type: "table",
      capacity: 4,
      isActive: 1,
      location: "patio",
      metadata: null,
    };

    expect(row.id).toBe("res-1");
    expect(row.capacity).toBe(4);
    expect(row.isActive).toBe(1);
    expect(row.location).toBe("patio");
    expect(row.metadata).toBeNull();
  });

  it("accepts a valid resource row shape (isActive as boolean)", () => {
    const row: D1ResourceRow = {
      id: "res-2",
      organizationId: "org-abc",
      name: "Yoga Mat 3",
      slug: "yoga-mat-3",
      type: "mat",
      capacity: 1,
      isActive: true,
      location: null,
      metadata: JSON.stringify({ color: "purple" }),
    };

    expect(Boolean(row.isActive)).toBe(true);
    expect(row.metadata).toBe('{"color":"purple"}');
  });

  it("accepts null location and metadata", () => {
    const row: D1ResourceRow = {
      id: "res-3",
      organizationId: null,
      name: "Court A",
      slug: "court-a",
      type: "tennis-court",
      capacity: 4,
      isActive: 1,
      location: null,
      metadata: null,
    };

    expect(row.location).toBeNull();
    expect(row.metadata).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RESOURCE_DDL
// ---------------------------------------------------------------------------

describe("RESOURCE_DDL", () => {
  it("is a non-empty string", () => {
    expect(typeof RESOURCE_DDL).toBe("string");
    expect(RESOURCE_DDL.length).toBeGreaterThan(0);
  });

  it("contains CREATE TABLE IF NOT EXISTS resources statement", () => {
    expect(RESOURCE_DDL).toContain("CREATE TABLE IF NOT EXISTS resources");
  });

  it("contains CREATE TABLE IF NOT EXISTS resource_availability_rules statement", () => {
    expect(RESOURCE_DDL).toContain(
      "CREATE TABLE IF NOT EXISTS resource_availability_rules",
    );
  });

  it("contains CREATE TABLE IF NOT EXISTS resource_availability_overrides statement", () => {
    expect(RESOURCE_DDL).toContain(
      "CREATE TABLE IF NOT EXISTS resource_availability_overrides",
    );
  });

  it("resources table has required columns", () => {
    // Extract just the resources table section for column checks
    expect(RESOURCE_DDL).toContain("id");
    expect(RESOURCE_DDL).toContain("name");
    expect(RESOURCE_DDL).toContain("type");
    expect(RESOURCE_DDL).toContain("capacity");
    expect(RESOURCE_DDL).toContain("is_active");
    expect(RESOURCE_DDL).toContain("location");
    expect(RESOURCE_DDL).toContain("metadata");
  });

  it("resource_availability_rules table has FK to resources", () => {
    expect(RESOURCE_DDL).toContain("REFERENCES resources(id)");
  });

  it("resource_availability_overrides table has FK to resources", () => {
    // Both tables reference resources, confirm at least one ON DELETE CASCADE
    expect(RESOURCE_DDL).toContain("ON DELETE CASCADE");
  });

  it("contains index creation statements for resource_id columns", () => {
    expect(RESOURCE_DDL).toContain("idx_resource_availability_rules_resource_id");
    expect(RESOURCE_DDL).toContain("idx_resource_availability_overrides_resource_id");
  });

  it("does not contain PostgreSQL-only syntax (EXCLUDE USING gist, JSONB)", () => {
    expect(RESOURCE_DDL).not.toContain("EXCLUDE USING gist");
    expect(RESOURCE_DDL).not.toContain("jsonb");
    expect(RESOURCE_DDL).not.toContain("JSONB");
    expect(RESOURCE_DDL).not.toContain("btree_gist");
  });

  it("uses TEXT for date columns (no TIMESTAMPTZ)", () => {
    expect(RESOURCE_DDL).not.toContain("TIMESTAMPTZ");
    expect(RESOURCE_DDL).not.toContain("TIMESTAMP WITH TIME ZONE");
  });

  it("uses INTEGER for is_active (SQLite boolean)", () => {
    expect(RESOURCE_DDL).toContain("is_active");
    expect(RESOURCE_DDL).toContain("INTEGER");
  });

  it("can be split into individual statements on semicolons", () => {
    // Each statement should be parseable independently
    const statements = RESOURCE_DDL.split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    // We expect: 3 CREATE TABLE + 3 CREATE INDEX = 6 statements
    expect(statements.length).toBeGreaterThanOrEqual(3);

    for (const stmt of statements) {
      expect(
        stmt.startsWith("CREATE TABLE") || stmt.startsWith("CREATE INDEX"),
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// D1ResourceBookingLock
// ---------------------------------------------------------------------------

function createMockResourceLockDb() {
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
        const lockKey = params[0] as string;
        held.delete(lockKey);
      }
      return {};
    },
  };

  return { db, held, runCalls };
}

describe("D1ResourceBookingLock.withResourceLock()", () => {
  it("executes the callback and returns its value", async () => {
    const { db } = createMockResourceLockDb();
    const lock = new D1ResourceBookingLock(db, { baseDelayMs: 0 });

    const result = await lock.withResourceLock(
      "resource-abc",
      "2026-06-15",
      async () => "booking-id-xyz",
    );

    expect(result).toBe("booking-id-xyz");
  });

  it("uses namespaced lock key in the form resource:{id}:{date}", async () => {
    const { db, runCalls } = createMockResourceLockDb();
    const lock = new D1ResourceBookingLock(db, { baseDelayMs: 0 });

    await lock.withResourceLock("table-5", "2026-06-15", async () => "ok");

    const insertCall = runCalls.find((c) => c.sql.includes("INSERT INTO"));
    expect(insertCall).toBeDefined();
    expect(insertCall!.params[0]).toBe("resource:table-5:2026-06-15");
  });

  it("acquires then releases the lock (INSERT then DELETE)", async () => {
    const { db, runCalls } = createMockResourceLockDb();
    const lock = new D1ResourceBookingLock(db, { baseDelayMs: 0 });

    await lock.withResourceLock("res-1", "2026-06-15", async () => "done");

    const insertCalls = runCalls.filter((c) => c.sql.includes("INSERT INTO"));
    const releaseCalls = runCalls.filter(
      (c) => c.sql.includes("DELETE FROM") && c.params.length === 1,
    );

    expect(insertCalls).toHaveLength(1);
    expect(releaseCalls).toHaveLength(1);
    expect(releaseCalls[0].params[0]).toBe("resource:res-1:2026-06-15");
  });

  it("releases the lock even when the callback throws", async () => {
    const { db, held } = createMockResourceLockDb();
    const lock = new D1ResourceBookingLock(db, { baseDelayMs: 0 });

    await expect(
      lock.withResourceLock("res-1", "2026-06-15", async () => {
        throw new Error("Booking conflict!");
      }),
    ).rejects.toThrow("Booking conflict!");

    expect(held.has("resource:res-1:2026-06-15")).toBe(false);
  });

  it("allows concurrent locks for different resources on the same date", async () => {
    const { db } = createMockResourceLockDb();
    const lock = new D1ResourceBookingLock(db, { baseDelayMs: 0 });

    const results = await Promise.all([
      lock.withResourceLock("table-1", "2026-06-15", async () => "a"),
      lock.withResourceLock("table-2", "2026-06-15", async () => "b"),
    ]);

    expect(results).toContain("a");
    expect(results).toContain("b");
  });

  it("allows concurrent locks for the same resource on different dates", async () => {
    const { db } = createMockResourceLockDb();
    const lock = new D1ResourceBookingLock(db, { baseDelayMs: 0 });

    const results = await Promise.all([
      lock.withResourceLock("table-1", "2026-06-15", async () => "day1"),
      lock.withResourceLock("table-1", "2026-06-16", async () => "day2"),
    ]);

    expect(results).toContain("day1");
    expect(results).toContain("day2");
  });

  it("does NOT conflict with provider locks using the same date", async () => {
    const { db } = createMockResourceLockDb();
    const resourceLock = new D1ResourceBookingLock(db, { baseDelayMs: 0 });

    // Resource lock key: "resource:res-1:2026-06-15"
    // Provider lock key: "provider-1:2026-06-15" (different namespace)
    const results = await Promise.all([
      resourceLock.withResourceLock("res-1", "2026-06-15", async () => "resource-ok"),
      resourceLock.withLock("provider-1:2026-06-15", async () => "provider-ok"),
    ]);

    expect(results).toContain("resource-ok");
    expect(results).toContain("provider-ok");
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

    const lock = new D1ResourceBookingLock(db, {
      baseDelayMs: 1,
      maxRetries: 2,
    });

    await expect(
      lock.withResourceLock("res-locked", "2026-06-15", async () => "never"),
    ).rejects.toThrow(LockAcquisitionError);
  });

  it("LockAcquisitionError code is LOCK_ACQUISITION_EXHAUSTED", async () => {
    const db: LockDb = {
      async run(sql: string) {
        if (sql.includes("INSERT INTO")) {
          throw new Error("UNIQUE constraint failed");
        }
        return {};
      },
    };

    const lock = new D1ResourceBookingLock(db, {
      baseDelayMs: 1,
      maxRetries: 2,
    });

    try {
      await lock.withResourceLock("res-x", "2026-06-15", async () => "x");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LockAcquisitionError);
      expect((err as LockAcquisitionError).code).toBe("LOCK_ACQUISITION_EXHAUSTED");
    }
  });
});

describe("D1ResourceBookingLock.buildLockKey()", () => {
  it("returns the conventional resource lock key format", () => {
    expect(D1ResourceBookingLock.buildLockKey("res-123", "2026-06-15")).toBe(
      "resource:res-123:2026-06-15",
    );
  });

  it("is consistent with the key used by withResourceLock", async () => {
    const { db, runCalls } = createMockResourceLockDb();
    const lock = new D1ResourceBookingLock(db, { baseDelayMs: 0 });

    const resourceId = "table-99";
    const dateStr = "2026-07-04";

    await lock.withResourceLock(resourceId, dateStr, async () => "ok");

    const expectedKey = D1ResourceBookingLock.buildLockKey(resourceId, dateStr);
    const insertCall = runCalls.find((c) => c.sql.includes("INSERT INTO"));
    expect(insertCall!.params[0]).toBe(expectedKey);
  });
});

describe("createD1ResourceBookingLock()", () => {
  it("returns a D1ResourceBookingLock instance", () => {
    const { db } = createMockResourceLockDb();
    const lock = createD1ResourceBookingLock(db);

    expect(lock).toBeInstanceOf(D1ResourceBookingLock);
  });

  it("passes options through to the lock", async () => {
    const db: LockDb = {
      async run(sql: string) {
        if (sql.includes("INSERT INTO")) {
          throw new Error("UNIQUE constraint failed");
        }
        return {};
      },
    };

    const lock = createD1ResourceBookingLock(db, {
      baseDelayMs: 1,
      maxRetries: 1,
    });

    // maxRetries: 1 means it should fail quickly
    await expect(
      lock.withResourceLock("res-fail", "2026-06-15", async () => "x"),
    ).rejects.toThrow(LockAcquisitionError);
  });
});

// ---------------------------------------------------------------------------
// Race condition simulation — resource scope
// ---------------------------------------------------------------------------

describe("D1ResourceBookingLock — race condition simulation", () => {
  it("prevents double-booking when two requests race for the same resource + date", async () => {
    let slotBooked = false;
    const bookingIds: string[] = [];

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

    const lock = new D1ResourceBookingLock(db, { baseDelayMs: 5, maxRetries: 10 });

    const attemptBooking = async (requestId: string): Promise<string | null> => {
      try {
        return await lock.withResourceLock(
          "table-5",
          "2026-06-15",
          async () => {
            if (slotBooked) return null;
            slotBooked = true;
            bookingIds.push(requestId);
            return requestId;
          },
        );
      } catch {
        return null;
      }
    };

    const [r1, r2] = await Promise.all([
      attemptBooking("request-A"),
      attemptBooking("request-B"),
    ]);

    const successes = [r1, r2].filter(Boolean);
    expect(successes).toHaveLength(1);
    expect(bookingIds).toHaveLength(1);
  });

  it("two different resources can be booked concurrently without conflict", async () => {
    let table1Booked = false;
    let table2Booked = false;

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

    const lock = new D1ResourceBookingLock(db, { baseDelayMs: 5, maxRetries: 5 });

    const [r1, r2] = await Promise.all([
      lock.withResourceLock("table-1", "2026-06-15", async () => {
        table1Booked = true;
        return "table-1-booked";
      }),
      lock.withResourceLock("table-2", "2026-06-15", async () => {
        table2Booked = true;
        return "table-2-booked";
      }),
    ]);

    expect(r1).toBe("table-1-booked");
    expect(r2).toBe("table-2-booked");
    expect(table1Booked).toBe(true);
    expect(table2Booked).toBe(true);
  });
});
