import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BookingQuestions } from "../components/booking-questions.js";
import type { BookingQuestion } from "@slotkit/core";

describe("BookingQuestions", () => {
  const mockQuestions: BookingQuestion[] = [
    {
      key: "reason",
      label: "Reason for visit",
      type: "short_text",
      isRequired: true,
    },
    {
      key: "notes",
      label: "Additional notes",
      type: "long_text",
      isRequired: false,
    },
  ];

  it("renders standard fields (name, email, phone)", () => {
    render(<BookingQuestions onSubmit={() => {}} />);
    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Phone/i)).toBeInTheDocument();
  });

  it("renders custom questions", () => {
    render(
      <BookingQuestions
        questions={mockQuestions}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByLabelText(/Reason for visit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Additional notes/i)).toBeInTheDocument();
  });

  it("shows validation errors for required fields", async () => {
    render(
      <BookingQuestions
        questions={mockQuestions}
        onSubmit={() => {}}
      />
    );

    fireEvent.click(screen.getByText(/Continue/i));

    expect(await screen.findByText(/Name is required/i)).toBeInTheDocument();
    expect(await screen.findByText(/Email is required/i)).toBeInTheDocument();
    expect(await screen.findByText(/Reason for visit is required/i)).toBeInTheDocument();
  });

  it("validates email format", async () => {
    render(<BookingQuestions onSubmit={() => {}} />);

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "invalid-email" } });
    fireEvent.click(screen.getByText(/Continue/i));

    expect(await screen.findByText(/Please enter a valid email address/i)).toBeInTheDocument();
  });

  it("calls onSubmit with correct data", async () => {
    const onSubmit = vi.fn();
    render(
      <BookingQuestions
        questions={mockQuestions}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "John Doe" } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "john@example.com" } });
    fireEvent.change(screen.getByLabelText(/Reason for visit/i), { target: { value: "Checkup" } });

    fireEvent.click(screen.getByText(/Continue/i));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "John Doe",
        email: "john@example.com",
        phone: undefined,
        responses: {
          reason: "Checkup",
          notes: "",
        },
      });
    });
  });

  it("shows submitting state", () => {
    render(<BookingQuestions onSubmit={() => {}} isSubmitting={true} />);
    expect(screen.getByText(/Submitting.../i)).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
