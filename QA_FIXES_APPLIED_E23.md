# E-23 QA and Architecture Review Fixes Applied

**Date Applied:** 2026-03-25
**Epic:** E-23 — Slot Release Strategy
**File Updated:** `/Users/zain/Desktop/Projects/thebookingkit/user-stories/E-23_slot_release_strategy.md`

---

## Summary

All nine QA and architecture review fixes have been applied to the E-23 epic specification. The fixes enhance clarity of the `applySlotRelease()` dispatcher, correct discountMap key matching logic, fix resource-engine integration concerns, add missing edge case handling for optional window boundaries, improve DST test coverage, and add architectural notes on composability and composability responsibility.

---

## Fixes Applied

### F1 (High) — applySlotRelease() Dispatcher Specification [APPLIED]

**Location:** S05 (E23-S05)

**Changes:**
- Added full function signature specification for `applySlotRelease()`:
  ```typescript
  applySlotRelease(
    slots: Array<{ start: Date; end: Date }>,
    config: SlotReleaseConfig,
    existingBookings: BookingInput[],
    providerTimezone: string,
    now: Date
  ): SlotReleaseResult
  ```
- Defined `SlotReleaseResult = { slots: Array<{ start: Date; end: Date }>, discountMap: Map<number, number> }`
- Clarified that keys are "slot start time in milliseconds"
- Documented dispatcher pattern:
  - `"rolling_window"` → `applyRollingWindow()`
  - `"fill_earlier_first"` → `applyFillEarlierFirst()`
  - `"discount_incentive"` → `applyDiscountIncentive()`
- Noted that non-discount strategies return empty Map for `discountMap`

### F2 (High) — Fix discountMap Key Lookup [APPLIED]

**Location:** S05 (E23-S05) and Technical Notes → Discount Metadata Integration

**Changes:**
- S05 AC: Changed from "ISO string matches a key" to "slot start time in milliseconds (i.e., `new Date(slot.startTime).getTime()`) matches a key"
- Technical Notes section: Added explicit clarification that matching uses `new Date(slot.startTime).getTime()` as the lookup key
- Provided complete example code showing milliseconds-based matching pattern
- Ensured consistency across both references

### F3/F4 (Medium) — Fix S06 Resource-Engine Integration [APPLIED]

**Location:** S06 (E23-S06)

**Changes:**
- Fixed slot assembly pattern:
  - "Extract raw `{ start, end }` slot pairs from `slotMap` keys (which are `"startMs|endMs"` strings) before passing to release filter"
  - Key construction: `const { start, end } = { start: new Date(startMs), end: new Date(endMs) }`
- Added explicit aggregation instruction: `const allPoolBookings = pool.flatMap(r => r.bookings)`
- Added timezone derivation: `const providerTz = pool.length > 0 && pool[0].rules.length > 0 ? pool[0].rules[0].timezone : "UTC"`
- Clarified insertion point: "after candidate slot processing and before result assembly" (logical reference, not line number)
- Fixed reference from non-existent `mergedSlots` to actual `extractedSlots` variable name

### F5 (Medium) — Resolve Optional windowBoundaries [APPLIED]

**Location:** S04 (E23-S04)

**Changes:**
- Added acceptance criterion: "When `windowBoundaries` is omitted or empty, the entire day is treated as a single window (fill rate computed across all slots for that calendar day)."

### F6 (Medium) — Fall-Back DST Test Case [APPLIED]

**Location:** S08 (E23-S08) → Fill Earlier First Tests

**Changes:**
- Added new test case for fall-back DST: "On fall-back day, window boundary '01:30' uses the first occurrence (standard time interpretation)"
- Complements existing spring-forward DST test case for comprehensive DST coverage

### F8 (Low) — Fix Test Scenario Fill Rate [APPLIED]

**Location:** S08 (E23-S08) → Discount Incentive Tests

**Changes:**
- Changed "First match wins" test from "fill rate 50%" to "fill rate 20% (below both tier thresholds of 30% and 60%)"
- This correctly demonstrates first-match-wins behavior where fill rate is below multiple tier thresholds but only the first matching tier is applied

### F9 (Low) — Remove Spurious Dependencies [APPLIED]

**Location:** Summary Table

**Changes:**
- S03 dependencies: Changed from "S01, S02" to "S01" only (S02 is not required for S03)
- Note: S04 dependencies remain "S01, S03" (already correct)

---

## Architecture Review Additions

### Composability Note [APPLIED]

**Location:** Technical Notes → Composability & Caller Responsibility

**Changes Added:**
- Clarified that `filterSlotsByLimits()` composability is the caller's responsibility (not wired into `getAvailableSlots`)
- Documented that when both booking limits and slot release are enabled, the caller must compose them explicitly
- Intentional design choice to maintain separation of concerns and flexibility

### Cross-Window Booking Behavior [APPLIED]

**Location:** Technical Notes → Composability & Caller Responsibility

**Changes Added:**
- Documented that cross-window bookings (spanning a window boundary) are counted in both windows
- Clarified this is intentional, conservative behavior for fill rate calculation
- Ensures windows at boundaries release conservatively, preserving user experience consistency

### Implementation Insertion Points [APPLIED]

**Location:** Technical Notes → Implementation Insertion Points

**Changes Added:**
- Replaced brittle line-number references with logical insertion points
- Slot-engine.ts: "Apply release filter after availableSlots filter, before formatSlots"
- Resource-engine.ts: "Apply release filter after availableSlots filter, before formatSlots (specifically after candidate slot processing and before result assembly)"
- Improves maintainability by decoupling specification from implementation details

---

## Verification

All changes have been applied to the single source file:
- **File:** `/Users/zain/Desktop/Projects/thebookingkit/user-stories/E-23_slot_release_strategy.md`

The epic is now ready for implementation with:
- ✅ Clear dispatcher function specification
- ✅ Correct discountMap key matching logic
- ✅ Comprehensive resource-engine integration guidance
- ✅ Complete edge case handling
- ✅ Robust DST test coverage
- ✅ Architectural clarity on composability
- ✅ Logical insertion points instead of line numbers

---

## Next Steps

Developers implementing E-23 should:
1. Review the updated S05 and S06 specifications for dispatcher and integration details
2. Reference the logical insertion points in Technical Notes when wiring filters
3. Implement the fall-back DST test case in S08
4. Use the corrected fill rate 20% test scenario for discount incentive testing
5. Ensure composability is documented in their implementation's JSDoc comments
