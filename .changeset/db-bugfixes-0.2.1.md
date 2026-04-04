---
"@thebookingkit/db": patch
---

fix: integration test infrastructure and audit trigger correctness (v0.2.1)

- **Audit trigger**: Replace direct `NEW.status::booking_event_type` cast with explicit `CASE` expression — the direct cast silently failed when status values didn't align with enum labels; the `CASE` now maps each status explicitly with an `'updated'` fallback, making future enum divergence visible
- **drizzle.config.ts**: Correct schema path from `./src/schema/index.ts` to `./dist/schema/index.js` — drizzle-kit requires the compiled JS output, not the TypeScript source; this was causing `drizzle-kit push` and `drizzle-kit generate` to fail when run after a clean build
- **Integration tests**: Fix `ANY(array)` SQL queries that broke with postgres.js — replaced raw `sql\`id = ANY(${jsArray})\`` with drizzle-orm's `inArray()` helper; fixed table-existence check to use `sql.join` with `IN` instead of `ANY`
- **CI workflow**: Restore `echo "yes" | npx drizzle-kit push` — `--force` is not a valid drizzle-kit flag and was silently re-introduced, reverting a prior fix; CI now also manages the Postgres container explicitly (`docker run` / `docker rm -v`) rather than relying on GitHub Actions `services:`, ensuring both container and volume are removed after every run
- **Local test script**: Add `scripts/test-integration.sh` and `test:integration:fresh` npm script — spins up an isolated Postgres 15 container on port 5433, runs schema push + custom migrations + vitest, then removes the container and volume via `trap cleanup EXIT` regardless of test outcome; does not affect the dev DB on port 5432
