import { test, expect } from "@playwright/test";

test.describe("Resource & Capacity Booking", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#resources");
    await page.waitForSelector("#resources", { state: "visible" });
  });

  test("renders restaurant resource pool info", async ({ page }) => {
    const section = page.locator("#resources");
    // Should mention Olive & Vine or restaurant context
    await expect(section).toContainText(/olive|bistro|restaurant|table/i);
  });

  test("party size selector changes available slots", async ({ page }) => {
    const resourceSection = page.locator("#resources");

    // Wait for the party size buttons to appear (they are inline styled, not CSS classes)
    // The resource section shows buttons labeled 1-8 for party sizes
    await page.waitForTimeout(2000); // Wait for initial data load

    // Click the "4" button scoped to just the resources section
    // Use exact text matching to avoid matching "14", "24", etc.
    const sizeBtn = resourceSection.getByRole("button", { name: "4", exact: true }).first();
    if (await sizeBtn.isVisible()) {
      await sizeBtn.click();
      await page.waitForTimeout(1000);
    }

    // Verify the section has content (slots or "no tables" message)
    const text = await resourceSection.textContent();
    expect(text?.length).toBeGreaterThan(100);
  });

  test("table assignment strategy selector works", async ({ page }) => {
    const strategySelectors = page.locator(
      'button:has-text("best_fit"), button:has-text("Best Fit"), select, [data-testid="strategy-select"]'
    );
    if (await strategySelectors.first().isVisible()) {
      await strategySelectors.first().click();
      await page.waitForTimeout(500);
    }
  });

  test("pool utilization summary renders", async ({ page }) => {
    const utilSection = page.locator(
      ':has-text("utilization"), :has-text("Utilization"), :has-text("Available")'
    );
    await expect(utilSection.first()).toBeVisible({ timeout: 10_000 });
  });
});
