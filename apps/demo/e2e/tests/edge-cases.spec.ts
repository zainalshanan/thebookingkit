import { test, expect } from "@playwright/test";

test.describe("Edge Cases & Confidence Tests", () => {
  test.describe("Mobile viewport", () => {
    test.use({ viewport: { width: 375, height: 812 } }); // iPhone SE

    test("hero section is readable on mobile", async ({ page }) => {
      await page.goto("/");
      const title = page.locator("h1.hero-title");
      await expect(title).toBeVisible();
      await expect(title).toContainText("Bookings");
    });

    test("navigation is accessible on mobile", async ({ page }) => {
      await page.goto("/");
      // Nav should either collapse to hamburger or remain usable
      const nav = page.locator("nav").first();
      await expect(nav).toBeAttached();
    });

    test("booking flow works on mobile viewport", async ({ page }) => {
      await page.goto("/#booking");
      const bookingSection = page.locator("#booking");
      await expect(bookingSection).toBeVisible();

      // Service cards should be visible
      const serviceCards = bookingSection.locator(".service-card");
      await expect(serviceCards.first()).toBeVisible({ timeout: 10_000 });
    });

    test("live component previews don't overflow on mobile", async ({ page }) => {
      await page.goto("/#components");
      const previews = page.locator(".component-preview");
      if (await previews.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
        // Check no horizontal overflow
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(overflow).toBe(false);
      }
    });
  });

  test.describe("Accessibility", () => {
    test("all interactive elements have accessible names", async ({ page }) => {
      await page.goto("/");
      // Check copy buttons have aria-labels
      const copyBtns = page.locator('button[aria-label*="Copy"]');
      expect(await copyBtns.count()).toBeGreaterThan(0);

      for (let i = 0; i < Math.min(await copyBtns.count(), 5); i++) {
        const label = await copyBtns.nth(i).getAttribute("aria-label");
        expect(label).toBeTruthy();
      }
    });

    test("page has proper heading hierarchy", async ({ page }) => {
      await page.goto("/");
      const h1 = page.locator("h1");
      expect(await h1.count()).toBe(1); // Only one h1

      const h2s = page.locator("h2");
      expect(await h2s.count()).toBeGreaterThan(0); // Has section headings
    });

    test("external links have rel=noopener", async ({ page }) => {
      await page.goto("/");
      const externalLinks = page.locator('a[target="_blank"]');
      for (let i = 0; i < Math.min(await externalLinks.count(), 5); i++) {
        const rel = await externalLinks.nth(i).getAttribute("rel");
        expect(rel).toContain("noopener");
      }
    });
  });

  test.describe("Error resilience", () => {
    test("no console errors on page load", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await page.goto("/");
      await page.waitForTimeout(2000);
      expect(errors).toEqual([]);
    });

    test("no uncaught JavaScript exceptions during interaction", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.goto("/");
      // Scroll through all sections
      for (const anchor of ["#booking", "#engine", "#team", "#resources", "#advanced", "#packages", "#components", "#architecture"]) {
        await page.goto(`/${anchor}`);
        await page.waitForTimeout(500);
      }
      expect(errors).toEqual([]);
    });

    test("no broken images on the page", async ({ page }) => {
      await page.goto("/");
      const images = page.locator("img");
      const count = await images.count();
      for (let i = 0; i < count; i++) {
        const naturalWidth = await images.nth(i).evaluate((img: HTMLImageElement) => img.naturalWidth);
        expect(naturalWidth).toBeGreaterThan(0);
      }
    });
  });

  test.describe("CTA Footer", () => {
    test("shows 'Ready to add bookings to your app?' messaging", async ({ page }) => {
      await page.goto("/#install");
      const footer = page.locator("#install");
      await expect(footer).toContainText("Ready to add");
      await expect(footer).toContainText("bookings");
    });

    test("init command is listed first", async ({ page }) => {
      await page.goto("/#install");
      const commands = page.locator("#install .cta-command");
      const firstLabel = await commands.first().locator(".cta-command-label").textContent();
      expect(firstLabel).toContain("Quick Start");
    });

    test("all three install paths have working copy buttons", async ({ page, context }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.goto("/#install");
      const copyBtns = page.locator("#install .cta-copy-btn");
      expect(await copyBtns.count()).toBe(3);

      for (let i = 0; i < 3; i++) {
        await copyBtns.nth(i).click();
        await expect(copyBtns.nth(i)).toContainText("Copied");
        await page.waitForTimeout(100);
      }
    });

    test("footer shows NextAuth of Scheduling branding", async ({ page }) => {
      await page.goto("/#install");
      const footer = page.locator("#install");
      await expect(footer).toContainText("NextAuth of Scheduling");
    });
  });

  test.describe("Architecture Section", () => {
    test("displays NextAuth comparison callout", async ({ page }) => {
      await page.goto("/#architecture");
      const section = page.locator("#architecture");
      await expect(section).toContainText("getServerSession()");
      await expect(section).toContainText("getAvailableSlots()");
      await expect(section).toContainText("NextAuth Pattern");
    });

    test("shows three architecture layers", async ({ page }) => {
      await page.goto("/#architecture");
      const layers = page.locator(".arch-layer");
      expect(await layers.count()).toBe(3);
    });

    test("adapter swap table renders all 6 adapters", async ({ page }) => {
      await page.goto("/#architecture");
      const adapterRows = page.locator(".adapter-table tbody tr");
      expect(await adapterRows.count()).toBe(6);
    });
  });

  test.describe("Package Ecosystem Section", () => {
    test("shows all 5 packages", async ({ page }) => {
      await page.goto("/#packages");
      const section = page.locator("#packages");
      await expect(section).toContainText("@thebookingkit/core");
      await expect(section).toContainText("@thebookingkit/server");
      await expect(section).toContainText("@thebookingkit/db");
      await expect(section).toContainText("@thebookingkit/d1");
      await expect(section).toContainText("@thebookingkit/cli");
    });
  });

  test.describe("Boundary date handling", () => {
    test("booking calendar handles today's date correctly", async ({ page }) => {
      await page.goto("/#booking");
      const bookingSection = page.locator("#booking");
      const serviceCards = bookingSection.locator(".service-card");
      await expect(serviceCards.first()).toBeVisible({ timeout: 10_000 });
      await serviceCards.first().click();

      // Today's date cell should exist and be styled as "today"
      const todayCell = bookingSection.locator(".day-cell.today");
      await expect(todayCell).toBeVisible({ timeout: 5_000 });
    });

    test("past dates are not selectable in calendar", async ({ page }) => {
      await page.goto("/#booking");
      const bookingSection = page.locator("#booking");
      const serviceCards = bookingSection.locator(".service-card");
      await expect(serviceCards.first()).toBeVisible({ timeout: 10_000 });
      await serviceCards.first().click();

      // Past dates should have the "past" class
      const pastCells = bookingSection.locator(".day-cell.past");
      if (await pastCells.count() > 0) {
        // Clicking a past date should not produce slots
        await pastCells.first().click();
        await page.waitForTimeout(500);
        // No slot buttons should appear for past dates
        const slots = bookingSection.locator(".slot-btn");
        expect(await slots.count()).toBe(0);
      }
    });
  });

  test.describe("Live component previews", () => {
    test("all 6 preview components render", async ({ page }) => {
      await page.goto("/#components");
      const previews = page.locator('[data-testid="component-preview"]');
      await expect(previews.first()).toBeVisible({ timeout: 5_000 });
      expect(await previews.count()).toBe(6);
    });

    test("seats picker preview is interactive", async ({ page }) => {
      await page.goto("/#components");
      // Find the SeatsPicker preview and interact with it
      const seatsPreview = page.locator('[data-testid="component-preview"]').filter({ hasText: "SeatsPicker" });
      const reserveBtn = seatsPreview.getByRole("button", { name: "Reserve a Seat" });
      if (await reserveBtn.isVisible()) {
        await reserveBtn.click();
        // After clicking, available seats should decrease
        await expect(seatsPreview).toContainText("7 of 20"); // 13 booked after click
      }
    });

    test("time slot preview allows selection", async ({ page }) => {
      await page.goto("/#components");
      const slotPreview = page.locator('[data-testid="component-preview"]').filter({ hasText: "TimeSlotPicker" });
      const slotBtn = slotPreview.getByRole("button", { name: "9:00 AM" });
      if (await slotBtn.isVisible()) {
        await slotBtn.click();
        await expect(slotPreview).toContainText("Selected: 9:00 AM");
      }
    });

    test("availability editor preview toggles days", async ({ page }) => {
      await page.goto("/#components");
      const editorPreview = page.locator('[data-testid="component-preview"]').filter({ hasText: "AvailabilityEditor" });
      // Sunday should show "Unavailable" initially
      await expect(editorPreview).toContainText("Unavailable");
    });
  });
});
