/**
 * Team scheduling engine: round-robin, collective, and managed strategies.
 *
 * - **Round-Robin:** Union of all members' slots; `assignHost` picks the next
 *   member based on priority, weight ratio, and availability.
 * - **Collective:** Intersection of all members' slots — everyone must be free.
 * - **Managed:** Template event types with lockable fields inherited by members.
 */

import { getAvailableSlots } from "./slot-engine.js";
import type {
  Slot,
  DateRange,
  AvailabilityRuleInput,
  AvailabilityOverrideInput,
  BookingInput,
  SlotComputeOptions,
} from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Assignment strategy for team event types */
export type AssignmentStrategy =
  | "round_robin"
  | "collective"
  | "managed"
  | "fixed";

/** A team member with their scheduling configuration */
export interface TeamMemberInput {
  userId: string;
  role: "admin" | "member";
  /** Priority level for round-robin ordering (lower = higher priority) */
  priority: number;
  /** Weight for round-robin distribution (default 100) */
  weight: number;
  /** Whether this member is a fixed host (always assigned in round-robin) */
  isFixed?: boolean;
  /** Member's availability rules */
  rules: AvailabilityRuleInput[];
  /** Member's availability overrides */
  overrides: AvailabilityOverrideInput[];
  /** Member's existing bookings */
  bookings: BookingInput[];
}

/** A team slot includes which members are available */
export interface TeamSlot extends Slot {
  /** User IDs of members available at this slot */
  availableMembers: string[];
}

/** Past booking count per member (for round-robin balancing) */
export interface MemberBookingCount {
  userId: string;
  confirmedCount: number;
}

/** Result of host assignment */
export interface AssignmentResult {
  /** The assigned host's userId */
  hostId: string;
  /** Reason for selection */
  reason: string;
}

/** Lockable field definition for managed event types */
export interface ManagedFieldLock {
  field: string;
  locked: boolean;
}

/** Managed event type template */
export interface ManagedEventTypeTemplate {
  title: string;
  durationMinutes: number;
  bufferBefore: number;
  bufferAfter: number;
  customQuestions: unknown[];
  priceCents?: number;
  lockedFields: ManagedFieldLock[];
}

/** Member-level override for unlocked fields */
export interface MemberEventTypeOverride {
  userId: string;
  overrides: Record<string, unknown>;
}

/** Resolved managed event type for a specific member */
export interface ResolvedManagedEventType {
  userId: string;
  config: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// getTeamSlots
// ---------------------------------------------------------------------------

/**
 * Compute available team slots using the specified assignment strategy.
 *
 * - **ROUND_ROBIN:** Returns the union of all members' slots. Each slot
 *   includes which members are available at that time.
 * - **COLLECTIVE:** Returns only slots where ALL members are free.
 *
 * @param members - Team members with their availability data
 * @param strategy - Assignment strategy
 * @param dateRange - Date range to compute
 * @param customerTimezone - Customer's IANA timezone
 * @param options - Slot duration, buffer, interval config
 */
export function getTeamSlots(
  members: TeamMemberInput[],
  strategy: AssignmentStrategy,
  dateRange: DateRange,
  customerTimezone: string,
  options?: SlotComputeOptions,
): TeamSlot[] {
  if (members.length === 0) return [];

  // Compute each member's individual slots
  const memberSlots = new Map<string, Slot[]>();
  for (const member of members) {
    const slots = getAvailableSlots(
      member.rules,
      member.overrides,
      member.bookings,
      dateRange,
      customerTimezone,
      options,
    );
    memberSlots.set(member.userId, slots);
  }

  if (strategy === "collective") {
    return computeCollectiveSlots(members, memberSlots);
  }

  // round_robin, managed, fixed: union of all slots
  return computeUnionSlots(members, memberSlots);
}

/**
 * COLLECTIVE: Return only slots where ALL members are available.
 */
function computeCollectiveSlots(
  members: TeamMemberInput[],
  memberSlots: Map<string, Slot[]>,
): TeamSlot[] {
  if (members.length === 0) return [];

  // Start with the first member's slots
  const firstMember = members[0];
  const baseSlots = memberSlots.get(firstMember.userId) ?? [];

  const collectiveSlots: TeamSlot[] = [];

  for (const slot of baseSlots) {
    const allAvailable = members.every((m) => {
      const slots = memberSlots.get(m.userId) ?? [];
      return slots.some(
        (s) => s.startTime === slot.startTime && s.endTime === slot.endTime,
      );
    });

    if (allAvailable) {
      collectiveSlots.push({
        ...slot,
        availableMembers: members.map((m) => m.userId),
      });
    }
  }

  return collectiveSlots;
}

/**
 * ROUND_ROBIN / MANAGED / FIXED: Return the union of all members' slots.
 * Each slot tracks which members are available at that time.
 */
function computeUnionSlots(
  members: TeamMemberInput[],
  memberSlots: Map<string, Slot[]>,
): TeamSlot[] {
  // Collect all unique slot times
  const slotMap = new Map<string, TeamSlot>();

  for (const member of members) {
    const slots = memberSlots.get(member.userId) ?? [];
    for (const slot of slots) {
      const key = `${slot.startTime}|${slot.endTime}`;
      const existing = slotMap.get(key);
      if (existing) {
        existing.availableMembers.push(member.userId);
      } else {
        slotMap.set(key, {
          ...slot,
          availableMembers: [member.userId],
        });
      }
    }
  }

  return Array.from(slotMap.values()).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
}

// ---------------------------------------------------------------------------
// assignHost (Round-Robin)
// ---------------------------------------------------------------------------

/**
 * Assign a host for a round-robin team booking.
 *
 * Selection order:
 * 1. Fixed members (always assigned if available)
 * 2. Among remaining: sort by priority (lower = higher priority)
 * 3. Among same priority: select the member whose actual booking ratio
 *    is furthest below their target weight ratio
 *
 * @param members - Team members
 * @param availableMembers - User IDs available at the requested slot
 * @param pastCounts - Confirmed booking counts per member
 */
export function assignHost(
  members: TeamMemberInput[],
  availableMembers: string[],
  pastCounts: MemberBookingCount[],
): AssignmentResult {
  if (availableMembers.length === 0) {
    throw new Error("No team members available for this slot");
  }

  const availableSet = new Set(availableMembers);
  const eligible = members.filter((m) => availableSet.has(m.userId));

  if (eligible.length === 0) {
    throw new Error("No team members available for this slot");
  }

  // 1. Fixed members take priority
  const fixedMembers = eligible.filter((m) => m.isFixed);
  if (fixedMembers.length > 0) {
    return {
      hostId: fixedMembers[0].userId,
      reason: "fixed_host",
    };
  }

  // 2. Sort by priority (ascending = higher priority first)
  const sorted = [...eligible].sort((a, b) => a.priority - b.priority);
  const highestPriority = sorted[0].priority;
  const samePriority = sorted.filter((m) => m.priority === highestPriority);

  if (samePriority.length === 1) {
    return {
      hostId: samePriority[0].userId,
      reason: "highest_priority",
    };
  }

  // 3. Among same priority, pick the most "underbooked" by weight ratio
  const countMap = new Map<string, number>();
  for (const pc of pastCounts) {
    countMap.set(pc.userId, pc.confirmedCount);
  }

  const totalWeight = samePriority.reduce((sum, m) => sum + m.weight, 0);
  const totalBookings = samePriority.reduce(
    (sum, m) => sum + (countMap.get(m.userId) ?? 0),
    0,
  );

  let bestMember = samePriority[0];
  let bestDeficit = -Infinity;

  for (const member of samePriority) {
    const actual = countMap.get(member.userId) ?? 0;
    const targetRatio = member.weight / totalWeight;
    const expectedBookings = totalBookings * targetRatio;
    const deficit = expectedBookings - actual;

    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      bestMember = member;
    }
  }

  return {
    hostId: bestMember.userId,
    reason: "weight_balanced",
  };
}

// ---------------------------------------------------------------------------
// Managed Event Types
// ---------------------------------------------------------------------------

/**
 * Resolve a managed event type template for a specific member.
 *
 * Locked fields use the template values. Unlocked fields allow member overrides.
 *
 * @param template - The team-level managed event type template
 * @param memberOverride - The member's custom values for unlocked fields
 */
export function resolveManagedEventType(
  template: ManagedEventTypeTemplate,
  memberOverride?: MemberEventTypeOverride,
): ResolvedManagedEventType {
  const baseConfig: Record<string, unknown> = {
    title: template.title,
    durationMinutes: template.durationMinutes,
    bufferBefore: template.bufferBefore,
    bufferAfter: template.bufferAfter,
    customQuestions: template.customQuestions,
    priceCents: template.priceCents,
  };

  const resolved = { ...baseConfig };

  if (memberOverride) {
    const lockedSet = new Set(
      template.lockedFields
        .filter((f) => f.locked)
        .map((f) => f.field),
    );

    for (const [field, value] of Object.entries(memberOverride.overrides)) {
      if (!lockedSet.has(field)) {
        resolved[field] = value;
      }
    }
  }

  return {
    userId: memberOverride?.userId ?? "template",
    config: resolved,
  };
}

/**
 * Check if a field is locked in a managed event type template.
 */
export function isFieldLocked(
  template: ManagedEventTypeTemplate,
  field: string,
): boolean {
  return template.lockedFields.some((f) => f.field === field && f.locked);
}

/**
 * Propagate template changes to member overrides.
 * Returns updated overrides with locked fields reset to template values.
 */
export function propagateTemplateChanges(
  template: ManagedEventTypeTemplate,
  memberOverrides: MemberEventTypeOverride[],
): ResolvedManagedEventType[] {
  return memberOverrides.map((override) =>
    resolveManagedEventType(template, override),
  );
}
