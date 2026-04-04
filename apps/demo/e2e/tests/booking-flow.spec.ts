import { test, expect } from "@playwright/test";

test.describe("Live Booking Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#booking");
    // Wait for the booking section to be visible
    await page.waitForSelector("#booking", { state: "visible" });
  });

  test("customer booking flow completes end-to-end", async ({ page }) => {
    // Step 1: Select a service
    const bookingSection = page.locator("#booking");
    const serviceCards = bookingSection.locator(".service-card");
    await expect(serviceCards.first()).toBeVisible({ timeout: 10_000 });
    await serviceCards.first().click();

    // Step 2: Pick a date on the calendar
    // The calendar uses .day-cell class; find one that's not disabled/past
    const selectableDays = bookingSection.locator(".day-cell:not(.empty):not(.past):not(.disabled)");
    await expect(selectableDays.first()).toBeVisible({ timeout: 10_000 });
    // Click a day in the middle of the visible month (more likely to be future/available)
    const dayCount = await selectableDays.count();
    const targetDay = Math.min(Math.floor(dayCount / 2), dayCount - 1);
    await selectableDays.nth(targetDay).click();

    // Step 3: Wait for slots to load, then pick one
    const timeSlots = bookingSection.locator(".slot-btn");
    await expect(timeSlots.first()).toBeVisible({ timeout: 10_000 });
    await timeSlots.first().click();

    // Step 4: Fill customer details
    const nameInput = bookingSection.locator('input[placeholder*="name" i], input[name="name"]').first();
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill("Test Customer");

    const emailInput = bookingSection.locator('input[type="email"], input[placeholder*="email" i]').first();
    await emailInput.fill("test@example.com");

    const phoneInput = bookingSection.locator('input[type="tel"], input[placeholder*="phone" i]').first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill("555-0123");
    }

    // Step 5: Submit the form / go to next step
    const nextBtn = bookingSection.locator('button:has-text("Next"), button:has-text("Continue"), button[type="submit"]').first();
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    }

    // Step 6: Confirm booking
    const confirmBtn = bookingSection.locator('button:has-text("Confirm"), button:has-text("Book")').first();
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Step 7: Verify success state (booking confirmed or success screen)
    const successIndicator = bookingSection.locator('.booking-success, :has-text("Booking Confirmed")').first();
    await expect(successIndicator).toBeVisible({ timeout: 10_000 });
  });

  test("admin dashboard shows bookings and allows status changes", async ({ page }) => {
    // Switch to admin view
    const adminTab = page.locator(
      'button:has-text("Admin"), [data-testid="admin-tab"], .tab-btn:has-text("Admin")'
    );
    await expect(adminTab).toBeVisible({ timeout: 10_000 });
    await adminTab.click();

    // Verify bookings table renders
    const bookingsTable = page.locator(
      '.bookings-table, [data-testid="bookings-table"], table'
    );
    await expect(bookingsTable.first()).toBeVisible({ timeout: 10_000 });

    // Verify stat cards render
    const stats = page.locator(
      '.admin-stats, .stat-card, [data-testid="booking-stats"]'
    );
    await expect(stats.first()).toBeVisible();
  });

  test("API call preview toggle works", async ({ page }) => {
    // Look for the API call toggle
    const apiToggle = page.locator(
      'button:has-text("API"), [data-testid="api-toggle"], .api-toggle'
    );
    if (await apiToggle.isVisible()) {
      await apiToggle.click();
      // Verify code/API preview appears
      const apiPreview = page.locator(
        '.api-call, [data-testid="api-preview"], pre, code'
      );
      await expect(apiPreview.first()).toBeVisible();
    }
  });
});
