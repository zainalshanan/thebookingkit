# @thebookingkit/cli

## 0.5.0

### Minor Changes

- Dependency and correctness release: Stripe 17–23 support, date-fns 4, drizzle-orm 0.45, plain-Node loading.
  
  **Fixes**
  
  - `@thebookingkit/server` — `withSerializableRetry` now finds the Postgres SQLSTATE anywhere down the error's `cause` chain. Drizzle ≥ 0.44 wraps driver errors in `DrizzleQueryError`, so on those versions an exclusion violation (23P01) used to escape as a raw "Failed query" error instead of `BookingConflictError`, and serialization failures (40001) were never retried.
  - `@thebookingkit/server` — `StripePaymentAdapter.cancelPaymentIntent` passes request options in the third argument (`cancel(id, undefined, { stripeAccount })`). stripe-node ≥ 22 no longer reads options from the params slot, so Connect cancels were sent to the platform account with an invalid parameter.
  - `@thebookingkit/server` — `createSetupIntent` no longer sends `receipt_email`, which is not a SetupIntent parameter (any call with `customerEmail` was rejected by Stripe). The option is still accepted and ignored.
  - `@thebookingkit/core` (and therefore `d1` and `server`) — packages now import under plain Node ESM, not only inside a bundler. rrule's UMD build exposes no named exports to Node, so `import { RRule } from "rrule"` threw outside Vite/Next/esbuild.
  
  **Compatibility**
  
  - `stripe` peer range widened from `^17.0.0` to `>=17.0.0 <24.0.0` (still optional). `StripeLike` now accepts a real Stripe client from either end of the range without a cast; this is enforced by a type test.
  - `@thebookingkit/core` and `@thebookingkit/d1` accept `date-fns` `^3.6.0 || ^4.0.0`, so projects on date-fns 4 no longer bundle a second copy. Slot output is identical under both.
  - `@thebookingkit/db` requires `drizzle-orm` `^0.45.4` (was `^0.39.0`): 0.45.2 fixes an SQL-injection advisory for improperly escaped identifiers. If your app pins its own drizzle-orm, upgrade it too.
  - `@thebookingkit/cli` uses commander 15 and requires Node ≥ 22.12 (Node 20 is end-of-life).
  
  **Tooling** — built with TypeScript 7 (emitted JavaScript is byte-identical to 5.9), tested with Vitest 5, and CI now runs build, plain-Node loading, typecheck, unit tests and lint for every published package.

## 0.4.0

## 0.3.1

## 0.1.5

### Minor Changes — QA Audit (2026-03-12)

16 bugs fixed in `@thebookingkit/cli`.

### Bug Fixes

#### Critical

- **C1** — Registry HTTP requests now validate HTTPS URLs and reject non-HTTPS registry endpoints to prevent man-in-the-middle attacks (`registry.ts`)
- **C2** — `executeCommand` validates adapter input before passing to child processes to prevent shell injection (`adapter.ts`)

#### High

- **H1** — Manifest JSON parse errors are caught and wrapped with a helpful error message instead of crashing with raw JSON parse exceptions (`registry.ts`)
- **H2** — Partial installation state is preserved when component installation fails mid-way, allowing users to retry or clean up manually (`install.ts`)
- **H3** — Registry lookup now null-checks response objects before accessing properties, preventing TypeError crashes on malformed responses (`registry.ts`)
- **H4** — `resolvePath` prevents directory escape via `../` sequences using path normalization and validation (`paths.ts`)
- **H5** — Circular dependency detection added to prevent infinite loops when resolving component dependencies (`dependencies.ts`)

#### Medium

- **M1** — Version is now dynamically read from `package.json` instead of hardcoded, ensuring `--version` always reflects actual package version (`bin.ts`)
- **M2** — Default manifest factory now creates fresh instances instead of returning a shared singleton, preventing state mutations across CLI invocations (`manifest.ts`)
- **M3** — Malformed migration filenames now trigger warnings instead of silently failing during migration discovery (`migrations.ts`)
- **M4** — Path traversal prevention added to all file operations that accept user-supplied paths (`fs-utils.ts`)

#### Low

- **L1** — Config template now matches actual `SlotKitConfig` interface shape, preventing type mismatches at runtime (`config-template.ts`)
- **L2** — Quote and backslash injection prevention added to config generation to prevent syntax errors in generated files (`config-generator.ts`)
- **L3** — Removed unused `PackageManager` import that was causing dead-code warnings (`install.ts`)
- **L4** — Config validation now includes checks for malformed adapter configurations (`config-validator.ts`)

## 0.1.1

### Patch Changes

- Initial release of The Booking Kit packages.
