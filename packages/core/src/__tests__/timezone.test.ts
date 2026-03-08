import { describe, it, expect } from "vitest";
import {
  normalizeToUTC,
  utcToLocal,
  isValidTimezone,
  InvalidTimezoneError,
} from "../index.js";

describe("normalizeToUTC", () => {
  it("converts Eastern Time to UTC (standard time)", () => {
    // EST is UTC-5
    const result = normalizeToUTC("2026-01-15T10:00:00", "America/New_York");
    expect(result).toBe("2026-01-15T15:00:00.000Z");
  });

  it("converts Eastern Time to UTC (daylight saving time)", () => {
    // EDT is UTC-4
    const result = normalizeToUTC("2026-06-15T10:00:00", "America/New_York");
    expect(result).toBe("2026-06-15T14:00:00.000Z");
  });

  it("converts Pacific Time to UTC", () => {
    // PST is UTC-8
    const result = normalizeToUTC("2026-01-15T09:00:00", "America/Los_Angeles");
    expect(result).toBe("2026-01-15T17:00:00.000Z");
  });

  it("converts Tokyo time to UTC (no DST)", () => {
    // JST is UTC+9
    const result = normalizeToUTC("2026-03-15T10:00:00", "Asia/Tokyo");
    expect(result).toBe("2026-03-15T01:00:00.000Z");
  });

  it("converts London time to UTC (GMT)", () => {
    const result = normalizeToUTC("2026-01-15T12:00:00", "Europe/London");
    expect(result).toBe("2026-01-15T12:00:00.000Z");
  });

  it("converts London time to UTC (BST)", () => {
    // BST is UTC+1
    const result = normalizeToUTC("2026-06-15T12:00:00", "Europe/London");
    expect(result).toBe("2026-06-15T11:00:00.000Z");
  });

  it("converts Sydney time to UTC (AEST)", () => {
    // AEST is UTC+10
    const result = normalizeToUTC("2026-06-15T10:00:00", "Australia/Sydney");
    expect(result).toBe("2026-06-15T00:00:00.000Z");
  });

  it("converts Sydney time to UTC (AEDT)", () => {
    // AEDT is UTC+11
    const result = normalizeToUTC("2026-01-15T10:00:00", "Australia/Sydney");
    expect(result).toBe("2026-01-14T23:00:00.000Z");
  });

  it("throws InvalidTimezoneError for invalid timezone", () => {
    expect(() => normalizeToUTC("2026-01-15T10:00:00", "Invalid/Zone")).toThrow(
      InvalidTimezoneError,
    );
  });

  it("handles UTC timezone", () => {
    const result = normalizeToUTC("2026-03-15T10:00:00", "UTC");
    expect(result).toBe("2026-03-15T10:00:00.000Z");
  });
});

describe("utcToLocal", () => {
  it("converts UTC to Eastern Time", () => {
    const result = utcToLocal("2026-01-15T15:00:00.000Z", "America/New_York");
    expect(result).toBe("2026-01-15T10:00:00");
  });

  it("converts UTC to Pacific Time", () => {
    const result = utcToLocal("2026-01-15T17:00:00.000Z", "America/Los_Angeles");
    expect(result).toBe("2026-01-15T09:00:00");
  });

  it("converts UTC to Tokyo time", () => {
    const result = utcToLocal("2026-03-15T01:00:00.000Z", "Asia/Tokyo");
    expect(result).toBe("2026-03-15T10:00:00");
  });

  it("throws InvalidTimezoneError for invalid timezone", () => {
    expect(() => utcToLocal("2026-01-15T15:00:00.000Z", "Fake/TZ")).toThrow(
      InvalidTimezoneError,
    );
  });
});

describe("isValidTimezone", () => {
  it("returns true for valid timezones", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Europe/London")).toBe(true);
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
  });

  it("returns false for invalid timezones", () => {
    expect(isValidTimezone("Invalid/Zone")).toBe(false);
    expect(isValidTimezone("Not_A_TZ")).toBe(false);
  });
});

describe("UTC roundtrip", () => {
  const timezones = [
    "America/New_York",
    "America/Los_Angeles",
    "Europe/London",
    "Asia/Tokyo",
    "Australia/Sydney",
    "UTC",
  ];

  it("roundtrips UTC → local → UTC for multiple timezones", () => {
    const utcTime = "2026-06-15T12:00:00.000Z";

    for (const tz of timezones) {
      const local = utcToLocal(utcTime, tz);
      const backToUtc = normalizeToUTC(local, tz);
      expect(backToUtc).toBe(utcTime);
    }
  });
});
