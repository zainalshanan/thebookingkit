import {
  BookingConflictError,
  SerializationRetryExhaustedError,
} from "@thebookingkit/core";

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
 * Find the Postgres SQLSTATE on an error or anywhere down its `cause` chain.
 *
 * Drizzle ≥ 0.44 wraps driver errors in `DrizzleQueryError` ("Failed query:
 * …") with the original postgres error as `cause`, so the code is one level
 * down. Only five-character SQLSTATE strings count, so a wrapper's own
 * non-SQLSTATE `code` can't shadow the driver's.
 */
function getPostgresErrorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 8 || !error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  return getPostgresErrorCode((error as { cause?: unknown }).cause, depth + 1);
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
