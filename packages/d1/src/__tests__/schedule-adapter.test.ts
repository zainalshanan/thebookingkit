import { describe, it, expect } from "vitest";
import {
  weeklyScheduleToRules,
  intersectSchedulesToRules,
  type WeeklySchedule,
} from "../schedule-adapter.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fullWeek: WeeklySchedule = {
  monday:    { startTime: "09:00", endTime: "17:00", isOff: false },
  tuesday:   { startTime: "09:00", endTime: "17:00", isOff: false },
  wednesday: { startTime: "09:00", endTime: "17:00", isOff: false },
  thursday:  { startTime: "09:00", endTime: "17:00", isOff: false },
  friday:    { startTime: "09:00", endTime: "17:00", isOff: false },
  saturday:  { startTime: "10:00", endTime: "14:00", isOff: false },
  sunday:    { startTime: null,    endTime: null,     isOff: true  },
};

const locationSchedule: WeeklySchedule = {
  monday:    { startTime: "08:00", endTime: "20:00", isOff: false },
  tuesday:   { startTime: "08:00", endTime: "20:00", isOff: false },
  wednesday: { startTime: "08:00", endTime: "20:00", isOff: false },
  thursday:  { startTime: "08:00", endTime: "20:00", isOff: false },
  friday:    { startTime: "08:00", endTime: "20:00", isOff: false },
  saturday:  { startTime: "10:00", endTime: "18:00", isOff: false },
  sunday:    { startTime: null,    endTime: null,     isOff: true  },
};

// ---------------------------------------------------------------------------
// weeklyScheduleToRules()
// ---------------------------------------------------------------------------

describe("weeklyScheduleToRules()", () => {
  it("returns empty array for null schedule", () => {
    expect(weeklyScheduleToRules(null, "Australia/Sydney")).toEqual([]);
  });

  it("returns empty array for undefined schedule", () => {
    expect(weeklyScheduleToRules(undefined, "Australia/Sydney")).toEqual([]);
  });

  it("generates a rule for Mon–Fri with identical hours (groups into one RRULE)", () => {
    const rules = weeklyScheduleToRules(fullWeek, "Australia/Sydney");

    const weekdayRule = rules.find((r) => r.startTime === "09:00" && r.endTime === "17:00");
    expect(weekdayRule).toBeDefined();
    expect(weekdayRule!.rrule).toContain("FREQ=WEEKLY");
    expect(weekdayRule!.rrule).toContain("BYDAY=");
    // Should contain all 5 weekday abbreviations
    expect(weekdayRule!.rrule).toContain("MO");
    expect(weekdayRule!.rrule).toContain("TU");
    expect(weekdayRule!.rrule).toContain("WE");
    expect(weekdayRule!.rrule).toContain("TH");
    expect(weekdayRule!.rrule).toContain("FR");
    // Should NOT contain Saturday or Sunday
    expect(weekdayRule!.rrule).not.toContain("SA");
    expect(weekdayRule!.rrule).not.toContain("SU");
  });

  it("generates a separate rule for Saturday with different hours", () => {
    const rules = weeklyScheduleToRules(fullWeek, "Australia/Sydney");

    const satRule = rules.find((r) => r.startTime === "10:00" && r.endTime === "14:00");
    expect(satRule).toBeDefined();
    expect(satRule!.rrule).toContain("SA");
  });

  it("does not generate a rule for days where isOff is true", () => {
    const rules = weeklyScheduleToRules(fullWeek, "Australia/Sydney");

    // Sunday is isOff: true — no rule should reference SU
    const allRuleStrings = rules.map((r) => r.rrule).join(" ");
    const weekdayRuleStrings = rules
      .filter((r) => r.startTime !== "10:00") // exclude Saturday rule
      .map((r) => r.rrule)
      .join(" ");
    expect(weekdayRuleStrings).not.toContain("SU");
  });

  it("sets the correct timezone on all rules", () => {
    const rules = weeklyScheduleToRules(fullWeek, "Australia/Sydney");
    for (const rule of rules) {
      expect(rule.timezone).toBe("Australia/Sydney");
    }
  });

  it("returns empty array when all days are off", () => {
    const allOff: WeeklySchedule = {
      monday:    { startTime: null, endTime: null, isOff: true },
      tuesday:   { startTime: null, endTime: null, isOff: true },
      wednesday: { startTime: null, endTime: null, isOff: true },
      thursday:  { startTime: null, endTime: null, isOff: true },
      friday:    { startTime: null, endTime: null, isOff: true },
      saturday:  { startTime: null, endTime: null, isOff: true },
      sunday:    { startTime: null, endTime: null, isOff: true },
    };
    expect(weeklyScheduleToRules(allOff, "UTC")).toEqual([]);
  });

  it("skips days where startTime >= endTime (invalid window)", () => {
    const invalidWindow: WeeklySchedule = {
      monday:    { startTime: "17:00", endTime: "09:00", isOff: false }, // inverted
      tuesday:   { startTime: "09:00", endTime: "09:00", isOff: false }, // zero-length
      wednesday: { startTime: "09:00", endTime: "17:00", isOff: false },
      thursday:  { startTime: null,    endTime: null,     isOff: true  },
      friday:    { startTime: null,    endTime: null,     isOff: true  },
      saturday:  { startTime: null,    endTime: null,     isOff: true  },
      sunday:    { startTime: null,    endTime: null,     isOff: true  },
    };

    // After QA fix, inverted time windows throw a RangeError
    expect(() => weeklyScheduleToRules(invalidWindow, "UTC")).toThrow(
      /inverted time window/,
    );
  });

  it("produces valid AvailabilityRuleInput objects with all required fields", () => {
    const rules = weeklyScheduleToRules(fullWeek, "America/New_York");
    for (const rule of rules) {
      expect(typeof rule.rrule).toBe("string");
      expect(rule.rrule.length).toBeGreaterThan(0);
      expect(typeof rule.startTime).toBe("string");
      expect(typeof rule.endTime).toBe("string");
      expect(typeof rule.timezone).toBe("string");
    }
  });

  it("groups 7 identical-hours days into a single rule", () => {
    const allDaySame: WeeklySchedule = {
      monday:    { startTime: "10:00", endTime: "18:00", isOff: false },
      tuesday:   { startTime: "10:00", endTime: "18:00", isOff: false },
      wednesday: { startTime: "10:00", endTime: "18:00", isOff: false },
      thursday:  { startTime: "10:00", endTime: "18:00", isOff: false },
      friday:    { startTime: "10:00", endTime: "18:00", isOff: false },
      saturday:  { startTime: "10:00", endTime: "18:00", isOff: false },
      sunday:    { startTime: "10:00", endTime: "18:00", isOff: false },
    };

    const rules = weeklyScheduleToRules(allDaySame, "UTC");
    expect(rules).toHaveLength(1);
    // All 7 days should be in the BYDAY clause
    const byday = rules[0].rrule;
    ["MO", "TU", "WE", "TH", "FR", "SA", "SU"].forEach((day) => {
      expect(byday).toContain(day);
    });
  });
});

// ---------------------------------------------------------------------------
// intersectSchedulesToRules()
// ---------------------------------------------------------------------------

describe("intersectSchedulesToRules()", () => {
  it("returns barber-only rules when location schedule is null", () => {
    const rules = intersectSchedulesToRules(fullWeek, null, "Australia/Sydney");
    expect(rules.length).toBeGreaterThan(0);

    const weekdayRule = rules.find((r) => r.startTime === "09:00");
    expect(weekdayRule).toBeDefined();
  });

  it("returns location-only rules when barber schedule is null", () => {
    const rules = intersectSchedulesToRules(null, locationSchedule, "Australia/Sydney");
    expect(rules.length).toBeGreaterThan(0);
  });

  it("intersects: barber 09:00–17:00 vs location 08:00–20:00 → 09:00–17:00", () => {
    const rules = intersectSchedulesToRules(fullWeek, locationSchedule, "Australia/Sydney");

    // Weekday intersection should be 09:00–17:00 (the barber's tighter window)
    const weekdayRule = rules.find((r) => r.startTime === "09:00" && r.endTime === "17:00");
    expect(weekdayRule).toBeDefined();
  });

  it("intersects Saturday: barber 10:00–14:00 vs location 10:00–18:00 → 10:00–14:00", () => {
    const rules = intersectSchedulesToRules(fullWeek, locationSchedule, "Australia/Sydney");

    const satRule = rules.find((r) => r.startTime === "10:00" && r.endTime === "14:00");
    expect(satRule).toBeDefined();
    expect(satRule!.rrule).toContain("SA");
  });

  it("marks day as closed when intersection is empty (start >= end)", () => {
    const barberAM: WeeklySchedule = {
      monday:    { startTime: "09:00", endTime: "12:00", isOff: false },
      tuesday:   { startTime: null,    endTime: null,     isOff: true },
      wednesday: { startTime: null,    endTime: null,     isOff: true },
      thursday:  { startTime: null,    endTime: null,     isOff: true },
      friday:    { startTime: null,    endTime: null,     isOff: true },
      saturday:  { startTime: null,    endTime: null,     isOff: true },
      sunday:    { startTime: null,    endTime: null,     isOff: true },
    };

    const locationPM: WeeklySchedule = {
      monday:    { startTime: "13:00", endTime: "18:00", isOff: false }, // no overlap Mon
      tuesday:   { startTime: null,    endTime: null,     isOff: true },
      wednesday: { startTime: null,    endTime: null,     isOff: true },
      thursday:  { startTime: null,    endTime: null,     isOff: true },
      friday:    { startTime: null,    endTime: null,     isOff: true },
      saturday:  { startTime: null,    endTime: null,     isOff: true },
      sunday:    { startTime: null,    endTime: null,     isOff: true },
    };

    const rules = intersectSchedulesToRules(barberAM, locationPM, "UTC");
    // Monday 09:00–12:00 vs 13:00–18:00 → no intersection → no rule for Monday
    expect(rules).toHaveLength(0);
  });

  it("excludes days where either schedule is off", () => {
    const barberNoSunday: WeeklySchedule = {
      monday:    { startTime: "09:00", endTime: "17:00", isOff: false },
      tuesday:   { startTime: "09:00", endTime: "17:00", isOff: false },
      wednesday: { startTime: "09:00", endTime: "17:00", isOff: false },
      thursday:  { startTime: "09:00", endTime: "17:00", isOff: false },
      friday:    { startTime: "09:00", endTime: "17:00", isOff: false },
      saturday:  { startTime: "09:00", endTime: "17:00", isOff: false },
      sunday:    { startTime: null,    endTime: null,     isOff: true  },
    };

    const locationNoSaturday: WeeklySchedule = {
      monday:    { startTime: "09:00", endTime: "17:00", isOff: false },
      tuesday:   { startTime: "09:00", endTime: "17:00", isOff: false },
      wednesday: { startTime: "09:00", endTime: "17:00", isOff: false },
      thursday:  { startTime: "09:00", endTime: "17:00", isOff: false },
      friday:    { startTime: "09:00", endTime: "17:00", isOff: false },
      saturday:  { startTime: null,    endTime: null,     isOff: true  }, // location closed Sat
      sunday:    { startTime: "09:00", endTime: "17:00", isOff: false },
    };

    const rules = intersectSchedulesToRules(barberNoSunday, locationNoSaturday, "UTC");

    const allRuleStr = rules.map((r) => r.rrule).join(" ");
    // Neither Saturday (barber off Sunday, location off Sat) nor Sunday (barber off)
    // should appear as available — only Mon–Fri
    expect(allRuleStr).not.toContain("SA");
    expect(allRuleStr).not.toContain("SU");
  });

  it("uses the latest start time for intersection", () => {
    const barber: WeeklySchedule = {
      monday:    { startTime: "10:00", endTime: "18:00", isOff: false },
      tuesday:   { startTime: null,    endTime: null,     isOff: true },
      wednesday: { startTime: null,    endTime: null,     isOff: true },
      thursday:  { startTime: null,    endTime: null,     isOff: true },
      friday:    { startTime: null,    endTime: null,     isOff: true },
      saturday:  { startTime: null,    endTime: null,     isOff: true },
      sunday:    { startTime: null,    endTime: null,     isOff: true },
    };

    const location: WeeklySchedule = {
      monday:    { startTime: "08:00", endTime: "20:00", isOff: false },
      tuesday:   { startTime: null,    endTime: null,     isOff: true },
      wednesday: { startTime: null,    endTime: null,     isOff: true },
      thursday:  { startTime: null,    endTime: null,     isOff: true },
      friday:    { startTime: null,    endTime: null,     isOff: true },
      saturday:  { startTime: null,    endTime: null,     isOff: true },
      sunday:    { startTime: null,    endTime: null,     isOff: true },
    };

    const rules = intersectSchedulesToRules(barber, location, "UTC");
    expect(rules).toHaveLength(1);
    expect(rules[0].startTime).toBe("10:00"); // barber's later start
    expect(rules[0].endTime).toBe("18:00");   // barber's earlier end
  });
});
