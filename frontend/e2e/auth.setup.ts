import { test as setup, expect } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, ".auth/user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_DEMO_USER;
  const password = process.env.E2E_DEMO_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Set E2E_DEMO_USER and E2E_DEMO_PASSWORD — use demopete@test.com when DEMO_USER_2 is configured on prod",
    );
  }

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Fleet Overview" })).toBeVisible({
    timeout: 30_000,
  });

  await page.context().storageState({ path: authFile });
});
