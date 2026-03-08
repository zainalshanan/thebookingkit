// Registry
export {
  COMPONENT_REGISTRY,
  findComponent,
  resolveComponentDependencies,
  listComponents,
  type ComponentRegistryEntry,
} from "./registry.js";

// Manifest
export {
  createManifestEntry,
  hasLocalModifications,
  DEFAULT_MANIFEST,
  type ManifestEntry,
  type SlotKitManifest,
} from "./manifest.js";

// Config
export {
  generateThebookingkitConfig,
  generateEnvTemplate,
  type SlotKitConfig,
} from "./config.js";

// Migrations
export {
  parseMigrationFiles,
  getPendingMigrations,
  type MigrationFile,
} from "./migrations.js";
