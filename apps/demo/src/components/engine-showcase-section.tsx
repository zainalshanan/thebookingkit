"use client";

import { useState, useEffect } from "react";
import type { Slot } from "@thebookingkit/core";
import {
  fetchSlotsComparison,
  fetchBufferComparison,
  fetchTimezoneComparison,
  fetchOverrideDemo,
  fetchEmbedSnippets,
  fetchBookingLimitsDemo,
  fetchConfirmationModeDemo,
} from "@/lib/actions";

function getNextWeekday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split("T")[0] as string;
}

function formatTime(localStart: string): string {
  const timePart = localStart.split("T")[1];
  if (!timePart) return localStart;
  const [h, m] = timePart.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function EngineShowcaseSection() {
  const [activeDemo, setActiveDemo] = useState("durations");

  const demos = [
    { id: "durations", label: "Slot Durations" },
    { id: "buffers", label: "Buffer Time" },
    { id: "overrides", label: "Overrides" },
    { id: "timezones", label: "Timezones" },
    { id: "embed", label: "Embed Code" },
    { id: "limits", label: "Booking Limits" },
    { id: "confirmation", label: "Confirmation Mode" },
  ];

  return (
    <section className="section-shell alt" id="engine">
      <div className="section-inner">
        <div className="section-header">
          <span className="section-eyebrow">Core Engine</span>
          <h2 className="section-title-lg">Scheduling Primitives</h2>
          <p className="section-desc">
            Interactive demonstrations of the scheduling engine. Every computation runs
            server-side using the same pure functions you would use in your app.
          </p>
        </div>

        <div className="demo-tabs">
          {demos.map((d) => (
            <button
              key={d.id}
              className={`demo-tab ${activeDemo === d.id ? "active" : ""}`}
              onClick={() => setActiveDemo(d.id)}
            >
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
          {activeDemo === "limits" && <BookingLimitsDemo />}
          {activeDemo === "confirmation" && <ConfirmationModeDemo />}
        </div>
      </div>
    </section>
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
          Same business day ({demoDate}), same availability rules (9 AM &ndash; 7 PM), but different
          slot durations. <code>getAvailableSlots()</code> computes the correct number of
          appointments for each duration automatically.
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
          adding a 15-minute buffer before and after each booking removes{" "}
          <strong>{removed}</strong> additional slot{removed !== 1 ? "s" : ""} from availability.
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
          Overrides let providers customize availability on specific dates without
          changing their base schedule. Three scenarios for {demoDate}:
        </p>
      </div>

      <div className="override-cards">
        <div className="override-card">
          <div className="override-header normal">
            <h4>Normal Day</h4>
            <span className="override-badge">{data.normal.count} slots</span>
          </div>
          <p className="override-desc">Regular business hours (9 AM &ndash; 7 PM)</p>
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
          <p className="override-desc">Override replaces hours with 12 PM &ndash; 3 PM</p>
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
          The provider works in <strong>America/New_York</strong> (9 AM &ndash; 7 PM ET).
          Slots are computed once but displayed in each customer&apos;s local timezone.
          Same underlying availability, different local times.
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
  const [snippets, setSnippets] = useState<{ mode: string; description: string; html: string }[]>([]);
  const [activeMode, setActiveMode] = useState("inline");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchEmbedSnippets().then(setSnippets);
  }, []);

  const active = snippets.find((s) => s.mode === activeMode);

  const handleCopy = () => {
    if (active) {
      navigator.clipboard.writeText(active.html).catch(() => {});
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
        <code className="embed-api-code">{`import { generateAllSnippets, validateEmbedConfig, buildEmbedUrl } from "@thebookingkit/core";

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
// Booking Limits Demo
// ---------------------------------------------------------------------------

function BookingLimitsDemo() {
  const [maxPerDay, setMaxPerDay] = useState(4);
  const [maxPerWeek, setMaxPerWeek] = useState(20);
  const [minNotice, setMinNotice] = useState(60);
  const [data, setData] = useState<{
    status: { canBook: boolean; dailyCount: number; dailyLimit: number | null; weeklyCount: number; weeklyLimit: number | null; dailyRemaining: number | null; weeklyRemaining: number | null };
    filteredCount: number;
    totalCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const demoDate = getNextWeekday();

  useEffect(() => {
    setLoading(true);
    fetchBookingLimitsDemo(demoDate, maxPerDay, maxPerWeek, minNotice).then((r) => {
      setData(r);
      setLoading(false);
    });
  }, [demoDate, maxPerDay, maxPerWeek, minNotice]);

  const dailyPct = data?.status.dailyLimit
    ? Math.min(100, (data.status.dailyCount / data.status.dailyLimit) * 100)
    : 0;

  const weeklyPct = data?.status.weeklyLimit
    ? Math.min(100, (data.status.weeklyCount / data.status.weeklyLimit) * 100)
    : 0;

  return (
    <div>
      <div className="demo-description">
        <h3>Booking Limits</h3>
        <p>
          <code>computeBookingLimits()</code> and <code>filterSlotsByLimits()</code> enforce
          per-day, per-week, and minimum-notice constraints. Adjust the sliders to see how
          limits affect slot availability.
        </p>
      </div>

      <div className="limits-demo-layout">
        <div className="limits-controls">
          <div className="limits-control-item">
            <div className="limits-control-label">
              Max bookings per day
              <span className="limits-control-value">{maxPerDay}</span>
            </div>
            <input
              type="range"
              min={1}
              max={15}
              value={maxPerDay}
              onChange={(e) => setMaxPerDay(Number(e.target.value))}
            />
          </div>

          <div className="limits-control-item">
            <div className="limits-control-label">
              Max bookings per week
              <span className="limits-control-value">{maxPerWeek}</span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              value={maxPerWeek}
              onChange={(e) => setMaxPerWeek(Number(e.target.value))}
            />
          </div>

          <div className="limits-control-item">
            <div className="limits-control-label">
              Min notice (minutes)
              <span className="limits-control-value">{minNotice} min</span>
            </div>
            <input
              type="range"
              min={0}
              max={1440}
              step={15}
              value={minNotice}
              onChange={(e) => setMinNotice(Number(e.target.value))}
            />
          </div>

          <div style={{ background: "var(--surface-dark)", borderRadius: "var(--radius-sm)", padding: "0.85rem", fontFamily: "var(--font-mono)", fontSize: "0.75rem", lineHeight: 1.7, color: "var(--text-muted)", border: "1px solid var(--border)" }}>
            {`computeBookingLimits(\n  bookings,\n  {\n    maxBookingsPerDay: ${maxPerDay},\n    maxBookingsPerWeek: ${maxPerWeek},\n    minNoticeMinutes: ${minNotice},\n  },\n  date\n)`}
          </div>
        </div>

        <div className="limits-result">
          {loading ? (
            <p className="loading-slots">Computing limits...</p>
          ) : data ? (
            <>
              <div className="limits-result-card">
                <h4>Daily Capacity</h4>
                <div className="limits-meter">
                  <div
                    className={`limits-meter-fill ${dailyPct >= 100 ? "full" : dailyPct >= 75 ? "warn" : "ok"}`}
                    style={{ width: `${dailyPct}%` }}
                  />
                </div>
                <div className="limits-meter-label">
                  {data.status.dailyCount} booked / {data.status.dailyLimit ?? "unlimited"} limit
                  {data.status.dailyRemaining !== null && ` (${data.status.dailyRemaining} remaining)`}
                </div>
              </div>

              <div className="limits-result-card">
                <h4>Weekly Capacity</h4>
                <div className="limits-meter">
                  <div
                    className={`limits-meter-fill ${weeklyPct >= 100 ? "full" : weeklyPct >= 75 ? "warn" : "ok"}`}
                    style={{ width: `${weeklyPct}%` }}
                  />
                </div>
                <div className="limits-meter-label">
                  {data.status.weeklyCount} booked / {data.status.weeklyLimit ?? "unlimited"} limit
                  {data.status.weeklyRemaining !== null && ` (${data.status.weeklyRemaining} remaining)`}
                </div>
              </div>

              <div className="limits-result-card">
                <h4>Slots Available After Filtering</h4>
                <div style={{ fontSize: "1.75rem", fontWeight: 800, color: data.status.canBook ? "var(--success)" : "var(--danger)" }}>
                  {data.filteredCount}
                  <span style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: 400, marginLeft: "0.35rem" }}>
                    / {data.totalCount} total
                  </span>
                </div>
              </div>

              <div className={`limits-status-badge ${data.status.canBook ? "can-book" : "blocked"}`}>
                {data.status.canBook ? "Booking allowed" : "Limit reached — no new bookings"}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation Mode Demo
// ---------------------------------------------------------------------------

function ConfirmationModeDemo() {
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [data, setData] = useState<{
    initialStatus: string;
    deadline: string;
    isOverdue: boolean;
    timeoutHours: number;
  } | null>(null);

  useEffect(() => {
    fetchConfirmationModeDemo(requiresConfirmation).then(setData);
  }, [requiresConfirmation]);

  const statusColors: Record<string, string> = {
    pending: "#f59e0b",
    confirmed: "#10b981",
  };

  const statusBg: Record<string, string> = {
    pending: "#fffbeb",
    confirmed: "#ecfdf5",
  };

  return (
    <div>
      <div className="demo-description">
        <h3>Confirmation Mode</h3>
        <p>
          When <code>requiresConfirmation</code> is true, bookings start as{" "}
          <code>pending</code> and must be manually approved by the provider.
          <code>getInitialBookingStatus()</code> handles this automatically.
          Overdue pending bookings are auto-rejected after 24 hours.
        </p>
      </div>

      <div className="confirm-mode-grid">
        <div
          className={`confirm-mode-card ${!requiresConfirmation ? "selected" : ""}`}
          onClick={() => setRequiresConfirmation(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setRequiresConfirmation(false)}
        >
          <h4>Instant Confirmation</h4>
          <p>Bookings are immediately confirmed. No provider approval required.</p>
          <span
            className="confirm-mode-badge"
            style={{ background: statusBg.confirmed, color: statusColors.confirmed }}
          >
            status: "confirmed"
          </span>
        </div>

        <div
          className={`confirm-mode-card ${requiresConfirmation ? "selected" : ""}`}
          onClick={() => setRequiresConfirmation(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setRequiresConfirmation(true)}
        >
          <h4>Manual Approval</h4>
          <p>Bookings wait in pending state until the provider confirms or rejects.</p>
          <span
            className="confirm-mode-badge"
            style={{ background: statusBg.pending, color: statusColors.pending }}
          >
            status: "pending"
          </span>
        </div>
      </div>

      {data && (
        <div className="confirm-mode-result">
          <span style={{ color: "#6272a4" }}>{"// getInitialBookingStatus() result\n"}</span>
          <span style={{ color: "#ff79c6" }}>{"const"}</span>
          {" "}
          <span style={{ color: "#8be9fd" }}>{"status"}</span>
          {" = "}
          <span style={{ color: "#f1fa8c" }}>{`"${data.initialStatus}"`}</span>
          {"\n\n"}
          {requiresConfirmation && (
            <>
              <span style={{ color: "#6272a4" }}>{"// Auto-reject deadline (24h from creation)\n"}</span>
              <span style={{ color: "#ff79c6" }}>{"const"}</span>
              {" "}
              <span style={{ color: "#8be9fd" }}>{"deadline"}</span>
              {" = getAutoRejectDeadline(createdAt)\n"}
              <span style={{ color: "#6272a4" }}>{"// → "}</span>
              <span style={{ color: "#f1fa8c" }}>{`"${new Date(data.deadline).toLocaleString()}"`}</span>
              {"\n\n"}
              <span style={{ color: "#6272a4" }}>{"// CONFIRMATION_TIMEOUT_HOURS = "}</span>
              <span style={{ color: "#bd93f9" }}>{data.timeoutHours}</span>
              {"\n"}
            </>
          )}
          {!requiresConfirmation && (
            <>
              <span style={{ color: "#6272a4" }}>{"// No approval queue — customer is booked\n"}</span>
              <span style={{ color: "#6272a4" }}>{"// Confirmation email sent immediately\n"}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
