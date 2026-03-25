/**
 * Thrown when a booking cannot be created because the slot is already taken.
 * This wraps the Postgres EXCLUDE constraint violation (SQLSTATE 23P01)
 * into a user-friendly error.
 */
export class BookingConflictError extends Error {
  public readonly code = "BOOKING_CONFLICT";

  constructor(message = "This time slot is no longer available. Please choose a different time.") {
    super(message);
    this.name = "BookingConflictError";
  }
}

/**
 * Thrown when all serialization retries are exhausted.
 */
export class SerializationRetryExhaustedError extends Error {
  public readonly code = "SERIALIZATION_RETRY_EXHAUSTED";

  constructor(maxRetries: number) {
    super(
      `Transaction failed after ${maxRetries} retries due to concurrent access. Please try again.`,
    );
    this.name = "SerializationRetryExhaustedError";
  }
}

/**
 * Thrown when no resource can be assigned to a booking.
 * The `reason` property narrows the failure mode for the caller.
 */
export class ResourceUnavailableError extends Error {
  public readonly code = "RESOURCE_UNAVAILABLE" as const;
  public readonly reason: "no_capacity" | "no_matching_type" | "all_booked";

  constructor(
    reason: "no_capacity" | "no_matching_type" | "all_booked",
    message?: string,
  ) {
    super(message ?? `Resource unavailable: ${reason}`);
    this.name = "ResourceUnavailableError";
    this.reason = reason;
  }
}

/**
 * Thrown when authorization fails.
 */
export class UnauthorizedError extends Error {
  public readonly code = "UNAUTHORIZED";
  public readonly statusCode = 401;

  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Thrown when a user attempts to access a resource they don't own.
 */
export class ForbiddenError extends Error {
  public readonly code = "FORBIDDEN";
  public readonly statusCode = 403;

  constructor(message = "You do not have permission to access this resource.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
