import { describe, it, expect } from "vitest";
import {
  getTeamSlots,
  assignHost,
  resolveManagedEventType,
  isFieldLocked,
  propagateTemplateChanges,
  type TeamMemberInput,
  type MemberBookingCount,
  type ManagedEventTypeTemplate,
  type MemberEventTypeOverride,
} from "../team-scheduling.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A standard weekday 9-5 rule in UTC for a future week */
const weekdayRule = {
  rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  startTime: "09:00",
  endTime: "17:00",
  timezone: "UTC",
};

/** Future date range to avoid "past slot" filtering */
const dateRange = {
  start: new Date("2027-06-01T00:00:00Z"),
  end: new Date("2027-06-08T00:00:00Z"),
};

function makeMember(
  userId: string,
  overrides?: Partial<TeamMemberInput>,
): TeamMemberInput {
  return {
    userId,
    role: "member",
    priority: 0,
    weight: 100,
    rules: [weekdayRule],
    overrides: [],
    bookings: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getTeamSlots
// ---------------------------------------------------------------------------

describe("getTeamSlots", () => {
  it("returns empty array for empty team", () => {
    const slots = getTeamSlots([], "round_robin", dateRange, "UTC");
    expect(slots).toEqual([]);
  });

  describe("ROUND_ROBIN (union)", () => {
    it("returns union of all members' slots", () => {
      const alice = makeMember("alice");
      const bob = makeMember("bob");

      const slots = getTeamSlots(
        [alice, bob],
        "round_robin",
        dateRange,
        "UTC",
        { duration: 30 },
      );

      // Both should be available at the same times
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(slot.availableMembers).toContain("alice");
        expect(slot.availableMembers).toContain("bob");
      }
    });

    it("a slot is available if at least one member is free", () => {
      const alice = makeMember("alice");
      // Bob has a booking Monday 9:00-10:00
      const bob = makeMember("bob", {
        bookings: [
          {
            startsAt: new Date("2027-06-02T09:00:00Z"),
            endsAt: new Date("2027-06-02T10:00:00Z"),
            status: "confirmed",
          },
        ],
      });

      const slots = getTeamSlots(
        [alice, bob],
        "round_robin",
        dateRange,
        "UTC",
        { duration: 30 },
      );

      // The 9:00 and 9:30 Monday slots should exist (alice is free)
      const mondayNine = slots.find(
        (s) => s.startTime === "2027-06-02T09:00:00.000Z",
      );
      expect(mondayNine).toBeDefined();
      expect(mondayNine!.availableMembers).toContain("alice");
      expect(mondayNine!.availableMembers).not.toContain("bob");
    });

    it("members with different schedules produce a wider union", () => {
      // Alice works 9-13, Bob works 13-17
      const alice = makeMember("alice", {
        rules: [{ ...weekdayRule, startTime: "09:00", endTime: "13:00" }],
      });
      const bob = makeMember("bob", {
        rules: [{ ...weekdayRule, startTime: "13:00", endTime: "17:00" }],
      });

      const slots = getTeamSlots(
        [alice, bob],
        "round_robin",
        dateRange,
        "UTC",
        { duration: 60 },
      );

      // Should cover both halves of the day
      const morningSlot = slots.find(
        (s) => s.startTime === "2027-06-02T09:00:00.000Z",
      );
      const afternoonSlot = slots.find(
        (s) => s.startTime === "2027-06-02T13:00:00.000Z",
      );
      expect(morningSlot).toBeDefined();
      expect(afternoonSlot).toBeDefined();
      expect(morningSlot!.availableMembers).toEqual(["alice"]);
      expect(afternoonSlot!.availableMembers).toEqual(["bob"]);
    });
  });

  describe("COLLECTIVE (intersection)", () => {
    it("returns only slots where ALL members are available", () => {
      const alice = makeMember("alice");
      const bob = makeMember("bob");

      const slots = getTeamSlots(
        [alice, bob],
        "collective",
        dateRange,
        "UTC",
        { duration: 30 },
      );

      // All slots should list both members
      for (const slot of slots) {
        expect(slot.availableMembers).toContain("alice");
        expect(slot.availableMembers).toContain("bob");
      }
    });

    it("removes slots if any member is unavailable", () => {
      const alice = makeMember("alice");
      // Bob blocked on Monday
      const bob = makeMember("bob", {
        overrides: [{ date: new Date("2027-06-02"), isUnavailable: true }],
      });

      const allSlots = getTeamSlots(
        [alice, bob],
        "collective",
        dateRange,
        "UTC",
        { duration: 30 },
      );

      // No Monday slots should appear
      const mondaySlots = allSlots.filter((s) =>
        s.startTime.startsWith("2027-06-02"),
      );
      expect(mondaySlots.length).toBe(0);
    });

    it("booking for one member removes collective slot", () => {
      const alice = makeMember("alice");
      const bob = makeMember("bob", {
        bookings: [
          {
            startsAt: new Date("2027-06-02T09:00:00Z"),
            endsAt: new Date("2027-06-02T10:00:00Z"),
            status: "confirmed",
          },
        ],
      });

      const slots = getTeamSlots(
        [alice, bob],
        "collective",
        dateRange,
        "UTC",
        { duration: 30 },
      );

      // 9:00 and 9:30 on Monday should be missing
      const nine = slots.find(
        (s) => s.startTime === "2027-06-02T09:00:00.000Z",
      );
      const nineThirty = slots.find(
        (s) => s.startTime === "2027-06-02T09:30:00.000Z",
      );
      expect(nine).toBeUndefined();
      expect(nineThirty).toBeUndefined();
    });

    it("collective with non-overlapping schedules returns no slots", () => {
      const alice = makeMember("alice", {
        rules: [{ ...weekdayRule, startTime: "09:00", endTime: "12:00" }],
      });
      const bob = makeMember("bob", {
        rules: [{ ...weekdayRule, startTime: "14:00", endTime: "17:00" }],
      });

      const slots = getTeamSlots(
        [alice, bob],
        "collective",
        dateRange,
        "UTC",
        { duration: 30 },
      );

      expect(slots.length).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// assignHost
// ---------------------------------------------------------------------------

describe("assignHost", () => {
  it("throws if no members are available", () => {
    expect(() => assignHost([], [], [])).toThrow(
      "No team members available",
    );
  });

  it("assigns a fixed host when available", () => {
    const members = [
      makeMember("alice", { isFixed: true }),
      makeMember("bob"),
    ];

    const result = assignHost(members, ["alice", "bob"], []);
    expect(result.hostId).toBe("alice");
    expect(result.reason).toBe("fixed_host");
  });

  it("assigns by highest priority when no fixed hosts", () => {
    const members = [
      makeMember("alice", { priority: 2 }),
      makeMember("bob", { priority: 1 }),
      makeMember("carol", { priority: 3 }),
    ];

    const result = assignHost(members, ["alice", "bob", "carol"], []);
    expect(result.hostId).toBe("bob");
    expect(result.reason).toBe("highest_priority");
  });

  it("uses weight balancing among same-priority members", () => {
    const members = [
      makeMember("alice", { priority: 0, weight: 100 }),
      makeMember("bob", { priority: 0, weight: 100 }),
    ];

    // Alice has 5 bookings, Bob has 3 → Bob is underbooked
    const counts: MemberBookingCount[] = [
      { userId: "alice", confirmedCount: 5 },
      { userId: "bob", confirmedCount: 3 },
    ];

    const result = assignHost(members, ["alice", "bob"], counts);
    expect(result.hostId).toBe("bob");
    expect(result.reason).toBe("weight_balanced");
  });

  it("respects weight ratios (2:1 weight gives 2:1 distribution target)", () => {
    const members = [
      makeMember("alice", { priority: 0, weight: 200 }),
      makeMember("bob", { priority: 0, weight: 100 }),
    ];

    // Alice has 4, Bob has 2 → perfectly balanced at 2:1 ratio
    // Next booking should go to Alice (higher weight target)
    const counts: MemberBookingCount[] = [
      { userId: "alice", confirmedCount: 4 },
      { userId: "bob", confirmedCount: 2 },
    ];

    const result = assignHost(members, ["alice", "bob"], counts);
    expect(result.hostId).toBe("alice");
  });

  it("only considers available members", () => {
    const members = [
      makeMember("alice", { priority: 0 }),
      makeMember("bob", { priority: 0 }),
    ];

    // Only bob is available
    const result = assignHost(members, ["bob"], []);
    expect(result.hostId).toBe("bob");
  });

  it("distributes roughly evenly across equal-weight members over 100 bookings", () => {
    const members = [
      makeMember("alice", { priority: 0, weight: 100 }),
      makeMember("bob", { priority: 0, weight: 100 }),
      makeMember("carol", { priority: 0, weight: 100 }),
    ];

    const counts: MemberBookingCount[] = [
      { userId: "alice", confirmedCount: 0 },
      { userId: "bob", confirmedCount: 0 },
      { userId: "carol", confirmedCount: 0 },
    ];

    const distribution: Record<string, number> = {
      alice: 0,
      bob: 0,
      carol: 0,
    };

    for (let i = 0; i < 100; i++) {
      const result = assignHost(
        members,
        ["alice", "bob", "carol"],
        counts,
      );
      distribution[result.hostId]++;
      // Update counts to simulate real usage
      const count = counts.find((c) => c.userId === result.hostId)!;
      count.confirmedCount++;
    }

    // Each member should get roughly 33 ± 5
    expect(distribution.alice).toBeGreaterThanOrEqual(28);
    expect(distribution.alice).toBeLessThanOrEqual(38);
    expect(distribution.bob).toBeGreaterThanOrEqual(28);
    expect(distribution.bob).toBeLessThanOrEqual(38);
    expect(distribution.carol).toBeGreaterThanOrEqual(28);
    expect(distribution.carol).toBeLessThanOrEqual(38);
    // Total must be exactly 100
    expect(
      distribution.alice + distribution.bob + distribution.carol,
    ).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Managed Event Types
// ---------------------------------------------------------------------------

describe("resolveManagedEventType", () => {
  const template: ManagedEventTypeTemplate = {
    title: "Team Consultation",
    durationMinutes: 30,
    bufferBefore: 5,
    bufferAfter: 5,
    customQuestions: [{ key: "topic", label: "Topic", type: "text" }],
    priceCents: 5000,
    lockedFields: [
      { field: "durationMinutes", locked: true },
      { field: "priceCents", locked: true },
      { field: "title", locked: false },
      { field: "bufferBefore", locked: false },
    ],
  };

  it("returns template values when no member override", () => {
    const result = resolveManagedEventType(template);
    expect(result.userId).toBe("template");
    expect(result.config.durationMinutes).toBe(30);
    expect(result.config.priceCents).toBe(5000);
    expect(result.config.title).toBe("Team Consultation");
  });

  it("allows member to override unlocked fields", () => {
    const override: MemberEventTypeOverride = {
      userId: "alice",
      overrides: {
        title: "Alice's Consultation",
        bufferBefore: 10,
      },
    };

    const result = resolveManagedEventType(template, override);
    expect(result.userId).toBe("alice");
    expect(result.config.title).toBe("Alice's Consultation");
    expect(result.config.bufferBefore).toBe(10);
  });

  it("prevents member from overriding locked fields", () => {
    const override: MemberEventTypeOverride = {
      userId: "bob",
      overrides: {
        durationMinutes: 60, // locked — should be ignored
        priceCents: 0, // locked — should be ignored
        title: "Bob's Session", // unlocked — should apply
      },
    };

    const result = resolveManagedEventType(template, override);
    expect(result.config.durationMinutes).toBe(30); // template value
    expect(result.config.priceCents).toBe(5000); // template value
    expect(result.config.title).toBe("Bob's Session"); // overridden
  });
});

describe("isFieldLocked", () => {
  const template: ManagedEventTypeTemplate = {
    title: "Test",
    durationMinutes: 30,
    bufferBefore: 0,
    bufferAfter: 0,
    customQuestions: [],
    lockedFields: [
      { field: "durationMinutes", locked: true },
      { field: "title", locked: false },
    ],
  };

  it("returns true for locked fields", () => {
    expect(isFieldLocked(template, "durationMinutes")).toBe(true);
  });

  it("returns false for unlocked fields", () => {
    expect(isFieldLocked(template, "title")).toBe(false);
  });

  it("returns false for fields not in the lock list", () => {
    expect(isFieldLocked(template, "bufferBefore")).toBe(false);
  });
});

describe("propagateTemplateChanges", () => {
  it("propagates locked field changes to all members", () => {
    const template: ManagedEventTypeTemplate = {
      title: "Updated Title",
      durationMinutes: 45, // changed from 30
      bufferBefore: 5,
      bufferAfter: 5,
      customQuestions: [],
      priceCents: 7500,
      lockedFields: [
        { field: "durationMinutes", locked: true },
        { field: "priceCents", locked: true },
        { field: "title", locked: false },
      ],
    };

    const overrides: MemberEventTypeOverride[] = [
      { userId: "alice", overrides: { title: "Alice's Session" } },
      {
        userId: "bob",
        overrides: { title: "Bob's Session", durationMinutes: 30 },
      },
    ];

    const results = propagateTemplateChanges(template, overrides);
    expect(results).toHaveLength(2);

    // Alice keeps her title override, gets new duration
    const alice = results.find((r) => r.userId === "alice")!;
    expect(alice.config.title).toBe("Alice's Session");
    expect(alice.config.durationMinutes).toBe(45);
    expect(alice.config.priceCents).toBe(7500);

    // Bob's duration override is ignored (locked), keeps custom title
    const bob = results.find((r) => r.userId === "bob")!;
    expect(bob.config.title).toBe("Bob's Session");
    expect(bob.config.durationMinutes).toBe(45); // locked → template wins
  });
});
