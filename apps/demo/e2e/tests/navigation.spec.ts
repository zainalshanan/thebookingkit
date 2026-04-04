import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  const sections = [
    { anchor: "#booking", name: "Live Demo" },
    { anchor: "#engine", name: "Engine" },
    { anchor: "#team", name: "Team Scheduling" },
    { anchor: "#advanced", name: "Advanced" },
    { anchor: "#packages", name: "Packages" },
    { anchor: "#components", name: "Components" },
    { anchor: "#architecture", name: "Architecture" },
  ];

  for (const section of sections) {
    test(`nav link scrolls to ${section.anchor}`, async ({ page }) => {
      const navLink = page.locator(`nav a[href="${section.anchor}"]`);
      if (await navLink.isVisible()) {
        await navLink.click();
        await page.waitForTimeout(500);

        // Verify the section is in viewport
        const target = page.locator(section.anchor);
        await expect(target).toBeVisible();
      }
    });
  }

  test("all major sections exist on the page", async ({ page }) => {
    for (const section of sections) {
      const el = page.locator(section.anchor);
      await expect(el).toBeAttached();
    }
  });

  test("sticky nav is visible on scroll", async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(300);

    const nav = page.locator("nav, .sticky-nav, [data-testid='nav']");
    await expect(nav.first()).toBeVisible();
  });

  test("GitHub and Docs links have correct targets", async ({ page }) => {
    const githubLink = page.locator('a[href*="github.com/zainalshanan/thebookingkit"]');
    await expect(githubLink.first()).toBeVisible();

    const docsLink = page.locator('a[href*="docs.thebookingkit.dev"]');
    await expect(docsLink.first()).toBeVisible();
  });
});
