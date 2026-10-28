import { expect as baseExpect, test, type Page } from "@playwright/test";
import { UserApi } from "./support/api";
import {
  actionLink,
  admin,
  authUser,
  createPendingUser,
  passwordLoginStatus,
  pendingWithLink,
  resolveLink,
  tampered,
} from "./support/auth-links";
import { cleanupE2eUsers, createE2eUser, loginThroughUi } from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });

async function openVerification(page: Page, link: string) {
  await page.goto(await resolveLink(link, "/auth/callback"));
}

async function openReset(page: Page, link: string) {
  await page.goto(await resolveLink(link, "/reset-password"));
}

async function resetForm(page: Page) {
  await expect(page.locator('input[name="new-password"]')).toBeVisible();
}

async function submitReset(page: Page, password: string, confirm = password) {
  await page.locator('input[name="new-password"]').fill(password);
  await page.locator('input[name="confirm-password"]').fill(confirm);
  await page.locator('form button[type="submit"]').click();
}

async function userWithRecoveryLink() {
  const user = await createE2eUser();
  const link = await actionLink("recovery", user.email);
  return { user, link };
}

test.describe("Account email links", () => {
  test.setTimeout(150_000);
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test("AUTH-010 lets an unverified account log in and create private projects", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID054: an account whose email is not verified cannot log in at all; the login is refused with a request to confirm the email, so it can never create a private project",
    );
    const pending = await createPendingUser("pend");
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(pending.email);
    await page.locator('input[name="password"]').fill(pending.password);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL((url) => url.pathname === "/", {
      timeout: 10_000,
    });
    const api = await UserApi.for(pending);
    const project = await api.createProject("Unverified Song");
    await expect(
      api.setVisibility(project.id, "public"),
    ).rejects.toThrow();
  });

  test("AUTH-015 verifies the email with a valid link, confirms it and rejects the reused link", async ({
    page,
    browser,
  }) => {
    test.fail(
      true,
      "DFID055: opening a valid verification link signs the user in and shows the public home page; no confirmation message is shown and the user is not taken to the project dashboard",
    );
    const pending = await pendingWithLink("ver");
    expect((await authUser(pending.id)).email_confirmed_at).toBeFalsy();
    await openVerification(page, pending.link);
    await expect(page).toHaveURL((url) => url.pathname !== "/auth/callback");
    await expect
      .poll(async () => (await authUser(pending.id)).email_confirmed_at)
      .toBeTruthy();
    const reused = await browser.newContext();
    const again = await reused.newPage();
    await openVerification(again, pending.link);
    await expect(again.getByText(/đã hết hạn hoặc đã được dùng/i)).toBeVisible();
    await reused.close();
    const api = await UserApi.for(pending);
    const project = await api.createProject("Verified Song");
    await api.setVisibility(project.id, "public");
    expect.soft(new URL(page.url()).pathname).toBe("/projects");
    await expect
      .soft(page.getByText(/đã xác nhận|xác nhận thành công/i))
      .toBeVisible({ timeout: 5_000 });
  });

  test("AUTH-018 shows the same generic message for a tampered and an unknown verification link", async ({
    browser,
  }) => {
    const pending = await pendingWithLink("tam");
    const messages: string[] = [];
    for (const link of [
      tampered(pending.link),
      pending.link.replace(/token=[^&]+/, `token=${"f".repeat(56)}`),
    ]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await openVerification(page, link);
      const alert = page
        .getByRole("alert")
        .filter({ hasText: /Không đăng nhập được|Liên kết không còn dùng được/ });
      await expect(alert).toBeVisible();
      messages.push(await alert.innerText());
      await context.close();
    }
    expect(messages[0]).toBe(messages[1]);
    expect(messages[0]).toMatch(/hết hạn hoặc đã được dùng/i);
    expect((await authUser(pending.id)).email_confirmed_at).toBeFalsy();
  });

  test("AUTH-019 shows a neutral message when the link is opened for an already verified account", async ({
    page,
  }) => {
    const pending = await pendingWithLink("done");
    await admin().auth.admin.updateUserById(pending.id, { email_confirm: true });
    await openVerification(page, pending.link);
    await expect(page.getByText(/đã được xác nhận|đã xác nhận/i)).toBeVisible();
    await expect(page.getByText("Không đăng nhập được")).toHaveCount(0);
    expect((await authUser(pending.id)).email_confirmed_at).toBeTruthy();
  });

  test("AUTH-041 resets the password with a valid link and signs the user in", async ({
    page,
    browser,
  }) => {
    test.fail(
      true,
      "DFID009: after the reset the user lands on the public home page, not the project dashboard; DFID057: after the reset the other browser keeps its session instead of being asked to log in again",
    );
    const { user, link } = await userWithRecoveryLink();
    const second = await browser.newContext();
    const other = await second.newPage();
    await loginThroughUi(other, user);
    await openReset(page, link);
    await resetForm(page);
    await submitReset(page, "NewPassw0rd!");
    await expect(page).toHaveURL((url) => url.pathname !== "/reset-password");
    expect(await passwordLoginStatus(user.email, user.password)).toBe(400);
    expect(await passwordLoginStatus(user.email, "NewPassw0rd!")).toBe(200);
    const reused = await browser.newContext();
    const again = await reused.newPage();
    await openReset(again, link);
    await expect(
      again.getByText("Link không hợp lệ hoặc đã hết hạn"),
    ).toBeVisible();
    await reused.close();
    await other.reload();
    await expect
      .soft(other.getByRole("link", { name: /^đăng nhập$/i }).first())
      .toBeVisible({ timeout: 10_000 });
    await second.close();
    expect.soft(new URL(page.url()).pathname).toBe("/projects");
  });

  test("AUTH-043 rejects a reset link that was already used and keeps the new password", async ({
    page,
    browser,
  }) => {
    const { user, link } = await userWithRecoveryLink();
    await openReset(page, link);
    await resetForm(page);
    await submitReset(page, "NewPassw0rd!");
    await expect(page).toHaveURL((url) => url.pathname !== "/reset-password");
    const context = await browser.newContext();
    const again = await context.newPage();
    await openReset(again, link);
    await expect(
      again.getByText("Link không hợp lệ hoặc đã hết hạn"),
    ).toBeVisible();
    await expect(again.getByText(/trang Quên mật khẩu/i)).toBeVisible();
    await expect(again.locator('input[name="new-password"]')).toHaveCount(0);
    expect(await passwordLoginStatus(user.email, "NewPassw0rd!")).toBe(200);
    expect(await passwordLoginStatus(user.email, user.password)).toBe(400);
    await context.close();
  });

  test("AUTH-044 shows a generic invalid-link message and no form for a tampered reset link", async ({
    page,
  }) => {
    const { user, link } = await userWithRecoveryLink();
    await openReset(page, tampered(link));
    await expect(
      page.getByText("Link không hợp lệ hoặc đã hết hạn"),
    ).toBeVisible();
    await expect(page.locator('input[name="new-password"]')).toHaveCount(0);
    expect(await passwordLoginStatus(user.email, user.password)).toBe(200);
  });

  test("AUTH-045 rejects a new password of 7 characters and keeps the old one", async ({
    page,
  }) => {
    const { user, link } = await userWithRecoveryLink();
    await openReset(page, link);
    await resetForm(page);
    await submitReset(page, "Short1!");
    await expect(page.locator("p[role=alert]")).toHaveText(
      /ít nhất 8 ký tự/i,
    );
    await expect(page).toHaveURL(/\/reset-password/);
    expect(await passwordLoginStatus(user.email, user.password)).toBe(200);
  });

  test("AUTH-046 rejects mismatched new password fields and keeps the old password", async ({
    page,
  }) => {
    const { user, link } = await userWithRecoveryLink();
    await openReset(page, link);
    await resetForm(page);
    await submitReset(page, "NewPassw0rd!", "NewPassw0rd?");
    await expect(page.locator("p[role=alert]")).toHaveText(/không khớp/i);
    await expect(page).toHaveURL(/\/reset-password/);
    expect(await passwordLoginStatus(user.email, user.password)).toBe(200);
    expect(await passwordLoginStatus(user.email, "NewPassw0rd!")).toBe(400);
  });

  test("AUTH-048 accepts a new password of exactly 8 characters and logs in with it", async ({
    page,
    browser,
  }) => {
    const { user, link } = await userWithRecoveryLink();
    await openReset(page, link);
    await resetForm(page);
    await submitReset(page, "Abcd123!");
    await expect(page).toHaveURL((url) => url.pathname !== "/reset-password");
    expect(await passwordLoginStatus(user.email, "Abcd123!")).toBe(200);
    expect(await passwordLoginStatus(user.email, user.password)).toBe(400);
    const fresh = await browser.newContext();
    await loginThroughUi(await fresh.newPage(), {
      ...user,
      password: "Abcd123!",
    });
    await fresh.close();
  });
});
