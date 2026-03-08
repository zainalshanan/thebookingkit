import React from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import type { BookingQuestion } from "@slotkit/core";
import { cn } from "../utils/cn.js";

/** Data collected from the booking questions form */
export interface BookingFormData {
  /** Customer name (always required) */
  name: string;
  /** Customer email (always required) */
  email: string;
  /** Customer phone (optional) */
  phone?: string;
  /** Custom question responses keyed by question key */
  responses: Record<string, string>;
}

/** Props for the BookingQuestions component */
export interface BookingQuestionsProps {
  /** Custom questions defined on the event type */
  questions?: BookingQuestion[];
  /** Callback when form is submitted */
  onSubmit: (data: BookingFormData) => void;
  /** Whether the form is in a submitting state */
  isSubmitting?: boolean;
  /** Submit button text */
  submitLabel?: string;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Booking questions form that collects customer info and custom question responses.
 *
 * Always includes name and email fields. Renders dynamic custom questions
 * based on the event type configuration.
 *
 * @example
 * ```tsx
 * <BookingQuestions
 *   questions={eventType.customQuestions}
 *   onSubmit={handleBookingSubmit}
 * />
 * ```
 */
export function BookingQuestions({
  questions = [],
  onSubmit,
  isSubmitting = false,
  submitLabel = "Continue",
  className,
  style,
}: BookingQuestionsProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Record<string, string>>();

  const onFormSubmit: SubmitHandler<Record<string, string>> = (data) => {
    const { name, email, phone, ...rest } = data;
    onSubmit({
      name,
      email,
      phone: phone || undefined,
      responses: rest,
    });
  };

  return (
    <form
      className={cn("slotkit-booking-questions", className)}
      style={style}
      onSubmit={handleSubmit(onFormSubmit)}
      noValidate
    >
      {/* Standard fields */}
      <div className="slotkit-field">
        <label htmlFor="slotkit-name" className="slotkit-label">
          Name <span className="slotkit-required">*</span>
        </label>
        <input
          id="slotkit-name"
          type="text"
          className="slotkit-input"
          {...register("name", { required: "Name is required" })}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="slotkit-error" role="alert">
            {errors.name.message as string}
          </p>
        )}
      </div>

      <div className="slotkit-field">
        <label htmlFor="slotkit-email" className="slotkit-label">
          Email <span className="slotkit-required">*</span>
        </label>
        <input
          id="slotkit-email"
          type="email"
          className="slotkit-input"
          {...register("email", {
            required: "Email is required",
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: "Please enter a valid email address",
            },
          })}
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <p className="slotkit-error" role="alert">
            {errors.email.message as string}
          </p>
        )}
      </div>

      <div className="slotkit-field">
        <label htmlFor="slotkit-phone" className="slotkit-label">
          Phone
        </label>
        <input
          id="slotkit-phone"
          type="tel"
          className="slotkit-input"
          {...register("phone", {
            pattern: {
              value: /^[+]?[\d\s()-]{7,20}$/,
              message: "Please enter a valid phone number",
            },
          })}
          aria-invalid={!!errors.phone}
        />
        {errors.phone && (
          <p className="slotkit-error" role="alert">
            {errors.phone.message as string}
          </p>
        )}
      </div>

      {/* Custom questions */}
      {questions.map((q) => (
        <div key={q.key} className="slotkit-field">
          <label htmlFor={`slotkit-q-${q.key}`} className="slotkit-label">
            {q.label}
            {q.isRequired && <span className="slotkit-required"> *</span>}
          </label>
          {renderQuestionInput(q, register, errors)}
        </div>
      ))}

      <button
        type="submit"
        className="slotkit-submit-button"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Submitting..." : submitLabel}
      </button>
    </form>
  );
}

function renderQuestionInput(
  q: BookingQuestion,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any,
  errors: Record<string, unknown>,
) {
  const validation = q.isRequired ? { required: `${q.label} is required` } : {};

  switch (q.type) {
    case "long_text":
      return (
        <>
          <textarea
            id={`slotkit-q-${q.key}`}
            className="slotkit-textarea"
            rows={3}
            {...register(q.key, validation)}
            aria-invalid={!!errors[q.key]}
          />
          {errors[q.key] ? (
            <p className="slotkit-error" role="alert">
              {String((errors[q.key] as { message?: string })?.message ?? "")}
            </p>
          ) : null}
        </>
      );

    case "single_select":
      return (
        <>
          <select
            id={`slotkit-q-${q.key}`}
            className="slotkit-select"
            {...register(q.key, validation)}
            aria-invalid={!!errors[q.key]}
          >
            <option value="">Select...</option>
            {q.options?.map((opt: string) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {errors[q.key] ? (
            <p className="slotkit-error" role="alert">
              {String((errors[q.key] as { message?: string })?.message ?? "")}
            </p>
          ) : null}
        </>
      );

    case "checkbox":
      return (
        <div className="slotkit-checkbox-wrapper">
          <input
            id={`slotkit-q-${q.key}`}
            type="checkbox"
            className="slotkit-checkbox"
            {...register(q.key, validation)}
            aria-invalid={!!errors[q.key]}
          />
          {errors[q.key] ? (
            <p className="slotkit-error" role="alert">
              {String((errors[q.key] as { message?: string })?.message ?? "")}
            </p>
          ) : null}
        </div>
      );

    case "number":
      return (
        <>
          <input
            id={`slotkit-q-${q.key}`}
            type="number"
            className="slotkit-input"
            {...register(q.key, {
              ...validation,
              validate: (v: string) =>
                !v || !isNaN(Number(v)) || "Must be a number",
            })}
            aria-invalid={!!errors[q.key]}
          />
          {errors[q.key] ? (
            <p className="slotkit-error" role="alert">
              {String((errors[q.key] as { message?: string })?.message ?? "")}
            </p>
          ) : null}
        </>
      );

    case "email":
      return (
        <>
          <input
            id={`slotkit-q-${q.key}`}
            type="email"
            className="slotkit-input"
            {...register(q.key, {
              ...validation,
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: "Please enter a valid email address",
              },
            })}
            aria-invalid={!!errors[q.key]}
          />
          {errors[q.key] ? (
            <p className="slotkit-error" role="alert">
              {String((errors[q.key] as { message?: string })?.message ?? "")}
            </p>
          ) : null}
        </>
      );

    case "phone":
      return (
        <>
          <input
            id={`slotkit-q-${q.key}`}
            type="tel"
            className="slotkit-input"
            {...register(q.key, {
              ...validation,
              pattern: {
                value: /^[+]?[\d\s()-]{7,20}$/,
                message: "Please enter a valid phone number",
              },
            })}
            aria-invalid={!!errors[q.key]}
          />
          {errors[q.key] ? (
            <p className="slotkit-error" role="alert">
              {String((errors[q.key] as { message?: string })?.message ?? "")}
            </p>
          ) : null}
        </>
      );

    default: // short_text and multi_select fallback
      return (
        <>
          <input
            id={`slotkit-q-${q.key}`}
            type="text"
            className="slotkit-input"
            {...register(q.key, validation)}
            aria-invalid={!!errors[q.key]}
          />
          {errors[q.key] ? (
            <p className="slotkit-error" role="alert">
              {String((errors[q.key] as { message?: string })?.message ?? "")}
            </p>
          ) : null}
        </>
      );
  }
}
