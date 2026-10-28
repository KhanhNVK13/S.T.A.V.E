import { expect as baseExpect, test, type Page } from "@playwright/test";
import { UserApi } from "./support/api";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });

async function drawNote(page: Page, bar: number) {
  const x = 334 + (bar - 1) * 115.2 + 6;
  await page.mouse.move(x, 330);
  await page.mouse.down();
  await page.mouse.move(x + 50, 330, { steps: 4 });
  await page.mouse.up();
}

async function logOutFromMenu(page: Page) {
  await page.getByRole("button", { name: /user a/i }).first().click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
}

async function userWithProject() {
  const user = await createE2eUser();
  await createE2eProfile(user, { display_name: "User A" });
  const api = await UserApi.for(user);
  const p = await api.createProject("Test Song");
  await api.putDraft(p.id, [{ id: "n1" }]);
  await api.commit(p.branchId, "Verse idea");
  return { user, api, ...p };
}

test.describe("Account, further cases", () => {
  test.setTimeout(180_000);
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test("AUTH-049 logs out with an uncommitted change and keeps the draft without a commit", async ({
    page,
    browser,
  }) => {
    test.fail(
      true,
      "DFID050: logging out from the editor ends on the login page, not on the landing page; DFID051: logging out signs the user out of every other device as well, the second browser loses its session",
    );
    const { user, api, id, branchId } = await userWithProject();
    await loginThroughUi(page, user);
    const second = await browser.newContext();
    const other = await second.newPage();
    await loginThroughUi(other, user);

    await page.goto(`/projects/${id}/edit`);
    await expect(page.getByText("Verse idea").first()).toBeVisible();
    await drawNote(page, 2);
    await expect.poll(async () => (await api.draft(id)).notes.length).toBe(2);
    await logOutFromMenu(page);
    await page.waitForURL(
      (url) => url.pathname === "/" || url.pathname === "/login",
    );
    expect.soft(new URL(page.url()).pathname).toBe("/");

    await other.goto("/profile/sessions");
    await expect.soft(other.getByText("Thiết bị này")).toHaveCount(1);
    await expect
      .soft(other.getByRole("button", { name: "Đăng xuất" }))
      .toHaveCount(0);
    await expect
      .soft(other.getByText(/hết hạn|đăng nhập lại/i))
      .toHaveCount(0);

    await loginThroughUi(page, user);
    await page.goto(`/projects/${id}/edit`);
    await expect(page.getByText("Verse idea").first()).toBeVisible();
    await expect(page.getByText("2 note").first()).toBeVisible();
    const fresh = await UserApi.for(user);
    expect(await fresh.history(branchId)).toHaveLength(1);
    expect((await fresh.draft(id)).notes).toHaveLength(2);
    await second.close();
  });

  test("AUTH-051 warns before logging out when the draft cannot be saved", async ({
    page,
    context,
  }) => {
    test.fail(
      true,
      "DFID049: logging out while offline with an unsaved note shows no warning and asks for no confirmation",
    );
    const { user, id } = await userWithProject();
    await loginThroughUi(page, user);
    await page.goto(`/projects/${id}/edit`);
    await expect(page.getByText("Verse idea").first()).toBeVisible();
    await context.setOffline(true);
    await drawNote(page, 3);
    await page.getByRole("button", { name: /user a/i }).first().click();
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    const warning = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await expect(warning).toBeVisible({ timeout: 5_000 });
    await expect(warning).toContainText(/mất|chưa lưu/i);
    await context.setOffline(false);
  });
});
