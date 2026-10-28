import { expect as baseExpect, test } from "@playwright/test";
import {
  actionLink,
  authUser,
  passwordLoginStatus,
  pendingWithLink,
  resolveLink,
} from "./support/auth-links";
import { ageLink } from "./support/test-sql";
import { cleanupE2eUsers, createE2eUser } from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });

async function recoveryAged(minutes: number) {
  const user = await createE2eUser();
  const link = await actionLink("recovery", user.email);
  ageLink(user.email, "recovery_sent_at", minutes);
  return { user, link };
}

test.describe("Email link expiry and email failure", () => {
  test.setTimeout(150_000);
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test("AUTH-017 rejects a verification link older than 24 hours and offers a new verification email", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID058: the expired verification link page only offers a new password reset link; it offers no way to send a new verification email",
    );
    const pending = await pendingWithLink("old");
    ageLink(pending.email, "confirmation_sent_at", 25 * 60);
    await page.goto(await resolveLink(pending.link, "/auth/callback"));
    await expect(page.getByText("Không đăng nhập được")).toBeVisible();
    await expect(page.getByText(/hết hạn/i).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /gửi lại.*xác nhận|xác nhận.*gửi lại/i }),
    ).toBeVisible({ timeout: 5_000 });
    expect((await authUser(pending.id)).email_confirmed_at).toBeFalsy();
  });

  test("AUTH-020 accepts a verification link that is 23 hours 59 minutes old", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID059: a verification link stops working after 1 hour (the Supabase default), not after 24 hours",
    );
    const pending = await pendingWithLink("edge");
    ageLink(pending.email, "confirmation_sent_at", 23 * 60 + 59);
    await page.goto(await resolveLink(pending.link, "/auth/callback"));
    await expect
      .poll(async () => (await authUser(pending.id)).email_confirmed_at, {
        timeout: 15_000,
      })
      .toBeTruthy();
  });

  test("AUTH-042 rejects a reset link that is 61 minutes old and shows no form", async ({
    page,
  }) => {
    const { user, link } = await recoveryAged(61);
    await page.goto(await resolveLink(link, "/reset-password"));
    await expect(
      page.getByText("Link không hợp lệ hoặc đã hết hạn"),
    ).toBeVisible();
    await expect(page.getByText(/trang Quên mật khẩu/i)).toBeVisible();
    await expect(page.locator('input[name="new-password"]')).toHaveCount(0);
    expect(await passwordLoginStatus(user.email, user.password)).toBe(200);
  });

  test("AUTH-047 accepts a reset link that is 59 minutes old and saves the new password", async ({
    page,
  }) => {
    const { user, link } = await recoveryAged(59);
    await page.goto(await resolveLink(link, "/reset-password"));
    await expect(page.locator('input[name="new-password"]')).toBeVisible();
    await page.locator('input[name="new-password"]').fill("NewPassw0rd!");
    await page.locator('input[name="confirm-password"]').fill("NewPassw0rd!");
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL((url) => url.pathname !== "/reset-password");
    expect(await passwordLoginStatus(user.email, "NewPassw0rd!")).toBe(200);
    expect(await passwordLoginStatus(user.email, user.password)).toBe(400);
  });

  test("AUTH-040 asks the user to try again when the reset email cannot be sent", async ({
    page,
  }) => {
    const user = await createE2eUser();
    await page.route(
      (url) => url.pathname === "/auth/v1/recover",
      (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            code: "unexpected_failure",
            msg: "Error sending recovery email",
          }),
        }),
    );
    await page.goto("/forgot-password");
    await page.locator('input[name="email"]').fill(user.email);
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator("p[role=alert]")).toHaveText(/thử lại/i);
    await expect(page.getByText(/đã gửi link/i)).toHaveCount(0);
    expect(await passwordLoginStatus(user.email, user.password)).toBe(200);
  });
});
