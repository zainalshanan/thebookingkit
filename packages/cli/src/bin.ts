#!/usr/bin/env node

/**
 * The Booking Kit CLI — add components, scaffold configs, run migrations.
 *
 * Usage:
 *   npx thebookingkit init          Scaffold thebookingkit.config.ts and .env.local
 *   npx thebookingkit add <name>    Add one or more components to your project
 *   npx thebookingkit list          List all available components
 *   npx thebookingkit diff          Show locally modified components
 *   npx thebookingkit update        Re-fetch components from the registry
 *   npx thebookingkit doctor        Health-check your Booking Kit setup
 *   npx thebookingkit migrate       Run pending database migrations
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import * as readline from "node:readline";
import { Command } from "commander";
import pkg from "../package.json" assert { type: "json" };
import {
  findComponent,
  resolveComponentDependencies,
  listComponents,
} from "./registry.js";
import {
  createManifestEntry,
  hasLocalModifications,
  getDefaultManifest,
  validateManifest,
  type SlotKitManifest,
} from "./manifest.js";
import { generateThebookingkitConfig, generateEnvTemplate } from "./config.js";

const MANIFEST_FILE = ".thebookingkit-manifest.json";
const DEFAULT_COMPONENTS_DIR = "src/components/thebookingkit";
const REGISTRY_BASE_URL = "https://docs.thebookingkit.dev/registry";

const program = new Command();

program
  .name("thebookingkit")
  .description("The Booking Kit CLI — The Headless Booking Primitive")
  .version(pkg.version);

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

/**
 * A lightweight terminal spinner backed by Node.js `readline`.
 * No external dependencies required.
 */
function createSpinner(label: string): { stop: (finalMsg?: string) => void } {
  if (!process.stdout.isTTY) {
    // Non-interactive environment — just print the label once.
    process.stdout.write(`${label}...\n`);
    return { stop: (msg?: string) => { if (msg) process.stdout.write(`${msg}\n`); } };
  }

  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frame = 0;
  const interval = setInterval(() => {
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`${frames[frame % frames.length]} ${label}`);
    frame++;
  }, 80);

  return {
    stop(finalMsg?: string) {
      clearInterval(interval);
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      if (finalMsg) process.stdout.write(`${finalMsg}\n`);
    },
  };
}

// ---------------------------------------------------------------------------
// Package manager detection
// ---------------------------------------------------------------------------

/**
 * Detect the active package manager by checking for lockfiles in `cwd`.
 *
 * @param cwd - Project root directory
 * @returns The package manager name
 */
function detectPackageManager(cwd: string): "pnpm" | "yarn" | "bun" | "npm" {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lockb"))) return "bun";
  return "npm";
}

/**
 * Return the install subcommand for a given package manager.
 *
 * @param pm - Package manager name
 * @returns Install subcommand string
 */
function installCommand(pm: "pnpm" | "yarn" | "bun" | "npm"): string {
  if (pm === "npm") return "npm install";
  return `${pm} add`;
}

// ---------------------------------------------------------------------------
// Manifest helpers
// ---------------------------------------------------------------------------

/**
 * Read and validate the manifest file.
 * Exits with a clear error message if the file is missing, unparseable, or
 * has an invalid schema.
 *
 * @param manifestPath - Absolute path to the manifest file
 * @returns A valid SlotKitManifest
 */
function readManifest(manifestPath: string): SlotKitManifest {
  if (!existsSync(manifestPath)) {
    return getDefaultManifest();
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    console.error(
      `Failed to parse ${MANIFEST_FILE} — the file is not valid JSON.\n` +
      `Delete the file and re-run \`init\` to reset it.`,
    );
    process.exit(1);
  }
  const result = validateManifest(raw);
  if (!result.valid) {
    console.error(
      `${MANIFEST_FILE} has an invalid structure: ${result.error}\n` +
      `Delete the file and re-run \`init\` to reset it.`,
    );
    process.exit(1);
  }
  return result.manifest;
}

/**
 * Persist the manifest to disk, wrapped in a try/catch for permission errors.
 *
 * @param manifestPath - Absolute path to the manifest file
 * @param manifest - Manifest object to serialize
 */
function writeManifest(manifestPath: string, manifest: SlotKitManifest): void {
  try {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  } catch (err) {
    console.error(
      `Failed to write ${MANIFEST_FILE}: ${err instanceof Error ? err.message : String(err)}\n` +
      `Check that you have write permission in this directory.`,
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

program
  .command("init")
  .description("Scaffold thebookingkit.config.ts and .env.local in your project")
  .option("--auth <adapter>", "Auth adapter (nextauth, clerk, supabase, lucia)")
  .option("--jobs <adapter>", "Job adapter (inngest, trigger, bullmq, none)")
  .option("--email <adapter>", "Email adapter (resend, sendgrid, ses, none)")
  .action(async (options) => {
    // Determine whether we need interactive prompts.
    const isInteractive = !options.auth && !options.jobs && !options.email;

    let auth: string = options.auth ?? "nextauth";
    let jobs: string = options.jobs ?? "inngest";
    let email: string = options.email ?? "resend";

    if (isInteractive && process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const question = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));

      console.log("The Booking Kit — interactive setup\n");

      const authInput = await question(
        "Auth adapter [nextauth, clerk, supabase, lucia] (default: nextauth): ",
      );
      if (authInput.trim()) auth = authInput.trim();

      const jobsInput = await question(
        "Job adapter [inngest, trigger, bullmq, none] (default: inngest): ",
      );
      if (jobsInput.trim()) jobs = jobsInput.trim();

      const emailInput = await question(
        "Email adapter [resend, sendgrid, ses, none] (default: resend): ",
      );
      if (emailInput.trim()) email = emailInput.trim();

      rl.close();
      console.log();
    }

    const configPath = resolve("thebookingkit.config.ts");
    if (existsSync(configPath)) {
      console.log("thebookingkit.config.ts already exists, skipping.");
    } else {
      let content: string;
      try {
        content = generateThebookingkitConfig({
          authAdapter: auth as Parameters<typeof generateThebookingkitConfig>[0]["authAdapter"],
          jobAdapter: jobs as Parameters<typeof generateThebookingkitConfig>[0]["jobAdapter"],
          emailAdapter: email as Parameters<typeof generateThebookingkitConfig>[0]["emailAdapter"],
        });
      } catch (err) {
        console.error(`Config generation failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
      try {
        writeFileSync(configPath, content);
      } catch (err) {
        console.error(
          `Failed to write thebookingkit.config.ts: ${err instanceof Error ? err.message : String(err)}\n` +
          `Check that you have write permission in this directory.`,
        );
        process.exit(1);
      }
      console.log("Created thebookingkit.config.ts");
    }

    const envPath = resolve(".env.local");
    if (existsSync(envPath)) {
      console.log(".env.local already exists, skipping.");
    } else {
      try {
        writeFileSync(envPath, generateEnvTemplate());
      } catch (err) {
        console.error(
          `Failed to write .env.local: ${err instanceof Error ? err.message : String(err)}\n` +
          `Check that you have write permission in this directory.`,
        );
        process.exit(1);
      }
      console.log("Created .env.local");
    }

    // Ensure .env.local is in .gitignore
    const gitignorePath = resolve(".gitignore");
    const envLocalEntry = ".env.local";
    if (existsSync(gitignorePath)) {
      const gitignoreContent = readFileSync(gitignorePath, "utf-8");
      const lines = gitignoreContent.split("\n").map((l) => l.trim());
      if (!lines.includes(envLocalEntry)) {
        try {
          const separator = gitignoreContent.endsWith("\n") ? "" : "\n";
          writeFileSync(gitignorePath, `${gitignoreContent}${separator}${envLocalEntry}\n`);
          console.log("Updated .gitignore to include .env.local");
        } catch (err) {
          console.warn(
            `Warning: could not update .gitignore: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } else {
      try {
        writeFileSync(gitignorePath, `${envLocalEntry}\n`);
        console.log("Created .gitignore with .env.local");
      } catch (err) {
        console.warn(
          `Warning: could not create .gitignore: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const componentsDir = resolve(DEFAULT_COMPONENTS_DIR);
    if (!existsSync(componentsDir)) {
      try {
        mkdirSync(componentsDir, { recursive: true });
      } catch (err) {
        console.error(
          `Failed to create ${DEFAULT_COMPONENTS_DIR}/: ${err instanceof Error ? err.message : String(err)}\n` +
          `Check that you have write permission in this directory.`,
        );
        process.exit(1);
      }
      console.log(`Created ${DEFAULT_COMPONENTS_DIR}/`);
    }

    const manifestPath = resolve(MANIFEST_FILE);
    if (!existsSync(manifestPath)) {
      writeManifest(manifestPath, getDefaultManifest());
      console.log(`Created ${MANIFEST_FILE}`);
    }

    console.log("\nThe Booking Kit initialized! Next steps:");
    console.log("  1. Update .env.local with your database URL");
    console.log("  2. Run: npx thebookingkit add booking-calendar");
    console.log("  3. Run: npx thebookingkit migrate");
  });

// ---------------------------------------------------------------------------
// add <components...>
// ---------------------------------------------------------------------------

program
  .command("add")
  .argument("<components...>", "Component name(s) (e.g., booking-calendar time-slot-picker)")
  .description("Add one or more Booking Kit components to your project")
  .option("-d, --dir <path>", "Components directory", DEFAULT_COMPONENTS_DIR)
  .option("-f, --force", "Overwrite existing files", false)
  .option("--registry <url>", "Registry URL", REGISTRY_BASE_URL)
  .option("--dry-run", "Show what would be written without writing any files", false)
  .action(async (componentNames: string[], options) => {
    const isDryRun: boolean = options.dryRun as boolean;

    // Validate registry URL — only https:// is permitted.
    const registryUrl: string = options.registry as string;
    if (!registryUrl.startsWith("https://")) {
      console.error(
        `Invalid --registry URL "${registryUrl}": only https:// URLs are permitted.`,
      );
      process.exit(1);
    }

    // Validate all requested component names before doing any work.
    for (const componentName of componentNames) {
      const entry = findComponent(componentName);
      if (!entry) {
        console.error(`Unknown component: "${componentName}"`);
        console.error("Run 'npx thebookingkit list' to see available components.");
        process.exit(1);
      }
    }

    // Collect the deduplicated install list across all requested components.
    const installSet = new Set<string>();
    for (const componentName of componentNames) {
      for (const dep of resolveComponentDependencies(componentName)) {
        installSet.add(dep);
      }
    }
    const toInstall = [...installSet];

    if (toInstall.length > componentNames.length) {
      const extraDeps = toInstall.filter((n) => !componentNames.includes(n));
      console.log(
        `Installing ${componentNames.join(", ")} with ${extraDeps.length} dependenc${extraDeps.length === 1 ? "y" : "ies"}: ${extraDeps.join(", ")}`,
      );
    }

    if (isDryRun) {
      console.log("[dry-run] The following files would be written:");
    }

    // Load manifest
    const manifestPath = resolve(MANIFEST_FILE);
    const manifest: SlotKitManifest = readManifest(manifestPath);

    const componentsDir = resolve(options.dir as string);
    const cwd = resolve(".");
    if (!componentsDir.startsWith(cwd + "/") && componentsDir !== cwd) {
      console.error(
        `Invalid --dir path: "${options.dir as string}" resolves outside the current working directory.`,
      );
      process.exit(1);
    }
    if (!isDryRun && !existsSync(componentsDir)) {
      try {
        mkdirSync(componentsDir, { recursive: true });
      } catch (err) {
        console.error(
          `Failed to create components directory: ${err instanceof Error ? err.message : String(err)}\n` +
          `Check that you have write permission in this directory.`,
        );
        process.exit(1);
      }
    }

    // Collect all npm deps needed
    const allNpmDeps: Record<string, string> = {};

    // Determine which components actually need to be fetched (skip locally
    // modified ones unless --force is used). Build fetch tasks for parallelism.
    type FetchTask = {
      name: string;
      comp: ReturnType<typeof findComponent> & object;
      destPath: string;
    };

    const tasks: FetchTask[] = [];

    for (const name of toInstall) {
      const comp = findComponent(name);
      if (!comp) {
        console.error(
          `Component "${name}" was listed as a dependency but is not in the registry.`,
        );
        process.exit(1);
      }
      const destPath = join(componentsDir, `${name}.tsx`);

      if (existsSync(destPath) && !options.force) {
        const existing = manifest.components[name];
        if (existing) {
          const currentChecksum = sha256(readFileSync(destPath, "utf-8"));
          if (hasLocalModifications(existing, currentChecksum)) {
            console.log(`Skipping ${name} (locally modified). Use --force to overwrite.`);
            continue;
          }
        }
      }

      // Collect npm deps eagerly (we know the component exists).
      Object.assign(allNpmDeps, comp.npmDependencies);

      if (isDryRun) {
        const relDest = relative(cwd, destPath);
        console.log(`  [dry-run] Would write: ${relDest}`);
        continue;
      }

      tasks.push({ name, comp, destPath });
    }

    if (!isDryRun && tasks.length > 0) {
      // Fetch all component sources in parallel.
      const spinner = createSpinner(
        tasks.length === 1
          ? `Fetching ${tasks[0].name}`
          : `Fetching ${tasks.length} components`,
      );

      type FetchResult =
        | { name: string; destPath: string; source: string; comp: FetchTask["comp"] }
        | { name: string; error: Error };

      const results = await Promise.all(
        tasks.map(async ({ name, comp, destPath }): Promise<FetchResult> => {
          try {
            const source = await fetchComponentSource(comp.sourcePath, registryUrl);
            return { name, destPath, source, comp };
          } catch (err) {
            return { name, error: err instanceof Error ? err : new Error(String(err)) };
          }
        }),
      );

      spinner.stop();

      for (const result of results) {
        if ("error" in result) {
          // Persist what we have so far before bailing.
          writeManifest(manifestPath, manifest);
          const suggestion = result.error.message.includes("404")
            ? "Run 'npx thebookingkit list' to verify the component name."
            : result.error.message.includes("fetch") || result.error.message.toLowerCase().includes("network")
            ? "Check your internet connection and retry."
            : "Check your internet connection or retry. Run 'npx thebookingkit list' to verify the component name.";
          console.error(`Failed to fetch ${result.name}: ${result.error.message}`);
          console.error(`Suggestion: ${suggestion}`);
          process.exit(1);
        }

        const { name, destPath, source, comp } = result;

        // Write file
        const dir = dirname(destPath);
        if (!existsSync(dir)) {
          try {
            mkdirSync(dir, { recursive: true });
          } catch (err) {
            console.error(
              `Failed to create directory ${dir}: ${err instanceof Error ? err.message : String(err)}\n` +
              `Check that you have write permission.`,
            );
            process.exit(1);
          }
        }
        try {
          writeFileSync(destPath, source);
        } catch (err) {
          console.error(
            `Failed to write ${destPath}: ${err instanceof Error ? err.message : String(err)}\n` +
            `Check that you have write permission.`,
          );
          process.exit(1);
        }

        // Update manifest with relative path
        const checksum = sha256(source);
        const relativeDest = relative(cwd, destPath);
        manifest.components[name] = createManifestEntry(
          name,
          pkg.version,
          relativeDest,
          checksum,
        );

        // Collect npm deps
        Object.assign(allNpmDeps, comp.npmDependencies);

        console.log(`  Added ${name}.tsx`);
      }

      // Save manifest
      writeManifest(manifestPath, manifest);
    }

    if (isDryRun) {
      console.log("[dry-run] No files were written.");
      return;
    }

    // Report npm deps with the correct package manager command.
    const pm = detectPackageManager(cwd);
    const installCmd = installCommand(pm);
    const depsToInstall = Object.entries(allNpmDeps);
    if (depsToInstall.length > 0) {
      console.log("\nInstall required dependencies:");
      console.log(
        `  ${installCmd} @thebookingkit/core ${depsToInstall.map(([n, v]) => `${n}@${v}`).join(" ")}`,
      );
    } else {
      console.log("\nInstall required dependency:");
      console.log(`  ${installCmd} @thebookingkit/core`);
    }
  });

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

program
  .command("list")
  .description("List all available Booking Kit components")
  .option("-c, --category <category>", "Filter by category")
  .option("--json", "Output registry as JSON", false)
  .action((options) => {
    const components = options.category
      ? listComponents(options.category as Parameters<typeof listComponents>[0])
      : listComponents();

    if (options.json) {
      process.stdout.write(JSON.stringify(components, null, 2) + "\n");
      return;
    }

    if (components.length === 0) {
      console.log(`No components found${options.category ? ` in category "${options.category as string}"` : ""}.`);
      return;
    }

    // Group by category
    const grouped = new Map<string, typeof components>();
    for (const comp of components) {
      const list = grouped.get(comp.category) ?? [];
      list.push(comp);
      grouped.set(comp.category, list);
    }

    for (const [category, items] of grouped) {
      console.log(`\n${category.toUpperCase()}`);
      for (const comp of items) {
        const deps = comp.dependencies.length > 0
          ? ` (depends: ${comp.dependencies.join(", ")})`
          : "";
        console.log(`  ${comp.name.padEnd(28)} ${comp.description}${deps}`);
      }
    }

    console.log(`\n${components.length} components available`);
    console.log("Run 'npx thebookingkit add <name>' to add a component.");
  });

// ---------------------------------------------------------------------------
// diff
// ---------------------------------------------------------------------------

program
  .command("diff")
  .description("Show which installed components have been locally modified")
  .action(() => {
    const manifestPath = resolve(MANIFEST_FILE);
    const manifest = readManifest(manifestPath);
    const cwd = resolve(".");

    const entries = Object.values(manifest.components);
    if (entries.length === 0) {
      console.log("No components installed yet. Run 'npx thebookingkit add <name>' first.");
      return;
    }

    let modifiedCount = 0;
    let missingCount = 0;

    for (const entry of entries) {
      // Support both relative and legacy absolute paths
      const absPath = entry.installedPath.startsWith("/")
        ? entry.installedPath
        : resolve(cwd, entry.installedPath);

      if (!existsSync(absPath)) {
        console.log(`  MISSING   ${entry.name}  (expected at ${entry.installedPath})`);
        missingCount++;
        continue;
      }

      const currentChecksum = sha256(readFileSync(absPath, "utf-8"));
      if (hasLocalModifications(entry, currentChecksum)) {
        console.log(`  MODIFIED  ${entry.name}  (${entry.installedPath})`);
        modifiedCount++;
      } else {
        console.log(`  CLEAN     ${entry.name}`);
      }
    }

    console.log(
      `\n${entries.length} component(s) checked — ` +
      `${modifiedCount} modified, ${missingCount} missing.`,
    );
  });

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

program
  .command("update")
  .argument("[components...]", "Component name(s) to update (defaults to all installed)")
  .description("Re-fetch component source from the registry")
  .option("-f, --force", "Overwrite even locally modified components", false)
  .option("--registry <url>", "Registry URL", REGISTRY_BASE_URL)
  .option("--dry-run", "Show what would be updated without writing files", false)
  .action(async (componentArgs: string[], options) => {
    const isDryRun: boolean = options.dryRun as boolean;
    const registryUrl: string = options.registry as string;
    if (!registryUrl.startsWith("https://")) {
      console.error(
        `Invalid --registry URL "${registryUrl}": only https:// URLs are permitted.`,
      );
      process.exit(1);
    }

    const manifestPath = resolve(MANIFEST_FILE);
    const manifest = readManifest(manifestPath);
    const cwd = resolve(".");

    const installedNames = Object.keys(manifest.components);
    if (installedNames.length === 0) {
      console.log("No components installed yet. Run 'npx thebookingkit add <name>' first.");
      return;
    }

    // Determine which components to update.
    let targetNames: string[];
    if (componentArgs.length > 0) {
      for (const name of componentArgs) {
        if (!manifest.components[name]) {
          console.error(`"${name}" is not installed. Run 'npx thebookingkit add ${name}' first.`);
          process.exit(1);
        }
      }
      targetNames = componentArgs;
    } else {
      targetNames = installedNames;
    }

    for (const name of targetNames) {
      const entry = manifest.components[name];
      if (!entry) continue;

      const comp = findComponent(name);
      if (!comp) {
        console.warn(`  WARN  "${name}" is in the manifest but not found in the registry. Skipping.`);
        continue;
      }

      const absPath = entry.installedPath.startsWith("/")
        ? entry.installedPath
        : resolve(cwd, entry.installedPath);

      // Check for local modifications.
      if (existsSync(absPath) && !options.force) {
        const currentChecksum = sha256(readFileSync(absPath, "utf-8"));
        if (hasLocalModifications(entry, currentChecksum)) {
          console.log(
            `  SKIP  ${name} — locally modified. Use --force to overwrite.`,
          );
          continue;
        }
      }

      if (isDryRun) {
        const relPath = entry.installedPath;
        console.log(`  [dry-run] Would update: ${relPath}`);
        continue;
      }

      const spinner = createSpinner(`Fetching ${name}`);
      let source: string;
      try {
        source = await fetchComponentSource(comp.sourcePath, registryUrl);
      } catch (err) {
        spinner.stop();
        const msg = err instanceof Error ? err.message : String(err);
        const suggestion = msg.includes("404")
          ? "Run 'npx thebookingkit list' to verify the component name."
          : "Check your internet connection and retry.";
        console.error(`Failed to fetch ${name}: ${msg}`);
        console.error(`Suggestion: ${suggestion}`);
        continue;
      }
      spinner.stop();

      // Write to the stored path.
      const dir = dirname(absPath);
      if (!existsSync(dir)) {
        try {
          mkdirSync(dir, { recursive: true });
        } catch (err) {
          console.error(
            `Failed to create directory ${dir}: ${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }
      }
      try {
        writeFileSync(absPath, source);
      } catch (err) {
        console.error(
          `Failed to write ${absPath}: ${err instanceof Error ? err.message : String(err)}\n` +
          `Check that you have write permission.`,
        );
        continue;
      }

      const checksum = sha256(source);
      const relativeDest = absPath.startsWith(cwd)
        ? relative(cwd, absPath)
        : entry.installedPath;
      manifest.components[name] = createManifestEntry(
        name,
        pkg.version,
        relativeDest,
        checksum,
      );

      console.log(`  Updated ${name}.tsx`);
    }

    if (!isDryRun) {
      writeManifest(manifestPath, manifest);
    } else {
      console.log("[dry-run] No files were written.");
    }
  });

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------

program
  .command("doctor")
  .description("Health-check your Booking Kit setup")
  .action(() => {
    const cwd = resolve(".");
    let passed = 0;
    let failed = 0;

    function check(label: string, ok: boolean, hint?: string): void {
      if (ok) {
        console.log(`  PASS  ${label}`);
        passed++;
      } else {
        console.log(`  FAIL  ${label}${hint ? `\n        Hint: ${hint}` : ""}`);
        failed++;
      }
    }

    console.log("The Booking Kit — doctor\n");

    // 1. Config file present?
    check(
      "thebookingkit.config.ts exists",
      existsSync(resolve("thebookingkit.config.ts")),
      "Run 'npx thebookingkit init' to create it.",
    );

    // 2. @thebookingkit/core in package.json?
    const pkgJsonPath = resolve("package.json");
    let hasCoreInstalled = false;
    if (existsSync(pkgJsonPath)) {
      try {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        hasCoreInstalled =
          "@thebookingkit/core" in (pkgJson.dependencies ?? {}) ||
          "@thebookingkit/core" in (pkgJson.devDependencies ?? {});
      } catch {
        // unparseable package.json — will fail the check below
      }
    }
    check(
      "@thebookingkit/core is in package.json",
      hasCoreInstalled,
      "Run: npm install @thebookingkit/core",
    );

    // 3. Manifest and installed files.
    const manifestPath = resolve(MANIFEST_FILE);
    check(
      `${MANIFEST_FILE} exists`,
      existsSync(manifestPath),
      "Run 'npx thebookingkit init' to create it.",
    );

    if (existsSync(manifestPath)) {
      const manifest = readManifest(manifestPath);
      const entries = Object.values(manifest.components);

      if (entries.length === 0) {
        console.log("  INFO  No components installed yet.");
      }

      for (const entry of entries) {
        const absPath = entry.installedPath.startsWith("/")
          ? entry.installedPath
          : resolve(cwd, entry.installedPath);

        const fileExists = existsSync(absPath);
        check(
          `${entry.name} file present (${entry.installedPath})`,
          fileExists,
          `Run 'npx thebookingkit add ${entry.name}' to reinstall.`,
        );

        if (fileExists) {
          const currentChecksum = sha256(readFileSync(absPath, "utf-8"));
          const modified = hasLocalModifications(entry, currentChecksum);
          check(
            `${entry.name} checksum clean`,
            !modified,
            "File has local modifications. This is fine but 'npx thebookingkit update' may overwrite your changes.",
          );
        }
      }
    }

    console.log(`\n${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
  });

// ---------------------------------------------------------------------------
// migrate
// ---------------------------------------------------------------------------

program
  .command("migrate")
  .description("Run pending Booking Kit database migrations")
  .action(() => {
    console.log("Migration support requires @thebookingkit/db.");
    console.log("Run: npx drizzle-kit push");
    console.log("Or:  npx drizzle-kit migrate");
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a component's source file from the local registry (development) or
 * the remote registry URL (production). A 10-second network timeout is applied
 * via `AbortSignal.timeout`.
 *
 * @param sourcePath - Relative path within the registry (e.g., "components/foo.tsx")
 * @param registryBaseUrl - Base URL of the remote component registry
 * @returns The component source code as a string
 */
async function fetchComponentSource(
  sourcePath: string,
  registryBaseUrl: string,
): Promise<string> {
  // Guard against path traversal in registry-supplied sourcePath values.
  const normalised = sourcePath.replace(/\\/g, "/");
  if (normalised.split("/").some((segment) => segment === "..")) {
    throw new Error(
      `Refusing to use sourcePath "${sourcePath}" — path traversal segments ("..") are not allowed.`,
    );
  }

  // In development: try to read from local registry/ui/src/
  const localPath = resolve("registry", "ui", "src", sourcePath);
  if (existsSync(localPath)) {
    return readFileSync(localPath, "utf-8");
  }

  // In production: fetch from registry URL with a 10-second timeout.
  const url = `${registryBaseUrl}/${sourcePath}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `HTTP 404 fetching ${url} — component not found in the registry.\n` +
        `Suggestion: Run 'npx thebookingkit list' to verify the component name.`,
      );
    }
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  return response.text();
}

/**
 * Compute the SHA-256 hex digest of a string.
 *
 * @param content - String to hash
 * @returns Hex-encoded SHA-256 digest
 */
function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

program.parse();
