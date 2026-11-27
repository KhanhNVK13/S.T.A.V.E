import { expect as baseExpect, test, type Page } from "@playwright/test";
import { person, type Person } from "./support/people";
import { cleanupE2eUsers, loginThroughUi } from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });

async function projectWithChanges(user: Person, extraNotes = 2) {
  const project = await user.api.createProject("AI Commit Song");
  await user.api.putDraft(project.id, [{ id: "a1", pitch: 60, start: 0 }]);
  await user.api.commit(project.branchId, "Base commit");
  const notes = [{ id: "a1", pitch: 60, start: 0 }];
  for (let i = 0; i < extraNotes; i += 1) {
    notes.push({ id: `n${i}`, pitch: 61 + (i % 20), start: 480 * (i + 1) });
  }
  await user.api.putDraft(project.id, notes);
  return project;
}

async function openCommitDialog(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/edit`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /commit changes/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

function suggestWith(page: Page, answers: Array<string | null | "fail">, delayMs = 0) {
  let call = 0;
  return page.route("**/ai/commit-message", async (route) => {
    const answer = answers[Math.min(call, answers.length - 1)];
    call += 1;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (answer === "fail") {
      await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ suggestion: answer }),
    });
  });
}

async function lastMessage(user: Person, branchId: string): Promise<string> {
  const head = await user.api.head(branchId);
  return head.message;
}

test.describe("AI assistance", () => {
  test.setTimeout(240_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("AI-001 shows an AI suggestion in the Commit dialog that the user edits and commits", async ({ page }) => {
    const user = await person("Writer");
    const project = await projectWithChanges(user);
    await loginThroughUi(page, user.user);
    await suggestWith(page, ["Thêm hai nốt mới ở ô nhịp 1"]);
    const dialog = await openCommitDialog(page, project.id);
    await dialog.getByRole("button", { name: /gợi ý bởi ai/i }).click();
    await expect(dialog.getByText("Gợi ý bởi AI.")).toBeVisible();
    const box = dialog.locator("#commit-message");
    await expect(box).toHaveValue("Thêm hai nốt mới ở ô nhịp 1");
    await box.fill("Thêm hai nốt mới ở ô nhịp 1 (đã sửa)");
    await dialog.getByRole("button", { name: /tạo commit/i }).click();
    await expect(dialog).toHaveCount(0);
    expect(await lastMessage(user, project.branchId)).toBe("Thêm hai nốt mới ở ô nhịp 1 (đã sửa)");
  });

  test("AI-002 requests a fresh suggestion when Regenerate is used", async ({ page }) => {
    const user = await person("Writer");
    const project = await projectWithChanges(user);
    await loginThroughUi(page, user.user);
    await suggestWith(page, ["Gợi ý thứ nhất", "Gợi ý thứ hai"]);
    const dialog = await openCommitDialog(page, project.id);
    const box = dialog.locator("#commit-message");
    await dialog.getByRole("button", { name: /gợi ý bởi ai/i }).click();
    await expect(box).toHaveValue("Gợi ý thứ nhất");
    await dialog.getByRole("button", { name: "Tạo lại" }).click();
    await expect(box).toHaveValue("Gợi ý thứ hai");
  });

  test("AI-003 commits a user-written message normally instead of the suggestion", async ({ page }) => {
    const user = await person("Writer");
    const project = await projectWithChanges(user);
    await loginThroughUi(page, user.user);
    await suggestWith(page, ["Gợi ý của AI"]);
    const dialog = await openCommitDialog(page, project.id);
    await dialog.locator("#commit-message").fill("Tôi tự viết lời nhắn này");
    await dialog.getByRole("button", { name: /tạo commit/i }).click();
    await expect(dialog).toHaveCount(0);
    expect(await lastMessage(user, project.branchId)).toBe("Tôi tự viết lời nhắn này");
  });

  test("AI-004 still commits when the AI service is unreachable", async ({ page }) => {
    const user = await person("Writer");
    const project = await projectWithChanges(user);
    await loginThroughUi(page, user.user);
    await suggestWith(page, ["fail"]);
    const dialog = await openCommitDialog(page, project.id);
    await dialog.getByRole("button", { name: /gợi ý bởi ai/i }).click();
    await dialog.locator("#commit-message").fill("Commit without the AI");
    await dialog.getByRole("button", { name: /tạo commit/i }).click();
    await expect(dialog).toHaveCount(0);
    expect(await lastMessage(user, project.branchId)).toBe("Commit without the AI");
  });

  test("AI-005 does not delay the Commit dialog when the AI answers slowly", async ({ page }) => {
    const user = await person("Writer");
    const project = await projectWithChanges(user);
    await loginThroughUi(page, user.user);
    await suggestWith(page, ["Chậm nhưng đã tới"], 6000);
    await page.goto(`/projects/${project.id}/edit`);
    await expect(page.getByRole("button", { name: /commit changes/i })).toBeEnabled();
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: /commit changes/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /gợi ý bởi ai/i }).click();
    const started = Date.now();
    await expect(dialog.locator("#commit-message")).toBeEditable();
    expect(Date.now() - started).toBeLessThan(3000);
    await dialog.locator("#commit-message").fill("Typed while waiting");
    await expect(dialog.getByRole("button", { name: /tạo commit/i })).toBeEnabled();
  });

  test("AI-006 gives a general message about the scale of a very large change without calling the AI", async () => {
    const user = await person("Writer");
    const project = await user.api.createProject("Huge Change");
    await user.api.putDraft(project.id, [{ id: "a1", pitch: 60, start: 0 }]);
    await user.api.commit(project.branchId, "Base commit");
    const notes = Array.from({ length: 320 }, (_, i) => ({ id: `big${i}`, pitch: 30 + (i % 60), start: 120 * i }));
    await user.api.putDraft(project.id, notes);
    const out = (await user.api.call("POST", "/ai/commit-message", {
      projectId: project.id,
      branchId: project.branchId,
      lang: "vi",
    })) as { suggestion: string | null };
    expect(out.suggestion).toBeTruthy();
    expect(String(out.suggestion).length).toBeGreaterThan(5);
  });

  test("AI-011 shows the measured facts and keeps the merge available without the AI service", async ({ page }) => {
    const user = await person("Merger");
    const project = await user.api.createProject("No AI Merge");
    await user.api.putDraft(project.id, [{ id: "c1", pitch: 60, start: 3840 }]);
    await user.api.commit(project.branchId, "Base commit");
    const branch = await user.api.createBranch(project.id, "alt");
    await user.api.commitOnBranch(
      project.id,
      project.branchId,
      branch.id,
      [{ id: "c1", pitch: 60, start: 3840 }, { id: "x1", pitch: 70, start: 1920 }],
      "Alt notes",
    );
    await loginThroughUi(page, user.user);
    await page.route("**/ai/merge-risk*", async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as Record<string, unknown>;
      body.explanation = null;
      await route.fulfill({ response: res, json: body });
    });
    await page.goto(`/projects/${project.id}?tab=branches`);
    await page.getByRole("button", { name: /hợp nhất vào main/i }).click();
    const panel = page.getByTestId("merge-risk-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/xung đột/i);
    await expect(page.getByRole("alertdialog").getByRole("button", { name: /^hợp nhất$/i })).toBeEnabled();
  });

  test("AI-012 reports a failure instead of a risk assessment when the branches cannot be compared", async ({ page }) => {
    const user = await person("Merger");
    const project = await user.api.createProject("Cannot Compare");
    await user.api.putDraft(project.id, [{ id: "c1", pitch: 60, start: 3840 }]);
    await user.api.commit(project.branchId, "Base commit");
    const branch = await user.api.createBranch(project.id, "alt");
    await user.api.commitOnBranch(
      project.id,
      project.branchId,
      branch.id,
      [{ id: "c1", pitch: 60, start: 3840 }, { id: "x1", pitch: 70, start: 1920 }],
      "Alt notes",
    );
    await loginThroughUi(page, user.user);
    await page.route("**/ai/merge-risk*", (route) =>
      route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "Branches cannot be compared" }) }),
    );
    await page.goto(`/projects/${project.id}?tab=branches`);
    await page.getByRole("button", { name: /hợp nhất vào main/i }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByTestId("merge-risk-panel")).toHaveCount(0);
    await expect(page.getByRole("alertdialog")).toContainText(/không|lỗi|thất bại/i);
  });
});
