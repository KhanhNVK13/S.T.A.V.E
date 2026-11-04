import { expect as baseExpect, test, type Browser } from "@playwright/test";
import { UserApi } from "./support/api";
import { admin } from "./support/auth-links";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const BACKEND = "http://localhost:3101";

interface Person {
  user: E2eUser;
  username: string;
  name: string;
  api: UserApi;
}

async function person(label: string, role: "user" | "admin" = "user"): Promise<Person> {
  const user = await createE2eUser();
  const username = `${label.toLowerCase().replace(/\s/g, "")}_${user.id.slice(0, 6)}`;
  const name = `User ${label}`;
  await createE2eProfile(user, { username, display_name: name });
  if (role === "admin") await admin().from("users").update({ role: "admin" }).eq("id", user.id);
  return { user, username, name, api: await UserApi.for(user) };
}

async function status(call: Promise<unknown>) {
  try {
    await call;
    return 200;
  } catch (error) {
    return Number(/-> (\d+)/.exec(String(error))?.[1] ?? 0);
  }
}

async function second(browser: Browser, who: Person) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginThroughUi(page, who.user);
  return { context, page };
}

test.describe("Admin extra", () => {
  test.setTimeout(240_000);
  test.afterEach(async () => {
    await admin().from("jam_events").delete().like("name", "E2E Admin Jam%");
    await cleanupE2eUsers();
  });

  test("ADM-USR-006 the user list shows 20 accounts per page without repeats", async ({ page }) => {
    const boss = await person("Admin", "admin");
    for (let i = 0; i < 25; i += 1) {
      const u = await createE2eUser();
      await createE2eProfile(u, { username: `pg_${i}_${u.id.slice(0, 5)}`, display_name: `Paged ${i}` });
    }
    await loginThroughUi(page, boss.user);
    await page.goto("/admin/users");
    const handles = page.locator("main").getByText(/^@/);
    await expect(handles.first()).toBeVisible();
    expect(await handles.count()).toBe(20);
    const first = await handles.allInnerTexts();
    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(handles.first()).not.toHaveText(first[0]);
    const next = await handles.allInnerTexts();
    expect(next.length).toBeGreaterThan(0);
    expect(next.filter((h) => first.includes(h))).toEqual([]);
  });

  test("Blocked by DFID171, ADM-USR-013 suspending a user in a live Jam removes them from the session", async ({ page, browser }) => {
    test.fail(true, "DFID171: a suspended user stays in the live Jam session");
    const boss = await person("Admin", "admin");
    const a = await person("A");
    const b = await person("B");
    const event = (await boss.api.call("POST", "/admin/jam", {
      name: "E2E Admin Jam Live",
      scheduledStartAt: new Date(Date.now() - 1_000).toISOString(),
      scheduledEndAt: new Date(Date.now() + 3_600_000).toISOString(),
      editCooldownSec: 1,
      confirmOverlap: true,
    })) as { id: string };
    const room = "Người đang trong phòng Jam";
    const bCtx = await second(browser, b);
    await bCtx.page.goto(`/jam/${event.id}`);
    await expect(bCtx.page.getByRole("group", { name: room })).toBeVisible();
    await loginThroughUi(page, a.user);
    await page.goto(`/jam/${event.id}`);
    const roster = page.getByRole("group", { name: room });
    await expect(roster.locator(`[title*="${b.name}"], [aria-label*="${b.name}"]`).first()).toBeAttached();
    await boss.api.call("POST", `/admin/users/${b.user.id}/suspend`, { reason: "Spam in the jam" });
    const { data } = await admin().from("users").select("status").eq("id", b.user.id).single();
    expect(data!.status).toBe("suspended");
    await expect(roster.locator(`[title*="${b.name}"], [aria-label*="${b.name}"]`)).toHaveCount(0, { timeout: 30_000 });
    await expect(bCtx.page.getByRole("button", { name: "Vẽ nốt (B)" })).toBeDisabled({ timeout: 30_000 });
    await bCtx.context.close();
  });

  test("ADM-USR-016 a removed account cannot be reactivated", async ({ page }) => {
    const boss = await person("Admin", "admin");
    const d = await person("D");
    await boss.api.call("DELETE", `/admin/users/${d.user.id}`, { reason: "Gone", confirmUsername: d.username });
    expect(await status(boss.api.call("POST", `/admin/users/${d.user.id}/reactivate`, { reason: "Back" }))).toBeGreaterThanOrEqual(400);
    await loginThroughUi(page, boss.user);
    await page.goto("/admin/users");
    await page.locator('input[name="q"]').fill(d.username);
    await page.getByRole("button", { name: /^Tìm$/ }).click();
    const row = page.getByText(`@${d.username}`, { exact: true });
    if (await row.count()) {
      const container = row.first().locator("xpath=ancestor::div[contains(@class,'min-h-')][1]");
      await expect(container.getByRole("button", { name: "Mở khoá" })).toHaveCount(0);
    }
    const { data } = await admin().from("users").select("status").eq("id", d.user.id).maybeSingle();
    expect(data?.status ?? "removed").not.toBe("active");
  });

  test("ADM-USR-017 reactivation skips a public project deleted during suspension", async ({ page }) => {
    const boss = await person("Admin", "admin");
    const b = await person("B");
    const pub = await b.api.createProject("Public Song");
    await b.api.putDraft(pub.id, [{ id: "n1" }]);
    await b.api.commit(pub.branchId, "Verse idea");
    await b.api.setVisibility(pub.id, "public");
    const other = await b.api.createProject("B Second Song");
    await b.api.putDraft(other.id, [{ id: "n1" }]);
    await b.api.commit(other.branchId, "Verse idea");
    await b.api.setVisibility(other.id, "public");
    await boss.api.call("POST", `/admin/users/${b.user.id}/suspend`, { reason: "Check" });
    await admin().from("projects").delete().eq("id", other.id);
    await boss.api.call("POST", `/admin/users/${b.user.id}/reactivate`, { reason: "Resolved" });
    const { data } = await admin().from("users").select("status").eq("id", b.user.id).single();
    expect(data!.status).toBe("active");
    const explore = JSON.stringify(await (await fetch(`${BACKEND}/explore/projects?page=1&limit=50`)).json());
    expect(explore).toContain(pub.id);
    expect(explore).not.toContain(other.id);
    await page.goto(`/creator/${b.user.id}`);
    await expect(page.getByText("Public Song")).toBeVisible();
    await expect(page.getByText("B Second Song")).toHaveCount(0);
  });

  test("Blocked by DFID148, ADM-USR-021 the removal dialog offers suspension instead", async ({ page }) => {
    test.fail(true, "DFID148: the removal dialog has no option to suspend instead");
    const boss = await person("Admin", "admin");
    const b = await person("B");
    await loginThroughUi(page, boss.user);
    await page.goto("/admin/users");
    await page.locator('input[name="q"]').fill(b.username);
    await page.getByRole("button", { name: /^Tìm$/ }).click();
    const row = page.getByText(`@${b.username}`, { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'min-h-')][1]");
    await row.getByRole("button", { name: "Xoá" }).click();
    const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog"));
    await expect(dialog).toContainText(`Xoá vĩnh viễn @${b.username}`);
    await dialog.getByRole("button", { name: /tạm khoá|đình chỉ/i }).click({ timeout: 5_000 });
  });
});
