/**
 * Data access layer for the demo app.
 *
 * When DATABASE_URL is set, reads from real Postgres via @thebookingkit/db.
 * Otherwise falls back to in-memory mock data.
 *
 * This dual-mode approach lets the demo work both as a static marketing site
 * (mock data, no DB required) and as a full-stack e2e test target (Docker Postgres).
 */
import type {
  AvailabilityRuleInput,
  AvailabilityOverrideInput,
  BookingInput,
} from "@thebookingkit/core";
import { getDb } from "./db";
import {
  AVAILABILITY_RULES,
  addBooking as addMockBooking,
  getAllBookings as getMockBookings,
  updateBookingStatus as updateMockStatus,
  getBookingsAsInput as getMockBookingsAsInput,
  getOverrides as getMockOverrides,
  type StoredBooking,
} from "./barber-data";

// Re-export the type
export type { StoredBooking };

/** Get availability rules — from DB or mock */
export async function getAvailabilityRules(): Promise<AvailabilityRuleInput[]> {
  const db = getDb();
  if (!db) return AVAILABILITY_RULES;

  const schema = await import("@thebookingkit/db");
  const rows = await db.select().from(schema.availabilityRules);

  return rows.map((r: { rrule: string; startTime: string; endTime: string; timezone: string | null }) => ({
    rrule: r.rrule,
    startTime: r.startTime,
    endTime: r.endTime,
    timezone: r.timezone ?? "America/New_York",
  }));
}

/** Get overrides — from DB or mock */
export async function getOverrides(): Promise<AvailabilityOverrideInput[]> {
  const db = getDb();
  if (!db) return getMockOverrides();

  const schema = await import("@thebookingkit/db");
  const rows = await db.select().from(schema.availabilityOverrides);

  return rows.map((r: { date: Date; startTime: string | null; endTime: string | null; isUnavailable: boolean }) => ({
    date: r.date,
    startTime: r.startTime ?? undefined,
    endTime: r.endTime ?? undefined,
    isUnavailable: r.isUnavailable,
  }));
}

/** Get bookings as core input — from DB or mock */
export async function getBookingsAsInput(): Promise<BookingInput[]> {
  const db = getDb();
  if (!db) return getMockBookingsAsInput();

  const schema = await import("@thebookingkit/db");
  const rows = await db.select().from(schema.bookings);

  return rows.map((r: { startsAt: Date; endsAt: Date; status: string }) => ({
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    status: r.status as BookingInput["status"],
  }));
}

/** Get all bookings (full objects) — from DB or mock */
export async function getAllBookings(): Promise<StoredBooking[]> {
  const db = getDb();
  if (!db) return getMockBookings();

  const schema = await import("@thebookingkit/db");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select().from(schema.bookings);

  const result: StoredBooking[] = [];
  for (const r of rows) {
    let service = { slug: "unknown", title: "Unknown", duration: 30, description: "", price: 0, icon: "scissors", questions: [] as never[] };
    if (r.eventTypeId) {
      const [et] = await db.select().from(schema.eventTypes).where(eq(schema.eventTypes.id, r.eventTypeId)).limit(1);
      if (et) {
        service = {
          slug: et.slug,
          title: et.title,
          duration: et.durationMinutes,
          description: et.description ?? "",
          price: (et.priceCents ?? 0) / 100,
          icon: "scissors",
          questions: [],
        };
      }
    }

    result.push({
      id: r.id,
      service,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      status: r.status,
      customerName: r.customerName ?? "Unknown",
      customerEmail: r.customerEmail ?? "",
      customerPhone: r.customerPhone ?? undefined,
      notes: (r.metadata as Record<string, unknown>)?.notes as string | undefined,
      createdAt: r.createdAt,
    });
  }

  return result.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Add a booking — to DB or mock store */
export async function addBooking(
  booking: Omit<StoredBooking, "id" | "createdAt">,
): Promise<StoredBooking> {
  const db = getDb();
  if (!db) return addMockBooking(booking);

  const schema = await import("@thebookingkit/db");
  const { eq } = await import("drizzle-orm");

  const [et] = await db
    .select()
    .from(schema.eventTypes)
    .where(eq(schema.eventTypes.slug, booking.service.slug))
    .limit(1);

  if (!et) return addMockBooking(booking); // No matching event type in DB — fall back to mock

  const [row] = await db
    .insert(schema.bookings)
    .values({
      eventTypeId: et.id,
      providerId: et.providerId!,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status as "pending" | "confirmed",
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone ?? null,
      metadata: booking.notes ? { notes: booking.notes } : {},
    })
    .returning();

  return {
    id: row.id,
    service: booking.service,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    customerName: row.customerName ?? booking.customerName,
    customerEmail: row.customerEmail ?? booking.customerEmail,
    customerPhone: row.customerPhone ?? undefined,
    notes: (row.metadata as Record<string, unknown>)?.notes as string | undefined,
    createdAt: row.createdAt,
  };
}

/** Update booking status — in DB or mock store */
export async function updateBookingStatus(
  id: string,
  status: string,
): Promise<StoredBooking | null> {
  const db = getDb();
  if (!db) return updateMockStatus(id, status);

  const schema = await import("@thebookingkit/db");
  const { eq } = await import("drizzle-orm");

  const [updated] = await db
    .update(schema.bookings)
    .set({ status: status as "pending" | "confirmed" | "cancelled" | "rescheduled" | "completed" | "no_show" | "rejected" })
    .where(eq(schema.bookings.id, id))
    .returning();

  if (!updated) return null;

  return {
    id: updated.id,
    service: { slug: "unknown", title: "Unknown", duration: 30, description: "", price: 0, icon: "scissors", questions: [] as never[] },
    startsAt: updated.startsAt,
    endsAt: updated.endsAt,
    status: updated.status,
    customerName: updated.customerName ?? "Unknown",
    customerEmail: updated.customerEmail ?? "",
    createdAt: updated.createdAt,
  };
}
