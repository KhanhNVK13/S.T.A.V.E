import { expect, test, type Page } from "@playwright/test";
import {
  cleanupE2eUsers,
  countProjectsOf,
  createE2eProfile,
  createE2eProject,
  createE2eUser,
  e2eUserExists,
  fetchE2eProfile,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

async function userWithProfile(
  fields: { display_name?: string; username?: string; bio?: string } = {},
): Promise<E2eUser> {
  const user = await createE2eUser();
  await createE2eProfile(user, {
    display_name: "User A",
    username: `ua_${user.id.slice(0, 8)}`,
    bio: "Test bio",
    ...fields,
  });
  return user;
}

async function openProfile(page: Page, user: E2eUser) {
  await loginThroughUi(page, user);
  await page.goto("/profile");
  await expect(page.locator('input[name="displayName"]')).not.toHaveValue("");
}

async function openSecurity(page: Page, user: E2eUser) {
  await loginThroughUi(page, user);
  await page.goto("/profile");
  await page.getByRole("button", { name: /bảo mật/i }).click();
}

async function submitPasswordChange(page: Page, current: string, next: string) {
  await page.getByRole("button", { name: /^đổi mật khẩu$/i }).click();
  await page.locator('input[name="current-password"]').fill(current);
  await page.locator('input[name="new-password"]').fill(next);
  await page.getByRole("button", { name: /cập nhật mật khẩu/i }).click();
}

test.describe("Account settings", () => {
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test.describe("UC-15 Edit profile", () => {
    test("AUTH-059 blocks saving when the display name is empty", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID013: an empty display name is accepted and no required-field message is shown",
      );
      const user = await userWithProfile();
      await openProfile(page, user);
      await page.locator('input[name="displayName"]').fill("");
      await page.getByRole("button", { name: /lưu hồ sơ/i }).click();
      await expect(page.getByText(/bắt buộc|required/i)).toBeVisible();
      expect((await fetchE2eProfile(user.id))?.display_name).toBe("User A");
    });

    test("AUTH-060 blocks saving a username that another account uses", async ({
      page,
    }) => {
      const other = await userWithProfile({ username: "taken_name_e2e" });
      const user = await userWithProfile();
      const original = (await fetchE2eProfile(user.id))?.username;
      await openProfile(page, user);
      await page.locator('input[name="username"]').fill("taken_name_e2e");
      await page.getByRole("button", { name: /lưu hồ sơ/i }).click();
      await expect(
        page.getByText(/đã có người dùng|chọn tên khác/i),
      ).toBeVisible();
      expect((await fetchE2eProfile(user.id))?.username).toBe(original);
      expect((await fetchE2eProfile(other.id))?.username).toBe(
        "taken_name_e2e",
      );
    });

    test("AUTH-065 rejects a username with characters outside letters, numbers and underscores", async ({
      page,
    }) => {
      const user = await userWithProfile();
      const original = (await fetchE2eProfile(user.id))?.username;
      await openProfile(page, user);
      await page.locator('input[name="username"]').fill("alice tester!");
      await page.getByRole("button", { name: /lưu hồ sơ/i }).click();
      await expect(page.getByText(/chữ.*số.*gạch dưới/i)).toBeVisible();
      expect((await fetchE2eProfile(user.id))?.username).toBe(original);
    });
  });

  test.describe("UC-16 Change password", () => {
    test("AUTH-067 refuses a wrong current password and keeps the other browser signed in", async ({
      page,
      browser,
    }) => {
      const user = await userWithProfile();
      const second = await browser.newContext();
      const otherPage = await second.newPage();
      await loginThroughUi(otherPage, user);
      await openSecurity(page, user);
      await submitPasswordChange(page, "WrongPass1", "NewPassw0rd!");
      await expect(
        page.getByText(/mật khẩu hiện tại không đúng/i),
      ).toBeVisible();
      await otherPage.goto("/profile");
      await expect(otherPage).toHaveURL(/\/profile$/);
      await expect(
        otherPage.locator('input[name="displayName"]'),
      ).toBeVisible();
      await second.close();
    });

    test("AUTH-068 rejects a new password shorter than 8 characters", async ({
      page,
      browser,
    }) => {
      const user = await userWithProfile();
      await openSecurity(page, user);
      await submitPasswordChange(page, user.password, "Short1!");
      await expect(page.getByText(/ít nhất 8 ký tự/i)).toBeVisible();
      const fresh = await browser.newContext();
      await loginThroughUi(await fresh.newPage(), user);
      await fresh.close();
    });

    test("AUTH-070 asks for a different password when the new one equals the current one", async ({
      page,
      browser,
    }) => {
      const user = await userWithProfile();
      const second = await browser.newContext();
      const otherPage = await second.newPage();
      await loginThroughUi(otherPage, user);
      await openSecurity(page, user);
      await submitPasswordChange(page, user.password, user.password);
      await expect(page.locator("p.text-danger")).toContainText(
        /khác|different/i,
      );
      await otherPage.goto("/profile");
      await expect(otherPage).toHaveURL(/\/profile$/);
      await second.close();
    });

    test("AUTH-071 accepts a new password of exactly 8 characters", async ({
      page,
      browser,
    }) => {
      const user = await userWithProfile();
      await openSecurity(page, user);
      await submitPasswordChange(page, user.password, "Abcd123!");
      await expect(page.getByText(/đã đổi mật khẩu/i)).toBeVisible();
      const fresh = await browser.newContext();
      await loginThroughUi(await fresh.newPage(), {
        ...user,
        password: "Abcd123!",
      });
      await fresh.close();
    });
  });

  test.describe("UC-17 Delete account", () => {
    test("AUTH-074 refuses deletion when the password is wrong", async ({
      page,
    }) => {
      const user = await userWithProfile();
      await createE2eProject(user.id, "Delete Me Song");
      await openSecurity(page, user);
      await page.getByRole("button", { name: /^xoá tài khoản$/i }).click();
      await page.locator('input[name="password"]').fill("WrongPass1");
      await page
        .getByRole("button", { name: /xác nhận xoá vĩnh viễn/i })
        .click();
      await expect(page.getByText(/mật khẩu không đúng/i)).toBeVisible();
      await expect(
        page.getByRole("button", { name: /xác nhận xoá vĩnh viễn/i }),
      ).toBeVisible();
      expect(await e2eUserExists(user.id)).toBe(true);
      expect(await countProjectsOf(user.id)).toBe(1);
    });
  });
});
