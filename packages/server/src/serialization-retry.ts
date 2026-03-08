import {
  BookingConflictError,
  SerializationRetryExhaustedError,
} from "@slotkit/core";

/** Options for the serialization retry wrapper */
export interface SerializableRetryOptions {
  /** Maximum number of retries on serialization failure. Default: 3 */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff. Default: 50 */
  baseDelayMs?: number;
}

/**
 * Postgres SQLSTATE codes we handle:
 * - 40001: serialization_failure (SERIALIZABLE transaction contention)
 * - 23P01: exclusion_violation (EXCLUDE constraint — slot already taken)
 */
const SERIALIZATION_FAILURE = "40001";
const EXCLUSION_VIOLATION = "23P01";

/**
 * Check if an error is a Postgres error with a specific code.
 */
function getPostgresErrorCode(error: unknown): string | undefined {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
}

/**
 * Wraps a database operation in serialization retry logic.
 *
 * If the operation fails with SQLSTATE 40001 (serialization_failure),
 * retries up to `maxRetries` times with jittered exponential backoff.
 *
 * If the operation fails with SQLSTATE 23P01 (exclusion_violation),
 * immediately throws a `BookingConflictError` (no retry — the slot is taken).
 *
 * @example
 * ```ts
 * const booking = await withSerializableRetry(
 *   () => db.transaction(async (tx) => {
 *     // insert booking in SERIALIZABLE isolation
 *   }),
 *   { maxRetries: 3 }
 * );
 * ```
 */
export async function withSerializableRetry<T>(
  fn: () => Promise<T>,
  options?: SerializableRetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 50;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const code = getPostgresErrorCode(error);

      // Exclusion violation — slot is taken, do not retry
      if (code === EXCLUSION_VIOLATION) {
        throw new BookingConflictError();
      }

      // Serialization failure — retry with backoff
      if (code === SERIALIZATION_FAILURE && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        const jitter = Math.random() * delay;
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        continue;
      }

      // All retries exhausted for serialization failure
      if (code === SERIALIZATION_FAILURE) {
        throw new SerializationRetryExhaustedError(maxRetries);
      }

      // Unknown error — rethrow as-is
      throw error;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new SerializationRetryExhaustedError(maxRetries);
}
