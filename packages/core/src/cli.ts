/**
 * CLI tooling utilities for @slotkit/cli.
 *
 * Provides component registry, manifest management, dependency resolution,
 * diff computation, and config scaffolding helpers used by the CLI binary.
 */

// ---------------------------------------------------------------------------
// Component Registry
// ---------------------------------------------------------------------------

/** A component entry in the registry */
export interface ComponentRegistryEntry {
  /** Component name (kebab-case) */
  name: string;
  /** Display name */
  displayName: string;
  /** Brief description */
  description: string;
  /** Source file path within @slotkit/ui */
  sourcePath: string;
  /** Component names this one depends on */
  dependencies: string[];
  /** Category for grouping */
  category: "customer" | "admin" | "payment" | "routing" | "team" | "embed" | "utility";
}

/** The full component registry */
export const COMPONENT_REGISTRY: ComponentRegistryEntry[] = [
  {
    name: "booking-calendar",
    displayName: "BookingCalendar",
    description: "Date picker for selecting a booking date",
    sourcePath: "components/booking-calendar.tsx",
    dependencies: [],
    category: "customer",
  },
  {
    name: "time-slot-picker",
    displayName: "TimeSlotPicker",
    description: "Time slot grid for selecting an available time",
    sourcePath: "components/time-slot-picker.tsx",
    dependencies: [],
    category: "customer",
  },
  {
    name: "booking-questions",
    displayName: "BookingQuestions",
    description: "Custom question form for collecting booking info",
    sourcePath: "components/booking-questions.tsx",
    dependencies: [],
    category: "customer",
  },
  {
    name: "booking-confirmation",
    displayName: "BookingConfirmation",
    description: "Success screen after a booking is created",
    sourcePath: "components/booking-confirmation.tsx",
    dependencies: [],
    category: "customer",
  },
  {
    name: "booking-status-badge",
    displayName: "BookingStatusBadge",
    description: "Status pill for booking lifecycle states",
    sourcePath: "components/booking-status-badge.tsx",
    dependencies: [],
    category: "customer",
  },
  {
    name: "booking-management-view",
    displayName: "BookingManagementView",
    description: "Customer-facing cancel/reschedule flow",
    sourcePath: "components/booking-management-view.tsx",
    dependencies: ["booking-status-badge"],
    category: "customer",
  },
  {
    name: "availability-editor",
    displayName: "AvailabilityEditor",
    description: "Weekly schedule editor with time range inputs",
    sourcePath: "components/availability-editor.tsx",
    dependencies: [],
    category: "admin",
  },
  {
    name: "override-manager",
    displayName: "OverrideManager",
    description: "Date-specific availability override manager",
    sourcePath: "components/override-manager.tsx",
    dependencies: [],
    category: "admin",
  },
  {
    name: "admin-schedule-view",
    displayName: "AdminScheduleView",
    description: "Calendar view of all bookings for a provider",
    sourcePath: "components/admin-schedule-view.tsx",
    dependencies: ["booking-status-badge"],
    category: "admin",
  },
  {
    name: "booking-lifecycle-actions",
    displayName: "BookingLifecycleActions",
    description: "Confirm/reject/cancel/no-show action buttons",
    sourcePath: "components/booking-lifecycle-actions.tsx",
    dependencies: [],
    category: "admin",
  },
  {
    name: "manual-booking-form",
    displayName: "ManualBookingForm",
    description: "Admin form for creating bookings manually",
    sourcePath: "components/manual-booking-form.tsx",
    dependencies: [],
    category: "admin",
  },
  {
    name: "provider-auth",
    displayName: "ProviderAuth",
    description: "Login/signup/password-reset form for providers",
    sourcePath: "components/provider-auth.tsx",
    dependencies: [],
    category: "admin",
  },
  {
    name: "payment-gate",
    displayName: "PaymentGate",
    description: "Payment form wrapper for Stripe Elements",
    sourcePath: "components/payment-gate.tsx",
    dependencies: [],
    category: "payment",
  },
  {
    name: "payment-history",
    displayName: "PaymentHistory",
    description: "Payment history table with filtering and revenue summary",
    sourcePath: "components/payment-history.tsx",
    dependencies: [],
    category: "payment",
  },
  {
    name: "routing-form",
    displayName: "RoutingForm",
    description: "Customer intake form with conditional routing",
    sourcePath: "components/routing-form.tsx",
    dependencies: [],
    category: "routing",
  },
  {
    name: "team-assignment-editor",
    displayName: "TeamAssignmentEditor",
    description: "Team member assignment strategy editor",
    sourcePath: "components/team-assignment-editor.tsx",
    dependencies: [],
    category: "team",
  },
  {
    name: "workflow-builder",
    displayName: "WorkflowBuilder",
    description: "Visual workflow automation builder",
    sourcePath: "components/workflow-builder.tsx",
    dependencies: [],
    category: "admin",
  },
  {
    name: "webhook-manager",
    displayName: "WebhookManager",
    description: "Webhook subscription management with delivery history",
    sourcePath: "components/webhook-manager.tsx",
    dependencies: [],
    category: "admin",
  },
  {
    name: "recurring-booking-picker",
    displayName: "RecurringBookingPicker",
    description: "Recurring series picker for repeating appointments",
    sourcePath: "components/recurring-booking-picker.tsx",
    dependencies: [],
    category: "customer",
  },
  {
    name: "seats-picker",
    displayName: "SeatsPicker",
    description: "Seat availability display for group events",
    sourcePath: "components/seats-picker.tsx",
    dependencies: [],
    category: "customer",
  },
  {
    name: "embed-configurator",
    displayName: "EmbedConfigurator",
    description: "Admin embed code generator for inline/popup/float modes",
    sourcePath: "components/embed-configurator.tsx",
    dependencies: [],
    category: "embed",
  },
];

/**
 * Look up a component by name.
 *
 * @param name - Component name (kebab-case)
 * @returns The component entry, or undefined if not found
 */
export function findComponent(
  name: string,
): ComponentRegistryEntry | undefined {
  return COMPONENT_REGISTRY.find((c) => c.name === name);
}

/**
 * Resolve all dependencies for a component (including transitive).
 *
 * @param name - Component name
 * @returns Ordered list of component names to install (dependencies first)
 */
export function resolveComponentDependencies(name: string): string[] {
  const resolved = new Set<string>();
  const queue = [name];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (resolved.has(current)) continue;

    const entry = findComponent(current);
    if (!entry) continue;

    // Process dependencies first (add them to queue)
    for (const dep of entry.dependencies) {
      if (!resolved.has(dep)) {
        queue.unshift(dep);
      }
    }

    resolved.add(current);
  }

  // Return with main component last (dependencies first)
  const result = [...resolved];
  const idx = result.indexOf(name);
  if (idx > -1) {
    result.splice(idx, 1);
    result.push(name);
  }
  return result;
}

/**
 * List all available components, optionally filtered by category.
 *
 * @param category - Optional category filter
 * @returns Matching component entries
 */
export function listComponents(
  category?: ComponentRegistryEntry["category"],
): ComponentRegistryEntry[] {
  if (!category) return COMPONENT_REGISTRY;
  return COMPONENT_REGISTRY.filter((c) => c.category === category);
}

// ---------------------------------------------------------------------------
// Manifest Management
// ---------------------------------------------------------------------------

/** A single entry in the component manifest */
export interface ManifestEntry {
  /** Component name */
  name: string;
  /** Version of @slotkit/ui when this component was added */
  version: string;
  /** File path where the component was installed */
  installedPath: string;
  /** SHA-256 hash of the component at install time */
  checksum: string;
  /** Date of installation */
  installedAt: string;
}

/** The .slotkit-manifest.json file structure */
export interface SlotKitManifest {
  version: string;
  components: Record<string, ManifestEntry>;
}

/** Default manifest structure */
export const DEFAULT_MANIFEST: SlotKitManifest = {
  version: "1.0",
  components: {},
};

/**
 * Create a new manifest entry for an installed component.
 *
 * @param name - Component name
 * @param version - Package version
 * @param installedPath - File path
 * @param checksum - SHA-256 hash of file content
 * @returns Manifest entry
 */
export function createManifestEntry(
  name: string,
  version: string,
  installedPath: string,
  checksum: string,
): ManifestEntry {
  return {
    name,
    version,
    installedPath,
    checksum,
    installedAt: new Date().toISOString(),
  };
}

/**
 * Check if a component has local modifications based on its manifest entry.
 *
 * @param entry - The manifest entry
 * @param currentChecksum - Current file checksum
 * @returns Whether the file has been locally modified
 */
export function hasLocalModifications(
  entry: ManifestEntry,
  currentChecksum: string,
): boolean {
  return entry.checksum !== currentChecksum;
}

// ---------------------------------------------------------------------------
// Config File Generation
// ---------------------------------------------------------------------------

/** SlotKit project configuration */
export interface SlotKitConfig {
  /** Postgres connection string (from env) */
  databaseUrl: string;
  /** Path to copy UI components */
  componentsDir: string;
  /** Path to generate TypeScript types */
  typesOutput: string;
  /** Auth adapter type */
  authAdapter: "nextauth" | "supabase" | "clerk" | "lucia";
  /** Job adapter type */
  jobAdapter: "inngest" | "trigger" | "bullmq" | "none";
  /** Email adapter type */
  emailAdapter: "resend" | "sendgrid" | "ses" | "none";
}

/** Generate the content of slotkit.config.ts */
export function generateSlotkitConfig(config: Partial<SlotKitConfig>): string {
  const {
    componentsDir = "src/components/slotkit",
    typesOutput = "src/types/slotkit.ts",
    authAdapter = "nextauth",
    jobAdapter = "inngest",
    emailAdapter = "resend",
  } = config;

  return `import type { SlotKitConfig } from "@slotkit/core";

const config: SlotKitConfig = {
  database: {
    url: process.env.DATABASE_URL!,
  },
  components: {
    dir: "${componentsDir}",
  },
  types: {
    output: "${typesOutput}",
  },
  adapters: {
    auth: "${authAdapter}",
    jobs: "${jobAdapter}",
    email: "${emailAdapter}",
  },
};

export default config;
`;
}

/** Generate a .env.local template */
export function generateEnvTemplate(): string {
  return `# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# Auth (NextAuth.js)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# Email (Resend)
RESEND_API_KEY=

# Background Jobs (Inngest)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Stripe (optional)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
`;
}

// ---------------------------------------------------------------------------
// Migration Utilities
// ---------------------------------------------------------------------------

/** A migration file entry */
export interface MigrationFile {
  /** Migration filename */
  filename: string;
  /** Version number (from filename prefix) */
  version: number;
  /** Migration content */
  content?: string;
}

/**
 * Parse a list of migration filenames and return them sorted by version.
 *
 * @param filenames - Array of migration filenames
 * @returns Sorted migration entries
 */
export function parseMigrationFiles(filenames: string[]): MigrationFile[] {
  return filenames
    .map((filename) => {
      const match = filename.match(/^(\d+)_/);
      const version = match ? parseInt(match[1], 10) : 0;
      return { filename, version };
    })
    .sort((a, b) => a.version - b.version);
}

/**
 * Determine which migrations are pending (not yet applied).
 *
 * @param allMigrations - All available migration files
 * @param appliedVersions - Versions already applied to the database
 * @returns Pending migrations in order
 */
export function getPendingMigrations(
  allMigrations: MigrationFile[],
  appliedVersions: number[],
): MigrationFile[] {
  const applied = new Set(appliedVersions);
  return allMigrations.filter((m) => !applied.has(m.version));
}
