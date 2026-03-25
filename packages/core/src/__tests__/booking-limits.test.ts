import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeBookingLimits,
  filterSlotsByLimits,
  type BookingInput,
  type BookingLimitsConfig,
} from "../index.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-02T12:00:00Z")); // Monday noon
});

const makeBooking = (
  date: string,
  status: BookingInput["status"] = "confirmed",
): BookingInput => ({
  startsAt: new Date(`${date}T15:00:00Z`),
  endsAt: new Date(`${date}T15:30:00Z`),
  status,
});

describe("computeBookingLimits", () => {
  it("returns unlimited when no limits are set", () => {
    const result = computeBookingLimits([], {}, new Date("2026-03-02"));

    expect(result.canBook).toBe(true);
    expect(result.dailyLimit).toBeNull();
    expect(result.weeklyLimit).toBeNull();
    expect(result.dailyRemaining).toBeNull();
    expect(result.weeklyRemaining).toBeNull();
  });

  it("counts daily bookings correctly", () => {
    const bookings = [
      makeBooking("2026-03-02"),
      makeBooking("2026-03-02"),
      makeBooking("2026-03-03"),
    ];

    const result = computeBookingLimits(
      bookings,
      { maxBookingsPerDay: 3 },
      new Date("2026-03-02"),
    );

    expect(result.dailyCount).toBe(2);
    expect(result.dailyRemaining).toBe(1);
    expect(result.canBook).toBe(true);
  });

  it("blocks booking when daily limit reached", () => {
    const bookings = [
      makeBooking("2026-03-02"),
      makeBooking("2026-03-02"),
      makeBooking("2026-03-02"),
    ];

    const result = computeBookingLimits(
      bookings,
      { maxBookingsPerDay: 3 },
      new Date("2026-03-02"),
    );

    expect(result.canBook).toBe(false);
    expect(result.dailyRemaining).toBe(0);
  });

  it("ignores cancelled bookings in count", () => {
    const bookings = [
      makeBooking("2026-03-02", "confirmed"),
      makeBooking("2026-03-02", "cancelled"),
    ];

    const result = computeBookingLimits(
      bookings,
      { maxBookingsPerDay: 2 },
      new Date("2026-03-02"),
    );

    expect(result.dailyCount).toBe(1);
    expect(result.canBook).toBe(true);
  });

  it("checks weekly limits", () => {
    const bookings = [
      makeBooking("2026-03-02"),
      makeBooking("2026-03-03"),
      makeBooking("2026-03-04"),
      makeBooking("2026-03-05"),
      makeBooking("2026-03-06"),
    ];

    const result = computeBookingLimits(
      bookings,
      { maxBookingsPerWeek: 5 },
      new Date("2026-03-06"),
    );

    expect(result.weeklyCount).toBe(5);
    expect(result.canBook).toBe(false);
  });
});

describe("filterSlotsByLimits", () => {
  const makeSlot = (dateStr: string) => ({
    start: new Date(`${dateStr}T15:00:00Z`),
    end: new Date(`${dateStr}T15:30:00Z`),
  });

  it("removes slots within minimum notice period", () => {
    // Now is 2026-03-02T12:00:00Z, min notice = 120 min
    const slots = [
      makeSlot("2026-03-02"), // 15:00 UTC = 3 hours from now — should pass
      { start: new Date("2026-03-02T13:00:00Z"), end: new Date("2026-03-02T13:30:00Z") }, // 1 hour from now — blocked
    ];

    const filtered = filterSlotsByLimits(
      slots,
      [],
      { minNoticeMinutes: 120 },
      new Date("2026-03-02T12:00:00Z"),
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].start).toEqual(new Date("2026-03-02T15:00:00Z"));
  });

  it("removes slots beyond max future days", () => {
    const slots = [
      makeSlot("2026-03-03"), // Tomorrow — OK
      makeSlot("2026-06-01"), // 3 months out — blocked if maxFutureDays=30
    ];

    const filtered = filterSlotsByLimits(
      slots,
      [],
      { maxFutureDays: 30 },
      new Date("2026-03-02T12:00:00Z"),
    );

    expect(filtered).toHaveLength(1);
  });

  it("removes slots on days that have reached the daily limit", () => {
    const existingBookings = [
      makeBooking("2026-03-03"),
      makeBooking("2026-03-03"),
    ];

    const slots = [
      makeSlot("2026-03-03"), // 2 existing + this would be 3
      makeSlot("2026-03-04"), // No existing bookings
    ];

    const filtered = filterSlotsByLimits(
      slots,
      existingBookings,
      { maxBookingsPerDay: 2 },
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].start.toISOString()).toContain("2026-03-04");
  });
});
