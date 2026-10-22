import { expect, test, type Page } from "@playwright/test";
import { UserApi } from "./support/api";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
} from "./support/test-user";

const API = ":3101";

async function setup(page: Page, withCommit = true) {
  const user = await createE2eUser();
  await createE2eProfile(user);
  const api = await UserApi.for(user);
  const project = await api.createProject("Test Song");
  if (withCommit) {
    await api.putDraft(project.id, [{ id: "n1" }]);
    await api.commit(project.branchId, "Change chorus");
  }
  await loginThroughUi(page, user);
  return { user, api, ...project };
}

async function openBranches(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}?tab=branches`);
  await expect(
    page.getByRole("button", { name: /^tạo nhánh$/i }),
  ).toBeVisible();
}

async function createViaForm(page: Page, name: string) {
  await page.getByRole("button", { name: /^tạo nhánh$/i }).click();
  await page.locator('input[name="branchName"]').fill(name);
  await page
    .locator("form")
    .getByRole("button", { name: /^tạo nhánh$/i })
    .click();
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

test.describe("Branch management", () => {
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test.describe("UC-47 Create branch", () => {
    test("BRN-001 proposes the latest commit as starting point and switches to the new branch", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID027: the create form has no starting point and no switch option; the new branch is only added to the list",
      );
      const { api, id } = await setup(page);
      await openBranches(page, id);
      await page.getByRole("button", { name: /^tạo nhánh$/i }).click();
      await expect(
        page.getByText(/điểm bắt đầu|starting point/i),
      ).toBeVisible();
      await page.locator('input[name="branchName"]').fill("jazz-version");
      await page
        .locator("form")
        .getByRole("button", { name: /^tạo nhánh$/i })
        .click();
      await expect(page.getByText("jazz-version").first()).toBeVisible();
      const created = (await api.branches(id)).find(
        (b) => b.name === "jazz-version",
      );
      expect(created?.is_active).toBe(true);
    });

    test("BRN-003 creates a branch without switching and keeps main active", async ({
      page,
    }) => {
      const { api, id } = await setup(page);
      await openBranches(page, id);
      await createViaForm(page, "later-idea");
      await expect(page.getByText("later-idea").first()).toBeVisible();
      const branches = await api.branches(id);
      expect(branches.map((b) => b.name)).toContain("later-idea");
      expect(branches.find((b) => b.is_default)?.is_active).toBe(true);
    });

    test("BRN-004 shows an inline error when the branch name is empty", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID028: the Create button is only disabled for an empty name and no message says the name is required",
      );
      const { api, id } = await setup(page);
      await openBranches(page, id);
      await page.getByRole("button", { name: /^tạo nhánh$/i }).click();
      await page
        .locator("form")
        .getByRole("button", { name: /^tạo nhánh$/i })
        .click({ force: true });
      await expect(page.getByText(/bắt buộc|required/i)).toBeVisible();
      expect(await api.branchNames(id)).toHaveLength(1);
    });

    test("BRN-005 rejects a branch name of 51 characters", async ({ page }) => {
      test.fail(
        true,
        "DFID029: the field cuts the text to 50 characters without a message, so a 50-character branch is created from the 51-character entry",
      );
      const { api, id } = await setup(page);
      await openBranches(page, id);
      await createViaForm(page, "x".repeat(51));
      await expect(page.getByText(/tối đa 50|too long/i).first()).toBeVisible();
      expect(await api.branchNames(id)).toHaveLength(1);
    });

    test("BRN-006 refuses a branch name already used in the project", async ({
      page,
    }) => {
      const { api, id } = await setup(page);
      await api.createBranch(id, "alt-chorus");
      await openBranches(page, id);
      await createViaForm(page, "alt-chorus");
      await expect(page.getByText(/trùng nhánh|đặt tên khác/i)).toBeVisible();
      expect(
        (await api.branchNames(id)).filter((n) => n === "alt-chorus"),
      ).toHaveLength(1);
    });

    test("BRN-007 does not create a branch in a project with no commits", async ({
      page,
    }) => {
      const { api, id } = await setup(page, false);
      await openBranches(page, id);
      await createViaForm(page, "too-early");
      await expect(
        page.getByText(/chưa có commit|commit lần đầu/i),
      ).toBeVisible();
      expect(await api.branchNames(id)).toEqual(["main"]);
    });

    test("BRN-008 reports a server error and creates no branch", async ({
      page,
    }) => {
      const { api, id } = await setup(page);
      await openBranches(page, id);
      await failApi(page, "POST", /\/branches$/);
      await createViaForm(page, "error-branch");
      await expect(page.getByText(/không tạo được nhánh/i)).toBeVisible();
      expect(await api.branchNames(id)).not.toContain("error-branch");
    });

    test("BRN-009 accepts branch names of 1 and 50 characters", async ({
      page,
    }) => {
      const { api, id } = await setup(page);
      const long = "l".repeat(50);
      await openBranches(page, id);
      await createViaForm(page, "b");
      await expect(page.getByText("b", { exact: true })).toBeVisible();
      await createViaForm(page, long);
      await expect(page.getByText(long)).toBeVisible();
      expect(await api.branchNames(id)).toEqual(
        expect.arrayContaining(["b", long]),
      );
    });
  });

  test.describe("UC-48 Switch branch", () => {
    test("BRN-015 offers no switch action when the project has one branch", async ({
      page,
    }) => {
      const { id } = await setup(page);
      await page.goto(`/projects/${id}/edit`);
      await expect(
        page.getByRole("button", { name: /commit changes/i }),
      ).toBeEnabled();
      await expect(page.getByRole("button", { name: /^main$/ })).toBeDisabled();
    });
  });

  test.describe("UC-49 and UC-50 Branch list and history", () => {
    test("BRN-017 opens the commits of a branch from its history action", async ({
      page,
    }) => {
      const { api, id } = await setup(page);
      const branch = await api.createBranch(id, "alt-chorus");
      await openBranches(page, id);
      await page
        .getByRole("link", { name: /lịch sử/i })
        .last()
        .click();
      await expect(page).toHaveURL(new RegExp(`branch=${branch.id}`));
      await expect(page.getByText("Change chorus").first()).toBeVisible();
    });

    test("BRN-019 shows a retry message in place of the branch list when it cannot be loaded", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID030: when the branch list cannot be loaded a message is shown but there is no retry action",
      );
      const { id } = await setup(page);
      await failApi(page, "GET", /\/branches$/);
      await page.goto(`/projects/${id}?tab=branches`);
      await expect(
        page.getByText(/không tải được danh sách nhánh/i),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /thử lại/i }),
      ).toBeVisible();
    });
  });

  test.describe("UC-52 Delete branch", () => {
    async function withMergedBranch(page: Page) {
      const ctx = await setup(page);
      await ctx.api.createBranch(ctx.id, "feature-intro");
      await openBranches(page, ctx.id);
      await page
        .getByRole("button", { name: "Xoá nhánh", exact: true })
        .click();
      return ctx;
    }

    test("BRN-035 deletes a fully merged branch after a simple confirmation", async ({
      page,
    }) => {
      const { api, id, branchId } = await withMergedBranch(page);
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText(
        /đã có ở nhánh mặc định|không làm mất/i,
      );
      await dialog.getByRole("button", { name: /^xoá nhánh$/i }).click();
      await expect(dialog).toHaveCount(0);
      expect(await api.branchNames(id)).toEqual(["main"]);
      expect((await api.history(branchId)).length).toBeGreaterThan(0);
    });

    test("BRN-036 keeps the branch when the delete confirmation is cancelled", async ({
      page,
    }) => {
      const { api, id } = await withMergedBranch(page);
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: /^huỷ$/i })
        .click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      expect(await api.branchNames(id)).toContain("feature-intro");
    });

    test("BRN-040 reports a server error and keeps the branch", async ({
      page,
    }) => {
      const { api, id } = await setup(page);
      await api.createBranch(id, "experiment");
      await openBranches(page, id);
      await failApi(page, "DELETE", /^\/branches\/[^/]+$/);
      await page
        .getByRole("button", { name: "Xoá nhánh", exact: true })
        .click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: /^xoá nhánh$/i })
        .click();
      await expect(page.getByRole("alertdialog")).toContainText(
        /không xoá được/i,
      );
      expect(await api.branchNames(id)).toContain("experiment");
    });
  });
});
