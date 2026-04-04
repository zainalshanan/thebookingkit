import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "html" : "list",
  timeout: 30_000,

  use: {
    baseURL: "http://localhost:3333",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: process.env.E2E_WITH_DB
      ? "DATABASE_URL=postgresql://thebookingkit:thebookingkit@localhost:5432/thebookingkit npm run dev"
      : "npm run dev",
    port: 3333,
    cwd: path.resolve(__dirname, ".."),
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  globalSetup: process.env.E2E_WITH_DB ? "./global-setup.ts" : undefined,
  globalTeardown: process.env.E2E_WITH_DB ? "./global-teardown.ts" : undefined,
});
