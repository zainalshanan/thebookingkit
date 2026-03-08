/**
 * Config file and env template generation for SlotKit projects.
 */

// ---------------------------------------------------------------------------
// Types
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

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate the content of slotkit.config.ts */
export function generateSlotkitConfig(config: Partial<SlotKitConfig>): string {
  const {
    componentsDir = "src/components/slotkit",
    typesOutput = "src/types/slotkit.ts",
    authAdapter = "nextauth",
    jobAdapter = "inngest",
    emailAdapter = "resend",
  } = config;

  return `import type { SlotKitConfig } from "@slotkit/cli";

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

# API Key Hashing
SLOTKIT_API_KEY_SECRET=

# Stripe (optional)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
`;
}
