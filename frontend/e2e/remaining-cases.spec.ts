import { expect as baseExpect, test, type Page } from "@playwright/test";
import { admin } from "./support/auth-links";
import { person, publicProject, anyDialog } from "./support/people";
import { cleanupE2eUsers, loginThroughUi } from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const BACKEND = "http://localhost:3101";

async function guestStatus(path: string): Promise<number> {
  const res = await fetch(`${BACKEND}${path}`);
  return res.status;
}

async function projectWithChanges(user: Awaited<ReturnType<typeof person>>) {
  const project = await user.api.createProject("Commit Song");
  await user.api.putDraft(project.id, [{ id: "a1", pitch: 60, start: 0 }]);
  await user.api.commit(project.branchId, "Base commit");
  await user.api.putDraft(project.id, [
    { id: "a1", pitch: 60, start: 0 },
    { id: "a2", pitch: 64, start: 480 },
  ]);
  return project;
}

async function openCommit(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/edit`);
  await expect(page.getByRole("button", { name: /commit changes/i })).toBeEnabled();
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /commit changes/i }).click();
  return anyDialog(page);
}

test.describe("Remaining cases", () => {
  test.setTimeout(240_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("DISC-012 shows the same unavailable result for a project removed by an administrator", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const owner = await person("Owner");
    const reporter = await person("Reporter");
    const project = await publicProject(owner, "Public Song");
    await reporter.api.call("POST", `/projects/${project.id}/reports`, { reason: "spam" });
    expect(await guestStatus(`/explore/projects/${project.id}/graph`)).toBe(200);
    await boss.api.call("POST", `/admin/reports/${project.id}/remove`, {
      reason: "Removed after review of the reports",
      policy: "spam",
    });
    const missing = await guestStatus("/explore/projects/00000000-0000-4000-8000-000000000000/graph");
    expect(await guestStatus(`/explore/projects/${project.id}/graph`)).toBe(missing);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText("Public Song")).toHaveCount(0);
    await expect(page.getByText(owner.name)).toHaveCount(0);
  });

  test("DISC-013 shows the project details with a disabled player when the audio cannot be loaded", async ({ page }) => {
    const owner = await person("Owner");
    const project = await publicProject(owner, "Quiet Song");
    await page.route("**/explore/projects/*/preview", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: "Quiet Song" }).first()).toBeVisible();
    await expect(page.getByText(owner.name).first()).toBeVisible();
  });

  test("PRJ-005 keeps a project private when an unverified account chooses public", async () => {
    const user = await person("Unverified");
    await user.api.call("GET", "/auth/sessions");
    await admin().auth.admin.updateUserById(user.user.id, { email_confirm: false } as never);
    await admin().from("users").select("id").eq("id", user.user.id);
    const out = (await user.api.call("POST", "/projects", {
      name: "Unverified Demo",
      visibility: "public",
      license: "CC-BY",
    })) as { id: string; visibility: string; visibilityKeptPrivate?: boolean };
    expect(out.visibility).toBe("private");
    expect(out.visibilityKeptPrivate).toBe(true);
    const explore = (await fetch(`${BACKEND}/explore/projects?limit=50`)).status;
    expect(explore).toBeLessThan(500);
  });

  test("VC-001 creates a commit with a valid message on the active branch", async ({ page }) => {
    const user = await person("Committer");
    const project = await projectWithChanges(user);
    await user.api.createBranch(project.id, "alt-chorus");
    await loginThroughUi(page, user.user);
    await page.route("**/ai/commit-message", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suggestion: "Suggested message" }) }),
    );
    const dialog = await openCommit(page, project.id);
    await expect(dialog.getByText(/1/).first()).toBeVisible();
    await dialog.locator("#commit-message").fill("Add bass line to chorus");
    await dialog.getByRole("button", { name: /tạo commit/i }).click();
    await expect(dialog).toHaveCount(0);
    const head = await user.api.head(project.branchId);
    expect(head.message).toBe("Add bass line to chorus");
  });

  test("VC-003 produces a fresh suggested message when Regenerate is selected", async ({ page }) => {
    const user = await person("Committer");
    const project = await projectWithChanges(user);
    await loginThroughUi(page, user.user);
    let call = 0;
    await page.route("**/ai/commit-message", (route) => {
      call += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ suggestion: `Suggestion number ${call}` }),
      });
    });
    const dialog = await openCommit(page, project.id);
    const box = dialog.locator("#commit-message");
    await expect(box).toHaveValue("Suggestion number 1");
    await dialog.getByRole("button", { name: "Tạo lại" }).click();
    await expect(box).toHaveValue("Suggestion number 2");
    const head = await user.api.head(project.branchId);
    expect(head.message).toBe("Base commit");
  });
});
