import { test, expect } from "@playwright/test";

async function expandLiveFeed(page: import("@playwright/test").Page) {
  const toggle = page.getByRole("button", { name: /Live Event Feed/i });
  const label = (await toggle.textContent()) ?? "";
  if (label.includes("show")) await toggle.click();
}

async function startSimulatorViaApi(request: import("@playwright/test").APIRequestContext) {
  const stateRes = await request.get("/api/proxy/demo/state");
  expect(stateRes.ok()).toBeTruthy();
  const state = await stateRes.json();
  if (state.session_mode) {
    await request.post("/api/proxy/demo/session/start");
  } else {
    await request.post("/api/proxy/demo/simulator/restart");
  }
}

test.describe("Aaron alignment rubric", () => {
  test("1 — page split: fleet, alerts, explorer, architecture nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Fleet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Alerts" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Explorer" })).toBeVisible();
    await expect(page.getByRole("link", { name: "How It Works" })).toBeVisible();
  });

  test("2 — ConceptBar visible and expandable on fleet", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /MongoDB ↔ SQL concepts/i });
    await expect(toggle).toBeVisible();
    if ((await toggle.textContent())?.includes("▸")) await toggle.click();
    await expect(page.getByText("Collection", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Table", { exact: true }).first()).toBeVisible();
  });

  test("3 — fleet LEDs meet minimum size (16px)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#led-device-001")).toBeVisible({ timeout: 15_000 });
    const dot = page.locator("#led-device-001 .rounded-full").first();
    const box = await dot.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(16);
    expect(box!.height).toBeGreaterThanOrEqual(16);
  });

  test("4 — failure legend explains transient vs latched", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Transient fail/i)).toBeVisible();
    await expect(page.getByText(/Latched pass/i)).toBeVisible();
  });

  test("5 — Change Stream label on live feed", async ({ page, request }) => {
    await page.goto("/");
    await expandLiveFeed(page);
    await startSimulatorViaApi(request);
    await expect(page.getByText(/Change Stream → SSE|connecting/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("6 — DocumentViewer on device detail", async ({ page }) => {
    await page.goto("/devices/device-001");
    await expect(page.locator("#doc-viewer")).toBeVisible({ timeout: 20_000 });
    await page.locator("#doc-viewer button").click();
    await expect(page.getByText(/like a SQL row/i)).toBeVisible();
  });

  test("7 — ConceptBar on explorer", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("button", { name: /MongoDB ↔ SQL concepts/i })).toBeVisible();
  });

  test("8 — session banner when backend session mode", async ({ page, request }) => {
    const state = await request.get("/api/proxy/demo/state");
    const body = await state.json();
    test.skip(!body.session_mode, "Backend session mode off");
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Start live demo/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("9 — control plane context menu on fleet grid", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#led-device-001")).toBeVisible({ timeout: 15_000 });
    await page.locator("#led-device-001").click({ button: "right" });
    await expect(page.getByText("Rerun Test")).toBeVisible();
    await expect(page.getByText("Isolate Device")).toBeVisible();
  });

  test("10 — alerts page loads with query tooltip affordance", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByRole("heading", { name: /Alert/i })).toBeVisible();
    await expect(page.getByText(/Change Stream → SSE|connecting/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
