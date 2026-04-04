import { test, expect } from "@playwright/test";

test.describe("UI Component Library Section", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#components");
    await page.waitForSelector("#components", { state: "visible" });
  });

  test("section renders with correct heading", async ({ page }) => {
    const section = page.locator("#components");
    await expect(section).toContainText("Copy-Paste Components");
  });

  test("all component categories are displayed", async ({ page }) => {
    const categories = [
      "Booking Flow",
      "Service Selection",
      "Team & Providers",
      "Admin & Dashboard",
      "Queue & Walk-In",
      "Utilities",
    ];

    for (const cat of categories) {
      await expect(page.locator(`#components :has-text("${cat}")`).first()).toBeVisible();
    }
  });

  test("component install commands have copy buttons", async ({ page }) => {
    const copyBtns = page.locator('#components button:has-text("Copy")');
    expect(await copyBtns.count()).toBeGreaterThan(0);
  });

  test("live component previews render without errors (if present)", async ({ page }) => {
    // Check for any error boundaries or crash indicators
    const errors = page.locator(
      '.error-boundary, [data-testid="error"], :has-text("Something went wrong")'
    );
    expect(await errors.count()).toBe(0);

    // If live previews exist, verify they rendered
    const previews = page.locator(
      '.component-preview, [data-testid="component-preview"], .live-preview'
    );
    if (await previews.first().isVisible()) {
      expect(await previews.count()).toBeGreaterThan(0);
    }
  });
});
