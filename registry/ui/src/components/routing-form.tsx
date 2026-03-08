import React from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { cn } from "../utils/cn.js";

/** Routing form field definition */
export interface RoutingFormField {
  key: string;
  label: string;
  type: "dropdown" | "text" | "radio" | "checkbox";
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

/** Props for the RoutingForm component */
export interface RoutingFormProps {
  /** Form title */
  title: string;
  /** Optional description */
  description?: string;
  /** Form fields to render */
  fields: RoutingFormField[];
  /** Called with the customer's responses */
  onSubmit: (responses: Record<string, string | string[]>) => void;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Customer-facing routing form that collects responses to determine
 * the correct event type or provider for booking.
 *
 * On submission, the parent component evaluates routing rules and
 * transitions to the BookingCalendar for the matched event type.
 *
 * @example
 * ```tsx
 * <RoutingForm
 *   title="Find Your Service"
 *   fields={routingFormFields}
 *   onSubmit={(responses) => {
 *     const result = evaluateRoutingRules(form, responses);
 *     router.push(`/book/${result.eventTypeId}`);
 *   }}
 * />
 * ```
 */
export function RoutingForm({
  title,
  description,
  fields,
  onSubmit,
  className,
  style,
}: RoutingFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const handleFormSubmit = (data: FieldValues) => {
    const responses: Record<string, string | string[]> = {};
    for (const field of fields) {
      const value = data[field.key];
      if (value !== undefined && value !== "") {
        responses[field.key] = value;
      }
    }
    onSubmit(responses);
  };

  return (
    <form
      className={cn("slotkit-routing-form", className)}
      style={style}
      onSubmit={handleSubmit(handleFormSubmit)}
      noValidate
    >
      <h2>{title}</h2>
      {description && <p className="slotkit-form-description">{description}</p>}

      {fields.map((field) => (
        <div key={field.key} className="slotkit-field">
          <label htmlFor={`rf-${field.key}`} className="slotkit-label">
            {field.label}
            {field.required && <span aria-hidden="true"> *</span>}
          </label>

          {field.type === "text" && (
            <input
              id={`rf-${field.key}`}
              type="text"
              className="slotkit-input"
              placeholder={field.placeholder}
              {...register(field.key, {
                required: field.required ? `${field.label} is required` : false,
              })}
            />
          )}

          {field.type === "dropdown" && (
            <select
              id={`rf-${field.key}`}
              className="slotkit-select"
              {...register(field.key, {
                required: field.required ? `${field.label} is required` : false,
              })}
            >
              <option value="">Select...</option>
              {field.options?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}

          {field.type === "radio" && (
            <div className="slotkit-radio-group" role="radiogroup">
              {field.options?.map((opt) => (
                <label key={opt} className="slotkit-radio-label">
                  <input
                    type="radio"
                    value={opt}
                    {...register(field.key, {
                      required: field.required
                        ? `${field.label} is required`
                        : false,
                    })}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          )}

          {field.type === "checkbox" && (
            <div className="slotkit-checkbox-group">
              {field.options?.map((opt) => (
                <label key={opt} className="slotkit-checkbox-label">
                  <input
                    type="checkbox"
                    value={opt}
                    {...register(field.key)}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          )}

          {errors[field.key] ? (
            <p className="slotkit-error">
              {errors[field.key]?.message as string}
            </p>
          ) : null}
        </div>
      ))}

      <button type="submit" className="slotkit-button-primary">
        Continue
      </button>
    </form>
  );
}
