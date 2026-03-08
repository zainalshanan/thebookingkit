import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createErrorResponse,
  createSuccessResponse,
  createPaginatedResponse,
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  hasScope,
  isKeyExpired,
  checkRateLimit,
  encodeCursor,
  decodeCursor,
  validateSlotQueryParams,
  parseSortParam,
  API_ERROR_CODES,
  type ApiKeyScope,
} from "../api.js";

// Set the required env var for API key hashing in tests
process.env.SLOTKIT_API_KEY_SECRET = "test-secret-for-unit-tests-only";

// ---------------------------------------------------------------------------
// Response Helpers
// ---------------------------------------------------------------------------

describe("createErrorResponse", () => {
  it("creates a standard error envelope", () => {
    const response = createErrorResponse("NOT_FOUND", "Booking not found");
    expect(response).toEqual({
      error: { code: "NOT_FOUND", message: "Booking not found" },
    });
  });

  it("includes details when provided", () => {
    const response = createErrorResponse(
      "VALIDATION_ERROR",
      "Invalid input",
      { field: "email" },
    );
    expect(response.error.details).toEqual({ field: "email" });
  });

  it("omits details when not provided", () => {
    const response = createErrorResponse("UNAUTHORIZED", "Invalid key");
    expect(response.error.details).toBeUndefined();
  });
});

describe("createSuccessResponse", () => {
  it("wraps data in a success envelope", () => {
    const response = createSuccessResponse({ id: "bk-1" });
    expect(response).toEqual({ data: { id: "bk-1" } });
  });

  it("includes meta when provided", () => {
    const response = createSuccessResponse([], {
      nextCursor: "abc",
      hasMore: true,
    });
    expect(response.meta?.nextCursor).toBe("abc");
  });
});

describe("createPaginatedResponse", () => {
  it("creates paginated response with cursor", () => {
    const response = createPaginatedResponse(["a", "b"], "cursor123", 10);
    expect(response.data).toEqual(["a", "b"]);
    expect(response.meta.nextCursor).toBe("cursor123");
    expect(response.meta.hasMore).toBe(true);
    expect(response.meta.total).toBe(10);
  });

  it("marks hasMore false when nextCursor is null", () => {
    const response = createPaginatedResponse(["a"], null);
    expect(response.meta.hasMore).toBe(false);
    expect(response.meta.nextCursor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// API Key Management
// ---------------------------------------------------------------------------

describe("generateApiKey", () => {
  it("generates a key with the given prefix", () => {
    const { key } = generateApiKey("sk_live_");
    expect(key).toMatch(/^sk_live_[0-9a-f]{64}$/);
  });

  it("generates a display prefix", () => {
    const { prefix } = generateApiKey("sk_live_");
    expect(prefix).toContain("...");
  });

  it("generates a 64-char hex hash", () => {
    const { hash } = generateApiKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique keys each time", () => {
    const { key: k1 } = generateApiKey();
    const { key: k2 } = generateApiKey();
    expect(k1).not.toBe(k2);
  });
});

describe("hashApiKey", () => {
  it("throws when SLOTKIT_API_KEY_SECRET is missing", () => {
    const original = process.env.SLOTKIT_API_KEY_SECRET;
    delete process.env.SLOTKIT_API_KEY_SECRET;
    try {
      expect(() => hashApiKey("sk_live_test")).toThrow(
        "SLOTKIT_API_KEY_SECRET environment variable is required",
      );
    } finally {
      process.env.SLOTKIT_API_KEY_SECRET = original;
    }
  });

  it("accepts an explicit secret parameter", () => {
    const hash = hashApiKey("sk_live_test", "my-explicit-secret");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyApiKey", () => {
  it("returns true for correct key", () => {
    const { key, hash } = generateApiKey();
    expect(verifyApiKey(key, hash)).toBe(true);
  });

  it("returns false for tampered key", () => {
    const { hash } = generateApiKey();
    expect(verifyApiKey("sk_live_wrong", hash)).toBe(false);
  });

  it("returns false for wrong hash", () => {
    const { key } = generateApiKey();
    const { hash: otherHash } = generateApiKey();
    expect(verifyApiKey(key, otherHash)).toBe(false);
  });
});

describe("hasScope", () => {
  it("returns true when scope is present", () => {
    const scopes: ApiKeyScope[] = ["read:bookings", "write:bookings"];
    expect(hasScope(scopes, "read:bookings")).toBe(true);
  });

  it("returns false when scope is absent", () => {
    const scopes: ApiKeyScope[] = ["read:bookings"];
    expect(hasScope(scopes, "write:bookings")).toBe(false);
  });

  it("admin scope grants all permissions", () => {
    const scopes: ApiKeyScope[] = ["admin"];
    expect(hasScope(scopes, "read:bookings")).toBe(true);
    expect(hasScope(scopes, "write:event-types")).toBe(true);
    expect(hasScope(scopes, "write:webhooks")).toBe(true);
  });
});

describe("isKeyExpired", () => {
  it("returns false for no expiry", () => {
    expect(isKeyExpired(undefined)).toBe(false);
    expect(isKeyExpired(null)).toBe(false);
  });

  it("returns true for past expiry", () => {
    expect(isKeyExpired(new Date(Date.now() - 1000))).toBe(true);
  });

  it("returns false for future expiry", () => {
    expect(isKeyExpired(new Date(Date.now() + 86400000))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T14:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows first request", () => {
    const { result } = checkRateLimit(null, 120);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(119);
    expect(result.limit).toBe(120);
  });

  it("tracks requests within a window", () => {
    const { newState } = checkRateLimit(null, 120);
    const { result } = checkRateLimit(newState, 120);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(118);
  });

  it("blocks requests when limit exceeded", () => {
    let state = checkRateLimit(null, 2).newState;
    state = checkRateLimit(state, 2).newState;
    const { result } = checkRateLimit(state, 2);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets counter in new window", () => {
    let state = checkRateLimit(null, 2).newState;
    state = checkRateLimit(state, 2).newState;
    // Advance to next minute
    vi.advanceTimersByTime(60 * 1000);
    const { result } = checkRateLimit(state, 2);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Cursor Pagination
// ---------------------------------------------------------------------------

describe("encodeCursor / decodeCursor", () => {
  it("round-trips cursor data", () => {
    const data = { id: "bk-1", createdAt: "2026-03-15T14:00:00Z" };
    const cursor = encodeCursor(data);
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual(data);
  });

  it("returns null for invalid cursor", () => {
    expect(decodeCursor("not-valid-base64!!!")).toBeNull();
  });

  it("returns null for non-JSON cursor", () => {
    const cursor = Buffer.from("not json").toString("base64url");
    expect(decodeCursor(cursor)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateSlotQueryParams
// ---------------------------------------------------------------------------

describe("validateSlotQueryParams", () => {
  const validParams = {
    providerId: "prov-1",
    start: "2026-03-15",
    end: "2026-04-15",
    timezone: "America/New_York",
  };

  it("accepts valid params", () => {
    const result = validateSlotQueryParams(validParams);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts teamId instead of providerId", () => {
    const result = validateSlotQueryParams({
      teamId: "team-1",
      start: "2026-03-15",
      end: "2026-04-15",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects missing providerId and teamId", () => {
    const result = validateSlotQueryParams({
      start: "2026-03-15",
      end: "2026-04-15",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("providerId");
  });

  it("rejects missing start date", () => {
    const result = validateSlotQueryParams({
      providerId: "p1",
      end: "2026-04-15",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "start")).toBe(true);
  });

  it("rejects invalid start date", () => {
    const result = validateSlotQueryParams({
      providerId: "p1",
      start: "not-a-date",
      end: "2026-04-15",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects end before start", () => {
    const result = validateSlotQueryParams({
      providerId: "p1",
      start: "2026-04-15",
      end: "2026-03-15",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("after start"))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// parseSortParam
// ---------------------------------------------------------------------------

describe("parseSortParam", () => {
  const allowedFields = ["createdAt", "startsAt", "status"];

  it("parses ascending sort", () => {
    const result = parseSortParam("startsAt", allowedFields);
    expect(result).toEqual({ field: "startsAt", direction: "asc" });
  });

  it("parses descending sort with leading minus", () => {
    const result = parseSortParam("-createdAt", allowedFields);
    expect(result).toEqual({ field: "createdAt", direction: "desc" });
  });

  it("returns null for invalid field", () => {
    expect(parseSortParam("unknownField", allowedFields)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseSortParam(undefined, allowedFields)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// API_ERROR_CODES
// ---------------------------------------------------------------------------

describe("API_ERROR_CODES", () => {
  it("exports all standard error codes", () => {
    expect(API_ERROR_CODES.NOT_FOUND).toBe("NOT_FOUND");
    expect(API_ERROR_CODES.UNAUTHORIZED).toBe("UNAUTHORIZED");
    expect(API_ERROR_CODES.FORBIDDEN).toBe("FORBIDDEN");
    expect(API_ERROR_CODES.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
    expect(API_ERROR_CODES.RATE_LIMITED).toBe("RATE_LIMITED");
    expect(API_ERROR_CODES.CONFLICT).toBe("CONFLICT");
  });
});
