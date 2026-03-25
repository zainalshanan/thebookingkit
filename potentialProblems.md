# Potential Problems — Full Monorepo Audit

> **Audited:** 2026-03-25 | **Packages:** core, db, d1, server, cli, demo

---

## Critical (fix immediately)

| # | Package | Category | Description |
|---|---------|----------|-------------|
| C1 | core | Conflicting | **DONE** — **Inconsistent "inactive" status lists across modules.** `slot-engine.ts` excludes `cancelled`/`rejected`. `kiosk.ts` also excludes `no_show`. `recurring-bookings.ts` also excludes `completed`. A `no_show` booking blocks slot availability but NOT kiosk conflict checks — admin sees "free" but engine says "booked." **Fix:** Define a single `INACTIVE_BOOKING_STATUSES` constant and use everywhere. |
| C2 | db | Migration | **DONE** — **`0005_resources.sql` not in migration runner.** `migrate.ts` lists only `0001`–`0004`. The entire resource/capacity feature won't deploy. **Fix:** Add `"0005_resources.sql"` to the `migrationFiles` array. |
| C3 | db | Migration | **DONE** — **Audit trigger crashes on non-status UPDATEs.** `0002_booking_audit_trigger.sql` uses `'updated'` as event type, but this is not in the `booking_event_type` enum. Any metadata/phone/notes update will throw. **Fix:** Add `'updated'` to the enum, or use an existing fallback. |
| C4 | server | Security | **DONE** — **Manual XOR timing comparison instead of `crypto.timingSafeEqual`.** `api.ts` and `webhooks.ts` hand-roll constant-time comparison. `booking-tokens.ts` correctly uses the native. **Fix:** Replace with `crypto.timingSafeEqual` in both files. |

---

## High (fix before v1.0)

| # | Package | Category | Description |
|---|---------|----------|-------------|
| H1 | core | Duplicate | **DONE** — **Active booking filter repeated 10+ times.** `b.status !== "cancelled" && b.status !== "rejected"` appears in slot-engine, resource-engine, slot-release, booking-limits, walk-in, recurring-bookings. **Fix:** Extract shared `getActiveBookings()` utility. |
| H2 | core | Duplicate | **SKIP** — **4 separate overlap-checking implementations.** `slot-engine` uses `areIntervalsOverlapping`, `resource-engine` uses manual epoch-ms, `kiosk.ts` uses manual epoch-ms, `recurring-bookings` uses Date comparison. All produce half-open semantics. **Fix:** Extract a single `intervalsOverlap()` utility. |
| H3 | core | Duplicate | **SKIP** — **`isSlotAvailable` fully duplicated in `checkSingleResource`.** ~130 lines of near-identical code (blocked-date check, RRULE expansion, midnight-crossing, override check, booking conflicts). **Fix:** Extract common availability-window-checking into shared function. |
| H4 | core | Missing error | **DONE** — **Infinite loop on zero/negative `slotInterval`.** `generateCandidateSlots` in `slot-pipeline.ts` has `while(true)` with no guard. `slotInterval: 0` hangs forever. **Fix:** Add `if (slotInterval <= 0) throw`. |
| H5 | core | Bug | **DONE** — **`breakBlockToOverride` uses local time methods on UTC dates.** `block.startTime.getHours()` returns server-local hours, not provider-timezone hours. Wrong on any non-matching server. **Fix:** Use `toZonedTime` + `format` with provider timezone. |
| H6 | core | Type safety | **DONE** — **`BookingInput.status` is `string` not a union type.** The entire codebase compares against specific literals but TypeScript can't catch typos. `BookingStatus` union already exists in `confirmation-mode.ts`. **Fix:** Type `status` as `BookingStatus`. |
| H7 | db | Schema | **DONE** — **Inconsistent/missing `onDelete` on foreign keys.** `bookings.eventTypeId` and `bookings.providerId` have no `onDelete`. `eventTypes.providerId` has `cascade`. Deleting a provider cascades to event types but leaves orphaned bookings. **Fix:** Add `onDelete: "restrict"` on financial/booking FKs. |
| H8 | db | Schema | **DONE** — **Missing composite index on `bookings(provider_id, starts_at)`.** Slot computation queries filter by both columns. Separate single-column indexes can't efficiently combine for range scans. **Fix:** Add composite index. |
| H9 | d1 | Adapter gap | **DONE** — **No D1 helper for provider `availability_rules` rows.** Resource rules have a converter but provider rules (the more fundamental case) do not. **Fix:** Add `d1AvailabilityRuleRowsToInputs()`. |
| H10 | d1 | Adapter gap | **DONE** — **`RESOURCE_DDL` missing `organization_id` and `slug` columns.** Postgres schema has them, D1 DDL does not. Multi-tenancy and slug-based lookups impossible in D1. **Fix:** Add both columns. |
| H11 | server | Error handling | **DONE** — **`withAuth` swallows all non-auth errors silently.** Returns generic 500 with no logging. Database failures, validation errors, null references all hidden. **Fix:** Add error logging and map known error classes to proper status codes. |
| H12 | server | Error handling | **DONE** — **Role type mismatch.** `AuthUser.role` includes `"customer"` but not `"member"`. `WithAuthOptions.requiredRole` includes `"member"` but not `"customer"`. `ROLE_HIERARCHY` doesn't cover `"customer"`. **Fix:** Unify role types. |
| H13 | server | Missing integration | **DONE** — **E-22 and E-23 not wired into server package.** `ResourceUnavailableError` not re-exported. No API validation helpers for resource slots. No slot release integration. **Fix:** Add re-exports and helpers. |

---

## Medium

| # | Package | Category | Description |
|---|---------|----------|-------------|
| M1 | core | Conflicting | **DONE** — **`PaymentType` vs `PaymentRecord.paymentType` string mismatch.** Type uses `"prepay"`, record uses `"prepayment"`. **Fix:** Align strings and wire the type. |
| M2 | core | Bug | **SKIP** — **`computeRemainingCapacity` always returns full capacity in `checkSingleResource`.** The conflict loop above already rejected any overlap, so remaining capacity is always `resource.capacity`. **Fix:** Make conflict check capacity-aware. |
| M3 | core | Missing error | **DONE** — **No timezone validation on provider rules.** Invalid IANA strings (e.g., `"EST"`) silently produce wrong results. `isValidTimezone()` exists but is never called in the pipeline. **Fix:** Validate on first use. |
| M4 | core | Inconsistent | **SKIP** — **throw vs return for failure signaling.** `assignHost` throws plain `Error`, `assignResource` throws typed `ResourceUnavailableError`, `computeBookingLimits` returns `{ canBook: false }`. **Fix:** Adopt consistent convention. |
| M5 | core | Inconsistent | **DONE** — **Unpadded date keys in `booking-limits.ts`.** `utcDateKey` returns `"2026-2-5"`, everywhere else uses `"2026-02-05"`. **Fix:** Reuse `formatDateOnly` from `slot-pipeline.ts`. |
| M6 | core | Type safety | **DONE** — **`reason` fields typed as `string` instead of unions.** `ResourceAssignmentResult.reason` and `AssignmentResult.reason` only ever set to known literals. **Fix:** Type as string literal unions. |
| M7 | db | Schema | **DONE** — **`resourceAvailabilityRules` columns nullable where provider equivalents are not.** `startTime`, `endTime`, `timezone` should be `.notNull()`. **Fix:** Add `.notNull()`. |
| M8 | db | Schema | **DONE** — **Missing index on `team_members(user_id)`.** User-scoped team lookups require full table scan. **Fix:** Add index. |
| M9 | db | Migration | **DONE** — **`v_metadata` is NULL on status-change path in audit trigger.** `NULL || jsonb_build_object(...)` = `NULL`. Metadata lost for all status changes. **Fix:** Initialize `v_metadata := '{}'::jsonb` before status check. |
| M10 | db | Migration | **DONE** — **`create_booking()` missing `source` parameter.** All bookings created via function default to `'online'`. Walk-in/phone/admin bookings can't use it. **Fix:** Add `p_source` parameter. |
| M11 | db | Migration | **DONE** — **Duplicate `create_booking()` across `0004` and `0005`.** Entire function body copy-pasted. **Fix:** Keep only the version in `0005`. |
| M12 | db | Security | **DONE** — **GDPR anonymize uses `LIKE` on JSONB cast.** Unescaped metacharacters and non-deterministic key ordering make search unreliable. **Fix:** Use JSONB containment operators. |
| M13 | db | Schema | **DONE** — **Organization FK `onDelete` behavior undeclared everywhere.** Defaults to `NO ACTION` but intent is unclear. **Fix:** Explicitly declare `onDelete: "restrict"`. |
| M14 | db | Type export | **DONE** — **Enum union types not exported.** Consumers can't type variables as `BookingStatus` from the db package. **Fix:** Export derived union types. |
| M15 | d1 | Adapter gap | **DEFER** — **No D1 DDL for core booking tables.** Only resource tables and booking_locks have DDL. **Fix:** Add `CORE_DDL` constant. |
| M16 | server | Duplicate | **DONE** — **Duplicate SSRF validation regex.** Identical logic in `webhooks.ts` and `workflows.ts`. **Fix:** Extract shared `validateExternalUrl()`. |
| M17 | server | Error handling | **DONE** — **`parseOrgBookingPath` doesn't validate slug format.** Permissive regex accepts characters that `buildOrgBookingUrl` would reject. **Fix:** Apply `SLUG_RE` validation. |
| M18 | server | Security | **DONE** — **No JSON escaping in webhook payload template resolution.** User-controlled values can break JSON structure. **Fix:** JSON-escape substituted values. |
| M19 | server | Security | **DONE** — **No HTML escaping in workflow template resolution.** `resolveTemplateVariables` does plain replacement, unlike `interpolateTemplate` which escapes. **Fix:** Apply `escapeHtml` when destined for email. |
| M20 | server | Missing integration | **DEFER** — **Missing webhook triggers for new features.** No events for resource bookings, walk-in queue, slot release, recurring series. **Fix:** Extend `WebhookTrigger` union. |
| M21 | server | Missing integration | **DEFER** — **Missing job names for new features.** `JOB_NAMES` doesn't cover walk-in, resource, recurring, or slot release workflows. **Fix:** Add entries. |
| M22 | demo | Bug | **DONE** — **Hardcoded EST offset wrong during EDT.** `makeET` uses `+5` hours but EDT is `+4`. Demo seed data is off by 1 hour March–November. **Fix:** Use `fromZonedTime` from `date-fns-tz`. |
| M23 | db | Security | **DONE** — **No SSL or pool config on `createDb`.** Connects without SSL by default. **Fix:** Accept config options, default SSL to `'require'`. |

---

## Low

| # | Package | Category | Description |
|---|---------|----------|-------------|
| L1 | core | Duplicate | **DONE** — **`formatDateOnly` duplicated as `formatDateStr` in `rrule-parser.ts`.** Identical logic, different names. **Fix:** Import from `slot-pipeline.ts`. |
| L2 | core | Duplicate | **DONE** — **Provider timezone resolution repeated.** `rules[0].timezone ?? "UTC"` pattern in 4 places. **Fix:** Extract `resolveProviderTimezone()`. |
| L3 | core | Unused | **SKIP** — **`ResourcePoolInput` type never imported by consumers.** **Fix:** Remove export or defer until used. |
| L4 | core | Unused | **SKIP** — **`SlotReleaseStrategy` type never imported by consumers.** **Fix:** Remove or document as utility. |
| L5 | core | Unused | **DONE** — **`PaymentType` and `HoldStatus` never imported.** Also `PaymentType` mismatches `PaymentRecord.paymentType`. **Fix:** Wire or remove. |
| L6 | core | Inconsistent | **DEFER** — **`now` parameter injection varies by function.** Some use `options.now`, some use direct param, some don't offer it. **Fix:** Standardize on `options.now`. |
| L7 | core | Type safety | **DONE** — **`canReschedule` accepts `string` instead of `BookingStatus`.** **Fix:** Type parameter once H6 is resolved. |
| L8 | core | Type safety | **DONE** — **Inline `BookingInput & { id?: string }` repeated 5 times in `kiosk.ts`.** **Fix:** Add `id?: string` to `BookingInput` or create named type. |
| L9 | core | Type safety | **DONE** — **`recurring-bookings.ts` defines private `ExistingBooking` duplicating `BookingInput`.** **Fix:** Use `BookingInput`. |
| L10 | core | Dead code | **SKIP** — **`bookingOverlaps` helper used only once in `resource-engine.ts`.** **Fix:** Inline or use in `checkSingleResource` too. |
| L11 | core | Dead code | **SKIP** — **`computeRemainingCapacity` (Date-based) redundant with fast version.** **Fix:** Consolidate. |
| L12 | db | Schema | **DONE** — **Redundant index on already-unique `slug` columns.** `eventTypes` and `resources` have both `.unique()` and explicit index. **Fix:** Remove redundant indexes. |
| L13 | db | Dead code | **DONE** — **`questionFieldTypeEnum` imported but never used in any table.** **Fix:** Wire up or remove. |
| L14 | db | Schema | **DEFER** — **JSONB columns lack typed shape documentation.** Mix of `{}` and `[]` defaults undocumented. **Fix:** Add JSDoc or use `.$type<T>()`. |
| L15 | db | Schema | **DONE** — **Mutable tables missing `updatedAt`.** `bookingSeats` (status changes) and `customerPreferences` (opt-out changes) have no `updatedAt`. **Fix:** Add to mutable tables. |
| L16 | db | Migration | **DONE** — **Fragile script-detection logic in `migrate.ts`.** Breaks with symlinks or Windows. **Fix:** Use URL-based comparison. |
| L17 | db | Duplicate | **SKIP** — **Drizzle schema and SQL migration duplicate table definitions.** Can drift apart. **Fix:** Document source of truth. |
| L18 | d1 | Duplicate | **DONE** — **Override-row-to-input conversion identical between booking and resource helpers.** **Fix:** Extract shared mapper. |
| L19 | server | Duplicate | **DONE** — **Date formatting functions duplicated between `workflows.ts` and `notification-jobs.ts`.** **Fix:** Extract shared utility. |
| L20 | server | Dead code | **DONE** — **`JOB_NAMES` double-exported from `notification-jobs.ts`.** Already exported via adapters barrel. **Fix:** Remove redundant re-export. |
| L21 | server | Dead code | **DONE** — **`DEFAULT_MANIFEST` exported but unsafe to mutate.** JSDoc says don't use it. **Fix:** Stop exporting or freeze. |
| L22 | server | Stale | **DEFER** — **`X-SlotKit-*` webhook header names.** Old branding. **Fix:** Rename (breaking change, coordinate with major version). |
| L23 | cli | Stale | **DEFER** — **`SlotKitManifest` and `SlotKitConfig` type names.** Old branding. **Fix:** Rename. |
| L24 | demo | Duplicate | **DONE** — **`makeET` and day-offset helpers duplicated between barber and restaurant data.** **Fix:** Extract `demo-utils.ts`. |
| L25 | demo | Duplicate | **DONE** — **Day-range setup pattern copy-pasted 5 times in `actions.ts`.** **Fix:** Extract `buildDayRange()`. |

---

## Summary

| Severity | Count | Status Breakdown | Key Themes |
|----------|-------|---|------------|
| **Critical** | 4 | 4 DONE, 0 SKIP, 0 DEFER | Inconsistent status lists, missing migration in runner, audit trigger crash, insecure timing comparison |
| **High** | 13 | 11 DONE, 2 SKIP, 0 DEFER | Duplicated logic (active filter ×10, overlap ×4, isSlotAvailable ×2), infinite loop risk, timezone bug, type safety, missing server integration |
| **Medium** | 23 | 16 DONE, 2 SKIP, 5 DEFER | Schema gaps, migration bugs, security (SSRF, XSS, JSON injection), D1 adapter gaps, missing webhook triggers |
| **Low** | 25 | 19 DONE, 7 SKIP, 3 DEFER | Dead code, unused exports, stale branding, minor duplications, documentation gaps |
| **Total** | **65** | **50 DONE, 11 SKIP, 8 DEFER** | |

### Top 5 Priorities

1. **C1 + H1**: Unify inactive status list + extract shared `getActiveBookings()` — affects correctness across the entire engine
2. **C2**: Add `0005_resources.sql` to migration runner — entire E-22 feature is undeployable without it
3. **C3 + M9**: Fix audit trigger (`'updated'` enum + NULL metadata) — breaks all non-status booking updates
4. **C4 + H11**: Replace manual XOR with `timingSafeEqual` + fix `withAuth` error swallowing — security + debuggability
5. **H3 + H2**: Deduplicate `isSlotAvailable`/`checkSingleResource` + unify overlap checking — reduces 200+ lines of duplicate logic
