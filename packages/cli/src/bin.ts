#!/usr/bin/env node

/**
 * The Booking Kit CLI — add components, scaffold configs, run migrations.
 *
 * Usage:
 *   npx thebookingkit init          Scaffold thebookingkit.config.ts and .env.local
 *   npx thebookingkit add <name>    Add a component to your project
 *   npx thebookingkit list          List all available components
 *   npx thebookingkit migrate       Run pending database migrations
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Command } from "commander";
import {
  COMPONENT_REGISTRY,
  findComponent,
  resolveComponentDependencies,
  listComponents,
} from "./registry.js";
import {
  createManifestEntry,
  hasLocalModifications,
  DEFAULT_MANIFEST,
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
  .version("0.1.2");

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

program
  .command("init")
  .description("Scaffold thebookingkit.config.ts and .env.local in your project")
  .option("--auth <adapter>", "Auth adapter (nextauth, clerk, supabase, lucia)", "nextauth")
  .option("--jobs <adapter>", "Job adapter (inngest, trigger, bullmq, none)", "inngest")
  .option("--email <adapter>", "Email adapter (resend, sendgrid, ses, none)", "resend")
  .action((options) => {
    const configPath = resolve("thebookingkit.config.ts");
    if (existsSync(configPath)) {
      console.log("thebookingkit.config.ts already exists, skipping.");
    } else {
      const content = generateThebookingkitConfig({
        authAdapter: options.auth,
        jobAdapter: options.jobs,
        emailAdapter: options.email,
      });
      writeFileSync(configPath, content);
      console.log("Created thebookingkit.config.ts");
    }

    const envPath = resolve(".env.local");
    if (existsSync(envPath)) {
      console.log(".env.local already exists, skipping.");
    } else {
      writeFileSync(envPath, generateEnvTemplate());
      console.log("Created .env.local");
    }

    const componentsDir = resolve(DEFAULT_COMPONENTS_DIR);
    if (!existsSync(componentsDir)) {
      mkdirSync(componentsDir, { recursive: true });
      console.log(`Created ${DEFAULT_COMPONENTS_DIR}/`);
    }

    const manifestPath = resolve(MANIFEST_FILE);
    if (!existsSync(manifestPath)) {
      writeFileSync(manifestPath, JSON.stringify(DEFAULT_MANIFEST, null, 2));
      console.log(`Created ${MANIFEST_FILE}`);
    }

    console.log("\nThe Booking Kit initialized! Next steps:");
    console.log("  1. Update .env.local with your database URL");
    console.log("  2. Run: npx thebookingkit add booking-calendar");
    console.log("  3. Run: npx thebookingkit migrate");
  });

// ---------------------------------------------------------------------------
// add <component>
// ---------------------------------------------------------------------------

program
  .command("add")
  .argument("<component>", "Component name (e.g., booking-calendar)")
  .description("Add a Booking Kit component to your project")
  .option("-d, --dir <path>", "Components directory", DEFAULT_COMPONENTS_DIR)
  .option("-f, --force", "Overwrite existing files", false)
  .option("--registry <url>", "Registry URL", REGISTRY_BASE_URL)
  .action(async (componentName: string, options) => {
    const entry = findComponent(componentName);
    if (!entry) {
      console.error(`Unknown component: "${componentName}"`);
      console.error("Run 'npx thebookingkit list' to see available components.");
      process.exit(1);
    }

    // Resolve dependencies
    const toInstall = resolveComponentDependencies(componentName);
    if (toInstall.length > 1) {
      console.log(
        `Installing ${componentName} with ${toInstall.length - 1} dependenc${toInstall.length - 1 === 1 ? "y" : "ies"}: ${toInstall.slice(0, -1).join(", ")}`,
      );
    }

    // Load manifest
    const manifestPath = resolve(MANIFEST_FILE);
    let manifest: SlotKitManifest = DEFAULT_MANIFEST;
    if (existsSync(manifestPath)) {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    }

    const componentsDir = resolve(options.dir);
    if (!existsSync(componentsDir)) {
      mkdirSync(componentsDir, { recursive: true });
    }

    // Collect all npm deps needed
    const allNpmDeps: Record<string, string> = {};

    for (const name of toInstall) {
      const comp = findComponent(name)!;
      const destPath = join(componentsDir, `${name}.tsx`);

      // Check for existing file
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

      // Fetch component source
      let source: string;
      try {
        source = await fetchComponentSource(comp.sourcePath, options.registry);
      } catch (err) {
        console.error(`Failed to fetch ${name}: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }

      // Write file
      const dir = dirname(destPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(destPath, source);

      // Update manifest
      const checksum = sha256(source);
      manifest.components[name] = createManifestEntry(
        name,
        "0.1.0",
        destPath,
        checksum,
      );

      // Collect npm deps
      Object.assign(allNpmDeps, comp.npmDependencies);

      console.log(`  Added ${name}.tsx`);
    }

    // Save manifest
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Report npm deps
    const depsToInstall = Object.entries(allNpmDeps);
    if (depsToInstall.length > 0) {
      console.log("\nInstall required dependencies:");
      console.log(
        `  npm install @thebookingkit/core ${depsToInstall.map(([n, v]) => `${n}@${v}`).join(" ")}`,
      );
    } else {
      console.log("\nInstall required dependency:");
      console.log("  npm install @thebookingkit/core");
    }
  });

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

program
  .command("list")
  .description("List all available Booking Kit components")
  .option("-c, --category <category>", "Filter by category")
  .action((options) => {
    const components = options.category
      ? listComponents(options.category)
      : listComponents();

    if (components.length === 0) {
      console.log(`No components found${options.category ? ` in category "${options.category}"` : ""}.`);
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

async function fetchComponentSource(
  sourcePath: string,
  registryBaseUrl: string,
): Promise<string> {
  // In development: try to read from local registry/ui/src/
  const localPath = resolve("registry", "ui", "src", sourcePath);
  if (existsSync(localPath)) {
    return readFileSync(localPath, "utf-8");
  }

  // In production: fetch from registry URL
  const url = `${registryBaseUrl}/${sourcePath}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  return response.text();
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

program.parse();
