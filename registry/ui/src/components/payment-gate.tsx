import React, { useState, useCallback } from "react";
import { cn } from "../utils/cn.js";

/** What kind of payment is being collected. Drives copy and labels. */
export type PaymentGateMode = "prepayment" | "deposit" | "no_show_hold";

/** Props for the PaymentGate component */
export interface PaymentGateProps {
  /** Amount in smallest currency unit (e.g., cents) */
  amountCents: number;
  /** ISO 4217 currency code (e.g., "USD") */
  currency: string;
  /** Stripe client secret for the PaymentIntent */
  clientSecret: string;
  /**
   * Type of payment being collected. Affects header copy and the submit label.
   * Defaults to "prepayment" for backwards compatibility.
   */
  mode?: PaymentGateMode;
  /**
   * Total event price in cents. When `mode === "deposit"`, used to display
   * the remaining balance ("Balance of $X due at the appointment").
   */
  totalPriceCents?: number;
  /** Called when payment succeeds */
  onPaymentSuccess: (paymentIntentId: string) => void;
  /** Called when payment fails */
  onPaymentError?: (error: string) => void;
  /** Called when the user cancels/goes back */
  onCancel?: () => void;
  /** Whether the payment is currently processing */
  isProcessing?: boolean;
  /** Label for the pay button (default: "Pay {amount}") */
  submitLabel?: string;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
  /**
   * Render prop for the payment form element.
   * Integrators mount their Stripe Elements (or other payment UI) here.
   * If not provided, a placeholder is rendered.
   */
  renderPaymentElement?: () => React.ReactNode;
}

const MODE_COPY: Record<PaymentGateMode, { title: string; verb: string }> = {
  prepayment: { title: "Payment", verb: "Pay" },
  deposit: { title: "Pay deposit", verb: "Pay deposit of" },
  no_show_hold: { title: "Authorize card", verb: "Authorize" },
};

/**
 * Payment gate component that wraps a Stripe Payment Element (or similar).
 *
 * This component provides the UI shell for collecting payment during booking.
 * The actual Stripe Elements integration is injected via `renderPaymentElement`
 * since it requires `@stripe/react-stripe-js` which is an app-level dependency.
 *
 * Supports: Card, Apple Pay, Google Pay (via Stripe Payment Element).
 *
 * @example
 * ```tsx
 * <PaymentGate
 *   amountCents={2500}
 *   currency="USD"
 *   clientSecret={clientSecret}
 *   onPaymentSuccess={(id) => confirmBooking(id)}
 *   renderPaymentElement={() => <PaymentElement />}
 * />
 * ```
 */
export function PaymentGate({
  amountCents,
  currency,
  clientSecret,
  mode = "prepayment",
  totalPriceCents,
  onPaymentSuccess,
  onPaymentError,
  onCancel,
  isProcessing: externalProcessing,
  submitLabel,
  className,
  style,
  renderPaymentElement,
}: PaymentGateProps) {
  const [internalProcessing, setInternalProcessing] = useState(false);
  const processing = externalProcessing ?? internalProcessing;

  const formattedAmount = formatAmount(amountCents, currency);
  const copy = MODE_COPY[mode];
  const buttonLabel = submitLabel ?? `${copy.verb} ${formattedAmount}`;
  const remainingCents =
    mode === "deposit" && typeof totalPriceCents === "number"
      ? Math.max(0, totalPriceCents - amountCents)
      : 0;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (processing) return;

      setInternalProcessing(true);

      try {
        // This component acts as a UI shell. On form submit it signals the parent
        // via onPaymentSuccess with the clientSecret. The parent is responsible
        // for calling stripe.confirmPayment() and handling the result.
        onPaymentSuccess(clientSecret);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Payment failed";
        onPaymentError?.(message);
      } finally {
        setInternalProcessing(false);
      }
    },
    [processing, clientSecret, onPaymentSuccess, onPaymentError],
  );

  return (
    <div
      className={cn("tbk-payment-gate", className)}
      style={style}
    >
      <div className="tbk-payment-header">
        <h3 className="tbk-payment-title">{copy.title}</h3>
        <p className="tbk-payment-amount">{formattedAmount}</p>
        {mode === "deposit" && remainingCents > 0 && (
          <p className="tbk-payment-balance-note">
            Balance of {formatAmount(remainingCents, currency)} due at the appointment.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="tbk-payment-form">
        <div className="tbk-payment-element">
          {renderPaymentElement ? (
            renderPaymentElement()
          ) : (
            <div className="tbk-payment-placeholder">
              <p>Payment element will be mounted here.</p>
              <p className="tbk-payment-hint">
                Provide a <code>renderPaymentElement</code> prop to render
                your Stripe PaymentElement.
              </p>
            </div>
          )}
        </div>

        <div className="tbk-payment-actions">
          <button
            type="submit"
            className="tbk-button-primary"
            disabled={processing}
          >
            {processing ? "Processing..." : buttonLabel}
          </button>

          {onCancel && (
            <button
              type="button"
              className="tbk-button-secondary"
              onClick={onCancel}
              disabled={processing}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Format an amount in cents to a display string */
function formatAmount(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}
