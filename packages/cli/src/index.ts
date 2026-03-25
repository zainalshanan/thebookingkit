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
  getDefaultManifest,
  type ManifestEntry,
  type BookingKitManifest,
  type SlotKitManifest,
} from "./manifest.js";

// Config
export {
  generateThebookingkitConfig,
  generateEnvTemplate,
  type BookingKitConfig,
  type SlotKitConfig,
} from "./config.js";

// Migrations
export {
  parseMigrationFiles,
  getPendingMigrations,
  type MigrationFile,
} from "./migrations.js";
