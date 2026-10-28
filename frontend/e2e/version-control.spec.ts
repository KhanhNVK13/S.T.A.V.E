import { expect, test, type Page } from "@playwright/test";
import { UserApi } from "./support/api";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
} from "./support/test-user";

const API = ":3101";

async function setup(page: Page, name = "Test Song") {
  const user = await createE2eUser();
  await createE2eProfile(user);
  const api = await UserApi.for(user);
  const project = await api.createProject(name);
  await api.putDraft(project.id, [{ id: "n1" }]);
  await loginThroughUi(page, user);
  return { user, api, ...project };
}

async function openEditor(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/edit`);
  await expect(
    page.getByRole("button", { name: /commit changes/i }),
  ).toBeEnabled();
}

async function openHistory(page: Page) {
  const panel = page.locator("aside").filter({ hasText: /phiên bản/i });
  if ((await panel.count()) === 0) {
    await page.getByRole("button", { name: "History panel" }).click();
  }
  await expect(
    page
      .locator("aside")
      .filter({ hasText: /phiên bản/i })
      .first(),
  ).toBeVisible();
}

async function commitThroughDialog(page: Page, message: string) {
  await page.getByRole("button", { name: /commit changes/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#commit-message").fill(message);
  await dialog.getByRole("button", { name: /tạo commit/i }).click();
  await expect(dialog).toHaveCount(0);
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

test.describe("Version control", () => {
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test.describe("UC-42 Create commit", () => {
    test("VC-004 creates no commit when the commit dialog is cancelled", async ({
      page,
    }) => {
      const { api, id, branchId } = await setup(page);
      await openEditor(page, id);
      await page.getByRole("button", { name: /commit changes/i }).click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("#commit-message").fill("Should not be saved");
      await dialog.getByRole("button", { name: /^huỷ$/i }).click();
      await expect(dialog).toHaveCount(0);
      expect(await api.history(branchId)).toHaveLength(0);
      await expect(
        page.getByRole("button", { name: /commit changes/i }),
      ).toBeEnabled();
    });

    test("VC-005 makes the commit action unavailable when the draft has no changes", async ({
      page,
    }) => {
      const { api, id, branchId } = await setup(page);
      await api.commit(branchId, "First");
      await openEditor(page, id);
      await expect(
        page.getByRole("button", { name: /commit changes/i }),
      ).toBeDisabled();
      expect(await api.history(branchId)).toHaveLength(1);
    });

    test("VC-007 does not accept an empty commit message and says it is required", async ({
      page,
    }) => {
      const { api, id, branchId } = await setup(page);
      await openEditor(page, id);
      await page.getByRole("button", { name: /commit changes/i }).click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("#commit-message").fill("x");
      await dialog.locator("#commit-message").fill("");
      await expect(
        dialog.getByText(/nhập nội dung|không được để trống/i),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: /tạo commit/i }),
      ).toBeDisabled();
      expect(await api.history(branchId)).toHaveLength(0);
    });

    test("VC-008 stores no more than 200 characters of a longer commit message", async ({
      page,
    }) => {
      const { api, id, branchId } = await setup(page);
      await openEditor(page, id);
      await page.getByRole("button", { name: /commit changes/i }).click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("#commit-message").fill("m".repeat(201));
      await expect(dialog.locator("#commit-message")).toHaveValue(
        "m".repeat(200),
      );
      await expect(dialog.getByText("200/200")).toBeVisible();
      await dialog.getByRole("button", { name: /tạo commit/i }).click();
      await expect(dialog).toHaveCount(0);
      const [stored] = await api.history(branchId);
      expect(stored.message).toHaveLength(200);
    });

    test("VC-010 reports a server error during commit and keeps the working draft", async ({
      page,
    }) => {
      const { api, id, branchId } = await setup(page);
      await openEditor(page, id);
      await failApi(page, "POST", /^\/commits$/);
      await page.getByRole("button", { name: /commit changes/i }).click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("#commit-message").fill("Server error test");
      await dialog.getByRole("button", { name: /tạo commit/i }).click();
      await expect(dialog.getByRole("alert")).toBeVisible();
      expect(await api.history(branchId)).toHaveLength(0);
      const draft = (await api.call("GET", `/projects/${id}/draft`)) as {
        notes: unknown[];
      };
      expect(draft.notes).toHaveLength(1);
    });

    test("VC-011 accepts commit messages of 1 and 200 characters", async ({
      page,
    }) => {
      const { api, id, branchId } = await setup(page);
      await openEditor(page, id);
      await commitThroughDialog(page, "A");
      await api.putDraft(id, [{ id: "n1" }, { id: "n2", start: 480 }]);
      await page.reload();
      await expect(
        page.getByRole("button", { name: /commit changes/i }),
      ).toBeEnabled();
      const long = "m".repeat(200);
      await commitThroughDialog(page, long);
      const messages = (await api.history(branchId)).map((c) => c.message);
      expect(messages).toEqual([long, "A"]);
    });

    test("VC-012 offers no way to change or delete a created commit", async ({
      page,
    }) => {
      const { api, id, branchId } = await setup(page);
      const commit = await api.commit(branchId, "Immutable test");
      await openEditor(page, id);
      await openHistory(page);
      await page.getByText("Immutable test").first().click();
      await expect(
        page.getByRole("button", { name: /sửa|xoá|xóa|edit|delete/i }),
      ).toHaveCount(0);
      await expect(
        api.call("PATCH", `/commits/${commit.id}`, { message: "x" }),
      ).rejects.toThrow();
      await expect(
        api.call("DELETE", `/commits/${commit.id}`),
      ).rejects.toThrow();
      expect((await api.history(branchId))[0].message).toBe("Immutable test");
    });
  });

  test.describe("UC-43 Commit history", () => {
    test("VC-017 shows a retry message when the history cannot be retrieved", async ({
      page,
    }) => {
      const { api, id, branchId } = await setup(page);
      await api.commit(branchId, "Verse idea");
      let broken = true;
      await page.route(
        (url) => url.href.includes(API) && url.pathname === "/commits",
        (route) =>
          broken && route.request().method() === "GET"
            ? route.fulfill({ status: 500, body: "{}" })
            : route.continue(),
      );
      await openEditor(page, id);
      await openHistory(page);
      await expect(
        page.getByText(/không tải được lịch sử/i).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /thử lại/i }),
      ).toBeVisible();
      broken = false;
      await page.getByRole("button", { name: /thử lại/i }).click();
      await expect(page.getByText("Verse idea").first()).toBeVisible();
    });

    test("VC-013 lists the commits newest first with message, author, time, tag and change counts", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID025: the history list shows no counts of notes added, removed and modified for each commit",
      );
      const { api, id, branchId } = await setup(page);
      await api.commit(branchId, "Verse idea");
      await api.putDraft(id, [{ id: "n1" }, { id: "n2", start: 480 }]);
      await api.commit(branchId, "Add drums");
      await openEditor(page, id);
      await openHistory(page);
      const cards = page.locator(
        "aside button[title='Xem chi tiết phiên bản']",
      );
      await expect(cards.nth(0)).toContainText("Add drums");
      await expect(cards.nth(1)).toContainText("Verse idea");
      await expect(cards.nth(0)).toContainText(/\+1|thêm/i);
    });
  });

  test.describe("UC-44 Commit tags", () => {
    async function twoCommits(page: Page) {
      const ctx = await setup(page);
      const first = await ctx.api.commit(ctx.branchId, "Verse idea");
      await ctx.api.putDraft(ctx.id, [{ id: "n1" }, { id: "n2", start: 480 }]);
      const second = await ctx.api.commit(ctx.branchId, "Add drums");
      await openEditor(page, ctx.id);
      await openHistory(page);
      return { ...ctx, first, second };
    }

    async function tagFromUi(page: Page, message: string, tag: string) {
      await page.getByText(message, { exact: true }).first().click();
      await page.getByRole("button", { name: /gắn tag|đổi tag/i }).click();
      await page.getByPlaceholder("v1-demo").fill(tag);
      await page.getByRole("button", { name: /lưu tag/i }).click();
    }

    test("VC-025 rejects a tag name already used in the project", async ({
      page,
    }) => {
      const { api, first, second } = await twoCommits(page);
      await api.tag(first.id, "final");
      await tagFromUi(page, "Add drums", "final");
      await expect(page.getByText(/đã được dùng|chọn tên khác/i)).toBeVisible();
      const tags = (await api.call(
        "GET",
        `/commits/${second.id}/tags`,
      )) as unknown[];
      expect(tags).toHaveLength(0);
    });

    test("VC-027 saves tag names of 1 and 30 characters and shows them in full", async ({
      page,
    }) => {
      await twoCommits(page);
      const long = "a".repeat(30);
      await tagFromUi(page, "Verse idea", "A");
      await expect(page.getByText("A", { exact: true }).first()).toBeVisible();
      await tagFromUi(page, "Add drums", long);
      await expect(page.getByText(long).first()).toBeVisible();
    });
  });

  test.describe("UC-46 Restore a version", () => {
    async function withRestoreTarget(page: Page) {
      const ctx = await setup(page);
      const verse = await ctx.api.commit(ctx.branchId, "Verse idea");
      await ctx.api.putDraft(ctx.id, [{ id: "n1" }, { id: "n2", start: 480 }]);
      await ctx.api.commit(ctx.branchId, "Add drums");
      await openEditor(page, ctx.id);
      await openHistory(page);
      await page.getByText("Verse idea", { exact: true }).first().click();
      await page.getByRole("button", { name: /^khôi phục$/i }).click();
      return { ...ctx, verse };
    }

    test("VC-035 restores an earlier version as a new commit that names it", async ({
      page,
    }) => {
      const { api, branchId } = await withRestoreTarget(page);
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: /^khôi phục$/i }).click();
      await expect(dialog).toHaveCount(0);
      const messages = (await api.history(branchId)).map((c) => c.message);
      expect(messages).toHaveLength(3);
      expect(messages[0]).toContain("Verse idea");
      expect(messages).toEqual(
        expect.arrayContaining(["Add drums", "Verse idea"]),
      );
    });

    test("VC-036 makes no change when the restore confirmation is cancelled", async ({
      page,
    }) => {
      const { api, branchId } = await withRestoreTarget(page);
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: /^huỷ$/i }).click();
      await expect(dialog).toHaveCount(0);
      const history = await api.history(branchId);
      expect(history).toHaveLength(2);
      expect(history[0].message).toBe("Add drums");
    });

    test("VC-039 reports a server error during restore and creates no commit", async ({
      page,
    }) => {
      const { api, branchId } = await withRestoreTarget(page);
      await failApi(page, "POST", /\/restore$/);
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: /^khôi phục$/i }).click();
      await expect(dialog.getByRole("alert")).toBeVisible();
      expect(await api.history(branchId)).toHaveLength(2);
    });
  });
});
