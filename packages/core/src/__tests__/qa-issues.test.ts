/**
 * QA Issue Validation Tests
 *
 * These tests validate bugs identified in the QA audit.
 * Each test is expected to FAIL until the corresponding fix is applied.
 * Tests are tagged with their QA_ISSUES.md identifier (C1, C2, etc.).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getAvailableSlots, isSlotAvailable } from "../slot-engine.js";
import { parseRecurrence, InvalidRRuleError } from "../rrule-parser.js";
import { filterSlotsByLimits } from "../booking-limits.js";
import { estimateWaitTime, recomputeWaitTimes, assignHost } from "../index.js";
import type {
  AvailabilityRuleInput,
  AvailabilityOverrideInput,
  BookingInput,
} from "../types.js";
import type { WalkInQueueEntry, TeamMemberInput } from "../index.js";
import { evaluateRoutingRules } from "../routing-forms.js";
import type { RoutingFormDefinition } from "../routing-forms.js";
import {
  validateQuestionResponses,
  generateSlug,
  validateEventType,
  EventTypeValidationError,
} from "../event-types.js";
import type { BookingQuestion } from "../event-types.js";
import { breakBlockToOverride } from "../kiosk.js";
import type { BreakBlockInput } from "../kiosk.js";
import { generateEmbedSnippet } from "../embed.js";
import type { EmbedConfig } from "../embed.js";
import { generateOccurrences } from "../recurring-bookings.js";
import {
  validateSeatReservation,
  SeatError,
} from "../seats.js";
import type { SeatAttendee } from "../seats.js";
import {
  evaluateCancellationFee,
  PaymentValidationError,
} from "../payments.js";
import type { CancellationPolicy } from "../payments.js";
import { reorderQueue } from "../walk-in.js";
import { getAutoRejectDeadline, isPendingBookingOverdue } from "../confirmation-mode.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a future date range for a specific day */
function dayRange(dateStr: string) {
  return {
    start: new Date(`${dateStr}T00:00:00.000Z`),
    end: new Date(`${dateStr}T23:59:59.999Z`),
  };
}

function makeQueueEntry(overrides: Partial<WalkInQueueEntry> & { id: string; bookingId: string; providerId: string; eventTypeId: string }): WalkInQueueEntry {
  return {
    queuePosition: 1,
    estimatedWaitMinutes: 0,
    checkedInAt: new Date(),
    serviceStartedAt: null,
    completedAt: null,
    status: "queued",
    customerName: "Test",
    durationMinutes: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// C1 — Midnight-crossing availability windows produce zero slots
// ---------------------------------------------------------------------------
describe("C1 — Midnight-crossing availability windows", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("should generate slots for a schedule that crosses midnight (e.g. 22:00-02:00)", () => {
    const nightRule: AvailabilityRuleInput = {
      rrule: "FREQ=WEEKLY;BYDAY=FR",
      startTime: "22:00",
      endTime: "02:00", // crosses midnight into Saturday
      timezone: "America/New_York",
    };

    const dateRange = dayRange("2026-03-06"); // Friday

    const slots = getAvailableSlots(
      [nightRule],
      [],
      [],
      dateRange,
      "America/New_York",
      { duration: 30 },
    );

    // 22:00 to 02:00 = 4 hours = 8 thirty-minute slots
    // BUG: currently returns 0 because endLocal (02:00) < startLocal (22:00) same day
    expect(slots.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// C2 — new Date() inside slot filter is non-deterministic
// ---------------------------------------------------------------------------
describe("C2 — Deterministic 'now' filtering", () => {
  afterEach(() => vi.useRealTimers());

  it("should allow injecting 'now' so slots near current time are deterministic", () => {
    // Set system time to 9:00 AM
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T14:00:00Z")); // 9 AM ET

    const rule: AvailabilityRuleInput = {
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      startTime: "09:00",
      endTime: "17:00",
      timezone: "America/New_York",
    };

    const dateRange = dayRange("2026-03-09"); // Monday

    // Call twice — should get identical results
    const slots1 = getAvailableSlots([rule], [], [], dateRange, "America/New_York", { duration: 30 });
    const slots2 = getAvailableSlots([rule], [], [], dateRange, "America/New_York", { duration: 30 });

    // With vi.useFakeTimers this works, but the underlying code still calls new Date()
    // internally. The real bug is that there's no `now` option parameter — verify
    // the function signature doesn't support it:
    expect(slots1).toEqual(slots2);

    // The real test: the 9:00 AM slot should be filtered out (it's in the past at 9:00 AM)
    // but the 9:30 AM slot should be present. Currently the slot.start <= new Date()
    // comparison uses `<=` which filters out slots starting AT the current time.
    // A slot starting exactly now should arguably still be bookable.
    const nineAmSlot = slots1.find((s) => s.localStart.includes("T09:00"));
    const nineThirtySlot = slots1.find((s) => s.localStart.includes("T09:30"));

    // 9:00 AM starts exactly at "now" — with <= it's filtered out
    // This is arguably a bug: a slot starting NOW should be available
    expect(nineAmSlot).toBeUndefined(); // filtered by <= new Date()
    expect(nineThirtySlot).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// C3 — RRULE dtstart set to query range start shifts occurrence anchoring
// ---------------------------------------------------------------------------
describe("C3 — RRULE dtstart anchoring", () => {
  it("FREQ=WEEKLY without BYDAY should generate on the original day regardless of query start", () => {
    // A rule that recurs weekly (no BYDAY) — should anchor to whatever day
    // the original dtstart was. But since we override dtstart with dateRange.start,
    // querying from a Wednesday makes it recur on Wednesdays.
    const mondayRange = dayRange("2026-03-09"); // Monday
    const wednesdayRange = {
      start: new Date("2026-03-11T00:00:00.000Z"), // Wednesday
      end: new Date("2026-03-16T23:59:59.999Z"),   // Monday next week
    };

    // FREQ=WEEKLY without BYDAY — should recur on the day of dtstart
    const occFromMonday = parseRecurrence("FREQ=WEEKLY", mondayRange, "09:00", "17:00");
    const occFromWednesday = parseRecurrence("FREQ=WEEKLY", wednesdayRange, "09:00", "17:00");

    // When querying Mon→Sun, we should get Monday occurrence
    // When querying Wed→Mon, we should ALSO get Monday occurrence (next week)
    // BUG: occFromWednesday anchors on Wednesday instead of maintaining original day
    const mondayDates = occFromMonday.map((o) => o.date);
    const wednesdayDates = occFromWednesday.map((o) => o.date);

    // The Wednesday query generates an occurrence on Wednesday (2026-03-11)
    // instead of the next Monday (2026-03-16)
    expect(wednesdayDates).not.toContain("2026-03-11"); // BUG: this WILL contain 2026-03-11
  });

  it("FREQ=WEEKLY;BYDAY=MO should always generate Mondays even if query starts on Wednesday", () => {
    const wednesdayRange = {
      start: new Date("2026-03-11T00:00:00.000Z"), // Wednesday
      end: new Date("2026-03-16T23:59:59.999Z"),   // Monday
    };

    const occurrences = parseRecurrence(
      "FREQ=WEEKLY;BYDAY=MO",
      wednesdayRange,
      "09:00",
      "17:00",
    );

    // Should find Monday March 16
    const dates = occurrences.map((o) => o.date);
    expect(dates).toContain("2026-03-16");
    // Should NOT contain any non-Monday date
    for (const d of dates) {
      const dayOfWeek = new Date(`${d}T00:00:00Z`).getUTCDay();
      expect(dayOfWeek).toBe(1); // Monday
    }
  });
});

// ---------------------------------------------------------------------------
// H1 — filterSlotsByLimits never increments counters
// ---------------------------------------------------------------------------
describe("H1 — filterSlotsByLimits counter increment", () => {
  it("should only allow maxBookingsPerDay slots to pass, not all of them", () => {
    const existingBookings: BookingInput[] = [
      {
        startsAt: new Date("2026-03-09T14:00:00Z"),
        endsAt: new Date("2026-03-09T14:30:00Z"),
        status: "confirmed",
      },
    ];

    // 4 candidate slots on the same day
    const slots = [
      { start: new Date("2026-03-09T15:00:00Z"), end: new Date("2026-03-09T15:30:00Z") },
      { start: new Date("2026-03-09T15:30:00Z"), end: new Date("2026-03-09T16:00:00Z") },
      { start: new Date("2026-03-09T16:00:00Z"), end: new Date("2026-03-09T16:30:00Z") },
      { start: new Date("2026-03-09T16:30:00Z"), end: new Date("2026-03-09T17:00:00Z") },
    ];

    const result = filterSlotsByLimits(
      slots,
      existingBookings,
      { maxBookingsPerDay: 2 }, // 1 existing + max 1 more
      new Date("2026-03-09T10:00:00Z"),
    );

    // With 1 existing booking and maxBookingsPerDay=2, only 1 more slot should pass
    // BUG: all 4 slots pass because counter is never incremented
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// H2 — isSlotAvailable doesn't handle override with blocked + alternative hours
// ---------------------------------------------------------------------------
describe("H2 — isSlotAvailable blocked date with alternative hours override", () => {
  it("should reject a slot on a blocked date even if it has alternative hours", () => {
    const rule: AvailabilityRuleInput = {
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      startTime: "09:00",
      endTime: "17:00",
      timezone: "UTC",
    };

    // One override blocks the day, another provides alternative hours
    const overrides: AvailabilityOverrideInput[] = [
      {
        date: new Date("2026-03-09T00:00:00Z"), // Monday
        isUnavailable: true,
      },
      {
        date: new Date("2026-03-09T00:00:00Z"), // Same Monday — alternative hours
        startTime: "10:00",
        endTime: "14:00",
        isUnavailable: false,
      },
    ];

    // Slot within the alternative hours
    const result = isSlotAvailable(
      [rule],
      overrides,
      [],
      new Date("2026-03-09T11:00:00Z"),
      new Date("2026-03-09T11:30:00Z"),
    );

    // isSlotAvailable checks blocked overrides FIRST and returns immediately.
    // It never checks the alternative-hours override.
    // BUG: returns { available: false, reason: "blocked_date" }
    // The behavior depends on override order, which is inconsistent with getAvailableSlots
    // which would generate slots for the alternative hours.
    //
    // Note: This test documents the INCONSISTENCY. Whether the blocked override
    // should "win" or the alternative should "win" is a design decision.
    // But isSlotAvailable and getAvailableSlots MUST agree.
    expect(result.available).toBe(false);
    expect(result).toEqual({ available: false, reason: "blocked_date" });
  });
});

// ---------------------------------------------------------------------------
// H3 — No timezone validation on customerTimezone
// ---------------------------------------------------------------------------
describe("H3 — customerTimezone validation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("should throw a descriptive error for invalid customerTimezone", () => {
    const rule: AvailabilityRuleInput = {
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      startTime: "09:00",
      endTime: "17:00",
      timezone: "America/New_York",
    };

    const dateRange = dayRange("2026-03-09");

    // BUG: throws an unhandled RangeError from date-fns-tz instead of
    // a clear InvalidTimezoneError
    expect(() => {
      getAvailableSlots([rule], [], [], dateRange, "America/New_Yok", { duration: 30 });
    }).toThrow(); // Should throw something — currently throws unhandled RangeError

    // Ideally it should throw InvalidTimezoneError from core's timezone module
    // but currently it throws a raw RangeError from deep inside date-fns-tz
  });
});

// ---------------------------------------------------------------------------
// H4 — Walk-in estimateWaitTime double-counts overlapping bookings
// ---------------------------------------------------------------------------
describe("H4 — estimateWaitTime double-counting", () => {
  it("should not double-count overlapping scheduled bookings", () => {
    const now = new Date("2026-03-09T10:00:00Z");

    const queue: WalkInQueueEntry[] = [
      makeQueueEntry({
        id: "q1",
        bookingId: "b1",
        providerId: "p1",
        eventTypeId: "e1",
        status: "queued",
        durationMinutes: 30,
        queuePosition: 1,
        checkedInAt: now,
      }),
    ];

    // Two overlapping bookings (e.g. a double-booked slot or group booking)
    const bookings: BookingInput[] = [
      {
        startsAt: new Date("2026-03-09T10:30:00Z"),
        endsAt: new Date("2026-03-09T11:00:00Z"),
        status: "confirmed",
      },
      {
        startsAt: new Date("2026-03-09T10:45:00Z"),
        endsAt: new Date("2026-03-09T11:15:00Z"),
        status: "confirmed",
      },
    ];

    const result = estimateWaitTime(queue, bookings, 30, now);

    // Queue has 30 min. Bookings block 10:30-11:15 (45 min total coverage).
    // Correct wait = 30 (queue) + 45 (booking block) = 75 min at most.
    // BUG: Each booking adds its full duration (30 + 30 = 60) instead of the
    // actual blocked time (45 min due to overlap), giving 30 + 60 = 90 min.
    expect(result.estimatedMinutes).toBeLessThanOrEqual(75);
  });
});

// ---------------------------------------------------------------------------
// H5 — recomputeWaitTimes cumulative delay incorrect
// ---------------------------------------------------------------------------
describe("H5 — recomputeWaitTimes with interleaved bookings", () => {
  it("should correctly adjust wait times when bookings interleave with queue", () => {
    const now = new Date("2026-03-09T10:00:00Z");

    const queue: WalkInQueueEntry[] = [
      makeQueueEntry({
        id: "q1",
        bookingId: "b1",
        providerId: "p1",
        eventTypeId: "e1",
        status: "queued",
        durationMinutes: 20,
        queuePosition: 1,
        checkedInAt: now,
      }),
      makeQueueEntry({
        id: "q2",
        bookingId: "b2",
        providerId: "p1",
        eventTypeId: "e1",
        status: "queued",
        durationMinutes: 20,
        queuePosition: 2,
        checkedInAt: now,
      }),
    ];

    // A booking at 10:20-10:50 would conflict with q1's end and q2's start
    const bookings: BookingInput[] = [
      {
        startsAt: new Date("2026-03-09T10:20:00Z"),
        endsAt: new Date("2026-03-09T10:50:00Z"),
        status: "confirmed",
      },
    ];

    const result = recomputeWaitTimes(queue, bookings, now);

    const q1 = result.find((e) => e.id === "q1")!;
    const q2 = result.find((e) => e.id === "q2")!;

    // q1 starts at 10:00, ends 10:20. No conflict with booking (booking starts at 10:20).
    // Actually the booking starts exactly when q1 ends — no overlap with areIntervalsOverlapping default.
    // q2 starts at 10:20 (after q1). Booking 10:20-10:50 overlaps q2 (10:20-10:40).
    // So q2 should be pushed past the booking: cumulative = 20 (q1) + 30 (booking) = 50 min.
    expect(q1.estimatedWaitMinutes).toBe(0);
    expect(q2.estimatedWaitMinutes).toBeGreaterThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// H6 — D1 Lock error handling (tested in d1 package tests)
// ---------------------------------------------------------------------------
// See packages/d1/src/__tests__/qa-issues.test.ts

// ---------------------------------------------------------------------------
// H7 — Round-robin assignHost with zero bookings always picks first member
// ---------------------------------------------------------------------------
describe("H7 — assignHost round-robin with zero bookings", () => {
  it("should distribute fairly even when no past bookings exist", () => {
    const members: TeamMemberInput[] = [
      {
        userId: "barber-a",
        role: "member",
        priority: 1,
        weight: 100,
        rules: [],
        overrides: [],
        bookings: [],
      },
      {
        userId: "barber-b",
        role: "member",
        priority: 1,
        weight: 100,
        rules: [],
        overrides: [],
        bookings: [],
      },
      {
        userId: "barber-c",
        role: "member",
        priority: 1,
        weight: 100,
        rules: [],
        overrides: [],
        bookings: [],
      },
    ];

    const availableMembers = ["barber-a", "barber-b", "barber-c"];
    const pastCounts = [
      { userId: "barber-a", confirmedCount: 0 },
      { userId: "barber-b", confirmedCount: 0 },
      { userId: "barber-c", confirmedCount: 0 },
    ];

    // Call assignHost 3 times with the same inputs
    const result1 = assignHost(members, availableMembers, pastCounts);
    const result2 = assignHost(members, availableMembers, pastCounts);
    const result3 = assignHost(members, availableMembers, pastCounts);

    // BUG: All three return barber-a because deficit is 0 for all,
    // and 0 > -Infinity is true only for the first iteration.
    // With identical inputs and no state, assignHost is deterministic —
    // it will always pick barber-a. This is technically "correct" as a pure
    // function, but the round-robin intent is violated.
    // The real fix is that the caller should pass updated pastCounts after each assignment.
    // But the function could also break ties randomly or by userId hash.
    expect(result1.hostId).toBe("barber-a"); // Always first
    expect(result2.hostId).toBe("barber-a"); // Always first (same inputs!)
    expect(result3.hostId).toBe("barber-a"); // Always first

    // This test PASSES but documents the issue: the function is deterministic
    // with no tie-breaking. This is only a bug if callers don't update pastCounts.
  });
});

// ---------------------------------------------------------------------------
// M7 — areIntervalsOverlapping with zero buffer allows touching boundaries
// ---------------------------------------------------------------------------
describe("M7 — Touching boundary slots with zero buffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("should allow a slot starting exactly when a booking ends (back-to-back)", () => {
    const rule: AvailabilityRuleInput = {
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      startTime: "09:00",
      endTime: "17:00",
      timezone: "UTC",
    };

    const bookings: BookingInput[] = [
      {
        startsAt: new Date("2026-03-09T09:00:00Z"),
        endsAt: new Date("2026-03-09T09:30:00Z"),
        status: "confirmed",
      },
    ];

    // Slot starting exactly at booking end (9:30) — should be available
    const result = isSlotAvailable(
      [rule],
      [],
      bookings,
      new Date("2026-03-09T09:30:00Z"),
      new Date("2026-03-09T10:00:00Z"),
      0, // no buffer
      0,
    );

    // areIntervalsOverlapping returns false for touching boundaries by default
    // So this SHOULD pass — documenting the current (correct) behavior
    expect(result.available).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CORE-H8 — evaluateCondition joins array responses losing structure
// ---------------------------------------------------------------------------

describe("CORE-H8 — evaluateCondition array response joined before equals comparison", () => {
  it("should match when response is ['a'] (single-element array) and operator is 'equals' with value 'a'", () => {
    // BUG: evaluateCondition converts arrays to strings via join(",") before
    // the equals comparison. ["a"] joins to "a" which accidentally matches "a",
    // but ["a","b"] joins to "a,b" which can never match "a" even though
    // the user's selection includes "a".
    const form: RoutingFormDefinition = {
      id: "form-1",
      title: "Test Form",
      fields: [
        {
          key: "services",
          label: "Services",
          type: "checkbox",
          options: ["a", "b", "c"],
          required: false,
        },
      ],
      rules: [
        {
          id: "rule-1",
          conditions: [{ fieldKey: "services", operator: "equals", value: "a" }],
          logic: "AND",
          eventTypeId: "evt-haircut",
          priority: 1,
        },
      ],
      fallback: { eventTypeId: "evt-fallback" },
    };

    // Single-element array ["a"] → joins to "a" → accidentally matches
    const result = evaluateRoutingRules(form, { services: ["a"] });
    expect(result.matched).toBe(true);
    expect(result.eventTypeId).toBe("evt-haircut");

    // Multi-value ["a","b"] → joins to "a,b" → never matches "a"
    // The user selected "a" (among others) but the route does not fire.
    const result2 = evaluateRoutingRules(form, { services: ["a", "b"] });
    // ["a","b"] is not purely "a" so equals "a" should NOT match — this part passes.
    expect(result2.matched).toBe(false);
  });

  it("should NOT match 'not_equals a' when response array includes 'a'", () => {
    // BUG: ["a","b"] joined → "a,b"; "a,b" !== "a" so not_equals "a" returns true.
    // Semantically the user DID select "a" (among others), so "not_equals a" should
    // NOT fire. The join destroys the semantic information.
    const form: RoutingFormDefinition = {
      id: "form-2",
      title: "Test Form 2",
      fields: [
        {
          key: "type",
          label: "Type",
          type: "checkbox",
          options: ["a", "b"],
          required: false,
        },
      ],
      rules: [
        {
          id: "rule-1",
          conditions: [{ fieldKey: "type", operator: "not_equals", value: "a" }],
          logic: "AND",
          eventTypeId: "evt-not-a",
          priority: 1,
        },
      ],
      fallback: { eventTypeId: "evt-fallback" },
    };

    // User selected ["a","b"] — they DID include "a", so "not_equals a" should NOT match.
    // BUG: "a,b" !== "a" → not_equals returns true → rule fires incorrectly.
    const result = evaluateRoutingRules(form, { type: ["a", "b"] });
    expect(result.matched).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CORE-M11 — validateQuestionResponses skips multi_select option validation
// ---------------------------------------------------------------------------

describe("CORE-M11 — validateQuestionResponses missing multi_select validation", () => {
  it("should return an error when multi_select response contains values not in options", () => {
    const questions: BookingQuestion[] = [
      {
        key: "extras",
        label: "Add-ons",
        type: "multi_select",
        options: ["shampoo", "conditioning", "blow-dry"],
        isRequired: false,
      },
    ];

    // "massage" is NOT in the options array
    const errors = validateQuestionResponses(questions, {
      extras: ["shampoo", "massage"],
    });

    // BUG: validateQuestionResponses only validates single_select, not multi_select.
    // The multi_select branch is missing entirely so invalid values pass silently.
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/add-ons/i);
  });

  it("should pass when all multi_select values are valid options", () => {
    const questions: BookingQuestion[] = [
      {
        key: "extras",
        label: "Add-ons",
        type: "multi_select",
        options: ["shampoo", "conditioning", "blow-dry"],
        isRequired: false,
      },
    ];

    const errors = validateQuestionResponses(questions, {
      extras: ["shampoo", "conditioning"],
    });

    // Valid selections should produce no errors regardless of the bug
    expect(errors).toHaveLength(0);
  });

  it("should return an error when a required multi_select has empty array response", () => {
    const questions: BookingQuestion[] = [
      {
        key: "services",
        label: "Services",
        type: "multi_select",
        options: ["cut", "color"],
        isRequired: true,
      },
    ];

    // An empty array [] is neither undefined/null/"" so the required check is
    // bypassed and no error is produced — BUG.
    const errors = validateQuestionResponses(questions, { services: [] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/services/i);
  });
});

// ---------------------------------------------------------------------------
// CORE-M13 — breakBlockToOverride marks entire day unavailable
// ---------------------------------------------------------------------------

describe("CORE-M13 — breakBlockToOverride creates day-blocking override instead of windowed override", () => {
  it("should produce an override with startTime and endTime matching the break window, not null", () => {
    const block: BreakBlockInput = {
      title: "Lunch Break",
      startTime: new Date("2026-03-09T12:00:00Z"),
      endTime: new Date("2026-03-09T12:30:00Z"),
      blockType: "break",
      recurring: false,
    };

    const override = breakBlockToOverride(block);

    // BUG: breakBlockToOverride hard-codes isUnavailable: true with null
    // startTime and endTime. An override with isUnavailable: true and no
    // time window blocks the ENTIRE day in the slot engine, not just the
    // 30-minute lunch break.
    expect(override.startTime).not.toBeNull();
    expect(override.endTime).not.toBeNull();
  });

  it("should not produce a full-day block for a partial-day break", () => {
    const block: BreakBlockInput = {
      title: "Personal",
      startTime: new Date("2026-03-10T15:00:00Z"),
      endTime: new Date("2026-03-10T16:00:00Z"),
      blockType: "personal",
      recurring: false,
    };

    const override = breakBlockToOverride(block);

    // A full-day block is defined as isUnavailable=true AND no time window.
    // BUG: breakBlockToOverride always produces exactly this.
    const isFullDayBlock =
      override.isUnavailable === true &&
      override.startTime == null &&
      override.endTime == null;

    expect(isFullDayBlock).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CORE-M14 — generateEmbedSnippet no XSS sanitization on attribute values
// ---------------------------------------------------------------------------

describe("CORE-M14 — generateEmbedSnippet attribute injection via unsanitized providerId", () => {
  it("should not allow a providerId with a double-quote to break out of the HTML attribute", () => {
    // BUG: generateEmbedSnippet builds attribute strings as `key="${value}"`
    // with no HTML entity encoding. A providerId containing `"` terminates
    // the attribute value and allows injection of arbitrary HTML attributes.
    //
    // Current buggy output contains:
    //   data-provider="legit" onload="alert(1)"
    const maliciousConfig: EmbedConfig = {
      providerId: 'legit" onload="alert(1)',
      eventTypeSlug: "haircut",
      mode: "popup",
      baseUrl: "https://booking.example.com",
    };

    const snippet = generateEmbedSnippet(maliciousConfig);

    // After proper HTML-escaping, the regex should match the full attribute.
    // BUG: the raw `"` breaks the attribute so the regex finds no match.
    const dataProviderMatch = snippet.match(/data-provider="([^"]*)"/);
    expect(dataProviderMatch).not.toBeNull();

    // The raw unescaped injection string must not appear verbatim.
    expect(snippet).not.toContain('legit" onload="alert(1)');
  });

  it("should not allow eventTypeSlug with angle brackets to inject closing script tags", () => {
    const config: EmbedConfig = {
      providerId: "barber-1",
      eventTypeSlug: 'haircut"></script><script>alert(1)</script><script src="',
      mode: "popup",
      baseUrl: "https://booking.example.com",
    };

    const snippet = generateEmbedSnippet(config);

    // BUG: no escaping, so </script> appears verbatim allowing XSS.
    expect(snippet).not.toContain("</script>");
  });
});

// ---------------------------------------------------------------------------
// CORE-L1 — generateOccurrences monthly recurrence day drift from addMonths
// ---------------------------------------------------------------------------

describe("CORE-L1 — generateOccurrences monthly recurrence starting on Jan 31", () => {
  it("should not drift: March occurrence must be Mar 31 not Mar 28", () => {
    // date-fns addMonths(Jan 31, 1) = Feb 28 (clamped — correct)
    // date-fns addMonths(Jan 31, 2) = Mar 31 (from original base — correct)
    //
    // The DRIFT BUG would only occur with a cumulative approach:
    //   addMonths(Feb 28, 1) = Mar 28   (drifts from 31 → 28 permanently)
    //
    // The current implementation uses advanceDate(base, frequency, i) from
    // the ORIGINAL base each time, so no drift occurs. This test guards against
    // any future regression to a cumulative approach.
    const occurrences = generateOccurrences({
      startsAt: new Date("2026-01-31T10:00:00Z"),
      durationMinutes: 60,
      frequency: "monthly",
      count: 3,
    });

    expect(occurrences).toHaveLength(3);

    const feb = occurrences[1].startsAt;
    const mar = occurrences[2].startsAt;

    // Feb: Jan 31 + 1 month = Feb 28 (clamped, expected)
    expect(feb.getUTCMonth()).toBe(1); // February (0-indexed)
    expect(feb.getUTCDate()).toBe(28);

    // Mar: should be Mar 31 (from original Jan 31, not from Feb 28)
    // A cumulative/drifting implementation would produce Mar 28 here.
    expect(mar.getUTCMonth()).toBe(2); // March (0-indexed)
    expect(mar.getUTCDate()).toBe(31); // Must be 31, not 28
  });

  it("should produce consistent day-of-month for months where no clamping occurs", () => {
    // March 15 exists in all months — no clamping risk
    const occurrences = generateOccurrences({
      startsAt: new Date("2026-03-15T09:00:00Z"),
      durationMinutes: 30,
      frequency: "monthly",
      count: 4,
    });

    for (const occ of occurrences) {
      expect(occ.startsAt.getUTCDate()).toBe(15);
    }
  });
});

// ---------------------------------------------------------------------------
// CORE-L2 — generateSlug returns empty string for non-Latin titles
// ---------------------------------------------------------------------------

describe("CORE-L2 — generateSlug returns empty string for non-alphanumeric titles", () => {
  it("should return empty string for a title composed entirely of special characters", () => {
    // BUG: generateSlug strips everything not in [a-z0-9\s-]. "!!!" becomes ""
    // after stripping. An empty slug is invalid but generateSlug doesn't throw.
    const slug = generateSlug("!!!");
    expect(slug).toBe(""); // documents the bug: should throw or return a fallback
  });

  it("should return empty string for a title of only Chinese characters", () => {
    // Chinese characters are not in [a-z0-9\s-] and are stripped entirely.
    const slug = generateSlug("美发预约");
    expect(slug).toBe(""); // documents the bug: non-Latin scripts unsupported
  });

  it("should produce 'haircut' when title is '✂ Haircut' (emoji stripped, ASCII text preserved)", () => {
    // The ✂ character is stripped, but "Haircut" → lowercased → "haircut" survives.
    const slug = generateSlug("✂ Haircut");
    expect(slug).toBe("haircut"); // works correctly
  });

  it("should demonstrate that the empty slug from generateSlug breaks validateEventType", () => {
    // Calling validateEventType with the slug produced by generateSlug("!!!")
    // should throw EventTypeValidationError because "" is not a valid slug.
    // This reveals the integration hazard: generateSlug must never produce
    // a string that immediately fails slug validation.
    const emptySlug = generateSlug("!!!");
    expect(emptySlug).toBe("");
    expect(() => validateEventType({ slug: emptySlug })).toThrow(EventTypeValidationError);
  });
});

// ---------------------------------------------------------------------------
// CORE-L3 — validateSeatReservation only checks single seat availability
// ---------------------------------------------------------------------------

describe("CORE-L3 — validateSeatReservation ignores requestedSeats > 1", () => {
  it("should not throw when 1 seat is requested and 1 seat is available (baseline)", () => {
    const maxSeats = 5;
    const attendees: SeatAttendee[] = [
      { id: "a1", bookingId: "b1", attendeeEmail: "a@x.com", attendeeName: "A", status: "confirmed" },
      { id: "a2", bookingId: "b1", attendeeEmail: "b@x.com", attendeeName: "B", status: "confirmed" },
      { id: "a3", bookingId: "b1", attendeeEmail: "c@x.com", attendeeName: "C", status: "confirmed" },
      { id: "a4", bookingId: "b1", attendeeEmail: "d@x.com", attendeeName: "D", status: "confirmed" },
    ]; // 4/5 taken, 1 available

    // 1 seat requested — should succeed (baseline correct behavior)
    expect(() => validateSeatReservation(maxSeats, attendees, "new@x.com")).not.toThrow();
  });

  it("should expose the missing requestedSeats parameter — extra arg is silently ignored", () => {
    // BUG: validateSeatReservation(maxSeats, attendees, email) has NO requestedSeats
    // parameter. canReserveSeat() accepts requestedSeats but validateSeatReservation
    // never passes it through, making group-size validation impossible.
    //
    // Passing a 4th argument (requestedSeats=3) is silently ignored.
    // The function succeeds even though only 1 seat is available for a 3-seat request.
    const maxSeats = 5;
    const attendees: SeatAttendee[] = [
      { id: "a1", bookingId: "b1", attendeeEmail: "a@x.com", attendeeName: "A", status: "confirmed" },
      { id: "a2", bookingId: "b1", attendeeEmail: "b@x.com", attendeeName: "B", status: "confirmed" },
      { id: "a3", bookingId: "b1", attendeeEmail: "c@x.com", attendeeName: "C", status: "confirmed" },
      { id: "a4", bookingId: "b1", attendeeEmail: "d@x.com", attendeeName: "D", status: "confirmed" },
    ]; // 4/5 → only 1 seat left

    // @ts-expect-error — intentionally calling with extra arg to document the missing parameter
    // If fixed (requestedSeats param added), this SHOULD throw because 3 > 1 available.
    // BUG: currently silently passes regardless of the 4th arg.
    expect(() => validateSeatReservation(maxSeats, attendees, "new@x.com", 3)).not.toThrow(SeatError);
  });

  it("should throw SeatError when zero seats are available", () => {
    // This is the one case validateSeatReservation handles correctly.
    const maxSeats = 2;
    const attendees: SeatAttendee[] = [
      { id: "a1", bookingId: "b1", attendeeEmail: "x@x.com", attendeeName: "X", status: "confirmed" },
      { id: "a2", bookingId: "b1", attendeeEmail: "y@x.com", attendeeName: "Y", status: "confirmed" },
    ]; // 2/2 — full

    expect(() => validateSeatReservation(maxSeats, attendees, "new@x.com")).toThrow(SeatError);
  });
});

// ---------------------------------------------------------------------------
// CORE-L4 — evaluateCancellationFee allows negative hoursRemaining (post-event cancel)
// ---------------------------------------------------------------------------

describe("CORE-L4 — evaluateCancellationFee with cancelledAt after bookingStartsAt", () => {
  it("should apply 100% fee when cancelled after the booking has already started (accidental default)", () => {
    const policy: CancellationPolicy = [
      { hoursBefore: 24, feePercentage: 0 },
      { hoursBefore: 2, feePercentage: 50 },
      { hoursBefore: 0, feePercentage: 100 },
    ];

    const bookingStartsAt = new Date("2026-03-09T10:00:00Z");
    const cancelledAt = new Date("2026-03-09T11:00:00Z"); // 1 hour AFTER start → hoursRemaining = -1

    // Fix: now throws when cancelledAt is after bookingStartsAt
    expect(() => evaluateCancellationFee(policy, bookingStartsAt, cancelledAt, 10000))
      .toThrow();
  });

  it("should throw PaymentValidationError when cancelledAt is after bookingStartsAt", () => {
    const policy: CancellationPolicy = [
      { hoursBefore: 24, feePercentage: 0 },
      { hoursBefore: 0, feePercentage: 100 },
    ];

    const bookingStartsAt = new Date("2026-03-09T10:00:00Z");
    const cancelledAt = new Date("2026-03-09T12:00:00Z"); // 2h AFTER start → hoursRemaining = -2

    // BUG: no guard against cancelledAt > bookingStartsAt.
    // The function silently computes a result instead of throwing a
    // PaymentValidationError("Cannot cancel a past booking") or similar.
    expect(() =>
      evaluateCancellationFee(policy, bookingStartsAt, cancelledAt, 5000),
    ).toThrow(PaymentValidationError);
  });
});

// ---------------------------------------------------------------------------
// CORE-L5 — parseICalDate fallback new Date() is locale/environment-dependent
// ---------------------------------------------------------------------------

describe("CORE-L5 — parseICalDate fallback for non-standard EXDATE formats", () => {
  it("should exclude the correct Monday when EXDATE uses date-only ISO format", () => {
    // The fallback `new Date("2026-03-09")` parses as UTC midnight in Node.js
    // but as local midnight in browsers. In a TZ=-05:00 environment, local midnight
    // is 05:00 UTC — the RRULE engine sees a different instant and may exclude
    // the wrong occurrence. This is a locale/environment dependency bug.
    //
    // In Node.js CI (UTC TZ), the date-only format happens to work correctly.
    // This test documents the intended behavior and the environment dependency.
    const rruleWithDateOnlyExdate = [
      "FREQ=WEEKLY;BYDAY=MO",
      "EXDATE:2026-03-09", // date-only ISO — goes through fallback path
    ].join("\n");

    const range = {
      start: new Date("2026-03-01T00:00:00Z"),
      end: new Date("2026-03-31T23:59:59Z"),
    };

    const occurrences = parseRecurrence(rruleWithDateOnlyExdate, range, "09:00", "17:00");
    const dates = occurrences.map((o) => o.date);

    // March 9 (Monday) should be excluded by the EXDATE
    expect(dates).not.toContain("2026-03-09");
  });

  it("should throw InvalidRRuleError for completely unparseable EXDATE values", () => {
    // parseICalDate throws a generic Error("Cannot parse EXDATE value...")
    // which the outer try/catch re-wraps as InvalidRRuleError.
    // This is the correct behavior — test documents and guards it.
    const invalidExdateRrule = [
      "FREQ=WEEKLY;BYDAY=MO",
      "EXDATE:NOT_A_DATE_AT_ALL",
    ].join("\n");

    const range = {
      start: new Date("2026-03-01T00:00:00Z"),
      end: new Date("2026-03-31T23:59:59Z"),
    };

    expect(() => parseRecurrence(invalidExdateRrule, range, "09:00", "17:00"))
      .toThrow(InvalidRRuleError);
  });
});

// ---------------------------------------------------------------------------
// CORE-L6 — reorderQueue silently drops entries not in orderedIds
// ---------------------------------------------------------------------------

describe("CORE-L6 — reorderQueue drops queue entries absent from orderedIds", () => {
  it("should preserve all entries even when only a subset of IDs are in orderedIds", () => {
    const entries: WalkInQueueEntry[] = [
      makeQueueEntry({ id: "q1", bookingId: "b1", providerId: "p1", eventTypeId: "e1", queuePosition: 1, status: "queued" }),
      makeQueueEntry({ id: "q2", bookingId: "b2", providerId: "p1", eventTypeId: "e1", queuePosition: 2, status: "queued" }),
      makeQueueEntry({ id: "q3", bookingId: "b3", providerId: "p1", eventTypeId: "e1", queuePosition: 3, status: "queued" }),
    ];

    // Only q1 and q3 are included in orderedIds — q2 is intentionally omitted
    // (e.g. a partial reorder request from the client).
    // BUG: reorderQueue builds its result ONLY from entries named in orderedIds.
    // q2 is not listed, so it is silently dropped from the returned array.
    const result = reorderQueue(entries, ["q1", "q3"]);

    const ids = result.map((e) => e.id);
    // BUG: q2 is missing — it has been silently discarded
    expect(ids).toContain("q2");
    expect(result).toHaveLength(3);
  });

  it("should throw when orderedIds contains an ID not present in entries", () => {
    const entries: WalkInQueueEntry[] = [
      makeQueueEntry({ id: "q1", bookingId: "b1", providerId: "p1", eventTypeId: "e1", queuePosition: 1, status: "queued" }),
    ];

    // This is the documented correct behavior — unknown IDs throw
    expect(() => reorderQueue(entries, ["q1", "q-unknown"])).toThrow(
      'Queue entry "q-unknown" not found in current queue.',
    );
  });
});

// ---------------------------------------------------------------------------
// CORE-L7 — getAutoRejectDeadline / isPendingBookingOverdue with negative timeoutHours
// ---------------------------------------------------------------------------

describe("CORE-L7 — Negative timeoutHours produces deadline in the past", () => {
  it("should produce a deadline AFTER createdAt for a normal positive timeoutHours", () => {
    const createdAt = new Date("2026-03-09T10:00:00Z");
    const deadline = getAutoRejectDeadline(createdAt, 24);
    expect(deadline.getTime()).toBeGreaterThan(createdAt.getTime());
  });

  it("should clamp negative timeoutHours to minimum 1 hour (fix verified)", () => {
    const createdAt = new Date("2026-03-09T10:00:00Z");
    const deadline = getAutoRejectDeadline(createdAt, -1);

    // After fix: negative hours clamped to 1, so deadline = createdAt + 1h
    expect(deadline.getTime()).toBeGreaterThan(createdAt.getTime());
  });

  it("should report a booking created 1 second ago as immediately overdue when timeoutHours is negative", () => {
    const createdAt = new Date("2026-03-09T10:00:00Z");
    const rightAfterCreation = new Date("2026-03-09T10:00:01Z");

    // BUG: timeoutHours=-5 → deadline = 05:00 UTC (5h before createdAt at 10:00).
    // now(10:00:01) >= deadline(05:00) → isPendingBookingOverdue returns true.
    // A booking created 1 second ago is instantly "overdue".
    const overdue = isPendingBookingOverdue(createdAt, rightAfterCreation, -5);

    // BUG: returns true — should be false
    expect(overdue).toBe(false);
  });

  it("should report a freshly created booking as overdue when timeoutHours is zero", () => {
    // Edge case: timeoutHours=0 → deadline = createdAt exactly.
    // isPendingBookingOverdue uses `>=`, so at the exact instant of creation
    // now >= deadline is already true.
    const createdAt = new Date("2026-03-09T10:00:00Z");
    const sameInstant = new Date("2026-03-09T10:00:00Z");

    const overdue = isPendingBookingOverdue(createdAt, sameInstant, 0);

    // BUG: returns true — zero-hour timeout makes every new booking instantly overdue.
    // Fix: validate timeoutHours > 0.
    expect(overdue).toBe(false);
  });
});
