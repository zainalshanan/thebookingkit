# @thebookingkit/core

Framework-agnostic scheduling math engine for building booking systems.

[![npm version](https://img.shields.io/npm/v/@thebookingkit/core)](https://www.npmjs.com/package/@thebookingkit/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

Part of [The Booking Kit](https://docs.thebookingkit.dev) — The Headless Booking Primitive.

## Install

```bash
npm install @thebookingkit/core
```

## Quick Start

```ts
import { getAvailableSlots, isSlotAvailable } from "@thebookingkit/core";

const slots = getAvailableSlots(
  availabilityRules,
  overrides,
  existingBookings,
  { start: new Date("2026-03-09"), end: new Date("2026-03-10") },
  "America/New_York",
  { duration: 30, bufferBefore: 5, bufferAfter: 5 }
);

const check = isSlotAvailable(rules, overrides, bookings, startTime, endTime);
```

## Key Features

- **Slot Engine** — `getAvailableSlots` and `isSlotAvailable` with buffer time, booking limits, and minimum notice
- **RRULE Parsing** — Expand recurring availability rules with iCalendar EXDATE support
- **Timezone Utilities** — UTC normalization, local conversion, offset calculation via `date-fns-tz`
- **Team Scheduling** — `getTeamSlots`, `assignHost` with round-robin, least-busy, and random strategies
- **Recurring Bookings** — Generate occurrences, check series availability, cancel future occurrences
- **Seats / Group Bookings** — Seat availability computation, reservation validation, group event summaries
- **Walk-In Queue** — Wait time estimation, gap finding, queue management, analytics
- **Kiosk Mode** — Settings validation, break/block management, multi-provider resource views
- **Routing Forms** — Form validation, rule evaluation, response routing, analytics
- **Payments** — Cancellation policies, fee calculation, payment summaries, currency validation
- **Embeddable Widgets** — Config validation and embed snippet generation
- **Zero dependencies on React or Node.js** — runs in browser, edge, and server environments

## Documentation

[**Full Documentation**](https://docs.thebookingkit.dev/core-concepts/slot-engine/)

## License

MIT
