import { UnauthorizedError, ForbiddenError } from "@thebookingkit/core";

/** Represents an authenticated user in the system */
export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role?: "admin" | "provider" | "customer";
}

/** Session returned by the auth adapter */
export interface AuthSession {
  user: AuthUser;
  expires: Date;
}

/**
 * Pluggable authentication adapter interface.
 * Default implementation uses NextAuth.js.
 * Swap to Supabase Auth, Clerk, or Lucia by implementing this interface.
 */
export interface AuthAdapter {
  /** Get the currently authenticated user from the request */
  getCurrentUser(request: Request): Promise<AuthUser | null>;
  /** Get the full session */
  getSession(request: Request): Promise<AuthSession | null>;
  /** Verify an API token or signed booking token */
  verifyToken(token: string): Promise<AuthUser | null>;
}

/** Request with injected auth context */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

/** Options for the withAuth middleware */
export interface WithAuthOptions {
  /** Require a specific role */
  requiredRole?: "admin" | "provider" | "member";
}

const ROLE_HIERARCHY: Record<string, number> = {
  admin: 3,
  provider: 2,
  member: 1,
};

/**
 * Middleware wrapper that injects the authenticated user into every request.
 *
 * - Rejects unauthenticated requests with 401.
 * - Optionally checks user role.
 * - Passes the authenticated user to the handler.
 *
 * @example
 * ```ts
 * // In a Next.js API route
 * export const GET = withAuth(authAdapter, async (req) => {
 *   const userId = req.user.id;
 *   // Provider can only access their own data
 *   const bookings = await db.query.bookings.findMany({
 *     where: eq(bookings.providerId, userId)
 *   });
 *   return Response.json(bookings);
 * });
 * ```
 */
export function withAuth(
  adapter: AuthAdapter,
  handler: (req: AuthenticatedRequest) => Promise<Response>,
  options?: WithAuthOptions,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      // Try to get user from session first
      let user = await adapter.getCurrentUser(req);

      // If no session, try Bearer token
      if (!user) {
        const authHeader = req.headers.get("authorization");
        if (authHeader?.startsWith("Bearer ")) {
          const token = authHeader.slice(7);
          user = await adapter.verifyToken(token);
        }
      }

      if (!user) {
        throw new UnauthorizedError();
      }

      // Check required role if specified — use hierarchy so admin satisfies provider requirement
      if (options?.requiredRole) {
        const userLevel = ROLE_HIERARCHY[user.role ?? ""] ?? 0;
        const requiredLevel = ROLE_HIERARCHY[options.requiredRole] ?? 0;
        if (userLevel < requiredLevel) {
          throw new ForbiddenError();
        }
      }

      // Inject user into request
      const authReq = req as AuthenticatedRequest;
      authReq.user = user;

      return await handler(authReq);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return Response.json(
          { error: error.message, code: error.code },
          { status: 401 },
        );
      }
      if (error instanceof ForbiddenError) {
        return Response.json(
          { error: error.message, code: error.code },
          { status: 403 },
        );
      }
      return Response.json(
        { error: "Internal server error", code: "INTERNAL_ERROR" },
        { status: 500 },
      );
    }
  };
}

/**
 * Helper to scope database queries to the authenticated user.
 * Providers can only access their own rows (user_id matches).
 *
 * @example
 * ```ts
 * const provider = await assertOwnership(db, providers, req.user.id, providerId);
 * ```
 */
export function assertProviderOwnership(
  userId: string,
  resourceUserId: string,
): void {
  if (userId !== resourceUserId) {
    throw new ForbiddenError(
      "You do not have permission to access this provider's data.",
    );
  }
}

/**
 * Helper to verify customer access to their own bookings.
 * Customers can only access bookings where customer_email matches.
 */
export function assertCustomerAccess(
  userEmail: string,
  bookingCustomerEmail: string,
): void {
  if (userEmail !== bookingCustomerEmail) {
    throw new ForbiddenError(
      "You do not have permission to access this booking.",
    );
  }
}
