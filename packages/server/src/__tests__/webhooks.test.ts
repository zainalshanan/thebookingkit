import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  signWebhookPayload,
  verifyWebhookSignature,
  createWebhookEnvelope,
  resolvePayloadTemplate,
  matchWebhookSubscriptions,
  getRetryDelay,
  isSuccessResponse,
  validateWebhookSubscription,
  WebhookValidationError,
  DEFAULT_RETRY_CONFIG,
  WEBHOOK_TRIGGERS,
  type WebhookSubscription,
  type WebhookPayload,
  type WebhookTrigger,
} from "../webhooks.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const testSecret = "whsec_test_secret_key_123";
const testPayload = '{"triggerEvent":"BOOKING_CREATED","payload":{}}';

const samplePayload: WebhookPayload = {
  bookingId: "bk-1",
  eventType: "consultation",
  startTime: "2026-03-15T14:00:00.000Z",
  endTime: "2026-03-15T14:30:00.000Z",
  organizer: { name: "Dr. Smith", email: "smith@example.com" },
  attendees: [{ email: "jane@example.com", name: "Jane Doe" }],
  status: "confirmed",
};

function makeSub(
  overrides?: Partial<WebhookSubscription>,
): WebhookSubscription {
  return {
    id: "wh-1",
    subscriberUrl: "https://api.example.com/webhooks",
    triggers: ["BOOKING_CREATED"],
    isActive: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// signWebhookPayload
// ---------------------------------------------------------------------------

describe("signWebhookPayload", () => {
  it("produces a hex-encoded HMAC-SHA256 signature", () => {
    const sig = signWebhookPayload(testPayload, testSecret, 1710000000);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different signatures for different payloads", () => {
    const sig1 = signWebhookPayload("body1", testSecret, 1710000000);
    const sig2 = signWebhookPayload("body2", testSecret, 1710000000);
    expect(sig1).not.toBe(sig2);
  });

  it("produces different signatures for different timestamps", () => {
    const sig1 = signWebhookPayload(testPayload, testSecret, 1710000000);
    const sig2 = signWebhookPayload(testPayload, testSecret, 1710000001);
    expect(sig1).not.toBe(sig2);
  });

  it("produces different signatures for different secrets", () => {
    const sig1 = signWebhookPayload(testPayload, "secret1", 1710000000);
    const sig2 = signWebhookPayload(testPayload, "secret2", 1710000000);
    expect(sig1).not.toBe(sig2);
  });
});

// ---------------------------------------------------------------------------
// verifyWebhookSignature
// ---------------------------------------------------------------------------

describe("verifyWebhookSignature", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns valid for a correct signature within tolerance", () => {
    const now = 1710000000;
    vi.setSystemTime(now * 1000);
    const sig = signWebhookPayload(testPayload, testSecret, now);

    const result = verifyWebhookSignature(
      testPayload,
      sig,
      now,
      testSecret,
    );
    expect(result).toEqual({ valid: true });
  });

  it("returns signature_mismatch for tampered payload", () => {
    const now = 1710000000;
    vi.setSystemTime(now * 1000);
    const sig = signWebhookPayload(testPayload, testSecret, now);

    const result = verifyWebhookSignature(
      "tampered_body",
      sig,
      now,
      testSecret,
    );
    expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
  });

  it("returns signature_mismatch for wrong secret", () => {
    const now = 1710000000;
    vi.setSystemTime(now * 1000);
    const sig = signWebhookPayload(testPayload, testSecret, now);

    const result = verifyWebhookSignature(
      testPayload,
      sig,
      now,
      "wrong_secret",
    );
    expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
  });

  it("returns timestamp_expired for old timestamp (>5 min)", () => {
    const now = 1710000600; // 10 min later
    vi.setSystemTime(now * 1000);
    const oldTimestamp = now - 301; // 5 min 1 sec ago
    const sig = signWebhookPayload(testPayload, testSecret, oldTimestamp);

    const result = verifyWebhookSignature(
      testPayload,
      sig,
      oldTimestamp,
      testSecret,
    );
    expect(result).toEqual({ valid: false, reason: "timestamp_expired" });
  });

  it("accepts timestamp within tolerance", () => {
    const now = 1710000000;
    vi.setSystemTime(now * 1000);
    const recentTimestamp = now - 299; // 4 min 59 sec ago
    const sig = signWebhookPayload(testPayload, testSecret, recentTimestamp);

    const result = verifyWebhookSignature(
      testPayload,
      sig,
      recentTimestamp,
      testSecret,
    );
    expect(result).toEqual({ valid: true });
  });

  it("supports custom tolerance", () => {
    const now = 1710000000;
    vi.setSystemTime(now * 1000);
    const oldTimestamp = now - 61;
    const sig = signWebhookPayload(testPayload, testSecret, oldTimestamp);

    const result = verifyWebhookSignature(
      testPayload,
      sig,
      oldTimestamp,
      testSecret,
      { toleranceSeconds: 60 },
    );
    expect(result).toEqual({ valid: false, reason: "timestamp_expired" });
  });

  it("rejects future timestamps beyond tolerance", () => {
    const now = 1710000000;
    vi.setSystemTime(now * 1000);
    const futureTimestamp = now + 400;
    const sig = signWebhookPayload(testPayload, testSecret, futureTimestamp);

    const result = verifyWebhookSignature(
      testPayload,
      sig,
      futureTimestamp,
      testSecret,
    );
    expect(result).toEqual({ valid: false, reason: "timestamp_expired" });
  });
});

// ---------------------------------------------------------------------------
// createWebhookEnvelope
// ---------------------------------------------------------------------------

describe("createWebhookEnvelope", () => {
  it("creates a valid envelope with ISO 8601 timestamp", () => {
    const envelope = createWebhookEnvelope("BOOKING_CREATED", samplePayload);

    expect(envelope.triggerEvent).toBe("BOOKING_CREATED");
    expect(envelope.payload).toBe(samplePayload);
    expect(new Date(envelope.createdAt).toISOString()).toBe(
      envelope.createdAt,
    );
  });
});

// ---------------------------------------------------------------------------
// resolvePayloadTemplate
// ---------------------------------------------------------------------------

describe("resolvePayloadTemplate", () => {
  const envelope = createWebhookEnvelope("BOOKING_CREATED", samplePayload);

  it("resolves all standard template variables", () => {
    const template = '{"event":"{{triggerEvent}}","booking":"{{bookingId}}","type":"{{eventType}}","start":"{{startTime}}","end":"{{endTime}}","status":"{{status}}","org":"{{organizerName}}","email":"{{organizerEmail}}"}';
    const result = resolvePayloadTemplate(template, envelope);
    const parsed = JSON.parse(result);

    expect(parsed.event).toBe("BOOKING_CREATED");
    expect(parsed.booking).toBe("bk-1");
    expect(parsed.type).toBe("consultation");
    expect(parsed.start).toBe("2026-03-15T14:00:00.000Z");
    expect(parsed.status).toBe("confirmed");
    expect(parsed.org).toBe("Dr. Smith");
    expect(parsed.email).toBe("smith@example.com");
  });

  it("handles template with no variables", () => {
    const result = resolvePayloadTemplate('{"static":"value"}', envelope);
    expect(result).toBe('{"static":"value"}');
  });
});

// ---------------------------------------------------------------------------
// matchWebhookSubscriptions
// ---------------------------------------------------------------------------

describe("matchWebhookSubscriptions", () => {
  const subs: WebhookSubscription[] = [
    makeSub({ id: "wh-1", triggers: ["BOOKING_CREATED", "BOOKING_CANCELLED"] }),
    makeSub({ id: "wh-2", triggers: ["BOOKING_CREATED"], isActive: false }),
    makeSub({
      id: "wh-3",
      triggers: ["BOOKING_CREATED"],
      eventTypeId: "evt-1",
    }),
    makeSub({
      id: "wh-4",
      triggers: ["BOOKING_CREATED"],
      teamId: "team-1",
    }),
  ];

  it("matches active webhooks with matching trigger", () => {
    const matched = matchWebhookSubscriptions(subs, "BOOKING_CREATED");
    expect(matched.map((s) => s.id)).toContain("wh-1");
  });

  it("excludes inactive webhooks", () => {
    const matched = matchWebhookSubscriptions(subs, "BOOKING_CREATED");
    expect(matched.find((s) => s.id === "wh-2")).toBeUndefined();
  });

  it("matches scoped webhooks when scope matches", () => {
    const matched = matchWebhookSubscriptions(subs, "BOOKING_CREATED", {
      eventTypeId: "evt-1",
    });
    expect(matched.find((s) => s.id === "wh-3")).toBeDefined();
  });

  it("excludes scoped webhooks when scope doesn't match", () => {
    const matched = matchWebhookSubscriptions(subs, "BOOKING_CREATED", {
      eventTypeId: "evt-99",
    });
    expect(matched.find((s) => s.id === "wh-3")).toBeUndefined();
  });

  it("matches team-scoped webhooks", () => {
    const matched = matchWebhookSubscriptions(subs, "BOOKING_CREATED", {
      teamId: "team-1",
    });
    expect(matched.find((s) => s.id === "wh-4")).toBeDefined();
  });

  it("returns empty for unsubscribed trigger", () => {
    const matched = matchWebhookSubscriptions(subs, "OOO_CREATED");
    expect(matched).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getRetryDelay
// ---------------------------------------------------------------------------

describe("getRetryDelay", () => {
  it("returns correct delays for default config", () => {
    expect(getRetryDelay(0)).toBe(10);
    expect(getRetryDelay(1)).toBe(60);
    expect(getRetryDelay(2)).toBe(300);
  });

  it("returns null when max retries exceeded", () => {
    expect(getRetryDelay(3)).toBeNull();
    expect(getRetryDelay(10)).toBeNull();
  });

  it("uses custom config", () => {
    const config = { maxRetries: 2, backoffSeconds: [5, 30] };
    expect(getRetryDelay(0, config)).toBe(5);
    expect(getRetryDelay(1, config)).toBe(30);
    expect(getRetryDelay(2, config)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isSuccessResponse
// ---------------------------------------------------------------------------

describe("isSuccessResponse", () => {
  it("returns true for 200", () => {
    expect(isSuccessResponse(200)).toBe(true);
  });

  it("returns true for 201", () => {
    expect(isSuccessResponse(201)).toBe(true);
  });

  it("returns true for 204", () => {
    expect(isSuccessResponse(204)).toBe(true);
  });

  it("returns false for 400", () => {
    expect(isSuccessResponse(400)).toBe(false);
  });

  it("returns false for 500", () => {
    expect(isSuccessResponse(500)).toBe(false);
  });

  it("returns false for 301 redirect", () => {
    expect(isSuccessResponse(301)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateWebhookSubscription
// ---------------------------------------------------------------------------

describe("validateWebhookSubscription", () => {
  it("accepts valid subscription", () => {
    expect(() =>
      validateWebhookSubscription({
        subscriberUrl: "https://example.com/webhook",
        triggers: ["BOOKING_CREATED"],
        isActive: true,
      }),
    ).not.toThrow();
  });

  it("rejects missing URL", () => {
    expect(() =>
      validateWebhookSubscription({
        subscriberUrl: "",
        triggers: ["BOOKING_CREATED"],
        isActive: true,
      }),
    ).toThrow("Subscriber URL is required");
  });

  it("rejects invalid URL", () => {
    expect(() =>
      validateWebhookSubscription({
        subscriberUrl: "not-a-url",
        triggers: ["BOOKING_CREATED"],
        isActive: true,
      }),
    ).toThrow("Invalid subscriber URL");
  });

  it("rejects empty triggers array", () => {
    expect(() =>
      validateWebhookSubscription({
        subscriberUrl: "https://example.com/webhook",
        triggers: [],
        isActive: true,
      }),
    ).toThrow("At least one trigger");
  });

  it("rejects invalid trigger", () => {
    expect(() =>
      validateWebhookSubscription({
        subscriberUrl: "https://example.com/webhook",
        triggers: ["INVALID_TRIGGER" as WebhookTrigger],
        isActive: true,
      }),
    ).toThrow('Invalid trigger: "INVALID_TRIGGER"');
  });

  it("accepts all valid triggers", () => {
    expect(() =>
      validateWebhookSubscription({
        subscriberUrl: "https://example.com/webhook",
        triggers: [...WEBHOOK_TRIGGERS],
        isActive: true,
      }),
    ).not.toThrow();
  });
});
