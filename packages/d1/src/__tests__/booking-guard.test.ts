import { describe, it, expect } from "vitest";
import { BookingConflictError, INACTIVE_STATUSES } from "@thebookingkit/core";
import {
  buildInsertIfFree,
  insertBookingIfFree,
  insertBookingOrThrow,
  extractChanges,
  GuardResultError,
  D1_INACTIVE_STATUSES,
  type GuardDb,
} from "../booking-guard.js";

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const START = new Date("2026-06-15T09:00:00.000Z");
const END = new Date("2026-06-15T09:30:00.000Z");

/** Minimal valid `values` payload. */
function baseValues(overrides: Record<string, unknown> = {}) {
  return {
    id: "bk_1",
    provider_id: "prov_1",
    starts_at: START,
    ends_at: END,
    status: "confirmed",
    ...overrides,
  };
}

/** A GuardDb that records calls and returns a configurable driver result. */
function fakeDb(result: unknown) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db: GuardDb = {
    async run(sql, params = []) {
      calls.push({ sql, params });
      return result;
    },
  };
  return { db, calls };
}

// ---------------------------------------------------------------------------
// buildInsertIfFree — SQL shape
// ---------------------------------------------------------------------------

describe("buildInsertIfFree() — statement shape", () => {
  it("emits a single INSERT ... SELECT ... WHERE NOT EXISTS statement", () => {
    const { sql } = buildInsertIfFree(baseValues());

    // One statement — no semicolons splitting check from insert. This is the
    // property that makes the guard atomic.
    expect(sql).not.toContain(";");
    expect(sql).toMatch(/^INSERT INTO "bookings" \(/);
    expect(sql).toContain("SELECT ?, ?, ?, ?, ?");
    expect(sql).toContain("WHERE NOT EXISTS (SELECT 1 FROM \"bookings\"");
  });

  it("quotes every interpolated identifier", () => {
    const { sql } = buildInsertIfFree(baseValues());
    expect(sql).toContain('"provider_id"');
    expect(sql).toContain('"starts_at"');
    expect(sql).toContain('"ends_at"');
    expect(sql).toContain('"status"');
  });

  it("uses half-open overlap logic (existing.start < new.end AND existing.end > new.start)", () => {
    const { sql } = buildInsertIfFree(baseValues());
    expect(sql).toContain('"starts_at" < ?');
    expect(sql).toContain('"ends_at" > ?');
    // Strictly-less / strictly-greater keeps back-to-back bookings legal.
    expect(sql).not.toContain('"starts_at" <= ?');
    expect(sql).not.toContain('"ends_at" >= ?');
  });

  it("binds insert values first, then guard predicate values", () => {
    const { params } = buildInsertIfFree(baseValues());

    // 5 insert values, then: scope, 4 inactive statuses, windowEnd, windowStart
    expect(params).toEqual([
      "bk_1",
      "prov_1",
      START.toISOString(),
      END.toISOString(),
      "confirmed",
      "prov_1",
      "cancelled",
      "rejected",
      "no_show",
      "rescheduled",
      END.toISOString(),
      START.toISOString(),
    ]);
  });

  it("treats a NULL status as blocking rather than silently non-conflicting", () => {
    const { sql } = buildInsertIfFree(baseValues());
    // Without the IS NULL arm, SQL three-valued logic would evaluate
    // `NULL NOT IN (...)` to NULL and drop the row from the conflict check.
    expect(sql).toContain('"status" IS NULL OR "status" NOT IN (?, ?, ?, ?)');
  });

  it("defaults the inactive statuses to core's INACTIVE_STATUSES", () => {
    // Compared against core directly, not a hardcoded copy: if the two ever
    // diverge, a booking the slot engine offers could be rejected by the guard
    // (or worse, accepted when the engine considered the slot taken).
    expect([...D1_INACTIVE_STATUSES].sort()).toEqual([...INACTIVE_STATUSES].sort());
    expect(D1_INACTIVE_STATUSES).toEqual([
      "cancelled",
      "rejected",
      "no_show",
      "rescheduled",
    ]);

    const { params } = buildInsertIfFree(baseValues());
    for (const status of INACTIVE_STATUSES) {
      expect(params).toContain(status);
    }
  });

  it("omits the status predicate entirely when inactiveStatuses is empty", () => {
    const { sql, params } = buildInsertIfFree(baseValues(), {
      inactiveStatuses: [],
    });
    expect(sql).not.toContain("NOT IN");
    expect(sql).not.toContain('"status" IS NULL');
    expect(params).not.toContain("cancelled");
  });

  it("encodes Date bounds to canonical UTC-Z strings", () => {
    const { params } = buildInsertIfFree(baseValues());
    expect(params[2]).toBe("2026-06-15T09:00:00.000Z");
    expect(params[3]).toBe("2026-06-15T09:30:00.000Z");
  });

  it("normalises non-canonical UTC-Z input strings", () => {
    const { params } = buildInsertIfFree(
      baseValues({
        starts_at: "2026-06-15T09:00:00Z", // no milliseconds
        ends_at: "2026-06-15T09:30:00Z",
      }),
    );
    // Lexicographic comparison only works when every row is fixed-width.
    expect(params[2]).toBe("2026-06-15T09:00:00.000Z");
    expect(params[3]).toBe("2026-06-15T09:30:00.000Z");
  });

  it("preserves non-date values verbatim", () => {
    const { params } = buildInsertIfFree(
      baseValues({ metadata: '{"note":"vip"}', seats: 4 }),
    );
    expect(params).toContain('{"note":"vip"}');
    expect(params).toContain(4);
  });
});

// ---------------------------------------------------------------------------
// buildInsertIfFree — buffer windows and reschedule
// ---------------------------------------------------------------------------

describe("buildInsertIfFree() — conflictWindow (buffer time)", () => {
  it("guards against a widened window while inserting the true times", () => {
    const { params } = buildInsertIfFree(baseValues(), {
      conflictWindow: {
        startsAt: new Date("2026-06-15T08:45:00.000Z"),
        endsAt: new Date("2026-06-15T09:45:00.000Z"),
      },
    });

    // Inserted values remain the real appointment times...
    expect(params[2]).toBe("2026-06-15T09:00:00.000Z");
    expect(params[3]).toBe("2026-06-15T09:30:00.000Z");
    // ...while the guard uses the buffered window.
    expect(params[params.length - 2]).toBe("2026-06-15T09:45:00.000Z");
    expect(params[params.length - 1]).toBe("2026-06-15T08:45:00.000Z");
  });

  it("accepts ISO strings in the conflict window", () => {
    const { params } = buildInsertIfFree(baseValues(), {
      conflictWindow: {
        startsAt: "2026-06-15T08:45:00.000Z",
        endsAt: "2026-06-15T09:45:00.000Z",
      },
    });
    expect(params[params.length - 1]).toBe("2026-06-15T08:45:00.000Z");
  });

  it("rejects an inverted conflict window", () => {
    expect(() =>
      buildInsertIfFree(baseValues(), {
        conflictWindow: { startsAt: END, endsAt: START },
      }),
    ).toThrow(RangeError);
  });

  it("rejects a zero-length conflict window", () => {
    expect(() =>
      buildInsertIfFree(baseValues(), {
        conflictWindow: { startsAt: START, endsAt: START },
      }),
    ).toThrow(/strictly after/);
  });

  it("rejects a zero-length booking interval", () => {
    // A zero-length interval can never overlap anything under half-open
    // semantics, so it would be silently unguarded.
    expect(() =>
      buildInsertIfFree(baseValues({ ends_at: START })),
    ).toThrow(/strictly after/);
  });

  it("rejects an inverted booking interval", () => {
    expect(() =>
      buildInsertIfFree(baseValues({ starts_at: END, ends_at: START })),
    ).toThrow(RangeError);
  });
});

describe("buildInsertIfFree() — excludeId (reschedule)", () => {
  it("adds an id exclusion predicate when excludeId is given", () => {
    const { sql, params } = buildInsertIfFree(baseValues(), {
      excludeId: "bk_being_moved",
    });
    expect(sql).toContain('"id" <> ?');
    expect(params[params.length - 1]).toBe("bk_being_moved");
  });

  it("omits the exclusion predicate by default", () => {
    const { sql } = buildInsertIfFree(baseValues());
    expect(sql).not.toContain("<>");
  });

  it("honours a custom id column", () => {
    const { sql } = buildInsertIfFree(baseValues(), {
      excludeId: "x",
      columns: { id: "booking_uid" },
    });
    expect(sql).toContain('"booking_uid" <> ?');
  });
});

// ---------------------------------------------------------------------------
// buildInsertIfFree — column overrides
// ---------------------------------------------------------------------------

describe("buildInsertIfFree() — column overrides", () => {
  it("supports resource-scoped guarding", () => {
    const { sql, params } = buildInsertIfFree(
      { id: "b1", resource_id: "tbl_5", starts_at: START, ends_at: END, status: "confirmed" },
      { columns: { scope: "resource_id" } },
    );
    expect(sql).toContain('"resource_id" = ?');
    expect(params).toContain("tbl_5");
  });

  it("supports a fully custom schema", () => {
    const { sql } = buildInsertIfFree(
      { room: "r1", from_ts: START, to_ts: END, state: "booked" },
      {
        columns: {
          table: "reservations",
          scope: "room",
          startsAt: "from_ts",
          endsAt: "to_ts",
          status: "state",
        },
      },
    );
    expect(sql).toContain('INSERT INTO "reservations"');
    expect(sql).toContain('"from_ts" < ?');
    expect(sql).toContain('"to_ts" > ?');
  });

  it("rejects startsAt and endsAt pointing at the same column", () => {
    expect(() =>
      buildInsertIfFree(baseValues(), {
        columns: { startsAt: "at", endsAt: "at" },
      }),
    ).toThrow(/must differ/);
  });
});

// ---------------------------------------------------------------------------
// buildInsertIfFree — injection and validation
// ---------------------------------------------------------------------------

describe("buildInsertIfFree() — identifier validation (SQL injection boundary)", () => {
  const MALICIOUS = [
    'bookings"; DROP TABLE bookings; --',
    "bookings; DELETE FROM bookings",
    "bookings--",
    "book ings",
    "1bookings",
    "",
    "book`ings",
    "book'ings",
    "book\\ings",
    "book ings",
  ];

  for (const value of MALICIOUS) {
    it(`rejects table name ${JSON.stringify(value)}`, () => {
      expect(() =>
        buildInsertIfFree(baseValues(), { columns: { table: value } }),
      ).toThrow(RangeError);
    });

    it(`rejects scope column ${JSON.stringify(value)}`, () => {
      expect(() =>
        buildInsertIfFree(baseValues(), { columns: { scope: value } }),
      ).toThrow(RangeError);
    });

    it(`rejects values key ${JSON.stringify(value)}`, () => {
      expect(() =>
        buildInsertIfFree({ ...baseValues(), [value]: "x" }),
      ).toThrow(RangeError);
    });
  }

  it("never interpolates a value into the SQL text", () => {
    const { sql } = buildInsertIfFree(
      baseValues({ id: "'; DROP TABLE bookings; --" }),
    );
    expect(sql).not.toContain("DROP TABLE");
  });

  it("rejects a non-string status in inactiveStatuses", () => {
    expect(() =>
      buildInsertIfFree(baseValues(), {
        inactiveStatuses: ["cancelled", 42 as unknown as string],
      }),
    ).toThrow(/must be strings/);
  });
});

describe("buildInsertIfFree() — required input", () => {
  it("rejects an empty values object", () => {
    expect(() => buildInsertIfFree({})).toThrow(/at least one column/);
  });

  it("rejects a missing scope column", () => {
    const { provider_id, ...rest } = baseValues();
    void provider_id;
    expect(() => buildInsertIfFree(rest)).toThrow(/missing the scope column/);
  });

  it("rejects a missing start column", () => {
    const { starts_at, ...rest } = baseValues();
    void starts_at;
    expect(() => buildInsertIfFree(rest)).toThrow(/missing the startsAt column/);
  });

  it("rejects a missing end column", () => {
    const { ends_at, ...rest } = baseValues();
    void ends_at;
    expect(() => buildInsertIfFree(rest)).toThrow(/missing the endsAt column/);
  });

  it("rejects a null scope value", () => {
    expect(() => buildInsertIfFree(baseValues({ provider_id: null }))).toThrow(
      /cannot be guarded/,
    );
  });

  it("rejects an undefined scope value", () => {
    expect(() =>
      buildInsertIfFree(baseValues({ provider_id: undefined })),
    ).toThrow(/cannot be guarded/);
  });

  it("rejects a null interval bound", () => {
    expect(() => buildInsertIfFree(baseValues({ ends_at: null }))).toThrow(
      /cannot be guarded/,
    );
  });

  it("rejects a numeric epoch as an interval bound", () => {
    // Silently accepting a number would store a non-comparable value.
    expect(() =>
      buildInsertIfFree(baseValues({ starts_at: 1781234567890 })),
    ).toThrow(/must be a Date or an ISO string/);
  });

  it("rejects an unparseable date string", () => {
    expect(() => buildInsertIfFree(baseValues({ starts_at: "not-a-date" }))).toThrow();
  });

  it("rejects an Invalid Date", () => {
    expect(() =>
      buildInsertIfFree(baseValues({ starts_at: new Date("nope") })),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// extractChanges
// ---------------------------------------------------------------------------

describe("extractChanges()", () => {
  it("reads D1's meta.changes", () => {
    expect(extractChanges({ success: true, meta: { changes: 1 } })).toBe(1);
  });

  it("reads better-sqlite3 / node:sqlite changes", () => {
    expect(extractChanges({ changes: 1, lastInsertRowid: 7 })).toBe(1);
  });

  it("reads Drizzle's rowsAffected", () => {
    expect(extractChanges({ rowsAffected: 0 })).toBe(0);
  });

  it("prefers meta.changes when several shapes are present", () => {
    expect(extractChanges({ meta: { changes: 1 }, rowsAffected: 0 })).toBe(1);
  });

  it("reads BigInt counts", () => {
    expect(extractChanges({ changes: 1n })).toBe(1);
  });

  it("distinguishes 0 from missing", () => {
    expect(extractChanges({ changes: 0 })).toBe(0);
    expect(extractChanges({})).toBeNull();
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 1],
    ["a string", "1"],
    ["a boolean", true],
    ["an empty object", {}],
    ["a negative count", { changes: -1 }],
    ["NaN", { changes: NaN }],
    ["Infinity", { changes: Infinity }],
    ["a non-numeric count", { changes: "1" }],
    ["a null meta", { meta: null }],
    ["a meta without changes", { meta: {} }],
  ])("returns null for %s", (_label, input) => {
    expect(extractChanges(input)).toBeNull();
  });

  it("falls through from an unusable meta.changes to a usable top-level count", () => {
    expect(extractChanges({ meta: { changes: "x" }, changes: 1 })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// insertBookingIfFree
// ---------------------------------------------------------------------------

describe("insertBookingIfFree()", () => {
  it("reports inserted:true when a row was written", async () => {
    const { db, calls } = fakeDb({ meta: { changes: 1 } });
    const result = await insertBookingIfFree(db, baseValues());

    expect(result.inserted).toBe(true);
    expect(result.changes).toBe(1);
    expect(calls).toHaveLength(1);
    expect(result.statement.sql).toBe(calls[0].sql);
  });

  it("reports inserted:false when the slot was taken — without throwing", async () => {
    const { db } = fakeDb({ meta: { changes: 0 } });
    const result = await insertBookingIfFree(db, baseValues());

    expect(result.inserted).toBe(false);
    expect(result.changes).toBe(0);
  });

  it("executes exactly one statement", async () => {
    const { db, calls } = fakeDb({ meta: { changes: 1 } });
    await insertBookingIfFree(db, baseValues());
    // Two statements would reopen the race this guard exists to close.
    expect(calls).toHaveLength(1);
  });

  it("throws GuardResultError when the driver reports no row count", async () => {
    const { db } = fakeDb({ ok: true });
    await expect(insertBookingIfFree(db, baseValues())).rejects.toThrow(
      GuardResultError,
    );
  });

  it("GuardResultError carries the actionable remedy and the received shape", async () => {
    const { db } = fakeDb({ ok: true });
    const error = await insertBookingIfFree(db, baseValues()).catch((e) => e);

    expect(error.code).toBe("GUARD_RESULT_UNREADABLE");
    expect(error.message).toContain("buildInsertIfFree");
    expect(error.message).toContain('{"ok":true}');
  });

  it("does not swallow driver errors", async () => {
    const db: GuardDb = {
      async run() {
        throw new Error("D1_ERROR: no such table: bookings");
      },
    };
    await expect(insertBookingIfFree(db, baseValues())).rejects.toThrow(
      /no such table/,
    );
  });

  it("validates before touching the database", async () => {
    let called = false;
    const db: GuardDb = {
      async run() {
        called = true;
        return { meta: { changes: 1 } };
      },
    };
    await expect(
      insertBookingIfFree(db, baseValues({ provider_id: null })),
    ).rejects.toThrow(RangeError);
    expect(called).toBe(false);
  });

  it("handles a GuardResultError message for a circular driver result", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const { db } = fakeDb(circular);
    await expect(insertBookingIfFree(db, baseValues())).rejects.toThrow(
      GuardResultError,
    );
  });
});

describe("insertBookingOrThrow()", () => {
  it("returns the result when the insert succeeded", async () => {
    const { db } = fakeDb({ meta: { changes: 1 } });
    const result = await insertBookingOrThrow(db, baseValues());
    expect(result.inserted).toBe(true);
  });

  it("throws BookingConflictError when the slot was taken", async () => {
    const { db } = fakeDb({ meta: { changes: 0 } });
    await expect(insertBookingOrThrow(db, baseValues())).rejects.toThrow(
      BookingConflictError,
    );
  });

  it("uses core's BOOKING_CONFLICT code so D1 and Postgres paths match", async () => {
    const { db } = fakeDb({ meta: { changes: 0 } });
    const error = await insertBookingOrThrow(db, baseValues()).catch((e) => e);
    expect(error.code).toBe("BOOKING_CONFLICT");
  });

  it("propagates GuardResultError rather than reporting a conflict", async () => {
    // Misreading "unknown" as "conflict" would turn a driver bug into a
    // silently-dropped booking.
    const { db } = fakeDb({ ok: true });
    await expect(insertBookingOrThrow(db, baseValues())).rejects.toThrow(
      GuardResultError,
    );
  });
});

// ---------------------------------------------------------------------------
// Guard-bypass regressions
//
// Every case below was a CONFIRMED way to obtain `inserted: true` while a
// conflicting booking existed, found by adversarial review. They are grouped
// here so the bypass, not just the fix, stays documented.
// ---------------------------------------------------------------------------

describe("guard bypasses — excludeId must not null the predicate", () => {
  // `"id" <> NULL` is NULL for every row, which under three-valued logic nulls
  // the entire WHERE clause: NOT EXISTS becomes true and the INSERT is
  // unconditional. `excludeId: null` arises trivially from `row.x ?? null`.
  it.each([
    ["null", null],
    ["a number", 42],
    ["NaN", NaN],
    ["an empty string", ""],
    ["an object", {}],
    ["true", true],
  ])("rejects excludeId that is %s", (_label, excludeId) => {
    expect(() =>
      buildInsertIfFree(baseValues(), { excludeId: excludeId as string }),
    ).toThrow(RangeError);
  });

  it("still accepts a valid string excludeId", () => {
    const { sql } = buildInsertIfFree(baseValues(), { excludeId: "bk_1" });
    expect(sql).toContain('"id" <> ?');
  });

  it("treats undefined as 'no exclusion' rather than an error", () => {
    const { sql } = buildInsertIfFree(baseValues(), { excludeId: undefined });
    expect(sql).not.toContain("<>");
  });
});

describe("guard bypasses — case-insensitive column collisions", () => {
  // SQLite resolves column names case-insensitively and the first-listed
  // duplicate wins, while JS object keys are case-sensitive. A request body
  // spread ahead of the trusted fields could make the guard check one interval
  // and store another.
  it("rejects two values keys differing only in case", () => {
    expect(() =>
      buildInsertIfFree({
        STARTS_AT: "2026-06-15T09:15:00.000Z",
        id: "bk_1",
        provider_id: "p1",
        starts_at: START,
        ends_at: END,
        status: "confirmed",
      }),
    ).toThrow(/treats as the same column|differs only in case/);
  });

  it("rejects a values key colliding with the scope column by case", () => {
    expect(() =>
      buildInsertIfFree({ ...baseValues(), PROVIDER_ID: "attacker" }),
    ).toThrow(/same column|differs only in case/);
  });

  it("rejects a values key colliding with the end column by case", () => {
    expect(() =>
      buildInsertIfFree({ ...baseValues(), Ends_At: "2026-06-15T23:00:00.000Z" }),
    ).toThrow(/same column|differs only in case/);
  });

  it("allows unrelated columns whose names merely share a prefix", () => {
    expect(() =>
      buildInsertIfFree({ ...baseValues(), starts_at_local: "whatever" }),
    ).not.toThrow();
  });
});

describe("guard bypasses — conflictWindow must contain the booking", () => {
  // A window narrower than the interval leaves part of the appointment
  // unguarded; a sign error in a buffer calculation produces exactly this.
  it("rejects a window narrower than the inserted interval", () => {
    expect(() =>
      buildInsertIfFree(baseValues(), {
        conflictWindow: {
          startsAt: new Date("2026-06-15T09:00:00.000Z"),
          endsAt: new Date("2026-06-15T09:05:00.000Z"),
        },
      }),
    ).toThrow(/must fully contain/);
  });

  it("rejects a window disjoint from the inserted interval", () => {
    expect(() =>
      buildInsertIfFree(baseValues(), {
        conflictWindow: {
          startsAt: new Date("2026-06-20T09:00:00.000Z"),
          endsAt: new Date("2026-06-20T10:00:00.000Z"),
        },
      }),
    ).toThrow(/must fully contain/);
  });

  it("rejects a window that clips only the start", () => {
    expect(() =>
      buildInsertIfFree(baseValues(), {
        conflictWindow: { startsAt: new Date("2026-06-15T09:10:00.000Z"), endsAt: END },
      }),
    ).toThrow(/must fully contain/);
  });

  it("accepts a window exactly equal to the interval", () => {
    expect(() =>
      buildInsertIfFree(baseValues(), {
        conflictWindow: { startsAt: START, endsAt: END },
      }),
    ).not.toThrow();
  });

  it("accepts a wider window — the buffer-time case", () => {
    expect(() =>
      buildInsertIfFree(baseValues(), {
        conflictWindow: {
          startsAt: new Date("2026-06-15T08:45:00.000Z"),
          endsAt: new Date("2026-06-15T09:45:00.000Z"),
        },
      }),
    ).not.toThrow();
  });
});

describe("guard bypasses — null primary key", () => {
  // SQLite permits NULL in a TEXT PRIMARY KEY, and a NULL id can never be
  // named by excludeId, so such a row is permanently un-excludable.
  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("rejects an id that is %s", (_label, id) => {
    expect(() => buildInsertIfFree(baseValues({ id }))).toThrow(/PRIMARY KEY|un-excludable/);
  });

  it("allows values with no id column at all", () => {
    const { id, ...rest } = baseValues();
    void id;
    expect(() => buildInsertIfFree(rest)).not.toThrow();
  });
});

describe("guard bypasses — expanded-year timestamps", () => {
  // Beyond year 9999 toISOString() emits "+010000-...", and "+" sorts below
  // every digit, inverting the lexicographic order the guard relies on.
  it("rejects a start beyond year 9999", () => {
    expect(() =>
      buildInsertIfFree(baseValues({ starts_at: new Date("+010000-01-01T00:00:00Z") })),
    ).toThrow(/four-digit year/);
  });

  it("rejects an end beyond year 9999", () => {
    expect(() =>
      buildInsertIfFree(
        baseValues({ ends_at: new Date("+010000-01-01T00:00:00Z") }),
      ),
    ).toThrow(/four-digit year/);
  });

  it("rejects a negative (pre-year-1) timestamp", () => {
    expect(() =>
      buildInsertIfFree(baseValues({ starts_at: new Date("-000001-01-01T00:00:00Z") })),
    ).toThrow(/four-digit year/);
  });

  it("accepts the year-9999 boundary", () => {
    expect(() =>
      buildInsertIfFree(
        baseValues({
          starts_at: new Date("9999-12-31T22:00:00Z"),
          ends_at: new Date("9999-12-31T23:00:00Z"),
        }),
      ),
    ).not.toThrow();
  });
});

describe("guard bypasses — inactiveStatuses shape", () => {
  it("rejects a bare string with RangeError, not a TypeError", () => {
    // Iterating a string yields strings, so the per-element check passed and
    // the failure surfaced later as `inactive.map is not a function`.
    let caught: unknown;
    try {
      buildInsertIfFree(baseValues(), {
        inactiveStatuses: "cancelled" as unknown as string[],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RangeError);
    expect((caught as Error).message).toMatch(/must be an array/);
  });

  it("rejects null inside the status list", () => {
    // A NULL in the NOT IN list nulls the whole predicate.
    expect(() =>
      buildInsertIfFree(baseValues(), {
        inactiveStatuses: ["cancelled", null as unknown as string],
      }),
    ).toThrow(RangeError);
  });
});
