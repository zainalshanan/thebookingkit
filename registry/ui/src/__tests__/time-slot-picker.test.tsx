import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimeSlotPicker } from "../components/time-slot-picker.js";
import type { Slot } from "@slotkit/core";

describe("TimeSlotPicker", () => {
  const mockSlots: Slot[] = [
    {
      startTime: "2026-03-09T09:00:00Z",
      endTime: "2026-03-09T09:30:00Z",
      localStart: "2026-03-09T09:00:00",
      localEnd: "2026-03-09T09:30:00",
    },
    {
      startTime: "2026-03-09T14:00:00Z",
      endTime: "2026-03-09T14:30:00Z",
      localStart: "2026-03-09T14:00:00",
      localEnd: "2026-03-09T14:30:00",
    },
  ];

  it("renders slots correctly in 12h format", () => {
    render(<TimeSlotPicker slots={mockSlots} onSelect={() => {}} />);
    expect(screen.getByText("9:00 AM")).toBeInTheDocument();
    expect(screen.getByText("2:00 PM")).toBeInTheDocument();
  });

  it("renders slots correctly in 24h format", () => {
    render(
      <TimeSlotPicker
        slots={mockSlots}
        onSelect={() => {}}
        timeFormat="24h"
      />
    );
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("14:00")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(<TimeSlotPicker slots={[]} onSelect={() => {}} isLoading={true} />);
    expect(screen.getByLabelText(/Loading time slots/)).toBeInTheDocument();
  });

  it("shows empty state", () => {
    render(<TimeSlotPicker slots={[]} onSelect={() => {}} />);
    expect(screen.getByText(/No times available/)).toBeInTheDocument();
  });

  it("calls onSelect when a slot is clicked", () => {
    const onSelect = vi.fn();
    render(<TimeSlotPicker slots={mockSlots} onSelect={onSelect} />);

    fireEvent.click(screen.getByText("9:00 AM"));
    expect(onSelect).toHaveBeenCalledWith(mockSlots[0]);
  });

  it("highlights the selected slot", () => {
    render(
      <TimeSlotPicker
        slots={mockSlots}
        onSelect={() => {}}
        selectedSlot={mockSlots[1]}
      />
    );

    const button = screen.getByText("2:00 PM");
    expect(button).toHaveClass("slotkit-slot-selected");
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("groups slots by period", () => {
    render(
      <TimeSlotPicker
        slots={mockSlots}
        onSelect={() => {}}
        groupByPeriod={true}
      />
    );

    expect(screen.getByText("Morning")).toBeInTheDocument();
    expect(screen.getByText("Afternoon")).toBeInTheDocument();
  });
});
