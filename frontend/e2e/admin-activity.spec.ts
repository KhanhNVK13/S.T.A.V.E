import { expect as baseExpect, test } from "@playwright/test";
import { admin } from "./support/auth-links";
import { httpStatus, person, publicProject } from "./support/people";
import { cleanupE2eUsers, loginThroughUi } from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });

interface Activity {
  items: {
    action: string;
    targetName: string | null;
    targetDeleted: boolean;
    occurredAt: string;
    locationApprox: null;
  }[];
  nextCursor: string | null;
}

function day(offset: number): string {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
}

test.describe("Admin user activity log", () => {
  test.setTimeout(240_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("ADM-USR-029 lists the user's events newest first as metadata only", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const subject = await person("Subject");
    await subject.api.createProject("B Private");
    await publicProject(subject, "Public Song");
    const log = (await boss.api.call(
      "GET",
      `/admin/users/${subject.user.id}/activity?from=${day(-30)}&to=${day(0)}`,
    )) as Activity;
    const actions = log.items.map((item) => item.action);
    expect(actions).toEqual(expect.arrayContaining(["auth.sign_in", "project.created", "project.published"]));
    const times = log.items.map((item) => new Date(item.occurredAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    const json = JSON.stringify(log);
    expect(json).not.toContain("snapshot");
    expect(json).not.toContain('"notes"');
    const projectOnly = (await boss.api.call(
      "GET",
      `/admin/users/${subject.user.id}/activity?type=projects`,
    )) as Activity;
    expect(projectOnly.items.length).toBeGreaterThan(0);
    expect(projectOnly.items.every((item) => item.action.startsWith("project."))).toBe(true);
    await loginThroughUi(page, boss.user);
    await page.goto(`/admin/users/${subject.user.id}/activity`);
    await expect(page.getByText("Vị trí chỉ gần đúng và có thể sai.")).toBeVisible();
    await expect(page.getByText("B Private").first()).toBeVisible();
  });

  test("ADM-USR-030 filtering to sign-in events shows only the access history", async () => {
    const boss = await person("Boss", "admin");
    const subject = await person("Subject");
    await subject.api.createProject("Some Song");
    const log = (await boss.api.call(
      "GET",
      `/admin/users/${subject.user.id}/activity?type=signin`,
    )) as Activity;
    expect(log.items.length).toBeGreaterThan(0);
    expect(log.items.every((item) => item.action === "auth.sign_in")).toBe(true);
    expect(log.items.every((item) => item.locationApprox === null)).toBe(true);
  });

  test("ADM-USR-031 explains a period with no activity", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const subject = await person("Subject");
    await subject.api.createProject("Some Song");
    const empty = (await boss.api.call(
      "GET",
      `/admin/users/${subject.user.id}/activity?from=2001-01-01&to=2001-01-31`,
    )) as Activity;
    expect(empty.items).toEqual([]);
    await loginThroughUi(page, boss.user);
    await page.goto(`/admin/users/${subject.user.id}/activity`);
    await page.locator('input[name="activity-from"]').fill("2001-01-01");
    await page.locator('input[name="activity-to"]').fill("2001-01-31");
    await expect(page.getByText("Không có hoạt động trong khoảng thời gian này")).toBeVisible();
  });

  test("ADM-USR-032 reports an error instead of 'no activity' when the log cannot be retrieved", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const subject = await person("Subject");
    await loginThroughUi(page, boss.user);
    await page.route(
      (url) => url.port === "3101" && /\/admin\/users\/[^/]+\/activity/.test(url.pathname),
      (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await page.goto(`/admin/users/${subject.user.id}/activity`);
    await expect(page.getByText(/Không tải được hoạt động/)).toBeVisible();
    await expect(page.getByText("Không có hoạt động trong khoảng thời gian này")).toHaveCount(0);
  });

  test("ADM-USR-033 still lists an event about a deleted project and names it as deleted", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const subject = await person("Subject");
    const project = await subject.api.createProject("Temp Song");
    await subject.api.call("DELETE", `/projects/${project.id}`);
    const log = (await boss.api.call("GET", `/admin/users/${subject.user.id}/activity`)) as Activity;
    const created = log.items.find((item) => item.action === "project.created");
    expect(created?.targetName).toBe("Temp Song");
    expect(created?.targetDeleted).toBe(true);
    expect(log.items.some((item) => item.action === "project.deleted")).toBe(true);
    await loginThroughUi(page, boss.user);
    await page.goto(`/admin/users/${subject.user.id}/activity`);
    await expect(page.getByText("(đã xoá)").first()).toBeVisible();
  });

  test("ADM-USR-027 leaves the account in place when removal fails partway", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const subject = await person("Victim");
    await publicProject(subject, "Public Song");
    await subject.api.createProject("Private One");
    await loginThroughUi(page, boss.user);
    await page.route(
      (url) => url.port === "3101" && url.pathname === `/admin/users/${subject.user.id}`,
      (route) =>
        route.request().method() === "DELETE"
          ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
          : route.continue(),
    );
    await page.goto("/admin/users");
    await page.locator('input[name="q"]').fill(subject.username);
    await page.getByRole("button", { name: /^Tìm$/ }).click();
    await page
      .getByText(`@${subject.username}`, { exact: true })
      .first()
      .locator("xpath=ancestor::div[contains(@class,'min-h-')][1]")
      .getByRole("button", { name: /xoá/i })
      .click();
    const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog")).first();
    await dialog.locator("textarea").fill("Policy violation confirmed by review");
    await dialog.locator("input").fill(subject.username);
    await dialog.getByRole("button", { name: /xác nhận/i }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    const { data: user } = await admin().from("users").select("status").eq("id", subject.user.id).single();
    expect(user?.status).toBe("active");
    const { data: projects } = await admin().from("projects").select("id").eq("owner_id", subject.user.id);
    expect((projects ?? []).length).toBe(2);
    expect(await httpStatus(subject.api.call("GET", "/auth/sessions"))).toBe(200);
  });
});
