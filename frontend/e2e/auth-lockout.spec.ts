import { expect as baseExpect, test, type Page } from "@playwright/test";
import { admin } from "./support/auth-links";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  type E2eUser,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });

async function submitLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
}

async function failFiveTimes(page: Page, user: E2eUser) {
  for (let i = 0; i < 5; i += 1) {
    await submitLogin(page, user.email, "Wrong-Password-000!");
    await expect(page.getByRole("alert").first()).toBeVisible();
  }
}

test.describe("Login lockout", () => {
  test.setTimeout(240_000);
  test.afterEach(async () => {
    await admin().from("login_attempts").delete().like("email", "e2e-%");
    await cleanupE2eUsers();
  });

  test("AUTH-025 blocks the login after 5 consecutive failed attempts", async ({ page }) => {
    const user = await createE2eUser();
    await createE2eProfile(user);
    await failFiveTimes(page, user);
    await submitLogin(page, user.email, user.password);
    await expect(page.getByRole("alert").first()).toContainText("sai quá nhiều lần");
    await expect(page).toHaveURL(/\/login/);
  });

  test("AUTH-029 lifts the lockout automatically after 15 minutes", async ({ page }) => {
    const user = await createE2eUser();
    await createE2eProfile(user);
    await failFiveTimes(page, user);
    const past = new Date(Date.now() - 60_000).toISOString();
    await admin().from("login_attempts").update({ locked_until: past }).eq("email", user.email.toLowerCase());
    await submitLogin(page, user.email, user.password);
    await page.waitForURL((url) => url.pathname !== "/login");
    expect(new URL(page.url()).pathname).not.toBe("/login");
  });
});
