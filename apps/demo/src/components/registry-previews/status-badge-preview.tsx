"use client";

const statuses = [
  { status: "pending", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  { status: "confirmed", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  { status: "completed", color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
  { status: "cancelled", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  { status: "rescheduled", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  { status: "no_show", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  { status: "rejected", color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
] as const;

const labels: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  no_show: "No Show",
  rejected: "Rejected",
};

export function StatusBadgePreview() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
      {statuses.map((s) => (
        <span
          key={s.status}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0.3rem 0.75rem",
            borderRadius: "999px",
            fontSize: "0.78rem",
            fontWeight: 600,
            color: s.color,
            background: s.bg,
            border: `1px solid ${s.color}20`,
          }}
        >
          {labels[s.status]}
        </span>
      ))}
    </div>
  );
}
