/**
 * Manifest management for tracking installed Booking Kit components.
 *
 * The manifest file (.thebookingkit-manifest.json) tracks which components
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
  /** Version of @thebookingkit/cli when this component was added */
  version: string;
  /** File path where the component was installed */
  installedPath: string;
  /** SHA-256 hash of the component at install time */
  checksum: string;
  /** Date of installation */
  installedAt: string;
}

/** The .thebookingkit-manifest.json file structure */
export interface BookingKitManifest {
  version: string;
  components: Record<string, ManifestEntry>;
}

/** @deprecated Use BookingKitManifest instead */
export type SlotKitManifest = BookingKitManifest;

/** Default manifest structure — kept for reference/testing; do not mutate directly. */
export const DEFAULT_MANIFEST: Readonly<BookingKitManifest> = Object.freeze({
  version: "1.0",
  components: {},
});

/**
 * Return a fresh default manifest object each time.
 * Use this instead of `DEFAULT_MANIFEST` to avoid shared-state mutation bugs.
 *
 * @returns A new default BookingKitManifest
 */
export function getDefaultManifest(): BookingKitManifest {
  return { version: "1.0", components: {} };
}

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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Result type from `validateManifest` */
export type ManifestValidationResult =
  | { valid: true; manifest: BookingKitManifest }
  | { valid: false; error: string };

/**
 * Validate that an unknown value conforms to the `BookingKitManifest` schema.
 * The manifest must have a `version` string and a `components` object.
 *
 * @param raw - The parsed JSON value from disk
 * @returns A discriminated union indicating validity and the typed manifest (or an error)
 */
export function validateManifest(raw: unknown): ManifestValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { valid: false, error: "manifest must be a JSON object" };
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj["version"] !== "string" || obj["version"].trim() === "") {
    return { valid: false, error: 'missing or invalid "version" string' };
  }

  if (
    typeof obj["components"] !== "object" ||
    obj["components"] === null ||
    Array.isArray(obj["components"])
  ) {
    return { valid: false, error: 'missing or invalid "components" object' };
  }

  // Validate individual entries (non-fatal coercion: skip malformed ones with a warning).
  const components: Record<string, ManifestEntry> = {};
  for (const [key, val] of Object.entries(obj["components"] as Record<string, unknown>)) {
    if (
      typeof val === "object" &&
      val !== null &&
      !Array.isArray(val) &&
      typeof (val as Record<string, unknown>)["name"] === "string" &&
      typeof (val as Record<string, unknown>)["version"] === "string" &&
      typeof (val as Record<string, unknown>)["installedPath"] === "string" &&
      typeof (val as Record<string, unknown>)["checksum"] === "string" &&
      typeof (val as Record<string, unknown>)["installedAt"] === "string"
    ) {
      components[key] = val as ManifestEntry;
    }
    // Silently skip malformed entries — the manifest is still usable.
  }

  return {
    valid: true,
    manifest: { version: obj["version"] as string, components },
  };
}
