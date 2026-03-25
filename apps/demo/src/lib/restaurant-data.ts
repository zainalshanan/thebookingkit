/**
 * Server-only in-memory restaurant resource store.
 * This file should only be imported from server actions / API routes.
 */
import type {
  ResourceInput,
  AvailabilityRuleInput,
  BookingInput,
} from "@thebookingkit/core";
import { getNextServiceDay, makeET } from "./demo-utils";

// ---------------------------------------------------------------------------
// Restaurant constants
// ---------------------------------------------------------------------------

export const RESTAURANT = {
  name: "Olive & Vine Bistro",
  tagline: "Modern Mediterranean cuisine",
  timezone: "America/New_York",
  location: "47 Bleecker Street, New York, NY 10012",
};

// ---------------------------------------------------------------------------
// Availability rules — Mon-Sat, closed Sundays
// Lunch: 11:30-14:00, Dinner: 17:30-22:00
// ---------------------------------------------------------------------------

const LUNCH_RULE: AvailabilityRuleInput = {
  rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA",
  startTime: "11:30",
  endTime: "14:00",
  timezone: RESTAURANT.timezone,
};

const DINNER_RULE: AvailabilityRuleInput = {
  rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA",
  startTime: "17:30",
  endTime: "22:00",
  timezone: RESTAURANT.timezone,
};

const TABLE_RULES: AvailabilityRuleInput[] = [LUNCH_RULE, DINNER_RULE];

// ---------------------------------------------------------------------------
// Seed bookings helpers
// ---------------------------------------------------------------------------

const tomorrow = getNextServiceDay(1);
const dayAfter = getNextServiceDay(2);
const day3 = getNextServiceDay(3);

// ---------------------------------------------------------------------------
// Resource pool: 8× 2-top, 5× 4-top, 2× 8-top
// ---------------------------------------------------------------------------

function makeTableBookings(tableId: string): BookingInput[] {
  const bookingMap: Record<string, BookingInput[]> = {
    // 2-tops: a few at lunch, some at dinner
    "t2-01": [
      {
        startsAt: makeET(tomorrow, 12, 0),
        endsAt: makeET(tomorrow, 13, 30),
        status: "confirmed",
        resourceId: "t2-01",
        guestCount: 2,
      },
    ],
    "t2-02": [
      {
        startsAt: makeET(tomorrow, 13, 0),
        endsAt: makeET(tomorrow, 14, 0),
        status: "confirmed",
        resourceId: "t2-02",
        guestCount: 2,
      },
      {
        startsAt: makeET(tomorrow, 19, 0),
        endsAt: makeET(tomorrow, 20, 30),
        status: "confirmed",
        resourceId: "t2-02",
        guestCount: 2,
      },
    ],
    "t2-03": [
      {
        startsAt: makeET(dayAfter, 18, 0),
        endsAt: makeET(dayAfter, 19, 30),
        status: "confirmed",
        resourceId: "t2-03",
        guestCount: 2,
      },
    ],
    "t2-04": [],
    "t2-05": [
      {
        startsAt: makeET(tomorrow, 20, 0),
        endsAt: makeET(tomorrow, 21, 30),
        status: "confirmed",
        resourceId: "t2-05",
        guestCount: 2,
      },
    ],
    "t2-06": [],
    "t2-07": [
      {
        startsAt: makeET(day3, 11, 30),
        endsAt: makeET(day3, 13, 0),
        status: "confirmed",
        resourceId: "t2-07",
        guestCount: 2,
      },
    ],
    "t2-08": [],
    // 4-tops
    "t4-01": [
      {
        startsAt: makeET(tomorrow, 19, 30),
        endsAt: makeET(tomorrow, 21, 0),
        status: "confirmed",
        resourceId: "t4-01",
        guestCount: 4,
      },
    ],
    "t4-02": [
      {
        startsAt: makeET(tomorrow, 12, 30),
        endsAt: makeET(tomorrow, 14, 0),
        status: "confirmed",
        resourceId: "t4-02",
        guestCount: 3,
      },
    ],
    "t4-03": [],
    "t4-04": [
      {
        startsAt: makeET(dayAfter, 20, 0),
        endsAt: makeET(dayAfter, 21, 30),
        status: "confirmed",
        resourceId: "t4-04",
        guestCount: 4,
      },
    ],
    "t4-05": [],
    // 8-tops
    "t8-01": [
      {
        startsAt: makeET(tomorrow, 19, 0),
        endsAt: makeET(tomorrow, 21, 0),
        status: "confirmed",
        resourceId: "t8-01",
        guestCount: 7,
      },
    ],
    "t8-02": [],
  };

  return bookingMap[tableId] ?? [];
}

// Build the full resource pool
const RESOURCE_POOL: ResourceInput[] = [
  // 8× 2-top tables
  ...Array.from({ length: 8 }, (_, i) => {
    const id = `t2-0${i + 1}`;
    return {
      id,
      name: `Table ${i + 1} (2-top)`,
      type: "2-top",
      capacity: 2,
      isActive: true,
      rules: TABLE_RULES,
      overrides: [],
      bookings: makeTableBookings(id),
    } satisfies ResourceInput;
  }),
  // 5× 4-top tables
  ...Array.from({ length: 5 }, (_, i) => {
    const id = `t4-0${i + 1}`;
    return {
      id,
      name: `Table ${i + 9} (4-top)`,
      type: "4-top",
      capacity: 4,
      isActive: true,
      rules: TABLE_RULES,
      overrides: [],
      bookings: makeTableBookings(id),
    } satisfies ResourceInput;
  }),
  // 2× 8-top tables
  ...Array.from({ length: 2 }, (_, i) => {
    const id = `t8-0${i + 1}`;
    return {
      id,
      name: `Table ${i + 14} (8-top)`,
      type: "8-top",
      capacity: 8,
      isActive: true,
      rules: TABLE_RULES,
      overrides: [],
      bookings: makeTableBookings(id),
    } satisfies ResourceInput;
  }),
];

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/**
 * Return the full restaurant resource pool (all 15 tables).
 * Returns a shallow copy to prevent mutation of the module-level array.
 */
export function getResourcePool(): ResourceInput[] {
  return [...RESOURCE_POOL];
}

/**
 * Return all bookings across the resource pool as flat `BookingInput[]`.
 * Used by `getResourcePoolSummary` which needs a unified booking list.
 */
export function getRestaurantBookingsAsInput(): BookingInput[] {
  return RESOURCE_POOL.flatMap((r) => r.bookings);
}

/**
 * Return per-table booking counts for `round_robin` strategy.
 */
export function getResourceBookingCounts(): { resourceId: string; bookingCount: number }[] {
  return RESOURCE_POOL.map((r) => ({
    resourceId: r.id,
    bookingCount: r.bookings.filter(
      (b) => b.status !== "cancelled" && b.status !== "rejected",
    ).length,
  }));
}
