/**
 * Seed script for the demo's Docker Postgres database.
 *
 * Inserts the Fade & Shave barbershop data into real database tables
 * so e2e tests can run against the full stack.
 *
 * Usage: DATABASE_URL=... npx tsx apps/demo/src/lib/seed.ts
 */

import { createDb } from "@thebookingkit/db";
import { providers, eventTypes, availabilityRules, bookings } from "@thebookingkit/db";
import { SERVICES, BARBER_SHOP } from "./constants";

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const db = createDb(url);

  console.log("[demo-seed] Checking for existing data...");
  const existing = await db.select().from(providers).limit(1);
  if (existing.length > 0) {
    console.log("[demo-seed] Data already exists, skipping.");
    process.exit(0);
  }

  // --- Create Provider ---
  console.log("[demo-seed] Creating Fade & Shave provider...");
  const [provider] = await db
    .insert(providers)
    .values({
      userId: "demo_fade_and_shave",
      displayName: BARBER_SHOP.name,
      email: "demo@fadeandshave.com",
      timezone: BARBER_SHOP.timezone,
    })
    .returning();

  // --- Create Event Types ---
  console.log("[demo-seed] Creating event types...");
  const eventTypeIds: Record<string, string> = {};
  for (const svc of SERVICES) {
    const [et] = await db
      .insert(eventTypes)
      .values({
        providerId: provider.id,
        title: svc.title,
        slug: svc.slug,
        durationMinutes: svc.duration,
        description: svc.description,
        priceCents: Math.round(svc.price * 100),
        isActive: true,
      })
      .returning();
    eventTypeIds[svc.slug] = et.id;
  }

  // --- Create Availability Rules ---
  console.log("[demo-seed] Creating availability rules...");
  await db.insert(availabilityRules).values([
    {
      providerId: provider.id,
      rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      startTime: "09:00",
      endTime: "19:00",
      timezone: BARBER_SHOP.timezone,
    },
    {
      providerId: provider.id,
      rrule: "FREQ=WEEKLY;BYDAY=SA",
      startTime: "10:00",
      endTime: "17:00",
      timezone: BARBER_SHOP.timezone,
    },
  ]);

  // --- Create Seed Bookings ---
  console.log("[demo-seed] Creating seed bookings...");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Skip to next weekday
  while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
    tomorrow.setDate(tomorrow.getDate() + 1);
  }

  const makeTime = (base: Date, hour: number, min: number) => {
    const d = new Date(base);
    d.setHours(hour, min, 0, 0);
    return d;
  };

  await db.insert(bookings).values([
    {
      eventTypeId: eventTypeIds[SERVICES[0].slug],
      providerId: provider.id,
      startsAt: makeTime(tomorrow, 9, 0),
      endsAt: makeTime(tomorrow, 9, 30),
      status: "confirmed",
      customerName: "Alex Rivera",
      customerEmail: "alex@example.com",
      customerPhone: "(555) 111-2222",
    },
    {
      eventTypeId: eventTypeIds[SERVICES[2].slug],
      providerId: provider.id,
      startsAt: makeTime(tomorrow, 10, 0),
      endsAt: makeTime(tomorrow, 10, 45),
      status: "confirmed",
      customerName: "Jordan Lee",
      customerEmail: "jordan@example.com",
    },
    {
      eventTypeId: eventTypeIds[SERVICES[1].slug],
      providerId: provider.id,
      startsAt: makeTime(tomorrow, 14, 0),
      endsAt: makeTime(tomorrow, 14, 20),
      status: "pending",
      customerName: "Sam Patel",
      customerEmail: "sam@example.com",
    },
  ]);

  console.log("[demo-seed] Done. Seeded provider, event types, rules, and bookings.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("[demo-seed] Failed:", err);
  process.exit(1);
});
