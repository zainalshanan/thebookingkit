import React, { useState, useCallback } from "react";
import { cn } from "../utils/cn.js";

/** A webhook delivery log entry */
export interface WebhookDeliveryLog {
  id: string;
  trigger: string;
  responseCode: number | null;
  success: boolean;
  deliveredAt: Date;
  error?: string;
}

/** A webhook subscription for display */
export interface WebhookDisplay {
  id: string;
  subscriberUrl: string;
  triggers: string[];
  isActive: boolean;
  hasSecret: boolean;
  deliveries?: WebhookDeliveryLog[];
}

/** Props for the WebhookManager component */
export interface WebhookManagerProps {
  /** Webhook subscriptions to display */
  webhooks: WebhookDisplay[];
  /** Called when creating a new webhook */
  onCreate?: (data: {
    subscriberUrl: string;
    triggers: string[];
    secret?: string;
  }) => void;
  /** Called when toggling a webhook's active state */
  onToggle?: (webhookId: string, active: boolean) => void;
  /** Called when deleting a webhook */
  onDelete?: (webhookId: string) => void;
  /** Called when sending a test payload */
  onTest?: (webhookId: string) => void;
  /** Available trigger options */
  availableTriggers?: { value: string; label: string }[];
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

const DEFAULT_AVAILABLE_TRIGGERS = [
  { value: "BOOKING_CREATED", label: "Booking Created" },
  { value: "BOOKING_CONFIRMED", label: "Booking Confirmed" },
  { value: "BOOKING_CANCELLED", label: "Booking Cancelled" },
  { value: "BOOKING_RESCHEDULED", label: "Booking Rescheduled" },
  { value: "BOOKING_REJECTED", label: "Booking Rejected" },
  { value: "BOOKING_PAID", label: "Booking Paid" },
  { value: "BOOKING_NO_SHOW", label: "Booking No-Show" },
  { value: "FORM_SUBMITTED", label: "Form Submitted" },
  { value: "OOO_CREATED", label: "Out of Office Created" },
];

/**
 * Admin component for managing webhook subscriptions and viewing delivery history.
 *
 * @example
 * ```tsx
 * <WebhookManager
 *   webhooks={webhooks}
 *   onCreate={(data) => createWebhook(data)}
 *   onToggle={(id, active) => toggleWebhook(id, active)}
 *   onTest={(id) => testWebhook(id)}
 * />
 * ```
 */
export function WebhookManager({
  webhooks,
  onCreate,
  onToggle,
  onDelete,
  onTest,
  availableTriggers = DEFAULT_AVAILABLE_TRIGGERS,
  className,
  style,
}: WebhookManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [selectedTriggers, setSelectedTriggers] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleTriggerToggle = useCallback((trigger: string) => {
    setSelectedTriggers((prev) =>
      prev.includes(trigger)
        ? prev.filter((t) => t !== trigger)
        : [...prev, trigger],
    );
  }, []);

  const handleCreate = useCallback(() => {
    if (!newUrl || selectedTriggers.length === 0) return;
    onCreate?.({
      subscriberUrl: newUrl,
      triggers: selectedTriggers,
      secret: newSecret || undefined,
    });
    setNewUrl("");
    setNewSecret("");
    setSelectedTriggers([]);
    setShowForm(false);
  }, [newUrl, newSecret, selectedTriggers, onCreate]);

  return (
    <div className={cn("slotkit-webhook-manager", className)} style={style}>
      <div className="slotkit-webhook-header">
        <h3>Webhooks</h3>
        {onCreate && (
          <button
            className="slotkit-button-primary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Cancel" : "Add Webhook"}
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="slotkit-webhook-form">
          <div className="slotkit-field">
            <label htmlFor="wh-url" className="slotkit-label">
              Endpoint URL
            </label>
            <input
              id="wh-url"
              type="url"
              className="slotkit-input"
              placeholder="https://your-api.com/webhooks"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
          </div>

          <div className="slotkit-field">
            <label htmlFor="wh-secret" className="slotkit-label">
              Secret (optional)
            </label>
            <input
              id="wh-secret"
              type="password"
              className="slotkit-input"
              placeholder="whsec_..."
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value)}
            />
          </div>

          <div className="slotkit-field">
            <label className="slotkit-label">Triggers</label>
            <div className="slotkit-checkbox-group">
              {availableTriggers.map((t) => (
                <label key={t.value} className="slotkit-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedTriggers.includes(t.value)}
                    onChange={() => handleTriggerToggle(t.value)}
                  />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            className="slotkit-button-primary"
            onClick={handleCreate}
            disabled={!newUrl || selectedTriggers.length === 0}
          >
            Create Webhook
          </button>
        </div>
      )}

      {/* Webhook list */}
      <div className="slotkit-webhook-list">
        {webhooks.length === 0 ? (
          <p className="slotkit-empty-state">
            No webhook subscriptions configured.
          </p>
        ) : (
          webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className={cn(
                "slotkit-webhook-card",
                !webhook.isActive && "slotkit-webhook-inactive",
              )}
            >
              <div className="slotkit-webhook-card-header">
                <div className="slotkit-webhook-url">
                  <code>{webhook.subscriberUrl}</code>
                  {webhook.hasSecret && (
                    <span className="slotkit-badge">Signed</span>
                  )}
                </div>
                <div className="slotkit-webhook-actions">
                  {onTest && (
                    <button
                      className="slotkit-button-secondary"
                      onClick={() => onTest(webhook.id)}
                    >
                      Test
                    </button>
                  )}
                  {onToggle && (
                    <button
                      className="slotkit-button-secondary"
                      onClick={() =>
                        onToggle(webhook.id, !webhook.isActive)
                      }
                    >
                      {webhook.isActive ? "Disable" : "Enable"}
                    </button>
                  )}
                  {onDelete && (
                    <button
                      className="slotkit-button-danger"
                      onClick={() => onDelete(webhook.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              <div className="slotkit-webhook-triggers">
                {webhook.triggers.map((t) => (
                  <span key={t} className="slotkit-badge">
                    {t}
                  </span>
                ))}
              </div>

              {/* Delivery history toggle */}
              {webhook.deliveries && webhook.deliveries.length > 0 && (
                <>
                  <button
                    className="slotkit-link-button"
                    onClick={() =>
                      setExpandedId(
                        expandedId === webhook.id ? null : webhook.id,
                      )
                    }
                  >
                    {expandedId === webhook.id
                      ? "Hide delivery history"
                      : `Show delivery history (${webhook.deliveries.length})`}
                  </button>

                  {expandedId === webhook.id && (
                    <table className="slotkit-webhook-deliveries-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Trigger</th>
                          <th>Status</th>
                          <th>Code</th>
                          <th>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {webhook.deliveries.map((d) => (
                          <tr key={d.id}>
                            <td>{d.deliveredAt.toLocaleString()}</td>
                            <td>{d.trigger}</td>
                            <td>
                              <span
                                className={cn(
                                  "slotkit-delivery-status",
                                  d.success
                                    ? "slotkit-delivery-success"
                                    : "slotkit-delivery-failed",
                                )}
                              >
                                {d.success ? "Success" : "Failed"}
                              </span>
                            </td>
                            <td>{d.responseCode ?? "—"}</td>
                            <td>{d.error ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
