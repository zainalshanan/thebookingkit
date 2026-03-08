import { describe, it, expect } from "vitest";
import {
  resolveTemplateVariables,
  evaluateConditions,
  validateWorkflow,
  matchWorkflows,
  DEFAULT_TEMPLATES,
  WorkflowValidationError,
  type WorkflowDefinition,
  type WorkflowContext,
  type WorkflowCondition,
} from "../workflows.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWorkflow(
  overrides?: Partial<WorkflowDefinition>,
): WorkflowDefinition {
  return {
    id: "wf-1",
    name: "Confirmation Email",
    trigger: "booking_created",
    conditions: [],
    actions: [
      {
        type: "send_email",
        to: "customer",
        subject: "Booking Confirmed: {booking.title}",
        body: "Hi {attendee.name}, your booking is confirmed.",
      },
    ],
    isActive: true,
    ...overrides,
  };
}

const sampleContext: WorkflowContext = {
  bookingId: "bk-1",
  eventTypeId: "evt-1",
  providerId: "prov-1",
  customerEmail: "jane@example.com",
  customerName: "Jane Doe",
  hostName: "Dr. Smith",
  eventTitle: "Consultation",
  eventDuration: 30,
  eventLocation: "123 Main St",
  startsAt: new Date("2026-03-15T14:00:00Z"),
  endsAt: new Date("2026-03-15T14:30:00Z"),
  managementUrl: "https://example.com/manage/bk-1",
  status: "confirmed",
};

// ---------------------------------------------------------------------------
// resolveTemplateVariables
// ---------------------------------------------------------------------------

describe("resolveTemplateVariables", () => {
  it("resolves all standard variables", () => {
    const template =
      "Hi {attendee.name}, your {booking.title} with {host.name} is on {booking.date} at {booking.startTime}–{booking.endTime}. Duration: {event.duration}. Location: {event.location}. Manage: {booking.managementUrl}";
    const result = resolveTemplateVariables(template, sampleContext);

    expect(result).toContain("Jane Doe");
    expect(result).toContain("Consultation");
    expect(result).toContain("Dr. Smith");
    expect(result).toContain("30 minutes");
    expect(result).toContain("123 Main St");
    expect(result).toContain("https://example.com/manage/bk-1");
    expect(result).not.toContain("{");
  });

  it("replaces missing variables with empty strings", () => {
    const template = "Hi {attendee.name}, location: {event.location}";
    const result = resolveTemplateVariables(template, {
      customerName: "Jane",
    });

    expect(result).toBe("Hi Jane, location: ");
  });

  it("handles template with no variables", () => {
    const result = resolveTemplateVariables("Hello world", sampleContext);
    expect(result).toBe("Hello world");
  });

  it("handles empty template", () => {
    const result = resolveTemplateVariables("", sampleContext);
    expect(result).toBe("");
  });

  it("resolves default confirmation template", () => {
    const result = resolveTemplateVariables(
      DEFAULT_TEMPLATES.confirmation.body,
      sampleContext,
    );

    expect(result).toContain("Jane Doe");
    expect(result).toContain("Consultation");
    expect(result).toContain("Dr. Smith");
    expect(result).not.toContain("{attendee.name}");
  });

  it("resolves default reminder template", () => {
    const result = resolveTemplateVariables(
      DEFAULT_TEMPLATES.reminder_24h.body,
      sampleContext,
    );

    expect(result).toContain("Jane Doe");
    expect(result).toContain("Consultation");
  });

  it("resolves default cancellation template", () => {
    const result = resolveTemplateVariables(
      DEFAULT_TEMPLATES.cancellation.body,
      sampleContext,
    );

    expect(result).toContain("Jane Doe");
    expect(result).toContain("Consultation");
  });
});

// ---------------------------------------------------------------------------
// evaluateConditions
// ---------------------------------------------------------------------------

describe("evaluateConditions", () => {
  it("returns true for empty conditions (unconditional)", () => {
    expect(evaluateConditions([], sampleContext)).toBe(true);
  });

  it("equals operator matches", () => {
    const conditions: WorkflowCondition[] = [
      { field: "eventTypeId", operator: "equals", value: "evt-1" },
    ];
    expect(evaluateConditions(conditions, sampleContext)).toBe(true);
  });

  it("equals operator rejects non-match", () => {
    const conditions: WorkflowCondition[] = [
      { field: "eventTypeId", operator: "equals", value: "evt-2" },
    ];
    expect(evaluateConditions(conditions, sampleContext)).toBe(false);
  });

  it("not_equals operator works", () => {
    const conditions: WorkflowCondition[] = [
      { field: "status", operator: "not_equals", value: "cancelled" },
    ];
    expect(evaluateConditions(conditions, sampleContext)).toBe(true);
  });

  it("contains operator works (case-insensitive)", () => {
    const conditions: WorkflowCondition[] = [
      { field: "customerEmail", operator: "contains", value: "EXAMPLE" },
    ];
    expect(evaluateConditions(conditions, sampleContext)).toBe(true);
  });

  it("in operator works with array", () => {
    const conditions: WorkflowCondition[] = [
      { field: "status", operator: "in", value: ["confirmed", "pending"] },
    ];
    expect(evaluateConditions(conditions, sampleContext)).toBe(true);
  });

  it("in operator rejects when not in array", () => {
    const conditions: WorkflowCondition[] = [
      { field: "status", operator: "in", value: ["cancelled", "pending"] },
    ];
    expect(evaluateConditions(conditions, sampleContext)).toBe(false);
  });

  it("requires ALL conditions to match (AND logic)", () => {
    const conditions: WorkflowCondition[] = [
      { field: "eventTypeId", operator: "equals", value: "evt-1" },
      { field: "status", operator: "equals", value: "cancelled" }, // doesn't match
    ];
    expect(evaluateConditions(conditions, sampleContext)).toBe(false);
  });

  it("handles missing context fields gracefully", () => {
    const conditions: WorkflowCondition[] = [
      { field: "nonexistentField", operator: "equals", value: "" },
    ];
    expect(evaluateConditions(conditions, sampleContext)).toBe(true); // "" === ""
  });
});

// ---------------------------------------------------------------------------
// validateWorkflow
// ---------------------------------------------------------------------------

describe("validateWorkflow", () => {
  it("accepts valid workflow", () => {
    expect(() => validateWorkflow(makeWorkflow())).not.toThrow();
  });

  it("rejects empty name", () => {
    expect(() => validateWorkflow(makeWorkflow({ name: "" }))).toThrow(
      WorkflowValidationError,
    );
    expect(() => validateWorkflow(makeWorkflow({ name: "" }))).toThrow(
      "name is required",
    );
  });

  it("rejects invalid trigger", () => {
    expect(() =>
      validateWorkflow(makeWorkflow({ trigger: "invalid" as never })),
    ).toThrow("Invalid trigger");
  });

  it("rejects empty actions", () => {
    expect(() =>
      validateWorkflow(makeWorkflow({ actions: [] })),
    ).toThrow("at least one action");
  });

  it("rejects email action without to", () => {
    expect(() =>
      validateWorkflow(
        makeWorkflow({
          actions: [
            { type: "send_email", to: "", subject: "Hi", body: "Hello" },
          ],
        }),
      ),
    ).toThrow("'to' field");
  });

  it("rejects email action without subject", () => {
    expect(() =>
      validateWorkflow(
        makeWorkflow({
          actions: [
            { type: "send_email", to: "customer", subject: "", body: "Hello" },
          ],
        }),
      ),
    ).toThrow("'subject' field");
  });

  it("rejects email action without body", () => {
    expect(() =>
      validateWorkflow(
        makeWorkflow({
          actions: [
            { type: "send_email", to: "customer", subject: "Hi", body: "" },
          ],
        }),
      ),
    ).toThrow("'body' field");
  });

  it("rejects SMS action without to", () => {
    expect(() =>
      validateWorkflow(
        makeWorkflow({
          actions: [{ type: "send_sms", to: "", body: "Hello" }],
        }),
      ),
    ).toThrow("'to' field");
  });

  it("rejects webhook action without url", () => {
    expect(() =>
      validateWorkflow(
        makeWorkflow({
          actions: [{ type: "fire_webhook", url: "" }],
        }),
      ),
    ).toThrow("'url' field");
  });

  it("rejects status update action without status", () => {
    expect(() =>
      validateWorkflow(
        makeWorkflow({
          actions: [{ type: "update_status", status: "" }],
        }),
      ),
    ).toThrow("'status' field");
  });

  it("accepts calendar event action with no extra fields", () => {
    expect(() =>
      validateWorkflow(
        makeWorkflow({
          actions: [{ type: "create_calendar_event" }],
        }),
      ),
    ).not.toThrow();
  });

  it("rejects condition with empty field", () => {
    expect(() =>
      validateWorkflow(
        makeWorkflow({
          conditions: [{ field: "", operator: "equals", value: "x" }],
        }),
      ),
    ).toThrow("Condition field is required");
  });

  it("rejects invalid condition operator", () => {
    expect(() =>
      validateWorkflow(
        makeWorkflow({
          conditions: [
            { field: "status", operator: "invalid" as never, value: "x" },
          ],
        }),
      ),
    ).toThrow("Invalid condition operator");
  });

  it("validates all supported triggers", () => {
    const triggers = [
      "booking_created",
      "booking_confirmed",
      "booking_cancelled",
      "booking_rescheduled",
      "before_event",
      "after_event",
      "payment_received",
      "payment_failed",
      "no_show_confirmed",
      "form_submitted",
    ] as const;

    for (const trigger of triggers) {
      expect(() =>
        validateWorkflow(makeWorkflow({ trigger })),
      ).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// matchWorkflows
// ---------------------------------------------------------------------------

describe("matchWorkflows", () => {
  const workflows: WorkflowDefinition[] = [
    makeWorkflow({ id: "wf-1", trigger: "booking_created" }),
    makeWorkflow({
      id: "wf-2",
      trigger: "booking_cancelled",
      conditions: [
        { field: "eventTypeId", operator: "equals", value: "evt-1" },
      ],
    }),
    makeWorkflow({
      id: "wf-3",
      trigger: "booking_created",
      isActive: false,
    }),
    makeWorkflow({
      id: "wf-4",
      trigger: "booking_created",
      conditions: [
        { field: "eventTypeId", operator: "equals", value: "evt-99" },
      ],
    }),
  ];

  it("matches active workflows with matching trigger", () => {
    const matched = matchWorkflows(workflows, "booking_created", sampleContext);
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe("wf-1");
  });

  it("excludes inactive workflows", () => {
    const matched = matchWorkflows(workflows, "booking_created", sampleContext);
    expect(matched.find((w) => w.id === "wf-3")).toBeUndefined();
  });

  it("excludes workflows with unmet conditions", () => {
    const matched = matchWorkflows(workflows, "booking_created", sampleContext);
    expect(matched.find((w) => w.id === "wf-4")).toBeUndefined();
  });

  it("matches workflows with met conditions", () => {
    const matched = matchWorkflows(
      workflows,
      "booking_cancelled",
      sampleContext,
    );
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe("wf-2");
  });

  it("returns empty array when no workflows match", () => {
    const matched = matchWorkflows(workflows, "payment_received", sampleContext);
    expect(matched).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_TEMPLATES
// ---------------------------------------------------------------------------

describe("DEFAULT_TEMPLATES", () => {
  it("has all expected templates", () => {
    expect(DEFAULT_TEMPLATES).toHaveProperty("confirmation");
    expect(DEFAULT_TEMPLATES).toHaveProperty("reminder_24h");
    expect(DEFAULT_TEMPLATES).toHaveProperty("reminder_1h");
    expect(DEFAULT_TEMPLATES).toHaveProperty("cancellation");
    expect(DEFAULT_TEMPLATES).toHaveProperty("followup");
  });

  it("each template has subject and body", () => {
    for (const [, template] of Object.entries(DEFAULT_TEMPLATES)) {
      expect(template.subject).toBeTruthy();
      expect(template.body).toBeTruthy();
    }
  });
});
