import { test, expect } from "@playwright/test";

test.describe("Hero Section", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the primary headline", async ({ page }) => {
    const heading = page.locator("h1.hero-title");
    await expect(heading).toContainText("Bookings");
    await expect(heading).toContainText("Not Booking Systems");
  });

  test("displays NextAuth of Scheduling subline", async ({ page }) => {
    const subtitle = page.locator(".hero-subtitle");
    await expect(subtitle).toContainText("NextAuth of Scheduling");
    await expect(subtitle).toContainText("Zero vendor lock-in");
  });

  test("shows API function pills instead of industry names", async ({ page }) => {
    const pills = page.locator(".hero-use-case-pill");
    await expect(pills.first()).toContainText("getAvailableSlots()");
    // Should NOT have old industry pills
    await expect(page.locator(".hero-use-case-pill", { hasText: "Salons" })).toHaveCount(0);
  });

  test("quick start copy button copies init command", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const initCopyBtn = page.locator('button[aria-label="Copy init command"]');
    await initCopyBtn.click();
    await expect(initCopyBtn).toContainText("Copied");
  });

  test("core only copy button copies install command", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const coreCopyBtn = page.locator('button[aria-label="Copy install command"]');
    await coreCopyBtn.click();
    await expect(coreCopyBtn).toContainText("Copied");
  });

  test("displays E2E Verified stat instead of unit test count", async ({ page }) => {
    const stats = page.locator(".hero-stats");
    await expect(stats).toContainText("E2E Verified");
    await expect(stats).toContainText("Docker + Postgres");
    await expect(stats).not.toContainText("Unit Tests");
  });

  test("shows correct package and component counts", async ({ page }) => {
    const stats = page.locator(".hero-stats");
    await expect(stats).toContainText("5");
    await expect(stats).toContainText("Packages");
    await expect(stats).toContainText("31");
    await expect(stats).toContainText("Registry Components");
  });

  test("code window shows Next.js API route filename", async ({ page }) => {
    const filename = page.locator(".code-window-filename");
    await expect(filename).toContainText("app/api/bookings/route.ts");
  });
});
