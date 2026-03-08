# E-15 — CLI Tooling (`@slotkit/cli`)

> **Priority:** Post-MVP · **Sprints:** 15–16 · **Story Points:** 23 · **Release:** R4

Developer CLI for scaffolding projects, adding components, running migrations, generating types, and safely merging upstream component updates.

---

## User Stories

### 15.1 E15-S01 — Project Scaffolding (`init`) `[Must]` · 5 pts

- [ ] **Complete**

**As a** developer, **I want to** run `npx @slotkit/cli init` to scaffold a new project **so that** I get a working starting point with schema, config, and sample components in under 2 minutes.

**Acceptance Criteria:**

- [ ] Interactive prompts: project name, Postgres connection string, database provider, auth adapter, framework (Next.js App Router / Pages Router), package manager.
- [ ] Generates: `.env.local` with database and auth keys placeholder, Drizzle ORM schema directory with core schema, a `slotkit.config.ts` with default settings.
- [ ] Optionally copies starter UI components into the project.
- [ ] Prints next steps: configure env keys, run migration, start dev server.

---

### 15.2 E15-S02 — Component Addition (`add`) `[Must]` · 5 pts

- [ ] **Complete**

**As a** developer, **I want to** run `npx @slotkit/cli add <component>` to add individual components **so that** I can incrementally add only the components I need, shadcn-style.

**Acceptance Criteria:**

- [ ] `npx @slotkit/cli add booking-calendar` copies `<BookingCalendar />` into the project's components directory.
- [ ] CLI resolves component dependencies (e.g., `booking-calendar` depends on `timezone-selector`) and adds them too.
- [ ] Components are copied as source files (not compiled), editable by the developer.
- [ ] Available components are listed with `npx @slotkit/cli add --list`.
- [ ] The target directory is configurable in `slotkit.config.ts`.

---

### 15.3 E15-S03 — Migration Runner (`migrate`) `[Should]` · 5 pts

- [ ] **Complete**

**As a** developer, **I want to** run `npx @slotkit/cli migrate` to apply schema changes **so that** I can update my database schema when upgrading `@slotkit/core` versions.

**Acceptance Criteria:**

- [ ] CLI detects pending migrations by comparing local migration files with a `schema_version` table in the database.
- [ ] Migrations are applied in order via Drizzle Kit under the hood.
- [ ] A dry-run mode (`--dry-run`) shows which migrations would be applied without executing.
- [ ] Rollback support for the last applied migration (`--rollback`).

---

### 15.4 E15-S04 — Type Generation (`generate types`) `[Should]` · 3 pts

- [ ] **Complete**

**As a** developer, **I want to** run `npx @slotkit/cli generate types` to get fresh TypeScript types **so that** my types always match the current database schema.

**Acceptance Criteria:**

- [ ] Generates a consolidated TypeScript types barrel file from the Drizzle ORM schema to a configurable path (default: `src/types/slotkit.ts`).
- [ ] Types include all core tables plus any developer-added custom tables.
- [ ] Command exits with an error and helpful message if the database is unreachable.

---

### 15.5 E15-S05 — Component Diff & Update (`diff`, `update`) `[Should]` · 5 pts

- [ ] **Complete**

**As a** developer, **I want to** run `npx @slotkit/cli diff <component>` to see upstream changes and safely merge updates **so that** I can receive critical bug fixes and improvements to components I've already customized without losing my changes.

**Acceptance Criteria:**

- [ ] `npx @slotkit/cli diff booking-calendar` compares the developer's local component file against the latest upstream version and outputs a colored unified diff.
- [ ] `npx @slotkit/cli update booking-calendar --interactive` opens a three-way merge view showing: upstream changes, local changes, and conflicts, allowing the developer to accept/reject each hunk.
- [ ] If the local file is unmodified from the original, `npx @slotkit/cli update booking-calendar` replaces it cleanly with no merge required.
- [ ] A `.slotkit-manifest.json` file tracks which version of each component was originally copied, enabling accurate diff computation.
- [ ] `npx @slotkit/cli outdated` lists all components with available upstream updates and whether they have local modifications.
- [ ] The update command creates a `.bak` backup of the original file before applying any changes.
