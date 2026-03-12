/** Supported question field types for custom booking questions */
export type QuestionFieldType =
  | "short_text"
  | "long_text"
  | "single_select"
  | "multi_select"
  | "phone"
  | "email"
  | "number"
  | "checkbox";

/** A custom booking question defined on an event type */
export interface BookingQuestion {
  /** Unique key for this question (used in response storage) */
  key: string;
  /** Display label shown to the customer */
  label: string;
  /** Field type */
  type: QuestionFieldType;
  /** Options for select-type fields */
  options?: string[];
  /** Whether the customer must answer this question */
  isRequired: boolean;
}

/** Validation error for event type configuration */
export class EventTypeValidationError extends Error {
  public readonly code = "EVENT_TYPE_VALIDATION";
  public readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "EventTypeValidationError";
    this.field = field;
  }
}

/** Maximum number of custom questions allowed per event type */
const MAX_CUSTOM_QUESTIONS = 10;

/** Minimum duration in minutes */
const MIN_DURATION = 5;

/** Maximum duration in minutes */
const MAX_DURATION = 480;

/**
 * Validate event type configuration fields.
 * Throws EventTypeValidationError on invalid input.
 */
export function validateEventType(input: {
  title?: string;
  slug?: string;
  durationMinutes?: number;
  bufferBefore?: number;
  bufferAfter?: number;
  customQuestions?: BookingQuestion[];
  minimumNoticeMinutes?: number;
  maxFutureDays?: number;
  maxSeats?: number;
}): void {
  if (input.title !== undefined && input.title.trim().length === 0) {
    throw new EventTypeValidationError("title", "Title cannot be empty.");
  }

  if (input.slug !== undefined) {
    if (input.slug.trim().length === 0) {
      throw new EventTypeValidationError("slug", "Slug cannot be empty.");
    }
    if (!/^[a-z0-9-]+$/.test(input.slug)) {
      throw new EventTypeValidationError(
        "slug",
        "Slug must contain only lowercase letters, numbers, and hyphens.",
      );
    }
  }

  if (input.durationMinutes !== undefined) {
    if (input.durationMinutes < MIN_DURATION) {
      throw new EventTypeValidationError(
        "durationMinutes",
        `Duration must be at least ${MIN_DURATION} minutes.`,
      );
    }
    if (input.durationMinutes > MAX_DURATION) {
      throw new EventTypeValidationError(
        "durationMinutes",
        `Duration cannot exceed ${MAX_DURATION} minutes.`,
      );
    }
  }

  if (input.bufferBefore !== undefined && input.bufferBefore < 0) {
    throw new EventTypeValidationError(
      "bufferBefore",
      "Buffer time cannot be negative.",
    );
  }

  if (input.bufferAfter !== undefined && input.bufferAfter < 0) {
    throw new EventTypeValidationError(
      "bufferAfter",
      "Buffer time cannot be negative.",
    );
  }

  if (input.customQuestions !== undefined) {
    if (input.customQuestions.length > MAX_CUSTOM_QUESTIONS) {
      throw new EventTypeValidationError(
        "customQuestions",
        `Maximum ${MAX_CUSTOM_QUESTIONS} custom questions allowed.`,
      );
    }

    const keys = new Set<string>();
    for (const q of input.customQuestions) {
      if (!q.key || q.key.trim().length === 0) {
        throw new EventTypeValidationError(
          "customQuestions",
          "Each question must have a non-empty key.",
        );
      }
      if (keys.has(q.key)) {
        throw new EventTypeValidationError(
          "customQuestions",
          `Duplicate question key: "${q.key}".`,
        );
      }
      keys.add(q.key);

      if (!q.label || q.label.trim().length === 0) {
        throw new EventTypeValidationError(
          "customQuestions",
          `Question "${q.key}" must have a label.`,
        );
      }

      if (
        (q.type === "single_select" || q.type === "multi_select") &&
        (!q.options || q.options.length === 0)
      ) {
        throw new EventTypeValidationError(
          "customQuestions",
          `Question "${q.key}" of type "${q.type}" must have at least one option.`,
        );
      }
    }
  }

  if (input.minimumNoticeMinutes !== undefined && input.minimumNoticeMinutes < 0) {
    throw new EventTypeValidationError(
      "minimumNoticeMinutes",
      "Minimum notice cannot be negative.",
    );
  }

  if (input.maxFutureDays !== undefined && input.maxFutureDays < 1) {
    throw new EventTypeValidationError(
      "maxFutureDays",
      "Max future days must be at least 1.",
    );
  }

  if (input.maxSeats !== undefined && input.maxSeats < 1) {
    throw new EventTypeValidationError(
      "maxSeats",
      "Max seats must be at least 1.",
    );
  }
}

/**
 * Generate a URL-friendly slug from a title.
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Validate custom question responses against the question definitions.
 * Returns an array of validation errors (empty if all valid).
 */
export function validateQuestionResponses(
  questions: BookingQuestion[],
  responses: Record<string, string | string[] | boolean>,
): string[] {
  const errors: string[] = [];

  for (const q of questions) {
    const value = responses[q.key];

    const isEmpty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (q.isRequired && isEmpty) {
      errors.push(`"${q.label}" is required.`);
      continue;
    }

    if (isEmpty) continue;

    if (q.type === "email" && typeof value === "string") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push(`"${q.label}" must be a valid email address.`);
      }
    }

    if (q.type === "phone" && typeof value === "string") {
      if (!/^[+]?[\d\s()-]{7,20}$/.test(value)) {
        errors.push(`"${q.label}" must be a valid phone number.`);
      }
    }

    if (q.type === "number" && typeof value === "string") {
      if (isNaN(Number(value))) {
        errors.push(`"${q.label}" must be a number.`);
      }
    }

    if (q.type === "single_select" && typeof value === "string" && q.options) {
      if (!q.options.includes(value)) {
        errors.push(`"${q.label}" must be one of: ${q.options.join(", ")}.`);
      }
    }

    if (q.type === "multi_select" && Array.isArray(value) && q.options) {
      const invalid = value.filter((v) => !q.options!.includes(v));
      if (invalid.length > 0) {
        errors.push(`"${q.label}" contains invalid options: ${invalid.join(", ")}.`);
      }
    }
  }

  return errors;
}
