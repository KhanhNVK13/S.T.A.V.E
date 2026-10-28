import { expect, test } from "@playwright/test";
import {
  cleanupE2eUsers,
  createE2eUser,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

test.describe("Smoke", () => {
  let user: E2eUser;

  test.beforeAll(async () => {
    user = await createE2eUser();
  });

  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test("SMOKE-01 the home page loads", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveTitle(/STAVE/);
  });

  test("SMOKE-02 the login page shows the sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test("SMOKE-03 a user can sign in through the interface and reach the project list", async ({
    page,
  }) => {
    await loginThroughUi(page, user);
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("SMOKE-04 a signed-out visitor is sent away from the project list", async ({
    page,
  }) => {
    await page.goto("/projects");
    await expect(page).not.toHaveURL(/\/projects$/);
  });
});
