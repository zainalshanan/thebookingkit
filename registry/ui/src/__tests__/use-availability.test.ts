import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAvailability } from "../hooks/use-availability.js";

describe("useAvailability", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns initial loading state and then slots on success", async () => {
    const mockSlots = [
      {
        startTime: "2026-03-09T09:00:00Z",
        endTime: "2026-03-09T09:30:00Z",
        localStart: "2026-03-09T09:00:00",
        localEnd: "2026-03-09T09:30:00",
      },
    ];

    (vi.mocked(fetch) as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ slots: mockSlots }),
    });

    const date = new Date("2026-03-09");
    const { result } = renderHook(() =>
      useAvailability({
        providerId: "p1",
        date,
        timezone: "UTC",
      })
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.slots).toEqual(mockSlots);
    expect(result.current.error).toBeNull();

    // Verify fetch URL
    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(fetchCall).toContain("providerId=p1");
    expect(fetchCall).toContain("date=2026-03-09");
    expect(fetchCall).toContain("timezone=UTC");
  });

  it("handles fetch errors", async () => {
    (vi.mocked(fetch) as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server error" }),
    });

    const date = new Date("2026-03-09");
    const { result } = renderHook(() =>
      useAvailability({
        providerId: "p1",
        date,
        timezone: "UTC",
      })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error?.message).toBe("Server error");
    expect(result.current.slots).toEqual([]);
  });

  it("does not fetch if date is missing", () => {
    renderHook(() =>
      useAvailability({
        providerId: "p1",
        date: null,
        timezone: "UTC",
      })
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
