import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Source tests only — Vitest 5 no longer excludes dist/, and this
    // package's tsconfig compiles its suites into dist/__tests__.
    include: ["src/**/*.test.ts"],
  },
});
