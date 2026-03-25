/**
 * Internal shared helpers for @thebookingkit/d1.
 *
 * This module is NOT part of the public API. It exists solely to deduplicate
 * logic shared between booking-helpers.ts and resource-helpers.ts.
 * Do not import this module from application code — import from the package
 * root instead.
 */

import type { AvailabilityOverrideInput } from "@thebookingkit/core";
import { D1DateCodec } from "./codec.js";

/**
 * Minimal row shape accepted by the shared override mapper.
 *
 * Both `D1AvailabilityOverrideRow` (booking-helpers) and
 * `D1ResourceAvailabilityOverrideRow` (resource-helpers) satisfy this
 * interface. The optional `reason` field is present on resource rows but not
 * on provider override rows; it is accepted but intentionally ignored because
 * `AvailabilityOverrideInput` has no `reason` field.
 */
export interface OverrideRowLike {
  date: string;
  startTime: string | null;
  endTime: string | null;
  isUnavailable: number | boolean;
  reason?: string | null;
}

/**
 * Map a single raw D1 override row to an `AvailabilityOverrideInput`.
 *
 * Shared by `d1OverrideRowsToInputs` (booking-helpers) and
 * `d1ResourceOverrideRowsToInputs` (resource-helpers) to ensure identical
 * decoding behaviour for both provider and resource override tables.
 *
 * @param row - Raw override row from D1.
 * @returns Decoded `AvailabilityOverrideInput` ready for the slot engine.
 */
export function mapOverrideRow(row: OverrideRowLike): AvailabilityOverrideInput {
  return {
    date: D1DateCodec.decode(row.date),
    startTime: row.startTime ?? null,
    endTime: row.endTime ?? null,
    isUnavailable: Boolean(row.isUnavailable),
  };
}
