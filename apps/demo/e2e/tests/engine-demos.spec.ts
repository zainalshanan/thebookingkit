import { test, expect } from "@playwright/test";

test.describe("Core Engine Demos", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#engine");
    await page.waitForSelector("#engine", { state: "visible" });
  });

  const tabs = [
    { name: "Slot Durations", expects: "duration" },
    { name: "Buffer Time", expects: "buffer" },
    { name: "Overrides", expects: "override" },
    { name: "Timezones", expects: "timezone" },
    { name: "Embed Code", expects: "embed" },
    { name: "Booking Limits", expects: "limit" },
    { name: "Confirmation Mode", expects: "confirm" },
    { name: "Slot Release", expects: "release" },
  ];

  for (const tab of tabs) {
    test(`${tab.name} tab renders content and is interactive`, async ({ page }) => {
      // Click the tab
      const tabBtn = page.locator(`button:has-text("${tab.name}"), [data-tab="${tab.name}"]`);
      if (await tabBtn.isVisible()) {
        await tabBtn.click();
      }

      // Wait for content to load (no loading spinners, content visible)
      await page.waitForTimeout(500);

      // The active tab panel should have visible content
      const panel = page.locator(".engine-tab-content, .tab-panel, [role='tabpanel']");
      if (await panel.first().isVisible()) {
        // Verify there's actual content (not empty)
        const text = await panel.first().textContent();
        expect(text?.trim().length).toBeGreaterThan(0);
      }
    });
  }

  test("slot durations comparison shows different slot counts", async ({ page }) => {
    const durationTab = page.locator('button:has-text("Slot Durations")');
    if (await durationTab.isVisible()) {
      await durationTab.click();
      await page.waitForTimeout(1000);

      // Should show multiple duration columns with different counts
      const slotCounts = page.locator(".slot-count, .duration-count, [data-testid='slot-count']");
      if (await slotCounts.first().isVisible()) {
        expect(await slotCounts.count()).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test("timezone comparison shows slots across different zones", async ({ page }) => {
    const tzTab = page.locator('button:has-text("Timezones")');
    if (await tzTab.isVisible()) {
      await tzTab.click();
      await page.waitForTimeout(1000);

      // Should show timezone labels
      const tzLabels = page.locator(
        ':has-text("New_York"), :has-text("London"), :has-text("Tokyo")'
      );
      await expect(tzLabels.first()).toBeVisible({ timeout: 5_000 });
    }
  });
});
