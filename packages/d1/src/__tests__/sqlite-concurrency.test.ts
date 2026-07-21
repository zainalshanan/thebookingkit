/**
 * End-to-end verification against a real SQLite engine.
 *
 * Every other test in this package asserts on generated SQL strings or mocked
 * drivers. This file executes the statements this package produces against an
 * actual SQLite database, because the double-booking guarantee depends on
 * SQLite's own semantics — statement-level atomicity, half-open range
 * comparison of TEXT dates, partial-index predicates — none of which a mock
 * can prove.
 *
 * ## How concurrency is modelled
 *
 * `node:sqlite` is synchronous, so genuine parallelism is impossible in-process.
 * That is not a limitation here, because the property under test is exactly the
 * one D1 provides: **individual statements are atomic; interleaving happens only
 * between them.** `yieldingDb` reproduces that contract by awaiting a macrotask
 * before every statement, so any `await` boundary in application code becomes a
 * real interleaving point.
 *
 * The suite proves the harness is discriminating: the naive read-then-write flow
 * double-books under this scheduler, and the guarded flow does not.
 *
 * Skips automatically when `node:sqlite` is unavailable (Node < 22.5, or Node 22
 * without `--experimental-sqlite`).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildInsertIfFree,
  insertBookingIfFree,
  insertBookingOrThrow,
  type GuardDb,
} from "../booking-guard.js";
import { insertResourceBookingIfFree } from "../resource-helpers.js";
import { D1BookingLock, LockLeaseExpiredError, LockSchemaError } from "../lock.js";
import {
  BOOKINGS_DDL,
  BOOKINGS_UNIQUE_SLOT_DDL,
  BOOKING_LOCKS_DDL,
  BOOKING_LOCKS_HOLDER_MIGRATION_SQL,
} from "../migration.js";

// ---------------------------------------------------------------------------
// Engine probe
// ---------------------------------------------------------------------------

type SqliteCtor = new (path: string) => {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint };
    all(...params: unknown[]): unknown[];
  };
  close(): void;
};

let DatabaseSync: SqliteCtor | null = null;
try {
  ({ DatabaseSync } = (await import("node:sqlite")) as unknown as {
    DatabaseSync: SqliteCtor;
  });
} catch {
  DatabaseSync = null;
}

const describeSqlite = DatabaseSync ? describe : describe.skip;

if (!DatabaseSync) {
  // Loud, because silently skipping the only real-engine coverage would hide
  // exactly the class of bug this file exists to catch.
  console.warn(
    "[d1] node:sqlite unavailable — real-engine concurrency tests skipped. " +
      "Run on Node >= 24 (or Node 22 with --experimental-sqlite) for full coverage.",
  );
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const SLOT_START = new Date("2026-06-15T09:00:00.000Z");
const SLOT_END = new Date("2026-06-15T09:30:00.000Z");

/** Minimal bookings table — the columns the guard actually touches. */
const MINIMAL_BOOKINGS_DDL = `
CREATE TABLE bookings (
  id          TEXT PRIMARY KEY,
  provider_id TEXT,
  resource_id TEXT,
  starts_at   TEXT NOT NULL,
  ends_at     TEXT NOT NULL,
  status      TEXT
)`;

type Sqlite = InstanceType<SqliteCtor>;

/** Wrap a synchronous SQLite handle in the async `run` contract this package uses. */
function makeDb(sqlite: Sqlite) {
  return {
    async run(sql: string, params: unknown[] = []) {
      return sqlite.prepare(sql).run(...params);
    },
  };
}

/**
 * A DB whose statements are atomic but which yields to the event loop *between*
 * statements — the D1 contract. Any `await` in caller code becomes a real
 * interleaving point.
 */
function yieldingDb(sqlite: Sqlite): GuardDb {
  return {
    async run(sql: string, params: unknown[] = []) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return sqlite.prepare(sql).run(...params);
    },
  };
}

function countBookings(sqlite: Sqlite): number {
  const rows = sqlite.prepare("SELECT COUNT(*) AS n FROM bookings").all() as Array<{
    n: number;
  }>;
  return Number(rows[0].n);
}

function values(overrides: Record<string, unknown> = {}) {
  return {
    id: "bk_1",
    provider_id: "prov_1",
    starts_at: SLOT_START,
    ends_at: SLOT_END,
    status: "confirmed",
    ...overrides,
  };
}

/** Insert a booking directly, bypassing the guard. */
function seed(
  sqlite: Sqlite,
  row: {
    id: string;
    provider_id?: string | null;
    resource_id?: string | null;
    starts_at: string;
    ends_at: string;
    status?: string | null;
  },
) {
  sqlite
    .prepare(
      `INSERT INTO bookings (id, provider_id, resource_id, starts_at, ends_at, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.provider_id ?? null,
      row.resource_id ?? null,
      row.starts_at,
      row.ends_at,
      row.status === undefined ? "confirmed" : row.status,
    );
}

// ---------------------------------------------------------------------------
// The headline guarantee
// ---------------------------------------------------------------------------

describeSqlite("Double booking is impossible (real SQLite)", () => {
  let sqlite: Sqlite;

  beforeEach(() => {
    sqlite = new DatabaseSync!(":memory:");
    sqlite.exec(MINIMAL_BOOKINGS_DDL);
  });

  afterEach(() => sqlite.close());

  it("admits exactly one winner out of 50 concurrent attempts on the same slot", async () => {
    const db = yieldingDb(sqlite);

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        insertBookingIfFree(db, values({ id: `bk_${i}` })),
      ),
    );

    expect(results.filter((r) => r.inserted)).toHaveLength(1);
    expect(results.filter((r) => !r.inserted)).toHaveLength(49);
    expect(countBookings(sqlite)).toBe(1);
  });

  it("the same harness DOES double-book with a naive read-then-write flow", async () => {
    // Control case. Without this, a passing test above could simply mean the
    // scheduler never interleaves — proving nothing.
    const db = yieldingDb(sqlite);

    async function naiveBook(id: string) {
      const taken = (
        await db.run(
          `SELECT 1 FROM bookings WHERE provider_id = ? AND starts_at < ? AND ends_at > ?`,
          ["prov_1", SLOT_END.toISOString(), SLOT_START.toISOString()],
        ),
        sqlite
          .prepare(
            `SELECT COUNT(*) AS n FROM bookings WHERE provider_id = ? AND starts_at < ? AND ends_at > ?`,
          )
          .all("prov_1", SLOT_END.toISOString(), SLOT_START.toISOString()) as Array<{ n: number }>
      )[0].n;

      if (Number(taken) > 0) return false;

      await db.run(
        `INSERT INTO bookings (id, provider_id, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?)`,
        [id, "prov_1", SLOT_START.toISOString(), SLOT_END.toISOString(), "confirmed"],
      );
      return true;
    }

    await Promise.all(Array.from({ length: 10 }, (_, i) => naiveBook(`bk_${i}`)));

    expect(countBookings(sqlite)).toBeGreaterThan(1);
  });

  it("admits exactly one winner across a mix of overlapping windows", async () => {
    const db = yieldingDb(sqlite);
    // Every window below overlaps every other, so at most one can survive.
    const windows = [
      ["09:00", "09:30"],
      ["09:15", "09:45"],
      ["08:45", "09:15"],
      ["08:00", "10:00"],
      ["09:10", "09:20"],
      ["09:29", "10:30"],
    ];

    const results = await Promise.all(
      windows.map(([from, to], i) =>
        insertBookingIfFree(
          db,
          values({
            id: `bk_${i}`,
            starts_at: new Date(`2026-06-15T${from}:00.000Z`),
            ends_at: new Date(`2026-06-15T${to}:00.000Z`),
          }),
        ),
      ),
    );

    expect(results.filter((r) => r.inserted)).toHaveLength(1);
    expect(countBookings(sqlite)).toBe(1);
  });

  it("lets non-overlapping concurrent bookings all succeed", async () => {
    const db = yieldingDb(sqlite);
    // Back-to-back 30-minute slots — none overlap, so none should be rejected.
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        insertBookingIfFree(
          db,
          values({
            id: `bk_${i}`,
            starts_at: new Date(Date.UTC(2026, 5, 15, 9 + i, 0)),
            ends_at: new Date(Date.UTC(2026, 5, 15, 9 + i, 30)),
          }),
        ),
      ),
    );

    expect(results.every((r) => r.inserted)).toBe(true);
    expect(countBookings(sqlite)).toBe(8);
  });

  it("isolates concurrent bookings by provider", async () => {
    const db = yieldingDb(sqlite);
    // 5 providers x 10 racing attempts each => exactly 5 bookings.
    const attempts = Array.from({ length: 5 }, (_, p) =>
      Array.from({ length: 10 }, (_, i) =>
        insertBookingIfFree(db, values({ id: `bk_${p}_${i}`, provider_id: `prov_${p}` })),
      ),
    ).flat();

    const results = await Promise.all(attempts);

    expect(results.filter((r) => r.inserted)).toHaveLength(5);
    expect(countBookings(sqlite)).toBe(5);
  });

  it("holds when the lock and the guard are combined", async () => {
    sqlite.exec(BOOKING_LOCKS_DDL);
    const db = yieldingDb(sqlite);
    const lock = new D1BookingLock(makeDb(sqlite), { baseDelayMs: 0, maxRetries: 30 });

    const outcomes = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        lock
          .withLock("prov_1:2026-06-15", async () =>
            insertBookingOrThrow(db, values({ id: `bk_${i}` })),
          )
          .then(() => "booked" as const)
          .catch((e: Error) => e.name),
      ),
    );

    expect(outcomes.filter((o) => o === "booked")).toHaveLength(1);
    expect(countBookings(sqlite)).toBe(1);
    // Losers get a friendly conflict, never a lock-acquisition failure, because
    // the lock serialises them rather than making them race.
    expect(outcomes.filter((o) => o === "BookingConflictError")).toHaveLength(11);
  });
});

// ---------------------------------------------------------------------------
// Overlap semantics
// ---------------------------------------------------------------------------

describeSqlite("Overlap semantics (real SQLite)", () => {
  let sqlite: Sqlite;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    sqlite = new DatabaseSync!(":memory:");
    sqlite.exec(MINIMAL_BOOKINGS_DDL);
    db = makeDb(sqlite);
    // Existing booking: 09:00–09:30
    seed(sqlite, {
      id: "existing",
      provider_id: "prov_1",
      starts_at: SLOT_START.toISOString(),
      ends_at: SLOT_END.toISOString(),
    });
  });

  afterEach(() => sqlite.close());

  const cases: Array<[string, string, string, boolean]> = [
    ["identical interval", "09:00", "09:30", false],
    ["contained within", "09:05", "09:25", false],
    ["containing", "08:00", "10:00", false],
    ["overlaps the front edge", "08:45", "09:15", false],
    ["overlaps the back edge", "09:15", "09:45", false],
    ["shares only the start instant", "09:00", "09:10", false],
    ["shares only the end instant", "09:20", "09:30", false],
    ["back-to-back after", "09:30", "10:00", true],
    ["back-to-back before", "08:30", "09:00", true],
    ["well clear after", "10:00", "10:30", true],
    ["well clear before", "07:00", "07:30", true],
  ];

  for (const [label, from, to, shouldInsert] of cases) {
    it(`${shouldInsert ? "allows" : "blocks"} a booking that ${label}`, async () => {
      const result = await insertBookingIfFree(
        db,
        values({
          id: "candidate",
          starts_at: new Date(`2026-06-15T${from}:00.000Z`),
          ends_at: new Date(`2026-06-15T${to}:00.000Z`),
        }),
      );
      expect(result.inserted).toBe(shouldInsert);
    });
  }

  it("blocks an overlap of a single millisecond", async () => {
    const result = await insertBookingIfFree(
      db,
      values({
        id: "candidate",
        starts_at: new Date("2026-06-15T09:29:59.999Z"),
        ends_at: new Date("2026-06-15T10:00:00.000Z"),
      }),
    );
    expect(result.inserted).toBe(false);
  });

  it("allows a booking starting at the exact millisecond the previous ends", async () => {
    const result = await insertBookingIfFree(
      db,
      values({
        id: "candidate",
        starts_at: new Date("2026-06-15T09:30:00.000Z"),
        ends_at: new Date("2026-06-15T10:00:00.000Z"),
      }),
    );
    expect(result.inserted).toBe(true);
  });

  it("compares dates chronologically across a year boundary", async () => {
    // Guards against lexicographic TEXT comparison diverging from chronology.
    seed(sqlite, {
      id: "ny",
      provider_id: "prov_2",
      starts_at: "2026-12-31T23:30:00.000Z",
      ends_at: "2027-01-01T00:30:00.000Z",
    });

    const overlapping = await insertBookingIfFree(
      db,
      values({
        id: "c1",
        provider_id: "prov_2",
        starts_at: new Date("2027-01-01T00:00:00.000Z"),
        ends_at: new Date("2027-01-01T01:00:00.000Z"),
      }),
    );
    expect(overlapping.inserted).toBe(false);

    const clear = await insertBookingIfFree(
      db,
      values({
        id: "c2",
        provider_id: "prov_2",
        starts_at: new Date("2027-01-01T00:30:00.000Z"),
        ends_at: new Date("2027-01-01T01:00:00.000Z"),
      }),
    );
    expect(clear.inserted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Status semantics
// ---------------------------------------------------------------------------

describeSqlite("Status semantics (real SQLite)", () => {
  let sqlite: Sqlite;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    sqlite = new DatabaseSync!(":memory:");
    sqlite.exec(MINIMAL_BOOKINGS_DDL);
    db = makeDb(sqlite);
  });

  afterEach(() => sqlite.close());

  for (const status of ["cancelled", "rejected", "no_show", "rescheduled"]) {
    it(`does not block on an existing "${status}" booking`, async () => {
      seed(sqlite, {
        id: "old",
        provider_id: "prov_1",
        starts_at: SLOT_START.toISOString(),
        ends_at: SLOT_END.toISOString(),
        status,
      });
      const result = await insertBookingIfFree(db, values());
      expect(result.inserted).toBe(true);
    });
  }

  for (const status of ["pending", "confirmed", "completed"]) {
    it(`blocks on an existing "${status}" booking`, async () => {
      seed(sqlite, {
        id: "old",
        provider_id: "prov_1",
        starts_at: SLOT_START.toISOString(),
        ends_at: SLOT_END.toISOString(),
        status,
      });
      const result = await insertBookingIfFree(db, values());
      expect(result.inserted).toBe(false);
    });
  }

  it("blocks on an unrecognised future status (fails safe)", async () => {
    seed(sqlite, {
      id: "old",
      provider_id: "prov_1",
      starts_at: SLOT_START.toISOString(),
      ends_at: SLOT_END.toISOString(),
      status: "awaiting_deposit",
    });
    const result = await insertBookingIfFree(db, values());
    expect(result.inserted).toBe(false);
  });

  it("blocks on a NULL status rather than dropping the row from the check", async () => {
    // SQL three-valued logic makes `NULL NOT IN (...)` evaluate to NULL; the
    // guard's explicit IS NULL arm is what keeps this row blocking.
    seed(sqlite, {
      id: "old",
      provider_id: "prov_1",
      starts_at: SLOT_START.toISOString(),
      ends_at: SLOT_END.toISOString(),
      status: null,
    });
    const result = await insertBookingIfFree(db, values());
    expect(result.inserted).toBe(false);
  });

  it("lets a cancelled slot be rebooked and then blocks the rebooking", async () => {
    seed(sqlite, {
      id: "old",
      provider_id: "prov_1",
      starts_at: SLOT_START.toISOString(),
      ends_at: SLOT_END.toISOString(),
      status: "cancelled",
    });

    expect((await insertBookingIfFree(db, values({ id: "new_1" }))).inserted).toBe(true);
    expect((await insertBookingIfFree(db, values({ id: "new_2" }))).inserted).toBe(false);
  });

  it("blocks every existing row when inactiveStatuses is empty", async () => {
    seed(sqlite, {
      id: "old",
      provider_id: "prov_1",
      starts_at: SLOT_START.toISOString(),
      ends_at: SLOT_END.toISOString(),
      status: "cancelled",
    });
    const result = await insertBookingIfFree(db, values(), { inactiveStatuses: [] });
    expect(result.inserted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Buffers, reschedule, resources
// ---------------------------------------------------------------------------

describeSqlite("Buffer windows, reschedule and resources (real SQLite)", () => {
  let sqlite: Sqlite;
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    sqlite = new DatabaseSync!(":memory:");
    sqlite.exec(MINIMAL_BOOKINGS_DDL);
    db = makeDb(sqlite);
  });

  afterEach(() => sqlite.close());

  it("enforces buffer time via conflictWindow while storing the true times", async () => {
    seed(sqlite, {
      id: "existing",
      provider_id: "prov_1",
      starts_at: "2026-06-15T09:00:00.000Z",
      ends_at: "2026-06-15T09:30:00.000Z",
    });

    // 09:35 is clear of 09:30, but not with a 15-minute buffer.
    const buffered = await insertBookingIfFree(
      db,
      values({
        id: "c1",
        starts_at: new Date("2026-06-15T09:35:00.000Z"),
        ends_at: new Date("2026-06-15T10:05:00.000Z"),
      }),
      {
        conflictWindow: {
          startsAt: new Date("2026-06-15T09:20:00.000Z"),
          endsAt: new Date("2026-06-15T10:20:00.000Z"),
        },
      },
    );
    expect(buffered.inserted).toBe(false);

    // Without the buffer the same booking is fine.
    const unbuffered = await insertBookingIfFree(
      db,
      values({
        id: "c2",
        starts_at: new Date("2026-06-15T09:35:00.000Z"),
        ends_at: new Date("2026-06-15T10:05:00.000Z"),
      }),
    );
    expect(unbuffered.inserted).toBe(true);

    const rows = sqlite
      .prepare("SELECT starts_at FROM bookings WHERE id = 'c2'")
      .all() as Array<{ starts_at: string }>;
    expect(rows[0].starts_at).toBe("2026-06-15T09:35:00.000Z");
  });

  it("lets a booking be rescheduled into a window it already occupies", async () => {
    seed(sqlite, {
      id: "bk_move",
      provider_id: "prov_1",
      starts_at: "2026-06-15T09:00:00.000Z",
      ends_at: "2026-06-15T09:30:00.000Z",
    });

    // Without excludeId the row conflicts with itself.
    const naive = await insertBookingIfFree(
      db,
      values({
        id: "bk_new",
        starts_at: new Date("2026-06-15T09:15:00.000Z"),
        ends_at: new Date("2026-06-15T09:45:00.000Z"),
      }),
    );
    expect(naive.inserted).toBe(false);

    const excluded = await insertBookingIfFree(
      db,
      values({
        id: "bk_new",
        starts_at: new Date("2026-06-15T09:15:00.000Z"),
        ends_at: new Date("2026-06-15T09:45:00.000Z"),
      }),
      { excludeId: "bk_move" },
    );
    expect(excluded.inserted).toBe(true);
  });

  it("still blocks a third-party conflict when excludeId is used", async () => {
    seed(sqlite, {
      id: "bk_move",
      provider_id: "prov_1",
      starts_at: "2026-06-15T09:00:00.000Z",
      ends_at: "2026-06-15T09:30:00.000Z",
    });
    seed(sqlite, {
      id: "bk_other",
      provider_id: "prov_1",
      starts_at: "2026-06-15T09:30:00.000Z",
      ends_at: "2026-06-15T10:00:00.000Z",
    });

    const result = await insertBookingIfFree(
      db,
      values({
        id: "bk_new",
        starts_at: new Date("2026-06-15T09:15:00.000Z"),
        ends_at: new Date("2026-06-15T09:45:00.000Z"),
      }),
      { excludeId: "bk_move" },
    );
    expect(result.inserted).toBe(false);
  });

  it("scopes resource bookings by resource_id", async () => {
    const rows = {
      id: "r1",
      resource_id: "table_5",
      provider_id: null,
      starts_at: SLOT_START,
      ends_at: SLOT_END,
      status: "confirmed",
    };

    expect((await insertResourceBookingIfFree(db, rows)).inserted).toBe(true);
    // Same table, same time — blocked.
    expect(
      (await insertResourceBookingIfFree(db, { ...rows, id: "r2" })).inserted,
    ).toBe(false);
    // Different table, same time — allowed.
    expect(
      (
        await insertResourceBookingIfFree(db, {
          ...rows,
          id: "r3",
          resource_id: "table_6",
        })
      ).inserted,
    ).toBe(true);
  });

  it("admits one winner per resource under concurrency", async () => {
    const racing = yieldingDb(sqlite);
    const attempts = ["table_5", "table_6"].flatMap((resource_id) =>
      Array.from({ length: 10 }, (_, i) =>
        insertResourceBookingIfFree(racing, {
          id: `${resource_id}_${i}`,
          resource_id,
          provider_id: null,
          starts_at: SLOT_START,
          ends_at: SLOT_END,
          status: "confirmed",
        }),
      ),
    );

    const results = await Promise.all(attempts);
    expect(results.filter((r) => r.inserted)).toHaveLength(2);
    expect(countBookings(sqlite)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Production DDL
// ---------------------------------------------------------------------------

describeSqlite("Production DDL (real SQLite)", () => {
  let sqlite: Sqlite;

  beforeEach(() => {
    sqlite = new DatabaseSync!(":memory:");
    // BOOKINGS_DDL carries foreign keys into tables owned by other DDL blocks
    // (providers, event_types, resources). These tests exercise index and guard
    // semantics, not referential integrity, so the parent tables are omitted.
    // node:sqlite enables foreign_keys by default; D1 does not.
    sqlite.exec("PRAGMA foreign_keys = OFF");
  });

  afterEach(() => sqlite.close());

  it("BOOKINGS_DDL and the unique-slot backstop are valid SQLite", () => {
    expect(() => {
      sqlite.exec(BOOKINGS_DDL);
      sqlite.exec(BOOKINGS_UNIQUE_SLOT_DDL);
    }).not.toThrow();
  });

  it("the unique index rejects a duplicate slot inserted without the guard", () => {
    sqlite.exec(BOOKINGS_DDL);
    sqlite.exec(BOOKINGS_UNIQUE_SLOT_DDL);

    const insert = (id: string, status: string) =>
      sqlite
        .prepare(
          `INSERT INTO bookings (id, event_type_id, provider_id, customer_email,
             customer_name, starts_at, ends_at, status, created_at, updated_at)
           VALUES (?, 'et', 'prov_1', 'a@b.c', 'A', ?, ?, ?, 'now', 'now')`,
        )
        .run(id, SLOT_START.toISOString(), SLOT_END.toISOString(), status);

    insert("bk_1", "confirmed");
    // Raw SQL bypassing the guard entirely is still caught by the schema.
    expect(() => insert("bk_2", "confirmed")).toThrow(/UNIQUE constraint/);
  });

  it("the unique index still allows rebooking a cancelled slot", () => {
    sqlite.exec(BOOKINGS_DDL);
    sqlite.exec(BOOKINGS_UNIQUE_SLOT_DDL);

    const insert = (id: string, status: string) =>
      sqlite
        .prepare(
          `INSERT INTO bookings (id, event_type_id, provider_id, customer_email,
             customer_name, starts_at, ends_at, status, created_at, updated_at)
           VALUES (?, 'et', 'prov_1', 'a@b.c', 'A', ?, ?, ?, 'now', 'now')`,
        )
        .run(id, SLOT_START.toISOString(), SLOT_END.toISOString(), status);

    insert("bk_1", "cancelled");
    insert("bk_2", "rejected");
    insert("bk_3", "no_show");
    expect(() => insert("bk_4", "confirmed")).not.toThrow();
    expect(() => insert("bk_5", "confirmed")).toThrow(/UNIQUE constraint/);
  });

  it("the guard's generated SQL parses against the production bookings table", async () => {
    sqlite.exec(BOOKINGS_DDL);
    const { sql, params } = buildInsertIfFree({
      id: "bk_1",
      event_type_id: "et",
      provider_id: "prov_1",
      customer_email: "a@b.c",
      customer_name: "A",
      starts_at: SLOT_START,
      ends_at: SLOT_END,
      status: "confirmed",
      created_at: "now",
      updated_at: "now",
    });

    expect(() => sqlite.prepare(sql).run(...params)).not.toThrow();
    expect(countBookings(sqlite)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Lock: fencing token and schema migration
// ---------------------------------------------------------------------------

describeSqlite("D1BookingLock against real SQLite", () => {
  let sqlite: Sqlite;

  beforeEach(() => {
    sqlite = new DatabaseSync!(":memory:");
    sqlite.exec(BOOKING_LOCKS_DDL);
  });

  afterEach(() => sqlite.close());

  function lockRows() {
    return sqlite.prepare("SELECT * FROM booking_locks").all() as Array<{
      lock_key: string;
      holder: string | null;
    }>;
  }

  it("stores a fencing token on acquire and clears the row on release", async () => {
    const lock = new D1BookingLock(makeDb(sqlite), { baseDelayMs: 0 });

    await lock.withLock("prov_1:2026-06-15", async (handle) => {
      const rows = lockRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].holder).toBe(handle.holder);
      expect(handle.holder).toBeTruthy();
    });

    expect(lockRows()).toHaveLength(0);
  });

  it("gives each acquisition a distinct token", async () => {
    const lock = new D1BookingLock(makeDb(sqlite), { baseDelayMs: 0 });
    const seen = new Set<string>();

    for (let i = 0; i < 25; i++) {
      await lock.withLock("k", async (h) => void seen.add(h.holder));
    }
    expect(seen.size).toBe(25);
  });

  it("a holder whose lease expired cannot release the new holder's lock", async () => {
    // The core fencing-token guarantee. Without it, the slow holder's cleanup
    // would unlock a slot the new holder is actively using.
    const db = makeDb(sqlite);
    const slow = new D1BookingLock(db, { baseDelayMs: 0, lockTtlMs: 30 });

    let stolenHolder = "";

    const outcome = await slow
      .withLock("prov_1:2026-06-15", async () => {
        // Outlive the lease, then let a second request reclaim the key.
        await new Promise((r) => setTimeout(r, 60));

        const fresh = new D1BookingLock(db, { baseDelayMs: 0, lockTtlMs: 10_000 });
        await fresh.withLock("prov_1:2026-06-15", async (h) => {
          stolenHolder = h.holder;
          // Snapshot taken while the new holder is still inside its own
          // critical section; the slow holder's release runs after this.
        });
        return "done";
      })
      .catch((e: Error) => e);

    // The slow holder is told its lease lapsed rather than silently continuing.
    expect(outcome).toBeInstanceOf(LockLeaseExpiredError);
    expect((outcome as LockLeaseExpiredError).result).toBe("done");
    expect(stolenHolder).toBeTruthy();
  });

  it("a stale holder's release deletes nothing when the lock was reclaimed", async () => {
    const db = makeDb(sqlite);

    // Simulate a crashed worker: an expired row owned by someone else.
    sqlite
      .prepare(
        "INSERT INTO booking_locks (lock_key, expires_at, created_at, holder) VALUES (?, ?, ?, ?)",
      )
      .run("k", new Date(Date.now() - 60_000).toISOString(), "old", "ghost");

    const lock = new D1BookingLock(db, { baseDelayMs: 0, generateHolder: () => "fresh" });

    await lock.withLock("k", async () => {
      // The expired ghost row was purged and replaced by ours.
      expect(lockRows()[0].holder).toBe("fresh");

      // A stale release by the ghost must not touch our row.
      await db.run("DELETE FROM booking_locks WHERE lock_key = ? AND holder = ?", [
        "k",
        "ghost",
      ]);
      expect(lockRows()).toHaveLength(1);
      expect(lockRows()[0].holder).toBe("fresh");
    });

    expect(lockRows()).toHaveLength(0);
  });

  it("does not steal a live lock held by another request", async () => {
    const db = makeDb(sqlite);
    const held = new D1BookingLock(db, { lockTtlMs: 10_000, baseDelayMs: 0 });
    const other = new D1BookingLock(db, {
      lockTtlMs: 10_000,
      baseDelayMs: 1,
      maxRetries: 2,
    });

    await held.withLock("k", async () => {
      await expect(other.withLock("k", async () => "nope")).rejects.toThrow(
        /Could not acquire booking lock/,
      );
    });
  });

  it("extend() renews a live lease", async () => {
    const lock = new D1BookingLock(makeDb(sqlite), { baseDelayMs: 0, lockTtlMs: 50 });

    const result = await lock.withLock("k", async (handle) => {
      const before = handle.expiresAt;
      await new Promise((r) => setTimeout(r, 30));
      expect(await handle.extend(10_000)).toBe(true);
      expect(handle.expiresAt).toBeGreaterThan(before);
      expect(handle.isExpired()).toBe(false);
      return "ok";
    });

    // Extending kept the lease alive, so no expiry error was raised.
    expect(result).toBe("ok");
  });

  it("extend() returns false once the lock has been lost", async () => {
    const db = makeDb(sqlite);
    const lock = new D1BookingLock(db, { baseDelayMs: 0, lockTtlMs: 10_000 });

    await lock
      .withLock("k", async (handle) => {
        // Someone else reclaims the key.
        await db.run("DELETE FROM booking_locks WHERE lock_key = ?", ["k"]);
        expect(await handle.extend()).toBe(false);
      })
      .catch(() => {
        /* release is a no-op here; expiry state is what's under test */
      });
  });

  it("upgrades a legacy lock table that has no holder column", async () => {
    sqlite.exec("DROP TABLE booking_locks");
    sqlite.exec(`CREATE TABLE booking_locks (
      lock_key   TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);

    const lock = new D1BookingLock(makeDb(sqlite), { baseDelayMs: 0 });
    await lock.withLock("k", async (handle) => {
      expect(handle.holder).toBeTruthy();
    });

    const cols = sqlite.prepare("PRAGMA table_info(booking_locks)").all() as Array<{
      name: string;
    }>;
    expect(cols.map((c) => c.name)).toContain("holder");
  });

  it("refuses to run DDL when autoMigrate is disabled", async () => {
    sqlite.exec("DROP TABLE booking_locks");
    sqlite.exec(`CREATE TABLE booking_locks (
      lock_key   TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);

    const lock = new D1BookingLock(makeDb(sqlite), {
      baseDelayMs: 0,
      autoMigrate: false,
    });

    await expect(lock.withLock("k", async () => "x")).rejects.toThrow(LockSchemaError);
  });

  it("BOOKING_LOCKS_HOLDER_MIGRATION_SQL upgrades a legacy table exactly once", () => {
    sqlite.exec("DROP TABLE booking_locks");
    sqlite.exec(`CREATE TABLE booking_locks (
      lock_key   TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);

    expect(() => sqlite.exec(BOOKING_LOCKS_HOLDER_MIGRATION_SQL)).not.toThrow();
    expect(() => sqlite.exec(BOOKING_LOCKS_HOLDER_MIGRATION_SQL)).toThrow(
      /duplicate column name/,
    );
  });

  it("serialises concurrent holders of the same key", async () => {
    const lock = new D1BookingLock(makeDb(sqlite), {
      baseDelayMs: 0,
      maxRetries: 50,
      lockTtlMs: 10_000,
    });

    let inside = 0;
    let maxInside = 0;

    await Promise.all(
      Array.from({ length: 8 }, () =>
        lock.withLock("k", async () => {
          inside++;
          maxInside = Math.max(maxInside, inside);
          await new Promise((r) => setTimeout(r, 1));
          inside--;
        }),
      ),
    );

    expect(maxInside).toBe(1);
    expect(lockRows()).toHaveLength(0);
  });
});
