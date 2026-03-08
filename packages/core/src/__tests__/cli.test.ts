import { describe, it, expect } from "vitest";
import {
  COMPONENT_REGISTRY,
  findComponent,
  resolveComponentDependencies,
  listComponents,
  createManifestEntry,
  hasLocalModifications,
  generateSlotkitConfig,
  generateEnvTemplate,
  parseMigrationFiles,
  getPendingMigrations,
  DEFAULT_MANIFEST,
} from "../cli.js";

// ---------------------------------------------------------------------------
// Component Registry
// ---------------------------------------------------------------------------

describe("COMPONENT_REGISTRY", () => {
  it("contains all expected components", () => {
    const names = COMPONENT_REGISTRY.map((c) => c.name);
    expect(names).toContain("booking-calendar");
    expect(names).toContain("time-slot-picker");
    expect(names).toContain("availability-editor");
    expect(names).toContain("payment-gate");
    expect(names).toContain("routing-form");
    expect(names).toContain("team-assignment-editor");
    expect(names).toContain("webhook-manager");
    expect(names).toContain("recurring-booking-picker");
    expect(names).toContain("seats-picker");
    expect(names).toContain("embed-configurator");
  });

  it("each entry has required fields", () => {
    for (const entry of COMPONENT_REGISTRY) {
      expect(entry.name).toBeTruthy();
      expect(entry.displayName).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.sourcePath).toBeTruthy();
      expect(Array.isArray(entry.dependencies)).toBe(true);
      expect(entry.category).toBeTruthy();
    }
  });

  it("all dependency references are valid", () => {
    const names = new Set(COMPONENT_REGISTRY.map((c) => c.name));
    for (const entry of COMPONENT_REGISTRY) {
      for (const dep of entry.dependencies) {
        expect(names.has(dep), `Unknown dependency "${dep}" in "${entry.name}"`).toBe(true);
      }
    }
  });
});

describe("findComponent", () => {
  it("returns component by name", () => {
    const component = findComponent("booking-calendar");
    expect(component?.displayName).toBe("BookingCalendar");
  });

  it("returns undefined for unknown component", () => {
    expect(findComponent("unknown-component")).toBeUndefined();
  });
});

describe("resolveComponentDependencies", () => {
  it("returns just the component when no dependencies", () => {
    const deps = resolveComponentDependencies("booking-calendar");
    expect(deps).toContain("booking-calendar");
    expect(deps).toHaveLength(1);
  });

  it("includes dependencies before the component", () => {
    const deps = resolveComponentDependencies("booking-management-view");
    const statusBadgeIdx = deps.indexOf("booking-status-badge");
    const managementIdx = deps.indexOf("booking-management-view");

    expect(statusBadgeIdx).toBeGreaterThanOrEqual(0);
    expect(managementIdx).toBeGreaterThan(statusBadgeIdx);
  });

  it("does not include duplicates", () => {
    const deps = resolveComponentDependencies("admin-schedule-view");
    const unique = new Set(deps);
    expect(deps).toHaveLength(unique.size);
  });

  it("handles unknown component gracefully", () => {
    const deps = resolveComponentDependencies("unknown");
    expect(deps).toHaveLength(0);
  });
});

describe("listComponents", () => {
  it("returns all components when no filter", () => {
    expect(listComponents()).toHaveLength(COMPONENT_REGISTRY.length);
  });

  it("filters by category", () => {
    const customerComponents = listComponents("customer");
    expect(customerComponents.length).toBeGreaterThan(0);
    expect(customerComponents.every((c) => c.category === "customer")).toBe(
      true,
    );
  });

  it("payment category contains payment components", () => {
    const paymentComponents = listComponents("payment");
    const names = paymentComponents.map((c) => c.name);
    expect(names).toContain("payment-gate");
    expect(names).toContain("payment-history");
  });
});

// ---------------------------------------------------------------------------
// Manifest Management
// ---------------------------------------------------------------------------

describe("createManifestEntry", () => {
  it("creates a valid manifest entry", () => {
    const entry = createManifestEntry(
      "booking-calendar",
      "1.0.0",
      "src/components/slotkit/booking-calendar.tsx",
      "abc123",
    );

    expect(entry.name).toBe("booking-calendar");
    expect(entry.version).toBe("1.0.0");
    expect(entry.installedPath).toBe(
      "src/components/slotkit/booking-calendar.tsx",
    );
    expect(entry.checksum).toBe("abc123");
    expect(new Date(entry.installedAt).toISOString()).toBe(entry.installedAt);
  });
});

describe("hasLocalModifications", () => {
  it("returns false when checksum matches", () => {
    const entry = createManifestEntry("comp", "1.0.0", "/path", "abc123");
    expect(hasLocalModifications(entry, "abc123")).toBe(false);
  });

  it("returns true when checksum differs", () => {
    const entry = createManifestEntry("comp", "1.0.0", "/path", "abc123");
    expect(hasLocalModifications(entry, "different-hash")).toBe(true);
  });
});

describe("DEFAULT_MANIFEST", () => {
  it("has the expected structure", () => {
    expect(DEFAULT_MANIFEST.version).toBe("1.0");
    expect(DEFAULT_MANIFEST.components).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Config Generation
// ---------------------------------------------------------------------------

describe("generateSlotkitConfig", () => {
  it("generates valid TypeScript config with defaults", () => {
    const config = generateSlotkitConfig({});
    expect(config).toContain("import type { SlotKitConfig }");
    expect(config).toContain("src/components/slotkit");
    expect(config).toContain("nextauth");
    expect(config).toContain("inngest");
    expect(config).toContain("resend");
  });

  it("uses provided values", () => {
    const config = generateSlotkitConfig({
      componentsDir: "app/slotkit",
      authAdapter: "clerk",
    });
    expect(config).toContain("app/slotkit");
    expect(config).toContain("clerk");
  });
});

describe("generateEnvTemplate", () => {
  it("includes all required env vars", () => {
    const env = generateEnvTemplate();
    expect(env).toContain("DATABASE_URL");
    expect(env).toContain("NEXTAUTH_SECRET");
    expect(env).toContain("RESEND_API_KEY");
    expect(env).toContain("INNGEST_EVENT_KEY");
    expect(env).toContain("STRIPE_SECRET_KEY");
  });
});

// ---------------------------------------------------------------------------
// Migration Utilities
// ---------------------------------------------------------------------------

describe("parseMigrationFiles", () => {
  it("sorts migrations by version number", () => {
    const files = [
      "0003_gdpr_anonymize.sql",
      "0001_setup_extensions.sql",
      "0002_booking_audit_trigger.sql",
    ];

    const result = parseMigrationFiles(files);
    expect(result[0].version).toBe(1);
    expect(result[1].version).toBe(2);
    expect(result[2].version).toBe(3);
  });

  it("parses version numbers correctly", () => {
    const result = parseMigrationFiles(["0004_create_booking_function.sql"]);
    expect(result[0].version).toBe(4);
    expect(result[0].filename).toBe("0004_create_booking_function.sql");
  });

  it("handles empty array", () => {
    expect(parseMigrationFiles([])).toEqual([]);
  });
});

describe("getPendingMigrations", () => {
  const allMigrations = parseMigrationFiles([
    "0001_setup_extensions.sql",
    "0002_booking_audit_trigger.sql",
    "0003_gdpr_anonymize.sql",
    "0004_create_booking_function.sql",
  ]);

  it("returns all migrations when none applied", () => {
    const pending = getPendingMigrations(allMigrations, []);
    expect(pending).toHaveLength(4);
  });

  it("excludes already-applied migrations", () => {
    const pending = getPendingMigrations(allMigrations, [1, 2]);
    expect(pending).toHaveLength(2);
    expect(pending[0].version).toBe(3);
    expect(pending[1].version).toBe(4);
  });

  it("returns empty when all applied", () => {
    const pending = getPendingMigrations(allMigrations, [1, 2, 3, 4]);
    expect(pending).toHaveLength(0);
  });
});
