import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const DB_URL = "postgresql://thebookingkit:thebookingkit@localhost:5432/thebookingkit";

/**
 * Global setup for full-stack e2e tests.
 * Starts Docker Postgres, waits for healthcheck, runs migrations, and seeds.
 */
export default async function globalSetup() {
  console.log("[e2e] Starting Docker Postgres...");
  execSync("docker compose up -d --wait", { cwd: ROOT, stdio: "inherit" });

  console.log("[e2e] Running database migrations...");
  execSync("npx drizzle-kit push", {
    cwd: path.join(ROOT, "packages/db"),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: DB_URL },
  });

  console.log("[e2e] Seeding demo data...");
  execSync("npx tsx src/lib/seed.ts", {
    cwd: path.join(ROOT, "apps/demo"),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: DB_URL },
  });

  // Set DATABASE_URL for the Next.js dev server
  process.env.DATABASE_URL = DB_URL;

  console.log("[e2e] Database ready.");
}
