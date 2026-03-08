import React, { useState, useMemo, useCallback } from "react";
import { cn } from "../utils/cn.js";

/** Embed mode option */
export type EmbedModeOption = "inline" | "popup" | "float";

/** Event type option for the configurator */
export interface EmbedEventTypeOption {
  slug: string;
  title: string;
}

/** Props for the EmbedConfigurator component */
export interface EmbedConfiguratorProps {
  /** Available event types to embed */
  eventTypes: EmbedEventTypeOption[];
  /** Provider ID */
  providerId: string;
  /** Base URL of the SlotKit instance */
  baseUrl: string;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Admin component for generating embed code snippets.
 *
 * Lets the admin configure embed mode, event type, and brand colors,
 * then generates ready-to-paste HTML snippets for all three modes.
 *
 * @example
 * ```tsx
 * <EmbedConfigurator
 *   eventTypes={eventTypes}
 *   providerId="my-provider"
 *   baseUrl="https://booking.example.com"
 * />
 * ```
 */
export function EmbedConfigurator({
  eventTypes,
  providerId,
  baseUrl,
  className,
  style,
}: EmbedConfiguratorProps) {
  const [selectedSlug, setSelectedSlug] = useState(
    eventTypes[0]?.slug ?? "",
  );
  const [mode, setMode] = useState<EmbedModeOption>("inline");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [copied, setCopied] = useState<string | null>(null);

  const snippets = useMemo(() => {
    if (!selectedSlug) return { inline: "", popup: "", float: "" };

    const baseAttrs = [
      `src="${baseUrl}/embed/slotkit-embed.js"`,
      `data-provider="${providerId}"`,
      `data-event-type="${selectedSlug}"`,
      `data-color-primary="${primaryColor}"`,
    ];

    return {
      inline: `<div id="slotkit-booking"></div>\n<script\n  ${[...baseAttrs, 'data-mode="inline"', 'data-container="#slotkit-booking"'].join("\n  ")}\n  async\n></script>`,
      popup: `<script\n  ${[...baseAttrs, 'data-mode="popup"'].join("\n  ")}\n  async\n></script>`,
      float: `<script\n  ${[...baseAttrs, 'data-mode="float"'].join("\n  ")}\n  async\n></script>`,
    };
  }, [selectedSlug, providerId, baseUrl, primaryColor]);

  const handleCopy = useCallback(
    async (text: string, key: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
      } catch {
        // Clipboard API not available
      }
    },
    [],
  );

  return (
    <div
      className={cn("slotkit-embed-configurator", className)}
      style={style}
    >
      <h3>Embed Booking Flow</h3>

      {/* Configuration */}
      <div className="slotkit-embed-config">
        <div className="slotkit-field">
          <label htmlFor="embed-event-type" className="slotkit-label">
            Event Type
          </label>
          <select
            id="embed-event-type"
            className="slotkit-select"
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
          >
            {eventTypes.map((et) => (
              <option key={et.slug} value={et.slug}>
                {et.title}
              </option>
            ))}
          </select>
        </div>

        <div className="slotkit-field">
          <label htmlFor="embed-color" className="slotkit-label">
            Primary Color
          </label>
          <div className="slotkit-color-input">
            <input
              id="embed-color"
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
            />
            <input
              type="text"
              className="slotkit-input"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              pattern="^#[0-9A-Fa-f]{6}$"
            />
          </div>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="slotkit-embed-tabs">
        {(["inline", "popup", "float"] as EmbedModeOption[]).map((m) => (
          <button
            key={m}
            className={cn(
              "slotkit-embed-tab",
              mode === m && "slotkit-embed-tab-active",
            )}
            onClick={() => setMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Mode description */}
      <p className="slotkit-embed-description">
        {mode === "inline" &&
          "Renders the booking calendar directly inside your page."}
        {mode === "popup" &&
          "Opens the booking flow in a centered modal overlay when triggered."}
        {mode === "float" &&
          "Adds a persistent floating button to open the booking flow."}
      </p>

      {/* Snippet */}
      <div className="slotkit-embed-snippet-wrapper">
        <pre className="slotkit-embed-snippet">
          <code>{snippets[mode]}</code>
        </pre>
        <button
          className="slotkit-button-secondary slotkit-copy-btn"
          onClick={() => handleCopy(snippets[mode], mode)}
        >
          {copied === mode ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* All snippets at a glance */}
      <details className="slotkit-embed-all-snippets">
        <summary>All modes</summary>
        {(["inline", "popup", "float"] as EmbedModeOption[]).map((m) => (
          <div key={m} className="slotkit-embed-snippet-block">
            <div className="slotkit-embed-snippet-header">
              <strong>{m}</strong>
              <button
                className="slotkit-button-secondary"
                onClick={() => handleCopy(snippets[m], m)}
              >
                {copied === m ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="slotkit-embed-snippet">
              <code>{snippets[m]}</code>
            </pre>
          </div>
        ))}
      </details>
    </div>
  );
}
