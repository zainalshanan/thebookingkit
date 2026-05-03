/**
 * Concrete {@link PaymentAdapter} implementation backed by Stripe.
 *
 * Supports Stripe Connect via the `connectedAccountId` option on each call —
 * when supplied, Stripe SDK requests are made on behalf of that connected
 * account (`{ stripeAccount }` request option), which routes the funds and
 * the resulting PaymentIntent / Customer / Refund to that account.
 *
 * The `stripe` package is a **peer dependency** of `@thebookingkit/server`.
 * Consumers that don't use this adapter don't need it installed.
 *
 * @example
 * ```ts
 * import Stripe from "stripe";
 * import { StripePaymentAdapter } from "@thebookingkit/server";
 *
 * const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
 * const adapter = new StripePaymentAdapter({
 *   stripe,
 *   webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
 *   platformReturnUrl: "https://example.com/connect/return",
 *   platformRefreshUrl: "https://example.com/connect/refresh",
 * });
 * ```
 */

import type {
  PaymentAdapter,
  CreatePaymentIntentOptions,
  CreatePaymentIntentResult,
  CreateSetupIntentOptions,
  CreateSetupIntentResult,
  CaptureResult,
  RefundResult,
} from "./payment-adapter.js";

/**
 * Minimal structural type for the Stripe SDK we depend on. Avoids forcing
 * consumers to install `@types/stripe` if they don't use this adapter.
 *
 * The actual Stripe SDK satisfies this shape; pass `new Stripe(...)` directly.
 */
export interface StripeLike {
  paymentIntents: {
    create(
      params: Record<string, unknown>,
      options?: { stripeAccount?: string; idempotencyKey?: string },
    ): Promise<{ id: string; client_secret: string | null; status: string }>;
    capture(
      id: string,
      params?: Record<string, unknown>,
      options?: { stripeAccount?: string },
    ): Promise<{ id: string; status: string }>;
    cancel(
      id: string,
      options?: { stripeAccount?: string },
    ): Promise<{ id: string; status: string }>;
  };
  setupIntents: {
    create(
      params: Record<string, unknown>,
      options?: { stripeAccount?: string },
    ): Promise<{ id: string; client_secret: string | null }>;
  };
  refunds: {
    create(
      params: Record<string, unknown>,
      options?: { stripeAccount?: string; idempotencyKey?: string },
    ): Promise<{ id: string; amount: number; status: string | null }>;
  };
  accounts: {
    create(
      params: Record<string, unknown>,
    ): Promise<{ id: string }>;
    del(id: string): Promise<{ id: string; deleted: boolean }>;
  };
  accountLinks: {
    create(
      params: Record<string, unknown>,
    ): Promise<{ url: string }>;
  };
}

export interface StripePaymentAdapterOptions {
  /** Stripe SDK instance (e.g. `new Stripe(secretKey)`) */
  stripe: StripeLike;
  /** Webhook signing secret used by the webhook handler */
  webhookSecret?: string;
  /**
   * URL Stripe redirects to after Connect onboarding completes.
   * Required if you call {@link StripePaymentAdapter.createConnectOnboardingUrl}.
   */
  platformReturnUrl?: string;
  /**
   * URL Stripe redirects to if the onboarding link expires before completion.
   * Required if you call {@link StripePaymentAdapter.createConnectOnboardingUrl}.
   */
  platformRefreshUrl?: string;
  /**
   * Default country for Connect Express accounts. Used only by
   * {@link StripePaymentAdapter.createConnectOnboardingUrl} when creating a
   * fresh account on demand. Defaults to "US".
   */
  defaultCountry?: string;
}

const TERMINAL_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
  "succeeded",
  "canceled",
]);

function normalizeIntentStatus(
  status: string,
): CreatePaymentIntentResult["status"] {
  if (TERMINAL_STATUSES.has(status)) {
    return status as CreatePaymentIntentResult["status"];
  }
  // `requires_capture` and `requires_source` are mapped to the closest
  // documented variant — anything else falls back to `processing`.
  if (status === "requires_capture") return "requires_confirmation";
  return "processing";
}

export class StripePaymentAdapter implements PaymentAdapter {
  private readonly stripe: StripeLike;
  private readonly webhookSecret?: string;
  private readonly platformReturnUrl?: string;
  private readonly platformRefreshUrl?: string;
  private readonly defaultCountry: string;

  constructor(opts: StripePaymentAdapterOptions) {
    this.stripe = opts.stripe;
    this.webhookSecret = opts.webhookSecret;
    this.platformReturnUrl = opts.platformReturnUrl;
    this.platformRefreshUrl = opts.platformRefreshUrl;
    this.defaultCountry = opts.defaultCountry ?? "US";
  }

  /** Webhook signing secret (used by `handleStripeWebhook`). */
  getWebhookSecret(): string | undefined {
    return this.webhookSecret;
  }

  async createPaymentIntent(
    options: CreatePaymentIntentOptions,
  ): Promise<CreatePaymentIntentResult> {
    const params: Record<string, unknown> = {
      amount: options.amountCents,
      currency: options.currency.toLowerCase(),
      capture_method: options.captureMethod ?? "automatic",
    };
    if (options.metadata) params.metadata = options.metadata;
    if (options.customerEmail) params.receipt_email = options.customerEmail;

    const requestOpts = options.connectedAccountId
      ? { stripeAccount: options.connectedAccountId }
      : undefined;

    const intent = await this.stripe.paymentIntents.create(params, requestOpts);

    if (!intent.client_secret) {
      throw new Error(
        `Stripe returned PaymentIntent ${intent.id} without a client_secret`,
      );
    }

    return {
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      status: normalizeIntentStatus(intent.status),
    };
  }

  async createSetupIntent(
    options: CreateSetupIntentOptions,
  ): Promise<CreateSetupIntentResult> {
    const params: Record<string, unknown> = { usage: "off_session" };
    if (options.metadata) params.metadata = options.metadata;
    if (options.customerEmail) params.receipt_email = options.customerEmail;

    const requestOpts = options.connectedAccountId
      ? { stripeAccount: options.connectedAccountId }
      : undefined;

    const intent = await this.stripe.setupIntents.create(params, requestOpts);

    if (!intent.client_secret) {
      throw new Error(
        `Stripe returned SetupIntent ${intent.id} without a client_secret`,
      );
    }

    return {
      setupIntentId: intent.id,
      clientSecret: intent.client_secret,
    };
  }

  async capturePaymentIntent(
    paymentIntentId: string,
    amountCents?: number,
    connectedAccountId?: string,
  ): Promise<CaptureResult> {
    const params: Record<string, unknown> = {};
    if (typeof amountCents === "number") {
      params.amount_to_capture = amountCents;
    }
    const requestOpts = connectedAccountId
      ? { stripeAccount: connectedAccountId }
      : undefined;
    const intent = await this.stripe.paymentIntents.capture(
      paymentIntentId,
      params,
      requestOpts,
    );
    return {
      captured: intent.status === "succeeded",
      paymentIntentId: intent.id,
    };
  }

  async cancelPaymentIntent(
    paymentIntentId: string,
    connectedAccountId?: string,
  ): Promise<void> {
    const requestOpts = connectedAccountId
      ? { stripeAccount: connectedAccountId }
      : undefined;
    await this.stripe.paymentIntents.cancel(paymentIntentId, requestOpts);
  }

  async refund(
    paymentIntentId: string,
    amountCents?: number,
    connectedAccountId?: string,
  ): Promise<RefundResult> {
    const params: Record<string, unknown> = {
      payment_intent: paymentIntentId,
    };
    if (typeof amountCents === "number") {
      params.amount = amountCents;
    }
    const requestOpts = connectedAccountId
      ? { stripeAccount: connectedAccountId }
      : undefined;
    const refund = await this.stripe.refunds.create(params, requestOpts);
    return {
      refundId: refund.id,
      amountCents: refund.amount,
      status: (refund.status ?? "pending") as RefundResult["status"],
    };
  }

  async createConnectOnboardingUrl(options: {
    returnUrl: string;
    refreshUrl: string;
    connectedAccountId?: string;
  }): Promise<string> {
    let accountId = options.connectedAccountId;
    if (!accountId) {
      const account = await this.stripe.accounts.create({
        type: "express",
        country: this.defaultCountry,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;
    }

    const link = await this.stripe.accountLinks.create({
      account: accountId,
      return_url: options.returnUrl ?? this.platformReturnUrl,
      refresh_url: options.refreshUrl ?? this.platformRefreshUrl,
      type: "account_onboarding",
    });

    return link.url;
  }

  async disconnectAccount(connectedAccountId: string): Promise<void> {
    await this.stripe.accounts.del(connectedAccountId);
  }
}
