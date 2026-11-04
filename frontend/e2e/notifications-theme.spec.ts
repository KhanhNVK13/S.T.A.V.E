import { expect as baseExpect, test, type Page } from "@playwright/test";
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
const API = ":3101";

async function member(label = "User A") {
  const user = await createE2eUser();
  await createE2eProfile(user, { display_name: label });
  return { user, api: await UserApi.for(user) };
}

async function seedNotification(userId: string, type: string, payload: Record<string, unknown>, options: { at?: Date; read?: boolean } = {}) {
  const at = (options.at ?? new Date()).toISOString();
  const { error } = await admin().from("notifications").insert({ user_id: userId, type, payload, created_at: at, read_at: options.read ? at : null });
  if (error) throw new Error(error.message);
}

async function unread(userId: string) {
  const { count } = await admin().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  return count ?? 0;
}

function list(page: Page) {
  return page.locator("main li");
}

async function theme(page: Page) {
  return page.evaluate(() => document.documentElement.getAttribute("data-theme"));
}

async function openPersonalization(page: Page) {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Cá nhân hoá" }).click();
  await expect(page.getByRole("button", { name: "Lưu theme" })).toBeVisible();
}

async function storedTheme(user: E2eUser) {
  const { data } = await admin().from("users").select("active_theme_id").eq("id", user.id).single();
  const themeId = (data as { active_theme_id: string | null }).active_theme_id;
  if (!themeId) return null;
  const { data: row } = await admin().from("themes").select("preset_key").eq("id", themeId).single();
  return (row as { preset_key: string | null } | null)?.preset_key ?? null;
}

test.describe("Notifications and personalization", () => {
  test.setTimeout(150_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("NOT-001 lists notifications newest first by day and opening one marks it read", async ({ page }) => {
    const { user, api } = await member();
    const project = await api.createProject("Test Song");
    const yesterday = new Date(Date.now() - 26 * 3_600_000);
    await seedNotification(user.id, "fork.created", { projectId: project.id, actorName: "User C" }, { at: yesterday });
    await seedNotification(user.id, "fork.created", { projectId: project.id, actorName: "User D" }, { at: new Date(Date.now() - 60_000) });
    await seedNotification(user.id, "comment.new", { projectId: project.id, commentId: "c1", actorName: "User B" });
    await loginThroughUi(page, user);
    await page.getByRole("link", { name: "Thông báo" }).first().click();
    await expect(page).toHaveURL(/\/notifications/);
    await expect(page.getByText("Hôm nay")).toBeVisible();
    await expect(page.getByText("Hôm qua")).toBeVisible();
    await expect(page.getByText("Chưa đọc").first()).toBeAttached();
    expect(await unread(user.id)).toBe(3);
    await list(page).first().click();
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}`));
    expect(await unread(user.id)).toBe(2);
    expect(((await api.call("GET", `/projects/${project.id}`)) as { name: string }).name).toBe("Test Song");
  });

  test("NOT-002 Mark all as read clears every unread marker", async ({ page }) => {
    const { user } = await member();
    for (let i = 0; i < 3; i += 1) await seedNotification(user.id, "fork.created", { actorName: `User ${i}` });
    await loginThroughUi(page, user);
    await page.goto("/notifications");
    await page.getByRole("button", { name: "Đánh dấu tất cả đã đọc" }).click();
    await expect.poll(() => unread(user.id)).toBe(0);
    await expect(page).toHaveURL(/\/notifications$/);
  });

  test("NOT-003 the unread and mentions filters narrow the list", async ({ page }) => {
    const { user } = await member();
    await seedNotification(user.id, "fork.created", { actorName: "Read one" }, { read: true });
    await seedNotification(user.id, "fork.created", { actorName: "Unread one" });
    await seedNotification(user.id, "comment.reply", { actorName: "Mention one", commentId: "x" }, { read: true });
    await loginThroughUi(page, user);
    await page.goto("/notifications");
    await expect(list(page)).toHaveCount(3);
    await page.getByRole("tab", { name: "Chưa đọc" }).click();
    await expect(list(page)).toHaveCount(1);
    await page.getByRole("tab", { name: "Nhắc đến bạn" }).click();
    await expect(list(page)).toHaveCount(1);
  });

  test("NOT-004 a user with no notifications sees an empty state", async ({ page }) => {
    const { user } = await member("User E");
    await loginThroughUi(page, user);
    await page.goto("/notifications");
    await expect(page.getByText("Chưa có thông báo nào.")).toBeVisible();
  });

  test("NOT-005 a retrieval failure is reported instead of an empty list", async ({ page }) => {
    const { user } = await member();
    await seedNotification(user.id, "fork.created", { actorName: "User C" });
    await loginThroughUi(page, user);
    await page.route((url) => url.href.includes(API) && url.pathname === "/notifications", (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.goto("/notifications");
    await expect(page.getByText("Không tải được thông báo.")).toBeVisible();
    await expect(page.getByText("Chưa có thông báo nào.")).toHaveCount(0);
  });

  test("NOT-006 a notification about a deleted project says the item no longer exists", async ({ page }) => {
    const { user } = await member();
    const { api: b } = await member("User B");
    const project = await b.createProject("B Shared Song");
    await seedNotification(user.id, "comment.new", { projectId: project.id, commentId: "x", actorName: "User B" });
    await b.call("DELETE", `/projects/${project.id}`);
    await loginThroughUi(page, user);
    await page.goto("/notifications");
    await list(page).first().click();
    await expect(page.getByText("Mục này không còn tồn tại.")).toBeVisible();
    await expect(page).toHaveURL(/\/notifications/);
  });

  test("Blocked by DFID145, NOT-009 security notifications are still delivered when optional types are off", async ({ page }) => {
    test.fail(true, "DFID145: changing the password creates no security notification");
    const { user, api } = await member();
    await loginThroughUi(page, user);
    await page.goto("/notifications/settings");
    const toggles = page.getByRole("switch", { name: /nhận trong ứng dụng/ });
    const count = await toggles.count();
    for (let i = 0; i < count; i += 1) {
      const toggle = toggles.nth(i);
      if ((await toggle.isEnabled()) && (await toggle.isChecked())) {
        await toggle.click();
        await page.waitForTimeout(400);
      }
    }
    const prefs = (await api.call("GET", "/notifications/preferences")) as unknown;
    expect(JSON.stringify(prefs)).toContain("false");
    await page.goto("/profile");
    await page.getByRole("button", { name: /bảo mật/i }).click();
    await page.getByRole("button", { name: /^đổi mật khẩu$/i }).click();
    await page.locator('input[name="current-password"]').fill(user.password);
    await page.locator('input[name="new-password"]').fill("NewPassw0rd!");
    const confirm = page.locator('input[name="confirm-password"], input[name="confirmPassword"], input[name="new-password-confirm"]');
    if (await confirm.count()) await confirm.first().fill("NewPassw0rd!");
    await page.getByRole("button", { name: /cập nhật mật khẩu/i }).click();
    await page.waitForTimeout(2_000);
    const { data } = await admin().from("notifications").select("type").eq("user_id", user.id);
    expect((data ?? []).map((n) => n.type as string).some((t) => t.startsWith("security."))).toBe(true);
  });

  test("NOT-010 security and billing toggles cannot be turned off", async ({ page }) => {
    const { user, api } = await member();
    await loginThroughUi(page, user);
    await page.goto("/notifications/settings");
    await expect(page.getByText(/Thông báo về bảo mật và thanh toán luôn được gửi/)).toBeVisible();
    const locked = page.locator('[role="switch"][disabled]');
    expect(await locked.count()).toBeGreaterThan(0);
    for (let i = 0; i < (await locked.count()); i += 1) await expect(locked.nth(i)).toBeDisabled();
    try {
      await api.call("PUT", "/notifications/preferences", { preferences: [{ type: "security.google_connected", inApp: false, email: false }] });
    } catch {
      /* refused is fine */
    }
    const prefs = JSON.stringify(await api.call("GET", "/notifications/preferences"));
    const security = /"security\.google_connected"[^}]*"inApp":\s*(true|false)/.exec(prefs);
    if (security) expect(security[1]).toBe("true");
  });

  test("NOT-011 a failed save returns the toggle to its previous position", async ({ page }) => {
    const { user } = await member();
    await loginThroughUi(page, user);
    await page.route((url) => url.href.includes(API) && url.pathname === "/notifications/preferences", (route) =>
      route.request().method() === "PUT" ? route.fulfill({ status: 500, body: "{}" }) : route.continue(),
    );
    await page.goto("/notifications/settings");
    const fork = page.getByRole("switch", { name: /được fork: nhận trong ứng dụng/ }).first();
    await expect(fork).toBeChecked();
    await fork.click();
    await expect(page.getByText("Không lưu được thay đổi. Cài đặt đã được trả về như cũ.")).toBeVisible();
    await expect(fork).toBeChecked();
    await page.unroute((url) => url.href.includes(API) && url.pathname === "/notifications/preferences");
    await page.reload();
    await expect(page.getByRole("switch", { name: /được fork: nhận trong ứng dụng/ }).first()).toBeChecked();
  });

  test("Blocked by DFID165, DFID146, SUB-032 a free user selects and saves a preset theme", async ({ page, browser }) => {
    test.fail(true, "DFID165: after saving, the page switches back to the default theme; DFID146: no confirmation");
    const { user } = await member();
    await loginThroughUi(page, user);
    await openPersonalization(page);
    await expect(page.getByText("Đang dùng")).toBeVisible();
    await page.getByRole("button", { name: /Moss Circuit/ }).click();
    await expect.poll(() => theme(page)).toBe("moss");
    await page.getByRole("button", { name: "Lưu theme" }).click();
    await expect(page.getByText("Đang xem trước — chưa lưu vào tài khoản.")).toHaveCount(0);
    await page.waitForTimeout(3_000);
    expect(await theme(page)).toBe("moss");
    await expect.poll(() => storedTheme(user)).toBe("moss");
    const other = await (await browser.newContext()).newPage();
    await loginThroughUi(other, user);
    await expect.poll(() => theme(other)).toBe("moss");
    await other.context().close();
    await expect(page.getByRole("status").or(page.getByRole("alert")).filter({ hasText: /đã lưu|thành công/i })).toBeVisible({ timeout: 5_000 });
  });

  test("SUB-033 previewing several themes stores nothing", async ({ page, browser }) => {
    const { user } = await member();
    await loginThroughUi(page, user);
    await openPersonalization(page);
    const before = await storedTheme(user);
    await page.getByRole("button", { name: /Moss Circuit/ }).click();
    await expect.poll(() => theme(page)).toBe("moss");
    await page.getByRole("button", { name: /Claret Studio/ }).click();
    await expect.poll(() => theme(page)).toBe("claret");
    await expect(page.getByText("Đang xem trước — chưa lưu vào tài khoản.")).toBeVisible();
    expect(await storedTheme(user)).toBe(before);
    const other = await (await browser.newContext()).newPage();
    await loginThroughUi(other, user);
    expect(await theme(other)).not.toBe("claret");
    await other.context().close();
  });

  test("SUB-034 leaving without saving restores the stored theme", async ({ page }) => {
    const { user } = await member();
    await loginThroughUi(page, user);
    const stored = await theme(page);
    await openPersonalization(page);
    await page.getByRole("button", { name: /Moss Circuit/ }).click();
    await expect.poll(() => theme(page)).toBe("moss");
    await page.getByRole("link", { name: "Dự án của tôi" }).click();
    await expect.poll(() => theme(page)).toBe(stored);
  });

  test("SUB-035 a server error on saving restores the previous theme", async ({ page }) => {
    const { user } = await member();
    await loginThroughUi(page, user);
    const stored = await theme(page);
    await page.route((url) => url.href.includes(API) && /theme/.test(url.pathname), (route) =>
      route.request().method() === "GET" ? route.continue() : route.fulfill({ status: 500, body: "{}" }),
    );
    await openPersonalization(page);
    await page.getByRole("button", { name: /Moss Circuit/ }).click();
    await page.getByRole("button", { name: "Lưu theme" }).click();
    await expect(page.getByText("Không lưu được theme. Giao diện đã được trả về lựa chọn cũ.")).toBeVisible();
    await expect.poll(() => theme(page)).toBe(stored);
    await page.reload();
    await expect.poll(() => theme(page)).toBe(stored);
  });

  test("NFR-038 empty lists show a message with a suggested next action", async ({ page }) => {
    const { user } = await member();
    await loginThroughUi(page, user);
    await page.goto("/projects");
    await expect(page.locator("main").getByRole("link", { name: /tạo|dự án mới/i }).first()).toBeVisible();
    await page.goto("/notifications");
    await expect(page.getByText("Chưa có thông báo nào.")).toBeVisible();
    await expect(page.getByText(/Khi có người mời cộng tác/)).toBeVisible();
  });

  test("NFR-040 the interface switches between English and Vietnamese and keeps the choice", async ({ page }) => {
    const { user } = await member();
    await page.goto("/login");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("button", { name: /^sign in$|^log in$/i }).first()).toBeVisible();
    await page.getByRole("button", { name: "Tiếng Việt" }).click();
    await expect(page.getByRole("button", { name: /^đăng nhập$/i }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: /^đăng nhập$/i }).first()).toBeVisible();
    await loginThroughUi(page, user);
    await page.getByRole("button", { name: "English" }).click();
    await page.goto("/projects");
    await expect(page.getByRole("link", { name: "My projects" }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("link", { name: "My projects" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Tiếng Việt" }).click();
    await expect(page.getByRole("link", { name: "Dự án của tôi" }).first()).toBeVisible();
  });
});
