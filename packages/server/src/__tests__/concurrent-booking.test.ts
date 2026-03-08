import { describe, it, expect } from "vitest";
import {
  withSerializableRetry,
  BookingConflictError,
  SerializationRetryExhaustedError,
} from "../index.js";

/**
 * Concurrent booking simulation tests.
 *
 * These tests simulate the load test from E01-S04:
 * "50 concurrent booking attempts for the same slot yields exactly 1 confirmed
 *  booking, 0 unhandled serialization errors, and all other callers receive
 *  a clear conflict response within 2 seconds."
 *
 * Since we can't connect to a real Postgres in unit tests, we simulate the
 * database behavior with an in-memory "slot lock" that mimics the EXCLUDE
 * constraint (SQLSTATE 23P01) and serialization failures (SQLSTATE 40001).
 */

/** Simulates a Postgres error with a SQLSTATE code */
class PgError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "PgError";
    this.code = code;
  }
}

describe("Concurrent Booking Simulation (E01-S04 Load Test)", () => {
  it("50 concurrent attempts for the same slot: exactly 1 success, rest get conflict", async () => {
    // Simulate a database slot that can only be booked once.
    // The first successful INSERT wins; subsequent attempts get exclusion_violation.
    let slotBooked = false;
    let serializationFailureCount = 0;
    const maxSimulatedSerializationFailures = 5; // simulate some contention

    const attemptBooking = async (attemptId: number): Promise<string> => {
      return withSerializableRetry(
        async () => {
          // Simulate random serialization failures under contention
          if (
            !slotBooked &&
            serializationFailureCount < maxSimulatedSerializationFailures &&
            Math.random() < 0.3
          ) {
            serializationFailureCount++;
            throw new PgError("serialization failure", "40001");
          }

          // Simulate the EXCLUDE constraint check
          if (slotBooked) {
            throw new PgError(
              "conflicting key value violates exclusion constraint",
              "23P01",
            );
          }

          // Race: first writer wins
          slotBooked = true;
          return `booking-${attemptId}`;
        },
        { maxRetries: 3, baseDelayMs: 10 },
      );
    };

    const CONCURRENCY = 50;
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, (_, i) => attemptBooking(i)),
    );

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures = results.filter((r) => r.status === "rejected");

    // Exactly 1 booking should succeed
    expect(successes.length).toBe(1);

    // All failures should be BookingConflictError (not unhandled errors)
    for (const failure of failures) {
      if (failure.status === "rejected") {
        expect(failure.reason).toBeInstanceOf(BookingConflictError);
      }
    }

    // Zero unhandled serialization errors
    const serializationErrors = failures.filter(
      (f) =>
        f.status === "rejected" &&
        f.reason instanceof SerializationRetryExhaustedError,
    );
    expect(serializationErrors.length).toBe(0);
  });

  it("completes all 50 attempts within 2 seconds", async () => {
    let slotBooked = false;

    const attemptBooking = async (attemptId: number): Promise<string> => {
      return withSerializableRetry(
        async () => {
          if (slotBooked) {
            throw new PgError(
              "conflicting key value violates exclusion constraint",
              "23P01",
            );
          }
          slotBooked = true;
          return `booking-${attemptId}`;
        },
        { maxRetries: 3, baseDelayMs: 10 },
      );
    };

    const start = Date.now();

    await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) => attemptBooking(i)),
    );

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  it("serialization failures are retried and can succeed on a different slot", async () => {
    let attempt = 0;

    const result = await withSerializableRetry(
      async () => {
        attempt++;
        if (attempt <= 2) {
          throw new PgError("serialization failure", "40001");
        }
        return "booking-success";
      },
      { maxRetries: 3, baseDelayMs: 10 },
    );

    expect(result).toBe("booking-success");
    expect(attempt).toBe(3);
  });

  it("retries are exhausted after maxRetries serialization failures", async () => {
    const fn = () =>
      withSerializableRetry(
        async () => {
          throw new PgError("serialization failure", "40001");
        },
        { maxRetries: 3, baseDelayMs: 10 },
      );

    await expect(fn()).rejects.toThrow(SerializationRetryExhaustedError);
  });

  it("exclusion violation (slot taken) is never retried", async () => {
    let callCount = 0;

    const fn = () =>
      withSerializableRetry(
        async () => {
          callCount++;
          throw new PgError("exclusion constraint", "23P01");
        },
        { maxRetries: 3, baseDelayMs: 10 },
      );

    await expect(fn()).rejects.toThrow(BookingConflictError);
    // Should NOT have retried — only 1 call
    expect(callCount).toBe(1);
  });
});
