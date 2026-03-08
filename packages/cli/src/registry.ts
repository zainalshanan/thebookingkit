/**
 * Component registry for SlotKit UI components.
 *
 * Maps every component in registry/ui to its metadata: name, description,
 * source path, npm dependencies, and internal component dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A component entry in the registry */
export interface ComponentRegistryEntry {
  /** Component name (kebab-case) */
  name: string;
  /** Display name (PascalCase) */
  displayName: string;
  /** Brief description */
  description: string;
  /** Source file path relative to registry/ui/src/ */
  sourcePath: string;
  /** Other SlotKit component names this depends on */
  dependencies: string[];
  /** npm packages the component requires (beyond react) */
  npmDependencies: Record<string, string>;
  /** Category for grouping */
  category: "customer" | "admin" | "payment" | "routing" | "team" | "embed" | "walk-in" | "kiosk" | "utility";
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** The full component registry */
export const COMPONENT_REGISTRY: ComponentRegistryEntry[] = [
  {
    name: "booking-calendar",
    displayName: "BookingCalendar",
    description: "Date picker for selecting a booking date",
    sourcePath: "components/booking-calendar.tsx",
    dependencies: [],
    npmDependencies: { "react-day-picker": "^9.6.0", "date-fns": "^3.6.0" },
    category: "customer",
  },
  {
    name: "time-slot-picker",
    displayName: "TimeSlotPicker",
    description: "Time slot grid for selecting an available time",
    sourcePath: "components/time-slot-picker.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "customer",
  },
  {
    name: "booking-questions",
    displayName: "BookingQuestions",
    description: "Custom question form for collecting booking info",
    sourcePath: "components/booking-questions.tsx",
    dependencies: [],
    npmDependencies: { "react-hook-form": "^7.54.0" },
    category: "customer",
  },
  {
    name: "booking-confirmation",
    displayName: "BookingConfirmation",
    description: "Success screen after a booking is created",
    sourcePath: "components/booking-confirmation.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "customer",
  },
  {
    name: "booking-status-badge",
    displayName: "BookingStatusBadge",
    description: "Status pill for booking lifecycle states",
    sourcePath: "components/booking-status-badge.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "customer",
  },
  {
    name: "booking-management-view",
    displayName: "BookingManagementView",
    description: "Customer-facing cancel/reschedule flow",
    sourcePath: "components/booking-management-view.tsx",
    dependencies: ["booking-status-badge"],
    npmDependencies: {},
    category: "customer",
  },
  {
    name: "availability-editor",
    displayName: "AvailabilityEditor",
    description: "Weekly schedule editor with time range inputs",
    sourcePath: "components/availability-editor.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "admin",
  },
  {
    name: "override-manager",
    displayName: "OverrideManager",
    description: "Date-specific availability override manager",
    sourcePath: "components/override-manager.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "admin",
  },
  {
    name: "admin-schedule-view",
    displayName: "AdminScheduleView",
    description: "Calendar view of all bookings for a provider",
    sourcePath: "components/admin-schedule-view.tsx",
    dependencies: ["booking-status-badge"],
    npmDependencies: { "react-big-calendar": "^1.8.7", "date-fns": "^3.6.0" },
    category: "admin",
  },
  {
    name: "booking-lifecycle-actions",
    displayName: "BookingLifecycleActions",
    description: "Confirm/reject/cancel/no-show action buttons",
    sourcePath: "components/booking-lifecycle-actions.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "admin",
  },
  {
    name: "manual-booking-form",
    displayName: "ManualBookingForm",
    description: "Admin form for creating bookings manually",
    sourcePath: "components/manual-booking-form.tsx",
    dependencies: [],
    npmDependencies: { "react-hook-form": "^7.54.0" },
    category: "admin",
  },
  {
    name: "provider-auth",
    displayName: "ProviderAuth",
    description: "Login/signup/password-reset form for providers",
    sourcePath: "components/provider-auth.tsx",
    dependencies: [],
    npmDependencies: { "react-hook-form": "^7.54.0" },
    category: "admin",
  },
  {
    name: "payment-gate",
    displayName: "PaymentGate",
    description: "Payment form wrapper for Stripe Elements",
    sourcePath: "components/payment-gate.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "payment",
  },
  {
    name: "payment-history",
    displayName: "PaymentHistory",
    description: "Payment history table with filtering and revenue summary",
    sourcePath: "components/payment-history.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "payment",
  },
  {
    name: "routing-form",
    displayName: "RoutingForm",
    description: "Customer intake form with conditional routing",
    sourcePath: "components/routing-form.tsx",
    dependencies: [],
    npmDependencies: { "react-hook-form": "^7.54.0" },
    category: "routing",
  },
  {
    name: "team-assignment-editor",
    displayName: "TeamAssignmentEditor",
    description: "Team member assignment strategy editor",
    sourcePath: "components/team-assignment-editor.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "team",
  },
  {
    name: "workflow-builder",
    displayName: "WorkflowBuilder",
    description: "Visual workflow automation builder",
    sourcePath: "components/workflow-builder.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "admin",
  },
  {
    name: "webhook-manager",
    displayName: "WebhookManager",
    description: "Webhook subscription management with delivery history",
    sourcePath: "components/webhook-manager.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "admin",
  },
  {
    name: "recurring-booking-picker",
    displayName: "RecurringBookingPicker",
    description: "Recurring series picker for repeating appointments",
    sourcePath: "components/recurring-booking-picker.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "customer",
  },
  {
    name: "seats-picker",
    displayName: "SeatsPicker",
    description: "Seat availability display for group events",
    sourcePath: "components/seats-picker.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "customer",
  },
  {
    name: "embed-configurator",
    displayName: "EmbedConfigurator",
    description: "Admin embed code generator for inline/popup/float modes",
    sourcePath: "components/embed-configurator.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "embed",
  },
  // Walk-in queue components
  {
    name: "walk-in-entry-form",
    displayName: "WalkInEntryForm",
    description: "Form for adding walk-in customers to the queue",
    sourcePath: "components/walk-in-entry-form.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "walk-in",
  },
  {
    name: "walk-in-toggle",
    displayName: "WalkInToggle",
    description: "Toggle switch to enable/disable walk-in acceptance",
    sourcePath: "components/walk-in-toggle.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "walk-in",
  },
  {
    name: "walk-in-analytics",
    displayName: "WalkInAnalytics",
    description: "Analytics dashboard for walk-in queue metrics",
    sourcePath: "components/walk-in-analytics.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "walk-in",
  },
  {
    name: "queue-display",
    displayName: "QueueDisplay",
    description: "Public-facing queue status display for waiting customers",
    sourcePath: "components/queue-display.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "walk-in",
  },
  {
    name: "queue-manager",
    displayName: "QueueManager",
    description: "Admin queue management with start/skip/remove actions",
    sourcePath: "components/queue-manager.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "walk-in",
  },
  {
    name: "queue-ticket",
    displayName: "QueueTicket",
    description: "Individual queue ticket display with position and wait time",
    sourcePath: "components/queue-ticket.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "walk-in",
  },
  // Kiosk components
  {
    name: "kiosk-calendar",
    displayName: "KioskCalendar",
    description: "Multi-provider day/week calendar view for reception kiosks",
    sourcePath: "components/kiosk-calendar.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "kiosk",
  },
  {
    name: "kiosk-settings-panel",
    displayName: "KioskSettingsPanel",
    description: "Settings panel for configuring kiosk display options",
    sourcePath: "components/kiosk-settings-panel.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "kiosk",
  },
  {
    name: "kiosk-shell",
    displayName: "KioskShell",
    description: "Full-screen kiosk shell with header and provider tabs",
    sourcePath: "components/kiosk-shell.tsx",
    dependencies: ["kiosk-calendar", "kiosk-settings-panel"],
    npmDependencies: {},
    category: "kiosk",
  },
  {
    name: "break-block-form",
    displayName: "BreakBlockForm",
    description: "Form for adding break or block-off periods to the schedule",
    sourcePath: "components/break-block-form.tsx",
    dependencies: [],
    npmDependencies: {},
    category: "kiosk",
  },
];

// ---------------------------------------------------------------------------
// Lookup Helpers
// ---------------------------------------------------------------------------

/**
 * Look up a component by name.
 *
 * @param name - Component name (kebab-case)
 * @returns The component entry, or undefined if not found
 */
export function findComponent(
  name: string,
): ComponentRegistryEntry | undefined {
  return COMPONENT_REGISTRY.find((c) => c.name === name);
}

/**
 * Resolve all dependencies for a component (including transitive).
 *
 * @param name - Component name
 * @returns Ordered list of component names to install (dependencies first)
 */
export function resolveComponentDependencies(name: string): string[] {
  const resolved = new Set<string>();
  const queue = [name];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (resolved.has(current)) continue;

    const entry = findComponent(current);
    if (!entry) continue;

    for (const dep of entry.dependencies) {
      if (!resolved.has(dep)) {
        queue.unshift(dep);
      }
    }

    resolved.add(current);
  }

  const result = [...resolved];
  const idx = result.indexOf(name);
  if (idx > -1) {
    result.splice(idx, 1);
    result.push(name);
  }
  return result;
}

/**
 * List all available components, optionally filtered by category.
 *
 * @param category - Optional category filter
 * @returns Matching component entries
 */
export function listComponents(
  category?: ComponentRegistryEntry["category"],
): ComponentRegistryEntry[] {
  if (!category) return COMPONENT_REGISTRY;
  return COMPONENT_REGISTRY.filter((c) => c.category === category);
}
