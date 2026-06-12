/**
 * Abstract interface for payment processing.
 *
 * Default implementation: Stripe via `stripe` npm package.
 * Alternatives: Square, PayPal, or mock for testing.
 */

/** Result of creating a payment intent */
export interface CreatePaymentIntentResult {
  /** Stripe PaymentIntent ID (or equivalent) */
  paymentIntentId: string;
  /** Client secret for confirming payment on the frontend */
  clientSecret: string;
  /**
   * Current status of the payment intent.
   *
   * `requires_capture` means a manual-capture intent has been authorized —
   * the funds are held and await {@link PaymentAdapter.capturePaymentIntent}
   * or {@link PaymentAdapter.cancelPaymentIntent}.
   */
  status:
    | "requires_payment_method"
    | "requires_confirmation"
    | "requires_action"
    | "requires_capture"
    | "processing"
    | "succeeded"
    | "canceled";
}

/** Result of creating a setup intent for card authorization */
export interface CreateSetupIntentResult {
  /** Stripe SetupIntent ID (or equivalent) */
  setupIntentId: string;
  /** Client secret for confirming setup on the frontend */
  clientSecret: string;
}

/** Result of capturing a held payment */
export interface CaptureResult {
  /** Whether the capture was successful */
  captured: boolean;
  /** The payment intent ID that was captured */
  paymentIntentId: string;
}

/** Result of a refund operation */
export interface RefundResult {
  /** Refund ID from the payment provider */
  refundId: string;
  /** Amount refunded in cents */
  amountCents: number;
  /** Status of the refund */
  status: "succeeded" | "pending" | "failed";
}

/** Options for creating a payment intent */
export interface CreatePaymentIntentOptions {
  /** Amount in smallest currency unit (e.g., cents for USD) */
  amountCents: number;
  /** ISO 4217 currency code */
  currency: string;
  /** Connected account ID (for Stripe Connect) */
  connectedAccountId?: string;
  /** Whether to use manual capture (for holds) */
  captureMethod?: "automatic" | "manual";
  /** Metadata to attach to the payment */
  metadata?: Record<string, string>;
  /** Customer email for receipt */
  customerEmail?: string;
  /**
   * Payment-provider customer to attach the intent to (Stripe `customer`).
   * Required for {@link setupFutureUsage} and for off-session charges —
   * the saved payment method lives on this customer.
   *
   * With Connect: the customer must exist on the same account the intent is
   * created on (the connected account when `connectedAccountId` is set).
   */
  customerId?: string;
  /**
   * Save the payment method during this payment for later reuse
   * (Stripe `setup_future_usage`). Use `"off_session"` to allow charging the
   * card later without the customer present — e.g. no-show / late-cancel fees
   * — in one sheet, with no separate SetupIntent step. Requires
   * {@link customerId}.
   */
  setupFutureUsage?: "off_session" | "on_session";
  /**
   * Charge a previously saved payment method (Stripe `payment_method`).
   * Combine with `offSession: true` + `confirm: true` to charge a card on
   * file without the customer present.
   */
  paymentMethodId?: string;
  /** Mark the payment as merchant-initiated (Stripe `off_session`). */
  offSession?: boolean;
  /** Confirm the intent immediately on creation (Stripe `confirm`). */
  confirm?: boolean;
  /**
   * Idempotency key forwarded to the provider. Pass a stable value (e.g.
   * `deposit:<bookingId>`) so client retries can't create duplicate charges.
   */
  idempotencyKey?: string;
}

/** Options for creating a setup intent */
export interface CreateSetupIntentOptions {
  /** Connected account ID (for Stripe Connect) */
  connectedAccountId?: string;
  /** Customer email */
  customerEmail?: string;
  /**
   * Payment-provider customer to attach the saved payment method to
   * (Stripe `customer`). Without it the stored card is not reusable for
   * off-session charges.
   */
  customerId?: string;
  /** Metadata */
  metadata?: Record<string, string>;
}

/**
 * Payment processing adapter interface.
 *
 * Implementations handle creating payment intents, capturing holds,
 * processing refunds, and managing Stripe Connect onboarding.
 */
export interface PaymentAdapter {
  /**
   * Create a payment intent for collecting payment.
   * Use `captureMethod: 'manual'` for no-show fee holds.
   */
  createPaymentIntent(options: CreatePaymentIntentOptions): Promise<CreatePaymentIntentResult>;

  /**
   * Create a setup intent for authorizing a card without charging.
   */
  createSetupIntent(options: CreateSetupIntentOptions): Promise<CreateSetupIntentResult>;

  /**
   * Capture a previously authorized (manual capture) payment intent.
   * Used when marking a booking as no-show.
   *
   * @param connectedAccountId - When the original PaymentIntent was created on
   *   a Stripe Connect account, the same account must be passed here.
   */
  capturePaymentIntent(
    paymentIntentId: string,
    amountCents?: number,
    connectedAccountId?: string,
  ): Promise<CaptureResult>;

  /**
   * Cancel a payment intent (release a hold).
   * Used when a booking completes normally and the no-show hold should be released.
   *
   * @param connectedAccountId - See {@link capturePaymentIntent}.
   */
  cancelPaymentIntent(
    paymentIntentId: string,
    connectedAccountId?: string,
  ): Promise<void>;

  /**
   * Refund a payment intent (full or partial).
   *
   * @param connectedAccountId - See {@link capturePaymentIntent}.
   */
  refund(
    paymentIntentId: string,
    amountCents?: number,
    connectedAccountId?: string,
  ): Promise<RefundResult>;

  /**
   * Generate a Stripe Connect onboarding URL for a provider.
   * Returns the URL the provider should be redirected to.
   *
   * @param connectedAccountId - Existing connected account ID. If omitted, a
   *   fresh Express account is created and onboarding starts from scratch.
   */
  createConnectOnboardingUrl(options: {
    returnUrl: string;
    refreshUrl: string;
    connectedAccountId?: string;
  }): Promise<string>;

  /**
   * Disconnect a Stripe Connect account.
   */
  disconnectAccount(connectedAccountId: string): Promise<void>;
}
