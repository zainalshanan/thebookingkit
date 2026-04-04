# Future Plan

## Phase 1: Fix CI (Current — In Progress)

### Vercel Build
- [x] Fix `priceInCents` → `priceCents` type error in `data-access.ts` and `seed.ts`
- [x] Remove unused Postgres service from GitHub Actions e2e workflow (tests use mock data)
- [ ] Verify Vercel build passes after fix is pushed
- [ ] Verify GitHub Actions e2e workflow passes (73 Playwright tests against mock data)

### Known Pre-Existing CI Issues
- `@thebookingkit/db` build fails due to `seed.ts` missing `@types/node` (uses `process`, `console` without Node types in tsconfig)
- `@thebookingkit/core` build fails because test files (`.test.ts`) are included in `tsc` compilation but `vitest` types aren't in the build tsconfig
- These don't affect the demo build because it depends on the already-built `dist/` output

---

## Phase 2: Docker Postgres Integration Tests (Next)

### Goal
Prove the full stack works: Drizzle schema → Postgres → real queries → real constraints.

### What Needs a Real Database
1. **Schema validity** — Do all 26 tables create without errors on Postgres 15?
2. **`EXCLUDE USING gist` constraint** — Does double-booking prevention actually work at the DB level?
3. **`withSerializableRetry()`** — Do SERIALIZABLE transactions with SQLSTATE 40001 retry correctly?
4. **Drizzle migrations** — Do migration files run cleanly in sequence?
5. **Data integrity** — Foreign keys, cascading deletes, unique constraints, check constraints

### What's Already Wired
- `docker-compose.yml` — Postgres 15 with healthcheck
- `apps/demo/src/lib/db.ts` — Creates Drizzle client when `DATABASE_URL` is set
- `apps/demo/src/lib/data-access.ts` — Dual-mode: reads from DB or falls back to mock data
- `apps/demo/src/lib/seed.ts` — Seeds barbershop data into real tables
- `apps/demo/e2e/global-setup.ts` — Starts Docker, runs migrations, seeds
- `apps/demo/e2e/global-teardown.ts` — Stops Docker
- `npm run e2e:db` — Runs tests with `E2E_WITH_DB=1`
- Playwright config passes `DATABASE_URL` to Next.js dev server in DB mode

### Tasks
- [ ] Fix `@thebookingkit/db` build (add `@types/node`, exclude test files from tsc)
- [ ] Verify `drizzle-kit push` works against Docker Postgres locally
- [ ] Verify `seed.ts` runs cleanly
- [ ] Run `npm run e2e:db` locally and fix any issues
- [ ] Create `packages/db/src/__tests__/integration.test.ts`:
  - Schema creation (all 26 tables)
  - Insert/select/update/delete for core tables
  - `EXCLUDE USING gist` double-booking prevention
  - Cascading deletes (provider → event types → bookings)
  - `btree_gist` extension availability
- [ ] Create `packages/server/src/__tests__/integration.test.ts`:
  - `withSerializableRetry()` against real Postgres with induced contention
  - Concurrent booking simulation with real DB locks
- [ ] Add `db:integration` script to `packages/db/package.json`
- [ ] Add GitHub Actions workflow: `.github/workflows/integration.yml`
  - Runs on push to main + PRs
  - Postgres 15 service container
  - Runs `drizzle-kit push` + package integration tests
  - Separate from e2e workflow (different concern)

---

## Phase 3: Adapter Integration Tests

### Goal
Test adapter implementations against real (or accurately simulated) services.

### Adapters to Test
| Adapter | Default Implementation | Test Approach |
|---------|----------------------|---------------|
| AuthAdapter | NextAuth.js 5.x | Mock NextAuth session in test, verify middleware chain |
| EmailAdapter | Resend | Use Resend test mode (sandbox API key) or mock HTTP |
| JobAdapter | Inngest 3.x | Inngest dev server (`npx inngest-cli dev`) |
| CalendarAdapter | Google Calendar | Mock OAuth tokens, test against Google Calendar sandbox |
| StorageAdapter | Env var key | Unit test only (no external service) |
| SmsAdapter | Twilio | Twilio test credentials |

### Tasks
- [ ] Create `packages/server/src/__tests__/adapter-integration/` directory
- [ ] AuthAdapter: test full middleware chain with mocked NextAuth
- [ ] EmailAdapter: test email send with Resend test key (or HTTP mock)
- [ ] JobAdapter: test job dispatch with Inngest dev server
- [ ] Webhook delivery: test actual HTTP POST with retry logic
- [ ] Add to CI as optional job (runs on main only, not PRs — external services)

---

## Phase 4: Package Build Fixes

### `@thebookingkit/db`
- [ ] Add `@types/node` to devDependencies
- [ ] Exclude `src/__tests__/**` and `src/seed.ts` from tsconfig `include`
- [ ] Verify `npm run build` passes

### `@thebookingkit/core`
- [ ] Exclude `src/__tests__/**` from tsconfig `include`
- [ ] Verify `npm run build` passes

### `@thebookingkit/server`
- [ ] Verify build passes (currently succeeds)

### Monorepo
- [ ] `turbo build` should succeed for all packages
- [ ] Add `turbo typecheck` to CI workflow
