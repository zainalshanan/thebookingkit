import { describe, it, expect } from "vitest";
import {
  resolveEffectiveSettings,
  getRolePermissions,
  roleHasPermission,
  assertOrgPermission,
  assertTenantScope,
  buildOrgBookingUrl,
  parseOrgBookingPath,
  TenantAuthorizationError,
  GLOBAL_DEFAULTS,
  type OrgMember,
  type OrgSettings,
  type ProviderSettings,
  type EventTypeSettings,
} from "../multi-tenancy.js";

// ---------------------------------------------------------------------------
// resolveEffectiveSettings
// ---------------------------------------------------------------------------

describe("resolveEffectiveSettings", () => {
  it("uses global defaults when no settings provided", () => {
    const resolved = resolveEffectiveSettings();
    expect(resolved.timezone).toBe(GLOBAL_DEFAULTS.timezone);
    expect(resolved.currency).toBe(GLOBAL_DEFAULTS.currency);
    expect(resolved.bufferMinutes).toBe(GLOBAL_DEFAULTS.bufferMinutes);
    expect(resolved.branding).toEqual({});
    expect(resolved.bookingLimits).toEqual({});
  });

  it("applies org settings over global defaults", () => {
    const org: OrgSettings = {
      defaultTimezone: "America/New_York",
      defaultCurrency: "EUR",
      branding: { primaryColor: "#6366f1" },
    };

    const resolved = resolveEffectiveSettings(org);
    expect(resolved.timezone).toBe("America/New_York");
    expect(resolved.currency).toBe("EUR");
    expect(resolved.branding.primaryColor).toBe("#6366f1");
  });

  it("provider settings override org settings", () => {
    const org: OrgSettings = {
      defaultTimezone: "America/New_York",
      defaultCurrency: "USD",
    };
    const provider: ProviderSettings = {
      timezone: "Europe/London",
      currency: "GBP",
    };

    const resolved = resolveEffectiveSettings(org, provider);
    expect(resolved.timezone).toBe("Europe/London");
    expect(resolved.currency).toBe("GBP");
  });

  it("event type settings override provider settings", () => {
    const org: OrgSettings = { defaultTimezone: "UTC" };
    const provider: ProviderSettings = { timezone: "America/New_York" };
    const eventType: EventTypeSettings = { timezone: "Asia/Tokyo" };

    const resolved = resolveEffectiveSettings(org, provider, eventType);
    expect(resolved.timezone).toBe("Asia/Tokyo");
  });

  it("merges branding settings additively", () => {
    const org: OrgSettings = {
      branding: { primaryColor: "#000", logoUrl: "https://example.com/logo.png" },
    };
    const provider: ProviderSettings = {
      branding: { primaryColor: "#fff" },
    };

    const resolved = resolveEffectiveSettings(org, provider);
    expect(resolved.branding.primaryColor).toBe("#fff"); // provider overrides
    expect(resolved.branding.logoUrl).toBe("https://example.com/logo.png"); // org preserved
  });

  it("merges booking limits additively", () => {
    const org: OrgSettings = {
      defaultBookingLimits: { maxPerDay: 5 },
    };
    const provider: ProviderSettings = {
      bookingLimits: { maxPerWeek: 20 },
    };

    const resolved = resolveEffectiveSettings(org, provider);
    expect(resolved.bookingLimits).toMatchObject({ maxPerDay: 5, maxPerWeek: 20 });
  });

  it("handles null settings gracefully", () => {
    expect(() => resolveEffectiveSettings(null, null, null)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getRolePermissions
// ---------------------------------------------------------------------------

describe("getRolePermissions", () => {
  it("owner has all permissions", () => {
    const perms = getRolePermissions("owner");
    expect(perms).toContain("manage:members");
    expect(perms).toContain("manage:teams");
    expect(perms).toContain("view:all-bookings");
    expect(perms).toContain("manage:organization");
    expect(perms).toContain("view:analytics");
  });

  it("admin has management permissions but not member management", () => {
    const perms = getRolePermissions("admin");
    expect(perms).toContain("manage:teams");
    expect(perms).toContain("view:all-bookings");
    expect(perms).not.toContain("manage:members");
    expect(perms).not.toContain("manage:organization");
  });

  it("member has only own-resource permissions", () => {
    const perms = getRolePermissions("member");
    expect(perms).toContain("view:own-bookings");
    expect(perms).toContain("manage:own-availability");
    expect(perms).not.toContain("view:all-bookings");
    expect(perms).not.toContain("manage:teams");
  });
});

// ---------------------------------------------------------------------------
// roleHasPermission
// ---------------------------------------------------------------------------

describe("roleHasPermission", () => {
  it("returns true for permitted action", () => {
    expect(roleHasPermission("owner", "manage:members")).toBe(true);
  });

  it("returns false for unpermitted action", () => {
    expect(roleHasPermission("member", "manage:members")).toBe(false);
  });

  it("admin can view all bookings", () => {
    expect(roleHasPermission("admin", "view:all-bookings")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// assertOrgPermission
// ---------------------------------------------------------------------------

describe("assertOrgPermission", () => {
  const ownerMember: OrgMember = {
    userId: "user-1",
    organizationId: "org-1",
    role: "owner",
  };

  const regularMember: OrgMember = {
    userId: "user-2",
    organizationId: "org-1",
    role: "member",
  };

  it("does not throw for permitted action", () => {
    expect(() =>
      assertOrgPermission(ownerMember, "manage:members"),
    ).not.toThrow();
  });

  it("throws for unpermitted action", () => {
    expect(() =>
      assertOrgPermission(regularMember, "manage:members"),
    ).toThrow(TenantAuthorizationError);
  });

  it("throws with descriptive message", () => {
    expect(() =>
      assertOrgPermission(regularMember, "view:all-bookings"),
    ).toThrow('"member"');
  });
});

// ---------------------------------------------------------------------------
// assertTenantScope
// ---------------------------------------------------------------------------

describe("assertTenantScope", () => {
  it("does not throw when org IDs match", () => {
    expect(() => assertTenantScope("org-1", "org-1")).not.toThrow();
  });

  it("does not throw when resource has no org ID", () => {
    expect(() => assertTenantScope(null, "org-1")).not.toThrow();
    expect(() => assertTenantScope(undefined, "org-1")).not.toThrow();
  });

  it("throws when org IDs don't match", () => {
    expect(() => assertTenantScope("org-2", "org-1")).toThrow(
      TenantAuthorizationError,
    );
    expect(() => assertTenantScope("org-2", "org-1")).toThrow(
      "does not belong to the current organization",
    );
  });
});

// ---------------------------------------------------------------------------
// buildOrgBookingUrl
// ---------------------------------------------------------------------------

describe("buildOrgBookingUrl", () => {
  it("builds the correct URL", () => {
    const url = buildOrgBookingUrl(
      "acme-corp",
      "dr-smith",
      "consultation",
      "https://booking.example.com",
    );
    expect(url).toBe(
      "https://booking.example.com/acme-corp/dr-smith/consultation",
    );
  });
});

// ---------------------------------------------------------------------------
// parseOrgBookingPath
// ---------------------------------------------------------------------------

describe("parseOrgBookingPath", () => {
  it("parses valid path", () => {
    const result = parseOrgBookingPath("/acme-corp/dr-smith/consultation");
    expect(result).toEqual({
      orgSlug: "acme-corp",
      providerSlug: "dr-smith",
      eventTypeSlug: "consultation",
    });
  });

  it("returns null for invalid path", () => {
    expect(parseOrgBookingPath("/only-two/segments")).toBeNull();
    expect(parseOrgBookingPath("/too/many/path/segments")).toBeNull();
    expect(parseOrgBookingPath("no-leading-slash")).toBeNull();
  });

  it("returns null for empty path", () => {
    expect(parseOrgBookingPath("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GLOBAL_DEFAULTS
// ---------------------------------------------------------------------------

describe("GLOBAL_DEFAULTS", () => {
  it("uses UTC timezone", () => {
    expect(GLOBAL_DEFAULTS.timezone).toBe("UTC");
  });

  it("uses USD currency", () => {
    expect(GLOBAL_DEFAULTS.currency).toBe("USD");
  });

  it("uses 0 buffer minutes", () => {
    expect(GLOBAL_DEFAULTS.bufferMinutes).toBe(0);
  });
});
