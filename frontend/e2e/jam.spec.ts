import { expect as baseExpect, test, type Browser, type Page } from "@playwright/test";
import { UserApi } from "./support/api";
import { admin } from "./support/auth-links";
import { HEADER_H, KEY_WIDTH, PPQ, ROW_H, BAR } from "./support/piano-roll";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const API = ":3101";
const PREFIX = "E2E Jam";

interface Person {
  user: E2eUser;
  name: string;
  api: UserApi;
}

interface JamEvent {
  id: string;
  name: string;
  status: string;
  jam_project_id: string | null;
  resulting_project_id?: string | null;
  scheduled_end_at: string | null;
}

async function person(label: string, role: "user" | "admin" = "user"): Promise<Person> {
  const user = await createE2eUser();
  const name = `User ${label}`;
  await createE2eProfile(user, { username: `${label.toLowerCase()}_${user.id.slice(0, 6)}`, display_name: name });
  if (role === "admin") {
    const { error } = await admin().from("users").update({ role: "admin" }).eq("id", user.id);
    if (error) throw new Error(error.message);
  }
  return { user, name, api: await UserApi.for(user) };
}

async function clearEvents() {
  await admin().from("jam_events").delete().like("name", `${PREFIX}%`);
}

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

async function createEvent(
  boss: Person,
  name: string,
  options: { startIn?: number; endIn?: number; cooldown?: number; startingProjectId?: string } = {},
) {
  return (await boss.api.call("POST", "/admin/jam", {
    name: `${PREFIX} ${name}`,
    scheduledStartAt: iso(options.startIn ?? -1_000),
    scheduledEndAt: iso(options.endIn ?? 3_600_000),
    editCooldownSec: options.cooldown ?? 10,
    ...(options.startingProjectId ? { startingProjectId: options.startingProjectId } : {}),
    confirmOverlap: true,
  })) as JamEvent;
}

async function endEvent(boss: Person, id: string) {
  await boss.api.call("POST", `/admin/jam-events/${id}/end`, {});
}

async function result(id: string) {
  const res = await fetch(`http://localhost:3101/jam/events/${id}/result`);
  return (await res.json()) as {
    hasContributions: boolean;
    resultingProjectId: string | null;
    snapshot: { notes: Array<{ id: string; pitch: number; start: number }> } | null;
    contributors: Array<{ userId: string }>;
  };
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

async function enterRoom(page: Page, id: string) {
  await page.goto(`/jam/${id}`);
  await expect(page.getByRole("group", { name: "Người đang trong phòng Jam" })).toBeVisible();
  await expect(page.getByText("Đang tải bản nhạc chung…")).toHaveCount(0);
}

async function jamPoint(page: Page, tick: number, pitch: number) {
  const box = await page.evaluate(
    ({ pitch, headerH, rowH }) => {
      const canvas = Array.from(document.querySelectorAll("canvas")).find((c) => c.height > 2000);
      if (!canvas) throw new Error("jam grid not found");
      let container: HTMLElement | null = canvas.parentElement;
      while (container && container.scrollHeight <= container.clientHeight + 10) container = container.parentElement;
      if (!container) throw new Error("jam grid scroller not found");
      container.scrollTop = Math.max(0, headerH + (127 - pitch) * rowH + rowH / 2 - container.clientHeight / 2);
      container.scrollLeft = 0;
      const r = canvas.getBoundingClientRect();
      return { left: r.left, top: r.top, scrollTop: 0, scrollLeft: 0 };
    },
    { pitch, headerH: HEADER_H, rowH: ROW_H },
  );
  await page.waitForTimeout(200);
  return {
    x: box.left + KEY_WIDTH + (tick + PPQ / 4) * 0.06 - box.scrollLeft,
    y: box.top + HEADER_H + (127 - pitch) * ROW_H + ROW_H / 2 - box.scrollTop,
  };
}

async function addNote(page: Page, tick: number, pitch = 60) {
  const p = await jamPoint(page, tick, pitch);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(800);
}

function activity(page: Page) {
  return page.getByText("Hoạt động gần đây", { exact: true }).locator("xpath=..");
}


test.describe("Community Jam", () => {
  test.setTimeout(300_000);
  test.beforeEach(async () => {
    await clearEvents();
  });
  test.afterEach(async () => {
    await clearEvents();
    await cleanupE2eUsers();
  });

  test.describe("UC-66 Join", () => {
    test("JAM-001 joins an open Jam from Explore and sees the shared state and participants", async ({ page, browser }) => {
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const b = await person("B");
      const event = await createEvent(boss, "Open Jam");
      const projectsBefore = (await a.api.call("GET", "/projects")) as unknown[];

      const other = await second(browser, b);
      await enterRoom(other.page, event.id);

      await loginThroughUi(page, a.user);
      await page.goto("/explore");
      await page.getByRole("button", { name: "Jam", exact: true }).click();
      await page.getByRole("link", { name: /Tham gia ngay|Open Jam/ }).first().click();
      await expect(page).toHaveURL(new RegExp(`/jam/${event.id}`));
      await expect(page.getByRole("group", { name: "Người đang trong phòng Jam" })).toBeVisible();
      await expect(page.getByText("Còn", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Hoạt động gần đây")).toBeVisible();
      await expect(page.getByRole("group", { name: "Người đang trong phòng Jam" }).locator(`[title*="${b.name}"], [aria-label*="${b.name}"]`).first()).toBeAttached();
      await expect(other.page.getByRole("group", { name: "Người đang trong phòng Jam" }).locator(`[title*="${a.name}"], [aria-label*="${a.name}"]`).first()).toBeAttached();
      await other.context.close();
      expect((await a.api.call("GET", "/projects")) as unknown[]).toHaveLength(projectsBefore.length);
    });

    test("JAM-002 an event that has not started shows its details and opening time only", async ({ page }) => {
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await createEvent(boss, "Evening Jam", { startIn: 2 * 3_600_000, endIn: 3 * 3_600_000 });
      await loginThroughUi(page, a.user);
      await page.goto(`/jam/${event.id}`);
      await expect(page.getByText("Sự kiện chưa bắt đầu")).toBeVisible();
      await expect(page.getByText(/Phòng mở lúc/)).toBeVisible();
      expect(await page.evaluate(() => Array.from(document.querySelectorAll("canvas")).filter((c) => c.height > 2000).length)).toBe(0);
      await expect(page.getByRole("group", { name: "Người đang trong phòng Jam" })).toHaveCount(0);
    });

    test("Blocked by DFID167, JAM-003 leaving and rejoining restores the session with the current state", async ({ page, browser }) => {
      test.fail(true, "DFID167: ending the event does not link the result project, so the frozen result has no snapshot or contributors");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const b = await person("B");
      const event = await createEvent(boss, "Open Jam", { cooldown: 1 });
      await loginThroughUi(page, a.user);
      await enterRoom(page, event.id);
      await page.goto("/projects");

      const other = await second(browser, b);
      await enterRoom(other.page, event.id);
      await addNote(other.page, 0, 60);
      await expect(activity(other.page)).toContainText(`${b.name} thêm nốt`);

      await enterRoom(page, event.id);
      await expect(activity(page)).toContainText(`${b.name} thêm nốt`);
      await other.context.close();
      await endEvent(boss, event.id);
      expect((await result(event.id)).snapshot?.notes.length).toBe(1);
    });

    test("JAM-004 an ended event shows the frozen result read-only", async ({ page }) => {
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await createEvent(boss, "Ended Test");
      await endEvent(boss, event.id);
      await loginThroughUi(page, a.user);
      await page.goto(`/jam/${event.id}`);
      await expect(page.getByText(/đã kết thúc/i).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Vẽ nốt (B)" })).toHaveCount(0);
    });

    test("Blocked by DFID168, JAM-005 a failed live connection is reported with a retry option", async ({ page }) => {
      test.fail(true, "DFID168: a blocked live connection only shows an endless reconnecting banner, with no retry option");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await createEvent(boss, "Open Jam");
      await loginThroughUi(page, a.user);
      let blocked = true;
      await page.route(
        (url) => url.href.includes(API) && url.pathname.startsWith("/socket.io"),
        (route) => (blocked ? route.abort() : route.continue()),
      );
      await page.routeWebSocket(/socket\.io/, (ws) => {
        if (blocked) ws.close();
        else ws.connectToServer();
      });
      await page.goto(`/jam/${event.id}`);
      await expect(page.getByText(/Không kết nối được phòng Jam|Không vào được phiên Jam/).first()).toBeVisible({ timeout: 90_000 });
      expect(await page.evaluate(() => Array.from(document.querySelectorAll("canvas")).filter((c) => c.height > 2000).length)).toBe(0);
      blocked = false;
      await page.getByRole("button", { name: "Thử lại" }).first().click();
      await expect(page.getByRole("group", { name: "Người đang trong phòng Jam" })).toBeVisible();
    });

    test("Blocked by DFID169, JAM-006 a guest is sent to log in and returned to the event", async ({ page }) => {
      test.fail(true, "DFID169: after logging in from the event link the user returns to the event but is not joined until the page is reloaded");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await createEvent(boss, "Open Jam");
      await page.goto(`/jam/${event.id}`);
      await expect(page).toHaveURL(/\/login/);
      await page.locator('input[name="email"]').fill(a.user.email);
      await page.locator('input[name="password"]').fill(a.user.password);
      await page.locator('form button[type="submit"]').click();
      await expect(page).toHaveURL(new RegExp(`/jam/${event.id}`));
      const joined = await page.getByRole("group", { name: "Người đang trong phòng Jam" }).isVisible({ timeout: 60_000 }).catch(() => false);
      await page.waitForTimeout(30_000);
      const joinedLater = await page.getByRole("group", { name: "Người đang trong phòng Jam" }).isVisible();
      await page.reload();
      const afterReload = await page.getByRole("group", { name: "Người đang trong phòng Jam" }).waitFor({ timeout: 30_000 }).then(() => true, () => false);
      console.log(`JAM-006 joined=${joined} joinedLater=${joinedLater} afterReload=${afterReload}`);
      expect(joinedLater).toBe(true);
    });
  });

  test.describe("UC-67 Edit during Jam", () => {
    test("Blocked by DFID167, JAM-007 an edit is applied, broadcast, attributed and starts the cooldown", async ({ page, browser }) => {
      test.fail(true, "DFID167: ending the event does not link the result project, so the frozen result has no snapshot or contributors");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const b = await person("B");
      const event = await createEvent(boss, "Open Jam", { cooldown: 10 });
      const other = await second(browser, b);
      await enterRoom(other.page, event.id);
      await loginThroughUi(page, a.user);
      await enterRoom(page, event.id);
      await addNote(page, 0, 60);
      await expect(activity(page)).toContainText(`${a.name} thêm nốt`);
      await expect(activity(other.page)).toContainText(`${a.name} thêm nốt`);
      await expect(page.getByText(/Chỉnh: (10|9|8)s/)).toBeVisible();
      await other.context.close();
      await endEvent(boss, event.id);
      const frozen = await result(event.id);
      expect(frozen.snapshot?.notes).toHaveLength(1);
      expect(frozen.snapshot?.notes[0]).toMatchObject({ pitch: 60, start: 0 });
    });

    test("Blocked by DFID167, JAM-008 an edit during the cooldown is neither applied nor queued", async ({ page }) => {
      test.fail(true, "DFID167: ending the event does not link the result project, so the frozen result has no snapshot or contributors");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await createEvent(boss, "Open Jam", { cooldown: 10 });
      await loginThroughUi(page, a.user);
      await enterRoom(page, event.id);
      await addNote(page, 0, 60);
      await addNote(page, BAR, 62);
      await expect(page.getByText(/Chỉnh: \d+s/)).toBeVisible();
      await page.waitForTimeout(11_000);
      await endEvent(boss, event.id);
      expect((await result(event.id)).snapshot?.notes.map((n) => n.pitch)).toEqual([60]);
    });

    test("Blocked by DFID167, JAM-009 two near-simultaneous changes of the same note keep the later one", async ({ page, browser }) => {
      test.fail(true, "DFID167: ending the event does not link the result project, so the frozen result has no snapshot or contributors");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const b = await person("B");
      const event = await createEvent(boss, "Open Jam", { cooldown: 1 });
      await loginThroughUi(page, a.user);
      await enterRoom(page, event.id);
      await addNote(page, 0, 60);
      const other = await second(browser, b);
      await enterRoom(other.page, event.id);
      await page.waitForTimeout(1_500);
      const fromA = await jamPoint(page, 0, 60);
      const toA = await jamPoint(page, 0, 62);
      await page.mouse.move(fromA.x, fromA.y);
      await page.mouse.down();
      await page.mouse.move(toA.x, toA.y, { steps: 6 });
      const fromB = await jamPoint(other.page, 0, 60);
      const toB = await jamPoint(other.page, 0, 64);
      await other.page.mouse.move(fromB.x, fromB.y);
      await other.page.mouse.down();
      await other.page.mouse.move(toB.x, toB.y, { steps: 6 });
      await page.mouse.up();
      await other.page.mouse.up();
      await page.waitForTimeout(2_000);
      await expect(page.getByRole("alert").filter({ hasText: /lỗi|không/i })).toHaveCount(0);
      await expect.poll(async () => ((await activity(page).innerText()).match(new RegExp(b.name, "g")) ?? []).length).toBeGreaterThanOrEqual(2);
      await other.context.close();
      await endEvent(boss, event.id);
      expect((await result(event.id)).snapshot?.notes.map((n) => n.pitch)).toEqual([64]);
    });

    test("Blocked by DFID167, JAM-010 when the event ends during editing, changes stop and the frozen result is shown", async ({ page }) => {
      test.fail(true, "DFID167: ending the event does not link the result project, so the frozen result has no snapshot or contributors");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await createEvent(boss, "Open Jam", { cooldown: 1 });
      await boss.api.call("PATCH", `/admin/jam-events/${event.id}`, { scheduledEndAt: iso(70_000) });
      await loginThroughUi(page, a.user);
      await enterRoom(page, event.id);
      await addNote(page, 0, 60);
      await expect(page.getByText(/Bản nhạc đã được đóng băng/)).toBeVisible({ timeout: 150_000 });
      await addNote(page, BAR, 62);
      await expect(page.getByText("Chỉ đọc")).toBeVisible();
      expect((await result(event.id)).snapshot?.notes.map((n) => n.pitch)).toEqual([60]);
    });

    test("JAM-011 a dropped connection stops edits and reconnects to the current state", async ({ page, context }) => {
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await createEvent(boss, "Open Jam", { cooldown: 1 });
      await loginThroughUi(page, a.user);
      await enterRoom(page, event.id);
      await context.setOffline(true);
      await expect(page.getByText(/Mất kết nối tới phòng Jam/)).toBeVisible({ timeout: 60_000 });
      await addNote(page, 0, 60);
      await context.setOffline(false);
      await expect(page.getByText(/Mất kết nối tới phòng Jam/)).toHaveCount(0, { timeout: 60_000 });
      await endEvent(boss, event.id);
      expect((await result(event.id)).snapshot?.notes ?? []).toHaveLength(0);
    });

    test("JAM-012 branching and committing are unavailable during the Jam", async ({ page }) => {
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await createEvent(boss, "Open Jam");
      await loginThroughUi(page, a.user);
      await enterRoom(page, event.id);
      await expect(page.getByRole("button", { name: /commit|nhánh|branch|hợp nhất|merge/i })).toHaveCount(0);
      const projectId = event.jam_project_id ?? (await admin().from("jam_events").select("jam_project_id").eq("id", event.id).single()).data!.jam_project_id;
      const { data: branches } = await admin().from("branches").select("id").eq("project_id", projectId);
      expect(await status(a.api.commit(branches![0].id, "Sneaky"))).toBeGreaterThanOrEqual(400);
      expect(await status(a.api.createBranch(projectId, "sneaky"))).toBeGreaterThanOrEqual(400);
      const { count } = await admin().from("commits").select("id", { count: "exact", head: true }).eq("branch_id", branches![0].id).eq("message", "Sneaky");
      expect(count).toBe(0);
    });
  });

  test.describe("UC-68 Jam result", () => {
    async function endedWithNote(page: Page, boss: Person, player: Person) {
      const event = await createEvent(boss, "Ended Test", { cooldown: 1 });
      await loginThroughUi(page, player.user);
      await enterRoom(page, event.id);
      await addNote(page, 0, 60);
      await expect(activity(page)).toContainText("thêm nốt");
      await endEvent(boss, event.id);
      return event;
    }

    test("Blocked by DFID167, JAM-014 forking the result creates an independent private project", async ({ page, browser }) => {
      test.fail(true, "DFID167: ending the event does not link the result project, so the frozen result has no snapshot or contributors");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const c = await person("C");
      const event = await endedWithNote(page, boss, a);
      const other = await second(browser, c);
      await other.page.goto(`/jam/${event.id}/result`);
      await other.page.getByRole("button", { name: "Sao chép về dự án của tôi" }).click();
      await expect(other.page.getByText("Đã sao chép kết quả Jam về dự án của bạn.")).toBeVisible();
      await other.context.close();
      const mine = (await c.api.call("GET", "/projects")) as Array<{ id: string; visibility: string }>;
      expect(mine).toHaveLength(1);
      expect(mine[0].visibility).toBe("private");
      await c.api.putDraft(mine[0].id, [{ id: "x", pitch: 72 }]);
      expect((await result(event.id)).snapshot?.notes.map((n) => n.pitch)).toEqual([60]);
    });

    test("Blocked by DFID167, JAM-015 a guest sees the result and must log in to fork", async ({ page, browser }) => {
      test.fail(true, "DFID167: ending the event does not link the result project, so the frozen result has no snapshot or contributors");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await endedWithNote(page, boss, a);
      const guest = await (await browser.newContext()).newPage();
      await guest.goto(`/jam/${event.id}/result`);
      await expect(guest.getByRole("button", { name: "Nghe thử" })).toBeVisible();
      await guest.getByRole("button", { name: "Sao chép về dự án của tôi" }).click();
      await expect(guest).toHaveURL(/\/login/);
      expect(guest.url()).toContain(encodeURIComponent(`/jam/${event.id}/result`).slice(0, 10));
      await guest.context().close();
    });

    test("JAM-016 an event with no contributions says so", async ({ page }) => {
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await createEvent(boss, "Empty Test");
      await endEvent(boss, event.id);
      await loginThroughUi(page, a.user);
      await page.goto(`/jam/${event.id}/result`);
      await expect(page.getByText("Sự kiện đã kết thúc mà không có đóng góp nào.")).toBeVisible();
    });

    test("Blocked by DFID167, JAM-017 a result load failure shows a retry message", async ({ page }) => {
      test.fail(true, "DFID167: ending the event does not link the result project, so the frozen result has no snapshot or contributors");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await endedWithNote(page, boss, a);
      let broken = true;
      await page.route(
        (url) => url.href.includes(API) && url.pathname.endsWith("/result"),
        (route) => (broken ? route.fulfill({ status: 500, body: "{}" }) : route.continue()),
      );
      await page.goto(`/jam/${event.id}/result`);
      await expect(page.getByText("Không thể tải kết quả sự kiện Jam. Vui lòng thử lại.")).toBeVisible();
      broken = false;
      await page.getByRole("button", { name: "Thử lại" }).click();
      await expect(page.getByText("Nghệ sĩ tham gia đóng góp")).toBeVisible();
    });

    test("Blocked by DFID167, JAM-018 attempting to edit the result keeps it read-only with an explanation", async ({ page }) => {
      test.fail(true, "DFID167: ending the event does not link the result project, so the frozen result has no snapshot or contributors");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await endedWithNote(page, boss, a);
      await page.goto(`/jam/${event.id}/result`);
      await expect(page.getByText(/Sự kiện đã kết thúc/).first()).toBeVisible();
      const p = await jamPoint(page, BAR, 62);
      await page.mouse.dblclick(p.x, p.y);
      const n = await jamPoint(page, 0, 60);
      await page.mouse.move(n.x, n.y);
      await page.mouse.down();
      await page.mouse.move(n.x + 120, n.y - 44, { steps: 6 });
      await page.mouse.up();
      expect((await result(event.id)).snapshot?.notes.map((x) => [x.pitch, x.start])).toEqual([[60, 0]]);
    });
  });

  test.describe("UC-93 Create event", () => {
    test("JAM-026 a regular user cannot open Jam management or create an event", async ({ page }) => {
      const a = await person("A");
      expect(
        await status(
          a.api.call("POST", "/admin/jam", {
            name: `${PREFIX} Hijack`,
            scheduledStartAt: iso(3_600_000),
            scheduledEndAt: iso(7_200_000),
          }),
        ),
      ).toBe(403);
      const { count } = await admin().from("jam_events").select("id", { count: "exact", head: true }).eq("name", `${PREFIX} Hijack`);
      expect(count).toBe(0);
      await loginThroughUi(page, a.user);
      await page.goto("/admin/jam");
      await expect(page.getByText("Không có quyền truy cập")).toBeVisible();
    });
  });

  test.describe("UC-94 Configure", () => {
    async function openConfig(page: Page, name: string) {
      await page.goto("/admin/jam");
      const row = page.locator("main").locator("div").filter({ hasText: `${PREFIX} ${name}` }).filter({ has: page.getByRole("button", { name: "Cấu hình" }) }).last();
      await row.getByRole("button", { name: "Cấu hình" }).click();
      return page.getByRole("dialog");
    }

    async function auditCount(adminId: string) {
      const { count } = await admin().from("admin_audit_log").select("id", { count: "exact", head: true }).eq("admin_id", adminId);
      return count ?? 0;
    }

    test("JAM-027 every setting of a scheduled event can be changed", async ({ page }) => {
      const boss = await person("Admin", "admin");
      const b = await person("B");
      const pub = await b.api.createProject("Public Song");
      await b.api.putDraft(pub.id, [{ id: "p1" }]);
      await b.api.commit(pub.branchId, "Verse idea");
      await b.api.setVisibility(pub.id, "public");
      const event = await createEvent(boss, "Autumn Jam 2026", { startIn: 86_400_000, endIn: 86_400_000 + 7_200_000 });
      const before = await auditCount(boss.user.id);
      await loginThroughUi(page, boss.user);
      const dialog = await openConfig(page, "Autumn Jam 2026");
      await dialog.locator('input[name="jam-name"]').fill(`${PREFIX} Autumn Jam Final`);
      const end = new Date(Date.now() + 86_400_000 + 3 * 3_600_000);
      const pad = (n: number) => String(n).padStart(2, "0");
      await dialog.locator('input[name="jam-end"]').fill(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`);
      await dialog.locator('select[name="jam-starting-project"]').selectOption(pub.id);
      await dialog.locator('input[name="jam-cooldown"]').fill("15");
      await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
      await expect(page.getByText("Cập nhật cấu hình sự kiện Jam thành công.")).toBeVisible();
      const { data } = await admin().from("jam_events").select("*").eq("id", event.id).single();
      expect(data).toMatchObject({ name: `${PREFIX} Autumn Jam Final`, edit_cooldown_sec: 15, starting_project_id: pub.id });
      expect(await auditCount(boss.user.id)).toBeGreaterThan(before);
    });

    test("JAM-028 a cooldown change on a live event applies from then on", async ({ page }) => {
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await createEvent(boss, "Open Jam", { cooldown: 10 });
      const before = await auditCount(boss.user.id);
      await boss.api.call("PATCH", `/admin/jam-events/${event.id}`, { editCooldownSec: 30 });
      expect(await auditCount(boss.user.id)).toBeGreaterThan(before);
      await loginThroughUi(page, a.user);
      await enterRoom(page, event.id);
      await addNote(page, 0, 60);
      await expect(page.getByText(/Chỉnh: (30|29|28)s/)).toBeVisible();
    });

    test("Blocked by DFID130, JAM-030 a live event offers only the end time and cooldown and participants are told of the new end", async ({
      page,
      browser,
    }) => {
      test.fail(true, "DFID130: participants are not told that the end time changed, the countdown only moves");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await createEvent(boss, "Open Jam");
      const other = await second(browser, a);
      await enterRoom(other.page, event.id);
      await loginThroughUi(page, boss.user);
      const dialog = await openConfig(page, "Open Jam");
      await expect(dialog.locator('input[name="jam-name"]')).toBeDisabled();
      await expect(dialog.locator('select[name="jam-starting-project"]')).toBeDisabled();
      await expect(dialog.getByText(/Tên sự kiện và dự án khởi đầu đã được khóa/)).toBeVisible();
      await expect(dialog.locator('input[name="jam-end"]')).toBeEnabled();
      await expect(dialog.locator('input[name="jam-cooldown"]')).toBeEnabled();
      await boss.api.call("PATCH", `/admin/jam-events/${event.id}`, { scheduledEndAt: iso(90 * 60_000) });
      await expect(other.page.getByText(/thời gian kết thúc|kéo dài|giờ kết thúc/i).first()).toBeVisible({ timeout: 10_000 });
      await other.context.close();
    });

    test("JAM-031 an ended event offers no editable configuration", async ({ page }) => {
      const boss = await person("Admin", "admin");
      const event = await createEvent(boss, "Ended Test");
      await endEvent(boss, event.id);
      await loginThroughUi(page, boss.user);
      await page.goto("/admin/jam");
      const row = page.locator("main div").filter({ hasText: `${PREFIX} Ended Test` }).filter({ has: page.getByRole("button", { name: "Chi tiết" }) }).last();
      await expect(row.getByRole("button", { name: "Cấu hình" })).toHaveCount(0);
      await row.getByRole("button", { name: "Chi tiết" }).click();
      await expect(page.getByRole("dialog")).toContainText("Sự kiện đã kết thúc, không thể thay đổi cấu hình.");
      await expect(page.getByRole("dialog").getByRole("button", { name: "Lưu thay đổi" })).toHaveCount(0);
    });

    test("Blocked by DFID166, JAM-032 an end time in the past is refused and the event stays live", async ({ page }) => {
      test.fail(true, "DFID166: the dialog rejects the time but does not suggest ending the event instead");
      const boss = await person("Admin", "admin");
      const event = await createEvent(boss, "Open Jam");
      expect(await status(boss.api.call("PATCH", `/admin/jam-events/${event.id}`, { scheduledEndAt: iso(-10 * 60_000) }))).toBe(400);
      const { data } = await admin().from("jam_events").select("status, scheduled_end_at").eq("id", event.id).single();
      expect(data!.status).toBe("active");
      expect(new Date(data!.scheduled_end_at).getTime()).toBeGreaterThan(Date.now());
      await loginThroughUi(page, boss.user);
      const dialog = await openConfig(page, "Open Jam");
      const past = new Date(Date.now() - 10 * 60_000);
      const pad = (n: number) => String(n).padStart(2, "0");
      await dialog.locator('input[name="jam-end"]').fill(`${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}T${pad(past.getHours())}:${pad(past.getMinutes())}`);
      await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
      await expect(dialog.getByText(/phải lớn hơn thời điểm hiện tại/)).toBeVisible();
      await expect(dialog.getByText(/Kết thúc sự kiện|kết thúc ngay/i).first()).toBeVisible({ timeout: 5_000 });
    });

    test("JAM-033 a storage failure keeps the previous configuration", async ({ page }) => {
      const boss = await person("Admin", "admin");
      const event = await createEvent(boss, "Autumn Jam 2026", { startIn: 86_400_000, endIn: 86_400_000 + 7_200_000 });
      await loginThroughUi(page, boss.user);
      await page.route(
        (url) => url.href.includes(API) && url.pathname.includes(`/jam`) && url.pathname.includes(event.id),
        (route) => (route.request().method() === "PATCH" ? route.fulfill({ status: 500, body: "{}" }) : route.continue()),
      );
      const dialog = await openConfig(page, "Autumn Jam 2026");
      await dialog.locator('input[name="jam-name"]').fill(`${PREFIX} Changed Name`);
      await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
      await expect(dialog.getByRole("alert").first()).toContainText("Không lưu được cấu hình sự kiện.");
      const { data } = await admin().from("jam_events").select("name").eq("id", event.id).single();
      expect(data!.name).toBe(`${PREFIX} Autumn Jam 2026`);
    });
  });

  test.describe("UC-95 End event", () => {
    test("Blocked by DFID167, JAM-034 the event ends at its end time and the result is frozen", async ({ page, browser }) => {
      test.fail(true, "DFID167: ending the event does not link the result project, so the frozen result has no snapshot or contributors");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const b = await person("B");
      const event = await createEvent(boss, "Open Jam", { cooldown: 1 });
      await boss.api.call("PATCH", `/admin/jam-events/${event.id}`, { scheduledEndAt: iso(80_000) });
      await loginThroughUi(page, a.user);
      await enterRoom(page, event.id);
      const other = await second(browser, b);
      await enterRoom(other.page, event.id);
      await addNote(page, 0, 60);
      await addNote(other.page, BAR, 64);
      await expect(page.getByText(/Bản nhạc đã được đóng băng/)).toBeVisible({ timeout: 150_000 });
      await expect(other.page.getByText(/Bản nhạc đã được đóng băng/)).toBeVisible();
      await addNote(page, 2 * BAR, 67);
      await other.context.close();
      const frozen = await result(event.id);
      expect(frozen.snapshot?.notes.map((n) => n.pitch).sort()).toEqual([60, 64]);
      expect(frozen.contributors.map((c) => c.userId).sort()).toEqual([a.user.id, b.user.id].sort());
      const { count } = await admin().from("commits").select("id, branches!inner(project_id)", { count: "exact", head: true }).eq("branches.project_id", frozen.resultingProjectId!);
      expect(count).toBe(1);
      await page.getByRole("link", { name: "Xem kết quả Jam" }).click();
      await expect(page.getByText("Nghệ sĩ tham gia đóng góp")).toBeVisible();
      const { data } = await admin().from("jam_events").select("status").eq("id", event.id).single();
      expect(data!.status).toBe("ended");
    });

    test("JAM-035 ending early warns how many participants are editing and needs confirmation", async ({ page, browser }) => {
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const b = await person("B");
      const event = await createEvent(boss, "Open Jam");
      const ctxA = await second(browser, a);
      await enterRoom(ctxA.page, event.id);
      const ctxB = await second(browser, b);
      await enterRoom(ctxB.page, event.id);
      const { count: before } = await admin().from("admin_audit_log").select("id", { count: "exact", head: true }).eq("admin_id", boss.user.id);
      await loginThroughUi(page, boss.user);
      await page.goto("/admin/jam");
      await page.getByRole("button", { name: "Kết thúc sự kiện" }).first().click();
      const confirm = page.getByRole("dialog", { name: "Xác nhận kết thúc sự kiện Jam" }).or(page.getByRole("alertdialog", { name: "Xác nhận kết thúc sự kiện Jam" }));
      await expect(confirm).toContainText("Đang có 2 người tham gia trong phòng.");
      await confirm.getByRole("button", { name: "Xác nhận kết thúc" }).click();
      await expect(page.getByText("Sự kiện Jam đã được kết thúc thành công.")).toBeVisible();
      await expect(ctxA.page.getByText(/Bản nhạc đã được đóng băng/)).toBeVisible();
      await ctxA.context.close();
      await ctxB.context.close();
      const { count: after } = await admin().from("admin_audit_log").select("id", { count: "exact", head: true }).eq("admin_id", boss.user.id);
      expect(after!).toBeGreaterThan(before!);
    });

    test("Blocked by DFID130, JAM-036 extending the end time keeps the event running and participants are told", async ({ page }) => {
      test.fail(true, "DFID130: participants are not told that the end time changed");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await createEvent(boss, "Open Jam", { cooldown: 1 });
      await loginThroughUi(page, a.user);
      await enterRoom(page, event.id);
      await boss.api.call("PATCH", `/admin/jam-events/${event.id}`, { scheduledEndAt: iso(90 * 60_000) });
      const { data } = await admin().from("jam_events").select("status").eq("id", event.id).single();
      expect(data!.status).toBe("active");
      await addNote(page, 0, 60);
      await expect(activity(page)).toContainText(`${a.name} thêm nốt`);
      await expect(page.getByText(/thời gian kết thúc|kéo dài|giờ kết thúc/i).first()).toBeVisible({ timeout: 10_000 });
    });

    test("JAM-037 an event with no changes closes without an empty commit", async ({ page }) => {
      const boss = await person("Admin", "admin");
      const event = await createEvent(boss, "Quiet Jam");
      await loginThroughUi(page, boss.user);
      await page.goto("/admin/jam");
      await page.getByRole("button", { name: "Kết thúc sự kiện" }).first().click();
      await page.getByRole("button", { name: "Xác nhận kết thúc" }).click();
      await expect(page.getByText("Sự kiện Jam đã được kết thúc thành công.")).toBeVisible();
      const { data } = await admin().from("jam_events").select("status, no_result, resulting_project_id, jam_project_id").eq("id", event.id).single();
      expect(data!.status).toBe("ended");
      expect(data!.no_result).toBe(true);
      const projectIds = [data!.resulting_project_id, data!.jam_project_id].filter(Boolean) as string[];
      if (projectIds.length > 0) {
        const { data: branches } = await admin().from("branches").select("id").in("project_id", projectIds);
        const { count } = await admin().from("commits").select("id", { count: "exact", head: true }).in("branch_id", (branches ?? []).map((b) => b.id));
        expect(count).toBe(0);
      }
    });

    test("Blocked by DFID167, JAM-039 an edit made at the moment the event ends is not applied", async ({ page }) => {
      test.fail(true, "DFID167: ending the event does not link the result project, so the frozen result has no snapshot or contributors");
      const boss = await person("Admin", "admin");
      const a = await person("A");
      const event = await createEvent(boss, "Open Jam", { cooldown: 1 });
      await loginThroughUi(page, a.user);
      await enterRoom(page, event.id);
      await addNote(page, 0, 60);
      await page.waitForTimeout(1_500);
      const from = await jamPoint(page, 0, 60);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 100, from.y - 44, { steps: 4 });
      await endEvent(boss, event.id);
      await page.waitForTimeout(1_000);
      await page.mouse.up();
      await expect(page.getByText(/Bản nhạc đã được đóng băng/)).toBeVisible();
      expect((await result(event.id)).snapshot?.notes.map((n) => [n.pitch, n.start])).toEqual([[60, 0]]);
    });
  });
});
