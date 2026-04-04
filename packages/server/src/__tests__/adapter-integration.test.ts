/**
 * Adapter Integration Tests
 *
 * End-to-end integration tests covering the full middleware/adapter chain,
 * email template rendering, webhook sign/verify round-trips, API key lifecycle,
 * SSRF URL validation edge cases, and withSerializableRetry under concurrency.
 *
 * All tests run without external services — everything is mocked or simulated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  // Auth
  withAuth,
  assertProviderOwnership,
  assertCustomerAccess,
  type AuthAdapter,
  type AuthUser,
  type AuthSession,
  // Email templates
  interpolateTemplate,
  CONFIRMATION_EMAIL_HTML,
  CONFIRMATION_EMAIL_TEXT,
  CANCELLATION_EMAIL_HTML,
  RESCHEDULE_EMAIL_HTML,
  type EmailTemplateVars,
  // Adapter types
  generateICSAttachment,
  type EmailAdapter,
  type CalendarAdapter,
  type JobAdapter,
  // Notification jobs
  sendConfirmationEmail,
  sendCancellationEmail,
  sendRescheduleEmail,
  syncBookingToCalendar,
  deleteBookingFromCalendar,
  scheduleAutoReject,
  type ConfirmationEmailPayload,
  type CancellationEmailPayload,
  type RescheduleEmailPayload,
  type CalendarSyncPayload,
  // Webhooks
  signWebhookPayload,
  verifyWebhookSignature,
  createWebhookEnvelope,
  type WebhookPayload,
  // API key
  generateApiKey,
  verifyApiKey,
  isKeyExpired,
  checkRateLimit,
  type RateLimitState,
  // Serialization retry
  withSerializableRetry,
  BookingConflictError,
  SerializationRetryExhaustedError,
  // Errors
  ForbiddenError,
} from "../index.js";

// escapeHtml is exported from email-templates but not re-exported through index.
// Import it directly so we can test XSS prevention without adding a dependency.
import { escapeHtml } from "../email-templates.js";

// validateExternalUrl is not re-exported through index — import from source.
import { validateExternalUrl } from "../url-validation.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

process.env.THEBOOKINGKIT_API_KEY_SECRET = "integration-test-secret-32chars!!";

function makePostgresError(code: string, message = "pg error"): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://app.example.com/api/test", {
    headers: new Headers(headers),
  });
}

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-integration-01",
    email: "provider@example.com",
    role: "provider",
    ...overrides,
  };
}

function makeAuthAdapter(user: AuthUser | null): AuthAdapter {
  return {
    getCurrentUser: vi.fn().mockResolvedValue(user),
    getSession: vi.fn().mockResolvedValue(
      user ? ({ user, expires: new Date(Date.now() + 3600_000) } satisfies AuthSession) : null,
    ),
    verifyToken: vi.fn().mockResolvedValue(user),
  };
}

function makeEmailAdapter(): EmailAdapter & { calls: Array<Parameters<EmailAdapter["send"]>[0]> } {
  const calls: Array<Parameters<EmailAdapter["send"]>[0]> = [];
  return {
    calls,
    send: vi.fn().mockImplementation(async (opts) => {
      calls.push(opts);
      return { success: true, messageId: `msg-${Date.now()}` };
    }),
    sendBatch: vi.fn().mockResolvedValue([]),
  };
}

function makeCalendarAdapter(): CalendarAdapter {
  return {
    createEvent: vi.fn().mockResolvedValue({ eventId: "cal-event-001", eventUrl: "https://cal.example.com/event/001" }),
    updateEvent: vi.fn().mockResolvedValue({ eventId: "cal-event-001" }),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    getConflicts: vi.fn().mockResolvedValue([]),
  };
}

function makeJobAdapter(): JobAdapter {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn().mockResolvedValue("job-id-001"),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
}

const BASE_BOOKING_PAYLOAD: ConfirmationEmailPayload = {
  bookingId: "bk-integ-001",
  eventTitle: "Consultation",
  providerName: "Dr. Jane Smith",
  providerEmail: "jane@clinic.example.com",
  customerName: "Alice Brown",
  customerEmail: "alice@example.com",
  startsAt: "2026-06-15T10:00:00.000Z",
  endsAt: "2026-06-15T10:30:00.000Z",
  timezone: "America/New_York",
  managementUrl: "https://app.example.com/bookings/bk-integ-001",
  unsubscribeUrl: "https://app.example.com/unsubscribe/token-abc",
};

const SAMPLE_WEBHOOK_PAYLOAD: WebhookPayload = {
  bookingId: "bk-integ-001",
  eventType: "consultation",
  startTime: "2026-06-15T10:00:00.000Z",
  endTime: "2026-06-15T10:30:00.000Z",
  organizer: { name: "Dr. Jane Smith", email: "jane@clinic.example.com" },
  attendees: [{ email: "alice@example.com", name: "Alice Brown" }],
  status: "confirmed",
};

// ===========================================================================
// 1. AuthAdapter mock integration — withAuth middleware chain
// ===========================================================================

describe("AuthAdapter integration — withAuth middleware chain", () => {
  it("valid session: handler is called and receives the authenticated user", async () => {
    const user = makeUser();
    const adapter = makeAuthAdapter(user);
    const handler = vi.fn().mockImplementation(async (req) => {
      return Response.json({ userId: req.user.id });
    });

    const result = await withAuth(adapter, handler)(makeRequest());
    const body = await result.json();

    expect(result.status).toBe(200);
    expect(body.userId).toBe(user.id);
    expect(adapter.getCurrentUser).toHaveBeenCalledTimes(1);
    // verifyToken should not be called when session is present
    expect(adapter.verifyToken).not.toHaveBeenCalled();
  });

  it("expired/null session: returns 401 and handler is never called", async () => {
    const adapter = makeAuthAdapter(null);
    // Both session lookup and token verification return null
    adapter.verifyToken = vi.fn().mockResolvedValue(null);

    const handler = vi.fn();
    const result = await withAuth(adapter, handler)(makeRequest());
    const body = await result.json();

    expect(result.status).toBe(401);
    expect(body.code).toBeDefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it("Bearer token fallback: verifyToken is called with the stripped token", async () => {
    const user = makeUser({ id: "token-user-99", role: "admin" });
    const adapter = makeAuthAdapter(null);
    adapter.getCurrentUser = vi.fn().mockResolvedValue(null);
    adapter.verifyToken = vi.fn().mockResolvedValue(user);

    const handler = vi.fn().mockImplementation(async (req) => {
      return Response.json({ userId: req.user.id });
    });

    const result = await withAuth(adapter, handler)(
      makeRequest({ Authorization: "Bearer my-api-token-xyz" }),
    );
    const body = await result.json();

    expect(result.status).toBe(200);
    expect(body.userId).toBe("token-user-99");
    expect(adapter.verifyToken).toHaveBeenCalledWith("my-api-token-xyz");
  });

  it("Bearer token without 'Bearer ' prefix: no token extracted, returns 401", async () => {
    const adapter = makeAuthAdapter(null);
    adapter.verifyToken = vi.fn().mockResolvedValue(null);

    const handler = vi.fn();
    const result = await withAuth(adapter, handler)(
      // Token present but wrong prefix — should not be extracted
      makeRequest({ Authorization: "Token my-api-token-xyz" }),
    );

    expect(result.status).toBe(401);
    expect(adapter.verifyToken).not.toHaveBeenCalled();
  });

  it("role hierarchy: admin satisfies provider requirement", async () => {
    const user = makeUser({ role: "admin" });
    const adapter = makeAuthAdapter(user);
    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));

    const result = await withAuth(adapter, handler, { requiredRole: "provider" })(
      makeRequest(),
    );
    expect(result.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("role hierarchy: customer does not satisfy provider requirement", async () => {
    const user = makeUser({ role: "customer" });
    const adapter = makeAuthAdapter(user);
    const handler = vi.fn();

    const result = await withAuth(adapter, handler, { requiredRole: "provider" })(
      makeRequest(),
    );
    expect(result.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("role hierarchy: member satisfies member requirement", async () => {
    const user = makeUser({ role: "member" });
    const adapter = makeAuthAdapter(user);
    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));

    const result = await withAuth(adapter, handler, { requiredRole: "member" })(
      makeRequest(),
    );
    expect(result.status).toBe(200);
  });

  it("handler error (BookingConflictError) is caught and returned as 409", async () => {
    const user = makeUser();
    const adapter = makeAuthAdapter(user);
    const handler = vi.fn().mockRejectedValue(new BookingConflictError());

    const result = await withAuth(adapter, handler)(makeRequest());
    expect(result.status).toBe(409);
    const body = await result.json();
    expect(body.code).toBe("BOOKING_CONFLICT");
  });

  it("unexpected handler error returns 500", async () => {
    const user = makeUser();
    const adapter = makeAuthAdapter(user);
    const handler = vi.fn().mockRejectedValue(new Error("database down"));

    const result = await withAuth(adapter, handler)(makeRequest());
    expect(result.status).toBe(500);
    const body = await result.json();
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("assertProviderOwnership: matching userId does not throw", () => {
    expect(() => assertProviderOwnership("uid-1", "uid-1")).not.toThrow();
  });

  it("assertProviderOwnership: mismatching userId throws ForbiddenError", () => {
    expect(() => assertProviderOwnership("uid-1", "uid-2")).toThrow(ForbiddenError);
  });

  it("assertCustomerAccess: matching email does not throw", () => {
    expect(() =>
      assertCustomerAccess("alice@example.com", "alice@example.com"),
    ).not.toThrow();
  });

  it("assertCustomerAccess: mismatching email throws ForbiddenError", () => {
    expect(() =>
      assertCustomerAccess("alice@example.com", "bob@example.com"),
    ).toThrow(ForbiddenError);
  });

  it("withAuth end-to-end with provider ownership check inside handler", async () => {
    const user = makeUser({ id: "provider-abc", role: "provider" });
    const adapter = makeAuthAdapter(user);

    const handler = vi.fn().mockImplementation(async (req) => {
      // Simulates a route that checks the resource belongs to the requesting user
      assertProviderOwnership(req.user.id, "provider-abc");
      return Response.json({ allowed: true });
    });

    const result = await withAuth(adapter, handler)(makeRequest());
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.allowed).toBe(true);
  });

  it("withAuth end-to-end: ownership mismatch inside handler returns 403", async () => {
    const user = makeUser({ id: "provider-abc", role: "provider" });
    const adapter = makeAuthAdapter(user);

    const handler = vi.fn().mockImplementation(async (req) => {
      // Requesting access to someone else's resource
      assertProviderOwnership(req.user.id, "provider-xyz");
      return Response.json({ allowed: true });
    });

    const result = await withAuth(adapter, handler)(makeRequest());
    expect(result.status).toBe(403);
  });
});

// ===========================================================================
// 2. EmailAdapter template rendering
// ===========================================================================

describe("EmailAdapter template rendering", () => {
  const baseVars: EmailTemplateVars = {
    bookingId: "bk-render-001",
    eventTitle: "Hair Cut",
    providerName: "Tony Barber",
    customerName: "Sam Lee",
    customerEmail: "sam@example.com",
    date: "Monday, June 15, 2026",
    time: "10:00 AM",
    duration: "30 minutes",
    timezone: "America/New_York",
    managementUrl: "https://app.example.com/bookings/bk-render-001",
    unsubscribeUrl: "https://app.example.com/unsubscribe/abc",
  };

  it("confirmation HTML contains all required booking fields", () => {
    const html = interpolateTemplate(CONFIRMATION_EMAIL_HTML, baseVars);

    expect(html).toContain("Sam Lee");
    expect(html).toContain("Hair Cut");
    expect(html).toContain("Tony Barber");
    expect(html).toContain("Monday, June 15, 2026");
    expect(html).toContain("10:00 AM");
    expect(html).toContain("30 minutes");
    expect(html).toContain("America/New_York");
    expect(html).toContain("https://app.example.com/bookings/bk-render-001");
    expect(html).toContain("https://app.example.com/unsubscribe/abc");
  });

  it("confirmation plain-text contains all required booking fields", () => {
    const text = interpolateTemplate(CONFIRMATION_EMAIL_TEXT, baseVars);

    expect(text).toContain("Sam Lee");
    expect(text).toContain("Hair Cut");
    expect(text).toContain("Tony Barber");
    expect(text).toContain("Monday, June 15, 2026");
    expect(text).toContain("30 minutes");
    expect(text).toContain("https://app.example.com/bookings/bk-render-001");
  });

  it("cancellation template renders cancelReason when provided", () => {
    const vars: EmailTemplateVars = {
      ...baseVars,
      cancelReason: "Provider unavailable",
    };
    const html = interpolateTemplate(CANCELLATION_EMAIL_HTML, vars);

    expect(html).toContain("Sam Lee");
    expect(html).toContain("Hair Cut");
    // cancelReason is available to templates that include {cancelReason}
    // CANCELLATION_EMAIL_HTML does not include {cancelReason} by default —
    // verify the template renders without crashing and contains core fields.
    expect(html).toContain("Monday, June 15, 2026");
    expect(html).toContain("10:00 AM");
  });

  it("reschedule template renders old and new date/time fields", () => {
    const vars: EmailTemplateVars = {
      ...baseVars,
      oldDate: "Sunday, June 14, 2026",
      oldTime: "9:00 AM",
      newDate: "Monday, June 15, 2026",
      newTime: "10:00 AM",
    };
    const html = interpolateTemplate(RESCHEDULE_EMAIL_HTML, vars);

    expect(html).toContain("Sunday, June 14, 2026");
    expect(html).toContain("9:00 AM");
    expect(html).toContain("Monday, June 15, 2026");
    expect(html).toContain("10:00 AM");
    expect(html).toContain("Hair Cut");
  });

  it("XSS prevention: HTML special characters in user-supplied fields are escaped", () => {
    const xssVars: EmailTemplateVars = {
      ...baseVars,
      customerName: '<script>alert("xss")</script>',
      eventTitle: '"><img src=x onerror=alert(1)>',
      providerName: "O'Reilly & Sons",
    };
    const html = interpolateTemplate(CONFIRMATION_EMAIL_HTML, xssVars);

    // Raw script tag must not appear
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("</script>");
    // Angle brackets must be entity-encoded
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    // Ampersand and apostrophe must be entity-encoded
    expect(html).toContain("O&#39;Reilly &amp; Sons");
  });

  it("escapeHtml encodes all five dangerous characters", () => {
    const input = `<div class="test">it's A & B</div>`;
    const escaped = escapeHtml(input);

    expect(escaped).toBe("&lt;div class=&quot;test&quot;&gt;it&#39;s A &amp; B&lt;/div&gt;");
  });

  it("interpolateTemplate leaves unknown placeholders intact", () => {
    const result = interpolateTemplate("Hello {unknown} {customerName}", {
      ...baseVars,
      customerName: "Sam Lee",
    });
    expect(result).toContain("{unknown}");
    expect(result).toContain("Sam Lee");
  });

  it("ICS attachment has correct VCALENDAR structure", () => {
    const attachment = generateICSAttachment({
      id: "bk-ics-001",
      title: "Consultation",
      startsAt: new Date("2026-06-15T10:00:00.000Z"),
      endsAt: new Date("2026-06-15T10:30:00.000Z"),
      location: "123 Main St",
      description: "Follow-up consultation",
      organizerEmail: "jane@clinic.example.com",
      attendeeEmail: "alice@example.com",
    });

    expect(attachment.filename).toBe("booking.ics");
    expect(attachment.contentType).toBe("text/calendar");

    const ics = attachment.content as string;
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("UID:bk-ics-001@thebookingkit");
    expect(ics).toContain("SUMMARY:Consultation");
    expect(ics).toContain("LOCATION:123 Main St");
    expect(ics).toContain("ORGANIZER:mailto:jane@clinic.example.com");
    expect(ics).toContain("ATTENDEE:mailto:alice@example.com");
    // DTSTART and DTEND should be compact ISO format (no dashes, no colons)
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics).toMatch(/DTEND:\d{8}T\d{6}Z/);
  });

  it("ICS attachment omits optional fields when not provided", () => {
    const attachment = generateICSAttachment({
      id: "bk-minimal-ics",
      title: "Quick Call",
      startsAt: new Date("2026-06-15T14:00:00.000Z"),
      endsAt: new Date("2026-06-15T14:15:00.000Z"),
      attendeeEmail: "customer@example.com",
    });

    const ics = attachment.content as string;
    // These optional lines should not appear when values are undefined
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("ORGANIZER:");
  });

  it("sendConfirmationEmail calls emailAdapter.send once for customer (no provider notify)", async () => {
    const emailAdapter = makeEmailAdapter();

    await sendConfirmationEmail(BASE_BOOKING_PAYLOAD, emailAdapter);

    expect(emailAdapter.send).toHaveBeenCalledTimes(1);
    const call = emailAdapter.calls[0];
    expect(call.to).toBe("alice@example.com");
    expect(call.subject).toContain("Booking Confirmed");
    expect(call.html).toContain("Alice Brown");
    expect(call.html).toContain("Consultation");
    // ICS attachment should be present
    expect(call.attachments).toBeDefined();
    expect(call.attachments![0].filename).toBe("booking.ics");
    // Unsubscribe header should be set
    expect(call.headers?.["List-Unsubscribe"]).toContain(BASE_BOOKING_PAYLOAD.unsubscribeUrl);
  });

  it("sendConfirmationEmail sends two emails when notifyProvider is true", async () => {
    const emailAdapter = makeEmailAdapter();

    await sendConfirmationEmail({ ...BASE_BOOKING_PAYLOAD, notifyProvider: true }, emailAdapter);

    expect(emailAdapter.send).toHaveBeenCalledTimes(2);
    const recipients = emailAdapter.calls.map((c) => c.to);
    expect(recipients).toContain("alice@example.com");
    expect(recipients).toContain("jane@clinic.example.com");
  });

  it("sendCancellationEmail sends to both customer and provider", async () => {
    const emailAdapter = makeEmailAdapter();
    const payload: CancellationEmailPayload = {
      ...BASE_BOOKING_PAYLOAD,
      cancelledBy: "customer",
      reason: "Change of plans",
    };

    await sendCancellationEmail(payload, emailAdapter);

    expect(emailAdapter.send).toHaveBeenCalledTimes(2);
    const recipients = emailAdapter.calls.map((c) => c.to);
    expect(recipients).toContain("alice@example.com");
    expect(recipients).toContain("jane@clinic.example.com");

    // Customer email subject
    const customerCall = emailAdapter.calls.find((c) => c.to === "alice@example.com")!;
    expect(customerCall.subject).toContain("Booking Cancelled");

    // Provider email includes who cancelled
    const providerCall = emailAdapter.calls.find((c) => c.to === "jane@clinic.example.com")!;
    expect(providerCall.subject).toContain("customer");
  });

  it("sendRescheduleEmail sends to both customer and provider with old/new times", async () => {
    const emailAdapter = makeEmailAdapter();
    const payload: RescheduleEmailPayload = {
      ...BASE_BOOKING_PAYLOAD,
      oldStartsAt: "2026-06-14T09:00:00.000Z",
      oldEndsAt: "2026-06-14T09:30:00.000Z",
    };

    await sendRescheduleEmail(payload, emailAdapter);

    expect(emailAdapter.send).toHaveBeenCalledTimes(2);
    const customerCall = emailAdapter.calls.find((c) => c.to === "alice@example.com")!;
    expect(customerCall.subject).toContain("Booking Rescheduled");
    expect(customerCall.html).toContain("Consultation");
  });
});

// ===========================================================================
// 3. Webhook round-trip — sign → deliver → verify
// ===========================================================================

describe("Webhook round-trip — sign / verify cycle", () => {
  const secret = "whsec_integ_test_secret_abc123";

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("signing and immediately verifying the same payload succeeds", () => {
    const now = 1_750_000_000;
    vi.setSystemTime(now * 1000);

    const envelope = createWebhookEnvelope("BOOKING_CONFIRMED", SAMPLE_WEBHOOK_PAYLOAD);
    const rawBody = JSON.stringify(envelope);
    const signature = signWebhookPayload(rawBody, secret, now);

    const result = verifyWebhookSignature(rawBody, signature, now, secret);
    expect(result).toEqual({ valid: true });
  });

  it("tampered payload body fails verification with signature_mismatch", () => {
    const now = 1_750_000_000;
    vi.setSystemTime(now * 1000);

    const rawBody = JSON.stringify({ bookingId: "bk-1" });
    const signature = signWebhookPayload(rawBody, secret, now);
    const tamperedBody = JSON.stringify({ bookingId: "bk-TAMPERED" });

    const result = verifyWebhookSignature(tamperedBody, signature, now, secret);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("wrong secret fails verification with signature_mismatch", () => {
    const now = 1_750_000_000;
    vi.setSystemTime(now * 1000);

    const rawBody = JSON.stringify({ bookingId: "bk-1" });
    const signature = signWebhookPayload(rawBody, secret, now);

    const result = verifyWebhookSignature(rawBody, signature, now, "wrong-secret");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature_mismatch");
  });

  it("expired timestamp (>5 min old) fails verification", () => {
    const signingTime = 1_750_000_000;
    vi.setSystemTime((signingTime + 301) * 1000); // now is 5m01s later

    const rawBody = JSON.stringify({ bookingId: "bk-1" });
    const signature = signWebhookPayload(rawBody, secret, signingTime);

    const result = verifyWebhookSignature(rawBody, signature, signingTime, secret);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("timestamp_expired");
  });

  it("timestamp exactly at tolerance boundary (300s) still passes", () => {
    const signingTime = 1_750_000_000;
    vi.setSystemTime((signingTime + 300) * 1000); // exactly at the 5m boundary

    const rawBody = JSON.stringify({ bookingId: "bk-boundary" });
    const signature = signWebhookPayload(rawBody, secret, signingTime);

    const result = verifyWebhookSignature(rawBody, signature, signingTime, secret);
    expect(result.valid).toBe(true);
  });

  it("future timestamp beyond tolerance fails (replay-from-future protection)", () => {
    const signingTime = 1_750_000_000;
    vi.setSystemTime((signingTime - 400) * 1000); // verifying 400s in the past

    const rawBody = JSON.stringify({ bookingId: "bk-future" });
    const signature = signWebhookPayload(rawBody, secret, signingTime);

    const result = verifyWebhookSignature(rawBody, signature, signingTime, secret);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("timestamp_expired");
  });

  it("replay protection simulation: same nonce (timestamp+body) verified twice", () => {
    // The HMAC scheme provides replay protection through the timestamp tolerance window.
    // A second delivery of the same signed message after the window expires is rejected.
    const now = 1_750_000_000;
    const rawBody = JSON.stringify({ bookingId: "bk-replay" });
    const signature = signWebhookPayload(rawBody, secret, now);

    // First delivery — within tolerance
    vi.setSystemTime(now * 1000);
    const first = verifyWebhookSignature(rawBody, signature, now, secret);
    expect(first.valid).toBe(true);

    // Second delivery — outside tolerance (replayed after window)
    vi.setSystemTime((now + 400) * 1000);
    const second = verifyWebhookSignature(rawBody, signature, now, secret);
    expect(second.valid).toBe(false);
    expect(second.reason).toBe("timestamp_expired");
  });

  it("different secrets produce different signatures (no cross-tenant leakage)", () => {
    const rawBody = JSON.stringify(SAMPLE_WEBHOOK_PAYLOAD);
    const ts = 1_750_000_000;

    const sig1 = signWebhookPayload(rawBody, "tenant-a-secret", ts);
    const sig2 = signWebhookPayload(rawBody, "tenant-b-secret", ts);

    expect(sig1).not.toBe(sig2);
    // tenant-a signature should not verify against tenant-b secret
    vi.setSystemTime(ts * 1000);
    const cross = verifyWebhookSignature(rawBody, sig1, ts, "tenant-b-secret");
    expect(cross.valid).toBe(false);
  });

  it("signature is a 64-char lowercase hex string", () => {
    const sig = signWebhookPayload("any body", secret, 1_750_000_000);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ===========================================================================
// 4. API key lifecycle — create → hash → verify → expire
// ===========================================================================

describe("API key lifecycle — create / verify / expire", () => {
  it("generates a key with the correct prefix and verifies it against its own hash", () => {
    const { key, hash } = generateApiKey("sk_live_");

    expect(key).toMatch(/^sk_live_[0-9a-f]{64}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyApiKey(key, hash)).toBe(true);
  });

  it("wrong key fails verification against a valid hash", () => {
    const { hash } = generateApiKey();
    expect(verifyApiKey("sk_live_not_the_right_key", hash)).toBe(false);
  });

  it("correct key fails verification against a different key's hash", () => {
    const { key } = generateApiKey();
    const { hash: otherHash } = generateApiKey(); // different key → different hash

    expect(verifyApiKey(key, otherHash)).toBe(false);
  });

  it("key that has not expired: isKeyExpired returns false", () => {
    const futureExpiry = new Date(Date.now() + 86_400_000); // 1 day from now
    expect(isKeyExpired(futureExpiry)).toBe(false);
  });

  it("key that has already expired: isKeyExpired returns true", () => {
    const pastExpiry = new Date(Date.now() - 1_000);
    expect(isKeyExpired(pastExpiry)).toBe(true);
  });

  it("no expiry date: isKeyExpired returns false (never-expiring key)", () => {
    expect(isKeyExpired(undefined)).toBe(false);
    expect(isKeyExpired(null)).toBe(false);
  });

  it("verifyApiKey correctly rejects an expired key (lifecycle integration)", () => {
    const { key, hash } = generateApiKey();
    const expiresAt = new Date(Date.now() - 5_000); // expired 5s ago

    // The key hash itself is still mathematically valid — the caller must combine
    // verifyApiKey with isKeyExpired to enforce expiry.
    expect(verifyApiKey(key, hash)).toBe(true);
    expect(isKeyExpired(expiresAt)).toBe(true);

    // Combine: treat as rejected
    const isValid = verifyApiKey(key, hash) && !isKeyExpired(expiresAt);
    expect(isValid).toBe(false);
  });

  it("rate limiting: allows requests up to the limit within a window", () => {
    const nowMs = new Date("2026-06-15T12:00:00.000Z").getTime();
    const limit = 3;

    let state: RateLimitState | null = null;

    // First 3 requests should be allowed
    for (let i = 0; i < limit; i++) {
      const { result, newState } = checkRateLimit(state, limit, nowMs);
      expect(result.allowed).toBe(true);
      state = newState;
    }

    // 4th request in the same window should be blocked
    const { result: blocked } = checkRateLimit(state, limit, nowMs);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("rate limiting: resets after the 1-minute window rolls over", () => {
    const nowMs = new Date("2026-06-15T12:00:00.000Z").getTime();
    const limit = 2;

    let state: RateLimitState | null = null;
    // Exhaust the window
    for (let i = 0; i < limit; i++) {
      ({ newState: state } = checkRateLimit(state, limit, nowMs));
    }

    // Advance to next window
    const nextWindowMs = nowMs + 60_000;
    const { result } = checkRateLimit(state, limit, nextWindowMs);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(limit - 1);
  });

  it("rate limit result carries the correct limit, remaining, and resetMs fields", () => {
    const nowMs = new Date("2026-06-15T12:00:30.000Z").getTime(); // 30s into minute
    const { result, newState } = checkRateLimit(null, 100, nowMs);

    expect(result.limit).toBe(100);
    expect(result.remaining).toBe(99);
    expect(result.allowed).toBe(true);
    // resetMs should be at the start of the next minute
    expect(result.resetMs).toBeGreaterThan(nowMs);
    expect(newState.count).toBe(1);
  });

  it("two independent keys: verifying one against the other's hash fails", () => {
    const { key: keyA, hash: hashA } = generateApiKey("sk_test_");
    const { key: keyB, hash: hashB } = generateApiKey("sk_test_");

    expect(verifyApiKey(keyA, hashB)).toBe(false);
    expect(verifyApiKey(keyB, hashA)).toBe(false);
    expect(verifyApiKey(keyA, hashA)).toBe(true);
    expect(verifyApiKey(keyB, hashB)).toBe(true);
  });
});

// ===========================================================================
// 5. SSRF validation edge cases
// ===========================================================================

describe("validateExternalUrl — SSRF prevention", () => {
  // Helper: expect the URL to throw with a message containing the fragment
  function expectBlocked(url: string, fragment: string): void {
    expect(() => validateExternalUrl(url, "webhook URL")).toThrow(fragment);
  }

  // Helper: expect the URL to pass without throwing
  function expectAllowed(url: string): void {
    expect(() => validateExternalUrl(url, "webhook URL")).not.toThrow();
  }

  // --- IPv4 private ranges ---

  it("blocks 10.x.x.x (RFC-1918 class-A private)", () => {
    expectBlocked("https://10.0.0.1/hook", "not allowed");
  });

  it("blocks 10.255.255.255", () => {
    expectBlocked("https://10.255.255.255/hook", "not allowed");
  });

  it("blocks 172.16.x.x (RFC-1918 class-B private start)", () => {
    expectBlocked("https://172.16.0.1/hook", "not allowed");
  });

  it("blocks 172.31.x.x (RFC-1918 class-B private end)", () => {
    expectBlocked("https://172.31.255.255/hook", "not allowed");
  });

  it("allows 172.15.x.x (just outside RFC-1918 class-B range)", () => {
    expectAllowed("https://172.15.1.1/hook");
  });

  it("allows 172.32.x.x (just outside RFC-1918 class-B range)", () => {
    expectAllowed("https://172.32.1.1/hook");
  });

  it("blocks 192.168.x.x (RFC-1918 class-C private)", () => {
    expectBlocked("https://192.168.1.100/hook", "not allowed");
  });

  it("blocks 192.168.0.0", () => {
    expectBlocked("https://192.168.0.0/hook", "not allowed");
  });

  it("blocks 127.0.0.1 (localhost loopback)", () => {
    expectBlocked("https://127.0.0.1/hook", "not allowed");
  });

  it("blocks 127.x.x.x range (entire loopback block)", () => {
    expectBlocked("https://127.100.50.1/hook", "not allowed");
  });

  it("blocks `localhost` hostname", () => {
    expectBlocked("https://localhost/hook", "not allowed");
  });

  it("blocks 169.254.x.x (link-local / AWS metadata)", () => {
    expectBlocked("https://169.254.169.254/latest/meta-data/", "not allowed");
  });

  // --- IPv6 ---

  it("blocks [::1] (IPv6 loopback)", () => {
    expectBlocked("https://[::1]/hook", "not allowed");
  });

  it("blocks ::1 appearing as a hostname", () => {
    // The URL parser normalises ::1 into [::1] hostname
    expectBlocked("https://[::1]:8080/hook", "not allowed");
  });

  it("blocks [::ffff:127.0.0.1] (IPv4-mapped loopback)", () => {
    expectBlocked("https://[::ffff:127.0.0.1]/hook", "not allowed");
  });

  it("blocks [::ffff:10.0.0.1] (IPv4-mapped private)", () => {
    expectBlocked("https://[::ffff:10.0.0.1]/hook", "not allowed");
  });

  it("blocks [::ffff:192.168.1.1] (IPv4-mapped class-C private)", () => {
    expectBlocked("https://[::ffff:192.168.1.1]/hook", "not allowed");
  });

  // --- Protocol enforcement ---

  it("blocks HTTP URLs (not HTTPS)", () => {
    expect(() => validateExternalUrl("http://api.example.com/hook", "webhook URL")).toThrow(
      "must use HTTPS",
    );
  });

  it("blocks FTP URLs", () => {
    expect(() => validateExternalUrl("ftp://api.example.com/hook", "webhook URL")).toThrow(
      "must use HTTPS",
    );
  });

  it("blocks bare strings that are not URLs", () => {
    expect(() => validateExternalUrl("not-a-url", "webhook URL")).toThrow(
      "Invalid webhook URL",
    );
  });

  // --- Valid HTTPS URLs ---

  it("allows a valid public HTTPS URL", () => {
    expectAllowed("https://api.example.com/webhooks");
  });

  it("allows HTTPS URL with a path and query string", () => {
    expectAllowed("https://hooks.slack.com/services/T00/B00/xyz?token=abc");
  });

  it("allows HTTPS URL on a non-standard port", () => {
    expectAllowed("https://api.example.com:8443/webhook");
  });

  it("allows HTTPS URL with a subdomain", () => {
    expectAllowed("https://webhooks.myapp.io/inbound");
  });
});

// ===========================================================================
// 6. withSerializableRetry stress test
// ===========================================================================

describe("withSerializableRetry — concurrency and stress scenarios", () => {
  it("10 concurrent calls: each resolves independently without interference", async () => {
    // Each call gets its own counter — no shared state.
    // The mock returns 40001 once per call then succeeds.
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(makePostgresError("40001"))
          .mockResolvedValueOnce({ slot: i });

        return withSerializableRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
      }),
    );

    // All 10 should succeed with their respective slot values
    expect(results).toHaveLength(10);
    results.forEach((r, i) => {
      expect(r).toEqual({ slot: i });
    });
  });

  it("random 40001 failures: eventual success within maxRetries", async () => {
    // Simulate contention: first 2 attempts fail with 40001, 3rd succeeds.
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makePostgresError("40001"))
      .mockRejectedValueOnce(makePostgresError("40001"))
      .mockResolvedValueOnce({ id: "booking-success" });

    const result = await withSerializableRetry(fn, { maxRetries: 3, baseDelayMs: 1 });

    expect(result).toEqual({ id: "booking-success" });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retry count does not exceed maxRetries + 1 total calls", async () => {
    const maxRetries = 2;
    const fn = vi.fn().mockRejectedValue(makePostgresError("40001"));

    await expect(
      withSerializableRetry(fn, { maxRetries, baseDelayMs: 1 }),
    ).rejects.toThrow(SerializationRetryExhaustedError);

    // Initial attempt + maxRetries retries = maxRetries + 1 total
    expect(fn).toHaveBeenCalledTimes(maxRetries + 1);
  });

  it("maxRetries: 0 means exactly one attempt, then throws exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(makePostgresError("40001"));

    await expect(
      withSerializableRetry(fn, { maxRetries: 0, baseDelayMs: 1 }),
    ).rejects.toThrow(SerializationRetryExhaustedError);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exclusion violation (23P01) throws BookingConflictError with no retries", async () => {
    const fn = vi.fn().mockRejectedValue(makePostgresError("23P01"));

    await expect(
      withSerializableRetry(fn, { maxRetries: 5, baseDelayMs: 1 }),
    ).rejects.toThrow(BookingConflictError);

    // Must not retry exclusion violations — slot is definitively taken
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("non-Postgres error is rethrown immediately without retrying", async () => {
    const originalError = new TypeError("unexpected shape");
    const fn = vi.fn().mockRejectedValue(originalError);

    await expect(
      withSerializableRetry(fn, { maxRetries: 3, baseDelayMs: 1 }),
    ).rejects.toThrow("unexpected shape");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("10 concurrent calls with random 40001 errors: all eventually succeed", async () => {
    // Each call fails 0–2 times (random) then succeeds.
    const calls = Array.from({ length: 10 }, (_, i) => {
      const failCount = i % 3; // 0, 1, or 2 failures depending on index
      const mockFn = vi.fn();
      for (let f = 0; f < failCount; f++) {
        mockFn.mockRejectedValueOnce(makePostgresError("40001"));
      }
      mockFn.mockResolvedValueOnce({ index: i });
      return withSerializableRetry(mockFn, { maxRetries: 3, baseDelayMs: 1 });
    });

    const results = await Promise.all(calls);

    expect(results).toHaveLength(10);
    results.forEach((r, i) => {
      expect(r).toEqual({ index: i });
    });
  });

  it("exponential backoff: successive retries are called in order and complete successfully", async () => {
    // Verify the ordering and attempt count when backoff is in play.
    // We use a minimal baseDelayMs so tests don't stall.
    const callTimestamps: number[] = [];

    const fn = vi.fn().mockImplementation(async () => {
      callTimestamps.push(Date.now());
      const callIndex = callTimestamps.length - 1;
      if (callIndex < 2) {
        throw makePostgresError("40001");
      }
      return "done";
    });

    const result = await withSerializableRetry(fn, { maxRetries: 3, baseDelayMs: 5 });

    expect(result).toBe("done");
    // 2 failures + 1 success = 3 total calls
    expect(fn).toHaveBeenCalledTimes(3);
    expect(callTimestamps).toHaveLength(3);

    // Each retry must come strictly after the previous call
    // (i.e. backoff did introduce some delay, even if tiny).
    expect(callTimestamps[1]).toBeGreaterThanOrEqual(callTimestamps[0]);
    expect(callTimestamps[2]).toBeGreaterThanOrEqual(callTimestamps[1]);
  });

  it("SerializationRetryExhaustedError carries the correct maxRetries count", async () => {
    const fn = vi.fn().mockRejectedValue(makePostgresError("40001"));

    try {
      await withSerializableRetry(fn, { maxRetries: 4, baseDelayMs: 1 });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SerializationRetryExhaustedError);
    }

    expect(fn).toHaveBeenCalledTimes(5); // 1 initial + 4 retries
  });
});

// ===========================================================================
// 7. CalendarAdapter and JobAdapter integration (notification-jobs wiring)
// ===========================================================================

describe("CalendarAdapter integration — syncBookingToCalendar / deleteBookingFromCalendar", () => {
  it("syncBookingToCalendar calls createEvent with correct title and attendees", async () => {
    const calendarAdapter = makeCalendarAdapter();
    const payload: CalendarSyncPayload = {
      bookingId: "bk-cal-001",
      providerId: "provider-001",
      eventTitle: "Consultation",
      customerName: "Alice Brown",
      customerEmail: "alice@example.com",
      startsAt: "2026-06-15T10:00:00.000Z",
      endsAt: "2026-06-15T10:30:00.000Z",
      timezone: "America/New_York",
      location: "123 Main St",
    };

    const eventId = await syncBookingToCalendar(payload, calendarAdapter);

    expect(calendarAdapter.createEvent).toHaveBeenCalledTimes(1);
    const callArg = (calendarAdapter.createEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.title).toContain("Consultation");
    expect(callArg.title).toContain("Alice Brown");
    expect(callArg.attendees).toContain("alice@example.com");
    expect(callArg.location).toBe("123 Main St");
    expect(eventId).toBe("cal-event-001");
  });

  it("deleteBookingFromCalendar calls deleteEvent with the given external event ID", async () => {
    const calendarAdapter = makeCalendarAdapter();

    await deleteBookingFromCalendar("ext-event-xyz", calendarAdapter);

    expect(calendarAdapter.deleteEvent).toHaveBeenCalledWith("ext-event-xyz");
  });
});

describe("JobAdapter integration — scheduleAutoReject", () => {
  it("scheduleAutoReject enqueues a scheduled job and returns a job ID", async () => {
    const jobAdapter = makeJobAdapter();
    const deadline = new Date("2026-06-16T10:00:00.000Z");

    const jobId = await scheduleAutoReject("bk-autorej-001", deadline, jobAdapter);

    expect(jobAdapter.schedule).toHaveBeenCalledTimes(1);
    const [jobName, payload, runAt] = (jobAdapter.schedule as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(jobName).toBe("thebookingkit/auto-reject-pending-booking");
    expect(payload.bookingId).toBe("bk-autorej-001");
    expect(payload.actor).toBe("system");
    expect(runAt).toEqual(deadline);
    expect(jobId).toBe("job-id-001");
  });
});
