import { describe, it, expect, vi } from "vitest";
import { handleStripeWebhook, type PaymentEventStore, type StripeWebhookVerifier } from "../webhooks/stripe.js";

function makeStore(): PaymentEventStore & {
  hasProcessedEvent: ReturnType<typeof vi.fn>;
  markEventProcessed: ReturnType<typeof vi.fn>;
  onPaymentIntentSucceeded: ReturnType<typeof vi.fn>;
  onPaymentIntentFailed: ReturnType<typeof vi.fn>;
} {
  return {
    hasProcessedEvent: vi.fn().mockResolvedValue(false),
    markEventProcessed: vi.fn().mockResolvedValue(undefined),
    onPaymentIntentSucceeded: vi.fn().mockResolvedValue(undefined),
    onPaymentIntentFailed: vi.fn().mockResolvedValue(undefined),
  };
}

function stripeWith(constructEvent: ReturnType<typeof vi.fn>): StripeWebhookVerifier {
  return { webhooks: { constructEvent } } as StripeWebhookVerifier;
}

describe("handleStripeWebhook", () => {
  it("returns 400 when the signature does not verify", async () => {
    const stripe = stripeWith(
      vi.fn(() => {
        throw new Error("bad signature");
      }),
    );
    const store = makeStore();

    const result = await handleStripeWebhook(
      { rawBody: "{}", signature: "wrong" },
      { stripe, webhookSecret: "whsec_test", store },
    );

    expect(result.status).toBe(400);
    expect(store.hasProcessedEvent).not.toHaveBeenCalled();
  });

  it("dispatches payment_intent.succeeded with decoded fields", async () => {
    const stripe = stripeWith(
      vi.fn().mockReturnValue({
        id: "evt_1",
        type: "payment_intent.succeeded",
        account: "acct_p",
        data: {
          object: {
            id: "pi_1",
            amount: 2500,
            currency: "usd",
            metadata: { bookingId: "bk_42", paymentType: "deposit" },
          },
        },
      }),
    );
    const store = makeStore();

    const result = await handleStripeWebhook(
      { rawBody: "{}", signature: "ok" },
      { stripe, webhookSecret: "whsec_test", store },
    );

    expect(result.status).toBe(200);
    expect(store.onPaymentIntentSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt_1",
        paymentIntentId: "pi_1",
        amountCents: 2500,
        currency: "usd",
        connectedAccountId: "acct_p",
        metadata: { bookingId: "bk_42", paymentType: "deposit" },
      }),
    );
    expect(store.markEventProcessed).toHaveBeenCalledWith("evt_1");
  });

  it("is idempotent on duplicate event.id", async () => {
    const stripe = stripeWith(
      vi.fn().mockReturnValue({
        id: "evt_dup",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_1", amount: 100, currency: "usd" } },
      }),
    );
    const store = makeStore();
    store.hasProcessedEvent = vi.fn().mockResolvedValue(true);

    const result = await handleStripeWebhook(
      { rawBody: "{}", signature: "ok" },
      { stripe, webhookSecret: "whsec_test", store },
    );

    expect(result.status).toBe(200);
    expect(result.reason).toBe("duplicate");
    expect(store.onPaymentIntentSucceeded).not.toHaveBeenCalled();
    expect(store.markEventProcessed).not.toHaveBeenCalled();
  });

  it("dispatches payment_intent.payment_failed with the last error message", async () => {
    const stripe = stripeWith(
      vi.fn().mockReturnValue({
        id: "evt_2",
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_2",
            amount: 2500,
            currency: "usd",
            last_payment_error: { message: "card declined" },
          },
        },
      }),
    );
    const store = makeStore();

    await handleStripeWebhook(
      { rawBody: "{}", signature: "ok" },
      { stripe, webhookSecret: "whsec_test", store },
    );

    expect(store.onPaymentIntentFailed).toHaveBeenCalledWith(
      expect.objectContaining({ lastError: "card declined" }),
    );
  });

  it("returns 500 (and does NOT mark processed) when a handler throws", async () => {
    const stripe = stripeWith(
      vi.fn().mockReturnValue({
        id: "evt_3",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_3", amount: 100, currency: "usd" } },
      }),
    );
    const store = makeStore();
    store.onPaymentIntentSucceeded = vi
      .fn()
      .mockRejectedValue(new Error("db down"));

    const result = await handleStripeWebhook(
      { rawBody: "{}", signature: "ok" },
      { stripe, webhookSecret: "whsec_test", store },
    );

    expect(result.status).toBe(500);
    expect(store.markEventProcessed).not.toHaveBeenCalled();
  });

  it("prefers constructEventAsync when the SDK provides it (Workers compat)", async () => {
    const constructEvent = vi.fn(() => {
      throw new Error("SubtleCryptoProvider cannot be used in a synchronous context");
    });
    const constructEventAsync = vi.fn().mockResolvedValue({
      id: "evt_async",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_a", amount: 7500, currency: "aud" } },
    });
    const stripe = {
      webhooks: { constructEvent, constructEventAsync },
    } as StripeWebhookVerifier;
    const store = makeStore();

    const result = await handleStripeWebhook(
      { rawBody: "{}", signature: "ok" },
      { stripe, webhookSecret: "whsec_test", store },
    );

    expect(result.status).toBe(200);
    expect(constructEventAsync).toHaveBeenCalledWith("{}", "ok", "whsec_test");
    expect(constructEvent).not.toHaveBeenCalled();
    expect(store.onPaymentIntentSucceeded).toHaveBeenCalled();
  });

  it("returns 400 when async signature verification rejects", async () => {
    const stripe = {
      webhooks: {
        constructEvent: vi.fn(),
        constructEventAsync: vi.fn().mockRejectedValue(new Error("bad signature")),
      },
    } as StripeWebhookVerifier;
    const store = makeStore();

    const result = await handleStripeWebhook(
      { rawBody: "{}", signature: "wrong" },
      { stripe, webhookSecret: "whsec_test", store },
    );

    expect(result.status).toBe(400);
    expect(store.hasProcessedEvent).not.toHaveBeenCalled();
  });

  it("dispatches amount_capturable_updated to the optional handler", async () => {
    const stripe = stripeWith(
      vi.fn().mockReturnValue({
        id: "evt_auth",
        type: "payment_intent.amount_capturable_updated",
        account: "acct_p",
        data: {
          object: {
            id: "pi_hold",
            amount: 7500,
            currency: "aud",
            metadata: { bookingId: "bk_77", paymentType: "deposit" },
          },
        },
      }),
    );
    const store = makeStore();
    const onAuth = vi.fn().mockResolvedValue(undefined);
    store.onPaymentIntentAmountCapturableUpdated = onAuth;

    const result = await handleStripeWebhook(
      { rawBody: "{}", signature: "ok" },
      { stripe, webhookSecret: "whsec_test", store },
    );

    expect(result.status).toBe(200);
    expect(onAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt_auth",
        paymentIntentId: "pi_hold",
        connectedAccountId: "acct_p",
        metadata: { bookingId: "bk_77", paymentType: "deposit" },
      }),
    );
    expect(store.markEventProcessed).toHaveBeenCalledWith("evt_auth");
  });

  it("treats amount_capturable_updated as a no-op when the handler is absent", async () => {
    const stripe = stripeWith(
      vi.fn().mockReturnValue({
        id: "evt_auth2",
        type: "payment_intent.amount_capturable_updated",
        data: { object: { id: "pi_hold", amount: 7500, currency: "aud" } },
      }),
    );
    const store = makeStore();

    const result = await handleStripeWebhook(
      { rawBody: "{}", signature: "ok" },
      { stripe, webhookSecret: "whsec_test", store },
    );

    expect(result.status).toBe(200);
    expect(store.markEventProcessed).toHaveBeenCalledWith("evt_auth2");
  });

  it("treats unknown event types as a no-op success and marks them processed", async () => {
    const stripe = stripeWith(
      vi.fn().mockReturnValue({
        id: "evt_unk",
        type: "customer.subscription.created",
        data: { object: {} },
      }),
    );
    const store = makeStore();

    const result = await handleStripeWebhook(
      { rawBody: "{}", signature: "ok" },
      { stripe, webhookSecret: "whsec_test", store },
    );

    expect(result.status).toBe(200);
    expect(store.markEventProcessed).toHaveBeenCalledWith("evt_unk");
  });
});
