import { expect as baseExpect, test, type Page } from "@playwright/test";
import { UserApi, type NoteSeed } from "./support/api";
import { admin } from "./support/auth-links";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const BAR = 1920;
const BASE: NoteSeed[] = [{ id: "c1", pitch: 60, start: 0 }];

async function owner(label = "User A") {
  const user = await createE2eUser();
  await createE2eProfile(user, { display_name: label, username: `${label.replace(" ", "_").toLowerCase()}_${user.id.slice(0, 6)}` });
  return { user, api: await UserApi.for(user) };
}

async function status(call: Promise<unknown>) {
  try {
    await call;
    return 200;
  } catch (error) {
    return Number(/-> (\d+)/.exec(String(error))?.[1] ?? 0);
  }
}

async function threeCommits(api: UserApi) {
  const project = await api.createProject("Test Song");
  await api.putDraft(project.id, BASE);
  const verse = await api.commit(project.branchId, "Verse idea");
  await api.putDraft(project.id, [...BASE, { id: "d1", pitch: 36, start: BAR }]);
  const drums = await api.commit(project.branchId, "Add drums");
  await api.putDraft(project.id, [...BASE, { id: "d1", pitch: 36, start: BAR }, { id: "ch", pitch: 67, start: 2 * BAR }]);
  const chorus = await api.commit(project.branchId, "Change chorus");
  return { ...project, verse, drums, chorus };
}

async function openCommits(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}?tab=commits`);
  await expect(page.getByText("Đang tải lịch sử commit…")).toHaveCount(0);
}

test.describe("Version control extra", () => {
  test.setTimeout(150_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("VC-002 commit still works with a manual message when no AI suggestion is available", async ({ page }) => {
    const { user, api } = await owner();
    const project = await api.createProject("Test Song");
    await api.putDraft(project.id, BASE);
    await api.commit(project.branchId, "Verse idea");
    await api.putDraft(project.id, [...BASE, { id: "n2", start: BAR }]);
    await loginThroughUi(page, user);
    await page.goto(`/projects/${project.id}/edit`);
    await page.getByRole("button", { name: /commit changes/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#commit-message")).toHaveValue("");
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.locator("#commit-message").fill("Manual message");
    await dialog.getByRole("button", { name: "Tạo commit" }).click();
    await expect(dialog).toHaveCount(0);
    expect((await api.history(project.branchId))[0].message).toBe("Manual message");
  });

  test("VC-014 the All branches filter lists commits of every branch with their branch", async ({ page }) => {
    const { user, api } = await owner();
    const p = await threeCommits(api);
    const alt = await api.createBranch(p.id, "alt-chorus");
    await api.commitOnBranch(p.id, p.branchId, alt.id, [...BASE, { id: "alt", pitch: 72, start: 3 * BAR }], "Try new chorus");
    await loginThroughUi(page, user);
    await openCommits(page, p.id);
    await page.getByRole("combobox", { name: "Chọn nhánh để xem lịch sử" }).selectOption({ label: "Mọi nhánh" });
    await expect(page.getByText("Try new chorus")).toBeVisible();
    await expect(page.getByText("Change chorus")).toBeVisible();
    await expect(page.locator("main").getByText("alt-chorus").filter({ visible: true }).first()).toBeVisible();
  });

  test("VC-015 selecting two commits enables Compare and opens the comparison", async ({ page }) => {
    const { user, api } = await owner();
    const p = await threeCommits(api);
    await loginThroughUi(page, user);
    await openCommits(page, p.id);
    const compare = page.getByRole("button", { name: "So sánh", exact: true });
    await expect(compare).toBeDisabled();
    await page.getByRole("checkbox", { name: `Chọn commit ${p.verse.id.slice(0, 7)} để so sánh` }).check();
    await page.getByRole("checkbox", { name: `Chọn commit ${p.chorus.id.slice(0, 7)} để so sánh` }).check();
    await expect(compare).toBeEnabled();
    await compare.click();
    await expect(page.getByRole("dialog").first()).toBeVisible();
    await expect(page.getByRole("dialog").first()).toContainText(/Verse idea|Change chorus|so sánh/i);
  });

  test("VC-018 a user who is neither owner nor collaborator cannot view the history", async ({ page }) => {
    const { api } = await owner();
    const p = await threeCommits(api);
    const { user: bUser, api: b } = await owner("User B");
    expect(await status(b.call("GET", `/commits?branch_id=${p.branchId}`))).toBe(403);
    await loginThroughUi(page, bUser);
    await page.goto(`/projects/${p.id}?tab=commits`);
    await expect(page.getByText("Verse idea")).toHaveCount(0);
    await expect(page.getByText("Change chorus")).toHaveCount(0);
  });

  test("VC-019 a visitor to a public project sees its state but not its history", async ({ page }) => {
    const { api } = await owner();
    const p = await threeCommits(api);
    await api.setVisibility(p.id, "public");
    const { user: bUser } = await owner("User B");
    await loginThroughUi(page, bUser);
    await page.goto(`/projects/${p.id}`);
    await expect(page.getByRole("heading", { name: "Test Song" })).toBeVisible();
    await expect(page.getByText("Lượt fork")).toBeVisible();
    await expect(page.getByRole("button", { name: "Commit", exact: true })).toHaveCount(0);
    await page.goto(`/projects/${p.id}?tab=commits`);
    await expect(page.getByText("Verse idea")).toHaveCount(0);
  });

  test("VC-021 removes a tag after confirmation and keeps the commit", async ({ page }) => {
    const { user, api } = await owner();
    const p = await threeCommits(api);
    await api.tag(p.drums.id, "demo-v1");
    await loginThroughUi(page, user);
    await openCommits(page, p.id);
    await page.getByRole("button", { name: "Bỏ tag demo-v1" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Bỏ tag của commit này?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Bỏ tag" }).click();
    await expect(page.getByText(/Đã bỏ tag "demo-v1"/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Bỏ tag demo-v1" })).toHaveCount(0);
    const commit = (await api.call("GET", `/commits/${p.drums.id}`)) as { message: string; created_by?: string; author_id?: string };
    expect(commit.message).toBe("Add drums");
    expect(commit.created_by ?? commit.author_id).toBe(user.id);
  });

  test("VC-037 Branch from here starts a branch instead of restoring", async ({ page }) => {
    const { user, api } = await owner();
    const p = await threeCommits(api);
    await loginThroughUi(page, user);
    await openCommits(page, p.id);
    const row = page.locator("li, tr, div").filter({ hasText: "Verse idea" }).filter({ has: page.getByRole("button", { name: /Nhánh từ đây/ }) }).last();
    await row.getByRole("button", { name: /Nhánh từ đây/ }).click();
    await page.locator('input[name="branchFromName"]').fill("retry-verse");
    await page.getByRole("button", { name: "Tạo nhánh", exact: true }).click();
    await expect(page.getByText(/Đã tạo nhánh "retry-verse"/)).toBeVisible();
    const branches = await api.branches(p.id);
    const retry = branches.find((b) => b.name === "retry-verse")!;
    expect(retry).toBeTruthy();
    expect((await api.head(p.branchId)).message).toBe("Change chorus");
    const details = (await api.call("GET", `/branches/${retry.id}`)) as { branchInfo: { head_commit_id: string; base_commit_id?: string } };
    expect([details.branchInfo.head_commit_id, details.branchInfo.base_commit_id]).toContain(p.verse.id);
  });

  test("BRN-028 a merge between branches with no common starting point is refused", async ({ page }) => {
    const { user, api } = await owner();
    const p = await threeCommits(api);
    const { data: orphan } = await admin().from("branches").insert({ project_id: p.id, name: "orphan-branch", is_default: false, created_by: user.id }).select("id").single();
    const { data: lonely } = await admin().from("commits").insert({ branch_id: orphan!.id, author_id: user.id, message: "Lonely", snapshot: { schemaVersion: 3, meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 }, tracks: [], notes: [] }, parent_commit_id: null }).select("id").single();
    await admin().from("branches").update({ head_commit_id: lonely!.id }).eq("id", orphan!.id);
    const mainBefore = await api.head(p.branchId);
    expect(await status(api.merge(orphan!.id, p.branchId))).toBeGreaterThanOrEqual(400);
    await loginThroughUi(page, user);
    await page.goto(`/projects/${p.id}?tab=branches`);
    const mergeButton = page.getByRole("button", { name: /hợp nhất vào main/i });
    if ((await mergeButton.count()) > 0 && (await mergeButton.first().isEnabled())) {
      await mergeButton.first().click();
      const confirm = page.getByRole("alertdialog");
      if (await confirm.getByRole("button", { name: /^hợp nhất$/i }).isVisible()) {
        await confirm.getByRole("button", { name: /^hợp nhất$/i }).click();
      }
      await expect(page.getByText(/không có điểm chung|không liên quan|không cùng gốc|not related/i).first()).toBeVisible();
    }
    expect((await api.head(p.branchId)).id).toBe(mainBefore.id);
  });

  test("Blocked by DFID129, BRN-031 the merge is restarted when someone commits to the target during review", async ({ page }) => {
    test.fail(true, "DFID129: the merge is applied on top of the new target commit");
    const { user, api } = await owner();
    const project = await api.createProject("Test Song");
    await api.putDraft(project.id, BASE);
    await api.commit(project.branchId, "Verse idea");
    const alt = await api.createBranch(project.id, "alt-chorus");
    await api.commitOnBranch(project.id, project.branchId, alt.id, [...BASE, ...[0, 1, 2, 3].map((i) => ({ id: `a${i}`, pitch: 50 + i, start: 8 * BAR + i * 480, trackId: "track-1" }))], "Alt notes");
    await api.putDraft(project.id, [{ id: "c1", pitch: 62, start: 0 }]);
    await api.commit(project.branchId, "Main change");
    await loginThroughUi(page, user);
    await page.goto(`/projects/${project.id}?tab=branches`);
    await page.getByRole("button", { name: /hợp nhất vào main/i }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await api.putDraft(project.id, [{ id: "c1", pitch: 62, start: 0 }, { id: "u1", pitch: 40, start: 4 * BAR }]);
    await api.commit(project.branchId, "B update");
    await confirm.getByRole("button", { name: /^hợp nhất$/i }).click();
    await page.waitForTimeout(3_000);
    expect((await api.head(project.branchId)).message).toBe("B update");
  });

  test("Blocked by DFID144, BRN-039 deleting the source branch of an open pull request warns and closes it", async ({ page }) => {
    test.fail(true, "DFID144: deleting the branch does not warn about the open pull request");
    const { api: b } = await owner("User B");
    const pub = await b.createProject("Public Song");
    await b.putDraft(pub.id, BASE);
    await b.commit(pub.branchId, "Verse idea");
    await b.setVisibility(pub.id, "public");
    const { user, api } = await owner();
    const fork = (await api.call("POST", `/projects/${pub.id}/fork`)) as { id: string };
    const forkMain = (await api.branches(fork.id)).find((x) => x.is_default)!.id;
    const fix = await api.createBranch(fork.id, "chorus-fix", (await api.head(forkMain)).id);
    await api.commitOnBranch(fork.id, forkMain, fix.id, [...BASE, { id: "fx", pitch: 70, start: BAR }], "Fix chorus");
    const pr = (await api.call("POST", `/projects/${fork.id}/pull-requests`, { sourceBranchId: fix.id, targetBranchId: pub.branchId, title: "Fix chorus" })) as { id: string };
    await loginThroughUi(page, user);
    await page.goto(`/projects/${fork.id}?tab=branches`);
    await page.getByRole("button", { name: "Xoá nhánh chorus-fix" }).click();
    const confirm = page.getByRole("alertdialog");
    const warned = await confirm.getByText(/pull request/i).count();
    await confirm.getByRole("button", { name: /xoá|xóa/i }).last().click();
    await expect.poll(async () => (await api.branchNames(fork.id)).includes("chorus-fix")).toBe(false);
    const detail = (await api.call("GET", `/pull-requests/${pr.id}`)) as { pullRequest: { status: string } };
    expect(warned).toBeGreaterThan(0);
    expect(detail.pullRequest.status).toBe("closed");
  });

  test("NFR-009 commit and merge work without the AI service", async ({ page }) => {
    const { user, api } = await owner();
    const project = await api.createProject("Test Song");
    await api.putDraft(project.id, BASE);
    await api.commit(project.branchId, "Verse idea");
    const feature = await api.createBranch(project.id, "feature");
    await api.commitOnBranch(project.id, project.branchId, feature.id, [...BASE, { id: "f1", pitch: 64, start: BAR }], "Feature idea");
    await page.route(/generativelanguage\.googleapis\.com/, (route) => route.abort());
    await loginThroughUi(page, user);
    await page.goto(`/projects/${project.id}/edit`);
    await page.getByRole("button", { name: /^File$/ }).waitFor();
    await page.getByRole("button", { name: "Panel Insight" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /lỗi|error/i })).toHaveCount(0);
    await api.putDraft(project.id, [...BASE, { id: "m1", pitch: 48, start: 2 * BAR }]);
    await api.commit(project.branchId, "Manual commit");
    await api.merge(feature.id, project.branchId);
    const head = await api.head(project.branchId);
    expect(head.message).toMatch(/Merge|feature/i);
  });
});
