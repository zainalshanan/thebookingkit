/**
 * Deposit-collection orchestration helpers.
 *
 * Booking creation itself lives in the consuming app (the toolkit doesn't
 * ship a single canonical `POST /api/bookings`), but the deposit math and
 * Stripe wiring is the same everywhere. These helpers wrap the
 * {@link PaymentAdapter} so apps don't have to reimplement the dance:
 *
 * 1. {@link initiateDeposit} — call after the booking row is persisted.
 *    Creates a PaymentIntent on the provider's connected Stripe account,
 *    returns the `clientSecret` for the frontend (`payment-gate.tsx`) and
 *    the `paymentIntentId` to record in the `payments` table.
 *
 * 2. {@link refundDeposit} — call from a cancellation handler.
 *    Resolves the cancellation policy via {@link evaluateCancellationFee}
 *    and refunds the appropriate amount via the adapter.
 */

import {
  computeDepositAmount,
  evaluateCancellationFee,
  requiresDeposit,
  type CancellationPolicy,
  type DepositConfig,
} from "@thebookingkit/core";
import type {
  PaymentAdapter,
  CreatePaymentIntentResult,
  RefundResult,
} from "./adapters/payment-adapter.js";

export interface InitiateDepositInput {
  /** Booking ID — written to PaymentIntent metadata for webhook reconciliation. */
  bookingId: string;
  /** Deposit configuration from the event type. */
  deposit: DepositConfig;
  /** Event type price in cents (used for percentage deposits). */
  priceCents: number;
  /** ISO 4217 currency code (e.g. "USD"). */
  currency: string;
  /** Provider's Stripe Connect account ID. Required for Connect routing. */
  connectedAccountId?: string | null;
  /** Customer email — used for Stripe receipts. */
  customerEmail?: string;
  /** Extra metadata to merge onto the PaymentIntent. */
  metadata?: Record<string, string>;
}

export interface InitiateDepositResult {
  /** Whether a deposit was actually required and a PaymentIntent created. */
  required: boolean;
  /** Deposit amount in cents. 0 when `required === false`. */
  amountCents: number;
  /** PaymentIntent details when `required === true`; undefined otherwise. */
  intent?: CreatePaymentIntentResult;
}

/**
 * Create a deposit PaymentIntent if the event type requires one.
 *
 * Use the returned `clientSecret` to confirm payment in the browser via the
 * `payment-gate.tsx` component, and persist the returned `paymentIntentId`
 * on a `payments` row with `payment_type = 'deposit'`, `status = 'pending'`.
 *
 * Returns `{ required: false }` (no Stripe call) when no deposit is configured —
 * callers can short-circuit straight to confirmation.
 */
export async function initiateDeposit(
  adapter: PaymentAdapter,
  input: InitiateDepositInput,
): Promise<InitiateDepositResult> {
  if (!requiresDeposit(input.deposit, input.priceCents)) {
    return { required: false, amountCents: 0 };
  }

  const amountCents = computeDepositAmount(input.deposit, input.priceCents);

  const intent = await adapter.createPaymentIntent({
    amountCents,
    currency: input.currency,
    captureMethod: "automatic",
    connectedAccountId: input.connectedAccountId ?? undefined,
    customerEmail: input.customerEmail,
    metadata: {
      ...input.metadata,
      bookingId: input.bookingId,
      paymentType: "deposit",
    },
  });

  return { required: true, amountCents, intent };
}

export interface RefundDepositInput {
  /** PaymentIntent that captured the deposit. */
  paymentIntentId: string;
  /** Original deposit amount in cents (what was charged). */
  originalAmountCents: number;
  /** Cancellation policy from the event type. */
  policy: CancellationPolicy;
  /** When the booking is scheduled to start. */
  bookingStartsAt: Date;
  /** When the cancellation is happening (defaults to now). */
  cancelledAt?: Date;
  /** Provider's Stripe Connect account ID, if the intent was on Connect. */
  connectedAccountId?: string | null;
}

export interface RefundDepositResult {
  /** Refund amount in cents (0 when policy says no refund). */
  refundAmountCents: number;
  /** Cancellation fee retained, in cents. */
  feeCents: number;
  /** Stripe refund details when `refundAmountCents > 0`; undefined otherwise. */
  refund?: RefundResult;
}

/**
 * Refund a deposit per the event type's cancellation policy.
 *
 * Internally calls {@link evaluateCancellationFee} to decide how much to
 * keep vs refund, then issues a partial refund through the adapter.
 *
 * The caller is responsible for inserting a `payments` row with
 * `payment_type = 'cancellation_fee'` if `feeCents > 0`, mirroring the
 * pattern used by no-show captures.
 */
export async function refundDeposit(
  adapter: PaymentAdapter,
  input: RefundDepositInput,
): Promise<RefundDepositResult> {
  const result = evaluateCancellationFee(
    input.policy,
    input.bookingStartsAt,
    input.cancelledAt ?? new Date(),
    input.originalAmountCents,
  );

  if (result.refundCents <= 0) {
    return { refundAmountCents: 0, feeCents: result.feeCents };
  }

  const refund = await adapter.refund(
    input.paymentIntentId,
    result.refundCents,
    input.connectedAccountId ?? undefined,
  );

  return {
    refundAmountCents: result.refundCents,
    feeCents: result.feeCents,
    refund,
  };
}
