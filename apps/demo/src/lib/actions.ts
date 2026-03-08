"use server";

import {
  getAvailableSlots,
  isSlotAvailable,
  generateEmbedSnippet,
  generateAllSnippets,
  type Slot,
  type AvailabilityOverrideInput,
} from "@slotkit/core";
import {
  AVAILABILITY_RULES,
  addBooking,
  getAllBookings,
  updateBookingStatus,
  getBookingsAsInput,
  getOverrides,
  type StoredBooking,
} from "./barber-data";
import { SERVICES, BARBER_SHOP } from "./constants";

// ---------------------------------------------------------------------------
// Customer Actions
// ---------------------------------------------------------------------------

export async function fetchSlots(
  serviceSlug: string,
  startISO: string,
  endISO: string,
  customerTimezone: string,
): Promise<Slot[]> {
  const service = SERVICES.find((s) => s.slug === serviceSlug);
  if (!service) return [];

  return getAvailableSlots(
    AVAILABILITY_RULES,
    getOverrides(),
    getBookingsAsInput(),
    { start: new Date(startISO), end: new Date(endISO) },
    customerTimezone,
    {
      duration: service.duration,
      bufferBefore: 5,
      bufferAfter: 5,
    },
  );
}

export interface BookingResult {
  success: boolean;
  bookingId?: string;
  error?: string;
}

export async function createBooking(
  serviceSlug: string,
  startISO: string,
  endISO: string,
  customerName: string,
  customerEmail: string,
  customerPhone?: string,
  notes?: string,
  responses?: Record<string, string>,
): Promise<BookingResult> {
  const service = SERVICES.find((s) => s.slug === serviceSlug);
  if (!service) return { success: false, error: "Service not found" };

  const startTime = new Date(startISO);
  const endTime = new Date(endISO);

  const availability = isSlotAvailable(
    AVAILABILITY_RULES,
    getOverrides(),
    getBookingsAsInput(),
    startTime,
    endTime,
    5,
    5,
  );

  if (!availability.available) {
    const reasons: Record<string, string> = {
      outside_availability: "This time is outside business hours.",
      already_booked: "This slot was just booked by someone else.",
      buffer_conflict: "This slot is too close to another appointment.",
      blocked_date: "This date is blocked.",
    };
    return { success: false, error: reasons[availability.reason ?? ""] ?? "Slot not available" };
  }

  const booking = addBooking({
    service,
    startsAt: startTime,
    endsAt: endTime,
    status: "confirmed",
    customerName,
    customerEmail,
    customerPhone,
    notes,
    responses,
  });

  return { success: true, bookingId: booking.id };
}

// ---------------------------------------------------------------------------
// Admin Actions
// ---------------------------------------------------------------------------

export interface SerializedBooking {
  id: string;
  serviceTitle: string;
  serviceSlug: string;
  duration: number;
  startsAt: string;
  endsAt: string;
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
  responses?: Record<string, string>;
  createdAt: string;
}

function serializeBooking(b: StoredBooking): SerializedBooking {
  return {
    id: b.id,
    serviceTitle: b.service.title,
    serviceSlug: b.service.slug,
    duration: b.service.duration,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    status: b.status,
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    customerPhone: b.customerPhone,
    notes: b.notes,
    responses: b.responses,
    createdAt: b.createdAt.toISOString(),
  };
}

export async function fetchBookings(): Promise<SerializedBooking[]> {
  return getAllBookings().map(serializeBooking);
}

export async function changeBookingStatus(
  id: string,
  status: string,
): Promise<{ success: boolean; error?: string }> {
  const validTransitions: Record<string, string[]> = {
    pending: ["confirmed", "rejected", "cancelled"],
    confirmed: ["completed", "cancelled", "no_show"],
    completed: [],
    cancelled: [],
    rejected: [],
    no_show: [],
  };

  const bookings = getAllBookings();
  const booking = bookings.find((b) => b.id === id);
  if (!booking) return { success: false, error: "Booking not found" };

  const allowed = validTransitions[booking.status] ?? [];
  if (!allowed.includes(status)) {
    return { success: false, error: `Cannot transition from "${booking.status}" to "${status}"` };
  }

  updateBookingStatus(id, status);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Feature Showcase Actions
// ---------------------------------------------------------------------------

export async function fetchSlotsComparison(
  dateISO: string,
  durations: number[],
  timezone: string,
): Promise<{ duration: number; slots: Slot[]; count: number }[]> {
  const dayStart = new Date(dateISO);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dateISO);
  dayEnd.setUTCHours(23, 59, 59, 999);

  return durations.map((duration) => {
    const slots = getAvailableSlots(
      AVAILABILITY_RULES,
      getOverrides(),
      getBookingsAsInput(),
      { start: dayStart, end: dayEnd },
      timezone,
      { duration, bufferBefore: 0, bufferAfter: 0 },
    );
    return { duration, slots, count: slots.length };
  });
}

export async function fetchBufferComparison(
  dateISO: string,
  timezone: string,
): Promise<{
  noBuffer: { slots: Slot[]; count: number };
  withBuffer: { slots: Slot[]; count: number };
}> {
  const dayStart = new Date(dateISO);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dateISO);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const noBuffer = getAvailableSlots(
    AVAILABILITY_RULES,
    getOverrides(),
    getBookingsAsInput(),
    { start: dayStart, end: dayEnd },
    timezone,
    { duration: 30, bufferBefore: 0, bufferAfter: 0 },
  );

  const withBuffer = getAvailableSlots(
    AVAILABILITY_RULES,
    getOverrides(),
    getBookingsAsInput(),
    { start: dayStart, end: dayEnd },
    timezone,
    { duration: 30, bufferBefore: 15, bufferAfter: 15 },
  );

  return {
    noBuffer: { slots: noBuffer, count: noBuffer.length },
    withBuffer: { slots: withBuffer, count: withBuffer.length },
  };
}

export async function fetchTimezoneComparison(
  dateISO: string,
  timezones: string[],
): Promise<{ timezone: string; slots: Slot[]; count: number }[]> {
  const dayStart = new Date(dateISO);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dateISO);
  dayEnd.setUTCHours(23, 59, 59, 999);

  return timezones.map((tz) => {
    const slots = getAvailableSlots(
      AVAILABILITY_RULES,
      getOverrides(),
      [],
      { start: dayStart, end: dayEnd },
      tz,
      { duration: 30 },
    );
    return { timezone: tz, slots, count: slots.length };
  });
}

export async function fetchOverrideDemo(
  dateISO: string,
  timezone: string,
): Promise<{
  normal: { slots: Slot[]; count: number };
  blocked: { slots: Slot[]; count: number };
  custom: { slots: Slot[]; count: number };
}> {
  const dayStart = new Date(dateISO);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dateISO);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const opts = { duration: 30 as const };

  const normal = getAvailableSlots(
    AVAILABILITY_RULES, [], [], { start: dayStart, end: dayEnd }, timezone, opts,
  );

  const blockedOverride: AvailabilityOverrideInput[] = [
    { date: dayStart, isUnavailable: true },
  ];
  const blocked = getAvailableSlots(
    AVAILABILITY_RULES, blockedOverride, [], { start: dayStart, end: dayEnd }, timezone, opts,
  );

  const customOverride: AvailabilityOverrideInput[] = [
    { date: dayStart, startTime: "12:00", endTime: "15:00", isUnavailable: false },
  ];
  const custom = getAvailableSlots(
    AVAILABILITY_RULES, customOverride, [], { start: dayStart, end: dayEnd }, timezone, opts,
  );

  return {
    normal: { slots: normal, count: normal.length },
    blocked: { slots: blocked, count: blocked.length },
    custom: { slots: custom, count: custom.length },
  };
}

export async function fetchEmbedSnippets(): Promise<
  { mode: string; description: string; html: string }[]
> {
  return generateAllSnippets({
    providerId: "fade-and-shave",
    eventTypeSlug: "haircut",
    baseUrl: "https://booking.fadeandshave.com",
    branding: { primaryColor: "#e94560" },
  });
}
