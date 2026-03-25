/**
 * Config file and env template generation for The Booking Kit projects.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The Booking Kit project configuration */
export interface BookingKitConfig {
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

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** @deprecated Use BookingKitConfig instead */
export type SlotKitConfig = BookingKitConfig;

const VALID_AUTH_ADAPTERS: ReadonlyArray<BookingKitConfig["authAdapter"]> = [
  "nextauth",
  "supabase",
  "clerk",
  "lucia",
];

const VALID_JOB_ADAPTERS: ReadonlyArray<BookingKitConfig["jobAdapter"]> = [
  "inngest",
  "trigger",
  "bullmq",
  "none",
];

const VALID_EMAIL_ADAPTERS: ReadonlyArray<BookingKitConfig["emailAdapter"]> = [
  "resend",
  "sendgrid",
  "ses",
  "none",
];

/** Reject path strings that could break out of the template via quote/backslash injection. */
function sanitizePath(value: string, fieldName: string): string {
  if (value.includes('"') || value.includes("\\")) {
    throw new Error(
      `Invalid value for "${fieldName}": path must not contain double-quotes or backslashes.`,
    );
  }
  return value;
}

/** Generate the content of thebookingkit.config.ts */
export function generateThebookingkitConfig(config: Partial<BookingKitConfig>): string {
  const {
    componentsDir: rawComponentsDir = "src/components/thebookingkit",
    typesOutput: rawTypesOutput = "src/types/thebookingkit.ts",
    authAdapter = "nextauth",
    jobAdapter = "inngest",
    emailAdapter = "resend",
  } = config;

  // Validate adapter union values.
  if (!VALID_AUTH_ADAPTERS.includes(authAdapter)) {
    throw new Error(
      `Invalid authAdapter "${authAdapter}". Allowed: ${VALID_AUTH_ADAPTERS.join(", ")}.`,
    );
  }
  if (!VALID_JOB_ADAPTERS.includes(jobAdapter)) {
    throw new Error(
      `Invalid jobAdapter "${jobAdapter}". Allowed: ${VALID_JOB_ADAPTERS.join(", ")}.`,
    );
  }
  if (!VALID_EMAIL_ADAPTERS.includes(emailAdapter)) {
    throw new Error(
      `Invalid emailAdapter "${emailAdapter}". Allowed: ${VALID_EMAIL_ADAPTERS.join(", ")}.`,
    );
  }

  // Sanitize path strings before interpolation.
  const componentsDir = sanitizePath(rawComponentsDir, "componentsDir");
  const typesOutput = sanitizePath(rawTypesOutput, "typesOutput");

  // Generated config uses the flat BookingKitConfig interface shape.
  return `import type { BookingKitConfig } from "@thebookingkit/cli";

const config: BookingKitConfig = {
  databaseUrl: process.env.DATABASE_URL!,
  componentsDir: "${componentsDir}",
  typesOutput: "${typesOutput}",
  authAdapter: "${authAdapter}",
  jobAdapter: "${jobAdapter}",
  emailAdapter: "${emailAdapter}",
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

# API Key Hashing
THEBOOKINGKIT_API_KEY_SECRET=

# Stripe (optional)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
`;
}
