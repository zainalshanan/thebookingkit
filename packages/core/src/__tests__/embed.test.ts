import { describe, it, expect } from "vitest";
import {
  validateEmbedConfig,
  generateEmbedSnippet,
  generateAllSnippets,
  buildEmbedUrl,
  EmbedConfigError,
  type EmbedConfig,
} from "../embed.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<EmbedConfig>): EmbedConfig {
  return {
    providerId: "my-provider",
    eventTypeSlug: "consultation",
    mode: "inline",
    container: "#booking",
    baseUrl: "https://booking.example.com",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateEmbedConfig
// ---------------------------------------------------------------------------

describe("validateEmbedConfig", () => {
  it("accepts a valid inline config", () => {
    expect(() => validateEmbedConfig(makeConfig())).not.toThrow();
  });

  it("accepts popup mode without container", () => {
    expect(() =>
      validateEmbedConfig(makeConfig({ mode: "popup", container: undefined })),
    ).not.toThrow();
  });

  it("accepts float mode", () => {
    expect(() =>
      validateEmbedConfig(makeConfig({ mode: "float", container: undefined })),
    ).not.toThrow();
  });

  it("rejects empty providerId", () => {
    expect(() =>
      validateEmbedConfig(makeConfig({ providerId: "" })),
    ).toThrow(EmbedConfigError);
    expect(() =>
      validateEmbedConfig(makeConfig({ providerId: "" })),
    ).toThrow("providerId is required");
  });

  it("rejects empty eventTypeSlug", () => {
    expect(() =>
      validateEmbedConfig(makeConfig({ eventTypeSlug: "" })),
    ).toThrow("eventTypeSlug is required");
  });

  it("rejects invalid mode", () => {
    expect(() =>
      validateEmbedConfig(makeConfig({ mode: "fullscreen" as never })),
    ).toThrow('Invalid mode: "fullscreen"');
  });

  it("rejects inline mode without container", () => {
    expect(() =>
      validateEmbedConfig(
        makeConfig({ mode: "inline", container: undefined }),
      ),
    ).toThrow("container is required for inline mode");
  });

  it("rejects empty baseUrl", () => {
    expect(() =>
      validateEmbedConfig(makeConfig({ baseUrl: "" })),
    ).toThrow("baseUrl is required");
  });

  it("rejects invalid baseUrl", () => {
    expect(() =>
      validateEmbedConfig(makeConfig({ baseUrl: "not-a-url" })),
    ).toThrow("Invalid baseUrl");
  });

  it("rejects invalid hex color in branding", () => {
    expect(() =>
      validateEmbedConfig(
        makeConfig({
          branding: { primaryColor: "red" },
        }),
      ),
    ).toThrow("Invalid color for primaryColor");
  });

  it("accepts valid hex color", () => {
    expect(() =>
      validateEmbedConfig(
        makeConfig({
          branding: { primaryColor: "#6366f1" },
        }),
      ),
    ).not.toThrow();
  });

  it("accepts 3-digit hex color", () => {
    expect(() =>
      validateEmbedConfig(
        makeConfig({
          branding: { primaryColor: "#fff" },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects invalid borderRadius", () => {
    expect(() =>
      validateEmbedConfig(
        makeConfig({ branding: { borderRadius: 100 } }),
      ),
    ).toThrow("borderRadius must be between 0 and 50");
  });

  it("accepts borderRadius = 0", () => {
    expect(() =>
      validateEmbedConfig(makeConfig({ branding: { borderRadius: 0 } })),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// generateEmbedSnippet
// ---------------------------------------------------------------------------

describe("generateEmbedSnippet", () => {
  it("generates inline snippet with container", () => {
    const snippet = generateEmbedSnippet(makeConfig());
    expect(snippet).toContain('data-mode="inline"');
    expect(snippet).toContain('data-container="#booking"');
    expect(snippet).toContain('data-provider="my-provider"');
    expect(snippet).toContain('data-event-type="consultation"');
    expect(snippet).toContain("slotkit-embed.js");
    expect(snippet).toContain("async");
  });

  it("generates popup snippet", () => {
    const snippet = generateEmbedSnippet(
      makeConfig({ mode: "popup", container: undefined }),
    );
    expect(snippet).toContain('data-mode="popup"');
    expect(snippet).not.toContain("data-container");
  });

  it("generates float snippet", () => {
    const snippet = generateEmbedSnippet(
      makeConfig({ mode: "float", container: undefined }),
    );
    expect(snippet).toContain('data-mode="float"');
  });

  it("includes branding attributes when provided", () => {
    const snippet = generateEmbedSnippet(
      makeConfig({
        branding: {
          primaryColor: "#6366f1",
          backgroundColor: "#ffffff",
          borderRadius: 8,
        },
      }),
    );
    expect(snippet).toContain('data-color-primary="#6366f1"');
    expect(snippet).toContain('data-color-background="#ffffff"');
    expect(snippet).toContain('data-border-radius="8"');
  });

  it("includes locale when provided", () => {
    const snippet = generateEmbedSnippet(makeConfig({ locale: "fr-FR" }));
    expect(snippet).toContain('data-locale="fr-FR"');
  });

  it("includes redirect URL when provided", () => {
    const snippet = generateEmbedSnippet(
      makeConfig({ redirectUrl: "https://example.com/thanks" }),
    );
    expect(snippet).toContain(
      'data-redirect-url="https://example.com/thanks"',
    );
  });
});

// ---------------------------------------------------------------------------
// generateAllSnippets
// ---------------------------------------------------------------------------

describe("generateAllSnippets", () => {
  it("returns snippets for all three modes", () => {
    const snippets = generateAllSnippets({
      providerId: "my-provider",
      eventTypeSlug: "consultation",
      baseUrl: "https://booking.example.com",
    });

    expect(snippets).toHaveLength(3);
    const modes = snippets.map((s) => s.mode);
    expect(modes).toContain("inline");
    expect(modes).toContain("popup");
    expect(modes).toContain("float");
  });

  it("each snippet has a description", () => {
    const snippets = generateAllSnippets({
      providerId: "my-provider",
      eventTypeSlug: "consultation",
      baseUrl: "https://booking.example.com",
    });

    for (const snippet of snippets) {
      expect(snippet.description).toBeTruthy();
    }
  });

  it("inline snippet includes default container", () => {
    const snippets = generateAllSnippets({
      providerId: "my-provider",
      eventTypeSlug: "consultation",
      baseUrl: "https://booking.example.com",
    });

    const inline = snippets.find((s) => s.mode === "inline");
    expect(inline?.html).toContain("data-container");
  });
});

// ---------------------------------------------------------------------------
// buildEmbedUrl
// ---------------------------------------------------------------------------

describe("buildEmbedUrl", () => {
  it("builds correct embed URL", () => {
    const url = buildEmbedUrl(makeConfig());
    expect(url).toBe(
      "https://booking.example.com/embed/my-provider/consultation",
    );
  });

  it("includes locale in query string", () => {
    const url = buildEmbedUrl(makeConfig({ locale: "de-DE" }));
    expect(url).toContain("locale=de-DE");
  });

  it("includes redirect URL in query string", () => {
    const url = buildEmbedUrl(
      makeConfig({ redirectUrl: "https://example.com/done" }),
    );
    expect(url).toContain("redirect=");
  });

  it("includes primary color without # in query string", () => {
    const url = buildEmbedUrl(
      makeConfig({ branding: { primaryColor: "#6366f1" } }),
    );
    expect(url).toContain("color=6366f1");
  });
});
