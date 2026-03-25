# @thebookingkit/server

## 0.2.0

### Minor Changes (2026-03-25)

#### Webhook Triggers (E-24)

- **12 new webhook triggers:** `BOOKING_COMPLETED`, `RESOURCE_BOOKED`, `RESOURCE_RELEASED`, `WALK_IN_ADDED`, `WALK_IN_STARTED`, `WALK_IN_COMPLETED`, `WALK_IN_CANCELLED`, `SLOT_RELEASED`, `RECURRING_SERIES_CREATED`, `OCCURRENCE_CANCELLED`, `OCCURRENCE_RESCHEDULED`, `PAYMENT_REFUNDED`
- Total triggers: 21 (9 existing + 12 new)

#### Job Names (E-24)

- **5 new background job names:** `SEND_WALK_IN_NOTIFICATION`, `SEND_RESOURCE_BOOKING_CONFIRMATION`, `PROCESS_RECURRING_SERIES`, `PROCESS_SLOT_RELEASE`, `ADVANCE_WALK_IN_QUEUE`

#### Security & Error Handling (Audit Fixes)

- Replaced manual XOR timing comparison with `crypto.timingSafeEqual` in `verifyApiKey` and `verifyWebhookSignature`
- `withAuth` now logs unhandled errors and maps `BookingConflictError` (409) and `ResourceUnavailableError` (409) to proper status codes
- Unified role types: `AuthUser.role` and `WithAuthOptions.requiredRole` now both support `"admin" | "provider" | "member" | "customer"`
- JSON-escaped webhook payload template values to prevent injection
- HTML-escaped workflow template variables when destined for email
- Extracted shared SSRF validator (`validateExternalUrl`)
- `parseOrgBookingPath` now validates slugs against `SLUG_RE`

#### Platform Integration

- Re-exported `ResourceUnavailableError`, resource engine functions, and slot release functions from `@thebookingkit/core`

#### Branding

- Webhook headers renamed: `X-SlotKit-*` → `X-BookingKit-*`

## 0.1.5

### Minor Changes — QA Audit (2026-03-12)

14 bugs fixed in `@thebookingkit/server`.

### Bug Fixes

#### Critical

- **C1** — `generateBookingToken` uses the full 256-bit (64 hex char) HMAC signature instead of truncating to 64 bits via `.slice(0, 16)` (`booking-tokens.ts`)
- **C2** — `verifyBookingToken` uses `crypto.timingSafeEqual` for constant-time signature comparison instead of `!==` (`booking-tokens.ts`)

#### High

- **H1** — `withAuth` catches unexpected errors and returns a sanitized 500 JSON response instead of rethrowing raw errors that leak internal stack traces (`auth.ts`)
- **H2** — Role check uses a hierarchy (`admin > provider > member`) so admin users can access provider-scoped routes (`auth.ts`)
- **H3** — `validateWebhookSubscription` rejects non-HTTPS URLs and blocks private/loopback IP ranges (127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x, localhost, ::1) to prevent SSRF (`webhooks.ts`)
- **H4** — `fire_webhook` workflow action applies the same SSRF validation as webhook subscriptions (`workflows.ts`)
- **H5** — `validateSlotQueryParams` validates `providerId` and `eventTypeId` against UUID regex format (`api.ts`)

#### Medium

- **M3** — `assertTenantScope` throws `TenantAuthorizationError` when `resourceOrgId` is null/undefined instead of silently passing (`multi-tenancy.ts`)
- **M4** — `resolvePayloadTemplate` escapes curly braces in substitution values to prevent recursive template injection (`webhooks.ts`)
- **M6** — `interpolateTemplate` HTML-escapes all substituted values (`&`, `<`, `>`, `"`, `'`) to prevent XSS in HTML emails (`email-templates.ts`)
- **M7** — `validateSlotQueryParams` rejects date ranges exceeding 90 days to prevent DoS via unbounded RRULE expansion (`api.ts`)
- **M8** — `buildOrgBookingUrl` validates slug arguments against a safe regex, rejecting path traversal, null bytes, slashes, and HTML (`multi-tenancy.ts`)

#### Low

- **L2** — `formatTime`/`formatDate` accept and use an optional `timeZone` parameter for timezone-aware formatting instead of using server locale (`workflows.ts`)
- **L3** — `escapeICS` strips bare carriage return (`\r`) characters to prevent ICS line structure injection (`adapters/email-adapter.ts`)

### Dependencies

- Updated `@thebookingkit/core` to `^0.1.5`

## 0.1.1

### Patch Changes

- Initial release of The Booking Kit packages.
- Updated dependencies
  - @thebookingkit/core@0.1.1
