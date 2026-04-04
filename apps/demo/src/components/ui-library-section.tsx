"use client";

import { useState } from "react";
import { BookingCalendarPreview } from "./registry-previews/booking-calendar-preview";
import { TimeSlotPreview } from "./registry-previews/time-slot-preview";
import { StatusBadgePreview } from "./registry-previews/status-badge-preview";
import { SeatsPickerPreview } from "./registry-previews/seats-picker-preview";
import { QueueDisplayPreview } from "./registry-previews/queue-display-preview";
import { AvailabilityEditorPreview } from "./registry-previews/availability-editor-preview";

interface ComponentEntry {
  name: string;
  description: string;
}

interface Category {
  label: string;
  components: ComponentEntry[];
}

const CATEGORIES: Category[] = [
  {
    label: "Booking Flow",
    components: [
      { name: "booking-calendar", description: "Date picker with availability state and timezone display" },
      { name: "slot-picker", description: "Time slot grid with morning/afternoon/evening grouping" },
      { name: "booking-form", description: "Multi-step form with validation and custom questions" },
      { name: "booking-confirm", description: "Confirmation summary with all booking details" },
      { name: "booking-success", description: "Success screen with booking ID and calendar add" },
    ],
  },
  {
    label: "Service Selection",
    components: [
      { name: "service-card", description: "Individual service card with price, duration, and description" },
      { name: "service-grid", description: "Responsive grid layout for service listings" },
      { name: "service-badge", description: "Small badge for seat count, custom questions, or status" },
    ],
  },
  {
    label: "Team & Providers",
    components: [
      { name: "provider-card", description: "Provider profile card with avatar and availability indicator" },
      { name: "provider-selector", description: "Dropdown or grid for multi-provider selection" },
      { name: "team-availability-grid", description: "Side-by-side availability view for all team members" },
    ],
  },
  {
    label: "Admin & Dashboard",
    components: [
      { name: "bookings-table", description: "Full admin table with status filters and action buttons" },
      { name: "booking-stats", description: "Stat cards for total, upcoming, pending, and resolved counts" },
      { name: "schedule-editor", description: "Drag-to-set weekly schedule with RRULE output" },
      { name: "override-calendar", description: "Calendar for adding availability overrides and blocked dates" },
    ],
  },
  {
    label: "Queue & Walk-In",
    components: [
      { name: "walk-in-queue", description: "Live queue display with position numbers and wait estimates" },
      { name: "check-in-kiosk", description: "Full-screen kiosk check-in flow for tablets" },
      { name: "wait-time-badge", description: "Compact badge showing estimated wait time" },
    ],
  },
  {
    label: "Utilities",
    components: [
      { name: "timezone-selector", description: "Searchable timezone dropdown with offset display" },
      { name: "status-badge", description: "Color-coded status badge for all booking states" },
      { name: "copy-snippet", description: "Syntax-highlighted code block with copy-to-clipboard button" },
      { name: "embed-generator", description: "UI for generating embed snippets with live preview" },
    ],
  },
];

const LIVE_PREVIEWS = [
  {
    name: "booking-calendar",
    label: "BookingCalendar",
    category: "Booking Flow",
    description: "Date picker with availability indicators and timezone display",
    component: BookingCalendarPreview,
  },
  {
    name: "time-slot-picker",
    label: "TimeSlotPicker",
    category: "Booking Flow",
    description: "Selectable time slots grouped by Morning, Afternoon, Evening",
    component: TimeSlotPreview,
  },
  {
    name: "booking-status-badge",
    label: "BookingStatusBadge",
    category: "Utilities",
    description: "All 7 booking states rendered as color-coded badges",
    component: StatusBadgePreview,
  },
  {
    name: "seats-picker",
    label: "SeatsPicker",
    category: "Events",
    description: "Seat capacity visualization with reservation button",
    component: SeatsPickerPreview,
  },
  {
    name: "queue-display",
    label: "QueueDisplay",
    category: "Queue & Walk-In",
    description: "Public-facing auto-refreshing queue with wait estimates",
    component: QueueDisplayPreview,
  },
  {
    name: "availability-editor",
    label: "AvailabilityEditor",
    category: "Admin",
    description: "Weekly schedule editor with day toggles and time ranges",
    component: AvailabilityEditorPreview,
  },
];

function ComponentCopyBtn({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  const command = `npx thebookingkit add ${name}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(command).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="component-install">
      <code>{command}</code>
      <button className="component-copy-btn" onClick={handleCopy} aria-label={`Copy install command for ${name}`}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function UILibrarySection() {
  return (
    <section className="section-shell" id="components">
      <div className="section-inner">
        <div className="section-header">
          <span className="section-eyebrow">UI Component Library</span>
          <h2 className="section-title-lg">31 Copy-Paste Components</h2>
          <p className="section-desc">
            React components built on shadcn/ui conventions. Add them to your project with the CLI.
            You own the source — customize freely.
          </p>
        </div>

        <div
          style={{
            background: "var(--surface-alt)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "1rem 1.25rem",
            marginBottom: "2rem",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.2rem" }}>
              Install any component
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Components are copied directly into your project — not imported from npm.
              They use shadcn/ui primitives and are fully TypeScript-typed.
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", background: "var(--brand)", color: "rgba(255,255,255,0.8)", padding: "0.55rem 1rem", borderRadius: "var(--radius-sm)", whiteSpace: "nowrap", flexShrink: 0 }}>
            npx thebookingkit add &lt;name&gt;
          </div>
        </div>

        {/* Live Component Previews */}
        <div style={{ marginBottom: "2.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", marginBottom: "1rem" }}>
            Live Previews
          </h3>
          <div
            className="live-preview"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {LIVE_PREVIEWS.map((preview) => (
              <div
                key={preview.name}
                className="component-preview"
                data-testid="component-preview"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", fontWeight: 600, color: "var(--accent)" }}>
                      {preview.label}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                      {preview.category}
                    </div>
                  </div>
                  <ComponentCopyBtn name={preview.name} />
                </div>
                <div style={{ padding: "1rem", minHeight: 120 }}>
                  <preview.component />
                </div>
                <div
                  style={{
                    padding: "0.5rem 1rem",
                    borderTop: "1px solid var(--border)",
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                  }}
                >
                  {preview.description}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Full Component Catalog */}
        <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", marginBottom: "1rem" }}>
          Full Component Catalog
        </h3>
        <div className="components-grid">
          {CATEGORIES.map((cat) => (
            <div key={cat.label} className="component-category">
              <div className="component-category-label">{cat.label}</div>
              <div className="component-list">
                {cat.components.map((comp) => (
                  <div key={comp.name} className="component-item">
                    <div className="component-item-name">{comp.name}</div>
                    <div className="component-item-desc">{comp.description}</div>
                    <ComponentCopyBtn name={comp.name} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
