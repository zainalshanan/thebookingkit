import React, { useMemo, useState } from "react";
import { cn } from "../utils/cn.js";

/** A payment record for display */
export interface PaymentDisplayRecord {
  id: string;
  bookingId: string;
  customerName?: string;
  customerEmail?: string;
  amountCents: number;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "refunded" | "partially_refunded";
  paymentType: "prepayment" | "no_show_hold" | "cancellation_fee";
  refundAmountCents: number;
  createdAt: Date;
}

/** Props for the PaymentHistory component */
export interface PaymentHistoryProps {
  /** Payment records to display */
  payments: PaymentDisplayRecord[];
  /** Called when a row is clicked */
  onPaymentClick?: (payment: PaymentDisplayRecord) => void;
  /** Called when the booking link is clicked */
  onBookingClick?: (bookingId: string) => void;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Payment history table for the provider dashboard.
 *
 * Displays payment records with filtering by status and date range,
 * and summary totals for revenue and refunds.
 *
 * @example
 * ```tsx
 * <PaymentHistory
 *   payments={payments}
 *   onBookingClick={(id) => router.push(`/bookings/${id}`)}
 * />
 * ```
 */
export function PaymentHistory({
  payments,
  onPaymentClick,
  onBookingClick,
  className,
  style,
}: PaymentHistoryProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filteredPayments = useMemo(() => {
    let result = payments;

    if (statusFilter !== "all") {
      result = result.filter((p) => p.status === statusFilter);
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter((p) => p.createdAt >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((p) => p.createdAt <= to);
    }

    return result;
  }, [payments, statusFilter, dateFrom, dateTo]);

  const summary = useMemo(() => {
    let totalRevenue = 0;
    let totalRefunded = 0;

    for (const p of filteredPayments) {
      if (p.status === "succeeded" || p.status === "partially_refunded") {
        totalRevenue += p.amountCents;
      }
      totalRefunded += p.refundAmountCents;
    }

    return {
      totalRevenue,
      totalRefunded,
      netRevenue: totalRevenue - totalRefunded,
      count: filteredPayments.length,
    };
  }, [filteredPayments]);

  const currency = payments[0]?.currency ?? "USD";

  return (
    <div
      className={cn("slotkit-payment-history", className)}
      style={style}
    >
      {/* Summary cards */}
      <div className="slotkit-payment-summary">
        <div className="slotkit-summary-card">
          <span className="slotkit-summary-label">Total Revenue</span>
          <span className="slotkit-summary-value">
            {formatAmount(summary.totalRevenue, currency)}
          </span>
        </div>
        <div className="slotkit-summary-card">
          <span className="slotkit-summary-label">Total Refunded</span>
          <span className="slotkit-summary-value">
            {formatAmount(summary.totalRefunded, currency)}
          </span>
        </div>
        <div className="slotkit-summary-card">
          <span className="slotkit-summary-label">Net Revenue</span>
          <span className="slotkit-summary-value">
            {formatAmount(summary.netRevenue, currency)}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="slotkit-payment-filters">
        <div className="slotkit-filter-group">
          <label htmlFor="payment-status-filter" className="slotkit-label">
            Status
          </label>
          <select
            id="payment-status-filter"
            className="slotkit-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="succeeded">Completed</option>
            <option value="refunded">Refunded</option>
            <option value="partially_refunded">Partially Refunded</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className="slotkit-filter-group">
          <label htmlFor="payment-date-from" className="slotkit-label">
            From
          </label>
          <input
            id="payment-date-from"
            type="date"
            className="slotkit-input"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div className="slotkit-filter-group">
          <label htmlFor="payment-date-to" className="slotkit-label">
            To
          </label>
          <input
            id="payment-date-to"
            type="date"
            className="slotkit-input"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="slotkit-payment-table-wrapper">
        <table className="slotkit-payment-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Booking</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.length === 0 ? (
              <tr>
                <td colSpan={6} className="slotkit-empty-row">
                  No payments found.
                </td>
              </tr>
            ) : (
              filteredPayments.map((payment) => (
                <tr
                  key={payment.id}
                  className="slotkit-payment-row"
                  onClick={() => onPaymentClick?.(payment)}
                  role={onPaymentClick ? "button" : undefined}
                  tabIndex={onPaymentClick ? 0 : undefined}
                >
                  <td>{payment.createdAt.toLocaleDateString()}</td>
                  <td>
                    {payment.customerName ?? payment.customerEmail ?? "—"}
                  </td>
                  <td>
                    <span className="slotkit-payment-type-badge">
                      {formatPaymentType(payment.paymentType)}
                    </span>
                  </td>
                  <td>{formatAmount(payment.amountCents, payment.currency)}</td>
                  <td>
                    <span
                      className={cn(
                        "slotkit-payment-status-badge",
                        `slotkit-payment-status-${payment.status}`,
                      )}
                    >
                      {formatStatus(payment.status)}
                    </span>
                  </td>
                  <td>
                    {onBookingClick ? (
                      <button
                        className="slotkit-link-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBookingClick(payment.bookingId);
                        }}
                      >
                        View
                      </button>
                    ) : (
                      payment.bookingId.slice(0, 8)
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
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

function formatPaymentType(type: string): string {
  switch (type) {
    case "prepayment":
      return "Prepayment";
    case "no_show_hold":
      return "No-Show Hold";
    case "cancellation_fee":
      return "Cancellation Fee";
    default:
      return type;
  }
}

function formatStatus(status: string): string {
  switch (status) {
    case "succeeded":
      return "Completed";
    case "partially_refunded":
      return "Partial Refund";
    case "refunded":
      return "Refunded";
    case "pending":
      return "Pending";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}
