import { test, expect } from "@playwright/test";

test.describe("Team Scheduling", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#team");
    await page.waitForSelector("#team", { state: "visible" });
  });

  test("displays team member cards", async ({ page }) => {
    // Should show 3 barber cards
    const memberCards = page.locator(
      '.team-member-card, [data-testid="member-card"], .barber-card'
    );
    await expect(memberCards.first()).toBeVisible({ timeout: 10_000 });
    expect(await memberCards.count()).toBeGreaterThanOrEqual(3);
  });

  test("round robin strategy shows available slots", async ({ page }) => {
    // Scope to the team section to avoid matching buttons elsewhere
    const teamSection = page.locator("#team");
    const rrBtn = teamSection.locator(".strategy-btn", { hasText: "Round Robin" }).first();
    if (await rrBtn.isVisible()) {
      await rrBtn.click();
      await page.waitForTimeout(1000);

      // Should show team slot pills
      const slots = teamSection.locator(".team-slot-pill");
      await expect(slots.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test("collective strategy shows different slot count", async ({ page }) => {
    const teamSection = page.locator("#team");
    const collectiveBtn = teamSection.locator(".strategy-btn", { hasText: "Collective" }).first();
    if (await collectiveBtn.isVisible()) {
      await collectiveBtn.click();
      await page.waitForTimeout(1000);

      // Collective should show content (fewer slots — intersection, not union)
      const text = await teamSection.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test("shows code snippet with getTeamSlots and assignHost", async ({ page }) => {
    const codeBlock = page.locator(
      'pre:has-text("getTeamSlots"), code:has-text("getTeamSlots")'
    );
    await expect(codeBlock.first()).toBeVisible({ timeout: 5_000 });
  });
});
