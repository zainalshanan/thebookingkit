/**
 * Migration utilities for managing database schema migrations.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A migration file entry */
export interface MigrationFile {
  /** Migration filename */
  filename: string;
  /** Version number (from filename prefix) */
  version: number;
  /** Migration content */
  content?: string;
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Parse a list of migration filenames and return them sorted by version.
 *
 * @param filenames - Array of migration filenames
 * @returns Sorted migration entries
 */
export function parseMigrationFiles(filenames: string[]): MigrationFile[] {
  return filenames
    .map((filename) => {
      const match = filename.match(/^(\d+)_/);
      if (!match) {
        console.warn(
          `Migration file "${filename}" does not match the expected "^(\\d+)_" pattern — assigning version 0.`,
        );
      }
      const version = match ? parseInt(match[1], 10) : 0;
      return { filename, version };
    })
    .sort((a, b) => a.version - b.version);
}

/**
 * Determine which migrations are pending (not yet applied).
 *
 * @param allMigrations - All available migration files
 * @param appliedVersions - Versions already applied to the database
 * @returns Pending migrations in order
 */
export function getPendingMigrations(
  allMigrations: MigrationFile[],
  appliedVersions: number[],
): MigrationFile[] {
  const applied = new Set(appliedVersions);
  return allMigrations.filter((m) => !applied.has(m.version));
}
