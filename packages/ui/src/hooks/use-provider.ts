import { useState, useEffect, useCallback } from "react";

/** Provider profile data */
export interface ProviderProfile {
  id: string;
  userId: string;
  displayName: string;
  email?: string;
  timezone: string;
  metadata?: Record<string, unknown>;
}

/** Return type of the useProvider hook */
export interface UseProviderReturn {
  /** The authenticated provider's profile, or null if not logged in */
  provider: ProviderProfile | null;
  /** True while the session is being fetched */
  isLoading: boolean;
  /** Error if the session fetch failed */
  error: Error | null;
  /** Sign out the current provider */
  logout: () => Promise<void>;
}

/**
 * Fetches the current provider's profile from the API.
 * Calls `/api/auth/provider` by default; override `apiUrl` to point elsewhere.
 */
export interface UseProviderOptions {
  /** API endpoint that returns the current provider profile */
  apiUrl?: string;
  /** Called when logout completes */
  onLogout?: () => void;
}

/**
 * React hook that returns the authenticated provider's profile.
 *
 * Pairs with the `AuthAdapter` pattern — your API route at `/api/auth/provider`
 * should return the provider record for the currently authenticated user.
 *
 * @example
 * ```tsx
 * const { provider, isLoading, logout } = useProvider();
 * if (isLoading) return <Spinner />;
 * if (!provider) return <Redirect to="/login" />;
 * return <Dashboard provider={provider} />;
 * ```
 */
export function useProvider(options: UseProviderOptions = {}): UseProviderReturn {
  const { apiUrl = "/api/auth/provider", onLogout } = options;
  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(apiUrl, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            return null;
          }
          throw new Error(`Failed to load provider profile: ${res.status}`);
        }
        return res.json() as Promise<ProviderProfile>;
      })
      .then((data) => {
        if (!cancelled) {
          setProvider(data);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error("Unknown error"));
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/signout", { method: "POST", credentials: "include" });
    setProvider(null);
    onLogout?.();
  }, [onLogout]);

  return { provider, isLoading, error, logout };
}
