"use client";

import { useState, useEffect } from "react";
import { fetchTeamSchedulingDemo, type TeamDemoResult } from "@/lib/actions";
import type { AssignmentStrategy } from "@thebookingkit/core";

function getNextWeekday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  // Skip to Wed/Thu/Fri — the only days all 3 team members overlap
  // Marcus: MO-FR, Darius: TU-SA, Elena: MO,WE,FR,SA → intersection: WE,FR
  while (![3, 4, 5].includes(d.getDay())) {
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

const BARBERS = [
  {
    userId: "marcus",
    name: "Marcus Johnson",
    initials: "MJ",
    role: "Head Barber",
    hours: "Mon-Fri, 9am-6pm",
    color: "#e94560",
  },
  {
    userId: "darius",
    name: "Darius Wells",
    initials: "DW",
    role: "Senior Barber",
    hours: "Tue-Sat, 10am-7pm",
    color: "#6366f1",
  },
  {
    userId: "elena",
    name: "Elena Cruz",
    initials: "EC",
    role: "Barber",
    hours: "Mon, Wed, Fri-Sat, 11am-5pm",
    color: "#10b981",
  },
];

export function TeamSchedulingSection() {
  const [strategy, setStrategy] = useState<AssignmentStrategy>("round_robin");
  const [data, setData] = useState<TeamDemoResult | null>(null);
  const [loading, setLoading] = useState(true);
  const demoDate = getNextWeekday();

  useEffect(() => {
    setLoading(true);
    fetchTeamSchedulingDemo(demoDate, strategy).then((r) => {
      setData(r);
      setLoading(false);
    });
  }, [demoDate, strategy]);

  const maxCount = Math.max(...(data?.memberCounts.map((m) => m.confirmedCount) ?? [1]));

  return (
    <section className="section-shell dark" id="team">
      <div className="section-inner">
        <div className="section-header">
          <span className="section-eyebrow">Team Scheduling</span>
          <h2 className="section-title-lg">Multi-Provider Availability</h2>
          <p className="section-desc">
            <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.9em", color: "rgba(255,255,255,0.65)", background: "rgba(255,255,255,0.06)", padding: "0.1em 0.35em", borderRadius: "4px" }}>getTeamSlots()</code> and{" "}
            <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.9em", color: "rgba(255,255,255,0.65)", background: "rgba(255,255,255,0.06)", padding: "0.1em 0.35em", borderRadius: "4px" }}>assignHost()</code>{" "}
            compute availability across multiple providers with intelligent assignment.
          </p>
        </div>

        <div className="team-section-layout">
          <div className="team-barbers">
            {BARBERS.map((barber) => {
              const memberCount = data?.memberCounts.find((m) => m.userId === barber.userId);
              const loadPct = maxCount > 0 ? ((memberCount?.confirmedCount ?? 0) / maxCount) * 100 : 0;
              const isAssigned = data?.assignedHost === barber.userId;

              return (
                <div
                  key={barber.userId}
                  className={`barber-card ${isAssigned ? "active" : ""}`}
                >
                  <div className="barber-card-header">
                    <div
                      className="barber-avatar"
                      style={{ background: isAssigned ? barber.color : "rgba(255,255,255,0.08)" }}
                    >
                      {barber.initials}
                    </div>
                    <div className="barber-info">
                      <span className="barber-name">{barber.name}</span>
                      <span className="barber-role">{barber.role}</span>
                    </div>
                    {isAssigned && (
                      <span
                        style={{
                          marginLeft: "auto",
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          color: "var(--accent)",
                          background: "rgba(233,69,96,0.1)",
                          padding: "0.2em 0.55em",
                          borderRadius: "10px",
                          border: "1px solid rgba(233,69,96,0.25)",
                        }}
                      >
                        Next Up
                      </span>
                    )}
                  </div>
                  <p className="barber-hours">{barber.hours}</p>
                  <div className="barber-load-bar">
                    <div
                      className="barber-load-fill"
                      style={{
                        width: `${loadPct}%`,
                        background: barber.color,
                      }}
                    />
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.35)", marginTop: "0.3rem" }}>
                    {memberCount?.confirmedCount ?? 0} bookings this week
                  </div>
                </div>
              );
            })}
          </div>

          <div className="team-controls">
            <div>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "0.5rem",
                }}
              >
                Assignment Strategy
              </div>
              <div className="team-strategy-toggle">
                <button
                  className={`strategy-btn ${strategy === "round_robin" ? "active" : ""}`}
                  onClick={() => setStrategy("round_robin")}
                >
                  Round Robin
                </button>
                <button
                  className={`strategy-btn ${strategy === "collective" ? "active" : ""}`}
                  onClick={() => setStrategy("collective")}
                >
                  Collective
                </button>
              </div>
              <p
                style={{
                  fontSize: "0.78rem",
                  color: "rgba(255,255,255,0.35)",
                  marginTop: "0.5rem",
                  lineHeight: 1.5,
                }}
              >
                {strategy === "round_robin"
                  ? "Union of all member slots. assignHost() picks the next barber based on booking count and priority."
                  : "Intersection of all member slots. All three barbers must be free — group meetings, etc."}
              </p>
            </div>

            <div className="team-result">
              <div className="team-result-header">
                Available Slots for {demoDate}
                {!loading && data && (
                  <span style={{ marginLeft: "0.5rem", color: "var(--accent)" }}>
                    {data.slots.length} found
                  </span>
                )}
              </div>
              {loading ? (
                <div className="team-loading">Computing availability...</div>
              ) : data && data.slots.length > 0 ? (
                <div className="team-slots-grid">
                  {data.slots.slice(0, 16).map((slot, i) => (
                    <div
                      key={slot.startTime}
                      className={`team-slot-pill ${i === 0 && strategy === "round_robin" ? "highlight" : ""}`}
                    >
                      {formatTime(slot.localStart)}
                    </div>
                  ))}
                  {data.slots.length > 16 && (
                    <div className="team-slot-pill" style={{ color: "rgba(255,255,255,0.3)", borderStyle: "dashed" }}>
                      +{data.slots.length - 16}
                    </div>
                  )}
                </div>
              ) : (
                <div className="team-loading">No overlapping availability found</div>
              )}
            </div>

            {!loading && data?.assignedHost && (
              <div
                style={{
                  background: "rgba(233,69,96,0.06)",
                  border: "1px solid rgba(233,69,96,0.2)",
                  borderRadius: "var(--radius-sm)",
                  padding: "0.85rem 1rem",
                  fontSize: "0.82rem",
                  color: "rgba(255,255,255,0.6)",
                  lineHeight: 1.6,
                }}
              >
                <div style={{ color: "var(--accent)", fontWeight: 600, marginBottom: "0.3rem" }}>
                  assignHost() result
                </div>
                <div>
                  Host: <strong style={{ color: "rgba(255,255,255,0.85)" }}>
                    {BARBERS.find((b) => b.userId === data.assignedHost)?.name ?? data.assignedHost}
                  </strong>
                </div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", marginTop: "0.2rem" }}>
                  {data.assignedReason}
                </div>
              </div>
            )}

            <div className="team-code-snippet">
              <span style={{ color: "#6272a4" }}>{"// Compute team availability\n"}</span>
              <span style={{ color: "#ff79c6" }}>{"const"}</span>
              {" "}
              <span style={{ color: "#8be9fd" }}>{"slots"}</span>
              {" = "}
              <span style={{ color: "#50fa7b" }}>{"getTeamSlots"}</span>
              {"(\n"}
              {"  members, range, tz,\n"}
              {"  "}
              {"{ duration: "}
              <span style={{ color: "#bd93f9" }}>{"30"}</span>
              {" },\n"}
              {"  "}
              <span style={{ color: "#f1fa8c" }}>{`"${strategy}"`}</span>
              {"\n)\n\n"}
              {strategy === "round_robin" && (
                <>
                  <span style={{ color: "#6272a4" }}>{"// Assign next host\n"}</span>
                  <span style={{ color: "#ff79c6" }}>{"const"}</span>
                  {" "}
                  <span style={{ color: "#8be9fd" }}>{"host"}</span>
                  {" = "}
                  <span style={{ color: "#50fa7b" }}>{"assignHost"}</span>
                  {"(\n"}
                  {"  slots[0].availableMembers,\n"}
                  {"  bookingCounts\n"}
                  {")\n"}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
