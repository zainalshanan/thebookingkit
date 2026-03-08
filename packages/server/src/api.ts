/**
 * REST API utilities for SlotKit.
 *
 * Provides standardized response formatting, API key management,
 * rate limiting, pagination, and request validation helpers
 * for Next.js API routes.
 */

import { createHmac, randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Standard Response Types
// ---------------------------------------------------------------------------

/** Standard API error */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Standard error response envelope */
export interface ApiErrorResponse {
  error: ApiError;
}

/** Standard success response envelope */
export interface ApiSuccessResponse<T> {
  data: T;
  meta?: ApiMeta;
}

/** Pagination metadata */
export interface ApiMeta {
  total?: number;
  nextCursor?: string | null;
  prevCursor?: string | null;
  hasMore?: boolean;
}

/** Paginated list response */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
    total?: number;
  };
}

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

/** Standard API error codes */
export const API_ERROR_CODES = {
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

// ---------------------------------------------------------------------------
// Response Helpers
// ---------------------------------------------------------------------------

/**
 * Create a standardized API error response.
 *
 * @param code - Error code from API_ERROR_CODES
 * @param message - Human-readable error message
 * @param details - Optional additional details
 * @returns Standardized error response object
 */
export function createErrorResponse(
  code: ApiErrorCode | string,
  message: string,
  details?: Record<string, unknown>,
): ApiErrorResponse {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

/**
 * Create a standardized API success response.
 *
 * @param data - The response data
 * @param meta - Optional pagination metadata
 * @returns Standardized success response object
 */
export function createSuccessResponse<T>(
  data: T,
  meta?: ApiMeta,
): ApiSuccessResponse<T> {
  return {
    data,
    ...(meta ? { meta } : {}),
  };
}

/**
 * Create a paginated list response.
 *
 * @param items - The page of items
 * @param nextCursor - Cursor for the next page (null if last page)
 * @param total - Optional total count
 * @returns Paginated response
 */
export function createPaginatedResponse<T>(
  items: T[],
  nextCursor: string | null,
  total?: number,
): PaginatedResponse<T> {
  return {
    data: items,
    meta: {
      nextCursor,
      hasMore: nextCursor !== null,
      ...(total !== undefined ? { total } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// API Key Management
// ---------------------------------------------------------------------------

/** An API key record */
export interface ApiKeyRecord {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  providerId?: string;
  teamId?: string;
  scopes: ApiKeyScope[];
  rateLimit: number;
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
}

/** API key scope */
export type ApiKeyScope =
  | "read:bookings"
  | "write:bookings"
  | "read:availability"
  | "write:availability"
  | "read:event-types"
  | "write:event-types"
  | "read:webhooks"
  | "write:webhooks"
  | "read:analytics"
  | "admin";

/** Result of generating a new API key */
export interface GeneratedApiKey {
  /** The full key (only shown once) */
  key: string;
  /** The prefix for display (e.g., "sk_live_abc123...") */
  prefix: string;
  /** The hash stored in the database */
  hash: string;
}

/**
 * Generate a new API key.
 *
 * The full key is only returned once and should be displayed to the user.
 * Only the hash is stored in the database.
 *
 * @param prefix - Key prefix (e.g., "sk_live_" or "sk_test_")
 * @returns Generated key with hash for storage
 */
export function generateApiKey(prefix: string = "sk_live_"): GeneratedApiKey {
  const rawKey = randomBytes(32).toString("hex");
  const key = `${prefix}${rawKey}`;
  const hash = hashApiKey(key);
  const displayPrefix = key.slice(0, prefix.length + 8) + "...";

  return { key, prefix: displayPrefix, hash };
}

/**
 * Hash an API key for secure storage.
 *
 * Uses HMAC-SHA256 with a secret from the SLOTKIT_API_KEY_SECRET
 * environment variable. Throws if the secret is not configured.
 *
 * @param key - The full API key
 * @param secret - Optional HMAC secret (defaults to SLOTKIT_API_KEY_SECRET env var)
 * @returns The hex-encoded hash
 */
export function hashApiKey(key: string, secret?: string): string {
  const hmacSecret =
    secret ?? process.env.SLOTKIT_API_KEY_SECRET;
  if (!hmacSecret) {
    throw new Error(
      "SLOTKIT_API_KEY_SECRET environment variable is required for API key hashing. " +
        "Set it to a random 32+ character string.",
    );
  }
  return createHmac("sha256", hmacSecret).update(key).digest("hex");
}

/**
 * Verify an API key against a stored hash.
 *
 * @param key - The key to verify
 * @param storedHash - The hash stored in the database
 * @returns Whether the key is valid
 */
export function verifyApiKey(key: string, storedHash: string): boolean {
  const hash = hashApiKey(key);
  if (hash.length !== storedHash.length) return false;

  // Constant-time comparison
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(storedHash, "hex");

  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}

/**
 * Check if an API key has a required scope.
 *
 * Admin scope grants all permissions.
 *
 * @param keyScopes - The scopes granted to the API key
 * @param requiredScope - The scope to check for
 * @returns Whether the key has the required scope
 */
export function hasScope(
  keyScopes: ApiKeyScope[],
  requiredScope: ApiKeyScope,
): boolean {
  return keyScopes.includes("admin") || keyScopes.includes(requiredScope);
}

/**
 * Check if an API key has expired.
 *
 * @param expiresAt - Optional expiry timestamp
 * @returns Whether the key is expired
 */
export function isKeyExpired(expiresAt: Date | undefined | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() < Date.now();
}

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

/** Rate limit state for a key */
export interface RateLimitState {
  count: number;
  windowStartMs: number;
}

/** Rate limit check result */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  limit: number;
}

/**
 * Check if a request should be allowed under rate limiting.
 *
 * Uses a fixed 1-minute window.
 *
 * @param state - Current rate limit state
 * @param limit - Maximum requests per minute
 * @param nowMs - Current timestamp in milliseconds
 * @returns Rate limit check result
 */
export function checkRateLimit(
  state: RateLimitState | null,
  limit: number,
  nowMs: number = Date.now(),
): { result: RateLimitResult; newState: RateLimitState } {
  const windowMs = 60 * 1000; // 1 minute
  const windowStart = nowMs - (nowMs % windowMs);

  // New window or no existing state
  if (!state || state.windowStartMs !== windowStart) {
    return {
      result: {
        allowed: true,
        remaining: limit - 1,
        resetMs: windowStart + windowMs,
        limit,
      },
      newState: { count: 1, windowStartMs: windowStart },
    };
  }

  const newCount = state.count + 1;
  const allowed = newCount <= limit;

  return {
    result: {
      allowed,
      remaining: Math.max(0, limit - newCount),
      resetMs: windowStart + windowMs,
      limit,
    },
    newState: { count: newCount, windowStartMs: windowStart },
  };
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Encode a cursor for pagination (base64 JSON).
 *
 * @param data - The cursor data to encode
 * @returns Base64-encoded cursor string
 */
export function encodeCursor(data: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

/**
 * Decode a pagination cursor.
 *
 * @param cursor - The base64-encoded cursor string
 * @returns The decoded cursor data, or null if invalid
 */
export function decodeCursor(
  cursor: string,
): Record<string, unknown> | null {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf-8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Request Validation
// ---------------------------------------------------------------------------

/** Validation error detail */
export interface ValidationDetail {
  field: string;
  message: string;
}

/** Result of input validation */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationDetail[];
}

/**
 * Validate API request parameters for slot queries.
 *
 * @param params - Query parameters
 * @returns Validation result
 */
export function validateSlotQueryParams(params: {
  providerId?: string;
  teamId?: string;
  eventTypeId?: string;
  start?: string;
  end?: string;
  timezone?: string;
}): ValidationResult {
  const errors: ValidationDetail[] = [];

  if (!params.providerId && !params.teamId) {
    errors.push({
      field: "providerId",
      message: "Either providerId or teamId is required",
    });
  }

  if (!params.start) {
    errors.push({ field: "start", message: "start date is required" });
  } else if (isNaN(Date.parse(params.start))) {
    errors.push({
      field: "start",
      message: `Invalid date: "${params.start}"`,
    });
  }

  if (!params.end) {
    errors.push({ field: "end", message: "end date is required" });
  } else if (isNaN(Date.parse(params.end))) {
    errors.push({ field: "end", message: `Invalid date: "${params.end}"` });
  }

  if (params.start && params.end) {
    const start = new Date(params.start);
    const end = new Date(params.end);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end <= start) {
      errors.push({ field: "end", message: "end must be after start" });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Parse and validate a sort parameter.
 *
 * @param sortParam - Sort string (e.g., "-createdAt" or "startsAt")
 * @param allowedFields - Fields that can be sorted by
 * @returns Parsed sort field and direction
 */
export function parseSortParam(
  sortParam: string | undefined,
  allowedFields: string[],
): { field: string; direction: "asc" | "desc" } | null {
  if (!sortParam) return null;

  const descending = sortParam.startsWith("-");
  const field = descending ? sortParam.slice(1) : sortParam;

  if (!allowedFields.includes(field)) return null;

  return { field, direction: descending ? "desc" : "asc" };
}
