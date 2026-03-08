#!/usr/bin/env npx tsx

/**
 * Registry Generator
 *
 * Reads registry/ui component source files and generates a registry.json
 * that maps each component to its metadata and inline source code.
 *
 * Output: apps/docs/public/registry/index.json
 *
 * Usage:
 *   npx tsx scripts/build-registry.ts
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Import the registry from the CLI package source
// (we read it directly since this is a build script)
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
  // We parse the registry.ts file to extract the data
  // For robustness, we import the built version if available,
  // otherwise we read from source
  const registryPath = resolve("packages/cli/src/registry.ts");
  const content = readFileSync(registryPath, "utf-8");

  // Extract the array between COMPONENT_REGISTRY: ComponentRegistryEntry[] = [ ... ];
  const match = content.match(
    /export const COMPONENT_REGISTRY[^=]*=\s*\[([\s\S]*?)\];/,
  );
  if (!match) {
    throw new Error("Could not parse COMPONENT_REGISTRY from registry.ts");
  }

  // Use Function constructor to evaluate the array literal
  // (safe here since we control the source)
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

const registry = buildRegistry();

if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

const outputPath = join(OUTPUT_DIR, "index.json");
writeFileSync(outputPath, JSON.stringify(registry, null, 2));

console.log(`Generated ${registry.components.length} component entries`);
console.log(`Output: ${outputPath}`);
console.log(`Size: ${(JSON.stringify(registry).length / 1024).toFixed(1)} KB`);
