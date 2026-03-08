import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { cn } from "../utils/cn.js";

/** Supported auth modes */
type AuthMode = "login" | "signup" | "reset-request" | "reset-sent";

/** Login form values */
interface LoginFormValues {
  email: string;
  password: string;
}

/** Signup form values */
interface SignupFormValues {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

/** Reset-request form values */
interface ResetRequestValues {
  email: string;
}

/** Props for the ProviderAuth component */
export interface ProviderAuthProps {
  /**
   * Called after successful login. Receives the provider profile.
   * Typically you redirect to the dashboard here.
   */
  onLoginSuccess?: (provider: { id: string; displayName: string }) => void;
  /**
   * Called after successful signup.
   * Typically you redirect to an onboarding flow here.
   */
  onSignupSuccess?: (provider: { id: string; displayName: string }) => void;
  /** URL for the Google OAuth login endpoint (e.g., /api/auth/signin/google) */
  googleOAuthUrl?: string;
  /** API endpoint for email/password login (default: /api/auth/signin) */
  signinUrl?: string;
  /** API endpoint for signup (default: /api/auth/signup) */
  signupUrl?: string;
  /** API endpoint for password reset request (default: /api/auth/reset-password) */
  resetUrl?: string;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Provider authentication component with email/password and Google OAuth flows.
 *
 * Wraps the `AuthAdapter` pattern — it calls your Next.js API routes which
 * are backed by whichever auth adapter (NextAuth, Clerk, Supabase, etc.) you configure.
 *
 * Supports:
 * - Email/password login
 * - Signup with display name
 * - Password reset request flow
 * - Google OAuth button
 *
 * @example
 * ```tsx
 * <ProviderAuth
 *   onLoginSuccess={() => router.push("/dashboard")}
 *   googleOAuthUrl="/api/auth/signin/google"
 * />
 * ```
 */
export function ProviderAuth({
  onLoginSuccess,
  onSignupSuccess,
  googleOAuthUrl,
  signinUrl = "/api/auth/signin",
  signupUrl = "/api/auth/signup",
  resetUrl = "/api/auth/reset-password",
  className,
  style,
}: ProviderAuthProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [serverError, setServerError] = useState<string | null>(null);

  const loginForm = useForm<LoginFormValues>();
  const signupForm = useForm<SignupFormValues>();
  const resetForm = useForm<ResetRequestValues>();

  const handleLogin = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      const res = await fetch(signinUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: values.email, password: values.password }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Login failed.");
      }
      const provider = (await res.json()) as { id: string; displayName: string };
      onLoginSuccess?.(provider);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Login failed.");
    }
  };

  const handleSignup = async (values: SignupFormValues) => {
    setServerError(null);
    if (values.password !== values.confirmPassword) {
      signupForm.setError("confirmPassword", { message: "Passwords do not match." });
      return;
    }
    try {
      const res = await fetch(signupUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          displayName: values.displayName,
          email: values.email,
          password: values.password,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Signup failed.");
      }
      const provider = (await res.json()) as { id: string; displayName: string };
      onSignupSuccess?.(provider);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Signup failed.");
    }
  };

  const handleResetRequest = async (values: ResetRequestValues) => {
    setServerError(null);
    try {
      await fetch(resetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });
      setMode("reset-sent");
    } catch {
      setServerError("Failed to send reset email. Please try again.");
    }
  };

  const switchMode = (next: AuthMode) => {
    setServerError(null);
    setMode(next);
  };

  return (
    <div className={cn("slotkit-provider-auth", className)} style={style}>
      {mode === "login" && (
        <>
          <h2>Sign in to your account</h2>

          {googleOAuthUrl && (
            <a href={googleOAuthUrl} className="slotkit-button-oauth">
              <GoogleIcon />
              Continue with Google
            </a>
          )}

          {googleOAuthUrl && <div className="slotkit-auth-divider">or</div>}

          <form
            onSubmit={loginForm.handleSubmit(handleLogin)}
            noValidate
          >
            <div className="slotkit-field">
              <label htmlFor="auth-email" className="slotkit-label">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                className="slotkit-input"
                autoComplete="email"
                {...loginForm.register("email", {
                  required: "Email is required",
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: "Invalid email address",
                  },
                })}
              />
              {loginForm.formState.errors.email ? (
                <p className="slotkit-error">
                  {loginForm.formState.errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="slotkit-field">
              <label htmlFor="auth-password" className="slotkit-label">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                className="slotkit-input"
                autoComplete="current-password"
                {...loginForm.register("password", {
                  required: "Password is required",
                })}
              />
              {loginForm.formState.errors.password ? (
                <p className="slotkit-error">
                  {loginForm.formState.errors.password.message}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              className="slotkit-link"
              onClick={() => switchMode("reset-request")}
            >
              Forgot password?
            </button>

            {serverError && (
              <div className="slotkit-alert slotkit-alert-error" role="alert">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              className="slotkit-button-primary"
              disabled={loginForm.formState.isSubmitting}
            >
              {loginForm.formState.isSubmitting ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="slotkit-auth-switch">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              className="slotkit-link"
              onClick={() => switchMode("signup")}
            >
              Sign up
            </button>
          </p>
        </>
      )}

      {mode === "signup" && (
        <>
          <h2>Create your account</h2>

          {googleOAuthUrl && (
            <a href={googleOAuthUrl} className="slotkit-button-oauth">
              <GoogleIcon />
              Sign up with Google
            </a>
          )}

          {googleOAuthUrl && <div className="slotkit-auth-divider">or</div>}

          <form
            onSubmit={signupForm.handleSubmit(handleSignup)}
            noValidate
          >
            <div className="slotkit-field">
              <label htmlFor="signup-name" className="slotkit-label">
                Display Name
              </label>
              <input
                id="signup-name"
                type="text"
                className="slotkit-input"
                placeholder="Your name or business name"
                {...signupForm.register("displayName", {
                  required: "Display name is required",
                  minLength: { value: 2, message: "Name must be at least 2 characters" },
                })}
              />
              {signupForm.formState.errors.displayName ? (
                <p className="slotkit-error">
                  {signupForm.formState.errors.displayName.message}
                </p>
              ) : null}
            </div>

            <div className="slotkit-field">
              <label htmlFor="signup-email" className="slotkit-label">
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                className="slotkit-input"
                autoComplete="email"
                {...signupForm.register("email", {
                  required: "Email is required",
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: "Invalid email address",
                  },
                })}
              />
              {signupForm.formState.errors.email ? (
                <p className="slotkit-error">
                  {signupForm.formState.errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="slotkit-field">
              <label htmlFor="signup-password" className="slotkit-label">
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                className="slotkit-input"
                autoComplete="new-password"
                {...signupForm.register("password", {
                  required: "Password is required",
                  minLength: { value: 8, message: "Password must be at least 8 characters" },
                })}
              />
              {signupForm.formState.errors.password ? (
                <p className="slotkit-error">
                  {signupForm.formState.errors.password.message}
                </p>
              ) : null}
            </div>

            <div className="slotkit-field">
              <label htmlFor="signup-confirm" className="slotkit-label">
                Confirm Password
              </label>
              <input
                id="signup-confirm"
                type="password"
                className="slotkit-input"
                autoComplete="new-password"
                {...signupForm.register("confirmPassword", {
                  required: "Please confirm your password",
                })}
              />
              {signupForm.formState.errors.confirmPassword ? (
                <p className="slotkit-error">
                  {signupForm.formState.errors.confirmPassword.message}
                </p>
              ) : null}
            </div>

            {serverError && (
              <div className="slotkit-alert slotkit-alert-error" role="alert">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              className="slotkit-button-primary"
              disabled={signupForm.formState.isSubmitting}
            >
              {signupForm.formState.isSubmitting ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <p className="slotkit-auth-switch">
            Already have an account?{" "}
            <button
              type="button"
              className="slotkit-link"
              onClick={() => switchMode("login")}
            >
              Sign in
            </button>
          </p>
        </>
      )}

      {mode === "reset-request" && (
        <>
          <h2>Reset your password</h2>
          <p>Enter your email address and we&apos;ll send you a reset link.</p>

          <form
            onSubmit={resetForm.handleSubmit(handleResetRequest)}
            noValidate
          >
            <div className="slotkit-field">
              <label htmlFor="reset-email" className="slotkit-label">
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                className="slotkit-input"
                autoComplete="email"
                {...resetForm.register("email", {
                  required: "Email is required",
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: "Invalid email address",
                  },
                })}
              />
              {resetForm.formState.errors.email ? (
                <p className="slotkit-error">
                  {resetForm.formState.errors.email.message}
                </p>
              ) : null}
            </div>

            {serverError && (
              <div className="slotkit-alert slotkit-alert-error" role="alert">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              className="slotkit-button-primary"
              disabled={resetForm.formState.isSubmitting}
            >
              {resetForm.formState.isSubmitting ? "Sending..." : "Send Reset Link"}
            </button>
          </form>

          <p className="slotkit-auth-switch">
            <button
              type="button"
              className="slotkit-link"
              onClick={() => switchMode("login")}
            >
              Back to sign in
            </button>
          </p>
        </>
      )}

      {mode === "reset-sent" && (
        <>
          <h2>Check your email</h2>
          <p>
            We&apos;ve sent a password reset link to your email address.
            The link expires in 1 hour.
          </p>
          <button
            type="button"
            className="slotkit-button-secondary"
            onClick={() => switchMode("login")}
          >
            Back to sign in
          </button>
        </>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
