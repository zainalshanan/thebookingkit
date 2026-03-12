# @thebookingkit/server

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
