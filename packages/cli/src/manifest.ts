/**
 * Manifest management for tracking installed SlotKit components.
 *
 * The manifest file (.slotkit-manifest.json) tracks which components
 * have been installed, their versions, and checksums for detecting
 * local modifications.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single entry in the component manifest */
export interface ManifestEntry {
  /** Component name */
  name: string;
  /** Version of @slotkit/cli when this component was added */
  version: string;
  /** File path where the component was installed */
  installedPath: string;
  /** SHA-256 hash of the component at install time */
  checksum: string;
  /** Date of installation */
  installedAt: string;
}

/** The .slotkit-manifest.json file structure */
export interface SlotKitManifest {
  version: string;
  components: Record<string, ManifestEntry>;
}

/** Default manifest structure */
export const DEFAULT_MANIFEST: SlotKitManifest = {
  version: "1.0",
  components: {},
};

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Create a new manifest entry for an installed component.
 *
 * @param name - Component name
 * @param version - Package version
 * @param installedPath - File path
 * @param checksum - SHA-256 hash of file content
 * @returns Manifest entry
 */
export function createManifestEntry(
  name: string,
  version: string,
  installedPath: string,
  checksum: string,
): ManifestEntry {
  return {
    name,
    version,
    installedPath,
    checksum,
    installedAt: new Date().toISOString(),
  };
}

/**
 * Check if a component has local modifications based on its manifest entry.
 *
 * @param entry - The manifest entry
 * @param currentChecksum - Current file checksum
 * @returns Whether the file has been locally modified
 */
export function hasLocalModifications(
  entry: ManifestEntry,
  currentChecksum: string,
): boolean {
  return entry.checksum !== currentChecksum;
}
