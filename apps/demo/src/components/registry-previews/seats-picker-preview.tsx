"use client";

import { useState } from "react";

export function SeatsPickerPreview() {
  const maxSeats = 20;
  const [booked, setBooked] = useState(12);
  const available = maxSeats - booked;
  const fill = (booked / maxSeats) * 100;

  return (
    <div style={{ maxWidth: 320 }}>
      <div style={{ marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>
          {available} of {maxSeats} seats available
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "var(--border)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${fill}%`,
              borderRadius: 4,
              background: fill >= 100 ? "var(--danger)" : "var(--accent)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>
      <button
        onClick={() => setBooked((b) => Math.min(b + 1, maxSeats))}
        disabled={available === 0}
        style={{
          padding: "0.5rem 1rem",
          borderRadius: "var(--radius-sm)",
          border: "none",
          background: available === 0 ? "var(--border)" : "var(--accent)",
          color: available === 0 ? "var(--text-muted)" : "#fff",
          fontWeight: 600,
          fontSize: "0.82rem",
          cursor: available === 0 ? "not-allowed" : "pointer",
        }}
      >
        {available === 0 ? "Fully Booked" : "Reserve a Seat"}
      </button>
      {booked > 12 && (
        <button
          onClick={() => setBooked(12)}
          style={{
            marginLeft: "0.5rem",
            padding: "0.5rem 0.75rem",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: "0.78rem",
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      )}
    </div>
  );
}
