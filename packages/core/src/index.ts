// Errors
export {
  BookingConflictError,
  SerializationRetryExhaustedError,
  UnauthorizedError,
  ForbiddenError,
} from "./errors.js";

// Serialization retry utility
export {
  withSerializableRetry,
  type SerializableRetryOptions,
} from "./serialization-retry.js";

// Auth middleware & adapters
export {
  withAuth,
  assertProviderOwnership,
  assertCustomerAccess,
  type AuthUser,
  type AuthSession,
  type AuthAdapter,
  type AuthenticatedRequest,
  type WithAuthOptions,
} from "./auth.js";
