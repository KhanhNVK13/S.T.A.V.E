import { expect, test, type Page } from "@playwright/test";
import {
  cleanupE2eUsers,
  countAccountsWithEmail,
  createE2eProfile,
  createE2eUser,
  e2eEmail,
  loginThroughUi,
  TEST_PASSWORD,
} from "./support/test-user";

async function fillRegister(
  page: Page,
  email: string,
  password: string,
  confirmation: string,
) {
  await page.goto("/register");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="new-password"]').fill(password);
  await page.locator('input[name="confirm-password"]').fill(confirmation);
  await page.locator('form button[type="submit"]').click();
}

async function attemptLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
}

test.describe("Authentication and account", () => {
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test.describe("UC-01 Register with email", () => {
    test("AUTH-003 blocks registration when a required field is empty", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID008: empty required fields show only a browser tooltip, not an inline message beneath each field",
      );
      await page.goto("/register");
      await page.locator('form button[type="submit"]').click();
      await expect(
        page.getByText(/this field is required|bắt buộc|không được để trống/i),
      ).toHaveCount(3);
    });

    test("AUTH-004 blocks registration when the email format is invalid", async ({
      page,
    }) => {
      const email = "newuser01.stave.test";
      await fillRegister(page, email, "Passw0rd!", "Passw0rd!");
      await expect(page.locator('p[role="alert"]')).toBeVisible();
      expect(await countAccountsWithEmail(email)).toBe(0);
    });

    test("AUTH-005 blocks registration when the password is shorter than 8 characters", async ({
      page,
    }) => {
      const email = e2eEmail("reg5");
      await fillRegister(page, email, "Pass12!", "Pass12!");
      await expect(page.locator('p[role="alert"]')).toContainText(/8/);
      expect(await countAccountsWithEmail(email)).toBe(0);
    });

    test("AUTH-006 blocks registration when the two password fields do not match", async ({
      page,
    }) => {
      const email = e2eEmail("reg6");
      await fillRegister(page, email, "Passw0rd!", "Passw0rd?");
      await expect(page.locator('p[role="alert"]')).toContainText(/khớp/i);
      expect(await countAccountsWithEmail(email)).toBe(0);
    });

    test("AUTH-007 refuses an email that is already registered", async ({
      page,
    }) => {
      const existing = await createE2eUser();
      await fillRegister(page, existing.email, "Passw0rd!", "Passw0rd!");
      await expect(page.locator('p[role="alert"]')).toContainText(
        /đã được đăng ký/i,
      );
      await expect(page.locator('p[role="alert"]')).not.toContainText(
        /verified|xác nhận|google/i,
      );
      expect(await countAccountsWithEmail(existing.email)).toBe(1);
    });
  });

  test.describe("UC-04 Login", () => {
    test("AUTH-021 logs in with a correct email and password and shows the Project Dashboard", async ({
      page,
    }) => {
      const user = await createE2eUser();
      await createE2eProfile(user);
      await attemptLogin(page, user.email, user.password);
      await page.waitForURL((url) => url.pathname !== "/login");
      await expect(page).toHaveURL(/\/projects$/);
    });

    test("AUTH-021 step 4 returns to the page that required login", async ({
      page,
    }) => {
      const user = await createE2eUser();
      await createE2eProfile(user);
      await page.goto("/login?redirect=%2Fprofile");
      await page.locator('input[name="email"]').fill(user.email);
      await page.locator('input[name="password"]').fill(user.password);
      await page.locator('form button[type="submit"]').click();
      await expect(page).toHaveURL(/\/profile$/);
    });

    test("AUTH-023 opens the Forgot Password screen from the Login screen", async ({
      page,
    }) => {
      await page.goto("/login");
      await page.getByRole("link", { name: /quên mật khẩu/i }).click();
      await expect(page).toHaveURL(/\/forgot-password$/);
      const storedSession = await page.evaluate(() =>
        Object.keys(window.localStorage).filter((key) =>
          /session|auth-token/i.test(key),
        ),
      );
      expect(storedSession).toEqual([]);
    });

    test("AUTH-024 gives one combined message for a wrong password and an unknown email", async ({
      page,
    }) => {
      const user = await createE2eUser();
      await attemptLogin(page, user.email, "WrongPass1");
      const wrongPassword = await page.locator('p[role="alert"]').innerText();
      await attemptLogin(page, e2eEmail("nobody"), TEST_PASSWORD);
      const unknownEmail = await page.locator('p[role="alert"]').innerText();
      expect(wrongPassword).toBe(unknownEmail);
      expect(wrongPassword).toMatch(/email hoặc mật khẩu/i);
      await expect(page).toHaveURL(/\/login$/);
    });

    test("AUTH-026 refuses a suspended account and directs the user to support", async ({
      page,
    }) => {
      const user = await createE2eUser();
      await createE2eProfile(user, { status: "suspended" });
      await attemptLogin(page, user.email, user.password);
      await expect(page.locator('p[role="alert"]')).toContainText(
        /liên hệ|hỗ trợ|support/i,
      );
    });

    test("AUTH-028 logs in after four failed attempts and shows the Project Dashboard", async ({
      page,
    }) => {
      const user = await createE2eUser();
      await createE2eProfile(user);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await attemptLogin(page, user.email, "WrongPass1");
        await expect(page.locator('p[role="alert"]')).toBeVisible();
      }
      await attemptLogin(page, user.email, user.password);
      await page.waitForURL((url) => url.pathname !== "/login");
      await expect(page).toHaveURL(/\/projects$/);
    });
  });

  test.describe("UC-06 Forgot password", () => {
    test("AUTH-037 rejects an empty or malformed email inline", async ({
      page,
    }) => {
      await page.goto("/forgot-password");
      await page.locator('form button[type="submit"]').click();
      await expect(page.locator('p[role="alert"]')).toBeVisible();
      await page.locator('input[name="email"]').fill("usera.stave.test");
      await page.locator('form button[type="submit"]').click();
      await expect(page.locator('p[role="alert"]')).toBeVisible();
    });
  });

  test.describe("UC-14 View profile", () => {
    test("AUTH-052 shows the stored profile on the Profile tab", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID011: the public profile address derived from the username is not shown on the Profile tab",
      );
      const user = await createE2eUser();
      await createE2eProfile(user, {
        display_name: "User A",
        username: "user_a_e2e",
        bio: "Test bio",
      });
      await loginThroughUi(page, user);
      await page.goto("/profile");
      await expect(page.locator('input[name="displayName"]')).toHaveValue(
        "User A",
      );
      await expect(page.locator('input[name="username"]')).toHaveValue(
        "user_a_e2e",
      );
      await expect(page.locator('textarea[name="bio"]')).toHaveValue(
        "Test bio",
      );
      await expect(page.getByText(/user_a_e2e/).first()).toBeVisible();
      await expect(page.getByText(/\/creator\/|public profile/i)).toBeVisible();
    });

    test("AUTH-053 opens the Security tab with the password form", async ({
      page,
    }) => {
      const user = await createE2eUser();
      await createE2eProfile(user);
      await loginThroughUi(page, user);
      await page.goto("/profile");
      await page.getByRole("button", { name: /bảo mật/i }).click();
      await expect(
        page.getByRole("button", { name: /đổi mật khẩu/i }),
      ).toBeVisible();
    });

    test("AUTH-054 opens the Personalization tab with the preset themes", async ({
      page,
    }) => {
      const user = await createE2eUser();
      await createE2eProfile(user);
      await loginThroughUi(page, user);
      await page.goto("/profile");
      await page.getByRole("button", { name: /cá nhân hoá/i }).click();
      for (const preset of ["unleashed", "moss", "claret"]) {
        await expect(
          page.getByRole("button", { name: new RegExp(preset, "i") }),
        ).toBeVisible();
      }
    });

    test("AUTH-055 shows a retry message when the profile cannot be loaded", async ({
      page,
    }) => {
      const user = await createE2eUser();
      await createE2eProfile(user, { display_name: "User A" });
      await page.route("**/users/me", (route) =>
        route.fulfill({ status: 500, body: "{}" }),
      );
      await page.goto("/login");
      await page.locator('input[name="email"]').fill(user.email);
      await page.locator('input[name="password"]').fill(user.password);
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL((url) => url.pathname !== "/login");
      await page.goto("/profile");
      await expect(
        page.getByRole("button", { name: /thử lại|retry/i }),
      ).toBeVisible();
      await expect(page.locator('input[name="displayName"]')).toHaveCount(0);
    });
  });
});
