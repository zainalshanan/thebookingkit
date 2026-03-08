"use client";

import { useState, useEffect } from "react";
import type { Slot } from "@slotkit/core";
import {
  fetchSlotsComparison,
  fetchBufferComparison,
  fetchTimezoneComparison,
  fetchOverrideDemo,
  fetchEmbedSnippets,
} from "@/lib/actions";

function getNextWeekday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split("T")[0];
}

export function FeatureShowcase() {
  const [activeDemo, setActiveDemo] = useState("durations");

  const demos = [
    { id: "durations", label: "Slot Durations", icon: "\u23F1" },
    { id: "buffers", label: "Buffer Time", icon: "\u{1F6E1}\uFE0F" },
    { id: "overrides", label: "Overrides", icon: "\u{1F4C5}" },
    { id: "timezones", label: "Timezones", icon: "\u{1F30D}" },
    { id: "embed", label: "Embed Code", icon: "\u{1F4CB}" },
  ];

  return (
    <div>
      <p className="showcase-intro">
        Interactive demos showing how <code>@slotkit/core</code> handles different scheduling scenarios.
        All computations run server-side using the same pure functions your app would use.
      </p>

      <div className="demo-tabs">
        {demos.map((d) => (
          <button
            key={d.id}
            className={`demo-tab ${activeDemo === d.id ? "active" : ""}`}
            onClick={() => setActiveDemo(d.id)}
          >
            <span className="demo-tab-icon">{d.icon}</span>
            {d.label}
          </button>
        ))}
      </div>

      <div className="demo-panel">
        {activeDemo === "durations" && <DurationsDemo />}
        {activeDemo === "buffers" && <BufferDemo />}
        {activeDemo === "overrides" && <OverrideDemo />}
        {activeDemo === "timezones" && <TimezoneDemo />}
        {activeDemo === "embed" && <EmbedDemo />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Durations Demo
// ---------------------------------------------------------------------------

function DurationsDemo() {
  const [data, setData] = useState<{ duration: number; slots: Slot[]; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const demoDate = getNextWeekday();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    fetchSlotsComparison(demoDate, [15, 30, 60, 90], tz).then((r) => {
      setData(r);
      setLoading(false);
    });
  }, [demoDate, tz]);

  if (loading) return <p className="loading-slots">Computing slots...</p>;

  return (
    <div>
      <div className="demo-description">
        <h3>Slot Duration Comparison</h3>
        <p>
          Same business day ({demoDate}), same availability rules (9 AM - 7 PM),
          but different slot durations. The engine computes how many appointments
          fit based on the duration. <code>getAvailableSlots()</code> handles this automatically.
        </p>
      </div>

      <div className="comparison-grid">
        {data.map((d) => (
          <div key={d.duration} className="comparison-card">
            <div className="comparison-header">
              <span className="comparison-duration">{d.duration} min</span>
              <span className="comparison-count">{d.count} slots</span>
            </div>
            <div className="comparison-slots">
              {d.slots.slice(0, 8).map((slot) => (
                <span key={slot.startTime} className="mini-slot">
                  {formatTime(slot.localStart)}
                </span>
              ))}
              {d.slots.length > 8 && (
                <span className="mini-slot more">+{d.slots.length - 8} more</span>
              )}
            </div>
            <div className="comparison-code">
              <code>{`getAvailableSlots(rules, [], [], range, tz, { duration: ${d.duration} })`}</code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buffer Demo
// ---------------------------------------------------------------------------

function BufferDemo() {
  const [data, setData] = useState<{
    noBuffer: { slots: Slot[]; count: number };
    withBuffer: { slots: Slot[]; count: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const demoDate = getNextWeekday();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    fetchBufferComparison(demoDate, tz).then((r) => {
      setData(r);
      setLoading(false);
    });
  }, [demoDate, tz]);

  if (loading || !data) return <p className="loading-slots">Computing...</p>;

  const removed = data.noBuffer.count - data.withBuffer.count;

  return (
    <div>
      <div className="demo-description">
        <h3>Buffer Time Effect</h3>
        <p>
          Buffer time prevents back-to-back bookings. With existing bookings on {demoDate},
          adding a 15-minute buffer before and after each booking removes {removed} additional
          slot{removed !== 1 ? "s" : ""} from availability.
        </p>
      </div>

      <div className="buffer-comparison">
        <div className="buffer-card">
          <h4>No Buffer</h4>
          <div className="buffer-stat">{data.noBuffer.count} slots</div>
          <code className="buffer-code">bufferBefore: 0, bufferAfter: 0</code>
          <div className="buffer-slots">
            {data.noBuffer.slots.slice(0, 12).map((s) => (
              <span key={s.startTime} className="mini-slot">{formatTime(s.localStart)}</span>
            ))}
            {data.noBuffer.slots.length > 12 && (
              <span className="mini-slot more">+{data.noBuffer.slots.length - 12}</span>
            )}
          </div>
        </div>

        <div className="buffer-arrow">
          <span>+15 min buffer</span>
          <span className="arrow">&rarr;</span>
          <span className="removed">-{removed} slots</span>
        </div>

        <div className="buffer-card">
          <h4>15 min Buffer</h4>
          <div className="buffer-stat">{data.withBuffer.count} slots</div>
          <code className="buffer-code">bufferBefore: 15, bufferAfter: 15</code>
          <div className="buffer-slots">
            {data.withBuffer.slots.slice(0, 12).map((s) => (
              <span key={s.startTime} className="mini-slot">{formatTime(s.localStart)}</span>
            ))}
            {data.withBuffer.slots.length > 12 && (
              <span className="mini-slot more">+{data.withBuffer.slots.length - 12}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Override Demo
// ---------------------------------------------------------------------------

function OverrideDemo() {
  const [data, setData] = useState<{
    normal: { slots: Slot[]; count: number };
    blocked: { slots: Slot[]; count: number };
    custom: { slots: Slot[]; count: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const demoDate = getNextWeekday();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    fetchOverrideDemo(demoDate, tz).then((r) => {
      setData(r);
      setLoading(false);
    });
  }, [demoDate, tz]);

  if (loading || !data) return <p className="loading-slots">Computing...</p>;

  return (
    <div>
      <div className="demo-description">
        <h3>Availability Overrides</h3>
        <p>
          Overrides let providers customize availability on specific dates.
          Three scenarios for {demoDate}:
        </p>
      </div>

      <div className="override-cards">
        <div className="override-card">
          <div className="override-header normal">
            <h4>Normal Day</h4>
            <span className="override-badge">{data.normal.count} slots</span>
          </div>
          <p className="override-desc">Regular business hours (9 AM - 7 PM)</p>
          <code className="override-code">overrides: []</code>
          <div className="override-slots">
            {data.normal.slots.slice(0, 6).map((s) => (
              <span key={s.startTime} className="mini-slot">{formatTime(s.localStart)}</span>
            ))}
            <span className="mini-slot more">...</span>
          </div>
        </div>

        <div className="override-card">
          <div className="override-header blocked">
            <h4>Blocked Day</h4>
            <span className="override-badge danger">{data.blocked.count} slots</span>
          </div>
          <p className="override-desc">Provider marked the entire day as unavailable</p>
          <code className="override-code">{`{ date, isUnavailable: true }`}</code>
          <div className="override-empty">No slots available</div>
        </div>

        <div className="override-card">
          <div className="override-header custom">
            <h4>Custom Hours</h4>
            <span className="override-badge">{data.custom.count} slots</span>
          </div>
          <p className="override-desc">Override replaces hours with 12 PM - 3 PM</p>
          <code className="override-code">{`{ date, startTime: "12:00", endTime: "15:00" }`}</code>
          <div className="override-slots">
            {data.custom.slots.map((s) => (
              <span key={s.startTime} className="mini-slot">{formatTime(s.localStart)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timezone Demo
// ---------------------------------------------------------------------------

function TimezoneDemo() {
  const [data, setData] = useState<{ timezone: string; slots: Slot[]; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const demoDate = getNextWeekday();

  const timezones = [
    "America/New_York",
    "America/Los_Angeles",
    "Europe/London",
    "Asia/Tokyo",
  ];

  useEffect(() => {
    fetchTimezoneComparison(demoDate, timezones).then((r) => {
      setData(r);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoDate]);

  if (loading) return <p className="loading-slots">Computing...</p>;

  return (
    <div>
      <div className="demo-description">
        <h3>Timezone-Aware Display</h3>
        <p>
          The provider works in <strong>America/New_York</strong> (9 AM - 7 PM ET).
          Slots are computed once but displayed in each customer&apos;s local timezone.
          Same availability, different local times.
        </p>
      </div>

      <div className="tz-grid">
        {data.map((d) => {
          const short = d.timezone.split("/")[1]?.replace(/_/g, " ") ?? d.timezone;
          const first = d.slots[0];
          const last = d.slots[d.slots.length - 1];
          return (
            <div key={d.timezone} className="tz-card">
              <h4>{short}</h4>
              <code className="tz-code">{d.timezone}</code>
              <div className="tz-stat">{d.count} slots</div>
              <div className="tz-range">
                {first && last
                  ? `${formatTime(first.localStart)} \u2013 ${formatTime(last.localStart)}`
                  : "No slots"}
              </div>
              <div className="tz-slots">
                {d.slots.slice(0, 6).map((s) => (
                  <span key={s.startTime} className="mini-slot">{formatTime(s.localStart)}</span>
                ))}
                {d.count > 6 && <span className="mini-slot more">+{d.count - 6}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Embed Demo
// ---------------------------------------------------------------------------

function EmbedDemo() {
  const [snippets, setSnippets] = useState<{ mode: string; description: string; html: string }[]>(
    [],
  );
  const [activeMode, setActiveMode] = useState("inline");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchEmbedSnippets().then(setSnippets);
  }, []);

  const active = snippets.find((s) => s.mode === activeMode);

  const handleCopy = () => {
    if (active) {
      navigator.clipboard.writeText(active.html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <div className="demo-description">
        <h3>Embed Code Generator</h3>
        <p>
          <code>generateAllSnippets()</code> produces copy-paste HTML snippets for embedding
          your booking widget on any website. Three modes available:
        </p>
      </div>

      <div className="embed-tabs">
        {snippets.map((s) => (
          <button
            key={s.mode}
            className={`embed-tab ${activeMode === s.mode ? "active" : ""}`}
            onClick={() => setActiveMode(s.mode)}
          >
            {s.mode.charAt(0).toUpperCase() + s.mode.slice(1)}
          </button>
        ))}
      </div>

      {active && (
        <div className="embed-content">
          <p className="embed-desc">{active.description}</p>
          <div className="embed-snippet-wrap">
            <pre className="embed-snippet">{active.html}</pre>
            <button className="embed-copy" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <div className="embed-api-note">
        <h4>API Reference</h4>
        <code className="embed-api-code">{`import { generateAllSnippets, validateEmbedConfig, buildEmbedUrl } from "@slotkit/core";

const snippets = generateAllSnippets({
  providerId: "fade-and-shave",
  eventTypeSlug: "haircut",
  baseUrl: "https://booking.fadeandshave.com",
  branding: { primaryColor: "#e94560" },
});`}</code>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(localStart: string): string {
  const timePart = localStart.split("T")[1];
  if (!timePart) return localStart;
  const [h, m] = timePart.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
