/**
 * RRuleGenerator — Interactive RRULE builder for The Booking Kit documentation.
 *
 * Self-contained React component with no external dependencies beyond React itself.
 * Uses Starlight CSS variables for light/dark mode support.
 *
 * Embed in MDX with: <RRuleGenerator client:load />
 */

import { useState, useCallback, useMemo, useEffect } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS_OF_WEEK = [
  { value: "MO", label: "Mon" },
  { value: "TU", label: "Tue" },
  { value: "WE", label: "Wed" },
  { value: "TH", label: "Thu" },
  { value: "FR", label: "Fri" },
  { value: "SA", label: "Sat" },
  { value: "SU", label: "Sun" },
] as const;

type DayValue = (typeof DAYS_OF_WEEK)[number]["value"];

const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
type Frequency = (typeof FREQUENCIES)[number];

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
] as const;

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
] as const;

type Timezone = (typeof TIMEZONES)[number];

// ---------------------------------------------------------------------------
// Preset templates
// ---------------------------------------------------------------------------

interface Preset {
  label: string;
  frequency: Frequency;
  days: DayValue[];
  interval: number;
  startTime: string;
  endTime: string;
  byMonthDay?: string;
  byMonth?: number;
  count?: string;
  until?: string;
  exdate?: string;
}

const PRESETS: Record<string, Preset> = {
  "business-hours": {
    label: "Standard Business Hours (Mon-Fri 9am-5pm)",
    frequency: "WEEKLY",
    days: ["MO", "TU", "WE", "TH", "FR"],
    interval: 1,
    startTime: "09:00",
    endTime: "17:00",
  },
  "extended-hours": {
    label: "Extended Hours (Mon-Fri 8am-8pm)",
    frequency: "WEEKLY",
    days: ["MO", "TU", "WE", "TH", "FR"],
    interval: 1,
    startTime: "08:00",
    endTime: "20:00",
  },
  "weekends-only": {
    label: "Weekends Only (Sat-Sun 10am-6pm)",
    frequency: "WEEKLY",
    days: ["SA", "SU"],
    interval: 1,
    startTime: "10:00",
    endTime: "18:00",
  },
  "every-day": {
    label: "Every Day (7am-10pm)",
    frequency: "DAILY",
    days: [],
    interval: 1,
    startTime: "07:00",
    endTime: "22:00",
  },
  "mwf": {
    label: "Monday / Wednesday / Friday",
    frequency: "WEEKLY",
    days: ["MO", "WE", "FR"],
    interval: 1,
    startTime: "09:00",
    endTime: "17:00",
  },
  "tuth": {
    label: "Tuesday / Thursday",
    frequency: "WEEKLY",
    days: ["TU", "TH"],
    interval: 1,
    startTime: "09:00",
    endTime: "17:00",
  },
  "first-monday": {
    label: "First Monday of Month",
    frequency: "MONTHLY",
    days: ["MO"],
    interval: 1,
    startTime: "09:00",
    endTime: "17:00",
    byMonthDay: "",
  },
  "custom": {
    label: "Custom...",
    frequency: "WEEKLY",
    days: ["MO"],
    interval: 1,
    startTime: "09:00",
    endTime: "17:00",
  },
};

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface GeneratorState {
  preset: string;
  frequency: Frequency;
  days: DayValue[];
  interval: number;
  startTime: string;
  endTime: string;
  timezone: Timezone;
  count: string;
  until: string;
  byMonthDay: string;
  byMonth: string;
  exdate: string;
  showAdvanced: boolean;
}

const DEFAULT_STATE: GeneratorState = {
  preset: "business-hours",
  frequency: "WEEKLY",
  days: ["MO", "TU", "WE", "TH", "FR"],
  interval: 1,
  startTime: "09:00",
  endTime: "17:00",
  timezone: "America/New_York",
  count: "",
  until: "",
  byMonthDay: "",
  byMonth: "",
  exdate: "",
  showAdvanced: false,
};

// ---------------------------------------------------------------------------
// RRULE builder
// ---------------------------------------------------------------------------

function buildRRule(state: GeneratorState): string {
  // Build parts in iCalendar recommended order: FREQ first, then modifiers
  const parts: string[] = [`FREQ=${state.frequency}`];

  if (state.interval > 1) {
    parts.push(`INTERVAL=${state.interval}`);
  }

  if (state.frequency === "WEEKLY" && state.days.length > 0) {
    parts.push(`BYDAY=${state.days.join(",")}`);
  }

  if (state.frequency === "MONTHLY") {
    if (state.byMonthDay.trim()) {
      parts.push(`BYMONTHDAY=${state.byMonthDay.trim()}`);
    } else if (state.days.length > 0) {
      // e.g. "1MO" = first Monday of the month
      parts.push(`BYDAY=1${state.days[0]}`);
    }
  }

  if (state.frequency === "YEARLY") {
    if (state.byMonth.trim()) parts.push(`BYMONTH=${state.byMonth.trim()}`);
    if (state.byMonthDay.trim()) parts.push(`BYMONTHDAY=${state.byMonthDay.trim()}`);
  }

  // COUNT and UNTIL are mutually exclusive; COUNT wins if both are set
  if (state.count.trim() && !state.until.trim()) {
    const n = parseInt(state.count, 10);
    if (!isNaN(n) && n > 0) parts.push(`COUNT=${n}`);
  } else if (state.until.trim() && !state.count.trim()) {
    const d = new Date(state.until + "T00:00:00");
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear().toString();
      const mo = (d.getUTCMonth() + 1).toString().padStart(2, "0");
      const da = d.getUTCDate().toString().padStart(2, "0");
      parts.push(`UNTIL=${y}${mo}${da}T000000Z`);
    }
  }

  let rrule = parts.join(";");

  // EXDATE is a separate iCalendar line, not a RRULE parameter
  if (state.exdate.trim()) {
    rrule += `\nEXDATE:${state.exdate.trim()}`;
  }

  return rrule;
}

// ---------------------------------------------------------------------------
// Human-readable description
// ---------------------------------------------------------------------------

function buildDescription(state: GeneratorState): string {
  const dayOrder: DayValue[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const dayNames: Record<DayValue, string> = {
    MO: "Monday",
    TU: "Tuesday",
    WE: "Wednesday",
    TH: "Thursday",
    FR: "Friday",
    SA: "Saturday",
    SU: "Sunday",
  };

  const sortedDays = [...state.days].sort(
    (a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b)
  );

  function formatTime(t: string): string {
    const [hStr, mStr] = t.split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? `${h12}:00 ${suffix}` : `${h12}:${mStr} ${suffix}`;
  }

  function joinDays(days: string[]): string {
    if (days.length === 0) return "no days";
    if (days.length === 1) return days[0];
    if (days.length === 2) return `${days[0]} and ${days[1]}`;
    const last = days[days.length - 1];
    return `${days.slice(0, -1).join(", ")}, and ${last}`;
  }

  const startFmt = formatTime(state.startTime);
  const endFmt = formatTime(state.endTime);
  const timeRange = `from ${startFmt} to ${endFmt}`;
  const intervalStr = state.interval > 1 ? ` ${state.interval}` : "";

  let base = "";

  switch (state.frequency) {
    case "DAILY":
      base = `Every${intervalStr} day`;
      break;
    case "WEEKLY": {
      const names = sortedDays.map((d) => dayNames[d]);
      base =
        state.interval > 1
          ? `Every ${state.interval} weeks on ${joinDays(names)}`
          : `Every week on ${joinDays(names)}`;
      break;
    }
    case "MONTHLY": {
      if (state.byMonthDay.trim()) {
        base = `Every${intervalStr} month on day ${state.byMonthDay.trim()}`;
      } else if (sortedDays.length > 0) {
        base = `Every${intervalStr} month on the first ${dayNames[sortedDays[0]]}`;
      } else {
        base = `Every${intervalStr} month`;
      }
      break;
    }
    case "YEARLY": {
      const monthName = state.byMonth
        ? MONTHS.find((m) => m.value === parseInt(state.byMonth, 10))?.label ?? ""
        : "";
      const dayPart = state.byMonthDay ? ` on day ${state.byMonthDay}` : "";
      base = monthName
        ? `Every${intervalStr} year in ${monthName}${dayPart}`
        : `Every${intervalStr} year`;
      break;
    }
  }

  let suffix = "";
  if (state.count.trim()) {
    const n = parseInt(state.count, 10);
    if (!isNaN(n)) suffix = `, ending after ${n} occurrence${n !== 1 ? "s" : ""}`;
  } else if (state.until.trim()) {
    suffix = `, until ${state.until}`;
  }

  return `${base}, ${timeRange}${suffix}.`;
}

// ---------------------------------------------------------------------------
// Occurrence preview
// ---------------------------------------------------------------------------

/**
 * Generates the next N occurrence dates purely from the RRULE parameters
 * without requiring the `rrule` npm package. Handles DAILY, WEEKLY, MONTHLY,
 * YEARLY with BYDAY, BYMONTHDAY, COUNT, and UNTIL.
 */
function getNextOccurrences(state: GeneratorState, count = 5): Date[] {
  const results: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startH = parseInt(state.startTime.split(":")[0], 10);
  const startM = parseInt(state.startTime.split(":")[1], 10);

  const dayOrder: DayValue[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

  const selectedDayIndexes = state.days.map((d) => dayOrder.indexOf(d));

  let maxCount = state.count.trim() ? parseInt(state.count, 10) : Infinity;
  if (isNaN(maxCount) || maxCount <= 0) maxCount = Infinity;

  let untilDate: Date | null = null;
  if (state.until.trim()) {
    untilDate = new Date(state.until + "T23:59:59");
  }

  const limitDate = new Date(today);
  limitDate.setFullYear(limitDate.getFullYear() + 2);

  // We iterate day-by-day for WEEKLY/DAILY, month-by-month for MONTHLY/YEARLY
  const cursor = new Date(today);
  let iterations = 0;
  const maxIterations = 800;

  while (results.length < count && iterations < maxIterations) {
    iterations++;

    let matches = false;

    switch (state.frequency) {
      case "DAILY": {
        // Every interval days
        const diff = Math.floor(
          (cursor.getTime() - today.getTime()) / 86400000
        );
        if (diff % state.interval === 0) matches = true;
        break;
      }
      case "WEEKLY": {
        const weekDiff = Math.floor(
          (cursor.getTime() - today.getTime()) / (7 * 86400000)
        );
        const dayOfWeek = cursor.getDay(); // 0=Sun
        if (
          weekDiff % state.interval === 0 &&
          selectedDayIndexes.includes(dayOfWeek)
        ) {
          matches = true;
        }
        break;
      }
      case "MONTHLY": {
        const startDate = new Date(today);
        const monthDiff =
          (cursor.getFullYear() - startDate.getFullYear()) * 12 +
          (cursor.getMonth() - startDate.getMonth());

        if (monthDiff % state.interval === 0) {
          if (state.byMonthDay.trim()) {
            const dom = parseInt(state.byMonthDay.trim(), 10);
            if (cursor.getDate() === dom) matches = true;
          } else if (state.days.length > 0) {
            // First occurrence of the specified day in the month
            const targetDayOfWeek = dayOrder.indexOf(state.days[0]);
            const firstOfMonth = new Date(
              cursor.getFullYear(),
              cursor.getMonth(),
              1
            );
            const firstOccurrence = new Date(firstOfMonth);
            while (firstOccurrence.getDay() !== targetDayOfWeek) {
              firstOccurrence.setDate(firstOccurrence.getDate() + 1);
            }
            if (cursor.getDate() === firstOccurrence.getDate()) matches = true;
          }
        }
        break;
      }
      case "YEARLY": {
        const yearDiff = cursor.getFullYear() - today.getFullYear();
        if (yearDiff % state.interval === 0) {
          if (state.byMonth.trim()) {
            const targetMonth = parseInt(state.byMonth.trim(), 10) - 1;
            if (cursor.getMonth() === targetMonth) {
              if (state.byMonthDay.trim()) {
                const dom = parseInt(state.byMonthDay.trim(), 10);
                if (cursor.getDate() === dom) matches = true;
              } else {
                if (cursor.getDate() === 1) matches = true;
              }
            }
          } else {
            if (
              cursor.getMonth() === today.getMonth() &&
              cursor.getDate() === today.getDate()
            ) {
              matches = true;
            }
          }
        }
        break;
      }
    }

    if (matches) {
      const occurrence = new Date(cursor);
      occurrence.setHours(startH, startM, 0, 0);

      if (untilDate && occurrence > untilDate) break;
      if (occurrence > limitDate) break;

      results.push(occurrence);
      if (results.length >= (isFinite(maxCount) ? Math.min(maxCount, count) : count)) break;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Copy-to-clipboard hook
// ---------------------------------------------------------------------------

function useCopyButton(): [string | null, (text: string, id: string) => void] {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  return [copiedId, copy];
}

// ---------------------------------------------------------------------------
// Styles (CSS-in-JS via style objects + a single injected <style> tag)
// ---------------------------------------------------------------------------

const COMPONENT_STYLES = `
.rrule-gen {
  font-family: var(--sl-font, system-ui, sans-serif);
  color: var(--sl-color-text, #1a1a1a);
  background: var(--sl-color-bg, #fff);
  border: 1px solid var(--sl-color-hairline, #e2e8f0);
  border-radius: 10px;
  overflow: hidden;
  margin: 1.5rem 0;
}

.rrule-gen__header {
  background: var(--sl-color-bg-inline-code, #f1f5f9);
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--sl-color-hairline, #e2e8f0);
}

.rrule-gen__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.125rem;
  color: var(--sl-color-text-accent, var(--sl-color-accent, #7c3aed));
}

.rrule-gen__subtitle {
  font-size: 0.8rem;
  color: var(--sl-color-gray-3, #64748b);
  margin: 0;
}

.rrule-gen__body {
  padding: 1.25rem;
  display: grid;
  gap: 1.25rem;
}

.rrule-gen__section {
  display: grid;
  gap: 0.6rem;
}

.rrule-gen__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

@media (max-width: 560px) {
  .rrule-gen__row {
    grid-template-columns: 1fr;
  }
}

.rrule-gen__label {
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sl-color-gray-3, #64748b);
  margin-bottom: 0.25rem;
  display: block;
}

.rrule-gen__select,
.rrule-gen__input {
  width: 100%;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--sl-color-hairline, #cbd5e1);
  border-radius: 6px;
  background: var(--sl-color-bg, #fff);
  color: var(--sl-color-text, #1a1a1a);
  font-size: 0.88rem;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.15s;
  outline: none;
}

.rrule-gen__select:focus,
.rrule-gen__input:focus {
  border-color: var(--sl-color-accent, #7c3aed);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--sl-color-accent, #7c3aed) 15%, transparent);
}

.rrule-gen__days {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.rrule-gen__day-btn {
  padding: 0.3rem 0.6rem;
  border: 1.5px solid var(--sl-color-hairline, #cbd5e1);
  border-radius: 5px;
  background: var(--sl-color-bg, #fff);
  color: var(--sl-color-text, #1a1a1a);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s;
  user-select: none;
}

.rrule-gen__day-btn:hover {
  border-color: var(--sl-color-accent, #7c3aed);
  color: var(--sl-color-accent, #7c3aed);
}

.rrule-gen__day-btn--active {
  background: var(--sl-color-accent, #7c3aed);
  border-color: var(--sl-color-accent, #7c3aed);
  color: #fff;
}

.rrule-gen__divider {
  height: 1px;
  background: var(--sl-color-hairline, #e2e8f0);
  margin: 0 -1.25rem;
}

.rrule-gen__advanced-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  background: none;
  border: none;
  color: var(--sl-color-accent, #7c3aed);
  font-size: 0.83rem;
  font-weight: 600;
  font-family: inherit;
  padding: 0;
}

.rrule-gen__advanced-toggle:hover {
  opacity: 0.8;
}

.rrule-gen__caret {
  display: inline-block;
  transition: transform 0.2s;
  font-size: 0.7rem;
}

.rrule-gen__caret--open {
  transform: rotate(90deg);
}

.rrule-gen__output {
  background: var(--sl-color-bg-inline-code, #f8fafc);
  border-top: 1px solid var(--sl-color-hairline, #e2e8f0);
  padding: 1.25rem;
  display: grid;
  gap: 1rem;
}

.rrule-gen__output-block {
  display: grid;
  gap: 0.35rem;
}

.rrule-gen__output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.rrule-gen__output-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--sl-color-gray-3, #64748b);
}

.rrule-gen__copy-btn {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.18rem 0.55rem;
  border: 1px solid var(--sl-color-hairline, #cbd5e1);
  border-radius: 4px;
  background: var(--sl-color-bg, #fff);
  color: var(--sl-color-text, #1a1a1a);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.12s;
  white-space: nowrap;
}

.rrule-gen__copy-btn:hover {
  background: var(--sl-color-accent, #7c3aed);
  border-color: var(--sl-color-accent, #7c3aed);
  color: #fff;
}

.rrule-gen__copy-btn--copied {
  background: #16a34a;
  border-color: #16a34a;
  color: #fff;
}

.rrule-gen__code {
  background: var(--sl-color-bg, #fff);
  border: 1px solid var(--sl-color-hairline, #e2e8f0);
  border-radius: 6px;
  padding: 0.65rem 0.85rem;
  font-family: var(--sl-font-mono, 'Menlo', 'Consolas', monospace);
  font-size: 0.8rem;
  line-height: 1.6;
  white-space: pre;
  overflow-x: auto;
  color: var(--sl-color-text, #1a1a1a);
}

.rrule-gen__description {
  font-size: 0.88rem;
  color: var(--sl-color-text, #1a1a1a);
  line-height: 1.55;
  padding: 0.6rem 0.85rem;
  background: color-mix(in srgb, var(--sl-color-accent, #7c3aed) 8%, transparent);
  border-left: 3px solid var(--sl-color-accent, #7c3aed);
  border-radius: 0 6px 6px 0;
}

.rrule-gen__occurrences {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
}

.rrule-gen__occurrence {
  font-family: var(--sl-font-mono, 'Menlo', 'Consolas', monospace);
  font-size: 0.8rem;
  color: var(--sl-color-text, #1a1a1a);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  background: var(--sl-color-bg, #fff);
  border: 1px solid var(--sl-color-hairline, #e2e8f0);
}

.rrule-gen__occurrence::before {
  content: "– ";
  color: var(--sl-color-accent, #7c3aed);
  font-weight: 700;
}

.rrule-gen__empty {
  font-size: 0.82rem;
  color: var(--sl-color-gray-3, #94a3b8);
  font-style: italic;
}

.rrule-gen__warning {
  font-size: 0.8rem;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 5px;
  padding: 0.4rem 0.65rem;
}
`;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CopyButtonProps {
  text: string;
  id: string;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}

function CopyButton({ text, id, copiedId, onCopy }: CopyButtonProps) {
  const isCopied = copiedId === id;
  return (
    <button
      className={`rrule-gen__copy-btn${isCopied ? " rrule-gen__copy-btn--copied" : ""}`}
      onClick={() => onCopy(text, id)}
      type="button"
      aria-label="Copy to clipboard"
    >
      {isCopied ? "Copied!" : "Copy"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RRuleGenerator() {
  const [state, setState] = useState<GeneratorState>(DEFAULT_STATE);
  const [copiedId, onCopy] = useCopyButton();

  // Inject component styles once
  useEffect(() => {
    const id = "rrule-gen-styles";
    if (!document.getElementById(id)) {
      const el = document.createElement("style");
      el.id = id;
      el.textContent = COMPONENT_STYLES;
      document.head.appendChild(el);
    }
  }, []);

  // Derived outputs
  const rruleString = useMemo(() => buildRRule(state), [state]);
  const description = useMemo(() => buildDescription(state), [state]);
  const occurrences = useMemo(() => getNextOccurrences(state, 5), [state]);

  const availabilityRuleInput = useMemo(() => {
    const lines: string[] = ["{"];
    lines.push(`  rrule: "${rruleString.replace(/\n/g, "\\n")}",`);
    lines.push(`  startTime: "${state.startTime}",`);
    lines.push(`  endTime: "${state.endTime}",`);
    lines.push(`  timezone: "${state.timezone}",`);
    lines.push("}");
    return lines.join("\n");
  }, [rruleString, state.startTime, state.endTime, state.timezone]);

  function formatOccurrence(d: Date): string {
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const h = d.getHours();
    const m = d.getMinutes();
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const startStr = `${h12}:${m.toString().padStart(2, "0")} ${suffix}`;

    const endH = parseInt(state.endTime.split(":")[0], 10);
    const endM = parseInt(state.endTime.split(":")[1], 10);
    const endSuffix = endH >= 12 ? "PM" : "AM";
    const endH12 = endH === 0 ? 12 : endH > 12 ? endH - 12 : endH;
    const endStr = `${endH12}:${endM.toString().padStart(2, "0")} ${endSuffix}`;

    return `${weekdays[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} (${startStr} – ${endStr})`;
  }

  // Handlers
  function applyPreset(key: string) {
    const p = PRESETS[key];
    if (!p) return;
    setState((s) => ({
      ...s,
      preset: key,
      frequency: p.frequency,
      days: p.days,
      interval: p.interval,
      startTime: p.startTime,
      endTime: p.endTime,
      byMonthDay: p.byMonthDay ?? "",
      byMonth: p.byMonth?.toString() ?? "",
      count: p.count ?? "",
      until: p.until ?? "",
      exdate: p.exdate ?? "",
    }));
  }

  function toggleDay(day: DayValue) {
    setState((s) => {
      const has = s.days.includes(day);
      const next = has ? s.days.filter((d) => d !== day) : [...s.days, day];
      return { ...s, days: next, preset: "custom" };
    });
  }

  function set<K extends keyof GeneratorState>(key: K, value: GeneratorState[K]) {
    setState((s) => ({ ...s, [key]: value, preset: key === "preset" ? (value as string) : "custom" }));
  }

  const hasWeeklyDayWarning =
    state.frequency === "WEEKLY" && state.days.length === 0;
  const hasBothCountAndUntil = state.count.trim() !== "" && state.until.trim() !== "";

  return (
    <div className="rrule-gen" role="region" aria-label="RRULE Generator">
      {/* Header */}
      <div className="rrule-gen__header">
        <p className="rrule-gen__title">RRULE Generator</p>
        <p className="rrule-gen__subtitle">
          Build an iCalendar RRULE for use with{" "}
          <code>AvailabilityRuleInput</code> in @thebookingkit/core
        </p>
      </div>

      <div className="rrule-gen__body">
        {/* Preset */}
        <div className="rrule-gen__section">
          <label className="rrule-gen__label" htmlFor="rg-preset">
            Preset Template
          </label>
          <select
            id="rg-preset"
            className="rrule-gen__select"
            value={state.preset}
            onChange={(e) => applyPreset(e.target.value)}
          >
            {Object.entries(PRESETS).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rrule-gen__divider" />

        {/* Frequency + Interval */}
        <div className="rrule-gen__row">
          <div className="rrule-gen__section">
            <label className="rrule-gen__label" htmlFor="rg-freq">
              Frequency
            </label>
            <select
              id="rg-freq"
              className="rrule-gen__select"
              value={state.frequency}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  frequency: e.target.value as Frequency,
                  preset: "custom",
                  days: e.target.value === "WEEKLY" ? s.days : [],
                }))
              }
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div className="rrule-gen__section">
            <label className="rrule-gen__label" htmlFor="rg-interval">
              Interval (every N)
            </label>
            <input
              id="rg-interval"
              type="number"
              min="1"
              max="99"
              className="rrule-gen__input"
              value={state.interval}
              onChange={(e) => {
                const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                setState((s) => ({ ...s, interval: v, preset: "custom" }));
              }}
            />
          </div>
        </div>

        {/* Day selector — only for WEEKLY and MONTHLY */}
        {(state.frequency === "WEEKLY" || state.frequency === "MONTHLY") && (
          <div className="rrule-gen__section">
            <span className="rrule-gen__label">
              {state.frequency === "MONTHLY"
                ? "Day of Week (first occurrence in month)"
                : "Days of Week"}
            </span>
            <div className="rrule-gen__days" role="group" aria-label="Days of week">
              {DAYS_OF_WEEK.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={`rrule-gen__day-btn${
                    state.days.includes(d.value)
                      ? " rrule-gen__day-btn--active"
                      : ""
                  }`}
                  onClick={() => toggleDay(d.value)}
                  aria-pressed={state.days.includes(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {hasWeeklyDayWarning && (
              <p className="rrule-gen__warning">
                Select at least one day for a WEEKLY rule.
              </p>
            )}
          </div>
        )}

        {/* Time range + Timezone */}
        <div className="rrule-gen__row">
          <div className="rrule-gen__section">
            <label className="rrule-gen__label" htmlFor="rg-start">
              Start Time
            </label>
            <input
              id="rg-start"
              type="time"
              className="rrule-gen__input"
              value={state.startTime}
              onChange={(e) =>
                setState((s) => ({ ...s, startTime: e.target.value, preset: "custom" }))
              }
            />
          </div>
          <div className="rrule-gen__section">
            <label className="rrule-gen__label" htmlFor="rg-end">
              End Time
            </label>
            <input
              id="rg-end"
              type="time"
              className="rrule-gen__input"
              value={state.endTime}
              onChange={(e) =>
                setState((s) => ({ ...s, endTime: e.target.value, preset: "custom" }))
              }
            />
          </div>
        </div>

        <div className="rrule-gen__section">
          <label className="rrule-gen__label" htmlFor="rg-tz">
            Timezone
          </label>
          <select
            id="rg-tz"
            className="rrule-gen__select"
            value={state.timezone}
            onChange={(e) =>
              setState((s) => ({ ...s, timezone: e.target.value as Timezone }))
            }
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        {/* Advanced options */}
        <div className="rrule-gen__section">
          <button
            type="button"
            className="rrule-gen__advanced-toggle"
            onClick={() => setState((s) => ({ ...s, showAdvanced: !s.showAdvanced }))}
            aria-expanded={state.showAdvanced}
          >
            <span
              className={`rrule-gen__caret${state.showAdvanced ? " rrule-gen__caret--open" : ""}`}
            >
              &#9658;
            </span>
            Advanced Options
          </button>

          {state.showAdvanced && (
            <div style={{ display: "grid", gap: "0.85rem", marginTop: "0.5rem" }}>
              <div className="rrule-gen__row">
                <div className="rrule-gen__section">
                  <label className="rrule-gen__label" htmlFor="rg-count">
                    End After (COUNT occurrences)
                  </label>
                  <input
                    id="rg-count"
                    type="number"
                    min="1"
                    placeholder="e.g. 10"
                    className="rrule-gen__input"
                    value={state.count}
                    onChange={(e) =>
                      setState((s) => ({ ...s, count: e.target.value, preset: "custom" }))
                    }
                  />
                </div>
                <div className="rrule-gen__section">
                  <label className="rrule-gen__label" htmlFor="rg-until">
                    End By Date (UNTIL)
                  </label>
                  <input
                    id="rg-until"
                    type="date"
                    className="rrule-gen__input"
                    value={state.until}
                    onChange={(e) =>
                      setState((s) => ({ ...s, until: e.target.value, preset: "custom" }))
                    }
                  />
                </div>
              </div>

              {hasBothCountAndUntil && (
                <p className="rrule-gen__warning">
                  COUNT and UNTIL cannot both be set. Only COUNT will be used.
                </p>
              )}

              {(state.frequency === "MONTHLY" || state.frequency === "YEARLY") && (
                <div className="rrule-gen__section">
                  <label className="rrule-gen__label" htmlFor="rg-bymonthday">
                    By Day of Month (BYMONTHDAY, e.g. 1 or 15)
                  </label>
                  <input
                    id="rg-bymonthday"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="e.g. 15"
                    className="rrule-gen__input"
                    value={state.byMonthDay}
                    onChange={(e) =>
                      setState((s) => ({ ...s, byMonthDay: e.target.value, preset: "custom" }))
                    }
                  />
                </div>
              )}

              {state.frequency === "YEARLY" && (
                <div className="rrule-gen__section">
                  <label className="rrule-gen__label" htmlFor="rg-bymonth">
                    By Month (BYMONTH)
                  </label>
                  <select
                    id="rg-bymonth"
                    className="rrule-gen__select"
                    value={state.byMonth}
                    onChange={(e) =>
                      setState((s) => ({ ...s, byMonth: e.target.value, preset: "custom" }))
                    }
                  >
                    <option value="">— Any month —</option>
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="rrule-gen__section">
                <label className="rrule-gen__label" htmlFor="rg-exdate">
                  Exclude Dates (EXDATE — comma-separated UTC, e.g. 20260325T000000Z)
                </label>
                <input
                  id="rg-exdate"
                  type="text"
                  placeholder="20260325T000000Z,20260401T000000Z"
                  className="rrule-gen__input"
                  value={state.exdate}
                  onChange={(e) =>
                    setState((s) => ({ ...s, exdate: e.target.value, preset: "custom" }))
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Output section */}
      <div className="rrule-gen__output">
        {/* RRULE string */}
        <div className="rrule-gen__output-block">
          <div className="rrule-gen__output-header">
            <span className="rrule-gen__output-label">RRULE String</span>
            <CopyButton
              text={rruleString}
              id="rrule"
              copiedId={copiedId}
              onCopy={onCopy}
            />
          </div>
          <pre className="rrule-gen__code">{rruleString}</pre>
        </div>

        {/* AvailabilityRuleInput */}
        <div className="rrule-gen__output-block">
          <div className="rrule-gen__output-header">
            <span className="rrule-gen__output-label">AvailabilityRuleInput</span>
            <CopyButton
              text={availabilityRuleInput}
              id="arInput"
              copiedId={copiedId}
              onCopy={onCopy}
            />
          </div>
          <pre className="rrule-gen__code">{availabilityRuleInput}</pre>
        </div>

        {/* Description */}
        <div className="rrule-gen__output-block">
          <div className="rrule-gen__output-header">
            <span className="rrule-gen__output-label">Human-Readable Description</span>
          </div>
          <div className="rrule-gen__description">{description}</div>
        </div>

        {/* Next 5 occurrences */}
        <div className="rrule-gen__output-block">
          <div className="rrule-gen__output-header">
            <span className="rrule-gen__output-label">Next 5 Occurrences</span>
          </div>
          {occurrences.length === 0 ? (
            <p className="rrule-gen__empty">
              No upcoming occurrences found — check your settings.
            </p>
          ) : (
            <ul className="rrule-gen__occurrences" aria-label="Next 5 occurrences">
              {occurrences.map((d, i) => (
                <li key={i} className="rrule-gen__occurrence">
                  {formatOccurrence(d)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
