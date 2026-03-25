"use server";

import {
  getAvailableSlots,
  isSlotAvailable,
  generateEmbedSnippet,
  generateAllSnippets,
  getTeamSlots,
  assignHost,
  computeBookingLimits,
  filterSlotsByLimits,
  getInitialBookingStatus,
  getAutoRejectDeadline,
  isPendingBookingOverdue,
  generateOccurrences,
  computeSeatAvailability,
  estimateWaitTime,
  evaluateRoutingRules,
  evaluateCancellationFee,
  resolveKioskSettings,
  getResourceAvailableSlots,
  assignResource,
  getResourcePoolSummary,
  applySlotRelease,
  type Slot,
  type TeamSlot,
  type AvailabilityOverrideInput,
  type AssignmentStrategy,
  type TeamMemberInput,
  type MemberBookingCount,
  type BookingLimitsConfig,
  type LimitStatus,
  type RecurringSeriesInput,
  type WalkInQueueEntry,
  type RoutingFormDefinition,
  type RoutingResponses,
  type CancellationPolicy,
  type KioskSettings,
  type ResourceSlot,
  type ResourceAssignmentStrategy,
  type ResourcePoolSummary,
  type SlotReleaseConfig,
} from "@thebookingkit/core";
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
import {
  getResourcePool,
  getResourceBookingCounts,
  RESTAURANT,
} from "./restaurant-data";
import { buildDayRange } from "./demo-utils";

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
  const { start: dayStart, end: dayEnd } = buildDayRange(dateISO);

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
  const { start: dayStart, end: dayEnd } = buildDayRange(dateISO);

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
  const { start: dayStart, end: dayEnd } = buildDayRange(dateISO);

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
  const { start: dayStart, end: dayEnd } = buildDayRange(dateISO);

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

// ---------------------------------------------------------------------------
// Booking Limits Action
// ---------------------------------------------------------------------------

export async function fetchBookingLimitsDemo(
  dateISO: string,
  maxPerDay: number,
  maxPerWeek: number,
  minNoticeMinutes: number,
): Promise<{
  status: LimitStatus;
  filteredCount: number;
  totalCount: number;
}> {
  const { start: dayStart, end: dayEnd } = buildDayRange(dateISO);
  const date = new Date(dateISO);
  const tz = BARBER_SHOP.timezone;

  const limits: BookingLimitsConfig = {
    maxBookingsPerDay: maxPerDay > 0 ? maxPerDay : null,
    maxBookingsPerWeek: maxPerWeek > 0 ? maxPerWeek : null,
    minNoticeMinutes: minNoticeMinutes > 0 ? minNoticeMinutes : null,
  };

  const existingBookings = getBookingsAsInput();
  const status = computeBookingLimits(existingBookings, limits, date);

  const allSlots = getAvailableSlots(
    AVAILABILITY_RULES,
    getOverrides(),
    existingBookings,
    { start: dayStart, end: dayEnd },
    tz,
    { duration: 30 },
  );

  // filterSlotsByLimits expects { start: Date, end: Date }[] not Slot[]
  const slotRanges = allSlots.map((s) => ({ start: new Date(s.startTime), end: new Date(s.endTime) }));
  const filtered = filterSlotsByLimits(slotRanges, existingBookings, limits);

  return {
    status,
    filteredCount: filtered.length,
    totalCount: allSlots.length,
  };
}

// ---------------------------------------------------------------------------
// Confirmation Mode Action
// ---------------------------------------------------------------------------

export async function fetchConfirmationModeDemo(requiresConfirmation: boolean): Promise<{
  initialStatus: string;
  deadline: string;
  isOverdue: boolean;
  timeoutHours: number;
}> {
  const now = new Date();
  const initialStatus = getInitialBookingStatus(requiresConfirmation);
  const deadline = getAutoRejectDeadline(now);
  const isOverdue = isPendingBookingOverdue(now);

  return {
    initialStatus,
    deadline: deadline.toISOString(),
    isOverdue,
    timeoutHours: 24,
  };
}

// ---------------------------------------------------------------------------
// Team Scheduling Action
// ---------------------------------------------------------------------------

const TEAM_MEMBERS_DATA = [
  {
    userId: "marcus",
    name: "Marcus Johnson",
    role: "admin" as const,
    priority: 1,
    weight: 100,
    rules: [
      {
        rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
        startTime: "09:00",
        endTime: "18:00",
        timezone: "America/New_York",
      },
    ],
    confirmedCount: 12,
  },
  {
    userId: "darius",
    name: "Darius Wells",
    role: "member" as const,
    priority: 2,
    weight: 100,
    rules: [
      {
        rrule: "FREQ=WEEKLY;BYDAY=TU,WE,TH,FR,SA",
        startTime: "10:00",
        endTime: "19:00",
        timezone: "America/New_York",
      },
    ],
    confirmedCount: 8,
  },
  {
    userId: "elena",
    name: "Elena Cruz",
    role: "member" as const,
    priority: 3,
    weight: 80,
    rules: [
      {
        rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR,SA",
        startTime: "11:00",
        endTime: "17:00",
        timezone: "America/New_York",
      },
    ],
    confirmedCount: 5,
  },
];

export interface TeamDemoResult {
  strategy: AssignmentStrategy;
  slots: TeamSlot[];
  assignedHost: string | null;
  assignedReason: string | null;
  memberCounts: { userId: string; name: string; confirmedCount: number }[];
}

export async function fetchTeamSchedulingDemo(
  dateISO: string,
  strategy: AssignmentStrategy,
): Promise<TeamDemoResult> {
  const dayStart = new Date(dateISO);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dateISO);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const members: TeamMemberInput[] = TEAM_MEMBERS_DATA.map((m) => ({
    userId: m.userId,
    role: m.role,
    priority: m.priority,
    weight: m.weight,
    rules: m.rules,
    overrides: [],
    bookings: [],
  }));

  const slots = getTeamSlots(
    members,
    strategy,
    { start: dayStart, end: dayEnd },
    "America/New_York",
    { duration: 30 },
  );

  const previewSlot = slots[0] ?? null;
  let assignedHost: string | null = null;
  let assignedReason: string | null = null;

  if (previewSlot && strategy === "round_robin") {
    const bookingCounts: MemberBookingCount[] = TEAM_MEMBERS_DATA.map((m) => ({
      userId: m.userId,
      confirmedCount: m.confirmedCount,
    }));
    const result = assignHost(members, previewSlot.availableMembers, bookingCounts);
    assignedHost = result.hostId;
    assignedReason = result.reason;
  } else if (previewSlot && strategy === "collective") {
    assignedHost = previewSlot.availableMembers[0] ?? null;
    assignedReason = "All members must be free for collective bookings";
  }

  return {
    strategy,
    slots: slots.slice(0, 20),
    assignedHost,
    assignedReason,
    memberCounts: TEAM_MEMBERS_DATA.map((m) => ({
      userId: m.userId,
      name: m.name,
      confirmedCount: m.confirmedCount,
    })),
  };
}

// ---------------------------------------------------------------------------
// Advanced Features Actions
// ---------------------------------------------------------------------------

export interface RecurringDemoResult {
  occurrences: { index: number; startsAt: string; endsAt: string }[];
  frequency: string;
  count: number;
}

export async function fetchRecurringDemo(
  frequency: "weekly" | "biweekly" | "monthly",
  count: number,
): Promise<RecurringDemoResult> {
  // Start from next Monday at 10am
  const base = new Date();
  const daysUntilMonday = (8 - base.getDay()) % 7 || 7;
  base.setDate(base.getDate() + daysUntilMonday);
  base.setHours(10, 0, 0, 0);

  const input: RecurringSeriesInput = {
    startsAt: base,
    durationMinutes: 30,
    frequency,
    count,
  };

  const occurrences = generateOccurrences(input);

  return {
    occurrences: occurrences.map((o) => ({
      index: o.index,
      startsAt: o.startsAt.toISOString(),
      endsAt: o.endsAt.toISOString(),
    })),
    frequency,
    count,
  };
}

export interface SeatsDemoResult {
  maxSeats: number;
  bookedSeats: number;
  availableSeats: number;
  isFull: boolean;
}

export async function fetchSeatsDemo(maxSeats: number, bookedSeats: number): Promise<SeatsDemoResult> {
  const attendees = Array.from({ length: bookedSeats }, (_, i) => ({
    id: `att-${i}`,
    bookingId: `bk-${i}`,
    attendeeEmail: `attendee${i}@example.com`,
    attendeeName: `Attendee ${i + 1}`,
    status: "confirmed" as const,
  }));
  const result = computeSeatAvailability(maxSeats, attendees);
  return result;
}

export interface WalkInDemoResult {
  estimatedWaitMinutes: number;
  queueLength: number;
  avgServiceMinutes: number;
}

export async function fetchWalkInDemo(queueLength: number, avgServiceMinutes: number): Promise<WalkInDemoResult> {
  const now = new Date();
  const queue: WalkInQueueEntry[] = Array.from({ length: queueLength }, (_, i) => ({
    id: `q-${i}`,
    bookingId: `bk-q-${i}`,
    providerId: "marcus",
    queuePosition: i + 1,
    estimatedWaitMinutes: i * avgServiceMinutes,
    checkedInAt: new Date(now.getTime() - i * avgServiceMinutes * 60000),
    serviceStartedAt: null,
    completedAt: null,
    status: "queued" as const,
    customerName: `Customer ${i + 1}`,
    eventTypeId: "haircut",
    durationMinutes: avgServiceMinutes,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  // estimateWaitTime(queue, existingBookings, serviceDuration)
  const estimate = estimateWaitTime(queue, [], avgServiceMinutes);

  return {
    estimatedWaitMinutes: estimate.estimatedMinutes,
    queueLength,
    avgServiceMinutes,
  };
}

export interface RoutingDemoResult {
  matched: boolean;
  destination: string | null;
  ruleLabel: string;
}

export async function fetchRoutingDemo(
  serviceType: string,
): Promise<RoutingDemoResult> {
  const form: RoutingFormDefinition = {
    id: "intake-form",
    title: "Service Intake",
    fields: [
      {
        key: "service_type",
        label: "What service do you need?",
        type: "dropdown",
        required: true,
        options: ["Haircut", "Beard Trim", "Deluxe Package"],
      },
    ],
    rules: [
      {
        id: "rule-deluxe",
        conditions: [
          { fieldKey: "service_type", operator: "equals", value: "Deluxe Package" },
        ],
        logic: "AND",
        eventTypeId: "deluxe-grooming",
        priority: 1,
      },
      {
        id: "rule-beard",
        conditions: [
          { fieldKey: "service_type", operator: "equals", value: "Beard Trim" },
        ],
        logic: "AND",
        eventTypeId: "beard-trim",
        priority: 2,
      },
    ],
    fallback: { eventTypeId: "haircut" },
  };

  const responses: RoutingResponses = { service_type: serviceType };
  const result = evaluateRoutingRules(form, responses);

  const destination = result.eventTypeId ?? result.providerId ?? result.teamId ?? null;

  return {
    matched: result.matched,
    destination,
    ruleLabel: result.matched
      ? `Routed to "${destination}"`
      : `Fallback: "${destination}"`,
  };
}

export interface CancellationDemoResult {
  feeAmount: number;
  feePercentage: number;
  formatted: string;
  tierId: string;
}

export async function fetchCancellationDemo(
  hoursBeforeBooking: number,
): Promise<CancellationDemoResult> {
  // CancellationPolicy = CancellationPolicyTier[] (array, sorted descending by hoursBefore)
  const policy: CancellationPolicy = [
    { hoursBefore: 24, feePercentage: 0 },
    { hoursBefore: 2, feePercentage: 50 },
    { hoursBefore: 0, feePercentage: 100 },
  ];

  // API: evaluateCancellationFee(policy, bookingStartsAt, cancelledAt, originalAmountCents)
  const bookingStart = new Date(Date.now() + hoursBeforeBooking * 3600000);
  const result = evaluateCancellationFee(policy, bookingStart, new Date(), 5000);

  const feeAmount = result.feeCents / 100;

  return {
    feeAmount,
    feePercentage: result.feePercentage,
    formatted: `$${feeAmount.toFixed(2)}`,
    tierId: `${result.matchedTier.hoursBefore}h`,
  };
}

export interface KioskDemoResult {
  resolved: {
    defaultView: string;
    blockDensity: string;
    colorCoding: string;
    showWalkInSidebar: boolean;
    autoLockMinutes: number;
    dayStartHour: number;
    dayEndHour: number;
  };
  viewLabel: string;
  capabilities: {
    dragAndDrop: boolean;
    scheduleMap: boolean;
    resizable: boolean;
    offHoursDimming: boolean;
  };
}

export async function fetchKioskDemo(viewType: string): Promise<KioskDemoResult> {
  // KioskViewType = "day" | "3day" | "week"
  const safeViewType = (["day", "3day", "week"].includes(viewType) ? viewType : "day") as KioskSettings["defaultView"];

  const partial: Partial<KioskSettings> = {
    defaultView: safeViewType,
    showWalkInSidebar: true,
    blockDensity: "standard",
    colorCoding: "status",
    autoLockMinutes: 5,
  };

  const resolved = resolveKioskSettings(partial);

  const viewLabels: Record<string, string> = {
    day: "Single-day schedule view",
    "3day": "3-day rolling view",
    week: "Full week overview",
  };

  return {
    resolved,
    viewLabel: viewLabels[viewType] ?? "Custom view",
    capabilities: {
      dragAndDrop: true,
      scheduleMap: true,
      resizable: false,
      offHoursDimming: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Resource Booking Actions
// ---------------------------------------------------------------------------

export interface ResourceSlotResult {
  startTime: string;
  endTime: string;
  localStart: string;
  localEnd: string;
  availableCount: number;
  totalCapacity: number;
  availableResources: { resourceId: string; resourceName: string; resourceType: string; remainingCapacity: number }[];
}

/**
 * Fetch available resource slots for the restaurant pool, filtered by party size.
 *
 * @param dateISO - The date to compute slots for (YYYY-MM-DD)
 * @param partySize - Minimum table capacity required
 * @param timezone - Customer IANA timezone for local time formatting
 */
export async function fetchResourceSlots(
  dateISO: string,
  partySize: number,
  timezone: string,
): Promise<ResourceSlotResult[]> {
  const dayStart = new Date(dateISO);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dateISO);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const resources = getResourcePool();

  const slots: ResourceSlot[] = getResourceAvailableSlots(
    resources,
    { start: dayStart, end: dayEnd },
    timezone,
    {
      duration: 90,
      slotInterval: 30,
      minCapacity: partySize,
    },
  );

  return slots.map((s) => ({
    startTime: s.startTime,
    endTime: s.endTime,
    localStart: s.localStart,
    localEnd: s.localEnd,
    availableCount: s.availableResources.length,
    totalCapacity: s.availableResources.reduce((sum, r) => sum + r.remainingCapacity, 0),
    availableResources: s.availableResources,
  }));
}

export interface ResourceAssignmentDemoResult {
  success: boolean;
  resourceId?: string;
  resourceName?: string;
  strategy: string;
  reason?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Fetch a resource assignment for the given time window, party size, and strategy.
 *
 * @param dateISO - The date (YYYY-MM-DD)
 * @param startISO - Slot start ISO string
 * @param endISO - Slot end ISO string
 * @param partySize - Party size for capacity matching
 * @param strategy - Assignment strategy
 */
export async function fetchResourceAssignment(
  dateISO: string,
  startISO: string,
  endISO: string,
  partySize: number,
  strategy: ResourceAssignmentStrategy,
): Promise<ResourceAssignmentDemoResult> {
  const resources = getResourcePool();
  const pastCounts = getResourceBookingCounts();

  try {
    const result = assignResource(resources, new Date(startISO), new Date(endISO), {
      requestedCapacity: partySize,
      strategy,
      pastCounts,
    });

    const strategyLabels: Record<string, string> = {
      best_fit: "Smallest table that fits the party",
      first_available: "First free table in floor order",
      largest_first: "Largest table available",
      round_robin: "Table with fewest bookings this service",
    };

    return {
      success: true,
      resourceId: result.resourceId,
      resourceName: result.resourceName,
      strategy,
      reason: strategyLabels[strategy] ?? result.reason,
    };
  } catch (err: unknown) {
    const errorMessages: Record<string, string> = {
      no_matching_type: "No tables of this type exist in the restaurant.",
      no_capacity: `No tables can seat a party of ${partySize}.`,
      all_booked: "All eligible tables are booked at this time.",
    };
    const code = err instanceof Error ? err.message : "all_booked";
    return {
      success: false,
      strategy,
      error: errorMessages[code] ?? "Unable to assign a table at this time.",
      errorCode: code,
    };
  }
}

export interface ResourcePoolSummaryResult {
  totalResources: number;
  availableResources: number;
  utilizationPercent: number;
  byType: Record<string, { total: number; available: number }>;
  slots: {
    localStart: string;
    availableResources: number;
    utilizationPercent: number;
  }[];
}

/**
 * Fetch a pool utilization summary for the restaurant for an entire service day.
 *
 * @param dateISO - The date (YYYY-MM-DD)
 * @param timezone - Customer IANA timezone for local time formatting
 */
export async function fetchResourcePoolSummary(
  dateISO: string,
  timezone: string,
): Promise<ResourcePoolSummaryResult> {
  const dayStart = new Date(dateISO);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dateISO);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const resources = getResourcePool();

  const summaries: ResourcePoolSummary[] = getResourcePoolSummary(
    resources,
    { start: dayStart, end: dayEnd },
    timezone,
    { duration: 90, slotInterval: 30 },
  );

  if (summaries.length === 0) {
    return {
      totalResources: resources.length,
      availableResources: resources.length,
      utilizationPercent: 0,
      byType: {},
      slots: [],
    };
  }

  // Use the first slot's byType for the header summary
  const first = summaries[0];
  const totalResources = first.totalResources;

  // Aggregate the overall available count across the day (minimum represents peak occupancy)
  const minAvailable = Math.min(...summaries.map((s) => s.availableResources));
  const peakUtilization = Math.max(...summaries.map((s) => s.utilizationPercent));

  return {
    totalResources,
    availableResources: minAvailable,
    utilizationPercent: peakUtilization,
    byType: first.byType,
    slots: summaries.map((s) => ({
      localStart: s.localStart,
      availableResources: s.availableResources,
      utilizationPercent: s.utilizationPercent,
    })),
  };
}

// ---------------------------------------------------------------------------
// Slot Release Action
// ---------------------------------------------------------------------------

export interface SlotReleaseDemoResult {
  strategy: string;
  totalSlots: number;
  releasedSlots: number;
  hiddenSlots: number;
  discountedSlots: number;
  slots: Array<{
    startTime: string;
    endTime: string;
    localStart: string;
    discountPercent?: number;
  }>;
}

/**
 * Demo action for the Slot Release strategies.
 *
 * Gets all available slots for the day using barber data, converts them to
 * raw `{start, end}` format, applies the selected strategy, and returns a
 * before/after comparison.
 *
 * @param dateISO - Date to compute slots for (YYYY-MM-DD)
 * @param strategy - Which release strategy to apply
 * @param config - Strategy-specific parameters
 */
export async function fetchSlotReleaseDemo(
  dateISO: string,
  strategy: "fill_earlier_first" | "rolling_window" | "discount_incentive",
  config: {
    threshold?: number;
    windowBoundary?: string;
    windowSize?: number;
    discountPercent?: number;
  },
): Promise<SlotReleaseDemoResult> {
  const { start: dayStart, end: dayEnd } = buildDayRange(dateISO);
  const tz = BARBER_SHOP.timezone;
  const existingBookings = getBookingsAsInput();

  // Compute all available slots for the day
  const allSlots = getAvailableSlots(
    AVAILABILITY_RULES,
    getOverrides(),
    existingBookings,
    { start: dayStart, end: dayEnd },
    tz,
    { duration: 30 },
  );

  // Convert Slot[] to raw { start, end }[] for applySlotRelease
  const rawSlots = allSlots.map((s) => ({
    start: new Date(s.startTime),
    end: new Date(s.endTime),
  }));

  // Build the strategy config discriminated union
  let releaseConfig: SlotReleaseConfig;
  if (strategy === "fill_earlier_first") {
    const boundary = config.windowBoundary ?? "12:00";
    releaseConfig = {
      strategy: "fill_earlier_first",
      threshold: config.threshold ?? 50,
      windowBoundaries: [boundary],
    };
  } else if (strategy === "rolling_window") {
    releaseConfig = {
      strategy: "rolling_window",
      windowSize: config.windowSize ?? 24,
      unit: "hours",
    };
  } else {
    releaseConfig = {
      strategy: "discount_incentive",
      tiers: [
        {
          fillRateBelowPercent: 100,
          discountPercent: config.discountPercent ?? 20,
        },
      ],
      windowBoundaries: [],
    };
  }

  const now = new Date();
  const result = applySlotRelease(rawSlots, releaseConfig, existingBookings, tz, now);

  // Build the output slots array with discount info if applicable
  const outputSlots = result.slots.map((raw) => {
    const matchingSlot = allSlots.find((s) => s.startTime === raw.start.toISOString());
    const discountPercent = result.discountMap.get(raw.start.getTime());
    return {
      startTime: raw.start.toISOString(),
      endTime: raw.end.toISOString(),
      localStart: matchingSlot?.localStart ?? raw.start.toISOString(),
      ...(discountPercent !== undefined ? { discountPercent } : {}),
    };
  });

  const discountedSlots = [...result.discountMap.values()].filter((v) => v > 0).length;

  return {
    strategy,
    totalSlots: rawSlots.length,
    releasedSlots: result.slots.length,
    hiddenSlots: rawSlots.length - result.slots.length,
    discountedSlots,
    slots: outputSlots,
  };
}
