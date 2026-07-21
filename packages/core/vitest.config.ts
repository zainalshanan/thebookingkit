import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    /**
     * The property-based suites run 500 fast-check iterations per invariant and
     * take 1–2 s each in isolation. Under `turbo test` several packages build and
     * run concurrently, and the slowest invariant would intermittently exceed
     * Vitest's 5 s default — a flaky failure unrelated to the invariant itself.
     */
    testTimeout: 30_000,
  },
});
