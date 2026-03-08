"use client";

import { useState, useEffect } from "react";
import {
  addDays,
  startOfDay,
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  getDay,
  getDaysInMonth,
  isSameDay,
  isBefore,
} from "date-fns";
import type { Slot } from "@thebookingkit/core";
import { fetchSlots, createBooking, type BookingResult } from "@/lib/actions";
import { SERVICES, BARBER_SHOP, type Service } from "@/lib/constants";

type Step = "service" | "datetime" | "details" | "confirm" | "success";

interface FormData {
  name: string;
  email: string;
  phone: string;
  notes: string;
  responses: Record<string, string>;
}

export function CustomerBooking({ onApiCall }: { onApiCall?: (call: string) => void }) {
  const [step, setStep] = useState<Step>("service");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    phone: "",
    notes: "",
    responses: {},
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    if (!selectedDate || !selectedService) return;
    let cancelled = false;
    setLoadingSlots(true);
    setSelectedSlot(null);

    const dayStart = startOfDay(selectedDate);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    onApiCall?.(
      `getAvailableSlots(rules, overrides, bookings, { start, end }, "${timezone}", { duration: ${selectedService.duration}, bufferBefore: 5, bufferAfter: 5 })`,
    );
    fetchSlots(selectedService.slug, dayStart.toISOString(), dayEnd.toISOString(), timezone).then(
      (result) => {
        if (!cancelled) {
          setSlots(result);
          setLoadingSlots(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedDate, selectedService, timezone]);

  const handleServiceSelect = (service: Service) => {
    setSelectedService(service);
    setSelectedDate(null);
    setSelectedSlot(null);
    setSlots([]);
    setStep("datetime");
  };

  const handleSlotSelect = (slot: Slot) => {
    setSelectedSlot(slot);
    setStep("details");
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = "Name is required";
    if (!formData.email.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = "Invalid email";
    if (formData.phone && !/^[+]?[\d\s()-]{7,20}$/.test(formData.phone))
      errors.phone = "Invalid phone number";

    // Validate required custom questions
    for (const q of selectedService?.questions ?? []) {
      if (q.isRequired && !formData.responses[q.key]?.trim()) {
        errors[`q_${q.key}`] = `${q.label} is required`;
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) setStep("confirm");
  };

  const handleConfirm = async () => {
    if (!selectedService || !selectedSlot) return;
    setSubmitting(true);
    onApiCall?.(`isSlotAvailable(rules, overrides, bookings, startTime, endTime, 5, 5) → createBooking(...)`);
    const result = await createBooking(
      selectedService.slug,
      selectedSlot.startTime,
      selectedSlot.endTime,
      formData.name,
      formData.email,
      formData.phone || undefined,
      formData.notes || undefined,
      Object.keys(formData.responses).length > 0 ? formData.responses : undefined,
    );
    setBookingResult(result);
    setSubmitting(false);
    if (result.success) setStep("success");
  };

  const handleStartOver = () => {
    setStep("service");
    setSelectedService(null);
    setSelectedDate(null);
    setSelectedSlot(null);
    setSlots([]);
    setFormData({ name: "", email: "", phone: "", notes: "", responses: {} });
    setFormErrors({});
    setBookingResult(null);
  };

  const stepIndex = ["service", "datetime", "details", "confirm", "success"].indexOf(step);
  const icons: Record<string, string> = {
    scissors: "\u2702\uFE0F",
    beard: "\u{1F9D4}",
    combo: "\u2728",
    razor: "\u{1FA92}",
    kids: "\u{1F466}",
    deluxe: "\u{1F451}",
  };

  return (
    <div>
      {step !== "success" && (
        <div className="step-bar">
          {["Service", "Date & Time", "Details", "Confirm"].map((label, i) => (
            <div
              key={label}
              className={`step-item ${i === stepIndex ? "active" : ""} ${i < stepIndex ? "done" : ""}`}
            >
              <div className="step-number">{i < stepIndex ? "\u2713" : i + 1}</div>
              <span className="step-label">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Step 1: Service Selection */}
      {step === "service" && (
        <>
          <h2 className="section-title">Choose a Service</h2>
          <div className="services-grid">
            {SERVICES.map((service) => (
              <div
                key={service.slug}
                className="service-card"
                onClick={() => handleServiceSelect(service)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && handleServiceSelect(service)}
              >
                <div className="service-icon">{icons[service.icon] ?? "\u2702\uFE0F"}</div>
                <h3>{service.title}</h3>
                <div className="service-meta">
                  <span className="service-duration">{service.duration} min</span>
                  <span className="service-price">${service.price}</span>
                </div>
                <p className="service-desc">{service.description}</p>
                {service.questions && service.questions.length > 0 && (
                  <span className="service-tag">Custom questions</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Step 2: Date & Time */}
      {step === "datetime" && selectedService && (
        <div className="booking-section">
          <button className="btn-back" onClick={() => setStep("service")}>
            &larr; Services
          </button>
          <h2 className="section-title">
            {icons[selectedService.icon]} {selectedService.title}{" "}
            <span className="title-meta">{selectedService.duration} min &middot; ${selectedService.price}</span>
          </h2>

          <div className="datetime-layout">
            <div className="calendar-side">
              <MiniCalendar selectedDate={selectedDate} onSelect={setSelectedDate} />
              <p className="tz-label">Timezone: {timezone}</p>
            </div>

            <div className="slots-side">
              {!selectedDate && <p className="no-slots">Select a date to see available times</p>}
              {selectedDate && loadingSlots && <p className="loading-slots">Loading...</p>}
              {selectedDate && !loadingSlots && slots.length === 0 && (
                <p className="no-slots">No times available on this date</p>
              )}
              {selectedDate && !loadingSlots && slots.length > 0 && (
                <SlotList slots={slots} selectedSlot={selectedSlot} onSelect={handleSlotSelect} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Details */}
      {step === "details" && selectedService && selectedSlot && (
        <div className="booking-section">
          <button className="btn-back" onClick={() => setStep("datetime")}>
            &larr; Change time
          </button>
          <h2 className="section-title">Your Details</h2>

          <div className="selected-summary">
            <span>{selectedService.title}</span>
            <span>{formatSlotDisplay(selectedSlot)}</span>
          </div>

          <form className="booking-form" onSubmit={handleDetailsSubmit}>
            <div className="form-row">
              <div className="form-field">
                <label>
                  Name <span className="req">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your full name"
                />
                {formErrors.name && <span className="form-error">{formErrors.name}</span>}
              </div>
              <div className="form-field">
                <label>
                  Email <span className="req">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="you@example.com"
                />
                {formErrors.email && <span className="form-error">{formErrors.email}</span>}
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
                {formErrors.phone && <span className="form-error">{formErrors.phone}</span>}
              </div>
              <div className="form-field">
                <label>Notes</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any special requests?"
                />
              </div>
            </div>

            {/* Custom Questions */}
            {selectedService.questions && selectedService.questions.length > 0 && (
              <div className="custom-questions">
                <h3>Additional Information</h3>
                {selectedService.questions.map((q) => (
                  <div className="form-field" key={q.key}>
                    <label>
                      {q.label} {q.isRequired && <span className="req">*</span>}
                    </label>
                    {q.type === "single_select" ? (
                      <select
                        value={formData.responses[q.key] ?? ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            responses: { ...formData.responses, [q.key]: e.target.value },
                          })
                        }
                      >
                        <option value="">Select...</option>
                        {q.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : q.type === "long_text" ? (
                      <textarea
                        value={formData.responses[q.key] ?? ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            responses: { ...formData.responses, [q.key]: e.target.value },
                          })
                        }
                        rows={3}
                        placeholder={`Enter ${q.label.toLowerCase()}`}
                      />
                    ) : (
                      <input
                        type={q.type === "number" ? "number" : "text"}
                        value={formData.responses[q.key] ?? ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            responses: { ...formData.responses, [q.key]: e.target.value },
                          })
                        }
                        placeholder={`Enter ${q.label.toLowerCase()}`}
                      />
                    )}
                    {formErrors[`q_${q.key}`] && (
                      <span className="form-error">{formErrors[`q_${q.key}`]}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="button-row">
              <button type="submit" className="btn-primary">
                Review Booking
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === "confirm" && selectedService && selectedSlot && (
        <div className="booking-section">
          <button className="btn-back" onClick={() => setStep("details")}>
            &larr; Edit details
          </button>
          <h2 className="section-title">Confirm Your Booking</h2>

          <div className="confirm-card">
            <div className="confirm-grid">
              <div className="confirm-item">
                <span className="confirm-label">Service</span>
                <span className="confirm-value">{selectedService.title}</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">Duration</span>
                <span className="confirm-value">{selectedService.duration} min</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">Price</span>
                <span className="confirm-value">${selectedService.price}</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">Date & Time</span>
                <span className="confirm-value">{formatSlotDisplay(selectedSlot)}</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">Barber</span>
                <span className="confirm-value">{BARBER_SHOP.provider}</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">Location</span>
                <span className="confirm-value">{BARBER_SHOP.location}</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">Name</span>
                <span className="confirm-value">{formData.name}</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">Email</span>
                <span className="confirm-value">{formData.email}</span>
              </div>
              {formData.phone && (
                <div className="confirm-item">
                  <span className="confirm-label">Phone</span>
                  <span className="confirm-value">{formData.phone}</span>
                </div>
              )}
              {Object.entries(formData.responses).map(([key, value]) => {
                const q = selectedService.questions?.find((q) => q.key === key);
                return (
                  <div className="confirm-item" key={key}>
                    <span className="confirm-label">{q?.label ?? key}</span>
                    <span className="confirm-value">{value}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {bookingResult && !bookingResult.success && (
            <div className="alert alert-error">{bookingResult.error}</div>
          )}

          <div className="button-row">
            <button className="btn-primary" onClick={handleConfirm} disabled={submitting}>
              {submitting ? "Booking..." : "Confirm Booking"}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Success */}
      {step === "success" && bookingResult?.success && (
        <div className="booking-section success-section">
          <div className="success-check">{"\u2713"}</div>
          <h2>Booking Confirmed!</h2>
          <p className="success-subtitle">
            A confirmation would be sent to <strong>{formData.email}</strong>
          </p>
          <div className="booking-id-badge">{bookingResult.bookingId}</div>

          <div className="confirm-card" style={{ marginTop: "1.5rem" }}>
            <div className="confirm-grid">
              <div className="confirm-item">
                <span className="confirm-label">Service</span>
                <span className="confirm-value">{selectedService?.title}</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">Date & Time</span>
                <span className="confirm-value">{selectedSlot && formatSlotDisplay(selectedSlot)}</span>
              </div>
              <div className="confirm-item">
                <span className="confirm-label">Barber</span>
                <span className="confirm-value">{BARBER_SHOP.provider}</span>
              </div>
            </div>
          </div>

          <div className="button-row" style={{ justifyContent: "center", marginTop: "1.5rem" }}>
            <button className="btn-primary" onClick={handleStartOver}>
              Book Another Appointment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini Calendar
// ---------------------------------------------------------------------------

function MiniCalendar({
  selectedDate,
  onSelect,
}: {
  selectedDate: Date | null;
  onSelect: (date: Date) => void;
}) {
  const today = startOfDay(new Date());
  const maxDate = addDays(today, 60);
  const [viewMonth, setViewMonth] = useState(startOfMonth(today));

  const monthStart = startOfMonth(viewMonth);
  const daysInMonth = getDaysInMonth(viewMonth);
  const startDow = getDay(monthStart);

  const days: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
  }

  const canPrev = viewMonth > startOfMonth(today);
  const canNext = endOfMonth(viewMonth) < maxDate;

  return (
    <div className="calendar-container">
      <div className="calendar-nav">
        <button onClick={() => setViewMonth(subMonths(viewMonth, 1))} disabled={!canPrev}>
          &lsaquo;
        </button>
        <span className="month-label">{format(viewMonth, "MMMM yyyy")}</span>
        <button onClick={() => setViewMonth(addMonths(viewMonth, 1))} disabled={!canNext}>
          &rsaquo;
        </button>
      </div>
      <div className="calendar-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="day-header">
            {d}
          </div>
        ))}
        {days.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="day-cell empty" />;
          const isPast = isBefore(day, today);
          const isFuture = day > maxDate;
          const isSunday = getDay(day) === 0;
          const disabled = isPast || isFuture || isSunday;
          const isToday = isSameDay(day, today);
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;

          return (
            <button
              key={day.toISOString()}
              className={`day-cell ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`}
              disabled={disabled}
              onClick={() => onSelect(day)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slot List
// ---------------------------------------------------------------------------

function SlotList({
  slots,
  selectedSlot,
  onSelect,
}: {
  slots: Slot[];
  selectedSlot: Slot | null;
  onSelect: (slot: Slot) => void;
}) {
  const morning = slots.filter((s) => getHour(s) < 12);
  const afternoon = slots.filter((s) => getHour(s) >= 12 && getHour(s) < 17);
  const evening = slots.filter((s) => getHour(s) >= 17);

  const groups = [
    { label: "Morning", slots: morning },
    { label: "Afternoon", slots: afternoon },
    { label: "Evening", slots: evening },
  ].filter((g) => g.slots.length > 0);

  return (
    <div>
      <h3 className="slots-count">{slots.length} times available</h3>
      {groups.map((group) => (
        <div key={group.label}>
          <div className="slot-period-label">{group.label}</div>
          <div className="slot-grid">
            {group.slots.map((slot) => (
              <button
                key={slot.startTime}
                className={`slot-btn ${selectedSlot?.startTime === slot.startTime ? "selected" : ""}`}
                onClick={() => onSelect(slot)}
              >
                {formatTime(slot.localStart)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function getHour(slot: Slot): number {
  return parseInt(slot.localStart.split("T")[1]?.split(":")[0] ?? "0", 10);
}

function formatTime(localStart: string): string {
  const timePart = localStart.split("T")[1];
  if (!timePart) return localStart;
  const [h, m] = timePart.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatSlotDisplay(slot: Slot): string {
  const date = new Date(slot.startTime);
  const dateStr = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${dateStr} at ${formatTime(slot.localStart)}`;
}
