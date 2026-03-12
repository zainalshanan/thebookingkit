/**
 * QA Issue regression tests for @thebookingkit/server
 *
 * Each test is written to FAIL on the current (buggy) code, confirming the
 * presence of the bug. Fix the underlying production code and the test will
 * turn green.
 *
 * Issue IDs match the QA tracking sheet:
 *   SRV-C1, SRV-C2, SRV-H1 … SRV-H5, SRV-M3, SRV-M4, SRV-M6, SRV-M7,
 *   SRV-M8, SRV-L2, SRV-L3
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ---------------------------------------------------------------------------
// Source file paths (for white-box / static analysis tests)
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..");

const bookingTokensSrc = readFileSync(
  path.join(SRC, "booking-tokens.ts"),
  "utf-8",
);
const authSrc = readFileSync(path.join(SRC, "auth.ts"), "utf-8");

// ---------------------------------------------------------------------------
// Units under test
// ---------------------------------------------------------------------------
import {
  generateBookingToken,
  verifyBookingToken,
} from "../booking-tokens.js";

import { withAuth, type AuthAdapter, type AuthUser } from "../auth.js";

import {
  validateWebhookSubscription,
  resolvePayloadTemplate,
  createWebhookEnvelope,
  type WebhookEnvelope,
} from "../webhooks.js";

import { validateWorkflow, type WorkflowDefinition } from "../workflows.js";

import { validateSlotQueryParams } from "../api.js";

import {
  assertTenantScope,
  buildOrgBookingUrl,
  TenantAuthorizationError,
} from "../multi-tenancy.js";

import { interpolateTemplate, type EmailTemplateVars } from "../email-templates.js";

import { generateICSAttachment } from "../adapters/email-adapter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", {
    headers: new Headers(headers),
  });
}

function makeMockAdapter(user: AuthUser | null): AuthAdapter {
  return {
    getCurrentUser: vi.fn().mockResolvedValue(user),
    getSession: vi.fn().mockResolvedValue(
      user ? { user, expires: new Date(Date.now() + 3600_000) } : null,
    ),
    verifyToken: vi.fn().mockResolvedValue(null),
  };
}

// ---------------------------------------------------------------------------
// SRV-C1 — Booking token HMAC truncated to 64 bits
// ---------------------------------------------------------------------------

describe("SRV-C1: generateBookingToken signature length", () => {
  it("should produce a full 256-bit (64 hex char) HMAC signature, not a 64-bit (16 hex char) truncation", () => {
    const token = generateBookingToken(
      "550e8400-e29b-41d4-a716-446655440000",
      new Date(Date.now() + 3_600_000),
      "test-secret",
    );

    // Decode the base64url token and extract the signature segment
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    // Format: bookingId:expiresAtMs:signature
    expect(parts).toHaveLength(3);

    const signature = parts[2];

    // A 64-bit HMAC is only 16 hex chars. A full SHA-256 is 64 hex chars.
    // The current code slices to 16. This assertion documents the required length.
    expect(signature.length).toBe(64); // FAILS: current code gives 16
  });
});

// ---------------------------------------------------------------------------
// SRV-C2 — Token signature comparison not constant-time
// ---------------------------------------------------------------------------

describe("SRV-C2: verifyBookingToken uses constant-time comparison", () => {
  it("source code should use crypto.timingSafeEqual for signature comparison, not !== operator", () => {
    // Static analysis: confirm the dangerous string comparison is absent
    // and that a constant-time approach is used instead.
    const usesTimingSafeEqual = bookingTokensSrc.includes("timingSafeEqual");
    const usesStringInequality =
      /signature\s*!==\s*expectedSig|expectedSig\s*!==\s*signature/.test(
        bookingTokensSrc,
      );

    // The current code uses `signature !== expectedSig` (timing-unsafe).
    // A fixed implementation would use crypto.timingSafeEqual.
    expect(usesStringInequality).toBe(false); // FAILS: current code uses !==
    expect(usesTimingSafeEqual).toBe(true);   // FAILS: current code does not use it
  });

  it("functional: a tampered token must be rejected", () => {
    const bookingId = "550e8400-e29b-41d4-a716-446655440000";
    const expiresAt = new Date(Date.now() + 3_600_000);
    const secret = "test-secret-key";

    const token = generateBookingToken(bookingId, expiresAt, secret);

    // Tamper with the last character
    const tampered =
      token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");

    const result = verifyBookingToken(tampered, secret);
    expect(result).toBeNull(); // should always hold — functional baseline
  });
});

// ---------------------------------------------------------------------------
// SRV-H1 — withAuth rethrows raw (non-auth) errors
// ---------------------------------------------------------------------------

describe("SRV-H1: withAuth should sanitize unexpected errors, not rethrow them", () => {
  it("should return a 500 JSON response when the handler throws an unexpected Error", async () => {
    const user: AuthUser = { id: "u1", email: "user@example.com" };
    const adapter = makeMockAdapter(user);

    const internalError = new Error("DB connection refused");
    const handler = vi.fn().mockRejectedValue(internalError);

    const wrapped = withAuth(adapter, handler);
    // Current code rethrows the error; a hardened implementation should catch
    // it and return a 500 response so the raw error does not propagate to the
    // HTTP layer unhandled.
    const responsePromise = wrapped(makeRequest());

    // FAILS: current code rethrows the error instead of resolving to a Response
    await expect(responsePromise).resolves.toBeDefined();
    const response = await responsePromise;
    expect(response.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// SRV-H2 — Role check uses exact match, no hierarchy (admin cannot access provider endpoints)
// ---------------------------------------------------------------------------

describe("SRV-H2: withAuth role hierarchy — admin should satisfy provider requirement", () => {
  it("a user with role 'admin' should be granted access to an endpoint requiring role 'provider'", async () => {
    const adminUser: AuthUser = {
      id: "admin1",
      email: "admin@example.com",
      role: "admin",
    };
    const adapter = makeMockAdapter(adminUser);
    const handler = vi
      .fn()
      .mockResolvedValue(Response.json({ ok: true }, { status: 200 }));

    const wrapped = withAuth(adapter, handler, { requiredRole: "provider" });
    const response = await wrapped(makeRequest());

    // FAILS: current code does an exact string match, so admin !== provider → 403
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// SRV-H3 — validateWebhookSubscription allows SSRF via private/meta URLs
// ---------------------------------------------------------------------------

describe("SRV-H3: validateWebhookSubscription should block SSRF-prone URLs", () => {
  const ssrfUrls = [
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/internal",
    "http://192.168.1.1/admin",
    "http://127.0.0.1/etc/passwd",
    "http://localhost/secret",
    "http://[::1]/sensitive",
  ];

  for (const url of ssrfUrls) {
    it(`should reject SSRF URL: ${url}`, () => {
      expect(() =>
        validateWebhookSubscription({
          subscriberUrl: url,
          triggers: ["BOOKING_CREATED"],
          isActive: true,
        }),
      ).toThrow(); // FAILS: current code accepts any URL that parses successfully
    });
  }
});

// ---------------------------------------------------------------------------
// SRV-H4 — Workflow fire_webhook action URL not validated against internal addresses
// ---------------------------------------------------------------------------

describe("SRV-H4: validateWorkflow fire_webhook action should reject internal URLs", () => {
  function makeWebhookWorkflow(url: string): WorkflowDefinition {
    return {
      id: "wf-1",
      name: "Test Webhook Workflow",
      trigger: "booking_created",
      conditions: [],
      actions: [{ type: "fire_webhook", url }],
      isActive: true,
    };
  }

  const internalUrls = [
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost/internal",
    "http://10.0.0.5/api",
  ];

  for (const url of internalUrls) {
    it(`should reject fire_webhook to internal URL: ${url}`, () => {
      // FAILS: current validateAction only checks that url is non-empty
      expect(() => validateWorkflow(makeWebhookWorkflow(url))).toThrow();
    });
  }
});

// ---------------------------------------------------------------------------
// SRV-H5 — validateSlotQueryParams: no UUID format validation on providerId
// ---------------------------------------------------------------------------

describe("SRV-H5: validateSlotQueryParams should reject non-UUID providerId", () => {
  const invalidIds = [
    "not-a-uuid-at-all",
    "123",
    "'; DROP TABLE bookings; --",
    "../../../etc/passwd",
    "admin",
  ];

  for (const id of invalidIds) {
    it(`should return a validation error for providerId="${id}"`, () => {
      const result = validateSlotQueryParams({
        providerId: id,
        start: "2026-01-01T09:00:00Z",
        end: "2026-01-02T09:00:00Z",
      });

      // FAILS: current code does not validate UUID format, result.valid === true
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "providerId")).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// SRV-M3 — assertTenantScope silently passes when resourceOrgId is null/undefined
// ---------------------------------------------------------------------------

describe("SRV-M3: assertTenantScope should reject null/undefined resourceOrgId", () => {
  it("should throw when resourceOrgId is null (unscoped resource must not pass silently)", () => {
    // A null orgId means the resource was not associated with any org —
    // that is an ambiguous state and should not auto-pass tenant checks.
    // FAILS: current code only throws when resourceOrgId is set AND mismatches.
    expect(() =>
      assertTenantScope(null, "expected-org-id"),
    ).toThrow(TenantAuthorizationError);
  });

  it("should throw when resourceOrgId is undefined", () => {
    // FAILS: same short-circuit logic — undefined is falsy so the check is skipped.
    expect(() =>
      assertTenantScope(undefined, "expected-org-id"),
    ).toThrow(TenantAuthorizationError);
  });

  it("should still throw when resourceOrgId mismatches (existing behaviour preserved)", () => {
    expect(() =>
      assertTenantScope("org-a", "org-b"),
    ).toThrow(TenantAuthorizationError);
  });

  it("should not throw when resourceOrgId matches expectedOrgId (existing behaviour preserved)", () => {
    expect(() => assertTenantScope("org-a", "org-a")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// SRV-M4 — resolvePayloadTemplate: substitution values can introduce new placeholders
// ---------------------------------------------------------------------------

describe("SRV-M4: resolvePayloadTemplate should not allow recursive template injection", () => {
  it("a substitution value containing a placeholder should not be resolved in a second pass", () => {
    // Attacker controls organizerName so they can inject a placeholder that
    // references organizerEmail (which might be a private field).
    const maliciousName = "{{organizerEmail}}";

    const envelope: WebhookEnvelope = createWebhookEnvelope("BOOKING_CREATED", {
      bookingId: "booking-123",
      eventType: "Consultation",
      startTime: "2026-03-12T10:00:00Z",
      endTime: "2026-03-12T11:00:00Z",
      organizer: {
        name: maliciousName,
        email: "secret@internal.example.com",
      },
      attendees: [],
      status: "confirmed",
    });

    const template = '{"name":"{{organizerName}}","email":"{{organizerEmail}}"}';
    const resolved = resolvePayloadTemplate(template, envelope);

    const parsed = JSON.parse(resolved);

    // After a single substitution pass:
    //   "name" should be "{{organizerEmail}}" (the literal string — NOT resolved again)
    // After two passes (the bug) it would become "secret@internal.example.com"
    // FAILS if resolvePayloadTemplate does multiple passes or uses a recursive replace.
    expect(parsed.name).toBe(maliciousName); // FAILS if second-pass injection occurs
    expect(parsed.name).not.toBe("secret@internal.example.com");
  });
});

// ---------------------------------------------------------------------------
// SRV-M6 — interpolateTemplate does not HTML-escape user-controlled values
// ---------------------------------------------------------------------------

describe("SRV-M6: interpolateTemplate should HTML-escape values before insertion", () => {
  it("should escape <script> tags in customerName to prevent XSS in HTML emails", () => {
    const vars: EmailTemplateVars = {
      bookingId: "b-1",
      eventTitle: "Consultation",
      providerName: "Dr. Smith",
      customerName: "<script>alert(1)</script>",
      customerEmail: "attacker@evil.com",
      date: "2026-03-12",
      time: "10:00 AM",
      duration: "30 minutes",
      timezone: "UTC",
    };

    const result = interpolateTemplate("Hi {customerName},", vars);

    // FAILS: current code substitutes the raw string — script tag appears verbatim.
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("should escape HTML special characters in all user-supplied fields", () => {
    const vars: EmailTemplateVars = {
      bookingId: "b-1",
      eventTitle: 'Consultation" onload="evil()',
      providerName: "<b>Bold</b>",
      customerName: "Jane & John",
      customerEmail: "j@example.com",
      date: "2026-03-12",
      time: "10:00 AM",
      duration: "30 minutes",
      timezone: "UTC",
    };

    const template = "{providerName} for {customerName} re: {eventTitle}";
    const result = interpolateTemplate(template, vars);

    // FAILS: raw strings are substituted without escaping.
    expect(result).not.toContain("<b>");
    expect(result).toContain("&amp;"); // Jane & John → Jane &amp; John
  });
});

// ---------------------------------------------------------------------------
// SRV-M7 — validateSlotQueryParams: no date range limit
// ---------------------------------------------------------------------------

describe("SRV-M7: validateSlotQueryParams should reject unreasonably large date ranges", () => {
  it("should reject an 80-year date range", () => {
    const result = validateSlotQueryParams({
      providerId: "550e8400-e29b-41d4-a716-446655440000",
      start: "2000-01-01T00:00:00Z",
      end: "2080-01-01T00:00:00Z",
    });

    // FAILS: current code only checks that end > start, no upper bound on range.
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "end")).toBe(true);
  });

  it("should reject a range exceeding 90 days", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date(start.getTime() + 91 * 24 * 60 * 60 * 1000);

    const result = validateSlotQueryParams({
      providerId: "550e8400-e29b-41d4-a716-446655440000",
      start: start.toISOString(),
      end: end.toISOString(),
    });

    // FAILS: current code accepts any future end date.
    expect(result.valid).toBe(false);
  });

  it("should accept a reasonable 30-day range (no false positive)", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);

    const result = validateSlotQueryParams({
      providerId: "550e8400-e29b-41d4-a716-446655440000",
      start: start.toISOString(),
      end: end.toISOString(),
    });

    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SRV-M8 — buildOrgBookingUrl: slugs are not sanitized
// ---------------------------------------------------------------------------

describe("SRV-M8: buildOrgBookingUrl should sanitize or reject dangerous slugs", () => {
  const dangerousSlugs: [string, string][] = [
    ["../../../etc/passwd", "path traversal in orgSlug"],
    ["%00null", "null byte in slug"],
    ["foo/../../bar", "embedded slash in slug"],
    ["<script>", "HTML in slug"],
  ];

  for (const [slug, desc] of dangerousSlugs) {
    it(`should throw or sanitize ${desc}: "${slug}"`, () => {
      // FAILS: current implementation does a raw string interpolation with no
      // validation, producing a URL like "https://app.example/../../../etc/passwd"
      expect(() =>
        buildOrgBookingUrl(slug, "provider", "event-type", "https://app.example"),
      ).toThrow();
    });
  }

  it("should not throw for a valid slug (no false positive)", () => {
    expect(() =>
      buildOrgBookingUrl(
        "acme-corp",
        "dr-smith",
        "consultation-30min",
        "https://app.example",
      ),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// SRV-L2 — resolveTemplateVariables formatTime/formatDate ignores timezone context
// ---------------------------------------------------------------------------

import { resolveTemplateVariables, type WorkflowContext } from "../workflows.js";

describe("SRV-L2: resolveTemplateVariables should respect the booking timezone, not server locale", () => {
  it("{booking.startTime} should produce an output consistent with the provided timezone, not server-local time", () => {
    // A UTC midnight Date should render as midnight in UTC ("12:00 AM"),
    // but if the server's TZ env var is e.g. America/New_York it renders as
    // "7:00 PM" (previous day). The function must accept a timezone and use it.

    const utcMidnight = new Date("2026-03-12T00:00:00.000Z"); // midnight UTC

    const context: WorkflowContext = {
      startsAt: utcMidnight,
      // The timezone field exists on WorkflowContext for this reason.
      timezone: "UTC",
    };

    const result = resolveTemplateVariables("{booking.startTime}", context);

    // In UTC, midnight is "12:00 AM". The function currently ignores context.timezone
    // and uses the server's locale, so this fails when TZ !== UTC.
    // FAILS on servers whose TZ is not UTC — demonstrates the locale dependency.
    //
    // We assert that the timezone string "UTC" influences the output by ensuring
    // the function signature accepts and uses it. As a proxy we check the
    // resolved string matches the UTC rendering.
    //
    // The proper fix: accept timezone in context and pass it to toLocaleTimeString.
    const utcFormatted = utcMidnight.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC", // <-- what the fixed code should do
    });

    // This assertion confirms that the current code does NOT pass timeZone to
    // toLocaleTimeString (the function only uses server default TZ).
    // We verify by checking the function lacks timeZone in its implementation.
    const workflowsSrc = readFileSync(path.join(SRC, "workflows.ts"), "utf-8");
    const usesTimeZoneOption = workflowsSrc.includes("timeZone");

    // FAILS: current implementation of formatTime / formatDate has no timeZone option.
    expect(usesTimeZoneOption).toBe(true);

    // Additionally the actual output must match what UTC rendering would give.
    // This will fail on non-UTC CI/CD servers.
    expect(result).toBe(utcFormatted);
  });
});

// ---------------------------------------------------------------------------
// SRV-L3 — escapeICS does not escape \r (carriage return)
// ---------------------------------------------------------------------------

describe("SRV-L3: generateICSAttachment escapeICS should escape \\r characters", () => {
  it("a title containing \\r\\n should have \\r escaped in the ICS output", () => {
    const booking = {
      id: "booking-ics-1",
      title: "Consultation\r\nInjected:PROPERTY:value",
      startsAt: new Date("2026-03-12T10:00:00Z"),
      endsAt: new Date("2026-03-12T11:00:00Z"),
      attendeeEmail: "customer@example.com",
    };

    const attachment = generateICSAttachment(booking);
    const icsContent = attachment.content as string;

    // RFC 5545 §3.3.11 requires \r to be escaped in text values.
    // The current escapeICS only handles \n, \, ;, and ,
    // A \r\n in a SUMMARY line injects a new ICS property header.
    //
    // FAILS: current code does not escape \r, so the raw \r\n passes through.
    expect(icsContent).not.toMatch(/SUMMARY:.*\r\nInjected:/);

    // The \r should be escaped as \\r in the output
    const summaryLine = icsContent
      .split("\r\n")
      .find((l) => l.startsWith("SUMMARY:"));
    expect(summaryLine).toBeDefined();
    // After proper escaping the summary value should contain the literal text \\r\\n
    // not a real carriage-return that breaks the line.
    expect(summaryLine).toContain("\\r");
  });

  it("a description with \\r should be escaped, not passed through as a bare carriage return", () => {
    const booking = {
      id: "booking-ics-2",
      title: "Normal Title",
      startsAt: new Date("2026-03-12T10:00:00Z"),
      endsAt: new Date("2026-03-12T11:00:00Z"),
      description: "Line one\r\nLine two",
      attendeeEmail: "customer@example.com",
    };

    const attachment = generateICSAttachment(booking);
    const icsContent = attachment.content as string;

    const descLine = icsContent
      .split("\r\n")
      .find((l) => l.startsWith("DESCRIPTION:"));
    expect(descLine).toBeDefined();

    // FAILS: current escapeICS does not replace \r, so bare \r remains.
    expect(descLine).not.toMatch(/\r(?!\\)/); // must not contain unescaped \r
    expect(descLine).toContain("\\r"); // must contain the escaped form
  });
});
