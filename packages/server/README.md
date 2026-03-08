# @thebookingkit/server

Auth, webhooks, API keys, workflows, and adapter interfaces for booking system backends.

[![npm version](https://img.shields.io/npm/v/@thebookingkit/server)](https://www.npmjs.com/package/@thebookingkit/server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

Part of [The Booking Kit](https://docs.thebookingkit.dev) — The Headless Booking Primitive.

## Install

```bash
npm install @thebookingkit/server
```

## Quick Start

```ts
import { withAuth, signWebhookPayload, generateApiKey } from "@thebookingkit/server";

// Protect a route with auth middleware
const handler = withAuth(async (req) => {
  const user = req.auth; // typed AuthUser
  return Response.json({ ok: true });
});

// Sign and verify webhook payloads
const signature = signWebhookPayload(payload, secret);
```

## Key Features

- **Auth Middleware** — `withAuth`, ownership assertions, pluggable `AuthAdapter` (NextAuth.js, Clerk, Supabase, Lucia)
- **Webhooks** — HMAC-SHA256 signing/verification, retry with exponential backoff, subscription matching
- **API Key Management** — Generation, hashing, verification, scopes, expiration, rate limiting
- **Booking Tokens** — Secure token generation and verification for confirmation/cancellation links
- **Workflows** — Trigger-based automation with conditions, template variables, and action routing
- **Notifications** — Email templates (confirmation, reminder, cancellation, reschedule) and calendar sync
- **Multi-Tenancy** — Role-based permissions, settings inheritance (org > provider > event type), tenant scoping
- **Serialization Retry** — `withSerializableRetry` for SERIALIZABLE transaction conflict handling
- **Adapter Interfaces** — Swappable `EmailAdapter`, `CalendarAdapter`, `JobAdapter`, `StorageAdapter`, `SmsAdapter`, `PaymentAdapter`

## Documentation

[**Full Documentation**](https://docs.thebookingkit.dev/features/webhooks/)

## License

MIT
