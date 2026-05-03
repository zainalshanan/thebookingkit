/**
 * Framework-agnostic Stripe webhook handler.
 *
 * Mount from a Next.js route handler:
 *
 * ```ts
 * // app/api/webhooks/stripe/route.ts
 * export async function POST(req: Request) {
 *   const rawBody = await req.text();
 *   const signature = req.headers.get("stripe-signature") ?? "";
 *   const result = await handleStripeWebhook(
 *     { rawBody, signature },
 *     { stripe, webhookSecret, store },
 *   );
 *   return new Response(null, { status: result.status });
 * }
 * ```
 *
 * The handler:
 * 1. Verifies the signature via `stripe.webhooks.constructEvent`.
 * 2. Looks up `event.id` in the idempotency store; returns 200 if seen.
 * 3. Dispatches `payment_intent.*` events to the {@link PaymentEventStore}.
 * 4. Persists `event.id` to the idempotency store on success.
 *
 * The handler does **not** know about your database directly — it talks to a
 * `PaymentEventStore` that the consuming app implements against its DB
 * (`packages/db` or `packages/d1`). This keeps the webhook logic shared.
 */

/** Minimal shape of the Stripe SDK we need for webhook verification. */
export interface StripeWebhookVerifier {
  webhooks: {
    constructEvent(
      payload: string | Buffer,
      header: string,
      secret: string,
    ): { id: string; type: string; data: { object: unknown } };
  };
}

/**
 * The decoded payload we extract from a `payment_intent.*` event before
 * passing it to the store. Avoids leaking Stripe SDK types.
 */
export interface PaymentIntentEvent {
  /** The raw Stripe event ID (`evt_...`) */
  eventId: string;
  /** The Stripe event type (e.g. `payment_intent.succeeded`) */
  eventType: string;
  /** The PaymentIntent ID (`pi_...`) */
  paymentIntentId: string;
  /** Final amount on the PaymentIntent in smallest currency unit */
  amountCents: number;
  /** ISO currency code, lower-case as returned by Stripe */
  currency: string;
  /** Connected account ID, if the event arrived for a Connect account */
  connectedAccountId?: string;
  /** Last error message, present on `payment_intent.payment_failed` */
  lastError?: string;
  /** Custom metadata Stripe carried through */
  metadata: Record<string, string>;
}

/**
 * Application-side persistence for webhook events. Implementations must
 * be idempotent on `eventId`.
 */
export interface PaymentEventStore {
  /** Returns true if `eventId` has already been processed. */
  hasProcessedEvent(eventId: string): Promise<boolean>;
  /** Mark `eventId` processed (called after handlers succeed). */
  markEventProcessed(eventId: string): Promise<void>;
  /** Called for `payment_intent.succeeded`. */
  onPaymentIntentSucceeded(event: PaymentIntentEvent): Promise<void>;
  /** Called for `payment_intent.payment_failed`. */
  onPaymentIntentFailed(event: PaymentIntentEvent): Promise<void>;
  /** Called for `payment_intent.canceled`. */
  onPaymentIntentCanceled?(event: PaymentIntentEvent): Promise<void>;
  /** Called for `charge.refunded`. */
  onChargeRefunded?(event: {
    eventId: string;
    paymentIntentId: string;
    amountRefundedCents: number;
    connectedAccountId?: string;
  }): Promise<void>;
}

export interface HandleStripeWebhookRequest {
  /** The raw request body — must NOT be JSON-parsed. */
  rawBody: string;
  /** The `stripe-signature` header. */
  signature: string;
}

export interface HandleStripeWebhookDeps {
  stripe: StripeWebhookVerifier;
  webhookSecret: string;
  store: PaymentEventStore;
}

export interface HandleStripeWebhookResult {
  status: number;
  /** Optional reason for non-200 responses; helpful for logs. */
  reason?: string;
}

/** Read amount/currency safely from a PaymentIntent payload. */
function readNumber(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function readString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

function readMetadata(
  obj: Record<string, unknown>,
): Record<string, string> {
  const md = obj.metadata;
  if (!md || typeof md !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(md as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function decodePaymentIntentEvent(
  raw: { id: string; type: string; data: { object: unknown }; account?: string },
): PaymentIntentEvent {
  const obj = (raw.data.object ?? {}) as Record<string, unknown>;
  const lastErrorObj = obj.last_payment_error as
    | { message?: string }
    | undefined;
  return {
    eventId: raw.id,
    eventType: raw.type,
    paymentIntentId: readString(obj, "id"),
    amountCents: readNumber(obj, "amount"),
    currency: readString(obj, "currency"),
    connectedAccountId: raw.account,
    lastError: lastErrorObj?.message,
    metadata: readMetadata(obj),
  };
}

/**
 * Verify and process a Stripe webhook request.
 *
 * Returns:
 * - `200` on success, including for already-seen events (idempotency).
 * - `400` for signature verification failures or malformed payloads.
 * - `500` if a downstream handler throws (Stripe will retry).
 */
export async function handleStripeWebhook(
  req: HandleStripeWebhookRequest,
  deps: HandleStripeWebhookDeps,
): Promise<HandleStripeWebhookResult> {
  let event: { id: string; type: string; data: { object: unknown }; account?: string };
  try {
    event = deps.stripe.webhooks.constructEvent(
      req.rawBody,
      req.signature,
      deps.webhookSecret,
    ) as typeof event;
  } catch (err) {
    return {
      status: 400,
      reason: `signature verification failed: ${(err as Error).message}`,
    };
  }

  if (await deps.store.hasProcessedEvent(event.id)) {
    return { status: 200, reason: "duplicate" };
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await deps.store.onPaymentIntentSucceeded(decodePaymentIntentEvent(event));
        break;
      case "payment_intent.payment_failed":
        await deps.store.onPaymentIntentFailed(decodePaymentIntentEvent(event));
        break;
      case "payment_intent.canceled":
        if (deps.store.onPaymentIntentCanceled) {
          await deps.store.onPaymentIntentCanceled(decodePaymentIntentEvent(event));
        }
        break;
      case "charge.refunded": {
        if (!deps.store.onChargeRefunded) break;
        const obj = (event.data.object ?? {}) as Record<string, unknown>;
        await deps.store.onChargeRefunded({
          eventId: event.id,
          paymentIntentId: readString(obj, "payment_intent"),
          amountRefundedCents: readNumber(obj, "amount_refunded"),
          connectedAccountId: event.account,
        });
        break;
      }
      default:
        // Unhandled event types are intentionally a no-op success — Stripe
        // sends many events we don't need to process. Mark as seen anyway
        // so we don't reprocess on retry.
        break;
    }

    await deps.store.markEventProcessed(event.id);
    return { status: 200 };
  } catch (err) {
    return {
      status: 500,
      reason: `handler error: ${(err as Error).message}`,
    };
  }
}
