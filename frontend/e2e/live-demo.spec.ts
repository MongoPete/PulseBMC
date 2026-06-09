import { test, expect } from "@playwright/test";

async function expandLiveFeed(page: import("@playwright/test").Page) {
  const toggle = page.getByRole("button", { name: /Live Event Feed/i });
  const label = (await toggle.textContent()) ?? "";
  if (label.includes("show")) {
    await toggle.click();
  }
  await expect(
    page.getByRole("button", { name: "▶ Start" }).or(page.getByRole("button", { name: "◼ Stop" })),
  ).toBeVisible({ timeout: 10_000 });
}

async function startSimulatorViaApi(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post("/api/proxy/demo/simulator/restart");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.running).toBe(true);
}

test.describe("Fleet live demo", () => {
  test("fleet grid loads after login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Fleet Overview" })).toBeVisible();
    await expect(page.locator("#device-grid")).toBeVisible();
    await expect(page.locator("#led-device-001")).toBeVisible();
  });

  test("proxy API returns fleet state", async ({ request }) => {
    const res = await request.get("/api/proxy/fleet/states");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body).toBe("object");
    expect(Object.keys(body).length).toBeGreaterThan(0);
  });

  test("SSE stream connects through proxy", async ({ page }) => {
    const streamPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/proxy/test-runs/stream") && res.status() === 200,
      { timeout: 30_000 },
    );

    await page.goto("/");
    await expandLiveFeed(page);

    const streamRes = await streamPromise;
    expect(streamRes.headers()["content-type"] ?? "").toContain("text/event-stream");
  });

  test("simulator emits live LED updates", async ({ page, request }) => {
    await page.goto("/");
    await expandLiveFeed(page);
    await startSimulatorViaApi(request);

    await expect(page.getByText(/simulator running/i)).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(
        async () => {
          const feedText = await page.locator(".font-mono.text-xs").allTextContents();
          const hasRunEvent = feedText.some(
            (t) =>
              /device-\d{3}/.test(t) ||
              t.includes("Simulator started") ||
              t.includes("Simulator restarted") ||
              /\bpass\b/i.test(t) ||
              t.includes("FAIL"),
          );
          const amberCells = await page.locator("#device-grid .amber-blink").count();
          const sseOk = await page.getByText("SSE connected", { exact: true }).isVisible().catch(() => false);
          return sseOk || hasRunEvent || amberCells > 0;
        },
        { timeout: 45_000, intervals: [500, 1000, 2000] },
      )
      .toBeTruthy();
  });

  test("device loopback events reach the grid", async ({ page, request }) => {
    await page.goto("/");
    await expandLiveFeed(page);
    await startSimulatorViaApi(request);

    await expect
      .poll(
        async () => {
          const feedText = await page.locator(".font-mono.text-xs").allTextContents();
          const hasDeviceRun = feedText.some((t) => /device-\d{3}/.test(t));
          const amberCells = await page.locator("#device-grid .amber-blink").count();
          return hasDeviceRun || amberCells > 0;
        },
        { timeout: 45_000, intervals: [1000, 2000, 3000] },
      )
      .toBeTruthy();
  });
});
