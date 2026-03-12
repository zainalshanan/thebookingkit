/**
 * Embed configuration utilities for @thebookingkit/embed.
 *
 * Generates embed configuration, validates embed options,
 * and produces HTML snippets for copy-paste integration.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Embed display mode */
export type EmbedMode = "inline" | "popup" | "float";

/** Brand color configuration */
export interface EmbedBranding {
  /** Primary button/accent color (hex, e.g. "#6366f1") */
  primaryColor?: string;
  /** Background color (hex) */
  backgroundColor?: string;
  /** Text color (hex) */
  textColor?: string;
  /** Border radius in px */
  borderRadius?: number;
  /** Font family */
  fontFamily?: string;
}

/** Full embed configuration */
export interface EmbedConfig {
  /** Provider ID or slug */
  providerId: string;
  /** Event type slug */
  eventTypeSlug: string;
  /** Embed display mode */
  mode: EmbedMode;
  /** Container CSS selector (for inline mode) */
  container?: string;
  /** Base URL of the Booking Kit instance */
  baseUrl: string;
  /** Branding options */
  branding?: EmbedBranding;
  /** Locale for date/time formatting */
  locale?: string;
  /** Callback URL after successful booking */
  redirectUrl?: string;
}

/** Generated embed snippet */
export interface EmbedSnippet {
  /** The mode this snippet is for */
  mode: EmbedMode;
  /** The full HTML snippet */
  html: string;
  /** A description of this snippet */
  description: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Error thrown when embed config validation fails */
export class EmbedConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbedConfigError";
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate an embed configuration.
 *
 * @param config - The configuration to validate
 * @throws {EmbedConfigError} If the configuration is invalid
 */
export function validateEmbedConfig(config: EmbedConfig): void {
  if (!config.providerId || config.providerId.trim().length === 0) {
    throw new EmbedConfigError("providerId is required");
  }

  if (!config.eventTypeSlug || config.eventTypeSlug.trim().length === 0) {
    throw new EmbedConfigError("eventTypeSlug is required");
  }

  if (!["inline", "popup", "float"].includes(config.mode)) {
    throw new EmbedConfigError(
      `Invalid mode: "${config.mode}". Must be "inline", "popup", or "float"`,
    );
  }

  if (config.mode === "inline" && !config.container) {
    throw new EmbedConfigError(
      'container is required for inline mode (e.g., "#booking")',
    );
  }

  if (!config.baseUrl || config.baseUrl.trim().length === 0) {
    throw new EmbedConfigError("baseUrl is required");
  }

  try {
    new URL(config.baseUrl);
  } catch {
    throw new EmbedConfigError(`Invalid baseUrl: "${config.baseUrl}"`);
  }

  if (config.redirectUrl) {
    validateRedirectUrl(config.redirectUrl);
  }

  if (config.branding) {
    validateBranding(config.branding);
  }
}

function validateRedirectUrl(url: string): void {
  // Only allow http/https URLs — block javascript:, data:, etc.
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new EmbedConfigError(
        `Invalid redirectUrl protocol: "${parsed.protocol}". Only http: and https: are allowed`,
      );
    }
  } catch (err) {
    if (err instanceof EmbedConfigError) throw err;
    // Allow relative paths (e.g., "/thank-you")
    if (!url.startsWith("/")) {
      throw new EmbedConfigError(
        `Invalid redirectUrl: "${url}". Must be an absolute https:// URL or a relative path starting with /`,
      );
    }
  }
}

function validateBranding(branding: EmbedBranding): void {
  const hexRe = /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/;

  for (const key of ["primaryColor", "backgroundColor", "textColor"] as const) {
    const val = branding[key];
    if (val !== undefined && !hexRe.test(val)) {
      throw new EmbedConfigError(
        `Invalid color for ${key}: "${val}". Must be a hex color (e.g., "#6366f1")`,
      );
    }
  }

  if (
    branding.borderRadius !== undefined &&
    (branding.borderRadius < 0 || branding.borderRadius > 50)
  ) {
    throw new EmbedConfigError("borderRadius must be between 0 and 50");
  }
}

// ---------------------------------------------------------------------------
// Snippet Generation
// ---------------------------------------------------------------------------

/**
 * Generate an HTML embed snippet for the given configuration.
 *
 * @param config - The embed configuration
 * @returns The HTML snippet with appropriate data attributes
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function generateEmbedSnippet(config: EmbedConfig): string {
  const attrs: Record<string, string> = {
    src: `${config.baseUrl}/embed/thebookingkit-embed.js`,
    "data-provider": escapeHtml(config.providerId),
    "data-event-type": escapeHtml(config.eventTypeSlug),
    "data-mode": escapeHtml(config.mode),
  };

  if (config.container) {
    attrs["data-container"] = escapeHtml(config.container);
  }

  if (config.locale) {
    attrs["data-locale"] = escapeHtml(config.locale);
  }

  if (config.redirectUrl) {
    attrs["data-redirect-url"] = escapeHtml(config.redirectUrl);
  }

  if (config.branding) {
    const { primaryColor, backgroundColor, textColor, borderRadius, fontFamily } =
      config.branding;
    if (primaryColor) attrs["data-color-primary"] = escapeHtml(primaryColor);
    if (backgroundColor) attrs["data-color-background"] = escapeHtml(backgroundColor);
    if (textColor) attrs["data-color-text"] = escapeHtml(textColor);
    if (borderRadius !== undefined)
      attrs["data-border-radius"] = String(borderRadius);
    if (fontFamily) attrs["data-font-family"] = escapeHtml(fontFamily);
  }

  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `  ${k}="${v}"`)
    .join("\n");

  return `<script\n${attrStr}\n  async\n>`;
}

/**
 * Generate all three embed snippets (inline, popup, float) for a provider/event type.
 *
 * @param baseConfig - Config without the mode specified
 * @returns Array of snippets for all three modes
 */
export function generateAllSnippets(
  baseConfig: Omit<EmbedConfig, "mode" | "container">,
): EmbedSnippet[] {
  const modes: Array<{ mode: EmbedMode; description: string; container?: string }> =
    [
      {
        mode: "inline",
        description: "Renders the booking flow inside a specific page element.",
        container: "#booking-container",
      },
      {
        mode: "popup",
        description:
          "Opens the booking flow in a centered modal when a button is clicked.",
      },
      {
        mode: "float",
        description:
          "Shows a persistent floating button that opens a booking popup.",
      },
    ];

  return modes.map(({ mode, description, container }) => ({
    mode,
    description,
    html: generateEmbedSnippet({
      ...baseConfig,
      mode,
      container: mode === "inline" ? container : undefined,
    }),
  }));
}

// ---------------------------------------------------------------------------
// Embed URL Construction
// ---------------------------------------------------------------------------

/**
 * Construct the embed iframe URL for a given configuration.
 *
 * @param config - The embed configuration
 * @returns The full URL for the embed iframe
 */
export function buildEmbedUrl(config: EmbedConfig): string {
  const url = new URL(
    `/embed/${config.providerId}/${config.eventTypeSlug}`,
    config.baseUrl,
  );

  if (config.locale) url.searchParams.set("locale", config.locale);
  if (config.redirectUrl) url.searchParams.set("redirect", config.redirectUrl);

  if (config.branding?.primaryColor) {
    url.searchParams.set("color", config.branding.primaryColor.replace("#", ""));
  }

  return url.toString();
}
