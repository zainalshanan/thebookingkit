import React, { useState, useCallback } from "react";
import { cn } from "../utils/cn.js";

/** Assignment strategy options */
export type AssignmentStrategy =
  | "round_robin"
  | "collective"
  | "managed"
  | "fixed";

/** A team member displayed in the editor */
export interface TeamMemberDisplay {
  userId: string;
  displayName: string;
  role: "admin" | "member";
  priority: number;
  weight: number;
  recentBookingCount: number;
  isFixed?: boolean;
}

/** Props for the TeamAssignmentEditor component */
export interface TeamAssignmentEditorProps {
  /** Current team members */
  members: TeamMemberDisplay[];
  /** Current assignment strategy */
  strategy: AssignmentStrategy;
  /** Called when strategy changes */
  onStrategyChange: (strategy: AssignmentStrategy) => void;
  /** Called when a member's config is updated */
  onMemberUpdate: (
    userId: string,
    changes: Partial<Pick<TeamMemberDisplay, "weight" | "priority" | "isFixed">>,
  ) => void;
  /** Called when settings are saved */
  onSave?: () => Promise<void>;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

const STRATEGY_LABELS: Record<AssignmentStrategy, string> = {
  round_robin: "Round Robin",
  collective: "Collective",
  managed: "Managed",
  fixed: "Fixed",
};

const STRATEGY_DESCRIPTIONS: Record<AssignmentStrategy, string> = {
  round_robin:
    "Bookings are distributed among members based on weight and priority.",
  collective:
    "Customers can only book when all team members are available simultaneously.",
  managed:
    "Admin creates a template event type; members inherit it with optional customization.",
  fixed: "Bookings are always assigned to the designated fixed host.",
};

/**
 * Team assignment editor for configuring scheduling strategy and member weights.
 *
 * Shows all team members with their role, priority, weight, booking count,
 * and a distribution preview based on current weights.
 *
 * @example
 * ```tsx
 * <TeamAssignmentEditor
 *   members={teamMembers}
 *   strategy="round_robin"
 *   onStrategyChange={setStrategy}
 *   onMemberUpdate={handleMemberUpdate}
 * />
 * ```
 */
export function TeamAssignmentEditor({
  members,
  strategy,
  onStrategyChange,
  onMemberUpdate,
  onSave,
  className,
  style,
}: TeamAssignmentEditorProps) {
  const [saving, setSaving] = useState(false);

  const totalWeight = members.reduce((sum, m) => sum + m.weight, 0);
  const totalBookings = members.reduce(
    (sum, m) => sum + m.recentBookingCount,
    0,
  );

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  }, [onSave]);

  return (
    <div
      className={cn("slotkit-team-assignment-editor", className)}
      style={style}
    >
      <h2>Team Scheduling Configuration</h2>

      {/* Strategy selector */}
      <div className="slotkit-strategy-selector">
        <label className="slotkit-label">Assignment Strategy</label>
        <div className="slotkit-strategy-options">
          {(Object.keys(STRATEGY_LABELS) as AssignmentStrategy[]).map((s) => (
            <button
              key={s}
              type="button"
              className={cn(
                "slotkit-strategy-option",
                strategy === s && "slotkit-strategy-active",
              )}
              onClick={() => onStrategyChange(s)}
            >
              <strong>{STRATEGY_LABELS[s]}</strong>
              <span>{STRATEGY_DESCRIPTIONS[s]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Members table */}
      <div className="slotkit-members-table">
        <h3>Team Members</h3>
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Priority</th>
              {strategy === "round_robin" && <th>Weight</th>}
              {strategy === "round_robin" && <th>Target %</th>}
              <th>Recent Bookings</th>
              {strategy === "round_robin" && <th>Fixed Host</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.userId}>
                <td className="slotkit-member-name">{member.displayName}</td>
                <td>
                  <span className="slotkit-role-badge">{member.role}</span>
                </td>
                <td>
                  <input
                    type="number"
                    className="slotkit-input slotkit-input-sm"
                    value={member.priority}
                    min={0}
                    max={10}
                    onChange={(e) =>
                      onMemberUpdate(member.userId, {
                        priority: parseInt(e.target.value, 10) || 0,
                      })
                    }
                  />
                </td>
                {strategy === "round_robin" && (
                  <td>
                    <input
                      type="range"
                      className="slotkit-slider"
                      value={member.weight}
                      min={1}
                      max={500}
                      onChange={(e) =>
                        onMemberUpdate(member.userId, {
                          weight: parseInt(e.target.value, 10),
                        })
                      }
                    />
                    <span className="slotkit-weight-value">
                      {member.weight}
                    </span>
                  </td>
                )}
                {strategy === "round_robin" && (
                  <td className="slotkit-target-pct">
                    {totalWeight > 0
                      ? `${((member.weight / totalWeight) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                )}
                <td className="slotkit-booking-count">
                  {member.recentBookingCount}
                  {totalBookings > 0 && (
                    <span className="slotkit-actual-pct">
                      {" "}
                      (
                      {(
                        (member.recentBookingCount / totalBookings) *
                        100
                      ).toFixed(1)}
                      %)
                    </span>
                  )}
                </td>
                {strategy === "round_robin" && (
                  <td>
                    <input
                      type="checkbox"
                      checked={member.isFixed ?? false}
                      onChange={(e) =>
                        onMemberUpdate(member.userId, {
                          isFixed: e.target.checked,
                        })
                      }
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Distribution preview for round-robin */}
      {strategy === "round_robin" && members.length > 0 && (
        <div className="slotkit-distribution-preview">
          <h3>Expected Distribution</h3>
          <div className="slotkit-distribution-bar">
            {members.map((member) => {
              const pct =
                totalWeight > 0 ? (member.weight / totalWeight) * 100 : 0;
              return (
                <div
                  key={member.userId}
                  className="slotkit-distribution-segment"
                  style={{ width: `${pct}%` }}
                  title={`${member.displayName}: ${pct.toFixed(1)}%`}
                >
                  {pct >= 10 && (
                    <span>
                      {member.displayName.split(" ")[0]} ({pct.toFixed(0)}%)
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {onSave && (
        <div className="slotkit-form-actions">
          <button
            type="button"
            className="slotkit-button-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      )}
    </div>
  );
}
