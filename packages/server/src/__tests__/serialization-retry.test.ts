import { describe, it, expect, vi } from "vitest";
import {
  withSerializableRetry,
  BookingConflictError,
  SerializationRetryExhaustedError,
} from "../index.js";

function makePostgresError(code: string, message = "pg error") {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

describe("withSerializableRetry", () => {
  it("returns the result on success", async () => {
    const result = await withSerializableRetry(async () => ({ id: "123" }));
    expect(result).toEqual({ id: "123" });
  });

  it("throws BookingConflictError on exclusion violation (23P01)", async () => {
    const fn = vi.fn().mockRejectedValue(makePostgresError("23P01"));

    await expect(withSerializableRetry(fn)).rejects.toThrow(
      BookingConflictError,
    );
    // Should NOT retry on exclusion violation
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on serialization failure (40001) and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makePostgresError("40001"))
      .mockRejectedValueOnce(makePostgresError("40001"))
      .mockResolvedValueOnce({ id: "456" });

    const result = await withSerializableRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1, // fast for tests
    });

    expect(result).toEqual({ id: "456" });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws SerializationRetryExhaustedError when all retries fail", async () => {
    const fn = vi.fn().mockRejectedValue(makePostgresError("40001"));

    await expect(
      withSerializableRetry(fn, { maxRetries: 2, baseDelayMs: 1 }),
    ).rejects.toThrow(SerializationRetryExhaustedError);

    // Initial attempt + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("rethrows unknown errors without retrying", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("connection refused"));

    await expect(withSerializableRetry(fn)).rejects.toThrow(
      "connection refused",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses default options (3 retries, 50ms base delay)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makePostgresError("40001"))
      .mockResolvedValueOnce("ok");

    const result = await withSerializableRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  describe("driver errors wrapped by Drizzle (≥ 0.44 DrizzleQueryError)", () => {
    // Drizzle rethrows as `new DrizzleQueryError(query, params, cause)`:
    // message "Failed query: …", no `code`, the postgres error as `cause`.
    function wrapLikeDrizzle(cause: Error) {
      return new Error("Failed query: insert into \"bookings\" …", { cause });
    }

    it("maps a wrapped exclusion violation to BookingConflictError", async () => {
      const fn = vi.fn().mockRejectedValue(wrapLikeDrizzle(makePostgresError("23P01")));

      await expect(withSerializableRetry(fn)).rejects.toThrow(BookingConflictError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("retries a wrapped serialization failure", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(wrapLikeDrizzle(makePostgresError("40001")))
        .mockResolvedValueOnce("ok");

      expect(await withSerializableRetry(fn, { baseDelayMs: 1 })).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("ignores a wrapper's non-SQLSTATE code in favour of the cause", async () => {
      const wrapper = Object.assign(wrapLikeDrizzle(makePostgresError("23P01")), {
        code: "ERR_QUERY_FAILED",
      });
      const fn = vi.fn().mockRejectedValue(wrapper);

      await expect(withSerializableRetry(fn)).rejects.toThrow(BookingConflictError);
    });
  });
});
