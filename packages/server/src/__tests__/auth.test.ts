import { describe, it, expect, vi } from "vitest";
import {
  withAuth,
  assertProviderOwnership,
  assertCustomerAccess,
  UnauthorizedError,
  ForbiddenError,
  type AuthAdapter,
  type AuthUser,
} from "../index.js";

function mockAdapter(user: AuthUser | null): AuthAdapter {
  return {
    getCurrentUser: vi.fn().mockResolvedValue(user),
    getSession: vi.fn().mockResolvedValue(user ? { user, expires: new Date() } : null),
    verifyToken: vi.fn().mockResolvedValue(user),
  };
}

function mockRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", {
    headers: new Headers(headers),
  });
}

describe("withAuth", () => {
  it("injects user and calls handler on valid session", async () => {
    const user: AuthUser = { id: "user1", email: "test@test.com" };
    const adapter = mockAdapter(user);
    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));

    const wrapped = withAuth(adapter, handler);
    const response = await wrapped(mockRequest());

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    const calledReq = handler.mock.calls[0][0];
    expect(calledReq.user).toEqual(user);
  });

  it("returns 401 when no user is authenticated", async () => {
    const adapter = mockAdapter(null);
    // verifyToken also returns null
    adapter.verifyToken = vi.fn().mockResolvedValue(null);
    const handler = vi.fn();

    const wrapped = withAuth(adapter, handler);
    const response = await wrapped(mockRequest());

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("falls back to Bearer token when session returns null", async () => {
    const user: AuthUser = { id: "user2", email: "api@test.com" };
    const adapter = mockAdapter(null);
    adapter.getCurrentUser = vi.fn().mockResolvedValue(null);
    adapter.verifyToken = vi.fn().mockResolvedValue(user);

    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const wrapped = withAuth(adapter, handler);
    const response = await wrapped(
      mockRequest({ Authorization: "Bearer test-token-123" }),
    );

    expect(response.status).toBe(200);
    expect(adapter.verifyToken).toHaveBeenCalledWith("test-token-123");
  });

  it("returns 403 when role does not match", async () => {
    const user: AuthUser = {
      id: "user3",
      email: "member@test.com",
      role: "customer",
    };
    const adapter = mockAdapter(user);
    const handler = vi.fn();

    const wrapped = withAuth(adapter, handler, { requiredRole: "admin" });
    const response = await wrapped(mockRequest());

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("assertProviderOwnership", () => {
  it("does not throw when user IDs match", () => {
    expect(() => assertProviderOwnership("user1", "user1")).not.toThrow();
  });

  it("throws ForbiddenError when user IDs do not match", () => {
    expect(() => assertProviderOwnership("user1", "user2")).toThrow(
      ForbiddenError,
    );
  });
});

describe("assertCustomerAccess", () => {
  it("does not throw when emails match", () => {
    expect(() =>
      assertCustomerAccess("a@test.com", "a@test.com"),
    ).not.toThrow();
  });

  it("throws ForbiddenError when emails do not match", () => {
    expect(() =>
      assertCustomerAccess("a@test.com", "b@test.com"),
    ).toThrow(ForbiddenError);
  });
});
