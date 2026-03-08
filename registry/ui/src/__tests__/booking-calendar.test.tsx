import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BookingCalendar } from "../components/booking-calendar.js";
import { startOfDay, addDays, format } from "date-fns";

describe("BookingCalendar", () => {
  // Fix "today" to a specific date for consistent testing
  const today = new Date(2026, 2, 8); // March 8, 2026

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(today);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders correctly with timezone", () => {
    render(
      <BookingCalendar
        onSelect={() => {}}
        timezone="America/New_York"
      />
    );
    expect(screen.getByText(/Timezone: America\/New_York/)).toBeInTheDocument();
  });

  it("calls onSelect when a valid day is clicked", () => {
    const onSelect = vi.fn();
    render(<BookingCalendar onSelect={onSelect} />);

    // In react-day-picker v9, the label is "Today, Sunday, March 8th, 2026" or similar
    // We use a regex to be safe.
    const todayButton = screen.getByRole("button", { name: /March 8th, 2026/i });
    fireEvent.click(todayButton);

    expect(onSelect).toHaveBeenCalled();
  });

  it("disables past dates", () => {
    render(<BookingCalendar onSelect={() => {}} />);
    
    // March 7th should be disabled
    const yesterdayButton = screen.getByRole("button", { name: /March 7th, 2026/i });
    expect(yesterdayButton).toBeDisabled();
  });

  it("respects maxFutureDays", () => {
    const maxFutureDays = 5;
    render(<BookingCalendar onSelect={() => {}} maxFutureDays={maxFutureDays} />);

    // March 14th should be disabled (8 + 5 = 13 is the last enabled day)
    const farFutureButton = screen.getByRole("button", { name: /March 14th, 2026/i });
    expect(farFutureButton).toBeDisabled();
  });

  it("shows only availableDates if provided", () => {
    const tomorrow = addDays(today, 1); // March 9
    const dayAfter = addDays(today, 2); // March 10

    render(
      <BookingCalendar
        onSelect={() => {}}
        availableDates={[tomorrow]}
      />
    );

    const tomorrowButton = screen.getByRole("button", { name: /March 9th, 2026/i });
    const dayAfterButton = screen.getByRole("button", { name: /March 10th, 2026/i });

    expect(tomorrowButton).not.toBeDisabled();
    expect(dayAfterButton).toBeDisabled();
  });

  it("calls onTimezoneChange when selecting a new timezone", () => {
    const onTimezoneChange = vi.fn();
    render(
      <BookingCalendar
        onSelect={() => {}}
        timezone="UTC"
        onTimezoneChange={onTimezoneChange}
      />
    );

    const select = screen.getByLabelText("Select timezone");
    fireEvent.change(select, { target: { value: "Europe/London" } });

    expect(onTimezoneChange).toHaveBeenCalledWith("Europe/London");
  });
});
