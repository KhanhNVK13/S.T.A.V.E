import { expect, test, type Page } from "@playwright/test";
import { UserApi, type NoteSeed } from "./support/api";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
} from "./support/test-user";

/**
 * UC-71 — cảnh báo rủi ro merge trong hộp xác nhận "Hợp nhất".
 *
 * Hai kịch bản bắt buộc:
 * 1. Hai nhánh XUNG ĐỘT (cùng sửa nốt c1, c2) → rủi ro cao, có cảnh báo.
 * 2. Hai nhánh KHÔNG ĐỤNG NHAU → rủi ro thấp, không cảnh báo giả.
 *
 * Panel KHÔNG chặn việc hợp nhất: cả hai kịch bản vẫn bấm "Hợp nhất" được.
 */

const BASE: NoteSeed[] = [
  { id: "c1", pitch: 60, start: 3840 },
  { id: "c2", pitch: 64, start: 13440 },
];

async function loggedIn(page: Page) {
  const user = await createE2eUser();
  await createE2eProfile(user);
  const api = await UserApi.for(user);
  await loginThroughUi(page, user);
  return api;
}

/** Tạo project + commit gốc, rồi tạo nhánh phụ từ đó. */
async function projectWithBranch(api: UserApi) {
  const project = await api.createProject("Merge Risk Test");
  await api.putDraft(project.id, BASE);
  await api.commit(project.branchId, "Base commit");
  const branch = await api.createBranch(project.id, "alt");
  return { project, branch };
}

/** Hai nhánh cùng sửa nốt c1 và c2 → xung đột. */
async function conflictingBranches(page: Page) {
  const api = await loggedIn(page);
  const { project, branch } = await projectWithBranch(api);

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

  return { api, projectId: project.id, branchId: branch.id };
}

/** Hai nhánh không đụng nhau: mỗi bên thêm nốt riêng. */
async function disjointBranches(page: Page) {
  const api = await loggedIn(page);
  const { project, branch } = await projectWithBranch(api);

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
    ],
    "Alt notes",
  );

  return { api, projectId: project.id, branchId: branch.id };
}

async function openMergeDialog(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}?tab=branches`);
  await page.getByRole("button", { name: /hợp nhất vào main/i }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
}

test.describe("UC-71 merge risk warning", () => {
  test.setTimeout(120_000);
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test("MRK-01 warns about HIGH risk when the two branches conflict on the same notes", async ({
    page,
  }) => {
    const { projectId } = await conflictingBranches(page);
    await openMergeDialog(page, projectId);

    const panel = page.getByTestId("merge-risk-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-level", "high");
    // Có số liệu: xung đột và chồng chéo
    await expect(panel).toContainText(/xung đột/i);
    await expect(panel).toContainText(/chồng chéo/i);

    // Cảnh báo KHÔNG chặn nút hợp nhất — vẫn bấm được.
    await expect(
      page.getByRole("alertdialog").getByRole("button", { name: /^hợp nhất$/i }),
    ).toBeEnabled();
  });

  test("MRK-02 shows LOW risk without a fake warning when the branches do not overlap", async ({
    page,
  }) => {
    const { projectId } = await disjointBranches(page);
    await openMergeDialog(page, projectId);

    const panel = page.getByTestId("merge-risk-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-level", "low");
    // Không có cảnh báo giả: số xung đột bằng 0 và không có lời cảnh báo nào.
    await expect(panel).toContainText(/0/);
    await expect(panel).not.toContainText(/cảnh báo|nguy hiểm|rủi ro cao/i);
  });

  test("MRK-03 cancelling the dialog changes neither branch", async ({ page }) => {
    const { api, projectId, branchId } = await disjointBranches(page);
    const mainBefore = await api.head((await api.branches(projectId)).find((b) => b.is_default)!.id);
    const branchBefore = await api.head(branchId);

    await openMergeDialog(page, projectId);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /^huỷ$/i })
      .click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    const mainAfter = await api.head((await api.branches(projectId)).find((b) => b.is_default)!.id);
    expect(mainAfter.id).toBe(mainBefore.id);
    expect((await api.head(branchId)).id).toBe(branchBefore.id);
  });
});
