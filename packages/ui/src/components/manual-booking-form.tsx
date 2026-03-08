import React from "react";
import { useForm } from "react-hook-form";
import { cn } from "../utils/cn.js";

/** An event type option for the selector */
export interface EventTypeOption {
  id: string;
  title: string;
  durationMinutes: number;
}

/** Values submitted by the manual booking form */
export interface ManualBookingFormValues {
  eventTypeId: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Time in HH:MM (24h) */
  startTime: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
}

/** Props for the ManualBookingForm component */
export interface ManualBookingFormProps {
  /** Available event types to book */
  eventTypes: EventTypeOption[];
  /** Called when form is submitted and validation passes */
  onSubmit: (values: ManualBookingFormValues) => Promise<void>;
  /** Called when form is cancelled */
  onCancel?: () => void;
  /** Prepopulated values */
  defaultValues?: Partial<ManualBookingFormValues>;
  /** Additional CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Manual booking creation form for providers to book walk-in or phone appointments.
 *
 * Creates bookings with `confirmed` status directly, bypassing the customer-facing
 * booking flow. Validates against the selected event type's duration.
 *
 * @example
 * ```tsx
 * <ManualBookingForm
 *   eventTypes={myEventTypes}
 *   onSubmit={async (values) => {
 *     await api.createManualBooking(values);
 *     toast.success("Booking created!");
 *   }}
 * />
 * ```
 */
export function ManualBookingForm({
  eventTypes,
  onSubmit,
  onCancel,
  defaultValues,
  className,
  style,
}: ManualBookingFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<ManualBookingFormValues>({
    defaultValues: {
      eventTypeId: eventTypes[0]?.id ?? "",
      ...defaultValues,
    },
  });

  const handleFormSubmit = async (values: ManualBookingFormValues) => {
    try {
      await onSubmit(values);
    } catch (err) {
      setError("root", {
        message: err instanceof Error ? err.message : "Failed to create booking.",
      });
    }
  };

  return (
    <form
      className={cn("slotkit-manual-booking-form", className)}
      style={style}
      onSubmit={handleSubmit(handleFormSubmit)}
      noValidate
    >
      <h2 className="slotkit-form-title">New Booking</h2>

      {/* Event Type */}
      <div className="slotkit-field">
        <label htmlFor="mb-event-type" className="slotkit-label">
          Service <span aria-hidden="true">*</span>
        </label>
        <select
          id="mb-event-type"
          className="slotkit-select"
          {...register("eventTypeId", { required: "Please select a service" })}
        >
          {eventTypes.map((et) => (
            <option key={et.id} value={et.id}>
              {et.title} ({et.durationMinutes} min)
            </option>
          ))}
        </select>
        {errors.eventTypeId ? (
          <p className="slotkit-error">{errors.eventTypeId.message}</p>
        ) : null}
      </div>

      {/* Date */}
      <div className="slotkit-field">
        <label htmlFor="mb-date" className="slotkit-label">
          Date <span aria-hidden="true">*</span>
        </label>
        <input
          id="mb-date"
          type="date"
          className="slotkit-input"
          {...register("date", { required: "Please select a date" })}
        />
        {errors.date ? (
          <p className="slotkit-error">{errors.date.message}</p>
        ) : null}
      </div>

      {/* Start Time */}
      <div className="slotkit-field">
        <label htmlFor="mb-time" className="slotkit-label">
          Start Time <span aria-hidden="true">*</span>
        </label>
        <input
          id="mb-time"
          type="time"
          className="slotkit-input"
          {...register("startTime", { required: "Please select a start time" })}
        />
        {errors.startTime ? (
          <p className="slotkit-error">{errors.startTime.message}</p>
        ) : null}
      </div>

      <hr className="slotkit-divider" />
      <h3 className="slotkit-section-title">Customer Details</h3>

      {/* Customer Name */}
      <div className="slotkit-field">
        <label htmlFor="mb-name" className="slotkit-label">
          Full Name <span aria-hidden="true">*</span>
        </label>
        <input
          id="mb-name"
          type="text"
          className="slotkit-input"
          placeholder="Jane Smith"
          {...register("customerName", { required: "Customer name is required" })}
        />
        {errors.customerName ? (
          <p className="slotkit-error">{errors.customerName.message}</p>
        ) : null}
      </div>

      {/* Customer Email */}
      <div className="slotkit-field">
        <label htmlFor="mb-email" className="slotkit-label">
          Email <span aria-hidden="true">*</span>
        </label>
        <input
          id="mb-email"
          type="email"
          className="slotkit-input"
          placeholder="jane@example.com"
          {...register("customerEmail", {
            required: "Email is required",
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: "Please enter a valid email address",
            },
          })}
        />
        {errors.customerEmail ? (
          <p className="slotkit-error">{errors.customerEmail.message}</p>
        ) : null}
      </div>

      {/* Customer Phone (optional) */}
      <div className="slotkit-field">
        <label htmlFor="mb-phone" className="slotkit-label">
          Phone (optional)
        </label>
        <input
          id="mb-phone"
          type="tel"
          className="slotkit-input"
          placeholder="+1 555 000 0000"
          {...register("customerPhone")}
        />
      </div>

      {/* Notes (optional) */}
      <div className="slotkit-field">
        <label htmlFor="mb-notes" className="slotkit-label">
          Notes (optional)
        </label>
        <textarea
          id="mb-notes"
          className="slotkit-textarea"
          rows={3}
          placeholder="Any additional information..."
          {...register("notes")}
        />
      </div>

      {errors.root ? (
        <div className="slotkit-alert slotkit-alert-error" role="alert">
          {errors.root.message}
        </div>
      ) : null}

      <div className="slotkit-form-actions">
        <button
          type="submit"
          className="slotkit-button-primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create Booking"}
        </button>
        {onCancel && (
          <button
            type="button"
            className="slotkit-button-secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
