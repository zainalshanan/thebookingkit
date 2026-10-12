import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Source tests only — Vitest 5 no longer excludes dist/, where a build
    // may leave compiled copies of the suites.
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
