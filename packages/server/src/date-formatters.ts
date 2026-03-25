/**
 * Shared date/time formatting utilities used across server modules.
 *
 * These are locale-aware formatters built on the Intl APIs available
 * in all modern runtimes (Node.js 18+, Deno, Bun, Edge runtimes).
 */

/**
 * Format a Date to a locale time string (e.g. "2:30 PM").
 *
 * @param date - The date to format
 * @param timeZone - Optional IANA timezone identifier
 * @returns Locale-formatted time string
 */
export function formatTime(date: Date, timeZone?: string): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * Format a Date to a locale date string (e.g. "Wednesday, March 25, 2026").
 *
 * @param date - The date to format
 * @param timeZone - Optional IANA timezone identifier
 * @returns Locale-formatted date string
 */
export function formatDate(date: Date, timeZone?: string): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
}
