import { useState, useEffect, useCallback } from "react";
import type { Slot } from "@slotkit/core";

/** Parameters for the useAvailability hook */
export interface UseAvailabilityParams {
  /** Provider ID to fetch availability for */
  providerId: string;
  /** Selected date to get slots for */
  date: Date | null;
  /** Slot duration in minutes */
  duration?: number;
  /** Customer's IANA timezone */
  timezone: string;
  /** Buffer time in minutes before bookings */
  bufferBefore?: number;
  /** Buffer time in minutes after bookings */
  bufferAfter?: number;
  /** Event type ID for event-specific availability */
  eventTypeId?: string;
  /** API endpoint base URL (default: "/api") */
  apiBase?: string;
}

/** Return value from the useAvailability hook */
export interface UseAvailabilityReturn {
  /** Available time slots */
  slots: Slot[];
  /** Whether slots are being loaded */
  isLoading: boolean;
  /** Error if the request failed */
  error: Error | null;
  /** Manually refetch availability */
  refetch: () => void;
}

/**
 * React hook for fetching available time slots.
 *
 * This is the primary integration point for customer-facing booking UIs.
 * It fetches available slots from the API and returns reactive state.
 *
 * @example
 * ```tsx
 * const { slots, isLoading, error } = useAvailability({
 *   providerId: "provider-uuid",
 *   date: selectedDate,
 *   duration: 30,
 *   timezone: "America/New_York",
 * });
 * ```
 */
export function useAvailability(
  params: UseAvailabilityParams,
): UseAvailabilityReturn {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const { providerId, date, duration, timezone, bufferBefore, bufferAfter, eventTypeId, apiBase = "/api" } = params;

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!date || !providerId) {
      setSlots([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const dateStr = date.toISOString().split("T")[0];

    const searchParams = new URLSearchParams({
      providerId,
      date: dateStr,
      timezone,
    });

    if (duration) searchParams.set("duration", String(duration));
    if (bufferBefore) searchParams.set("bufferBefore", String(bufferBefore));
    if (bufferAfter) searchParams.set("bufferAfter", String(bufferAfter));
    if (eventTypeId) searchParams.set("eventTypeId", eventTypeId);

    fetch(`${apiBase}/slots?${searchParams.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as Record<string, string>)) as Record<string, string>;
          throw new Error(body.error || `Failed to fetch slots (${res.status})`);
        }
        return res.json() as Promise<{ slots?: Slot[] }>;
      })
      .then((data: { slots?: Slot[] }) => {
        if (!cancelled) {
          setSlots(data.slots ?? []);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setSlots([]);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [providerId, date?.toISOString(), duration, timezone, bufferBefore, bufferAfter, eventTypeId, apiBase, fetchKey]);

  return { slots, isLoading, error, refetch };
}
