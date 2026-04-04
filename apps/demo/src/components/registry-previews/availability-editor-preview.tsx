"use client";

import { useState } from "react";

type Schedule = Record<string, { startTime: string; endTime: string }[]>;

const DAYS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

const INITIAL: Schedule = {
  monday: [{ startTime: "09:00", endTime: "17:00" }],
  tuesday: [{ startTime: "09:00", endTime: "17:00" }],
  wednesday: [{ startTime: "09:00", endTime: "17:00" }],
  thursday: [{ startTime: "09:00", endTime: "17:00" }],
  friday: [{ startTime: "09:00", endTime: "17:00" }],
  saturday: [{ startTime: "10:00", endTime: "15:00" }],
  sunday: [],
};

export function AvailabilityEditorPreview() {
  const [schedule, setSchedule] = useState<Schedule>(INITIAL);

  const toggle = (day: string) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: prev[day]?.length
        ? []
        : [{ startTime: "09:00", endTime: "17:00" }],
    }));
  };

  return (
    <div style={{ maxWidth: 420 }}>
      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.6rem" }}>
        Timezone: America/New_York
      </div>
      {DAYS.map((day) => {
        const ranges = schedule[day.key] ?? [];
        const isAvailable = ranges.length > 0;
        return (
          <div
            key={day.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.4rem 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <button
              onClick={() => toggle(day.key)}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                border: "none",
                background: isAvailable ? "var(--accent)" : "var(--border)",
                position: "relative",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 0.2s",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: isAvailable ? 18 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.2s",
                }}
              />
            </button>
            <span style={{ width: "3rem", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)" }}>
              {day.label}
            </span>
            {isAvailable ? (
              <span style={{ fontSize: "0.8rem", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                {ranges[0].startTime} &ndash; {ranges[0].endTime}
              </span>
            ) : (
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                Unavailable
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
