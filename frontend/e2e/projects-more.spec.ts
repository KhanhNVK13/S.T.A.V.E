import { expect as baseExpect, test, type Page } from "@playwright/test";
import { UserApi } from "./support/api";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const BACKEND = "http://localhost:3101";

async function ownerWith(page: Page, visibility: "public" | "private") {
  const user = await createE2eUser();
  await createE2eProfile(user);
  const api = await UserApi.for(user);
  const p = await api.createProject("Test Song");
  await api.putDraft(p.id, [{ id: "n1" }]);
  await api.commit(p.branchId, "Verse idea");
  if (visibility === "public") await api.setVisibility(p.id, "public");
  await loginThroughUi(page, user);
  return { user, api, ...p };
}

function projectRow(page: Page, name: string) {
  return page
    .getByText(name, { exact: true })
    .first()
    .locator("xpath=ancestor::div[contains(@class,'grid')][1]");
}

async function exploreHas(projectId: string) {
  const res = await fetch(`${BACKEND}/explore/projects?search=Test`);
  return (await res.text()).includes(projectId);
}

test.describe("Project management, further cases", () => {
  test.setTimeout(150_000);
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test("PRJ-013 blocks editing a project that was archived in another session", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID053: a project archived in another session can still be renamed; the save succeeds with Saved and no message says archived projects are read-only",
    );
    const { api, id } = await ownerWith(page, "private");
    await page.goto(`/projects/${id}/settings`);
    await expect(page.locator('input[name="name"]')).toHaveValue("Test Song");
    await api.archive(id);
    await page.locator('input[name="name"]').fill("Renamed While Archived");
    await page.getByRole("button", { name: /lưu thay đổi/i }).click();
    await expect(
      page.getByText(/^Đã lưu\.$/).or(page.getByRole("alert")).first(),
    ).toBeVisible();
    await expect
      .soft(page.getByText(/chỉ xem được|chỉ đọc|khôi phục dự án trước/i))
      .toBeVisible({ timeout: 5_000 });
    const project = (await api.call("GET", `/projects/${id}`)) as {
      name: string;
    };
    expect(project.name).toBe("Test Song");
  });

  test("PRJ-016 archives a public project and removes it from Explore", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID048: archiving gives no undo option and the confirmation does not say the project can be restored at any time",
    );
    const { id } = await ownerWith(page, "public");
    expect(await exploreHas(id)).toBe(true);
    await page.goto("/projects");
    await projectRow(page, "Test Song")
      .getByRole("button", { name: /lưu trữ/i })
      .click();
    const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await expect.soft(dialog).toContainText(/bất cứ lúc nào|khôi phục/i);
    await dialog.getByRole("button", { name: /^lưu trữ$/i }).click();
    await expect
      .soft(page.getByRole("button", { name: /hoàn tác/i }))
      .toBeVisible({ timeout: 5_000 });
    await page.getByText(/^Đã lưu trữ/).first().click();
    await expect(projectRow(page, "Test Song")).toContainText("Đã lưu trữ");
    await page.goto(`/projects/${id}?tab=commits`);
    await expect(page.getByText("Verse idea")).toBeVisible();
    await page.goto(`/projects/${id}/edit`);
    await expect(page.getByText(/đã được lưu trữ/i)).toBeVisible();
    expect(await exploreHas(id)).toBe(false);
  });

  test("PRJ-035 restores an archived project to its previous visibility", async ({
    page,
  }) => {
    const { api, id } = await ownerWith(page, "public");
    await api.archive(id);
    expect(await exploreHas(id)).toBe(false);
    await page.goto("/projects?tab=archived");
    await projectRow(page, "Test Song")
      .getByRole("button", { name: /khôi phục/i })
      .click();
    await page.goto("/projects?tab=active");
    await expect(projectRow(page, "Test Song")).toContainText("Công khai");
    await expect(projectRow(page, "Test Song")).not.toContainText(
      "Đã lưu trữ",
    );
    expect(await exploreHas(id)).toBe(true);
    await page.goto(`/projects/${id}/edit`);
    await expect(
      page.getByRole("button", { name: /commit changes/i }),
    ).toBeVisible();
    await expect(page.getByText("Verse idea").first()).toBeVisible();
  });

  test("PRJ-037 keeps the previous visibility when the confirmation is cancelled", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID022: visibility changes as soon as the option is selected; there is no confirmation to cancel",
    );
    const { api, id } = await ownerWith(page, "private");
    await page.goto(`/projects/${id}/settings`);
    await page.getByRole("radio", { name: /công khai/i }).click();
    const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByRole("button", { name: /^huỷ$/i }).click();
    const project = (await api.call("GET", `/projects/${id}`)) as {
      visibility: string;
    };
    expect(project.visibility).toBe("private");
    expect(await exploreHas(id)).toBe(false);
  });
});
