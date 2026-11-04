import { expect as baseExpect, test } from "@playwright/test";
import { UserApi } from "./support/api";
import { admin } from "./support/auth-links";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });

test.describe("Non-functional extra", () => {
  test.setTimeout(150_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("Blocked by DFID149, NFR-025 commit, branch and merge screens offer a toggle-based explanation", async ({ page }) => {
    test.fail(true, "DFID149: there is no explanation toggle; the branch screen shows a fixed sentence and the commit dialog none");
    const user = await createE2eUser();
    await createE2eProfile(user);
    const api = await UserApi.for(user);
    const project = await api.createProject("Test Song");
    await api.putDraft(project.id, [{ id: "n1" }]);
    await api.commit(project.branchId, "Verse idea");
    await api.putDraft(project.id, [{ id: "n1" }, { id: "n2", start: 480 }]);
    await loginThroughUi(page, user);
    await page.goto(`/projects/${project.id}/edit`);
    await page.getByRole("button", { name: /commit changes/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /commit là gì|giải thích|\?/i })).toBeVisible({ timeout: 5_000 });
  });

  test("Blocked by DFID150, NFR-037 long lists show 20 items per page", async ({ page }) => {
    test.fail(true, "DFID150: notifications load 30 at a time and pull request lists are not paged");
    const user = await createE2eUser();
    await createE2eProfile(user);
    const rows = Array.from({ length: 21 }, (_, i) => ({
      user_id: user.id,
      type: "fork.created",
      payload: { actorName: `User ${i}` },
      created_at: new Date(Date.now() - i * 60_000).toISOString(),
    }));
    const { error } = await admin().from("notifications").insert(rows);
    if (error) throw new Error(error.message);
    await loginThroughUi(page, user);
    await page.goto("/notifications");
    await expect(page.locator("main li").first()).toBeVisible();
    expect(await page.locator("main li").count()).toBe(20);
  });
});
