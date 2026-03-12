/**
 * Static analysis tests for known QA issues in the @thebookingkit/db package.
 *
 * These tests do NOT require a live database. They inspect Drizzle schema
 * objects programmatically and read raw SQL migration files to verify that
 * documented bugs are present (or, once fixed, have been resolved).
 *
 * Issue IDs correspond to the internal QA backlog:
 *   DB-H4, DB-H5, DB-M4, DB-M6, DB-L5, DB-C1, DB-C2, DB-C3, DB-M8
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

import { teams, eventTypes, bookingEvents } from "../schema/tables.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a path relative to the package root (packages/db). */
function pkgPath(...segments: string[]): string {
  // __dirname is packages/db/src/__tests__, so go up three levels to reach the
  // package root, then up one more for the src/ folder, then into migrations/.
  // Using import.meta.url would require additional transform config; we use
  // process.cwd() as a stable anchor because Vitest sets cwd to the workspace
  // root and the file paths are predictable.
  return join(
    process.cwd(),
    ...segments,
  );
}

function readMigration(filename: string): string {
  return readFileSync(pkgPath("src", "migrations", filename), "utf8");
}

// ---------------------------------------------------------------------------
// DB-H4 — teams.slug is missing a UNIQUE constraint
// ---------------------------------------------------------------------------
describe("DB-H4: teams.slug uniqueness", () => {
  it("slug column should carry a .isUnique flag (column-level unique)", () => {
    const slugColumn = teams.slug;
    expect(slugColumn.isUnique).toBe(true);
  });

  it("should have no unique index on slug in the table extra-config", () => {
    const config = getTableConfig(teams);

    // Check table-level unique constraints (declared via unique() helper).
    const uniqueOnSlug = config.uniqueConstraints.some((uc) =>
      uc.columns.some((col) => col.name === "slug"),
    );

    // Check whether any index declared in the extra-config is both unique
    // and covers the slug column.
    const uniqueIndexOnSlug = config.indexes.some(
      (idx) => idx.config.unique === true &&
        idx.config.columns.some(
          (col) =>
            // IndexedColumn exposes .name; SQL fragments do not — guard both.
            typeof col === "object" &&
            col !== null &&
            "name" in col &&
            (col as { name: string }).name === "slug",
        ),
    );

    // Column-level .unique() sets isUnique on the column object, not uniqueConstraints.
    expect(uniqueOnSlug).toBe(false);
    expect(uniqueIndexOnSlug).toBe(false);
  });

  it("organizations.slug has .unique() as a reference baseline", async () => {
    // Confirm the pattern we expect for teams once the fix is applied.
    // organizations already has .unique() on its slug — use it as proof
    // that the mechanism works.
    const { organizations } = await import("../schema/tables.js");
    expect(organizations.slug.isUnique).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DB-H5 — eventTypes.slug is missing a UNIQUE constraint
// ---------------------------------------------------------------------------
describe("DB-H5: eventTypes.slug uniqueness", () => {
  it("slug column should carry a .isUnique flag (column-level unique)", () => {
    expect(eventTypes.slug.isUnique).toBe(true);
  });

  it("should have no unique constraint on slug in the table config", () => {
    const config = getTableConfig(eventTypes);

    const uniqueOnSlug = config.uniqueConstraints.some((uc) =>
      uc.columns.some((col) => col.name === "slug"),
    );
    // Column-level .unique() sets isUnique on the column object, not uniqueConstraints.
    expect(uniqueOnSlug).toBe(false);
  });

  it("event_types_slug_idx is a plain (non-unique) index", () => {
    const config = getTableConfig(eventTypes);
    const slugIdx = config.indexes.find(
      (idx) => idx.config.name === "event_types_slug_idx",
    );

    expect(slugIdx).toBeDefined();
    expect(slugIdx?.config.unique).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DB-M4 — bookingEvents.bookingId has onDelete: "cascade" (audit trail risk)
// ---------------------------------------------------------------------------
describe("DB-M4: bookingEvents foreign key cascade behaviour", () => {
  it("bookingId foreign key should NOT have onDelete: cascade on an audit trail table", () => {
    const config = getTableConfig(bookingEvents);

    // There is exactly one FK on bookingEvents: bookingId -> bookings.id
    const bookingIdFk = config.foreignKeys.find((fk) =>
      fk.reference().columns.some((col) => col.name === "booking_id"),
    );

    expect(bookingIdFk).toBeDefined();

    expect(bookingIdFk?.onDelete).toBe("restrict");
  });

  it("audit trail rows would be silently wiped if a booking is hard-deleted", () => {
    const config = getTableConfig(bookingEvents);
    const bookingIdFk = config.foreignKeys.find((fk) =>
      fk.reference().columns.some((col) => col.name === "booking_id"),
    );

    // A correct audit trail FK would use "restrict" or "no action" so that
    // the application is forced to handle retention before deletion.
    const isSafeAction =
      bookingIdFk?.onDelete === "restrict" ||
      bookingIdFk?.onDelete === "no action" ||
      bookingIdFk?.onDelete === undefined; // undefined defaults to "no action" in Postgres

    expect(isSafeAction).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DB-M6 — Missing type exports for walkInQueue table
// ---------------------------------------------------------------------------
describe("DB-M6: WalkInQueue and NewWalkInQueue types are not exported from index", () => {
  it("walkInQueue table is defined in the schema", async () => {
    // The table exists in tables.ts — confirm it is importable.
    const { walkInQueue } = await import("../schema/tables.js");
    expect(walkInQueue).toBeDefined();
  });

  it("WalkInQueue select type is NOT exported from the package index (missing type export)", async () => {
    // Dynamically import the package index to check for named exports.
    // Type-only exports are erased at runtime, so we verify via the inferred
    // table shape: if the export were present it would be accessible as a
    // TypeScript type, but we can confirm the JS module does NOT re-export
    // walkInQueue at the value level and has no corresponding type alias
    // listed in the index source.

    // Read the index source to verify the absence of walkInQueue imports/exports.
    const indexSource = readFileSync(pkgPath("src", "index.ts"), "utf8");

    expect(indexSource).toContain("walkInQueue");
    expect(indexSource).toContain("WalkInQueue");
    expect(indexSource).toContain("NewWalkInQueue");
  });

  it("walkInQueue table is re-exported via schema wildcard but types are missing", async () => {
    // The wildcard `export * from "./schema/index.js"` in index.ts does
    // re-export the walkInQueue *value*, but the explicit type aliases
    // (WalkInQueue, NewWalkInQueue) are not present in index.ts.
    const schemaIndexSource = readFileSync(
      pkgPath("src", "schema", "index.ts"),
      "utf8",
    );
    // tables.ts is re-exported via schema/index.ts
    expect(schemaIndexSource).toContain("tables");

    const indexSource = readFileSync(pkgPath("src", "index.ts"), "utf8");
    expect(indexSource).toMatch(/export type WalkInQueue\b/);
    expect(indexSource).toMatch(/export type NewWalkInQueue\b/);
  });
});

// ---------------------------------------------------------------------------
// DB-L5 — No test script in package.json
// ---------------------------------------------------------------------------
describe("DB-L5: package.json is missing a test script", () => {
  it("scripts section should contain a test entry", () => {
    const pkgJson = JSON.parse(
      readFileSync(pkgPath("package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(pkgJson.scripts).toBeDefined();
    expect(pkgJson.scripts?.["test"]).toBeDefined();
  });

  it("vitest devDependency is also missing", () => {
    const pkgJson = JSON.parse(
      readFileSync(pkgPath("package.json"), "utf8"),
    ) as {
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };

    const allDeps = {
      ...pkgJson.dependencies,
      ...pkgJson.devDependencies,
    };

    expect(allDeps["vitest"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DB-C1 — EXCLUDE constraint omits 'rescheduled' from the exclusion list
// ---------------------------------------------------------------------------
describe("DB-C1: EXCLUDE constraint does not exclude rescheduled bookings", () => {
  const migration0001 = readMigration("0001_setup_extensions.sql");

  it("migration 0001 defines the bookings_no_overlap EXCLUDE constraint", () => {
    expect(migration0001).toContain("bookings_no_overlap");
    expect(migration0001).toContain("EXCLUDE USING gist");
  });

  it("WHERE clause should include 'rescheduled' in the NOT IN list", () => {
    // Extract the WHERE clause from the EXCLUDE constraint definition.
    // Current SQL: WHERE (status NOT IN ('cancelled', 'rejected'))
    // Missing:     'rescheduled' — a rescheduled booking can double-book a slot.
    const whereClauseMatch = migration0001.match(
      /WHERE\s*\(status\s+NOT\s+IN\s*\(([^)]+)\)\)/i,
    );

    expect(whereClauseMatch).not.toBeNull(); // constraint WHERE clause must exist

    const excludedStatuses = whereClauseMatch![1];

    expect(excludedStatuses).toContain("rescheduled");
  });

  it("the exclusion list contains only cancelled and rejected (both required)", () => {
    const whereClauseMatch = migration0001.match(
      /WHERE\s*\(status\s+NOT\s+IN\s*\(([^)]+)\)\)/i,
    );
    const excludedStatuses = whereClauseMatch![1];

    // The two statuses that ARE excluded:
    expect(excludedStatuses).toContain("cancelled");
    expect(excludedStatuses).toContain("rejected");

    expect(excludedStatuses).toContain("rescheduled");
  });
});

// ---------------------------------------------------------------------------
// DB-C2 — Audit trigger uses 'confirmed' as a fallback for non-status updates
// ---------------------------------------------------------------------------
describe("DB-C2: audit trigger logs spurious confirmed events on non-status updates", () => {
  const migration0002 = readMigration("0002_booking_audit_trigger.sql");

  it("migration 0002 defines the booking_audit_trigger_fn function", () => {
    expect(migration0002).toContain("booking_audit_trigger_fn");
    expect(migration0002).toContain("CREATE OR REPLACE FUNCTION");
  });

  it("the trigger ELSE branch hard-codes confirmed as a fallback event type", () => {
    // BUG: when a non-status field (e.g. metadata) is updated, the trigger
    // falls through to the ELSE branch and sets v_event_type := 'confirmed'.
    // This creates a false confirmed audit event even when the booking status
    // has not changed and was never set to confirmed.
    const hasFallbackConfirmed = /v_event_type\s*:=\s*'confirmed'/.test(
      migration0002,
    );
    expect(hasFallbackConfirmed).toBe(false);
  });

  it("the ELSE branch does not use a neutral fallback like updated or metadata_changed", () => {
    // A correct implementation would use a neutral event type such as
    // 'metadata_changed' or skip inserting entirely for non-status updates.
    const hasNeutralFallback =
      /v_event_type\s*:=\s*'(updated|metadata_changed|field_updated)'/.test(
        migration0002,
      );
    expect(hasNeutralFallback).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DB-C3 — Audit trigger unconditionally overwrites v_metadata after setting it
// ---------------------------------------------------------------------------
describe("DB-C3: audit trigger metadata value is overwritten unconditionally", () => {
  const migration0002 = readMigration("0002_booking_audit_trigger.sql");

  it("v_metadata is assigned in the ELSE branch and then unconditionally reset to empty", () => {
    // In the UPDATE block the trigger does:
    //   ELSE
    //     v_event_type := 'confirmed';
    //     v_metadata   := jsonb_build_object('update', 'non_status_change');  -- line A
    //   END IF;
    //   v_metadata := '{}'::jsonb;  -- line B  <-- BUG: unconditionally wipes line A
    //
    // Line B always runs after the IF/ELSIF/ELSE block, so the metadata set
    // in the ELSE branch (and the status-change branch) is silently discarded.

    // Verify the unconditional reset to empty object appears in the UPDATE block.
    const hasUnconditionalReset = /v_metadata\s*:=\s*'\{\}'::jsonb/.test(
      migration0002,
    );
    expect(hasUnconditionalReset).toBe(false);

    const hasElseAssignment =
      /jsonb_build_object\(\s*'update'\s*,\s*'non_status_change'\s*\)/.test(
        migration0002,
      );
    expect(hasElseAssignment).toBe(true);
  });

  it("the ELSE branch metadata assignment appears before the unconditional reset", () => {
    // Confirm ordering: the ELSE assignment comes first, then the reset.
    const elsePos = migration0002.indexOf("non_status_change");
    const resetPos = migration0002.indexOf("v_metadata := '{}'::jsonb");

    expect(elsePos).toBeGreaterThan(-1); // ELSE assignment is present
    expect(resetPos).toBe(-1); // unconditional reset is gone
  });
});

// ---------------------------------------------------------------------------
// DB-M8 — GDPR anonymize_customer() requires pgcrypto but it is not created
// ---------------------------------------------------------------------------
describe("DB-M8: GDPR anonymize_customer() depends on pgcrypto (digest function)", () => {
  const migration0001 = readMigration("0001_setup_extensions.sql");
  const migration0003 = readMigration("0003_gdpr_anonymize.sql");

  it("0003_gdpr_anonymize.sql uses digest() which requires the pgcrypto extension", () => {
    // The anonymize_customer function calls digest(p_email, 'sha256') to build
    // the redacted email. This function is provided by the pgcrypto extension.
    expect(migration0003).toContain("digest("); // confirms pgcrypto dependency
  });

  it("0001_setup_extensions.sql should CREATE EXTENSION pgcrypto but does not", () => {
    expect(migration0001).toContain("pgcrypto");
  });

  it("pgcrypto is absent from ALL migration files combined", () => {
    const migration0004 = readMigration("0004_create_booking_function.sql");

    const allMigrations = [
      migration0001,
      migration0003, // the file that needs it
      migration0004,
    ].join("\n");

    expect(allMigrations).toContain("pgcrypto");
  });

  it("0001 only creates btree_gist (confirming scope of the gap)", () => {
    // Confirm the one extension that IS created.
    expect(migration0001).toContain("btree_gist");

    const pgcryptoLineCount = (migration0001.match(/pgcrypto/gi) ?? []).length;
    expect(pgcryptoLineCount).toBeGreaterThan(0);
  });
});
