import { expect as baseExpect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { admin, authUser } from "./support/auth-links";
import { isLocalTarget } from "./support/env";
import { mailCountFor, verificationLink, waitForMails } from "./support/mailbox";
import { LOCAL_DB_CONTAINER, testSql } from "./support/test-sql";
import {
  cleanupE2eUsers,
  createE2eUser,
  e2eEmail,
  listProjectsOf,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });

async function registerThroughUi(page: Page, email: string, password: string) {
  await page.goto("/register");
  await page.locator('input[name="email"]').fill(email);
  const fields = page.locator('input[type="password"]');
  await fields.nth(0).fill(password);
  await fields.nth(1).fill(password);
  await page.locator('form button[type="submit"]').click();
}

async function requestReset(page: Page, email: string) {
  await page.goto("/forgot-password");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText("Kiểm tra email")).toBeVisible();
}

async function userId(email: string) {
  const list = await admin().auth.admin.listUsers({ perPage: 200 });
  return list.data.users.find((u) => u.email === email)?.id;
}

async function hasSession(page: Page) {
  return page.evaluate(() =>
    Object.keys(localStorage).some((key) => key.includes("auth-token")),
  );
}

function neutralText(text: string, email: string) {
  return text.split(email).join("<email>");
}

test.describe("Email flows with a local mailbox", () => {
  test.skip(
    !isLocalTarget,
    "needs the local Supabase stack with a mailbox (E2E_TARGET=local)",
  );
  test.setTimeout(150_000);
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test("AUTH-001 registers a new account, sends a single-use verification email and keeps the password hashed", async ({
    page,
    browser,
  }) => {
    test.fail(
      true,
      "DFID054: after registering nobody is signed in; the page only asks to check the inbox, so the guest is not signed in as the case expects",
    );
    const email = e2eEmail("reg01");
    await registerThroughUi(page, email, "Passw0rd!");
    await expect(page.getByText("Kiểm tra email")).toBeVisible();
    expect.soft(await hasSession(page)).toBe(true);

    const row = testSql(
      `select (email_confirmed_at is null) || '|' || encrypted_password from auth.users where email = '${email}'`,
    );
    expect(row.startsWith("true|$2")).toBe(true);
    expect(row).not.toContain("Passw0rd!");

    const [mail] = await waitForMails(email, 1);
    const link = await verificationLink(mail.ID);
    await page.goto(link);
    await expect
      .poll(async () => (await authUser((await userId(email))!)).email_confirmed_at)
      .toBeTruthy();

    const reused = await browser.newContext();
    const again = await reused.newPage();
    await again.goto(link);
    await expect(again.getByText("Không đăng nhập được")).toBeVisible();
    await reused.close();

    await page.goto("/projects/new");
    await page.locator('input[name="name"]').fill("My First Song");
    await page.getByRole("button", { name: /^tạo dự án$/i }).click();
    const id = (await userId(email))!;
    await expect.poll(async () => (await listProjectsOf(id)).length).toBe(1);
    expect((await listProjectsOf(id))[0].visibility).toBe("private");
  });

  test("AUTH-008 still creates the account and offers a resend when the verification email cannot be sent", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID060: when the mail service is down registration fails with a generic error and no account is created, so there is nothing to resend",
    );
    const mailContainer = LOCAL_DB_CONTAINER.replace("supabase_db_", "supabase_inbucket_");
    const email = e2eEmail("down");
    execFileSync("docker", ["stop", mailContainer]);
    try {
      await registerThroughUi(page, email, "Passw0rd!");
      await expect(page.locator("main")).toContainText(
        /Kiểm tra email|Có lỗi xảy ra/,
      );
      await expect
        .soft(page.locator("main"))
        .not.toContainText("Có lỗi xảy ra");
    } finally {
      execFileSync("docker", ["start", mailContainer]);
    }
    expect.soft(await hasSession(page)).toBe(true);
    expect
      .soft(
        testSql(
          `select count(*) || '|' || coalesce(max((email_confirmed_at is null)::text), '') from auth.users where email = '${email}'`,
        ),
      )
      .toBe("1|true");
    await page.waitForTimeout(8_000);
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill("Passw0rd!");
    await page.locator('form button[type="submit"]').click();
    const resend = page.getByRole("button", {
      name: /gửi lại email xác nhận/i,
    });
    await expect(resend).toBeVisible({ timeout: 5_000 });
    await resend.click();
    await waitForMails(email, 1);
  });

  test("AUTH-009 accepts a password of exactly 8 characters and creates a pending account", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID054: after registering nobody is signed in; the page only asks to check the inbox, so the guest is not signed in as the case expects",
    );
    const email = e2eEmail("reg02");
    await registerThroughUi(page, email, "Abcd123!");
    await expect(page.getByText("Kiểm tra email")).toBeVisible();
    expect(
      testSql(
        `select email_confirmed_at is null from auth.users where email = '${email}'`,
      ),
    ).toBe("t");
    expect.soft(await hasSession(page)).toBe(true);
  });

  test("AUTH-016 invalidates the old verification link when the email is sent again", async ({
    page,
    browser,
  }) => {
    const email = e2eEmail("resend");
    await registerThroughUi(page, email, "Passw0rd!");
    const [first] = await waitForMails(email, 1);
    const oldLink = await verificationLink(first.ID);

    await page.waitForTimeout(1500);
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill("Passw0rd!");
    await page.locator('form button[type="submit"]').click();
    await page.getByRole("button", { name: /gửi lại email xác nhận/i }).click();
    const mails = await waitForMails(email, 2);
    const newLink = await verificationLink(mails[1].ID);

    const staleContext = await browser.newContext();
    const stale = await staleContext.newPage();
    await stale.goto(oldLink);
    await expect(stale.getByText("Không đăng nhập được")).toBeVisible();
    await staleContext.close();
    expect((await authUser((await userId(email))!)).email_confirmed_at).toBeFalsy();

    await page.goto(newLink);
    await expect
      .poll(async () => (await authUser((await userId(email))!)).email_confirmed_at)
      .toBeTruthy();
  });

  test("AUTH-035 sends a single-use reset link for a registered email and shows a neutral confirmation", async ({
    page,
    browser,
  }) => {
    const user = await createE2eUser();
    await requestReset(page, user.email);
    await expect(page.getByText(/Nếu .* đã đăng ký/)).toBeVisible();
    expect(
      testSql(
        `select (recovery_token <> '') from auth.users where email = '${user.email}'`,
      ),
    ).toBe("t");
    const [mail] = await waitForMails(user.email, 1);
    const link = await verificationLink(mail.ID);
    expect(link).toContain("type=recovery");

    const context = await browser.newContext();
    const reset = await context.newPage();
    await reset.goto(link);
    await expect(reset.locator('input[name="new-password"]')).toBeVisible();
    await context.close();
  });

  test("AUTH-036 invalidates the previous reset link when a new one is requested", async ({
    page,
    browser,
  }) => {
    const user = await createE2eUser();
    await requestReset(page, user.email);
    await page.waitForTimeout(1500);
    await requestReset(page, user.email);
    const mails = await waitForMails(user.email, 2);
    const first = await verificationLink(mails[0].ID);
    const second = await verificationLink(mails[1].ID);

    const staleContext = await browser.newContext();
    const stale = await staleContext.newPage();
    await stale.goto(first);
    await expect(
      stale.getByText("Link không hợp lệ hoặc đã hết hạn"),
    ).toBeVisible();
    await staleContext.close();

    const freshContext = await browser.newContext();
    const fresh = await freshContext.newPage();
    await fresh.goto(second);
    await expect(fresh.locator('input[name="new-password"]')).toBeVisible();
    await freshContext.close();
  });

  test("AUTH-038 gives an unregistered email the same confirmation and sends nothing", async ({
    page,
  }) => {
    const known = await createE2eUser();
    await requestReset(page, known.email);
    const knownText = neutralText(
      await page.locator("main").innerText(),
      known.email,
    );

    const unknown = e2eEmail("nobody");
    await requestReset(page, unknown);
    const unknownText = neutralText(
      await page.locator("main").innerText(),
      unknown,
    );
    expect(unknownText).toBe(knownText);

    await page.waitForTimeout(3000);
    expect(await mailCountFor(unknown)).toBe(0);
    expect(
      testSql(`select count(*) from auth.users where email = '${unknown}'`),
    ).toBe("0");
  });
});
