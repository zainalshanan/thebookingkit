"use client";

import { useState } from "react";
import { CustomerBooking } from "./customer-booking";
import { AdminDashboard } from "./admin-dashboard";

export function BookingSection() {
  const [showApiCalls, setShowApiCalls] = useState(false);
  const [activeView, setActiveView] = useState<"customer" | "admin">("customer");
  const [currentApiCall, setCurrentApiCall] = useState<string | null>(null);

  return (
    <section className="section-shell" id="booking">
      <div className="section-inner" style={{ maxWidth: "960px" }}>
        <div className="section-header">
          <span className="section-eyebrow">Interactive Demo</span>
          <h2 className="section-title-lg">Live Booking Flow</h2>
          <p className="section-desc">
            A real barber shop booking system — Fade &amp; Shave Barbershop — powered entirely
            by <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.9em", background: "var(--surface-dark)", padding: "0.1em 0.35em", borderRadius: "4px" }}>@thebookingkit/core</code>.
            All slot computation runs server-side using pure functions.
          </p>
        </div>

        <div className="booking-flow-wrap">
          <div className="booking-flow-header">
            <div className="booking-flow-title">
              <strong>Fade &amp; Shave Barbershop</strong>
              <span>123 Main Street, Brooklyn, NY &bull; America/New_York</span>
            </div>

            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", overflow: "hidden" }}>
                <button
                  onClick={() => setActiveView("customer")}
                  style={{
                    padding: "0.3rem 0.75rem",
                    border: "none",
                    background: activeView === "customer" ? "var(--accent)" : "none",
                    color: activeView === "customer" ? "white" : "rgba(255,255,255,0.5)",
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  Customer
                </button>
                <button
                  onClick={() => setActiveView("admin")}
                  style={{
                    padding: "0.3rem 0.75rem",
                    border: "none",
                    background: activeView === "admin" ? "var(--accent)" : "none",
                    color: activeView === "admin" ? "white" : "rgba(255,255,255,0.5)",
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  Admin
                </button>
              </div>

              <label className="api-toggle-wrap">
                <input
                  type="checkbox"
                  checked={showApiCalls}
                  onChange={(e) => setShowApiCalls(e.target.checked)}
                />
                Show API Calls
              </label>
            </div>
          </div>

          {showApiCalls && (
            <div className="api-call-banner">
              <span className="api-call-method">SERVER</span>
              <span className="api-call-fn">@thebookingkit/core</span>
              <span className="api-call-args">
                {currentApiCall
                  ? currentApiCall
                  : activeView === "customer"
                  ? "getAvailableSlots(rules, overrides, bookings, range, tz, { duration, bufferBefore, bufferAfter })"
                  : "fetchBookings() → SerializedBooking[] | changeBookingStatus(id, status)"}
              </span>
            </div>
          )}

          <div className="booking-flow-body">
            {activeView === "customer" ? (
              <CustomerBooking onApiCall={showApiCalls ? setCurrentApiCall : undefined} />
            ) : (
              <AdminDashboard />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
