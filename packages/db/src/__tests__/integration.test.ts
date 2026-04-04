/**
 * Integration tests for @thebookingkit/db
 *
 * These tests run against a real PostgreSQL 15 database. They require the
 * DATABASE_URL environment variable to be set and the schema to be pushed via
 * `drizzle-kit push` followed by the custom SQL migrations via
 * `runCustomMigrations()`.
 *
 * Run with:
 *   npm run test:integration
 *
 * Or set DATABASE_URL manually:
 *   DATABASE_URL=postgresql://... vitest run src/__tests__/integration.test.ts
 *
 * The entire suite is skipped when DATABASE_URL is absent, so `vitest run`
 * (unit mode) continues to pass in environments without a database.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and, sql } from "drizzle-orm";
import { createDb, type Database } from "../client.js";
import {
  providers,
  eventTypes,
  availabilityRules,
  bookings,
  bookingEvents,
} from "../schema/tables.js";

// ---------------------------------------------------------------------------
// Connection setup
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env["DATABASE_URL"];
const hasDb = Boolean(DATABASE_URL);

let db: Database;

/**
 * Helpers — unique suffix so parallel CI runs do not collide on UNIQUE columns.
 * We use a timestamp prefix combined with a short random suffix.
 */
const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const uid = (label: string) => `${label}_${runId}`;

// ---------------------------------------------------------------------------
// Cleanup helpers — remove test rows in dependency order after each suite
// ---------------------------------------------------------------------------

/** Ids created during the run, collected so afterAll can delete them cleanly. */
const created = {
  bookingEventIds: [] as string[],
  bookingIds: [] as string[],
  availabilityRuleIds: [] as string[],
  eventTypeIds: [] as string[],
  providerIds: [] as string[],
};

async function cleanUp() {
  if (!db) return;

  // Delete in reverse FK order
  if (created.bookingEventIds.length > 0) {
    await db
      .delete(bookingEvents)
      .where(sql`id = ANY(${created.bookingEventIds})`);
  }

  if (created.bookingIds.length > 0) {
    await db
      .delete(bookings)
      .where(sql`id = ANY(${created.bookingIds})`);
  }

  if (created.availabilityRuleIds.length > 0) {
    await db
      .delete(availabilityRules)
      .where(sql`id = ANY(${created.availabilityRuleIds})`);
  }

  if (created.eventTypeIds.length > 0) {
    await db
      .delete(eventTypes)
      .where(sql`id = ANY(${created.eventTypeIds})`);
  }

  if (created.providerIds.length > 0) {
    await db
      .delete(providers)
      .where(sql`id = ANY(${created.providerIds})`);
  }
}

// ---------------------------------------------------------------------------
// Suite: guard for missing DATABASE_URL
// ---------------------------------------------------------------------------

describe.skipIf(!hasDb)("@thebookingkit/db — integration tests", () => {
  // -------------------------------------------------------------------------
  // beforeAll — create DB connection
  // -------------------------------------------------------------------------
  beforeAll(async () => {
    // DATABASE_URL is guaranteed non-null inside skipIf(!hasDb).
    // max: 3 keeps the pool small for test isolation.
    db = createDb(DATABASE_URL as string, { max: 3 });
  });

  // -------------------------------------------------------------------------
  // afterAll — clean up rows and close the connection
  // -------------------------------------------------------------------------
  afterAll(async () => {
    await cleanUp();
    // Allow postgres.js to drain its pool. Drizzle wraps the postgres.js
    // client internally; calling db.$client.end() drains the pool cleanly.
    // The cast is necessary because Drizzle's public type does not expose
    // $client, but it is stable at runtime.
    const client = (db as unknown as { $client: { end: () => Promise<void> } })
      .$client;
    if (client?.end) {
      await client.end();
    }
  });

  // =========================================================================
  // 1. Schema creation — verify critical tables exist
  // =========================================================================
  describe("1. Schema creation", () => {
    it("core tables are accessible via information_schema", async () => {
      const tableNames = [
        "providers",
        "event_types",
        "availability_rules",
        "bookings",
        "booking_events",
        "teams",
        "team_members",
      ];

      const rows = await db.execute<{ table_name: string }>(sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY(${tableNames})
        ORDER BY table_name
      `);

      const found = rows.map((r) => r.table_name).sort();
      expect(found).toEqual([...tableNames].sort());
    });

    it("bookings table carries the bookings_no_overlap EXCLUDE constraint", async () => {
      /**
       * The EXCLUDE USING gist constraint is created by the custom migration
       * 0001_setup_extensions.sql, not by drizzle-kit push. If the custom
       * migrations have not been run this assertion will fail — that is
       * intentional, as the constraint is essential for double-booking
       * prevention and must exist in any production-ready database.
       */
      const rows = await db.execute<{ conname: string }>(sql`
        SELECT conname
        FROM pg_constraint
        WHERE conname = 'bookings_no_overlap'
          AND contype = 'x'
      `);

      expect(rows.length).toBe(1);
      expect(rows[0]!.conname).toBe("bookings_no_overlap");
    });

    it("btree_gist extension is installed", async () => {
      const rows = await db.execute<{ extname: string }>(sql`
        SELECT extname FROM pg_extension WHERE extname = 'btree_gist'
      `);
      expect(rows.length).toBe(1);
    });
  });

  // =========================================================================
  // 2. Provider CRUD
  // =========================================================================
  describe("2. Provider CRUD", () => {
    let providerId: string;

    it("inserts a provider and reads it back", async () => {
      const [inserted] = await db
        .insert(providers)
        .values({
          userId: uid("user_crud"),
          displayName: "CRUD Test Provider",
          email: "crud@test.example",
          timezone: "America/Chicago",
        })
        .returning();

      expect(inserted).toBeDefined();
      expect(inserted!.userId).toBe(uid("user_crud"));
      expect(inserted!.displayName).toBe("CRUD Test Provider");
      expect(inserted!.timezone).toBe("America/Chicago");
      expect(inserted!.id).toBeDefined();

      providerId = inserted!.id;
      created.providerIds.push(providerId);
    });

    it("reads the provider back by id", async () => {
      const [row] = await db
        .select()
        .from(providers)
        .where(eq(providers.id, providerId));

      expect(row).toBeDefined();
      expect(row!.displayName).toBe("CRUD Test Provider");
      expect(row!.email).toBe("crud@test.example");
    });

    it("updates displayName and verifies the change", async () => {
      await db
        .update(providers)
        .set({ displayName: "Updated Provider Name" })
        .where(eq(providers.id, providerId));

      const [updated] = await db
        .select()
        .from(providers)
        .where(eq(providers.id, providerId));

      expect(updated!.displayName).toBe("Updated Provider Name");
    });

    it("enforces userId UNIQUE constraint", async () => {
      // Attempt to insert a second provider with the same userId — must fail.
      await expect(
        db.insert(providers).values({
          userId: uid("user_crud"), // same as the first insert
          displayName: "Duplicate Provider",
          timezone: "UTC",
        }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 3. Event type creation with foreign key to provider
  // =========================================================================
  describe("3. Event type creation", () => {
    let providerId: string;
    let eventTypeId: string;

    beforeAll(async () => {
      const [p] = await db
        .insert(providers)
        .values({
          userId: uid("user_et"),
          displayName: "EventType Provider",
          timezone: "UTC",
        })
        .returning();
      providerId = p!.id;
      created.providerIds.push(providerId);
    });

    it("inserts an event type linked to a provider", async () => {
      const [et] = await db
        .insert(eventTypes)
        .values({
          providerId,
          title: "30-Minute Consultation",
          slug: uid("consult"),
          durationMinutes: 30,
          locationType: "video",
          requiresConfirmation: false,
          maxSeats: 1,
        })
        .returning();

      expect(et).toBeDefined();
      expect(et!.providerId).toBe(providerId);
      expect(et!.title).toBe("30-Minute Consultation");
      expect(et!.durationMinutes).toBe(30);
      expect(et!.locationType).toBe("video");

      eventTypeId = et!.id;
      created.eventTypeIds.push(eventTypeId);
    });

    it("reads the event type back via its provider FK", async () => {
      const [row] = await db
        .select()
        .from(eventTypes)
        .where(
          and(
            eq(eventTypes.providerId, providerId),
            eq(eventTypes.id, eventTypeId),
          ),
        );

      expect(row!.slug).toBe(uid("consult"));
    });

    it("rejects an event type with a non-existent provider_id", async () => {
      await expect(
        db.insert(eventTypes).values({
          providerId: "00000000-0000-0000-0000-000000000000",
          title: "Orphan Event",
          slug: uid("orphan"),
          durationMinutes: 15,
          locationType: "in_person",
          requiresConfirmation: false,
          maxSeats: 1,
        }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 4. Availability rules — RRULE-based
  // =========================================================================
  describe("4. Availability rules", () => {
    let providerId: string;

    beforeAll(async () => {
      const [p] = await db
        .insert(providers)
        .values({
          userId: uid("user_avail"),
          displayName: "Availability Provider",
          timezone: "America/New_York",
        })
        .returning();
      providerId = p!.id;
      created.providerIds.push(providerId);
    });

    it("inserts RRULE-based availability rules and reads them back", async () => {
      // Monday–Friday 9 AM–5 PM recurring weekly
      const [rule] = await db
        .insert(availabilityRules)
        .values({
          providerId,
          rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
          startTime: "09:00",
          endTime: "17:00",
          timezone: "America/New_York",
        })
        .returning();

      expect(rule).toBeDefined();
      expect(rule!.providerId).toBe(providerId);
      expect(rule!.rrule).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
      expect(rule!.startTime).toBe("09:00");
      expect(rule!.endTime).toBe("17:00");

      created.availabilityRuleIds.push(rule!.id);
    });

    it("inserts a Saturday override rule with a different time window", async () => {
      const [rule] = await db
        .insert(availabilityRules)
        .values({
          providerId,
          rrule: "RRULE:FREQ=WEEKLY;BYDAY=SA",
          startTime: "10:00",
          endTime: "14:00",
          timezone: "America/New_York",
        })
        .returning();

      expect(rule!.startTime).toBe("10:00");
      expect(rule!.endTime).toBe("14:00");

      created.availabilityRuleIds.push(rule!.id);
    });

    it("retrieves all rules for the provider", async () => {
      const rows = await db
        .select()
        .from(availabilityRules)
        .where(eq(availabilityRules.providerId, providerId));

      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // 5. Booking creation — verify all key fields round-trip correctly
  // =========================================================================
  describe("5. Booking creation", () => {
    let providerId: string;
    let eventTypeId: string;

    beforeAll(async () => {
      const [p] = await db
        .insert(providers)
        .values({
          userId: uid("user_book"),
          displayName: "Booking Provider",
          timezone: "UTC",
        })
        .returning();
      providerId = p!.id;
      created.providerIds.push(providerId);

      const [et] = await db
        .insert(eventTypes)
        .values({
          providerId,
          title: "Booking Test Event",
          slug: uid("book_et"),
          durationMinutes: 60,
          locationType: "in_person",
          requiresConfirmation: false,
          maxSeats: 1,
        })
        .returning();
      eventTypeId = et!.id;
      created.eventTypeIds.push(eventTypeId);
    });

    it("inserts a booking and reads back all fields", async () => {
      const startsAt = new Date("2026-06-01T10:00:00Z");
      const endsAt = new Date("2026-06-01T11:00:00Z");

      const [booking] = await db
        .insert(bookings)
        .values({
          providerId,
          eventTypeId,
          customerEmail: "alice@example.com",
          customerName: "Alice Wonderland",
          customerPhone: "+15550001234",
          startsAt,
          endsAt,
          status: "pending",
          source: "online",
        })
        .returning();

      expect(booking).toBeDefined();
      expect(booking!.providerId).toBe(providerId);
      expect(booking!.eventTypeId).toBe(eventTypeId);
      expect(booking!.customerEmail).toBe("alice@example.com");
      expect(booking!.customerName).toBe("Alice Wonderland");
      expect(booking!.customerPhone).toBe("+15550001234");
      expect(booking!.status).toBe("pending");
      expect(booking!.source).toBe("online");
      expect(new Date(booking!.startsAt).toISOString()).toBe(
        startsAt.toISOString(),
      );
      expect(new Date(booking!.endsAt).toISOString()).toBe(
        endsAt.toISOString(),
      );

      created.bookingIds.push(booking!.id);
    });
  });

  // =========================================================================
  // 6. Double-booking prevention via EXCLUDE USING gist
  // =========================================================================
  describe("6. Double-booking prevention (EXCLUDE USING gist)", () => {
    /**
     * Known limitation: the bookings_no_overlap EXCLUDE constraint is
     * created by 0001_setup_extensions.sql (a custom migration), NOT by
     * drizzle-kit push. If the custom migrations have not been applied to the
     * target database this test will be skipped with an explanatory message.
     *
     * In the GitHub Actions workflow, both drizzle-kit push and
     * runCustomMigrations() are executed before this suite, so the constraint
     * is always present in CI.
     */

    let providerId: string;
    let eventTypeId: string;
    let constraintExists = false;

    beforeAll(async () => {
      // Detect whether the constraint is present — skip gracefully if not.
      const rows = await db.execute<{ conname: string }>(sql`
        SELECT conname FROM pg_constraint
        WHERE conname = 'bookings_no_overlap' AND contype = 'x'
      `);
      constraintExists = rows.length > 0;

      const [p] = await db
        .insert(providers)
        .values({
          userId: uid("user_dbl"),
          displayName: "Double-Book Provider",
          timezone: "UTC",
        })
        .returning();
      providerId = p!.id;
      created.providerIds.push(providerId);

      const [et] = await db
        .insert(eventTypes)
        .values({
          providerId,
          title: "Double-Book Event",
          slug: uid("dbl_et"),
          durationMinutes: 60,
          locationType: "in_person",
          requiresConfirmation: false,
          maxSeats: 1,
        })
        .returning();
      eventTypeId = et!.id;
      created.eventTypeIds.push(eventTypeId);
    });

    it("rejects a second booking that exactly overlaps the first", async () => {
      if (!constraintExists) {
        console.warn(
          "[SKIP] bookings_no_overlap constraint not found — run custom migrations " +
            "(0001_setup_extensions.sql) to enable this test. " +
            "This is expected when using drizzle-kit push without the custom migration step.",
        );
        return;
      }

      const startsAt = new Date("2026-07-01T14:00:00Z");
      const endsAt = new Date("2026-07-01T15:00:00Z");

      // First booking — must succeed.
      const [first] = await db
        .insert(bookings)
        .values({
          providerId,
          eventTypeId,
          customerEmail: "first@example.com",
          customerName: "First Customer",
          startsAt,
          endsAt,
          status: "confirmed",
          source: "online",
        })
        .returning();

      expect(first).toBeDefined();
      created.bookingIds.push(first!.id);

      // Second booking with identical provider + overlapping time — must fail.
      await expect(
        db.insert(bookings).values({
          providerId, // same provider
          eventTypeId,
          customerEmail: "second@example.com",
          customerName: "Second Customer",
          startsAt, // same window — exact overlap
          endsAt,
          status: "confirmed",
          source: "online",
        }),
      ).rejects.toThrow(
        // PostgreSQL raises SQLSTATE 23P01 (exclusion_violation) — the message
        // always contains "exclusion constraint" or the constraint name.
        /exclusion|bookings_no_overlap/i,
      );
    });

    it("rejects a booking with a partially overlapping window", async () => {
      if (!constraintExists) return;

      // Base booking: 16:00 – 17:00 UTC on 2026-07-02
      const base = { startsAt: new Date("2026-07-02T16:00:00Z"), endsAt: new Date("2026-07-02T17:00:00Z") };
      const [first] = await db
        .insert(bookings)
        .values({
          providerId,
          eventTypeId,
          customerEmail: "overlap_base@example.com",
          customerName: "Overlap Base",
          ...base,
          status: "confirmed",
          source: "online",
        })
        .returning();
      created.bookingIds.push(first!.id);

      // Partial overlap: 16:30 – 17:30 — must be rejected.
      await expect(
        db.insert(bookings).values({
          providerId,
          eventTypeId,
          customerEmail: "overlap_partial@example.com",
          customerName: "Overlap Partial",
          startsAt: new Date("2026-07-02T16:30:00Z"),
          endsAt: new Date("2026-07-02T17:30:00Z"),
          status: "confirmed",
          source: "online",
        }),
      ).rejects.toThrow(/exclusion|bookings_no_overlap/i);
    });

    it("allows a booking for the same provider in a non-overlapping window", async () => {
      if (!constraintExists) return;

      // Non-overlapping: immediately after an existing 18:00–19:00 slot.
      const [first] = await db
        .insert(bookings)
        .values({
          providerId,
          eventTypeId,
          customerEmail: "nooverlap_a@example.com",
          customerName: "No Overlap A",
          startsAt: new Date("2026-07-03T18:00:00Z"),
          endsAt: new Date("2026-07-03T19:00:00Z"),
          status: "confirmed",
          source: "online",
        })
        .returning();
      created.bookingIds.push(first!.id);

      // Adjacent slot starting exactly at 19:00 — no overlap, must succeed.
      const [second] = await db
        .insert(bookings)
        .values({
          providerId,
          eventTypeId,
          customerEmail: "nooverlap_b@example.com",
          customerName: "No Overlap B",
          startsAt: new Date("2026-07-03T19:00:00Z"),
          endsAt: new Date("2026-07-03T20:00:00Z"),
          status: "confirmed",
          source: "online",
        })
        .returning();

      expect(second).toBeDefined();
      created.bookingIds.push(second!.id);
    });

    it("allows overlapping windows when the first booking is cancelled", async () => {
      if (!constraintExists) return;

      // Cancelled bookings are excluded from the EXCLUDE constraint's WHERE
      // clause, so a second booking in the same window must be accepted.
      const startsAt = new Date("2026-07-04T09:00:00Z");
      const endsAt = new Date("2026-07-04T10:00:00Z");

      const [cancelled] = await db
        .insert(bookings)
        .values({
          providerId,
          eventTypeId,
          customerEmail: "cancelled@example.com",
          customerName: "Cancelled Customer",
          startsAt,
          endsAt,
          status: "cancelled", // excluded from constraint
          source: "online",
        })
        .returning();
      created.bookingIds.push(cancelled!.id);

      const [replacement] = await db
        .insert(bookings)
        .values({
          providerId,
          eventTypeId,
          customerEmail: "replacement@example.com",
          customerName: "Replacement Customer",
          startsAt,
          endsAt,
          status: "confirmed",
          source: "online",
        })
        .returning();

      expect(replacement).toBeDefined();
      created.bookingIds.push(replacement!.id);
    });
  });

  // =========================================================================
  // 7. Cascading deletes — deleting a provider cascades to event types
  // =========================================================================
  describe("7. Cascading deletes", () => {
    it("deletes a provider and cascades to their event types", async () => {
      // Create a fresh provider + event type pair that we will delete entirely.
      const [p] = await db
        .insert(providers)
        .values({
          userId: uid("user_cascade"),
          displayName: "Cascade Provider",
          timezone: "UTC",
        })
        .returning();
      const cascadeProviderId = p!.id;

      const [et] = await db
        .insert(eventTypes)
        .values({
          providerId: cascadeProviderId,
          title: "Cascade Event",
          slug: uid("cascade_et"),
          durationMinutes: 30,
          locationType: "in_person",
          requiresConfirmation: false,
          maxSeats: 1,
        })
        .returning();
      const cascadeEventTypeId = et!.id;

      // Confirm both rows exist before deletion.
      const beforeProvider = await db
        .select()
        .from(providers)
        .where(eq(providers.id, cascadeProviderId));
      expect(beforeProvider.length).toBe(1);

      const beforeEventType = await db
        .select()
        .from(eventTypes)
        .where(eq(eventTypes.id, cascadeEventTypeId));
      expect(beforeEventType.length).toBe(1);

      // Delete the provider — event type should cascade.
      await db.delete(providers).where(eq(providers.id, cascadeProviderId));

      // Event type must no longer exist.
      const afterEventType = await db
        .select()
        .from(eventTypes)
        .where(eq(eventTypes.id, cascadeEventTypeId));
      expect(afterEventType.length).toBe(0);
    });

    it("deletes a provider and cascades to their availability rules", async () => {
      const [p] = await db
        .insert(providers)
        .values({
          userId: uid("user_cascade_avail"),
          displayName: "Cascade Avail Provider",
          timezone: "UTC",
        })
        .returning();
      const cascadeProviderId = p!.id;

      const [rule] = await db
        .insert(availabilityRules)
        .values({
          providerId: cascadeProviderId,
          rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO",
          startTime: "09:00",
          endTime: "17:00",
          timezone: "UTC",
        })
        .returning();
      const ruleId = rule!.id;

      await db.delete(providers).where(eq(providers.id, cascadeProviderId));

      const afterRule = await db
        .select()
        .from(availabilityRules)
        .where(eq(availabilityRules.id, ruleId));

      expect(afterRule.length).toBe(0);
    });
  });

  // =========================================================================
  // 8. Booking status transitions — full lifecycle
  // =========================================================================
  describe("8. Booking status transitions", () => {
    let bookingId: string;
    let providerId: string;
    let eventTypeId: string;

    beforeAll(async () => {
      const [p] = await db
        .insert(providers)
        .values({
          userId: uid("user_status"),
          displayName: "Status Provider",
          timezone: "UTC",
        })
        .returning();
      providerId = p!.id;
      created.providerIds.push(providerId);

      const [et] = await db
        .insert(eventTypes)
        .values({
          providerId,
          title: "Status Test Event",
          slug: uid("status_et"),
          durationMinutes: 45,
          locationType: "phone",
          requiresConfirmation: true,
          maxSeats: 1,
        })
        .returning();
      eventTypeId = et!.id;
      created.eventTypeIds.push(eventTypeId);

      const [b] = await db
        .insert(bookings)
        .values({
          providerId,
          eventTypeId,
          customerEmail: "lifecycle@example.com",
          customerName: "Lifecycle Customer",
          startsAt: new Date("2026-08-01T11:00:00Z"),
          endsAt: new Date("2026-08-01T11:45:00Z"),
          status: "pending",
          source: "online",
        })
        .returning();
      bookingId = b!.id;
      created.bookingIds.push(bookingId);
    });

    it("booking starts as pending (requires_confirmation = true)", async () => {
      const [b] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId));
      expect(b!.status).toBe("pending");
    });

    it("transitions pending -> confirmed", async () => {
      await db
        .update(bookings)
        .set({ status: "confirmed" })
        .where(eq(bookings.id, bookingId));

      const [b] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId));
      expect(b!.status).toBe("confirmed");
    });

    it("transitions confirmed -> completed", async () => {
      await db
        .update(bookings)
        .set({ status: "completed" })
        .where(eq(bookings.id, bookingId));

      const [b] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId));
      expect(b!.status).toBe("completed");
    });

    it("can record a booking_event audit trail entry for the confirmed transition", async () => {
      const [event] = await db
        .insert(bookingEvents)
        .values({
          bookingId,
          eventType: "confirmed",
          actor: "test-runner",
          metadata: { note: "integration test confirmation" },
        })
        .returning();

      expect(event).toBeDefined();
      expect(event!.bookingId).toBe(bookingId);
      expect(event!.eventType).toBe("confirmed");
      expect(event!.actor).toBe("test-runner");

      created.bookingEventIds.push(event!.id);
    });

    it("can record a booking_event audit trail entry for the completed transition", async () => {
      const [event] = await db
        .insert(bookingEvents)
        .values({
          bookingId,
          eventType: "completed",
          actor: "system",
          metadata: {},
        })
        .returning();

      expect(event).toBeDefined();
      expect(event!.eventType).toBe("completed");

      created.bookingEventIds.push(event!.id);
    });

    it("retrieves the full audit trail for the booking in insertion order", async () => {
      const events = await db
        .select()
        .from(bookingEvents)
        .where(eq(bookingEvents.bookingId, bookingId));

      // At minimum the two events inserted above must be present.
      // The audit trigger (if applied) may add additional rows — we only
      // assert on the minimum expected set.
      const types = events.map((e) => e.eventType);
      expect(types).toContain("confirmed");
      expect(types).toContain("completed");
    });

    it("transitions booking to cancelled and back-to-back events are queryable", async () => {
      // Insert a fresh booking to test the cancellation branch without
      // interfering with the lifecycle tracking above.
      const [fresh] = await db
        .insert(bookings)
        .values({
          providerId,
          eventTypeId,
          customerEmail: "cancel_test@example.com",
          customerName: "Cancel Test Customer",
          startsAt: new Date("2026-08-02T15:00:00Z"),
          endsAt: new Date("2026-08-02T15:45:00Z"),
          status: "confirmed",
          source: "admin",
        })
        .returning();
      created.bookingIds.push(fresh!.id);

      await db
        .update(bookings)
        .set({ status: "cancelled" })
        .where(eq(bookings.id, fresh!.id));

      const [cancelled] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, fresh!.id));
      expect(cancelled!.status).toBe("cancelled");
    });

    it("transitions booking to no_show status", async () => {
      const [noShowBooking] = await db
        .insert(bookings)
        .values({
          providerId,
          eventTypeId,
          customerEmail: "noshow@example.com",
          customerName: "No Show Customer",
          startsAt: new Date("2026-08-03T10:00:00Z"),
          endsAt: new Date("2026-08-03T10:45:00Z"),
          status: "confirmed",
          source: "online",
        })
        .returning();
      created.bookingIds.push(noShowBooking!.id);

      await db
        .update(bookings)
        .set({ status: "no_show" })
        .where(eq(bookings.id, noShowBooking!.id));

      const [result] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, noShowBooking!.id));
      expect(result!.status).toBe("no_show");
    });
  });
});
