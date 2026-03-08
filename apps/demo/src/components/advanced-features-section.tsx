"use client";

import { useState, useEffect } from "react";
import {
  fetchRecurringDemo,
  fetchSeatsDemo,
  fetchWalkInDemo,
  fetchRoutingDemo,
  fetchCancellationDemo,
  fetchKioskDemo,
} from "@/lib/actions";

// ---------------------------------------------------------------------------
// Icon helpers (inline SVG, no emoji)
// ---------------------------------------------------------------------------

function IconRecurring() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2.1l4 4-4 4" />
      <path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8M7 21.9l-4-4 4-4" />
      <path d="M21 11.8v2a4 4 0 0 1-4 4H4.2" />
    </svg>
  );
}

function IconSeats() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
    </svg>
  );
}

function IconQueue() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconRouting() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
    </svg>
  );
}

function IconPayment() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function IconKiosk() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Recurring Bookings Card
// ---------------------------------------------------------------------------

function RecurringCard() {
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [count, setCount] = useState(6);
  const [data, setData] = useState<{ occurrences: { index: number; startsAt: string; endsAt: string }[] } | null>(null);

  useEffect(() => {
    fetchRecurringDemo(frequency, count).then(setData);
  }, [frequency, count]);

  return (
    <div className="feature-mini-card">
      <div className="feature-card-icon">
        <IconRecurring />
      </div>
      <div className="feature-card-title">Recurring Bookings</div>
      <div className="feature-card-desc">
        Generate occurrence series for weekly, biweekly, or monthly recurring appointments.
      </div>

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        {(["weekly", "biweekly", "monthly"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFrequency(f)}
            style={{
              padding: "0.25rem 0.65rem",
              border: "1px solid",
              borderColor: frequency === f ? "var(--accent)" : "var(--border)",
              background: frequency === f ? "rgba(233,69,96,0.07)" : "var(--surface)",
              color: frequency === f ? "var(--accent)" : "var(--text-muted)",
              borderRadius: "20px",
              fontSize: "0.72rem",
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Occurrences:</span>
        <input
          type="range"
          min={2}
          max={12}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--accent)" }}
        />
        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--accent)", minWidth: "1.5rem" }}>{count}</span>
      </div>

      <div className="feature-card-demo">
        {data?.occurrences.slice(0, 4).map((o) => {
          const d = new Date(o.startsAt);
          return (
            <div key={o.index} style={{ color: "var(--text)" }}>
              #{o.index + 1}: {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </div>
          );
        })}
        {(data?.occurrences.length ?? 0) > 4 && (
          <div style={{ color: "var(--text-muted)" }}>...+{(data?.occurrences.length ?? 0) - 4} more</div>
        )}
      </div>

      <div className="feature-card-fn">generateOccurrences(input)</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seat-Based Events Card
// ---------------------------------------------------------------------------

function SeatsCard() {
  const [maxSeats, setMaxSeats] = useState(10);
  const [bookedSeats, setBookedSeats] = useState(6);
  const [data, setData] = useState<{ maxSeats: number; bookedSeats: number; availableSeats: number; isFull: boolean } | null>(null);

  useEffect(() => {
    const booked = Math.min(bookedSeats, maxSeats);
    fetchSeatsDemo(maxSeats, booked).then(setData);
  }, [maxSeats, bookedSeats]);

  const pct = data ? (data.bookedSeats / data.maxSeats) * 100 : 0;

  return (
    <div className="feature-mini-card">
      <div className="feature-card-icon">
        <IconSeats />
      </div>
      <div className="feature-card-title">Seat-Based Events</div>
      <div className="feature-card-desc">
        Group events and classes with per-slot seat capacity and live availability tracking.
      </div>

      <div style={{ display: "flex", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
            Capacity: {maxSeats}
          </div>
          <input type="range" min={2} max={20} value={maxSeats} onChange={(e) => setMaxSeats(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--accent)" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
            Booked: {Math.min(bookedSeats, maxSeats)}
          </div>
          <input type="range" min={0} max={maxSeats} value={Math.min(bookedSeats, maxSeats)} onChange={(e) => setBookedSeats(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--accent)" }} />
        </div>
      </div>

      <div className="feature-card-demo">
        {data && (
          <>
            <div style={{ height: "6px", background: "var(--border)", borderRadius: "3px", overflow: "hidden", marginBottom: "0.5rem" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: data.isFull ? "var(--danger)" : "var(--success)", borderRadius: "3px", transition: "width 0.3s" }} />
            </div>
            <div style={{ color: "var(--text)" }}>
              {data.availableSeats} / {data.maxSeats} seats available
            </div>
            {data.isFull && <div style={{ color: "var(--danger)" }}>Fully booked</div>}
          </>
        )}
      </div>

      <div className="feature-card-fn">computeSeatAvailability(maxSeats, attendees)</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Walk-In Queue Card
// ---------------------------------------------------------------------------

function WalkInCard() {
  const [queueLength, setQueueLength] = useState(3);
  const [avgMinutes, setAvgMinutes] = useState(30);
  const [data, setData] = useState<{ estimatedWaitMinutes: number; queueLength: number; avgServiceMinutes: number } | null>(null);

  useEffect(() => {
    fetchWalkInDemo(queueLength, avgMinutes).then(setData);
  }, [queueLength, avgMinutes]);

  return (
    <div className="feature-mini-card">
      <div className="feature-card-icon">
        <IconQueue />
      </div>
      <div className="feature-card-title">Walk-In Queue</div>
      <div className="feature-card-desc">
        Accept walk-in customers alongside scheduled bookings with live wait time estimation.
      </div>

      <div style={{ display: "flex", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
            Queue: {queueLength} ahead
          </div>
          <input type="range" min={0} max={10} value={queueLength} onChange={(e) => setQueueLength(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--accent)" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
            Avg: {avgMinutes} min
          </div>
          <input type="range" min={10} max={60} step={5} value={avgMinutes} onChange={(e) => setAvgMinutes(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--accent)" }} />
        </div>
      </div>

      <div className="feature-card-demo">
        {data && (
          <>
            <div style={{ color: "var(--text)" }}>
              Estimated wait:{" "}
              <strong>
                {data.estimatedWaitMinutes} min
              </strong>
            </div>
            <div style={{ color: "var(--text-muted)", marginTop: "0.2rem" }}>
              {queueLength === 0 ? "Walk right in!" : `${queueLength} customer${queueLength > 1 ? "s" : ""} ahead`}
            </div>
          </>
        )}
      </div>

      <div className="feature-card-fn">estimateWaitTime(queue, avgMinutes)</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Routing Forms Card
// ---------------------------------------------------------------------------

function RoutingCard() {
  const [serviceType, setServiceType] = useState("Haircut");
  const [data, setData] = useState<{ matched: boolean; destination: string | null; ruleLabel: string } | null>(null);

  useEffect(() => {
    fetchRoutingDemo(serviceType).then(setData);
  }, [serviceType]);

  const options = ["Haircut", "Beard Trim", "Deluxe Package"];

  return (
    <div className="feature-mini-card">
      <div className="feature-card-icon">
        <IconRouting />
      </div>
      <div className="feature-card-title">Routing Forms</div>
      <div className="feature-card-desc">
        Intake forms that route customers to the right event type based on their answers.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>What service do you need?</div>
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => setServiceType(opt)}
              style={{
                padding: "0.25rem 0.6rem",
                border: "1px solid",
                borderColor: serviceType === opt ? "var(--accent)" : "var(--border)",
                background: serviceType === opt ? "rgba(233,69,96,0.07)" : "var(--surface)",
                color: serviceType === opt ? "var(--accent)" : "var(--text-muted)",
                borderRadius: "6px",
                fontSize: "0.72rem",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="feature-card-demo">
        {data && (
          <>
            <div style={{ color: data.matched ? "var(--success)" : "var(--text-muted)" }}>
              {data.matched ? "Rule matched" : "No rule matched — fallback"}
            </div>
            <div style={{ color: "var(--text)", marginTop: "0.2rem" }}>
              Destination: <strong>{data.destination}</strong>
            </div>
          </>
        )}
      </div>

      <div className="feature-card-fn">evaluateRoutingRules(form, responses)</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payment Hooks Card
// ---------------------------------------------------------------------------

function PaymentCard() {
  const [hoursBeforeBooking, setHoursBeforeBooking] = useState(6);
  const [data, setData] = useState<{ feeAmount: number; feePercentage: number; formatted: string; tierId: string } | null>(null);

  useEffect(() => {
    fetchCancellationDemo(hoursBeforeBooking).then(setData);
  }, [hoursBeforeBooking]);

  const feeColor = () => {
    if (!data) return "var(--text-muted)";
    if (data.feePercentage === 0) return "var(--success)";
    if (data.feePercentage <= 50) return "var(--warning)";
    return "var(--danger)";
  };

  return (
    <div className="feature-mini-card">
      <div className="feature-card-icon">
        <IconPayment />
      </div>
      <div className="feature-card-title">Payment Hooks</div>
      <div className="feature-card-desc">
        Tiered cancellation policies with automatic fee calculation. Integrates with any payment provider.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
          Cancel {hoursBeforeBooking}h before booking
        </div>
        <input
          type="range"
          min={1}
          max={48}
          value={hoursBeforeBooking}
          onChange={(e) => setHoursBeforeBooking(Number(e.target.value))}
          style={{ accentColor: "var(--accent)" }}
        />
      </div>

      <div className="feature-card-demo">
        {data && (
          <>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, color: feeColor() }}>
              {data.feeAmount === 0 ? "No fee" : data.formatted}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.2rem" }}>
              {data.feePercentage}% fee applied (tier: {data.tierId})
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginTop: "0.15rem" }}>
              Policy: free 24h+, 50% 2-24h, 100% under 2h
            </div>
          </>
        )}
      </div>

      <div className="feature-card-fn">evaluateCancellationFee(policy, now, start, amount)</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kiosk Mode Card
// ---------------------------------------------------------------------------

function KioskCard() {
  const [viewType, setViewType] = useState("day");
  const [data, setData] = useState<{ resolved: { defaultView: string; blockDensity: string; showWalkInSidebar: boolean; autoLockMinutes: number; dayStartHour: number; dayEndHour: number }; viewLabel: string } | null>(null);

  useEffect(() => {
    fetchKioskDemo(viewType).then(setData);
  }, [viewType]);

  const views = ["day", "3day", "week"];

  return (
    <div className="feature-mini-card">
      <div className="feature-card-icon">
        <IconKiosk />
      </div>
      <div className="feature-card-title">Kiosk Mode</div>
      <div className="feature-card-desc">
        Tablet-optimized check-in kiosks with configurable views, walk-in support, and provider management.
      </div>

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        {views.map((v) => (
          <button
            key={v}
            onClick={() => setViewType(v)}
            style={{
              padding: "0.22rem 0.55rem",
              border: "1px solid",
              borderColor: viewType === v ? "var(--accent)" : "var(--border)",
              background: viewType === v ? "rgba(233,69,96,0.07)" : "var(--surface)",
              color: viewType === v ? "var(--accent)" : "var(--text-muted)",
              borderRadius: "6px",
              fontSize: "0.7rem",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="feature-card-demo">
        {data && (
          <>
            <div style={{ color: "var(--text)", fontWeight: 600 }}>{data.viewLabel}</div>
            <div style={{ color: "var(--text-muted)", marginTop: "0.3rem", fontSize: "0.75rem" }}>
              Walk-in sidebar: {data.resolved.showWalkInSidebar ? "enabled" : "disabled"} &bull;{" "}
              Hours: {data.resolved.dayStartHour}:00 &ndash; {data.resolved.dayEndHour}:00
            </div>
          </>
        )}
      </div>

      <div className="feature-card-fn">resolveKioskSettings(partial)</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Shell
// ---------------------------------------------------------------------------

export function AdvancedFeaturesSection() {
  return (
    <section className="section-shell" id="advanced">
      <div className="section-inner">
        <div className="section-header">
          <span className="section-eyebrow">Advanced Capabilities</span>
          <h2 className="section-title-lg">Everything Booking Systems Need</h2>
          <p className="section-desc">
            Six advanced scheduling primitives, each with interactive demos backed by live
            server action calls to <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.9em", background: "var(--surface-dark)", padding: "0.1em 0.35em", borderRadius: "4px" }}>@thebookingkit/core</code>.
          </p>
        </div>

        <div className="features-grid">
          <RecurringCard />
          <SeatsCard />
          <WalkInCard />
          <RoutingCard />
          <PaymentCard />
          <KioskCard />
        </div>
      </div>
    </section>
  );
}
