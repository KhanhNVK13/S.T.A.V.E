import { expect, test, type Page } from "@playwright/test";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eProject,
  countCommitsOfProject,
  createE2eUser,
  listProjectsOf,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

const API = ":3101";

async function signedIn(page: Page): Promise<E2eUser> {
  const user = await createE2eUser();
  await createE2eProfile(user);
  await loginThroughUi(page, user);
  return user;
}

async function createViaForm(page: Page, name: string) {
  await page.goto("/projects/new");
  await page.locator('input[name="name"]').fill(name);
  await page.getByRole("button", { name: /^tạo dự án$/i }).click();
}

function failApi(page: Page, method: string, pathPattern: RegExp) {
  return page.route(
    (url) => url.href.includes(API) && pathPattern.test(url.pathname),
    (route) =>
      route.request().method() === method
        ? route.fulfill({ status: 500, body: "{}" })
        : route.continue(),
  );
}

test.describe("Project management", () => {
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test.describe("UC-18 Create project", () => {
    test("PRJ-001 creates an empty private project and opens it in the editor", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID017: after creating a project the app returns to the project list instead of opening the MIDI Editor",
      );
      const user = await signedIn(page);
      await createViaForm(page, "New Demo");
      await expect(page).toHaveURL(/\/projects\/[^/]+\/edit$/);
      const [project] = await listProjectsOf(user.id);
      expect(project.visibility).toBe("private");
    });

    test("PRJ-003 shows an inline error when the project name is empty", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID018: the Create button is only disabled for an empty name and no message says the name is required",
      );
      const user = await signedIn(page);
      await page.goto("/projects/new");
      await page.locator('input[name="name"]').fill("");
      await page
        .getByRole("button", { name: /^tạo dự án$/i })
        .click({ force: true });
      await expect(page.getByText(/bắt buộc|required/i)).toBeVisible();
      expect(await listProjectsOf(user.id)).toHaveLength(0);
    });

    test("PRJ-004 rejects a project name of 101 characters", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID019: names up to 120 characters are accepted, so a 101-character name is created",
      );
      const user = await signedIn(page);
      await createViaForm(page, "a".repeat(101));
      await expect(page.getByText(/tối đa 100|too long/i)).toBeVisible();
      expect(await listProjectsOf(user.id)).toHaveLength(0);
    });

    test("PRJ-006 reports a server error and leaves no project behind", async ({
      page,
    }) => {
      const user = await signedIn(page);
      await failApi(page, "POST", /^\/projects$/);
      await createViaForm(page, "Fail Demo");
      await expect(page.getByText(/không tạo được dự án/i)).toBeVisible();
      expect(await listProjectsOf(user.id)).toHaveLength(0);
    });

    test("PRJ-007 accepts project names of 1 and 100 characters", async ({
      page,
    }) => {
      const user = await signedIn(page);
      const long = "b".repeat(100);
      await createViaForm(page, "A");
      await page.waitForURL(/\/projects$/);
      await createViaForm(page, long);
      await page.waitForURL(/\/projects$/);
      const names = (await listProjectsOf(user.id)).map((p) => p.name);
      expect(names.sort()).toEqual(["A", long].sort());
      await expect(page.getByText(long)).toBeVisible();
    });

    test("PRJ-008 allows two projects of the same user to share a name", async ({
      page,
    }) => {
      const user = await signedIn(page);
      await createE2eProject(user.id, "Test Song");
      await createViaForm(page, "Test Song");
      await page.waitForURL(/\/projects$/, { timeout: 8000 });
      expect(await listProjectsOf(user.id)).toHaveLength(2);
    });
  });

  test.describe("UC-19 Edit project details", () => {
    test("PRJ-009 saves a new name and description", async ({ page }) => {
      const user = await signedIn(page);
      const id = await createE2eProject(user.id, "Test Song");
      const commitsBefore = await countCommitsOfProject(id);
      await page.goto(`/projects/${id}/settings`);
      await expect(page.locator('input[name="name"]')).toHaveValue("Test Song");
      await page.locator('input[name="name"]').fill("Test Song v2");
      await page
        .locator('textarea[name="description"]')
        .fill("Updated description");
      await page.getByRole("button", { name: /lưu thay đổi/i }).click();
      await expect(page.getByRole("status")).toContainText(/đã lưu/i);
      await page.goto("/projects");
      await expect(page.getByText("Test Song v2")).toBeVisible();
      const [project] = await listProjectsOf(user.id);
      expect(project.name).toBe("Test Song v2");
      expect(await countCommitsOfProject(id)).toBe(commitsBefore);
    });

    test("PRJ-011 shows an inline error when the new name is empty", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID018: the Save button is only disabled for an empty name and no message says the name is required",
      );
      const user = await signedIn(page);
      const id = await createE2eProject(user.id, "Test Song");
      await page.goto(`/projects/${id}/settings`);
      await page.locator('input[name="name"]').fill("");
      await page
        .getByRole("button", { name: /lưu thay đổi/i })
        .click({ force: true });
      await expect(page.getByText(/bắt buộc|required/i)).toBeVisible();
      expect((await listProjectsOf(user.id))[0].name).toBe("Test Song");
    });

    test("PRJ-012 rejects a new name of 101 characters", async ({ page }) => {
      test.fail(
        true,
        "DFID019: names up to 120 characters are saved, so a 101-character name is accepted",
      );
      const user = await signedIn(page);
      const id = await createE2eProject(user.id, "Test Song");
      await page.goto(`/projects/${id}/settings`);
      await page.locator('input[name="name"]').fill("c".repeat(101));
      await page.getByRole("button", { name: /lưu thay đổi/i }).click();
      await expect(page.getByText(/tối đa 100|too long/i)).toBeVisible();
      expect((await listProjectsOf(user.id))[0].name).toBe("Test Song");
    });

    test("PRJ-015 saves names of 1 and 100 characters", async ({ page }) => {
      const user = await signedIn(page);
      const id = await createE2eProject(user.id, "Test Song");
      await page.goto(`/projects/${id}/settings`);
      await page.locator('input[name="name"]').fill("A");
      await page.getByRole("button", { name: /lưu thay đổi/i }).click();
      await expect(page.getByRole("status")).toContainText(/đã lưu/i);
      const long = "d".repeat(100);
      await page.locator('input[name="name"]').fill(long);
      await page.getByRole("button", { name: /lưu thay đổi/i }).click();
      await expect(page.getByRole("status")).toContainText(/đã lưu/i);
      expect((await listProjectsOf(user.id))[0].name).toBe(long);
    });
  });

  test.describe("UC-20 Archive project", () => {
    test("PRJ-017 keeps the project active when the archive confirmation is cancelled", async ({
      page,
    }) => {
      const user = await signedIn(page);
      await createE2eProject(user.id, "Test Song", "public");
      await page.goto("/projects");
      await page.getByRole("button", { name: /^lưu trữ$/i }).click();
      await page.getByRole("button", { name: /^huỷ$/i }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await expect(page.getByText("Test Song")).toBeVisible();
      expect((await listProjectsOf(user.id))[0].archived_at).toBeNull();
    });

    test("PRJ-021 reports a server error and keeps the project active", async ({
      page,
    }) => {
      const user = await signedIn(page);
      await createE2eProject(user.id, "Test Song", "public");
      await failApi(page, "PATCH", /\/archive$/);
      await page.goto("/projects");
      await page.getByRole("button", { name: /^lưu trữ$/i }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: /^lưu trữ$/i })
        .click();
      await expect(page.getByText(/không lưu trữ được/i)).toBeVisible();
      const [project] = await listProjectsOf(user.id);
      expect(project.archived_at).toBeNull();
      expect(project.visibility).toBe("public");
    });
  });

  test.describe("UC-21 Delete project", () => {
    async function openDelete(page: Page, name = "Test Song") {
      const user = await signedIn(page);
      const id = await createE2eProject(user.id, name);
      await page.goto(`/projects/${id}/settings`);
      await page.getByRole("button", { name: /xóa dự án/i }).click();
      return { user, id };
    }

    test("PRJ-023 deletes a project after typing its name and states what is lost", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID021: the delete dialog does not state the number of commits and branches that will be lost",
      );
      const { user } = await openDelete(page);
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText(/\d+\s*(commit|phiên bản)/i);
      await dialog.locator("input").fill("Test Song");
      await dialog.getByRole("button", { name: /xóa vĩnh viễn/i }).click();
      await page.waitForURL(/\/projects$/);
      expect(await listProjectsOf(user.id)).toHaveLength(0);
    });

    test("PRJ-024 keeps the project when the delete dialog is cancelled", async ({
      page,
    }) => {
      const { user } = await openDelete(page);
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: /^huỷ$/i })
        .click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      expect(await listProjectsOf(user.id)).toHaveLength(1);
    });

    test("PRJ-026 keeps the confirm button disabled when the typed name does not match", async ({
      page,
    }) => {
      const { user } = await openDelete(page);
      const dialog = page.getByRole("alertdialog");
      const confirm = dialog.getByRole("button", { name: /xóa vĩnh viễn/i });
      await dialog.locator("input").fill("Test Son");
      await expect(confirm).toBeDisabled();
      await dialog.locator("input").fill("test song");
      await expect(confirm).toBeDisabled();
      expect(await listProjectsOf(user.id)).toHaveLength(1);
    });

    test("PRJ-027 reports a server error and leaves the project untouched", async ({
      page,
    }) => {
      const user = await signedIn(page);
      const id = await createE2eProject(user.id, "Test Song");
      await failApi(page, "DELETE", /^\/projects\/[^/]+$/);
      await page.goto(`/projects/${id}/settings`);
      await page.getByRole("button", { name: /xóa dự án/i }).click();
      const dialog = page.getByRole("alertdialog");
      await dialog.locator("input").fill("Test Song");
      await dialog.getByRole("button", { name: /xóa vĩnh viễn/i }).click();
      await expect(dialog).toContainText(/không xoá được/i);
      expect(await listProjectsOf(user.id)).toHaveLength(1);
    });
  });

  test.describe("UC-22 Project dashboard", () => {
    test("PRJ-030 lists archived projects with a Restore action and no editor link", async ({
      page,
    }) => {
      const user = await signedIn(page);
      await createE2eProject(user.id, "Old Song", "public", true);
      await createE2eProject(user.id, "Active Song");
      await page.goto("/projects?tab=archived");
      await expect(page.getByText("Old Song")).toBeVisible();
      await expect(page.getByText("Active Song")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /khôi phục/i }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: /mở editor/i })).toHaveCount(
        0,
      );
    });

    test("PRJ-032 shows an empty state with a New project action", async ({
      page,
    }) => {
      await signedIn(page);
      await page.goto("/projects");
      await expect(
        page
          .getByRole("link", { name: /dự án mới|tạo dự án|bắt đầu/i })
          .first(),
      ).toBeVisible();
      await expect(page.getByText(/chưa có dự án/i)).toBeVisible();
    });

    test("PRJ-033 shows an empty state for a search with no result and keeps the term", async ({
      page,
    }) => {
      const user = await signedIn(page);
      await createE2eProject(user.id, "Test Song");
      await page.goto("/projects");
      const search = page.locator('input[name="q"]');
      await search.fill("zzqx_no_match_123");
      await expect(page.getByText("Test Song")).toHaveCount(0);
      await expect(search).toHaveValue("zzqx_no_match_123");
      await expect(
        page.getByText(/không có dự án|không tìm thấy|không có kết quả/i),
      ).toBeVisible();
    });

    test("PRJ-034 shows a retry message when the project list cannot be loaded", async ({
      page,
    }) => {
      await signedIn(page);
      await failApi(page, "GET", /^\/projects$/);
      await page.goto("/projects");
      await expect(
        page.getByText(/không tải được danh sách dự án/i),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /thử lại/i }),
      ).toBeVisible();
      await expect(page.getByText(/chưa có dự án/i)).toHaveCount(0);
    });
  });

  test.describe("UC-23 Project visibility", () => {
    test("PRJ-036 asks for confirmation and offers a shareable link when making a project public", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID022: visibility changes immediately on selecting the option, with no confirmation and no shareable link",
      );
      const user = await signedIn(page);
      const id = await createE2eProject(user.id, "Test Song");
      await page.goto(`/projects/${id}/settings`);
      await page.getByRole("radio", { name: /công khai/i }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      expect((await listProjectsOf(user.id))[0].visibility).toBe("private");
    });

    test("PRJ-040 refuses a visibility change on an archived project", async ({
      page,
    }) => {
      const user = await signedIn(page);
      const id = await createE2eProject(user.id, "Old Song", "private", true);
      await page.goto(`/projects/${id}/settings`);
      await page.getByRole("radio", { name: /công khai/i }).click();
      await expect(
        page.getByText(/đã lưu trữ nên chỉ xem được.*khôi phục dự án/i),
      ).toBeVisible();
      expect((await listProjectsOf(user.id))[0].visibility).toBe("private");
    });

    test("PRJ-041 reports a server error and keeps the previous visibility", async ({
      page,
    }) => {
      const user = await signedIn(page);
      const id = await createE2eProject(user.id, "Test Song");
      await failApi(page, "PATCH", /\/visibility$/);
      await page.goto(`/projects/${id}/settings`);
      await page.getByRole("radio", { name: /công khai/i }).click();
      await expect(
        page.getByText(/không đổi được chế độ hiển thị/i),
      ).toBeVisible();
      expect((await listProjectsOf(user.id))[0].visibility).toBe("private");
    });

    test("PRJ-042 removes a project from public pages as soon as it is made private", async ({
      page,
      browser,
    }) => {
      const user = await signedIn(page);
      const id = await createE2eProject(user.id, "Public Test Song", "public");
      const guest = await browser.newContext();
      const guestPage = await guest.newPage();
      await guestPage.goto(`/projects/${id}`);
      await expect(
        guestPage.getByText("Public Test Song").first(),
      ).toBeVisible();
      await page.goto(`/projects/${id}/settings`);
      await page.getByRole("radio", { name: /riêng tư/i }).click();
      await expect(page.getByText(/đã được đặt thành riêng tư/i)).toBeVisible();
      await guestPage.goto(`/projects/${id}`);
      await guestPage.waitForLoadState("networkidle");
      await expect(guestPage.getByText("Public Test Song")).toHaveCount(0);
      for (const path of ["/explore", "/rankings", `/creator/${user.id}`]) {
        await guestPage.goto(path);
        await guestPage.waitForLoadState("networkidle");
        await expect(guestPage.getByText("Public Test Song")).toHaveCount(0);
      }
      await guest.close();
    });
  });
});
