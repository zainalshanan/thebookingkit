#!/usr/bin/env npx tsx

/**
 * Registry Generator
 *
 * 1. Copies raw component/hook/util source files to apps/docs/public/registry/
 *    so the CLI can fetch them from https://thebookingkit.dev/registry/components/<name>.tsx
 *
 * 2. Generates apps/docs/public/registry/index.json with metadata and inline source
 *    for documentation browsing.
 *
 * Usage:
 *   npx tsx scripts/build-registry.ts
 */

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const REGISTRY_SRC = resolve("registry/ui/src");
const OUTPUT_DIR = resolve("apps/docs/public/registry");

interface ComponentRegistryEntry {
  name: string;
  displayName: string;
  description: string;
  sourcePath: string;
  dependencies: string[];
  npmDependencies: Record<string, string>;
  category: string;
}

// Read the registry definition from CLI source
function loadRegistry(): ComponentRegistryEntry[] {
  const registryPath = resolve("packages/cli/src/registry.ts");
  const content = readFileSync(registryPath, "utf-8");

  const match = content.match(
    /export const COMPONENT_REGISTRY[^=]*=\s*\[([\s\S]*?)\];/,
  );
  if (!match) {
    throw new Error("Could not parse COMPONENT_REGISTRY from registry.ts");
  }

  const arraySource = `[${match[1]}]`;
  const entries = new Function(`return ${arraySource}`)() as ComponentRegistryEntry[];
  return entries;
}

interface RegistryOutput {
  version: string;
  generatedAt: string;
  components: Array<{
    name: string;
    displayName: string;
    description: string;
    category: string;
    dependencies: string[];
    npmDependencies: Record<string, string>;
    files: Array<{
      path: string;
      content: string;
      checksum: string;
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// Step 1: Copy raw source files so the CLI can fetch them
// ---------------------------------------------------------------------------

function copySourceFiles(): number {
  let count = 0;

  // Copy components
  const componentsOut = join(OUTPUT_DIR, "components");
  mkdirSync(componentsOut, { recursive: true });
  const componentsDir = join(REGISTRY_SRC, "components");
  for (const file of readdirSync(componentsDir)) {
    if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      copyFileSync(join(componentsDir, file), join(componentsOut, file));
      count++;
    }
  }

  // Copy hooks
  const hooksDir = join(REGISTRY_SRC, "hooks");
  if (existsSync(hooksDir)) {
    const hooksOut = join(OUTPUT_DIR, "hooks");
    mkdirSync(hooksOut, { recursive: true });
    for (const file of readdirSync(hooksDir)) {
      if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        copyFileSync(join(hooksDir, file), join(hooksOut, file));
        count++;
      }
    }
  }

  // Copy utils
  const utilsDir = join(REGISTRY_SRC, "utils");
  if (existsSync(utilsDir)) {
    const utilsOut = join(OUTPUT_DIR, "utils");
    mkdirSync(utilsOut, { recursive: true });
    for (const file of readdirSync(utilsDir)) {
      if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        copyFileSync(join(utilsDir, file), join(utilsOut, file));
        count++;
      }
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Step 2: Generate index.json with inline source
// ---------------------------------------------------------------------------

function buildRegistry(): RegistryOutput {
  const entries = loadRegistry();
  const output: RegistryOutput = {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    components: [],
  };

  for (const entry of entries) {
    const filePath = join(REGISTRY_SRC, entry.sourcePath);

    if (!existsSync(filePath)) {
      console.warn(`  Warning: ${entry.sourcePath} not found, skipping`);
      continue;
    }

    const content = readFileSync(filePath, "utf-8");
    const checksum = createHash("sha256").update(content).digest("hex");

    output.components.push({
      name: entry.name,
      displayName: entry.displayName,
      description: entry.description,
      category: entry.category,
      dependencies: entry.dependencies,
      npmDependencies: entry.npmDependencies,
      files: [
        {
          path: `${entry.name}.tsx`,
          content,
          checksum,
        },
      ],
    });
  }

  return output;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("Building component registry...\n");

mkdirSync(OUTPUT_DIR, { recursive: true });

// Step 1: Copy raw files for CLI fetch
const fileCount = copySourceFiles();
console.log(`Copied ${fileCount} source files to ${OUTPUT_DIR}/`);

// Step 2: Generate index.json
const registry = buildRegistry();
const outputPath = join(OUTPUT_DIR, "index.json");
writeFileSync(outputPath, JSON.stringify(registry, null, 2));

console.log(`Generated ${registry.components.length} component entries in index.json`);
console.log(`Size: ${(JSON.stringify(registry).length / 1024).toFixed(1)} KB`);
