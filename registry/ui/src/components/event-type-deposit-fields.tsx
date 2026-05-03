import React from "react";
import { cn } from "../utils/cn.js";

/** Props for the EventTypeDepositFields component */
export interface EventTypeDepositFieldsProps {
  /** Fixed deposit amount in cents (or null if unset) */
  depositCents: number | null;
  /** Deposit as a percentage of price (0–100), or null if unset */
  depositPercentage: number | null;
  /** Event-type price in cents — used to preview the resolved deposit */
  priceCents: number;
  /** ISO 4217 currency for preview formatting */
  currency: string;
  /** Called when the fixed deposit changes */
  onDepositCentsChange: (value: number | null) => void;
  /** Called when the percentage deposit changes */
  onDepositPercentageChange: (value: number | null) => void;
  /** Disable both inputs */
  disabled?: boolean;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Form fieldset for configuring a deposit on an event type.
 *
 * Renders two inputs — a fixed deposit (cents) and a percentage of price —
 * plus a live preview of the resolved deposit amount. Mirrors the resolution
 * rule in `@thebookingkit/core`'s `computeDepositAmount`: percentage wins
 * when both are set, and the deposit is capped at the event price.
 *
 * Drop into any event-type editor:
 * ```tsx
 * <EventTypeDepositFields
 *   depositCents={form.depositCents}
 *   depositPercentage={form.depositPercentage}
 *   priceCents={form.priceCents}
 *   currency={form.currency}
 *   onDepositCentsChange={(v) => form.setDepositCents(v)}
 *   onDepositPercentageChange={(v) => form.setDepositPercentage(v)}
 * />
 * ```
 */
export function EventTypeDepositFields({
  depositCents,
  depositPercentage,
  priceCents,
  currency,
  onDepositCentsChange,
  onDepositPercentageChange,
  disabled,
  className,
  style,
}: EventTypeDepositFieldsProps) {
  const previewCents = computeDepositPreview(
    depositCents,
    depositPercentage,
    priceCents,
  );
  const hasDeposit = previewCents > 0;

  const fixedDisabled = disabled || (depositPercentage ?? 0) > 0;

  return (
    <fieldset
      className={cn("tbk-event-type-deposit-fields", className)}
      style={style}
      disabled={disabled}
    >
      <legend className="tbk-fieldset-legend">Deposit</legend>
      <p className="tbk-fieldset-hint">
        Collect a portion of the price upfront. If both fields are set,
        percentage takes precedence.
      </p>

      <div className="tbk-form-row">
        <div className="tbk-form-field">
          <label htmlFor="deposit-cents" className="tbk-label">
            Fixed deposit
          </label>
          <div className="tbk-input-with-suffix">
            <input
              id="deposit-cents"
              type="number"
              className="tbk-input"
              min={0}
              step={1}
              value={depositCents == null ? "" : centsToDollars(depositCents)}
              disabled={fixedDisabled}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  onDepositCentsChange(null);
                  return;
                }
                const dollars = Number(raw);
                if (Number.isFinite(dollars) && dollars >= 0) {
                  onDepositCentsChange(Math.round(dollars * 100));
                }
              }}
            />
            <span className="tbk-input-suffix">{currency.toUpperCase()}</span>
          </div>
        </div>

        <div className="tbk-form-field">
          <label htmlFor="deposit-percentage" className="tbk-label">
            Percentage of price
          </label>
          <div className="tbk-input-with-suffix">
            <input
              id="deposit-percentage"
              type="number"
              className="tbk-input"
              min={0}
              max={100}
              step={1}
              value={depositPercentage ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  onDepositPercentageChange(null);
                  return;
                }
                const pct = Number(raw);
                if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
                  onDepositPercentageChange(pct);
                }
              }}
            />
            <span className="tbk-input-suffix">%</span>
          </div>
        </div>
      </div>

      <p className="tbk-deposit-preview" aria-live="polite">
        {hasDeposit
          ? `Customers will pay ${formatAmount(previewCents, currency)} upfront${
              priceCents > previewCents
                ? `, with ${formatAmount(priceCents - previewCents, currency)} due at the appointment.`
                : "."
            }`
          : "No deposit will be collected."}
      </p>
    </fieldset>
  );
}

/** Mirror of `computeDepositAmount` from @thebookingkit/core (kept inline so this component is copy-paste). */
function computeDepositPreview(
  depositCents: number | null,
  depositPercentage: number | null,
  priceCents: number,
): number {
  if (!Number.isFinite(priceCents) || priceCents <= 0) return 0;
  const pct = depositPercentage ?? 0;
  const fixed = depositCents ?? 0;
  if (pct < 0 || pct > 100 || fixed < 0) return 0;
  const raw = pct > 0 ? Math.round((priceCents * pct) / 100) : fixed;
  return Math.min(Math.max(raw, 0), priceCents);
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

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
