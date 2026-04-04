"use client";

import { useState } from "react";

/** Lightweight calendar preview — no react-day-picker dependency */
export function BookingCalendarPreview() {
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const year = today.getFullYear();
  const month = today.getMonth();
  const monthName = today.toLocaleString("en-US", { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Mock: available days are Mon-Fri in the future
  const isAvailable = (day: number) => {
    if (day < today.getDate()) return false;
    const date = new Date(year, month, day);
    const dow = date.getDay();
    return dow >= 1 && dow <= 5;
  };

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  return (
    <div style={{ maxWidth: 280 }}>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.6rem", color: "var(--text)" }}>
        {monthName}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "0.2rem",
          textAlign: "center",
          fontSize: "0.75rem",
        }}
      >
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} style={{ fontWeight: 600, color: "var(--text-muted)", padding: "0.3rem 0" }}>
            {d}
          </div>
        ))}
        {days.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;
          const avail = isAvailable(day);
          const sel = selectedDay === day;
          const past = day < today.getDate();
          return (
            <button
              key={day}
              onClick={() => avail && setSelectedDay(day)}
              disabled={!avail}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "none",
                background: sel ? "var(--accent)" : "transparent",
                color: sel ? "#fff" : past ? "var(--border)" : avail ? "var(--text)" : "var(--text-muted)",
                fontWeight: sel ? 700 : 400,
                cursor: avail ? "pointer" : "default",
                fontSize: "0.8rem",
                opacity: !avail && !past ? 0.4 : 1,
                transition: "all 0.15s",
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.5rem", textAlign: "center" }}>
        Timezone: America/New_York
      </div>
    </div>
  );
}
