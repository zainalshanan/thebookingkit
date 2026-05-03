import { describe, it, expect, vi } from "vitest";
import { StripePaymentAdapter, type StripeLike } from "../adapters/stripe-payment-adapter.js";
import { initiateDeposit, refundDeposit } from "../deposit-flow.js";

function makeStripeMock(): StripeLike & {
  paymentIntents: {
    create: ReturnType<typeof vi.fn>;
    capture: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  setupIntents: { create: ReturnType<typeof vi.fn> };
  refunds: { create: ReturnType<typeof vi.fn> };
  accounts: { create: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> };
  accountLinks: { create: ReturnType<typeof vi.fn> };
} {
  return {
    paymentIntents: {
      create: vi.fn().mockResolvedValue({
        id: "pi_test_123",
        client_secret: "pi_test_123_secret",
        status: "requires_payment_method",
      }),
      capture: vi.fn().mockResolvedValue({ id: "pi_test_123", status: "succeeded" }),
      cancel: vi.fn().mockResolvedValue({ id: "pi_test_123", status: "canceled" }),
    },
    setupIntents: {
      create: vi.fn().mockResolvedValue({ id: "seti_1", client_secret: "seti_1_secret" }),
    },
    refunds: {
      create: vi.fn().mockResolvedValue({ id: "re_1", amount: 2500, status: "succeeded" }),
    },
    accounts: {
      create: vi.fn().mockResolvedValue({ id: "acct_new" }),
      del: vi.fn().mockResolvedValue({ id: "acct_new", deleted: true }),
    },
    accountLinks: {
      create: vi.fn().mockResolvedValue({ url: "https://connect.stripe.com/setup/acct_new/onboarding" }),
    },
  };
}

describe("StripePaymentAdapter", () => {
  it("creates a PaymentIntent with the requested amount and currency", async () => {
    const stripe = makeStripeMock();
    const adapter = new StripePaymentAdapter({ stripe });

    const result = await adapter.createPaymentIntent({
      amountCents: 2500,
      currency: "USD",
    });

    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2500,
        currency: "usd",
        capture_method: "automatic",
      }),
      undefined,
    );
    expect(result.paymentIntentId).toBe("pi_test_123");
    expect(result.clientSecret).toBe("pi_test_123_secret");
  });

  it("routes Connect calls via stripeAccount request option", async () => {
    const stripe = makeStripeMock();
    const adapter = new StripePaymentAdapter({ stripe });

    await adapter.createPaymentIntent({
      amountCents: 5000,
      currency: "USD",
      connectedAccountId: "acct_provider_42",
    });

    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.any(Object),
      { stripeAccount: "acct_provider_42" },
    );
  });

  it("uses manual capture when requested (no-show holds)", async () => {
    const stripe = makeStripeMock();
    const adapter = new StripePaymentAdapter({ stripe });

    await adapter.createPaymentIntent({
      amountCents: 1000,
      currency: "USD",
      captureMethod: "manual",
    });

    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ capture_method: "manual" }),
      undefined,
    );
  });

  it("threads connectedAccountId through capture/cancel/refund", async () => {
    const stripe = makeStripeMock();
    const adapter = new StripePaymentAdapter({ stripe });

    await adapter.capturePaymentIntent("pi_x", 500, "acct_1");
    await adapter.cancelPaymentIntent("pi_x", "acct_1");
    await adapter.refund("pi_x", 250, "acct_1");

    expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(
      "pi_x",
      { amount_to_capture: 500 },
      { stripeAccount: "acct_1" },
    );
    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_x", {
      stripeAccount: "acct_1",
    });
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_x", amount: 250 },
      { stripeAccount: "acct_1" },
    );
  });

  it("creates a fresh Connect account when no connectedAccountId is supplied for onboarding", async () => {
    const stripe = makeStripeMock();
    const adapter = new StripePaymentAdapter({
      stripe,
      defaultCountry: "GB",
    });

    const url = await adapter.createConnectOnboardingUrl({
      returnUrl: "https://x/return",
      refreshUrl: "https://x/refresh",
    });

    expect(stripe.accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "express", country: "GB" }),
    );
    expect(url).toContain("connect.stripe.com");
  });
});

describe("initiateDeposit", () => {
  it("short-circuits when no deposit is configured", async () => {
    const stripe = makeStripeMock();
    const adapter = new StripePaymentAdapter({ stripe });

    const result = await initiateDeposit(adapter, {
      bookingId: "bk_1",
      deposit: {},
      priceCents: 10000,
      currency: "USD",
    });

    expect(result.required).toBe(false);
    expect(result.amountCents).toBe(0);
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("creates a deposit PaymentIntent with bookingId metadata", async () => {
    const stripe = makeStripeMock();
    const adapter = new StripePaymentAdapter({ stripe });

    const result = await initiateDeposit(adapter, {
      bookingId: "bk_42",
      deposit: { depositPercentage: 25 },
      priceCents: 10000,
      currency: "USD",
      connectedAccountId: "acct_provider",
    });

    expect(result.required).toBe(true);
    expect(result.amountCents).toBe(2500);
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2500,
        capture_method: "automatic",
        metadata: expect.objectContaining({
          bookingId: "bk_42",
          paymentType: "deposit",
        }),
      }),
      { stripeAccount: "acct_provider" },
    );
  });
});

describe("refundDeposit", () => {
  it("issues a partial refund when policy retains a fee", async () => {
    const stripe = makeStripeMock();
    stripe.refunds.create = vi
      .fn()
      .mockResolvedValue({ id: "re_2", amount: 1250, status: "succeeded" });
    const adapter = new StripePaymentAdapter({ stripe });

    // 50% fee tier kicks in 10h before
    const bookingStart = new Date("2026-03-15T14:00:00Z");
    const cancelledAt = new Date("2026-03-15T04:00:00Z");

    const result = await refundDeposit(adapter, {
      paymentIntentId: "pi_dep_1",
      originalAmountCents: 2500,
      bookingStartsAt: bookingStart,
      cancelledAt,
      policy: [
        { hoursBefore: 24, feePercentage: 0 },
        { hoursBefore: 2, feePercentage: 50 },
        { hoursBefore: 0, feePercentage: 100 },
      ],
      connectedAccountId: "acct_provider",
    });

    expect(result.refundAmountCents).toBe(1250);
    expect(result.feeCents).toBe(1250);
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_dep_1", amount: 1250 },
      { stripeAccount: "acct_provider" },
    );
  });

  it("skips the Stripe call when refund is zero", async () => {
    const stripe = makeStripeMock();
    const adapter = new StripePaymentAdapter({ stripe });

    const bookingStart = new Date("2026-03-15T14:00:00Z");
    const cancelledAt = new Date("2026-03-15T13:30:00Z");

    const result = await refundDeposit(adapter, {
      paymentIntentId: "pi_dep_1",
      originalAmountCents: 2500,
      bookingStartsAt: bookingStart,
      cancelledAt,
      policy: [{ hoursBefore: 0, feePercentage: 100 }],
    });

    expect(result.refundAmountCents).toBe(0);
    expect(result.feeCents).toBe(2500);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
});
