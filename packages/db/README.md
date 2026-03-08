# @thebookingkit/db

Drizzle ORM schema and migrations for PostgreSQL-backed booking systems.

[![npm version](https://img.shields.io/npm/v/@thebookingkit/db)](https://www.npmjs.com/package/@thebookingkit/db)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

Part of [The Booking Kit](https://docs.thebookingkit.dev) — The Headless Booking Primitive.

## Install

```bash
npm install @thebookingkit/db
```

## Quick Start

```ts
import { createDb } from "@thebookingkit/db";
import { bookings, eventTypes, providers } from "@thebookingkit/db/schema";

const db = createDb(process.env.DATABASE_URL!);
const upcoming = await db.select().from(bookings).where(/* ... */);
```

## Key Features

- **23 PostgreSQL tables** — Organizations, providers, event types, availability rules, bookings, payments, webhooks, workflows, and more
- **Double-booking prevention** — `EXCLUDE USING gist` constraint with `btree_gist` extension
- **Full type exports** — Inferred select and insert types for every table (`Booking`, `NewBooking`, etc.)
- **Booking audit trail** — Append-only `booking_events` table tracks every status change
- **Multi-tenancy ready** — Optional `organization_id` on all tables
- **Custom migrations** — `runCustomMigrations` for btree_gist, audit triggers, and GDPR compliance
- **Multiple entry points** — `@thebookingkit/db`, `@thebookingkit/db/schema`, `@thebookingkit/db/client`

## Documentation

[**Full Documentation**](https://docs.thebookingkit.dev/database/schema/)

## License

MIT
