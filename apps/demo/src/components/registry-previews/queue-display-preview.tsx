"use client";

const mockQueue = [
  { position: 1, name: "Marcus", service: "Classic Haircut", wait: 0, status: "in_service" as const },
  { position: 2, name: "Darius", service: "Beard Trim", wait: 15, status: "queued" as const },
  { position: 3, name: "Elena", service: "Combo", wait: 35, status: "queued" as const },
  { position: 4, name: "James", service: "Hot Towel Shave", wait: 50, status: "queued" as const },
];

export function QueueDisplayPreview() {
  const inService = mockQueue.find((e) => e.status === "in_service");
  const queued = mockQueue.filter((e) => e.status === "queued");

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "1rem",
        maxWidth: 400,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>Fade & Shave</div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", color: "#10b981" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
          Accepting Walk-Ins
        </div>
      </div>

      {/* Now serving */}
      {inService && (
        <div
          style={{
            background: "rgba(233,69,96,0.08)",
            border: "1px solid rgba(233,69,96,0.15)",
            borderRadius: "var(--radius-sm)",
            padding: "0.6rem 0.8rem",
            marginBottom: "0.75rem",
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.82rem",
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--accent)" }}>Now Serving</span>
          <span style={{ color: "var(--text)" }}>{inService.name} &mdash; {inService.service}</span>
        </div>
      )}

      {/* Queue list */}
      <div style={{ fontSize: "0.8rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2rem 1fr 1fr 4.5rem",
            gap: "0.3rem",
            padding: "0.4rem 0",
            borderBottom: "1px solid var(--border)",
            color: "var(--text-muted)",
            fontWeight: 600,
          }}
        >
          <span>#</span>
          <span>Customer</span>
          <span>Service</span>
          <span>Est. Wait</span>
        </div>
        {queued.map((entry) => (
          <div
            key={entry.position}
            style={{
              display: "grid",
              gridTemplateColumns: "2rem 1fr 1fr 4.5rem",
              gap: "0.3rem",
              padding: "0.5rem 0",
              borderBottom: "1px solid var(--border)",
              color: "var(--text)",
            }}
          >
            <span style={{ fontWeight: 700 }}>{entry.position}</span>
            <span>{entry.name}</span>
            <span style={{ color: "var(--text-muted)" }}>{entry.service}</span>
            <span>~{entry.wait} min</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "0.6rem",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
        }}
      >
        <span>{queued.length} in queue</span>
        <span>Updated just now</span>
      </div>
    </div>
  );
}
