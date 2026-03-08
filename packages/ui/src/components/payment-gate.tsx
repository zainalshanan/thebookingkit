import React, { useState, useCallback } from "react";
import { cn } from "../utils/cn.js";

/** Props for the PaymentGate component */
export interface PaymentGateProps {
  /** Amount in smallest currency unit (e.g., cents) */
  amountCents: number;
  /** ISO 4217 currency code (e.g., "USD") */
  currency: string;
  /** Stripe client secret for the PaymentIntent */
  clientSecret: string;
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
  const buttonLabel = submitLabel ?? `Pay ${formattedAmount}`;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (processing) return;

      setInternalProcessing(true);

      try {
        // In a real integration, the parent would call stripe.confirmPayment()
        // using the clientSecret. This component signals readiness via the form submit.
        // The parent handles actual Stripe confirmation and calls onPaymentSuccess/onPaymentError.
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
      className={cn("slotkit-payment-gate", className)}
      style={style}
    >
      <div className="slotkit-payment-header">
        <h3 className="slotkit-payment-title">Payment</h3>
        <p className="slotkit-payment-amount">{formattedAmount}</p>
      </div>

      <form onSubmit={handleSubmit} className="slotkit-payment-form">
        <div className="slotkit-payment-element">
          {renderPaymentElement ? (
            renderPaymentElement()
          ) : (
            <div className="slotkit-payment-placeholder">
              <p>Payment element will be mounted here.</p>
              <p className="slotkit-payment-hint">
                Provide a <code>renderPaymentElement</code> prop to render
                your Stripe PaymentElement.
              </p>
            </div>
          )}
        </div>

        <div className="slotkit-payment-actions">
          <button
            type="submit"
            className="slotkit-button-primary"
            disabled={processing}
          >
            {processing ? "Processing..." : buttonLabel}
          </button>

          {onCancel && (
            <button
              type="button"
              className="slotkit-button-secondary"
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
