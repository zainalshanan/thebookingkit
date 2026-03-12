# @thebookingkit/core

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
