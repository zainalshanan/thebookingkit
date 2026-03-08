import React, { useState, useCallback } from "react";
import { cn } from "../utils/cn.js";

/** Trigger option for the workflow builder */
export interface TriggerOption {
  value: string;
  label: string;
}

/** Action type option */
export interface ActionTypeOption {
  value: string;
  label: string;
}

/** A condition in the builder */
export interface BuilderCondition {
  field: string;
  operator: string;
  value: string;
}

/** An action in the builder */
export interface BuilderAction {
  type: string;
  config: Record<string, string>;
}

/** The complete workflow form values */
export interface WorkflowFormValues {
  name: string;
  trigger: string;
  conditions: BuilderCondition[];
  actions: BuilderAction[];
  isActive: boolean;
}

/** Execution log entry for display */
export interface WorkflowLogDisplay {
  id: string;
  actionType: string;
  status: "success" | "error" | "skipped";
  error?: string;
  executedAt: Date;
  bookingId?: string;
}

/** Props for the WorkflowBuilder component */
export interface WorkflowBuilderProps {
  /** Initial values for editing an existing workflow */
  initialValues?: Partial<WorkflowFormValues>;
  /** Available trigger options */
  triggers?: TriggerOption[];
  /** Available action type options */
  actionTypes?: ActionTypeOption[];
  /** Available condition field options */
  conditionFields?: { value: string; label: string }[];
  /** Called when the workflow is saved */
  onSave: (values: WorkflowFormValues) => void;
  /** Called when cancelled */
  onCancel?: () => void;
  /** Execution history logs */
  executionLogs?: WorkflowLogDisplay[];
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

const DEFAULT_TRIGGERS: TriggerOption[] = [
  { value: "booking_created", label: "Booking Created" },
  { value: "booking_confirmed", label: "Booking Confirmed" },
  { value: "booking_cancelled", label: "Booking Cancelled" },
  { value: "booking_rescheduled", label: "Booking Rescheduled" },
  { value: "before_event", label: "Before Event Start" },
  { value: "after_event", label: "After Event End" },
  { value: "payment_received", label: "Payment Received" },
  { value: "no_show_confirmed", label: "No-Show Confirmed" },
];

const DEFAULT_ACTION_TYPES: ActionTypeOption[] = [
  { value: "send_email", label: "Send Email" },
  { value: "send_sms", label: "Send SMS" },
  { value: "fire_webhook", label: "Fire Webhook" },
  { value: "update_status", label: "Update Status" },
  { value: "create_calendar_event", label: "Create Calendar Event" },
];

/**
 * Visual workflow builder for creating trigger-condition-action automations.
 *
 * Guides the user through 4 steps:
 * 1. Select trigger
 * 2. Add conditions (optional)
 * 3. Configure actions
 * 4. Toggle active/inactive
 *
 * @example
 * ```tsx
 * <WorkflowBuilder
 *   onSave={(values) => createWorkflow(values)}
 *   executionLogs={logs}
 * />
 * ```
 */
export function WorkflowBuilder({
  initialValues,
  triggers = DEFAULT_TRIGGERS,
  actionTypes = DEFAULT_ACTION_TYPES,
  conditionFields = [
    { value: "eventTypeId", label: "Event Type" },
    { value: "status", label: "Booking Status" },
    { value: "customerEmail", label: "Customer Email" },
  ],
  onSave,
  onCancel,
  executionLogs,
  className,
  style,
}: WorkflowBuilderProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [trigger, setTrigger] = useState(
    initialValues?.trigger ?? triggers[0]?.value ?? "",
  );
  const [conditions, setConditions] = useState<BuilderCondition[]>(
    initialValues?.conditions ?? [],
  );
  const [actions, setActions] = useState<BuilderAction[]>(
    initialValues?.actions ?? [{ type: "send_email", config: {} }],
  );
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);

  const addCondition = useCallback(() => {
    setConditions((prev) => [
      ...prev,
      { field: conditionFields[0]?.value ?? "", operator: "equals", value: "" },
    ]);
  }, [conditionFields]);

  const removeCondition = useCallback((index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateCondition = useCallback(
    (index: number, updates: Partial<BuilderCondition>) => {
      setConditions((prev) =>
        prev.map((c, i) => (i === index ? { ...c, ...updates } : c)),
      );
    },
    [],
  );

  const addAction = useCallback(() => {
    setActions((prev) => [
      ...prev,
      { type: actionTypes[0]?.value ?? "send_email", config: {} },
    ]);
  }, [actionTypes]);

  const removeAction = useCallback((index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateAction = useCallback(
    (index: number, updates: Partial<BuilderAction>) => {
      setActions((prev) =>
        prev.map((a, i) => (i === index ? { ...a, ...updates } : a)),
      );
    },
    [],
  );

  const updateActionConfig = useCallback(
    (index: number, key: string, value: string) => {
      setActions((prev) =>
        prev.map((a, i) =>
          i === index ? { ...a, config: { ...a.config, [key]: value } } : a,
        ),
      );
    },
    [],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSave({ name, trigger, conditions, actions, isActive });
    },
    [name, trigger, conditions, actions, isActive, onSave],
  );

  return (
    <div className={cn("slotkit-workflow-builder", className)} style={style}>
      <form onSubmit={handleSubmit}>
        {/* Workflow Name */}
        <div className="slotkit-field">
          <label htmlFor="wf-name" className="slotkit-label">
            Workflow Name
          </label>
          <input
            id="wf-name"
            type="text"
            className="slotkit-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Send confirmation email"
            required
          />
        </div>

        {/* Step 1: Trigger */}
        <fieldset className="slotkit-fieldset">
          <legend className="slotkit-legend">1. Trigger</legend>
          <select
            className="slotkit-select"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
          >
            {triggers.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </fieldset>

        {/* Step 2: Conditions */}
        <fieldset className="slotkit-fieldset">
          <legend className="slotkit-legend">2. Conditions (optional)</legend>
          {conditions.map((condition, idx) => (
            <div key={idx} className="slotkit-condition-row">
              <select
                className="slotkit-select"
                value={condition.field}
                onChange={(e) =>
                  updateCondition(idx, { field: e.target.value })
                }
              >
                {conditionFields.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>

              <select
                className="slotkit-select"
                value={condition.operator}
                onChange={(e) =>
                  updateCondition(idx, { operator: e.target.value })
                }
              >
                <option value="equals">equals</option>
                <option value="not_equals">not equals</option>
                <option value="contains">contains</option>
              </select>

              <input
                type="text"
                className="slotkit-input"
                value={condition.value}
                onChange={(e) =>
                  updateCondition(idx, { value: e.target.value })
                }
                placeholder="Value"
              />

              <button
                type="button"
                className="slotkit-button-danger"
                onClick={() => removeCondition(idx)}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="slotkit-button-secondary"
            onClick={addCondition}
          >
            Add Condition
          </button>
        </fieldset>

        {/* Step 3: Actions */}
        <fieldset className="slotkit-fieldset">
          <legend className="slotkit-legend">3. Actions</legend>
          {actions.map((action, idx) => (
            <div key={idx} className="slotkit-action-card">
              <div className="slotkit-action-header">
                <select
                  className="slotkit-select"
                  value={action.type}
                  onChange={(e) =>
                    updateAction(idx, {
                      type: e.target.value,
                      config: {},
                    })
                  }
                >
                  {actionTypes.map((at) => (
                    <option key={at.value} value={at.value}>
                      {at.label}
                    </option>
                  ))}
                </select>

                {actions.length > 1 && (
                  <button
                    type="button"
                    className="slotkit-button-danger"
                    onClick={() => removeAction(idx)}
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Action-specific config fields */}
              {action.type === "send_email" && (
                <div className="slotkit-action-config">
                  <input
                    type="text"
                    className="slotkit-input"
                    placeholder="To (customer, host, or email)"
                    value={action.config.to ?? ""}
                    onChange={(e) =>
                      updateActionConfig(idx, "to", e.target.value)
                    }
                  />
                  <input
                    type="text"
                    className="slotkit-input"
                    placeholder="Subject"
                    value={action.config.subject ?? ""}
                    onChange={(e) =>
                      updateActionConfig(idx, "subject", e.target.value)
                    }
                  />
                  <textarea
                    className="slotkit-textarea"
                    placeholder="Body template (use {booking.title}, {attendee.name}, etc.)"
                    value={action.config.body ?? ""}
                    onChange={(e) =>
                      updateActionConfig(idx, "body", e.target.value)
                    }
                  />
                </div>
              )}

              {action.type === "send_sms" && (
                <div className="slotkit-action-config">
                  <input
                    type="text"
                    className="slotkit-input"
                    placeholder="To (phone number or field key)"
                    value={action.config.to ?? ""}
                    onChange={(e) =>
                      updateActionConfig(idx, "to", e.target.value)
                    }
                  />
                  <textarea
                    className="slotkit-textarea"
                    placeholder="Message template"
                    value={action.config.body ?? ""}
                    onChange={(e) =>
                      updateActionConfig(idx, "body", e.target.value)
                    }
                  />
                </div>
              )}

              {action.type === "fire_webhook" && (
                <div className="slotkit-action-config">
                  <input
                    type="url"
                    className="slotkit-input"
                    placeholder="Webhook URL"
                    value={action.config.url ?? ""}
                    onChange={(e) =>
                      updateActionConfig(idx, "url", e.target.value)
                    }
                  />
                </div>
              )}

              {action.type === "update_status" && (
                <div className="slotkit-action-config">
                  <select
                    className="slotkit-select"
                    value={action.config.status ?? ""}
                    onChange={(e) =>
                      updateActionConfig(idx, "status", e.target.value)
                    }
                  >
                    <option value="">Select status...</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            className="slotkit-button-secondary"
            onClick={addAction}
          >
            Add Action
          </button>
        </fieldset>

        {/* Step 4: Active toggle */}
        <div className="slotkit-field">
          <label className="slotkit-checkbox-label">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Active</span>
          </label>
        </div>

        {/* Submit */}
        <div className="slotkit-form-actions">
          <button type="submit" className="slotkit-button-primary">
            Save Workflow
          </button>
          {onCancel && (
            <button
              type="button"
              className="slotkit-button-secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Execution History */}
      {executionLogs && executionLogs.length > 0 && (
        <div className="slotkit-workflow-logs">
          <h4>Execution History</h4>
          <table className="slotkit-workflow-logs-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Status</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {executionLogs.map((log) => (
                <tr key={log.id}>
                  <td>{log.executedAt.toLocaleString()}</td>
                  <td>{log.actionType}</td>
                  <td>
                    <span
                      className={cn(
                        "slotkit-log-status",
                        `slotkit-log-status-${log.status}`,
                      )}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td>{log.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
