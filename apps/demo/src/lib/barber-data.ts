/**
 * Server-only in-memory booking store.
 * This file should only be imported from server actions / API routes.
 */
import type {
  AvailabilityRuleInput,
  AvailabilityOverrideInput,
  BookingInput,
} from "@slotkit/core";
import { BARBER_SHOP, SERVICES, type Service } from "./constants";

// ---------------------------------------------------------------------------
// Availability Rules — Mon-Sat, closed Sundays
// ---------------------------------------------------------------------------

export const AVAILABILITY_RULES: AvailabilityRuleInput[] = [
  {
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    startTime: "09:00",
    endTime: "19:00",
    timezone: BARBER_SHOP.timezone,
  },
  {
    rrule: "FREQ=WEEKLY;BYDAY=SA",
    startTime: "10:00",
    endTime: "17:00",
    timezone: BARBER_SHOP.timezone,
  },
];

// ---------------------------------------------------------------------------
// In-Memory Booking Store
// ---------------------------------------------------------------------------

export interface StoredBooking {
  id: string;
  service: Service;
  startsAt: Date;
  endsAt: Date;
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
  responses?: Record<string, string>;
  createdAt: Date;
}

function getNextWeekday(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while (d.getDay() === 0) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function makeET(day: Date, hour: number, minute: number): Date {
  const d = new Date(day);
  d.setUTCHours(hour + 5, minute, 0, 0); // EST offset (approximate)
  return d;
}

// Seed with realistic bookings
const tomorrow = getNextWeekday(1);
const dayAfter = getNextWeekday(2);
const day3 = getNextWeekday(3);

const bookingStore: StoredBooking[] = [
  {
    id: "demo-bk-001",
    service: SERVICES[0],
    startsAt: makeET(tomorrow, 9, 0),
    endsAt: makeET(tomorrow, 9, 30),
    status: "confirmed",
    customerName: "Alex Rivera",
    customerEmail: "alex@example.com",
    customerPhone: "(555) 111-2222",
    createdAt: new Date(Date.now() - 86400000),
  },
  {
    id: "demo-bk-002",
    service: SERVICES[2],
    startsAt: makeET(tomorrow, 10, 0),
    endsAt: makeET(tomorrow, 10, 45),
    status: "confirmed",
    customerName: "Jordan Lee",
    customerEmail: "jordan@example.com",
    responses: { style: "Fade", beard_length: "Short stubble" },
    createdAt: new Date(Date.now() - 72000000),
  },
  {
    id: "demo-bk-003",
    service: SERVICES[1],
    startsAt: makeET(tomorrow, 14, 0),
    endsAt: makeET(tomorrow, 14, 20),
    status: "pending",
    customerName: "Sam Patel",
    customerEmail: "sam@example.com",
    createdAt: new Date(Date.now() - 3600000),
  },
  {
    id: "demo-bk-004",
    service: SERVICES[3],
    startsAt: makeET(dayAfter, 11, 0),
    endsAt: makeET(dayAfter, 11, 30),
    status: "confirmed",
    customerName: "Casey Morgan",
    customerEmail: "casey@example.com",
    createdAt: new Date(Date.now() - 43200000),
  },
  {
    id: "demo-bk-005",
    service: SERVICES[0],
    startsAt: makeET(dayAfter, 15, 0),
    endsAt: makeET(dayAfter, 15, 30),
    status: "cancelled",
    customerName: "Taylor Kim",
    customerEmail: "taylor@example.com",
    createdAt: new Date(Date.now() - 172800000),
  },
  {
    id: "demo-bk-006",
    service: SERVICES[5],
    startsAt: makeET(day3, 13, 0),
    endsAt: makeET(day3, 14, 15),
    status: "confirmed",
    customerName: "Riley Chen",
    customerEmail: "riley@example.com",
    responses: { style: "Pompadour", allergies: "Sensitive to fragrances", first_visit: "Yes" },
    createdAt: new Date(Date.now() - 7200000),
  },
];

let bookingCounter = bookingStore.length;

export function addBooking(booking: Omit<StoredBooking, "id" | "createdAt">): StoredBooking {
  bookingCounter++;
  const newBooking: StoredBooking = {
    ...booking,
    id: `demo-bk-${String(bookingCounter).padStart(3, "0")}`,
    createdAt: new Date(),
  };
  bookingStore.push(newBooking);
  return newBooking;
}

export function getAllBookings(): StoredBooking[] {
  return [...bookingStore].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function updateBookingStatus(id: string, status: string): StoredBooking | null {
  const booking = bookingStore.find((b) => b.id === id);
  if (!booking) return null;
  booking.status = status;
  return { ...booking };
}

export function getBookingsAsInput(): BookingInput[] {
  return bookingStore.map((b) => ({
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    status: b.status,
  }));
}

export function getOverrides(): AvailabilityOverrideInput[] {
  return [];
}
