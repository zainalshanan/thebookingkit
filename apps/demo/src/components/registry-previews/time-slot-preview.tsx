"use client";

import { useState } from "react";

const MOCK_SLOTS = [
  { time: "9:00 AM", period: "Morning" },
  { time: "9:30 AM", period: "Morning" },
  { time: "10:00 AM", period: "Morning" },
  { time: "10:30 AM", period: "Morning" },
  { time: "11:00 AM", period: "Morning" },
  { time: "11:30 AM", period: "Morning" },
  { time: "12:00 PM", period: "Afternoon" },
  { time: "12:30 PM", period: "Afternoon" },
  { time: "1:00 PM", period: "Afternoon" },
  { time: "1:30 PM", period: "Afternoon" },
  { time: "2:00 PM", period: "Afternoon" },
  { time: "5:00 PM", period: "Evening" },
  { time: "5:30 PM", period: "Evening" },
  { time: "6:00 PM", period: "Evening" },
];

const periods = ["Morning", "Afternoon", "Evening"];

export function TimeSlotPreview() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 360 }}>
      {periods.map((period) => {
        const slots = MOCK_SLOTS.filter((s) => s.period === period);
        if (slots.length === 0) return null;
        return (
          <div key={period} style={{ marginBottom: "0.75rem" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>
              {period}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              {slots.map((slot) => (
                <button
                  key={slot.time}
                  onClick={() => setSelected(slot.time)}
                  style={{
                    padding: "0.4rem 0.7rem",
                    borderRadius: "var(--radius-sm)",
                    border: selected === slot.time ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                    background: selected === slot.time ? "rgba(233,69,96,0.08)" : "var(--surface)",
                    color: selected === slot.time ? "var(--accent)" : "var(--text)",
                    fontSize: "0.8rem",
                    fontFamily: "var(--font-mono)",
                    cursor: "pointer",
                    fontWeight: selected === slot.time ? 600 : 400,
                    transition: "all 0.15s ease",
                  }}
                >
                  {slot.time}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {selected && (
        <div style={{ fontSize: "0.78rem", color: "var(--accent)", marginTop: "0.3rem" }}>
          Selected: {selected}
        </div>
      )}
    </div>
  );
}
