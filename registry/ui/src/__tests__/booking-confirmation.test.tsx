import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BookingConfirmation } from "../components/booking-confirmation.js";
import type { Slot } from "@slotkit/core";

describe("BookingConfirmation", () => {
  const mockSlot: Slot = {
    startTime: "2026-03-09T10:00:00Z",
    endTime: "2026-03-09T10:30:00Z",
    localStart: "2026-03-09T10:00:00",
    localEnd: "2026-03-09T10:30:00",
  };

  const mockFormData = {
    name: "John Doe",
    email: "john@example.com",
    responses: {
      "Reason for visit": "Checkup",
    },
  };

  const defaultProps = {
    eventTitle: "30-Minute Consultation",
    duration: 30,
    providerName: "Alice Johnson",
    slot: mockSlot,
    timezone: "America/New_York",
    formData: mockFormData,
    onConfirm: vi.fn(),
  };

  it("renders summary details correctly", () => {
    render(<BookingConfirmation {...defaultProps} />);
    expect(screen.getByText("30-Minute Consultation")).toBeInTheDocument();
    expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Checkup")).toBeInTheDocument();
  });

  it("calls onConfirm when clicking 'Confirm Booking'", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ bookingId: "bk_123" });
    render(<BookingConfirmation {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText(/Confirm Booking/i));
    expect(onConfirm).toHaveBeenCalled();

    expect(await screen.findByText(/Booking Confirmed!/i)).toBeInTheDocument();
    expect(await screen.findByText("bk_123")).toBeInTheDocument();
  });

  it("shows conflict error when onConfirm fails with conflict", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("BOOKING_CONFLICT"));
    render(<BookingConfirmation {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText(/Confirm Booking/i));

    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
  });

  it("shows general error on failure", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Something went wrong"));
    render(<BookingConfirmation {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText(/Confirm Booking/i));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("calls onBack when clicking 'Back'", () => {
    const onBack = vi.fn();
    render(<BookingConfirmation {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByText(/Back/i));
    expect(onBack).toHaveBeenCalled();
  });
});
