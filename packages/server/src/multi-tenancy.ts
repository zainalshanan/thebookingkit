/**
 * Multi-tenancy utilities for organization-scoped deployments.
 *
 * Provides organization settings resolution, cascading defaults,
 * role-based access control, and tenant authorization helpers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Organization member role */
export type OrgRole = "owner" | "admin" | "member";

/** Organization member */
export interface OrgMember {
  userId: string;
  organizationId: string;
  role: OrgRole;
}

/** Organization branding */
export interface OrgBranding {
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
}

/** Organization-level settings */
export interface OrgSettings {
  defaultTimezone?: string;
  defaultCurrency?: string;
  branding?: OrgBranding;
  defaultBufferMinutes?: number;
  defaultBookingLimits?: Record<string, unknown>;
}

/** Provider-level settings that can override org defaults */
export interface ProviderSettings {
  timezone?: string;
  currency?: string;
  branding?: Partial<OrgBranding>;
  bufferMinutes?: number;
  bookingLimits?: Record<string, unknown>;
}

/** Event type settings that can override provider defaults */
export interface EventTypeSettings {
  timezone?: string;
  currency?: string;
  bufferBefore?: number;
  bufferAfter?: number;
  bookingLimits?: Record<string, unknown>;
}

/** Global SlotKit defaults */
export interface GlobalDefaults {
  timezone: string;
  currency: string;
  bufferMinutes: number;
}

/** Resolved effective settings after cascading resolution */
export interface ResolvedSettings {
  timezone: string;
  currency: string;
  bufferMinutes: number;
  branding: OrgBranding;
  bookingLimits: Record<string, unknown>;
}

/** Permissions available in the system */
export type OrgPermission =
  | "manage:members"
  | "manage:teams"
  | "manage:event-types"
  | "view:all-bookings"
  | "view:own-bookings"
  | "manage:own-availability"
  | "view:analytics"
  | "manage:organization";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Error thrown for multi-tenancy authorization violations */
export class TenantAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantAuthorizationError";
  }
}

// ---------------------------------------------------------------------------
// Global Defaults
// ---------------------------------------------------------------------------

/** System-wide defaults used as the base for cascading resolution */
export const GLOBAL_DEFAULTS: GlobalDefaults = {
  timezone: "UTC",
  currency: "USD",
  bufferMinutes: 0,
};

// ---------------------------------------------------------------------------
// Settings Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve effective settings via the cascade:
 * `event_type > provider > organization > global defaults`
 *
 * @param orgSettings - Organization-level settings
 * @param providerSettings - Provider-level settings (overrides org)
 * @param eventTypeSettings - Event type settings (overrides provider)
 * @returns Fully resolved effective settings
 */
export function resolveEffectiveSettings(
  orgSettings?: OrgSettings | null,
  providerSettings?: ProviderSettings | null,
  eventTypeSettings?: EventTypeSettings | null,
): ResolvedSettings {
  // Start with global defaults
  let timezone = GLOBAL_DEFAULTS.timezone;
  let currency = GLOBAL_DEFAULTS.currency;
  let bufferMinutes = GLOBAL_DEFAULTS.bufferMinutes;
  let branding: OrgBranding = {};
  let bookingLimits: Record<string, unknown> = {};

  // Apply org settings
  if (orgSettings) {
    if (orgSettings.defaultTimezone) timezone = orgSettings.defaultTimezone;
    if (orgSettings.defaultCurrency) currency = orgSettings.defaultCurrency;
    if (orgSettings.defaultBufferMinutes !== undefined)
      bufferMinutes = orgSettings.defaultBufferMinutes;
    if (orgSettings.branding) branding = { ...branding, ...orgSettings.branding };
    if (orgSettings.defaultBookingLimits)
      bookingLimits = { ...orgSettings.defaultBookingLimits };
  }

  // Apply provider settings (override org)
  if (providerSettings) {
    if (providerSettings.timezone) timezone = providerSettings.timezone;
    if (providerSettings.currency) currency = providerSettings.currency;
    if (providerSettings.bufferMinutes !== undefined)
      bufferMinutes = providerSettings.bufferMinutes;
    if (providerSettings.branding)
      branding = { ...branding, ...providerSettings.branding };
    if (providerSettings.bookingLimits)
      bookingLimits = { ...bookingLimits, ...providerSettings.bookingLimits };
  }

  // Apply event type settings (override provider)
  if (eventTypeSettings) {
    if (eventTypeSettings.timezone) timezone = eventTypeSettings.timezone;
    if (eventTypeSettings.currency) currency = eventTypeSettings.currency;
    if (eventTypeSettings.bufferBefore !== undefined)
      bufferMinutes = eventTypeSettings.bufferBefore;
    if (eventTypeSettings.bookingLimits)
      bookingLimits = { ...bookingLimits, ...eventTypeSettings.bookingLimits };
  }

  return { timezone, currency, bufferMinutes, branding, bookingLimits };
}

// ---------------------------------------------------------------------------
// Role-Based Access Control
// ---------------------------------------------------------------------------

/** Permissions granted to each role */
const ROLE_PERMISSIONS: Record<OrgRole, OrgPermission[]> = {
  owner: [
    "manage:members",
    "manage:teams",
    "manage:event-types",
    "view:all-bookings",
    "view:own-bookings",
    "manage:own-availability",
    "view:analytics",
    "manage:organization",
  ],
  admin: [
    "manage:teams",
    "manage:event-types",
    "view:all-bookings",
    "view:own-bookings",
    "manage:own-availability",
    "view:analytics",
  ],
  member: [
    "view:own-bookings",
    "manage:own-availability",
  ],
};

/**
 * Get all permissions granted to a role.
 *
 * @param role - The organization role
 * @returns Array of permissions
 */
export function getRolePermissions(role: OrgRole): OrgPermission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Check if a role has a specific permission.
 *
 * @param role - The organization role
 * @param permission - The permission to check
 * @returns Whether the role has the permission
 */
export function roleHasPermission(
  role: OrgRole,
  permission: OrgPermission,
): boolean {
  return getRolePermissions(role).includes(permission);
}

/**
 * Assert that an org member has a required permission.
 *
 * @param member - The org member
 * @param permission - The required permission
 * @throws {TenantAuthorizationError} If the member lacks the permission
 */
export function assertOrgPermission(
  member: OrgMember,
  permission: OrgPermission,
): void {
  if (!roleHasPermission(member.role, permission)) {
    throw new TenantAuthorizationError(
      `Role "${member.role}" does not have permission: "${permission}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// Tenant Scoping
// ---------------------------------------------------------------------------

/**
 * Validate that a resource belongs to the expected organization.
 *
 * @param resourceOrgId - Organization ID on the resource
 * @param expectedOrgId - The org ID from the authenticated context
 * @throws {TenantAuthorizationError} If there is a tenant mismatch
 */
export function assertTenantScope(
  resourceOrgId: string | null | undefined,
  expectedOrgId: string,
): void {
  if (resourceOrgId && resourceOrgId !== expectedOrgId) {
    throw new TenantAuthorizationError(
      "Resource does not belong to the current organization",
    );
  }
}

/**
 * Generate the public booking URL for an organization's provider/event type.
 *
 * @param orgSlug - Organization slug
 * @param providerSlug - Provider slug or ID
 * @param eventTypeSlug - Event type slug
 * @param baseUrl - Base URL of the application
 * @returns Full booking URL
 */
export function buildOrgBookingUrl(
  orgSlug: string,
  providerSlug: string,
  eventTypeSlug: string,
  baseUrl: string,
): string {
  return `${baseUrl}/${orgSlug}/${providerSlug}/${eventTypeSlug}`;
}

/**
 * Parse an organization slug from a booking URL path.
 *
 * Expected format: `/{orgSlug}/{providerSlug}/{eventTypeSlug}`
 *
 * @param pathname - URL pathname
 * @returns Parsed segments, or null if format is invalid
 */
export function parseOrgBookingPath(pathname: string): {
  orgSlug: string;
  providerSlug: string;
  eventTypeSlug: string;
} | null {
  const match = pathname.match(/^\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) return null;

  return {
    orgSlug: match[1],
    providerSlug: match[2],
    eventTypeSlug: match[3],
  };
}
