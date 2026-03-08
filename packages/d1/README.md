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
import { d1DayQuery, d1BookingRowsToInputs, encodeD1Date, D1BookingLock } from "@thebookingkit/d1";
import { getAvailableSlots } from "@thebookingkit/core";

// Query bookings for a day — returns aligned bounds + dateRange
const { bounds, dateRange } = d1DayQuery("2026-03-09");

// Convert D1 rows to core engine inputs
const slots = getAvailableSlots(rules, [], d1BookingRowsToInputs(rows), dateRange, tz);

// Encode dates for INSERT
await db.insert(bookings).values({ startsAt: encodeD1Date(slot.startTime) });

// Prevent double-bookings with advisory locks
const lock = new D1BookingLock(rawDb);
await lock.withLock(`${barberId}:${date}`, async () => { /* insert */ });
```

## Key Features

- **Date Codec** — `D1DateCodec` for canonical UTC-Z encoding/decoding between D1 text columns and JS Date objects
- **Query Helpers** — `d1DayQuery` and `d1LocalDayQuery` produce aligned SQL bounds and `DateRange` in one call
- **Booking Bridge** — `d1BookingRowsToInputs` converts D1 rows to `@thebookingkit/core` inputs
- **Schedule Adapter** — `weeklyScheduleToRules` and `intersectSchedulesToRules` convert WeeklySchedule JSON to availability rules
- **Advisory Locks** — `D1BookingLock` prevents double-bookings in SQLite (no `EXCLUDE USING gist` in D1)
- **Migration Utilities** — `findLegacyRows`, `migrateRowDates`, `buildMigrationSql` for date format upgrades

## Documentation

[**Full Documentation**](https://docs.thebookingkit.dev/database/adapters/)

## License

MIT
