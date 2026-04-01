"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchBookings,
  changeBookingStatus,
  type SerializedBooking,
} from "@/lib/actions";
import { BARBER_SHOP } from "@/lib/constants";

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  confirmed: "#10b981",
  completed: "#6366f1",
  cancelled: "#ef4444",
  rejected: "#ef4444",
  no_show: "#f97316",
};

const STATUS_BG: Record<string, string> = {
  pending: "#fffbeb",
  confirmed: "#ecfdf5",
  completed: "#eef2ff",
  cancelled: "#fef2f2",
  rejected: "#fef2f2",
  no_show: "#fff7ed",
};

export function AdminDashboard() {
  const [bookings, setBookings] = useState<SerializedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    const data = await fetchBookings();
    setBookings(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const handleStatusChange = async (bookingId: string, newStatus: string) => {
    setActionLoading(bookingId);
    setError(null);
    const result = await changeBookingStatus(bookingId, newStatus);
    if (!result.success) {
      setError(result.error ?? "Failed to update status");
    }
    await loadBookings();
    setActionLoading(null);
  };

  const filtered =
    filter === "all" ? bookings : bookings.filter((b) => b.status === filter);

  const stats = {
    total: bookings.length,
    upcoming: bookings.filter(
      (b) => b.status === "confirmed" && new Date(b.startsAt) > new Date(),
    ).length,
    pending: bookings.filter((b) => b.status === "pending").length,
    completed: bookings.filter(
      (b) => b.status === "completed" || b.status === "cancelled" || b.status === "no_show",
    ).length,
  };

  const validActions: Record<string, { label: string; status: string; variant: string }[]> = {
    pending: [
      { label: "Confirm", status: "confirmed", variant: "success" },
      { label: "Reject", status: "rejected", variant: "danger" },
    ],
    confirmed: [
      { label: "Complete", status: "completed", variant: "primary" },
      { label: "Cancel", status: "cancelled", variant: "danger" },
      { label: "No Show", status: "no_show", variant: "warning" },
    ],
  };

  return (
    <div>
      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Bookings</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "#10b981" }}>{stats.upcoming}</div>
          <div className="stat-label">Upcoming</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "#f59e0b" }}>{stats.pending}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: "#6366f1" }}>{stats.completed}</div>
          <div className="stat-label">Resolved</div>
        </div>
      </div>

      {/* Schedule Info */}
      <div className="schedule-info">
        <h3>Business Hours</h3>
        <div className="hours-grid">
          <span className="hours-day">Mon-Fri</span>
          <span className="hours-time">9:00 AM - 7:00 PM</span>
          <span className="hours-day">Saturday</span>
          <span className="hours-time">10:00 AM - 5:00 PM</span>
          <span className="hours-day">Sunday</span>
          <span className="hours-time closed">Closed</span>
        </div>
        <p className="hours-tz">Timezone: {BARBER_SHOP.timezone}</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Filter Tabs */}
      <div className="filter-tabs">
        {["all", "pending", "confirmed", "completed", "cancelled"].map((f) => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== "all" && (
              <span className="filter-count">
                {bookings.filter((b) => b.status === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bookings Table */}
      {loading ? (
        <p className="loading-slots">Loading bookings...</p>
      ) : filtered.length === 0 ? (
        <p className="no-slots">No bookings found</p>
      ) : (
        <>
        <div className="bookings-table-wrap">
          <table className="bookings-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Customer</th>
                <th>Service</th>
                <th>Date & Time</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((booking) => {
                const dateStr = new Date(booking.startsAt).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
                const timeStr = new Date(booking.startsAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                });
                const actions = validActions[booking.status] ?? [];
                const isLoading = actionLoading === booking.id;

                return (
                  <tr key={booking.id}>
                    <td>
                      <code className="booking-id-sm">{booking.id}</code>
                    </td>
                    <td>
                      <div className="customer-cell">
                        <span className="customer-name">{booking.customerName}</span>
                        <span className="customer-email">{booking.customerEmail}</span>
                      </div>
                    </td>
                    <td>
                      <span className="service-name">{booking.serviceTitle}</span>
                      <span className="service-dur">{booking.duration} min</span>
                    </td>
                    <td>
                      <span className="date-cell">{dateStr}</span>
                      <span className="time-cell">{timeStr}</span>
                    </td>
                    <td>
                      <span
                        className="status-badge"
                        style={{
                          color: STATUS_COLORS[booking.status] ?? "#666",
                          background: STATUS_BG[booking.status] ?? "#f3f4f6",
                        }}
                      >
                        {booking.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-btns">
                        {actions.map((action) => (
                          <button
                            key={action.status}
                            className={`action-btn action-${action.variant}`}
                            onClick={() => handleStatusChange(booking.id, action.status)}
                            disabled={isLoading}
                          >
                            {isLoading ? "..." : action.label}
                          </button>
                        ))}
                        {actions.length === 0 && (
                          <span className="no-actions">No actions</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="bookings-cards-mobile">
          {filtered.map((booking) => {
            const dateStr = new Date(booking.startsAt).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
            const timeStr = new Date(booking.startsAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            });
            const actions = validActions[booking.status] ?? [];
            const isLoading = actionLoading === booking.id;

            return (
              <div key={booking.id} className="booking-card-mobile">
                <div className="card-row">
                  <div>
                    <div className="card-customer-name">{booking.customerName}</div>
                    <div className="card-customer-email">{booking.customerEmail}</div>
                  </div>
                  <span
                    className="status-badge"
                    style={{
                      color: STATUS_COLORS[booking.status] ?? "#666",
                      background: STATUS_BG[booking.status] ?? "#f3f4f6",
                    }}
                  >
                    {booking.status}
                  </span>
                </div>

                <div className="card-row">
                  <span className="card-label">Service</span>
                  <span className="card-value">
                    {booking.serviceTitle} &bull; {booking.duration} min
                  </span>
                </div>

                <div className="card-row">
                  <span className="card-label">Date & Time</span>
                  <span className="card-value">
                    {dateStr} at {timeStr}
                  </span>
                </div>

                <div className="card-actions">
                  {actions.map((action) => (
                    <button
                      key={action.status}
                      className={`action-btn action-${action.variant}`}
                      onClick={() => handleStatusChange(booking.id, action.status)}
                      disabled={isLoading}
                    >
                      {isLoading ? "..." : action.label}
                    </button>
                  ))}
                  {actions.length === 0 && (
                    <span className="no-actions">No actions</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      {/* Booking Details (expandable) */}
      {filtered.some((b) => b.responses && Object.keys(b.responses).length > 0) && (
        <div className="responses-section">
          <h3>Bookings with Custom Responses</h3>
          {filtered
            .filter((b) => b.responses && Object.keys(b.responses).length > 0)
            .map((b) => (
              <div key={b.id} className="response-card">
                <div className="response-header">
                  <code>{b.id}</code> &mdash; {b.customerName} &mdash; {b.serviceTitle}
                </div>
                <div className="response-data">
                  {Object.entries(b.responses!).map(([key, val]) => (
                    <div key={key} className="response-item">
                      <span className="response-key">{key}:</span>
                      <span className="response-val">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
