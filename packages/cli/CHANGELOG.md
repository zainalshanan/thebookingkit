# @thebookingkit/cli

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
