/**
 * Payment logic for booking prepayment, no-show fee holds,
 * time-based cancellation fees, and payment history aggregation.
 *
 * Framework-agnostic — uses the {@link PaymentAdapter} interface
 * for actual payment processing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single tier in a cancellation policy */
export interface CancellationPolicyTier {
  /** Hours before the booking start time */
  hoursBefore: number;
  /** Fee percentage (0–100) of the original payment */
  feePercentage: number;
}

/** Cancellation policy for an event type */
export type CancellationPolicy = CancellationPolicyTier[];

/** Payment type discriminator */
export type PaymentType = "prepay" | "no_show_hold" | "cancellation_fee";

/** Hold status for no-show fee holds */
export type HoldStatus = "authorized" | "captured" | "released";

/** Payment record stored in the database */
export interface PaymentRecord {
  id: string;
  bookingId: string;
  stripePaymentIntentId: string | null;
  amountCents: number;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "refunded" | "partially_refunded";
  paymentType: "prepayment" | "no_show_hold" | "cancellation_fee";
  refundAmountCents: number;
  createdAt: Date;
}

/** Result of evaluating a cancellation fee */
export interface CancellationFeeResult {
  /** The fee amount in cents */
  feeCents: number;
  /** The fee percentage that was applied */
  feePercentage: number;
  /** The refund amount (original - fee) */
  refundCents: number;
  /** The tier that matched */
  matchedTier: CancellationPolicyTier;
}

/** Aggregated payment summary for dashboard */
export interface PaymentSummary {
  /** Total revenue in cents (succeeded payments) */
  totalRevenueCents: number;
  /** Total refunded in cents */
  totalRefundedCents: number;
  /** Net revenue (total - refunds) */
  netRevenueCents: number;
  /** Count by status */
  countByStatus: Record<string, number>;
  /** Total number of payments */
  totalPayments: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Error thrown when payment validation fails */
export class PaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentValidationError";
  }
}

// ---------------------------------------------------------------------------
// Cancellation Policy
// ---------------------------------------------------------------------------

/**
 * Validate a cancellation policy definition.
 *
 * Rules:
 * - Must have at least one tier.
 * - Each tier's `hoursBefore` must be >= 0.
 * - Each tier's `feePercentage` must be 0–100.
 * - Tiers must be sorted descending by `hoursBefore` (longest notice first).
 * - No duplicate `hoursBefore` values.
 *
 * @throws {PaymentValidationError} If the policy is invalid.
 */
export function validateCancellationPolicy(policy: CancellationPolicy): void {
  if (!Array.isArray(policy) || policy.length === 0) {
    throw new PaymentValidationError(
      "Cancellation policy must have at least one tier",
    );
  }

  const seenHours = new Set<number>();

  for (const tier of policy) {
    if (typeof tier.hoursBefore !== "number" || tier.hoursBefore < 0) {
      throw new PaymentValidationError(
        `Invalid hoursBefore: ${tier.hoursBefore}. Must be >= 0`,
      );
    }

    if (
      typeof tier.feePercentage !== "number" ||
      tier.feePercentage < 0 ||
      tier.feePercentage > 100
    ) {
      throw new PaymentValidationError(
        `Invalid feePercentage: ${tier.feePercentage}. Must be 0–100`,
      );
    }

    if (seenHours.has(tier.hoursBefore)) {
      throw new PaymentValidationError(
        `Duplicate hoursBefore value: ${tier.hoursBefore}`,
      );
    }
    seenHours.add(tier.hoursBefore);
  }

  // Check sorted descending by hoursBefore
  for (let i = 1; i < policy.length; i++) {
    if (policy[i].hoursBefore >= policy[i - 1].hoursBefore) {
      throw new PaymentValidationError(
        "Cancellation policy tiers must be sorted descending by hoursBefore",
      );
    }
  }
}

/**
 * Evaluate a cancellation policy to determine the fee for a cancellation.
 *
 * The policy tiers are checked from longest notice to shortest.
 * The first tier where the remaining hours is <= `hoursBefore` is matched.
 *
 * Example policy:
 * ```
 * [
 *   { hoursBefore: 24, feePercentage: 0 },    // Free cancellation 24h+
 *   { hoursBefore: 2, feePercentage: 50 },     // 50% fee 2–24h before
 *   { hoursBefore: 0, feePercentage: 100 },    // 100% fee <2h before
 * ]
 * ```
 *
 * @param policy - The cancellation policy tiers (sorted descending by hoursBefore)
 * @param bookingStartsAt - When the booking starts
 * @param cancelledAt - When the cancellation is happening
 * @param originalAmountCents - The original payment amount in cents
 * @returns The cancellation fee result
 * @throws {PaymentValidationError} If inputs are invalid
 */
export function evaluateCancellationFee(
  policy: CancellationPolicy,
  bookingStartsAt: Date,
  cancelledAt: Date,
  originalAmountCents: number,
): CancellationFeeResult {
  if (originalAmountCents < 0) {
    throw new PaymentValidationError("Original amount must be >= 0");
  }

  if (policy.length === 0) {
    throw new PaymentValidationError("Cancellation policy must have at least one tier");
  }

  const hoursRemaining =
    (bookingStartsAt.getTime() - cancelledAt.getTime()) / (1000 * 60 * 60);

  // Walk tiers from longest notice to shortest
  // Find the tier where hoursRemaining is >= tier.hoursBefore
  let matchedTier = policy[policy.length - 1]; // default to shortest notice tier

  for (const tier of policy) {
    if (hoursRemaining >= tier.hoursBefore) {
      matchedTier = tier;
      break;
    }
  }

  const feeCents = Math.round(
    (originalAmountCents * matchedTier.feePercentage) / 100,
  );

  return {
    feeCents,
    feePercentage: matchedTier.feePercentage,
    refundCents: originalAmountCents - feeCents,
    matchedTier,
  };
}

// ---------------------------------------------------------------------------
// Payment Summary
// ---------------------------------------------------------------------------

/**
 * Compute an aggregated payment summary from a list of payment records.
 *
 * @param payments - Array of payment records
 * @returns Aggregated summary with revenue, refunds, and counts
 */
export function computePaymentSummary(
  payments: PaymentRecord[],
): PaymentSummary {
  const countByStatus: Record<string, number> = {};
  let totalRevenueCents = 0;
  let totalRefundedCents = 0;

  for (const payment of payments) {
    countByStatus[payment.status] =
      (countByStatus[payment.status] || 0) + 1;

    if (payment.status === "succeeded" || payment.status === "partially_refunded") {
      totalRevenueCents += payment.amountCents;
    }

    totalRefundedCents += payment.refundAmountCents;
  }

  return {
    totalRevenueCents,
    totalRefundedCents,
    netRevenueCents: totalRevenueCents - totalRefundedCents,
    countByStatus,
    totalPayments: payments.length,
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether an event type requires payment.
 *
 * @param priceCents - The event type price in cents
 * @returns Whether the event type requires payment UI
 */
export function requiresPayment(priceCents: number | null | undefined): boolean {
  return typeof priceCents === "number" && priceCents > 0;
}

/**
 * Determine whether an event type has a no-show fee.
 *
 * @param noShowFeeCents - The no-show fee in cents
 * @returns Whether the event type has a no-show hold
 */
export function hasNoShowFee(noShowFeeCents: number | null | undefined): boolean {
  return typeof noShowFeeCents === "number" && noShowFeeCents > 0;
}

/**
 * Validate payment amount.
 *
 * @param amountCents - Amount in cents
 * @throws {PaymentValidationError} If amount is invalid
 */
export function validatePaymentAmount(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new PaymentValidationError(
      `Invalid payment amount: ${amountCents}. Must be a positive integer`,
    );
  }
}

/**
 * Validate a 3-letter ISO 4217 currency code.
 *
 * @param currency - The currency code
 * @throws {PaymentValidationError} If currency is invalid
 */
export function validateCurrency(currency: string): void {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new PaymentValidationError(
      `Invalid currency code: "${currency}". Must be a 3-letter ISO 4217 code (e.g., "USD")`,
    );
  }
}

/**
 * Format a payment amount in cents to a display string.
 *
 * @param amountCents - Amount in cents
 * @param currency - ISO 4217 currency code
 * @returns Formatted string like "$25.00"
 */
export function formatPaymentAmount(
  amountCents: number,
  currency: string,
): string {
  const amount = amountCents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    // Fallback for unsupported currencies
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}
