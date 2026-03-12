import { describe, it, expect } from "vitest";
import {
  evaluateCancellationFee,
  validateCancellationPolicy,
  computePaymentSummary,
  requiresPayment,
  hasNoShowFee,
  validatePaymentAmount,
  validateCurrency,
  formatPaymentAmount,
  PaymentValidationError,
  type CancellationPolicy,
  type PaymentRecord,
} from "../payments.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Standard 3-tier cancellation policy */
const standardPolicy: CancellationPolicy = [
  { hoursBefore: 24, feePercentage: 0 },
  { hoursBefore: 2, feePercentage: 50 },
  { hoursBefore: 0, feePercentage: 100 },
];

/** Simple booking date: March 15, 2026 at 14:00 UTC */
const bookingStart = new Date("2026-03-15T14:00:00Z");

function makePayment(overrides?: Partial<PaymentRecord>): PaymentRecord {
  return {
    id: "pay-1",
    bookingId: "bk-1",
    stripePaymentIntentId: "pi_123",
    amountCents: 5000,
    currency: "USD",
    status: "succeeded",
    paymentType: "prepayment",
    refundAmountCents: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateCancellationPolicy
// ---------------------------------------------------------------------------

describe("validateCancellationPolicy", () => {
  it("accepts a valid policy", () => {
    expect(() => validateCancellationPolicy(standardPolicy)).not.toThrow();
  });

  it("accepts a single-tier policy", () => {
    expect(() =>
      validateCancellationPolicy([{ hoursBefore: 0, feePercentage: 100 }]),
    ).not.toThrow();
  });

  it("rejects empty policy", () => {
    expect(() => validateCancellationPolicy([])).toThrow(
      PaymentValidationError,
    );
    expect(() => validateCancellationPolicy([])).toThrow("at least one tier");
  });

  it("rejects negative hoursBefore", () => {
    expect(() =>
      validateCancellationPolicy([{ hoursBefore: -1, feePercentage: 50 }]),
    ).toThrow("Must be >= 0");
  });

  it("rejects feePercentage below 0", () => {
    expect(() =>
      validateCancellationPolicy([{ hoursBefore: 0, feePercentage: -10 }]),
    ).toThrow("Must be 0–100");
  });

  it("rejects feePercentage above 100", () => {
    expect(() =>
      validateCancellationPolicy([{ hoursBefore: 0, feePercentage: 150 }]),
    ).toThrow("Must be 0–100");
  });

  it("rejects duplicate hoursBefore values", () => {
    expect(() =>
      validateCancellationPolicy([
        { hoursBefore: 24, feePercentage: 0 },
        { hoursBefore: 24, feePercentage: 50 },
      ]),
    ).toThrow("Duplicate hoursBefore");
  });

  it("rejects tiers not sorted descending", () => {
    expect(() =>
      validateCancellationPolicy([
        { hoursBefore: 0, feePercentage: 100 },
        { hoursBefore: 24, feePercentage: 0 },
      ]),
    ).toThrow("sorted descending");
  });
});

// ---------------------------------------------------------------------------
// evaluateCancellationFee
// ---------------------------------------------------------------------------

describe("evaluateCancellationFee", () => {
  it("returns 0% fee for cancellation 24+ hours before", () => {
    // Cancel 48 hours before
    const cancelledAt = new Date("2026-03-13T14:00:00Z");
    const result = evaluateCancellationFee(
      standardPolicy,
      bookingStart,
      cancelledAt,
      5000,
    );

    expect(result.feePercentage).toBe(0);
    expect(result.feeCents).toBe(0);
    expect(result.refundCents).toBe(5000);
    expect(result.matchedTier.hoursBefore).toBe(24);
  });

  it("returns 50% fee for cancellation 2–24 hours before", () => {
    // Cancel 10 hours before
    const cancelledAt = new Date("2026-03-15T04:00:00Z");
    const result = evaluateCancellationFee(
      standardPolicy,
      bookingStart,
      cancelledAt,
      5000,
    );

    expect(result.feePercentage).toBe(50);
    expect(result.feeCents).toBe(2500);
    expect(result.refundCents).toBe(2500);
    expect(result.matchedTier.hoursBefore).toBe(2);
  });

  it("returns 100% fee for cancellation <2 hours before", () => {
    // Cancel 30 minutes before
    const cancelledAt = new Date("2026-03-15T13:30:00Z");
    const result = evaluateCancellationFee(
      standardPolicy,
      bookingStart,
      cancelledAt,
      5000,
    );

    expect(result.feePercentage).toBe(100);
    expect(result.feeCents).toBe(5000);
    expect(result.refundCents).toBe(0);
    expect(result.matchedTier.hoursBefore).toBe(0);
  });

  it("throws when cancelled after booking start", () => {
    // Cancel after the booking started — should throw since QA fix
    const cancelledAt = new Date("2026-03-15T15:00:00Z");
    expect(() =>
      evaluateCancellationFee(
        standardPolicy,
        bookingStart,
        cancelledAt,
        5000,
      ),
    ).toThrow("Cannot cancel a booking that has already started");
  });

  it("returns 0% fee at exactly 24 hours before", () => {
    const cancelledAt = new Date("2026-03-14T14:00:00Z");
    const result = evaluateCancellationFee(
      standardPolicy,
      bookingStart,
      cancelledAt,
      5000,
    );

    expect(result.feePercentage).toBe(0);
    expect(result.feeCents).toBe(0);
  });

  it("returns 50% fee at exactly 2 hours before", () => {
    const cancelledAt = new Date("2026-03-15T12:00:00Z");
    const result = evaluateCancellationFee(
      standardPolicy,
      bookingStart,
      cancelledAt,
      5000,
    );

    expect(result.feePercentage).toBe(50);
    expect(result.feeCents).toBe(2500);
  });

  it("rounds fee to nearest cent", () => {
    const policy: CancellationPolicy = [
      { hoursBefore: 0, feePercentage: 33 },
    ];
    const cancelledAt = new Date("2026-03-15T13:00:00Z");
    const result = evaluateCancellationFee(
      policy,
      bookingStart,
      cancelledAt,
      1000, // $10.00
    );

    // 33% of 1000 = 330
    expect(result.feeCents).toBe(330);
    expect(result.refundCents).toBe(670);
  });

  it("handles single-tier policy", () => {
    const policy: CancellationPolicy = [
      { hoursBefore: 0, feePercentage: 100 },
    ];
    const cancelledAt = new Date("2026-03-15T13:00:00Z");
    const result = evaluateCancellationFee(
      policy,
      bookingStart,
      cancelledAt,
      3000,
    );

    expect(result.feeCents).toBe(3000);
    expect(result.refundCents).toBe(0);
  });

  it("throws for negative amount", () => {
    expect(() =>
      evaluateCancellationFee(
        standardPolicy,
        bookingStart,
        new Date(),
        -100,
      ),
    ).toThrow("must be >= 0");
  });

  it("throws for empty policy", () => {
    expect(() =>
      evaluateCancellationFee([], bookingStart, new Date(), 1000),
    ).toThrow("at least one tier");
  });

  it("handles zero original amount", () => {
    const cancelledAt = new Date("2026-03-15T13:00:00Z");
    const result = evaluateCancellationFee(
      standardPolicy,
      bookingStart,
      cancelledAt,
      0,
    );

    expect(result.feeCents).toBe(0);
    expect(result.refundCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computePaymentSummary
// ---------------------------------------------------------------------------

describe("computePaymentSummary", () => {
  it("computes summary for mixed payments", () => {
    const payments: PaymentRecord[] = [
      makePayment({ amountCents: 5000, status: "succeeded" }),
      makePayment({
        id: "pay-2",
        amountCents: 3000,
        status: "succeeded",
        refundAmountCents: 1500,
      }),
      makePayment({ id: "pay-3", amountCents: 2000, status: "failed" }),
      makePayment({
        id: "pay-4",
        amountCents: 4000,
        status: "refunded",
        refundAmountCents: 4000,
      }),
    ];

    const summary = computePaymentSummary(payments);

    expect(summary.totalRevenueCents).toBe(8000); // 5000 + 3000 (only succeeded)
    expect(summary.totalRefundedCents).toBe(5500); // 1500 + 4000
    expect(summary.netRevenueCents).toBe(2500);
    expect(summary.totalPayments).toBe(4);
    expect(summary.countByStatus).toEqual({
      succeeded: 2,
      failed: 1,
      refunded: 1,
    });
  });

  it("handles empty payments list", () => {
    const summary = computePaymentSummary([]);

    expect(summary.totalRevenueCents).toBe(0);
    expect(summary.totalRefundedCents).toBe(0);
    expect(summary.netRevenueCents).toBe(0);
    expect(summary.totalPayments).toBe(0);
    expect(summary.countByStatus).toEqual({});
  });

  it("includes partially_refunded in revenue", () => {
    const payments: PaymentRecord[] = [
      makePayment({
        amountCents: 5000,
        status: "partially_refunded",
        refundAmountCents: 2000,
      }),
    ];

    const summary = computePaymentSummary(payments);
    expect(summary.totalRevenueCents).toBe(5000);
    expect(summary.totalRefundedCents).toBe(2000);
    expect(summary.netRevenueCents).toBe(3000);
  });

  it("counts each status correctly", () => {
    const payments: PaymentRecord[] = [
      makePayment({ id: "p1", status: "pending" }),
      makePayment({ id: "p2", status: "pending" }),
      makePayment({ id: "p3", status: "succeeded" }),
    ];

    const summary = computePaymentSummary(payments);
    expect(summary.countByStatus.pending).toBe(2);
    expect(summary.countByStatus.succeeded).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// requiresPayment / hasNoShowFee
// ---------------------------------------------------------------------------

describe("requiresPayment", () => {
  it("returns true for positive price", () => {
    expect(requiresPayment(2500)).toBe(true);
  });

  it("returns false for zero price", () => {
    expect(requiresPayment(0)).toBe(false);
  });

  it("returns false for null", () => {
    expect(requiresPayment(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(requiresPayment(undefined)).toBe(false);
  });
});

describe("hasNoShowFee", () => {
  it("returns true for positive fee", () => {
    expect(hasNoShowFee(1000)).toBe(true);
  });

  it("returns false for zero", () => {
    expect(hasNoShowFee(0)).toBe(false);
  });

  it("returns false for null", () => {
    expect(hasNoShowFee(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validatePaymentAmount
// ---------------------------------------------------------------------------

describe("validatePaymentAmount", () => {
  it("accepts positive integer", () => {
    expect(() => validatePaymentAmount(100)).not.toThrow();
  });

  it("rejects zero", () => {
    expect(() => validatePaymentAmount(0)).toThrow(PaymentValidationError);
  });

  it("rejects negative", () => {
    expect(() => validatePaymentAmount(-100)).toThrow(PaymentValidationError);
  });

  it("rejects non-integer", () => {
    expect(() => validatePaymentAmount(10.5)).toThrow(PaymentValidationError);
  });
});

// ---------------------------------------------------------------------------
// validateCurrency
// ---------------------------------------------------------------------------

describe("validateCurrency", () => {
  it("accepts valid 3-letter code", () => {
    expect(() => validateCurrency("USD")).not.toThrow();
    expect(() => validateCurrency("EUR")).not.toThrow();
    expect(() => validateCurrency("GBP")).not.toThrow();
  });

  it("rejects lowercase", () => {
    expect(() => validateCurrency("usd")).toThrow(PaymentValidationError);
  });

  it("rejects wrong length", () => {
    expect(() => validateCurrency("US")).toThrow(PaymentValidationError);
    expect(() => validateCurrency("USDD")).toThrow(PaymentValidationError);
  });

  it("rejects empty string", () => {
    expect(() => validateCurrency("")).toThrow(PaymentValidationError);
  });
});

// ---------------------------------------------------------------------------
// formatPaymentAmount
// ---------------------------------------------------------------------------

describe("formatPaymentAmount", () => {
  it("formats USD correctly", () => {
    expect(formatPaymentAmount(2500, "USD")).toBe("$25.00");
  });

  it("formats zero amount", () => {
    expect(formatPaymentAmount(0, "USD")).toBe("$0.00");
  });

  it("formats large amounts", () => {
    expect(formatPaymentAmount(100000, "USD")).toBe("$1,000.00");
  });

  it("formats EUR", () => {
    const result = formatPaymentAmount(1550, "EUR");
    // Intl formatting varies by environment, just check it contains the value
    expect(result).toContain("15.50");
  });

  it("handles fractional cents via rounding", () => {
    expect(formatPaymentAmount(1, "USD")).toBe("$0.01");
  });
});
