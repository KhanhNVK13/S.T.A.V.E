import { expect, test } from "@playwright/test";
import {
  cleanupE2eUsers,
  countCommitsOfProject,
  createE2eProfile,
  createE2eProject,
  createE2eUser,
} from "./support/test-user";

test.describe("Guest access", () => {
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test("AUTH-099 shows a public project to a guest and refuses a commit request without a session", async ({
    page,
    request,
  }) => {
    const owner = await createE2eUser();
    await createE2eProfile(owner);
    const projectId = await createE2eProject(
      owner.id,
      "Public Song e2e",
      "public",
    );

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText("Public Song e2e").first()).toBeVisible();

    const response = await request.post("http://localhost:3101/commits", {
      data: { branch_id: projectId, message: "Guest commit" },
    });
    expect([401, 403]).toContain(response.status());
    expect(await countCommitsOfProject(projectId)).toBe(0);
  });
});
