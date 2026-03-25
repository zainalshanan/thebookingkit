"use client";

import { useState, useEffect, useCallback } from "react";
import type { ResourceAssignmentStrategy } from "@thebookingkit/core";
import {
  fetchResourceSlots,
  fetchResourceAssignment,
  fetchResourcePoolSummary,
  type ResourceSlotResult,
  type ResourceAssignmentDemoResult,
  type ResourcePoolSummaryResult,
} from "@/lib/actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNextServiceDay(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  // Skip Sundays
  while (d.getDay() === 0) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split("T")[0] as string;
}

function formatLocalTime(localStart: string): string {
  const timePart = localStart.split("T")[1];
  if (!timePart) return localStart;
  const [h, m] = timePart.split(":").map(Number);
  const period = (h ?? 0) >= 12 ? "PM" : "AM";
  const h12 = (h ?? 0) % 12 || 12;
  return `${h12}:${String(m ?? 0).padStart(2, "0")} ${period}`;
}

function getTableTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "2-top": "2-top",
    "4-top": "4-top",
    "8-top": "8-top",
  };
  return labels[type] ?? type;
}

function getTableTypeColor(type: string): string {
  const colors: Record<string, string> = {
    "2-top": "#6366f1",
    "4-top": "#10b981",
    "8-top": "#f59e0b",
  };
  return colors[type] ?? "var(--accent)";
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconTable() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="2" rx="1" />
      <path d="M6 13v6M18 13v6" />
      <path d="M4 7h16a1 1 0 0 1 1 1v3H3V8a1 1 0 0 1 1-1z" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pool Utilization Summary sub-component
// ---------------------------------------------------------------------------

interface PoolSummaryCardProps {
  summary: ResourcePoolSummaryResult | null;
  loading: boolean;
}

function PoolSummaryCard({ summary, loading }: PoolSummaryCardProps) {
  if (loading) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
        Loading pool summary...
      </div>
    );
  }

  if (!summary) return null;

  const typeEntries = Object.entries(summary.byType).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return (
    <div
      style={{
        background: "var(--surface-dark)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: "1rem",
      }}
    >
      <div
        style={{
          fontSize: "0.72rem",
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: "0.75rem",
        }}
      >
        Pool Utilization (Today)
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.5rem",
          marginBottom: "0.85rem",
        }}
      >
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "0.65rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "1.3rem",
              fontWeight: 800,
              color: "var(--text)",
              lineHeight: 1.2,
            }}
          >
            {summary.totalResources}
          </div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            Total Tables
          </div>
        </div>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "0.65rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "1.3rem",
              fontWeight: 800,
              color: "var(--success)",
              lineHeight: 1.2,
            }}
          >
            {summary.totalResources - Math.round((summary.utilizationPercent / 100) * summary.totalResources)}
          </div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            Available Now
          </div>
        </div>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "0.65rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "1.3rem",
              fontWeight: 800,
              color: summary.utilizationPercent >= 80 ? "var(--danger)" : summary.utilizationPercent >= 50 ? "var(--warning)" : "var(--text)",
              lineHeight: 1.2,
            }}
          >
            {summary.utilizationPercent}%
          </div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            Peak Fill
          </div>
        </div>
      </div>

      {typeEntries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
          {typeEntries.map(([type, counts]) => {
            const color = getTableTypeColor(type);
            const pct = counts.total > 0 ? ((counts.total - counts.available) / counts.total) * 100 : 0;
            return (
              <div key={type}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.2rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.73rem",
                      fontWeight: 600,
                      color,
                    }}
                  >
                    {getTableTypeLabel(type)}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    {counts.available}/{counts.total} free
                  </span>
                </div>
                <div
                  style={{
                    height: "5px",
                    background: "var(--border)",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: color,
                      borderRadius: "3px",
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assignment Result sub-component
// ---------------------------------------------------------------------------

interface AssignmentResultCardProps {
  result: ResourceAssignmentDemoResult | null;
  loading: boolean;
  partySize: number;
  selectedSlot: ResourceSlotResult | null;
}

function AssignmentResultCard({
  result,
  loading,
  partySize,
  selectedSlot,
}: AssignmentResultCardProps) {
  if (!selectedSlot) {
    return (
      <div
        style={{
          background: "var(--surface-dark)",
          border: "1px dashed var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: "1.25rem",
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: "0.82rem",
        }}
      >
        Select a time slot above to see table assignment
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface-dark)",
        border: `1px solid ${result?.success ? "rgba(16,185,129,0.25)" : "var(--border)"}`,
        borderRadius: "var(--radius-sm)",
        padding: "1rem",
      }}
    >
      <div
        style={{
          fontSize: "0.72rem",
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: "0.75rem",
        }}
      >
        assignResource() Result
      </div>

      {loading ? (
        <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
          Assigning table...
        </div>
      ) : result ? (
        result.success ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "20px",
                  height: "20px",
                  background: "var(--success)",
                  color: "white",
                  borderRadius: "50%",
                  flexShrink: 0,
                }}
              >
                <IconCheck />
              </span>
              <span
                style={{
                  fontSize: "0.92rem",
                  fontWeight: 700,
                  color: "var(--text)",
                }}
              >
                {result.resourceName}
              </span>
            </div>

            <div
              style={{
                fontSize: "0.78rem",
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              <div>
                Party of{" "}
                <strong style={{ color: "var(--text)" }}>{partySize}</strong> at{" "}
                <strong style={{ color: "var(--text)" }}>
                  {formatLocalTime(selectedSlot.localStart)}
                </strong>
              </div>
              <div style={{ marginTop: "0.2rem" }}>{result.reason}</div>
            </div>
          </div>
        ) : (
          <div
            style={{
              fontSize: "0.82rem",
              color: "var(--danger)",
              lineHeight: 1.6,
            }}
          >
            {result.error}
          </div>
        )
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Section
// ---------------------------------------------------------------------------

export function ResourceBookingSection() {
  const [partySize, setPartySize] = useState(2);
  const [demoDate, setDemoDate] = useState(getNextServiceDay);
  const [strategy, setStrategy] = useState<ResourceAssignmentStrategy>("best_fit");
  const [selectedSlot, setSelectedSlot] = useState<ResourceSlotResult | null>(null);

  const [slots, setSlots] = useState<ResourceSlotResult[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);

  const [assignment, setAssignment] = useState<ResourceAssignmentDemoResult | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);

  const [poolSummary, setPoolSummary] = useState<ResourcePoolSummaryResult | null>(null);
  const [poolLoading, setPoolLoading] = useState(true);

  const tz = typeof window !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : "America/New_York";

  // Load available slots when party size or date changes
  useEffect(() => {
    setSlotsLoading(true);
    setSelectedSlot(null);
    setAssignment(null);

    fetchResourceSlots(demoDate, partySize, tz).then((r) => {
      setSlots(r);
      setSlotsLoading(false);
    });
  }, [demoDate, partySize, tz]);

  // Load pool summary when date changes
  useEffect(() => {
    setPoolLoading(true);
    fetchResourcePoolSummary(demoDate, tz).then((r) => {
      setPoolSummary(r);
      setPoolLoading(false);
    });
  }, [demoDate, tz]);

  // Re-run assignment when strategy or selected slot changes
  const runAssignment = useCallback(
    (slot: ResourceSlotResult, strat: ResourceAssignmentStrategy) => {
      setAssignmentLoading(true);
      fetchResourceAssignment(demoDate, slot.startTime, slot.endTime, partySize, strat).then((r) => {
        setAssignment(r);
        setAssignmentLoading(false);
      });
    },
    [demoDate, partySize],
  );

  const handleSlotSelect = (slot: ResourceSlotResult) => {
    setSelectedSlot(slot);
    runAssignment(slot, strategy);
  };

  const handleStrategyChange = (strat: ResourceAssignmentStrategy) => {
    setStrategy(strat);
    if (selectedSlot) {
      runAssignment(selectedSlot, strat);
    }
  };

  const strategies: { id: ResourceAssignmentStrategy; label: string; desc: string }[] = [
    { id: "best_fit", label: "Best Fit", desc: "Smallest table that seats the party" },
    { id: "first_available", label: "First Available", desc: "First free table in floor order" },
    { id: "largest_first", label: "Largest First", desc: "Biggest table in the section" },
    { id: "round_robin", label: "Round Robin", desc: "Table with fewest bookings today" },
  ];

  const partySizes = [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <section className="section-shell" id="resources">
      <div className="section-inner">
        {/* Header */}
        <div className="section-header">
          <span className="section-eyebrow">Resource &amp; Capacity Booking</span>
          <h2 className="section-title-lg">Tables, Rooms &amp; Courts</h2>
          <p className="section-desc">
            <code
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.9em",
                background: "var(--surface-dark)",
                padding: "0.1em 0.35em",
                borderRadius: "4px",
              }}
            >
              getResourceAvailableSlots()
            </code>{" "}
            and{" "}
            <code
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.9em",
                background: "var(--surface-dark)",
                padding: "0.1em 0.35em",
                borderRadius: "4px",
              }}
            >
              assignResource()
            </code>{" "}
            power capacity-aware booking for restaurants, hotel rooms, tennis courts, and any
            physical or virtual resource pool.
          </p>
        </div>

        {/* Restaurant Header Card */}
        <div
          style={{
            background: "var(--brand)",
            borderRadius: "var(--radius)",
            padding: "1.25rem 1.5rem",
            marginBottom: "2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                background: "rgba(233,69,96,0.15)",
                border: "1px solid rgba(233,69,96,0.25)",
                borderRadius: "var(--radius-sm)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent)",
                flexShrink: 0,
              }}
            >
              <IconTable />
            </div>
            <div>
              <div
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  color: "white",
                }}
              >
                Olive &amp; Vine Bistro
              </div>
              <div
                style={{
                  fontSize: "0.77rem",
                  color: "rgba(255,255,255,0.45)",
                  marginTop: "0.1rem",
                }}
              >
                47 Bleecker Street, New York &bull; Lunch 11:30&ndash;14:00 &bull; Dinner 17:30&ndash;22:00
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {[
              { type: "2-top", count: 8, color: "#6366f1" },
              { type: "4-top", count: 5, color: "#10b981" },
              { type: "8-top", count: 2, color: "#f59e0b" },
            ].map((t) => (
              <span
                key={t.type}
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  padding: "0.25em 0.65em",
                  borderRadius: "12px",
                  background: `${t.color}18`,
                  color: t.color,
                  border: `1px solid ${t.color}35`,
                }}
              >
                {t.count}&times; {t.type}
              </span>
            ))}
          </div>
        </div>

        {/* Main Layout */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1.5rem",
          }}
          className="resource-demo-grid"
        >
          {/* Left Column: Controls + Slots */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Party Size + Date */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "1.25rem",
                boxShadow: "var(--shadow)",
              }}
            >
              <div
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  marginBottom: "1rem",
                }}
              >
                Find a Table
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* Party Size */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span style={{ color: "var(--text-muted)", display: "flex" }}>
                      <IconUsers />
                    </span>
                    <span
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        color: "var(--text)",
                      }}
                    >
                      Party Size
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.35rem",
                      flexWrap: "wrap",
                    }}
                  >
                    {partySizes.map((size) => (
                      <button
                        key={size}
                        onClick={() => setPartySize(size)}
                        style={{
                          width: "36px",
                          height: "36px",
                          border: "1px solid",
                          borderColor:
                            partySize === size ? "var(--accent)" : "var(--border)",
                          background:
                            partySize === size
                              ? "rgba(233,69,96,0.07)"
                              : "var(--surface)",
                          color:
                            partySize === size ? "var(--accent)" : "var(--text-muted)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.85rem",
                          fontWeight: partySize === size ? 700 : 500,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          transition: "all 0.15s",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date */}
                <div>
                  <div
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "var(--text)",
                      marginBottom: "0.4rem",
                    }}
                  >
                    Date
                  </div>
                  <input
                    type="date"
                    value={demoDate}
                    onChange={(e) => {
                      if (e.target.value) setDemoDate(e.target.value);
                    }}
                    style={{
                      padding: "0.5rem 0.75rem",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.85rem",
                      color: "var(--text)",
                      background: "var(--surface)",
                      fontFamily: "inherit",
                      cursor: "pointer",
                      width: "100%",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Available Slots */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "1.25rem",
                boxShadow: "var(--shadow)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.85rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                  }}
                >
                  Available Times
                </div>
                {!slotsLoading && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--accent)",
                      fontWeight: 600,
                    }}
                  >
                    {slots.length} slot{slots.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {slotsLoading ? (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.82rem",
                    padding: "0.5rem 0",
                  }}
                >
                  Computing availability...
                </div>
              ) : slots.length === 0 ? (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.82rem",
                    padding: "0.5rem 0",
                  }}
                >
                  No tables available for a party of {partySize} on this date.
                  Try another date or smaller party size.
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                    gap: "0.5rem",
                    maxHeight: "220px",
                    overflowY: "auto",
                  }}
                >
                  {slots.map((slot) => {
                    const isSelected =
                      selectedSlot?.startTime === slot.startTime;
                    const availCount = slot.availableCount;
                    const urgency =
                      availCount <= 2
                        ? "low"
                        : availCount <= 5
                          ? "mid"
                          : "high";
                    const dotColor =
                      urgency === "low"
                        ? "var(--danger)"
                        : urgency === "mid"
                          ? "var(--warning)"
                          : "var(--success)";

                    return (
                      <button
                        key={slot.startTime}
                        onClick={() => handleSlotSelect(slot)}
                        style={{
                          padding: "0.55rem 0.5rem",
                          border: "1px solid",
                          borderColor: isSelected
                            ? "var(--accent)"
                            : "var(--border)",
                          background: isSelected
                            ? "rgba(233,69,96,0.06)"
                            : "var(--surface)",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          transition: "all 0.15s",
                          textAlign: "center",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "0.2rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            color: isSelected ? "var(--accent)" : "var(--text)",
                          }}
                        >
                          {formatLocalTime(slot.localStart)}
                        </span>
                        <span
                          style={{
                            fontSize: "0.67rem",
                            color: dotColor,
                            fontWeight: 600,
                          }}
                        >
                          {availCount} table{availCount !== 1 ? "s" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pool Summary */}
            <PoolSummaryCard summary={poolSummary} loading={poolLoading} />
          </div>

          {/* Right Column: Strategy + Assignment + Code */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Strategy Selector */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "1.25rem",
                boxShadow: "var(--shadow)",
              }}
            >
              <div
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  marginBottom: "0.85rem",
                }}
              >
                Assignment Strategy
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                }}
              >
                {strategies.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleStrategyChange(s.id)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.65rem",
                      padding: "0.65rem 0.75rem",
                      border: "1px solid",
                      borderColor:
                        strategy === s.id ? "var(--accent)" : "var(--border)",
                      background:
                        strategy === s.id
                          ? "rgba(233,69,96,0.05)"
                          : "var(--surface)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                      transition: "all 0.15s",
                      width: "100%",
                    }}
                  >
                    <span
                      style={{
                        width: "16px",
                        height: "16px",
                        border: "2px solid",
                        borderColor:
                          strategy === s.id ? "var(--accent)" : "var(--border)",
                        borderRadius: "50%",
                        flexShrink: 0,
                        marginTop: "1px",
                        background:
                          strategy === s.id ? "var(--accent)" : "transparent",
                        transition: "all 0.15s",
                      }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: "0.83rem",
                          fontWeight: 600,
                          color:
                            strategy === s.id ? "var(--accent)" : "var(--text)",
                        }}
                      >
                        {s.label}
                      </div>
                      <div
                        style={{
                          fontSize: "0.74rem",
                          color: "var(--text-muted)",
                          marginTop: "0.1rem",
                          lineHeight: 1.4,
                        }}
                      >
                        {s.desc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Assignment Result */}
            <AssignmentResultCard
              result={assignment}
              loading={assignmentLoading}
              partySize={partySize}
              selectedSlot={selectedSlot}
            />

            {/* Code Snippet */}
            <div
              style={{
                background: "var(--code-bg)",
                borderRadius: "var(--radius-sm)",
                padding: "1rem 1.1rem",
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                lineHeight: 1.75,
                border: "1px solid rgba(255,255,255,0.06)",
                overflowX: "auto",
              }}
            >
              <div style={{ color: "#6272a4" }}>{"// 1. Find tables with capacity"}</div>
              <div>
                <span style={{ color: "#ff79c6" }}>{"const"}</span>
                {" "}
                <span style={{ color: "#8be9fd" }}>{"slots"}</span>
                {" = "}
                <span style={{ color: "#50fa7b" }}>{"getResourceAvailableSlots"}</span>
                {"(\n"}
                {"  resources, dateRange, tz,\n"}
                {"  "}
                {"{ duration: "}
                <span style={{ color: "#bd93f9" }}>{"90"}</span>
                {", minCapacity: "}
                <span style={{ color: "#bd93f9" }}>{partySize}</span>
                {" }\n)\n\n"}
              </div>
              <div style={{ color: "#6272a4" }}>{"// 2. Auto-assign a table"}</div>
              <div>
                <span style={{ color: "#ff79c6" }}>{"const"}</span>
                {" "}
                <span style={{ color: "#8be9fd" }}>{"table"}</span>
                {" = "}
                <span style={{ color: "#50fa7b" }}>{"assignResource"}</span>
                {"(\n"}
                {"  resources, start, end,\n"}
                {"  "}
                {"{ strategy: "}
                <span style={{ color: "#f1fa8c" }}>{`"${strategy}"`}</span>
                {",\n"}
                {"    requestedCapacity: "}
                <span style={{ color: "#bd93f9" }}>{partySize}</span>
                {" }\n)\n\n"}
              </div>
              <div style={{ color: "#6272a4" }}>{"// 3. Pool utilization"}</div>
              <div>
                <span style={{ color: "#ff79c6" }}>{"const"}</span>
                {" "}
                <span style={{ color: "#8be9fd" }}>{"summary"}</span>
                {" = "}
                <span style={{ color: "#50fa7b" }}>{"getResourcePoolSummary"}</span>
                {"(\n"}
                {"  resources, dateRange, tz\n)"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Responsive grid override */}
      <style>{`
        @media (max-width: 768px) {
          .resource-demo-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
