/**
 * Routing form engine: define intake forms with conditional routing rules
 * that direct customers to the correct event type or provider.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Field types supported in routing forms */
export type RoutingFieldType = "dropdown" | "text" | "radio" | "checkbox";

/** A single field in a routing form */
export interface RoutingField {
  key: string;
  label: string;
  type: RoutingFieldType;
  /** Options for dropdown/radio/checkbox fields */
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

/** Comparison operators for routing conditions */
export type RoutingOperator = "equals" | "not_equals" | "contains" | "in";

/** A single condition in a routing rule */
export interface RoutingCondition {
  fieldKey: string;
  operator: RoutingOperator;
  value: string | string[];
}

/** Logic for combining multiple conditions */
export type RoutingLogic = "AND" | "OR";

/** A routing rule maps conditions to a destination */
export interface RoutingRule {
  id: string;
  conditions: RoutingCondition[];
  logic: RoutingLogic;
  /** Destination event type ID */
  eventTypeId?: string;
  /** Destination provider ID (direct assignment) */
  providerId?: string;
  /** Destination team ID (for team round-robin) */
  teamId?: string;
  /** Rule priority (lower = evaluated first) */
  priority: number;
}

/** Complete routing form definition */
export interface RoutingFormDefinition {
  id: string;
  title: string;
  description?: string;
  fields: RoutingField[];
  rules: RoutingRule[];
  /** Fallback destination when no rule matches */
  fallback: {
    eventTypeId?: string;
    providerId?: string;
    teamId?: string;
  };
}

/** Customer's responses to a routing form */
export type RoutingResponses = Record<string, string | string[]>;

/** Result of evaluating routing rules */
export interface RoutingResult {
  matched: boolean;
  /** The rule that matched (null if fallback was used) */
  matchedRule: RoutingRule | null;
  /** Destination */
  eventTypeId?: string;
  providerId?: string;
  teamId?: string;
}

/** Analytics summary for routing form submissions */
export interface RoutingAnalytics {
  totalSubmissions: number;
  completionRate: number;
  routeDistribution: Array<{
    eventTypeId?: string;
    providerId?: string;
    teamId?: string;
    count: number;
    percentage: number;
  }>;
}

/** A recorded routing submission */
export interface RoutingSubmission {
  id: string;
  formId: string;
  responses: RoutingResponses;
  result: RoutingResult;
  bookingId?: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Error thrown when routing form validation fails */
export class RoutingFormValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "RoutingFormValidationError";
  }
}

/**
 * Validate a routing form definition.
 *
 * @throws RoutingFormValidationError if the form is invalid
 */
export function validateRoutingForm(form: RoutingFormDefinition): void {
  if (!form.title || form.title.trim().length === 0) {
    throw new RoutingFormValidationError("Routing form title is required");
  }

  if (!form.fields || form.fields.length === 0) {
    throw new RoutingFormValidationError(
      "Routing form must have at least one field",
    );
  }

  // Unique field keys
  const keys = new Set<string>();
  for (const field of form.fields) {
    if (!field.key) {
      throw new RoutingFormValidationError("All fields must have a key");
    }
    if (keys.has(field.key)) {
      throw new RoutingFormValidationError(
        `Duplicate field key: ${field.key}`,
        field.key,
      );
    }
    keys.add(field.key);

    if (
      (field.type === "dropdown" || field.type === "radio") &&
      (!field.options || field.options.length === 0)
    ) {
      throw new RoutingFormValidationError(
        `Field "${field.key}" of type "${field.type}" must have options`,
        field.key,
      );
    }
  }

  // Validate rules reference valid fields
  for (const rule of form.rules) {
    for (const condition of rule.conditions) {
      if (!keys.has(condition.fieldKey)) {
        throw new RoutingFormValidationError(
          `Rule references unknown field: ${condition.fieldKey}`,
          condition.fieldKey,
        );
      }
    }

    if (!rule.eventTypeId && !rule.providerId && !rule.teamId) {
      throw new RoutingFormValidationError(
        `Rule "${rule.id}" must have a destination (eventTypeId, providerId, or teamId)`,
      );
    }
  }

  // Fallback is required
  if (
    !form.fallback.eventTypeId &&
    !form.fallback.providerId &&
    !form.fallback.teamId
  ) {
    throw new RoutingFormValidationError(
      "Routing form must have a fallback destination",
    );
  }
}

// ---------------------------------------------------------------------------
// Routing Engine
// ---------------------------------------------------------------------------

/**
 * Evaluate routing rules against customer responses.
 *
 * Rules are evaluated in priority order. The first matching rule wins.
 * If no rule matches, the fallback destination is returned.
 *
 * @param form - The routing form definition
 * @param responses - Customer's field responses
 * @returns The routing result with the matched destination
 */
export function evaluateRoutingRules(
  form: RoutingFormDefinition,
  responses: RoutingResponses,
): RoutingResult {
  // Sort rules by priority (lower = first)
  const sorted = [...form.rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (doesRuleMatch(rule, responses)) {
      return {
        matched: true,
        matchedRule: rule,
        eventTypeId: rule.eventTypeId,
        providerId: rule.providerId,
        teamId: rule.teamId,
      };
    }
  }

  // No rule matched — use fallback
  return {
    matched: false,
    matchedRule: null,
    eventTypeId: form.fallback.eventTypeId,
    providerId: form.fallback.providerId,
    teamId: form.fallback.teamId,
  };
}

/**
 * Check if a single routing rule matches the given responses.
 */
function doesRuleMatch(
  rule: RoutingRule,
  responses: RoutingResponses,
): boolean {
  if (rule.conditions.length === 0) return false;

  const results = rule.conditions.map((cond) =>
    evaluateCondition(cond, responses),
  );

  if (rule.logic === "AND") {
    return results.every(Boolean);
  }
  // OR
  return results.some(Boolean);
}

/**
 * Evaluate a single condition against responses.
 *
 * When the response is an array (e.g. from a multi-select / checkbox field)
 * comparisons are element-wise rather than on the joined string. This
 * prevents the CORE-H8 bug where `["a","b"].join(",") === "a,b"` caused
 * `not_equals "a"` to incorrectly fire even though the user did select "a".
 */
function evaluateCondition(
  condition: RoutingCondition,
  responses: RoutingResponses,
): boolean {
  const response = responses[condition.fieldKey];
  if (response === undefined || response === null) return false;

  const conditionValue = String(condition.value);

  // Array responses (multi-select / checkbox) — element-wise comparisons.
  if (Array.isArray(response)) {
    switch (condition.operator) {
      case "equals":
        // True when the entire selection is exactly the single target value
        // (i.e. the array has one element that equals conditionValue).
        // Use `contains` / `in` when partial membership is intended.
        return response.length === 1 && response[0] === conditionValue;

      case "not_equals":
        // True only when the selection does NOT contain the target value.
        return !response.includes(conditionValue);

      case "contains": {
        // True when any selected element contains the substring.
        const needle = conditionValue.toLowerCase();
        return response.some((r) => r.toLowerCase().includes(needle));
      }

      case "in": {
        const allowedValues = Array.isArray(condition.value)
          ? condition.value
          : [condition.value];
        return response.some((r) => allowedValues.includes(r));
      }

      default:
        return false;
    }
  }

  // Scalar response — keep original string-based behaviour.
  const responseStr = String(response);

  switch (condition.operator) {
    case "equals":
      return responseStr === conditionValue;

    case "not_equals":
      return responseStr !== conditionValue;

    case "contains": {
      const needle = conditionValue.toLowerCase();
      return responseStr.toLowerCase().includes(needle);
    }

    case "in": {
      const allowedValues = Array.isArray(condition.value)
        ? condition.value
        : [condition.value];
      return allowedValues.includes(responseStr);
    }

    default:
      return false;
  }
}

/**
 * Validate that required fields have responses.
 *
 * @throws RoutingFormValidationError if a required field is missing
 */
export function validateRoutingResponses(
  form: RoutingFormDefinition,
  responses: RoutingResponses,
): void {
  for (const field of form.fields) {
    if (field.required) {
      const value = responses[field.key];
      if (value === undefined || value === null || value === "") {
        throw new RoutingFormValidationError(
          `Field "${field.label}" is required`,
          field.key,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/**
 * Compute routing form analytics from a list of submissions.
 *
 * @param submissions - Historical routing submissions
 * @param totalFormViews - Total number of form views (for completion rate)
 */
export function computeRoutingAnalytics(
  submissions: RoutingSubmission[],
  totalFormViews?: number,
): RoutingAnalytics {
  const total = submissions.length;
  const completionRate =
    totalFormViews && totalFormViews > 0 ? total / totalFormViews : 1;

  // Count by destination
  const destMap = new Map<string, number>();
  for (const sub of submissions) {
    const key =
      sub.result.eventTypeId ??
      sub.result.providerId ??
      sub.result.teamId ??
      "unknown";
    destMap.set(key, (destMap.get(key) ?? 0) + 1);
  }

  const routeDistribution = Array.from(destMap.entries()).map(
    ([dest, count]) => ({
      eventTypeId: dest.startsWith("evt_") ? dest : undefined,
      providerId: dest.startsWith("prv_") ? dest : undefined,
      teamId: dest.startsWith("tm_") ? dest : undefined,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }),
  );

  return {
    totalSubmissions: total,
    completionRate,
    routeDistribution,
  };
}
