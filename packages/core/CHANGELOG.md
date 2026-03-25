# @thebookingkit/core

## 0.2.0

### Minor Changes (2026-03-25)

Two major features plus an internal decomposition for better reusability.

### New Features

#### Slot Release Strategies (`slot-release.ts`) — E-23

- **`applySlotRelease()`** — Control when time slots become visible to customers. Three strategies:
  - `fill_earlier_first`: Hide later time windows (e.g., afternoon) until earlier ones (e.g., morning) reach a fill threshold. Configurable via `windowBoundaries` (HH:mm) and `threshold` (0-100%).
  - `rolling_window`: Only show slots within N hours or days from now. Ideal for restaurants releasing dinner slots day-of.
  - `discount_incentive`: All slots remain visible, but harder-to-fill ones are annotated with `releaseMetadata.discountPercent` for dynamic pricing integration.
- **`computeWindowFillRates()`** — Exported helper to compute fill rates per time window for custom strategies.
- New types: `SlotReleaseConfig`, `FillEarlierFirstConfig`, `RollingWindowConfig`, `DiscountIncentiveConfig`, `SlotReleaseStrategy`, `SlotReleaseResult`
- `SlotComputeOptions` extended with optional `slotRelease` field (backward-compatible)
- `Slot` extended with optional `releaseMetadata` field (backward-compatible)
- Integrated into both `getAvailableSlots()` and `getResourceAvailableSlots()` — opt-in via `options.slotRelease`
- 44 new tests including 4 fast-check property-based invariants

#### Resource & Capacity Booking (`resource-engine.ts`) — E-22

#### Resource Engine (`resource-engine.ts`)

- **`getResourceAvailableSlots()`** — Compute capacity-aware available slots across a pool of resources. Runs the three-step pipeline (RRULE → overrides → filter) per-resource, then merges into a pool view with `availableResources` and `remainingCapacity` per slot.
- **`assignResource()`** — Auto-assign the best resource for a booking using four strategies: `best_fit` (smallest that fits), `first_available`, `round_robin`, and `largest_first`.
- **`isResourceSlotAvailable()`** — Quick single-slot availability check for a specific resource or pool-level (any resource).
- **`getResourcePoolSummary()`** — Admin dashboard utilization metrics with per-type breakdown and `utilizationPercent`.

#### Shared Pipeline Extraction (`slot-pipeline.ts`)

- Extracted Steps 1 (RRULE expansion) and 2 (override masking) from `slot-engine.ts` into shared internal utilities: `expandRules()`, `applyOverrides()`, `generateCandidateSlots()`, `formatSlots()`.
- Both `getAvailableSlots()` and `getResourceAvailableSlots()` now share the same pipeline code — bug fixes propagate to both paths.

#### New Types

- `ResourceInput`, `ResourcePoolInput`, `AvailableResource`, `ResourceSlot`, `ResourceAssignmentStrategy`, `ResourceAssignmentResult`, `ResourceSlotAvailabilityResult`, `ResourcePoolSummary`, `ResourceSlotOptions`
- `ResourceUnavailableError` with typed reasons: `no_capacity`, `no_matching_type`, `all_booked`
- `BookingInput` extended with optional `resourceId` and `guestCount` fields (backward-compatible)

#### Conflict Detection Decomposition (`kiosk.ts`)

- **`findConflicts()`** — Generic overlap detection extracted from `validateReschedule()`. Accepts any `ConflictCheckBooking[]`, checks half-open interval overlap, excludes inactive statuses (`cancelled`, `no_show`, `rejected`), supports `excludeId` for self-exclusion during rescheduling.
- **`canReschedule()`** — Status check extracted from `validateReschedule()`. Only `confirmed` and `pending` bookings are reschedulable.
- **`describeConflicts()`** — Human-readable conflict descriptions extracted from inline formatting. Accepts an optional `formatTime` function for custom time formatting.
- New types: `ConflictCheckBooking`, `ConflictDetail`
- Both `validateReschedule` and `validateBreakBlock` now delegate to `findConflicts()` internally — eliminates duplicated overlap logic.

#### Performance

- Hot-loop optimization: pre-computed epoch-ms buffered bookings with zero-allocation overlap checks
- 30-day / 50-resource computation: ~45ms (budget: 200ms)
- Single slot check / 50 resources: ~5ms (budget: 50ms)

#### Tests

- 68+ unit tests covering all four functions, edge cases, and boundary conditions
- 5 property-based invariants × 500 random cases via fast-check
- Performance budget assertions

## 0.1.5

### Minor Changes — QA Audit (2026-03-12)

49 bugs fixed across the full monorepo. This release covers 13 fixes in `@thebookingkit/core`.

### Bug Fixes

#### Critical

- **C1** — Midnight-crossing availability windows (e.g. 22:00–02:00) now produce correct slots instead of zero slots (`slot-engine.ts`)
- **C2** — Slot filter uses a single `now` reference time instead of calling `new Date()` per-slot. Added `now` option to `SlotComputeOptions` (`slot-engine.ts`, `types.ts`)
- **C3** — RRULE `dtstart` preserved from original rule when `BYDAY` is present, preventing occurrence anchoring shifts (`rrule-parser.ts`)

#### High

- **H1** — `filterSlotsByLimits` now increments daily/weekly booking counters after a slot passes all checks (`booking-limits.ts`)
- **H4** — `estimateWaitTime` merges overlapping booking intervals before summing, eliminating double-counting (`walk-in.ts`)
- **H8** — `evaluateCondition` handles array responses element-wise for `equals`, `not_equals`, `contains` operators instead of joining to a string (`routing-forms.ts`)

#### Medium

- **M11** — `validateQuestionResponses` now validates `multi_select` answers against allowed options and rejects empty arrays for required questions (`event-types.ts`)
- **M13** — `breakBlockToOverride` returns the break's specific time window instead of marking the entire day unavailable (`kiosk.ts`)
- **M14** — `generateEmbedSnippet` HTML-escapes all user-supplied values to prevent XSS attribute injection (`embed.ts`)

#### Low

- **L2** — `generateSlug` returns `"untitled"` instead of empty string when title contains only special characters (`event-types.ts`)
- **L4** — `evaluateCancellationFee` throws `PaymentValidationError` when `cancelledAt` is after `bookingStartsAt` instead of silently falling through (`payments.ts`)
- **L6** — `reorderQueue` appends unmentioned queue entries after explicitly ordered ones instead of silently dropping them (`walk-in.ts`)
- **L7** — `getAutoRejectDeadline` clamps `timeoutHours` to a minimum of 1, preventing negative/zero values from creating instant auto-rejection deadlines (`confirmation-mode.ts`)

## 0.1.1

### Patch Changes

- Initial release of The Booking Kit packages.
