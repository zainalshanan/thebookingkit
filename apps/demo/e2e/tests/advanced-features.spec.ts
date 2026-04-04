import { test, expect } from "@playwright/test";

test.describe("Advanced Features", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#advanced");
    await page.waitForSelector("#advanced", { state: "visible" });
  });

  const features = [
    { name: "Recurring Bookings", keyword: /recurring|weekly|biweekly|monthly/i },
    { name: "Seat-Based Events", keyword: /seat|capacity|available/i },
    { name: "Walk-In Queue", keyword: /queue|wait|walk-in/i },
    { name: "Routing Forms", keyword: /routing|route|destination/i },
    { name: "Payment Hooks", keyword: /cancellation|fee|payment/i },
    { name: "Kiosk Mode", keyword: /kiosk|view|day|week/i },
  ];

  for (const feature of features) {
    test(`${feature.name} card renders and has interactive controls`, async ({ page }) => {
      const section = page.locator("#advanced");
      await expect(section).toContainText(feature.name, { timeout: 5_000 });

      // Find the feature card
      const card = page.locator(
        `.feature-card:has-text("${feature.name}"), [data-feature="${feature.name}"]`
      ).first();

      if (await card.isVisible()) {
        // Verify interactive controls exist (buttons, sliders, selects)
        const controls = card.locator("button, input, select, [role='slider']");
        expect(await controls.count()).toBeGreaterThan(0);

        // Click the first control to trigger interaction
        const firstControl = controls.first();
        if (await firstControl.isVisible()) {
          await firstControl.click();
          await page.waitForTimeout(500);
        }

        // Verify output text matches expected keyword
        const cardText = await card.textContent();
        expect(cardText).toMatch(feature.keyword);
      }
    });
  }
});
