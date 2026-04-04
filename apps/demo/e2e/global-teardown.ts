import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

/**
 * Global teardown for full-stack e2e tests.
 * Stops and removes Docker containers.
 */
export default async function globalTeardown() {
  if (process.env.E2E_KEEP_DB) {
    console.log("[e2e] Keeping Docker Postgres running (E2E_KEEP_DB=1).");
    return;
  }
  console.log("[e2e] Stopping Docker Postgres...");
  execSync("docker compose down", { cwd: ROOT, stdio: "inherit" });
}
