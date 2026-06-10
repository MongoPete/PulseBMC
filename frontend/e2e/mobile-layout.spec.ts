import { test, expect } from "@playwright/test";
import path from "path";

const ARTIFACTS = path.join(__dirname, "mobile-artifacts");

/** No horizontal scroll — content fits the viewport width */
async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
}

test.describe("Mobile layout (iPhone)", () => {
  test.beforeAll(async () => {
    const fs = await import("fs");
    fs.mkdirSync(ARTIFACTS, { recursive: true });
  });

  test("fleet — bottom nav, grid, no overflow", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Fleet Overview" })).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Fleet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Guide" })).toBeVisible();

    await expect(page.locator("#led-device-001")).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalOverflow(page);

    await page.screenshot({ path: path.join(ARTIFACTS, "01-fleet.png"), fullPage: true });
  });

  test("fleet — tap device opens full-screen drawer", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#led-device-001")).toBeVisible({ timeout: 15_000 });
    await page.locator("#led-device-001").click();

    const drawer = page.locator("aside").filter({ hasText: "device-001" });
    await expect(drawer).toBeVisible();
    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize()!;
    expect(box!.width).toBeGreaterThan(viewport.width * 0.9);

    await page.screenshot({ path: path.join(ARTIFACTS, "02-fleet-drawer.png"), fullPage: false });
    await page.getByRole("button", { name: "Close device panel" }).click();
  });

  test("fleet — action sheet from menu button", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#led-device-001")).toBeVisible({ timeout: 15_000 });
    await page.locator("#led-device-001 button[aria-label*='Actions']").click();
    await expect(page.getByRole("button", { name: "Run Analysis" })).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACTS, "03-action-sheet.png"), fullPage: false });
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("alerts — layout fits viewport", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByRole("heading", { name: "Open Alerts" })).toBeVisible({
      timeout: 20_000,
    });
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: path.join(ARTIFACTS, "04-alerts.png"), fullPage: true });
  });

  test("explorer — stacked input and no overflow", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("heading", { name: "Telemetry Query" })).toBeVisible({
      timeout: 20_000,
    });
    await expectNoHorizontalOverflow(page);

    const askBtn = page.getByRole("button", { name: "Ask" });
    const input = page.getByPlaceholder(/Ask about loopback/i);
    await expect(askBtn).toBeVisible();
    await expect(input).toBeVisible();

    const askBox = await askBtn.boundingBox();
    const inputBox = await input.boundingBox();
    expect(askBox && inputBox).toBeTruthy();
    expect(askBox!.y).toBeGreaterThan(inputBox!.y);

    await page.screenshot({ path: path.join(ARTIFACTS, "05-explore.png"), fullPage: true });
  });

  test("architecture — layout fits viewport", async ({ page }) => {
    await page.goto("/architecture");
    await expect(page.getByRole("heading", { name: "How It Works" })).toBeVisible({
      timeout: 20_000,
    });
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: path.join(ARTIFACTS, "06-architecture.png"), fullPage: true });
  });

  test("bottom nav routes to all pages", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Alerts" }).click();
    await expect(page).toHaveURL(/\/alerts/);
    await page.getByRole("link", { name: "Explore" }).click();
    await expect(page).toHaveURL(/\/explore/);
    await page.getByRole("link", { name: "Guide" }).click();
    await expect(page).toHaveURL(/\/architecture/);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Fleet Overview" })).toBeVisible();
  });
});
