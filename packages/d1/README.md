# @thebookingkit/d1

Cloudflare D1/SQLite adapter for building booking systems on the edge.

[![npm version](https://img.shields.io/npm/v/@thebookingkit/d1)](https://www.npmjs.com/package/@thebookingkit/d1)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

Part of [The Booking Kit](https://docs.thebookingkit.dev) — The Headless Booking Primitive.

## Install

```bash
npm install @thebookingkit/d1
```

## Quick Start

```ts
import {
  d1DayQuery,
  d1BookingRowsToInputs,
  encodeD1Date,
  insertBookingIfFree,
} from "@thebookingkit/d1";
import { getAvailableSlots } from "@thebookingkit/core";

// Query bookings for a day — returns aligned bounds + dateRange
const { bounds, dateRange } = d1DayQuery("2026-03-09");

// Convert D1 rows to core engine inputs
const slots = getAvailableSlots(rules, [], d1BookingRowsToInputs(rows), dateRange, tz);

// Write the booking — the overlap check and the INSERT are one atomic statement,
// so concurrent requests cannot double-book.
const { inserted } = await insertBookingIfFree(db, {
  id: crypto.randomUUID(),
  provider_id: barberId,
  starts_at: slot.startTime,
  ends_at: slot.endTime,
  status: "confirmed",
});

if (!inserted) return Response.json({ error: "Slot just taken" }, { status: 409 });
```

## Double-booking prevention

PostgreSQL prevents overlapping bookings with `EXCLUDE USING gist`. SQLite has no
range-exclusion constraint, so this package provides the equivalent guarantee in
three layers:

| Layer | What it does | Guarantee |
|---|---|---|
| `insertBookingIfFree()` | Overlap check + INSERT in **one** SQL statement | **Authoritative.** No interleaving is possible, with or without a lock |
| `BOOKINGS_UNIQUE_SLOT_DDL` | Opt-in partial unique index | Schema-level backstop for code paths that bypass the guard (identical start times) |
| `D1BookingLock` | Advisory compare-and-swap lock | Reduces contention and returns friendly errors. Advisory only — never the sole defence |

`D1BookingLock` uses a fencing token, so a holder whose lease expired can never
release the lock a *different* request now owns, and `withLock` raises
`LockLeaseExpiredError` if the critical section outlives its lease.

## Key Features

- **Atomic Booking Guard** — `insertBookingIfFree` / `insertBookingOrThrow` check and insert in one statement, so concurrent requests cannot double-book
- **Date Codec** — `D1DateCodec` for canonical UTC-Z encoding/decoding between D1 text columns and JS Date objects
- **Query Helpers** — `d1DayQuery` and `d1LocalDayQuery` produce aligned SQL bounds and `DateRange` in one call
- **Booking Bridge** — `d1BookingRowsToInputs` converts D1 rows to `@thebookingkit/core` inputs
- **Schedule Adapter** — `weeklyScheduleToRules` and `intersectSchedulesToRules` convert WeeklySchedule JSON to availability rules
- **Advisory Locks** — `D1BookingLock` with fencing tokens, lease extension, and stale-lock recovery
- **Migration Utilities** — `findLegacyRows`, `migrateRowDates`, `buildMigrationSql` for date format upgrades

## Documentation

[**Full Documentation**](https://docs.thebookingkit.dev/database/adapters/)

## License

MIT
