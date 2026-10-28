import { expect, test, type Page } from "@playwright/test";
import { UserApi, type NoteSeed } from "./support/api";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
} from "./support/test-user";

const BASE: NoteSeed[] = [
  { id: "c1", pitch: 60, start: 3840 },
  { id: "c2", pitch: 64, start: 13440 },
];

interface Scenario {
  api: UserApi;
  id: string;
  mainId: string;
  branchId: string;
}

async function loggedIn(page: Page) {
  const user = await createE2eUser();
  await createE2eProfile(user);
  const api = await UserApi.for(user);
  await loginThroughUi(page, user);
  return api;
}

async function projectWithBase(api: UserApi) {
  const project = await api.createProject("Test Song");
  await api.putDraft(project.id, BASE);
  await api.commit(project.branchId, "Verse idea");
  return project;
}

async function fastForward(page: Page): Promise<Scenario> {
  const api = await loggedIn(page);
  const project = await projectWithBase(api);
  const branch = await api.createBranch(project.id, "quick-fix");
  await api.commitOnBranch(
    project.id,
    project.branchId,
    branch.id,
    [...BASE, { id: "fix", pitch: 72, start: 1920 }],
    "Fix bar 2",
  );
  return { api, id: project.id, mainId: project.branchId, branchId: branch.id };
}

async function diverged(page: Page, conflicting: boolean): Promise<Scenario> {
  const api = await loggedIn(page);
  const project = await projectWithBase(api);
  const branch = await api.createBranch(project.id, "alt-chorus");
  if (conflicting) {
    await api.putDraft(project.id, [
      { id: "c1", pitch: 65, start: 3840 },
      { id: "c2", pitch: 69, start: 13440 },
    ]);
    await api.commit(project.branchId, "Main change");
    await api.commitOnBranch(
      project.id,
      project.branchId,
      branch.id,
      [
        { id: "c1", pitch: 67, start: 3840 },
        { id: "c2", pitch: 71, start: 13440 },
      ],
      "Alt change",
    );
  } else {
    await api.putDraft(project.id, [
      ...BASE,
      { id: "m1", pitch: 50, start: 0 },
    ]);
    await api.commit(project.branchId, "Main change");
    await api.commitOnBranch(
      project.id,
      project.branchId,
      branch.id,
      [
        ...BASE,
        { id: "a1", pitch: 70, start: 1920 },
        { id: "a2", pitch: 71, start: 2400 },
        { id: "a3", pitch: 72, start: 2880 },
        { id: "a4", pitch: 73, start: 3360 },
      ],
      "Alt notes",
    );
  }
  return { api, id: project.id, mainId: project.branchId, branchId: branch.id };
}

async function startMerge(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}?tab=branches`);
  await page.getByRole("button", { name: /hợp nhất vào main/i }).click();
}

async function confirmMerge(page: Page) {
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /^hợp nhất$/i })
    .click();
}

test.describe("Branch merge", () => {
  test.setTimeout(120_000);
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test("BRN-024 merges a branch without conflicts and summarises what it brings in", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID031: the merge confirmation only counts commits; it does not summarise the notes the merge brings in",
    );
    const { id } = await diverged(page, false);
    await startMerge(page, id);
    await expect(page.getByRole("alertdialog")).toContainText(
      /4\s*note|4 nốt/i,
    );
  });

  test("BRN-026 changes neither branch when the merge is cancelled", async ({
    page,
  }) => {
    const { api, id, mainId, branchId } = await fastForward(page);
    const mainBefore = await api.head(mainId);
    const branchBefore = await api.head(branchId);
    await startMerge(page, id);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /^huỷ$/i })
      .click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect((await api.head(mainId)).id).toBe(mainBefore.id);
    expect((await api.head(branchId)).id).toBe(branchBefore.id);
    expect(await api.history(mainId)).toHaveLength(1);
  });

  test("BRN-027 merges a branch that is only ahead without a merge commit and says so", async ({
    page,
  }) => {
    const { api, id, mainId } = await fastForward(page);
    await startMerge(page, id);
    await confirmMerge(page);
    await expect(page.getByText(/^đã hợp nhất "/i)).toBeVisible();
    expect((await api.head(mainId)).message).toBe("Fix bar 2");
    expect(await api.history(mainId)).toHaveLength(1);
    await expect(
      page.getByText(/không cần.*commit hợp nhất|không có commit hợp nhất/i),
    ).toBeVisible();
  });

  test("BRN-030 warns about conflicts and opens the resolve screen without creating a commit", async ({
    page,
  }) => {
    const { api, id, mainId } = await diverged(page, true);
    const before = await api.head(mainId);
    await startMerge(page, id);
    await confirmMerge(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText(/xung đột/i);
    await dialog.getByRole("button", { name: /^huỷ$/i }).click();
    expect((await api.head(mainId)).id).toBe(before.id);
  });

  test("BRN-033 reports the conflict of a note changed on both branches", async ({
    page,
  }) => {
    const { id } = await diverged(page, true);
    await startMerge(page, id);
    await confirmMerge(page);
    await expect(page.getByRole("dialog").getByText(/ô nhịp 3/i)).toBeVisible();
  });

  test("BRN-044 applies the last choice made for a conflict", async ({
    page,
  }) => {
    const { api, id, mainId } = await diverged(page, true);
    await startMerge(page, id);
    await confirmMerge(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    const first = dialog.locator("fieldset").first();
    await first.getByRole("radio").first().click();
    await first.getByRole("radio").nth(1).click();
    await dialog.getByRole("button", { name: /xác nhận và hợp nhất/i }).click();
    await expect(dialog).toHaveCount(0);
    const merge = await api.head(mainId);
    const snapshot = await api.commitSnapshot(merge.id);
    expect(snapshot.notes.find((n) => n.id === "c1")?.pitch).toBe(67);
  });

  test("BRN-045 discards every choice when the merge is cancelled", async ({
    page,
  }) => {
    const { api, id, mainId } = await diverged(page, true);
    const before = await api.head(mainId);
    await startMerge(page, id);
    await confirmMerge(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.locator("fieldset").first().getByRole("radio").nth(1).click();
    await dialog.getByRole("button", { name: /^huỷ$/i }).click();
    expect((await api.head(mainId)).id).toBe(before.id);
  });

  test("BRN-048 reports a server error while applying the merge and records no merge commit", async ({
    page,
  }) => {
    const { api, id, mainId } = await diverged(page, true);
    const before = await api.head(mainId);
    await startMerge(page, id);
    await confirmMerge(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await page.route(
      (url) =>
        url.href.includes(":3101") && /\/merge\/resolve$/.test(url.pathname),
      (route) => route.fulfill({ status: 500, body: "{}" }),
    );
    await dialog.getByRole("button", { name: /xác nhận và hợp nhất/i }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    expect((await api.head(mainId)).id).toBe(before.id);
  });
});

test.describe("Branch delete with commits", () => {
  test.setTimeout(120_000);
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test("BRN-034 states the commits that will be lost and that deleting cannot be undone", async ({
    page,
  }) => {
    const { id } = await fastForward(page);
    await page.goto(`/projects/${id}?tab=branches`);
    await page.getByRole("button", { name: /^xoá nhánh (?!mặc định)/i }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(/1\s*commit/i);
    await expect(dialog).toContainText(/không thể hoàn tác|cannot be undone/i);
  });
});
