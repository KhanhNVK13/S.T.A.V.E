import {
  expect as baseExpect,
  test,
  type Locator,
  type Page,
} from "@playwright/test";
import { UserApi } from "./support/api";
import { admin, passwordLoginStatus } from "./support/auth-links";
import {
  cleanupE2eUsers,
  countProjectsOf,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const quick = { timeout: 4_000 };
const BACKEND = "http://localhost:3101";
const FRONTEND = "http://localhost:3100";

interface Actor {
  user: E2eUser;
  username: string;
}

let counter = 0;

async function makeActor(
  label: string,
  fields: { role?: "admin"; status?: "active" | "suspended" } = {},
): Promise<Actor> {
  counter += 1;
  const user = await createE2eUser();
  const username = `e2e_${label}_${counter}_${user.id.slice(0, 4)}`;
  await createE2eProfile(user, {
    display_name: `Name ${label}`,
    username,
    status: fields.status,
  });
  if (fields.role) {
    await admin().from("users").update({ role: fields.role }).eq("id", user.id);
  }
  return { user, username };
}

async function publicProject(actor: Actor, name: string) {
  const api = await UserApi.for(actor.user);
  const project = await api.createProject(name);
  await api.putDraft(project.id, [{ id: `${name}-n1` }]);
  await api.commit(project.branchId, "First idea");
  await api.setVisibility(project.id, "public");
  return { api, ...project };
}

async function openUsers(page: Page, search: string): Promise<void> {
  await page.goto("/admin/users");
  const box = page.locator('input[name="q"]');
  await box.waitFor();
  await page.waitForLoadState("networkidle");
  await box.fill(search);
  await page.getByRole("button", { name: /^Tìm$/ }).click();
}

function rowOf(page: Page, username: string): Locator {
  return page
    .getByText(`@${username}`, { exact: true })
    .first()
    .locator("xpath=ancestor::div[contains(@class,'min-h-')][1]");
}

async function adminSession(page: Page, adminActor: Actor) {
  await loginThroughUi(page, adminActor.user);
}

async function exploreHas(projectId: string): Promise<boolean> {
  const res = await fetch(`${BACKEND}/explore/projects?search=Public&limit=50`);
  return (await res.text()).includes(projectId);
}

async function profileStatus(userId: string): Promise<number> {
  const res = await fetch(`${BACKEND}/explore/users/${userId}`);
  return res.status;
}

async function auditRows(targetId: string) {
  const { data } = await admin()
    .from("admin_audit_log")
    .select("admin_id, action, reason, created_at")
    .eq("target_id", targetId);
  return data ?? [];
}

async function notificationsOf(userId: string) {
  const { data } = await admin()
    .from("notifications")
    .select("type, payload")
    .eq("user_id", userId);
  return data ?? [];
}

async function statusOf(userId: string): Promise<string | undefined> {
  const { data } = await admin()
    .from("users")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  return data?.status as string | undefined;
}

function dialog(page: Page): Locator {
  return page.getByRole("dialog").or(page.getByRole("alertdialog")).first();
}

async function adminFetch(
  adminApi: UserApi,
  method: string,
  path: string,
  body?: unknown,
): Promise<number> {
  try {
    await adminApi.call(method, path, body);
    return 200;
  } catch (err) {
    const match = /-> (\d{3})/.exec((err as Error).message);
    return match ? Number(match[1]) : 0;
  }
}

test.describe("Admin - User Management", () => {
  test.setTimeout(150_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("ADM-USR-001 lists accounts with masked email, plan, project count and status and supports search and filters", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID067: the list has no plan and no project count column and the row has no View activity action",
    );
    const adminActor = await makeActor("Admin", { role: "admin" });
    const b = await makeActor("B");
    await makeActor("C", { status: "suspended" });
    await adminSession(page, adminActor);
    await openUsers(page, b.username);
    await expect(rowOf(page, b.username)).toBeVisible();
    const rowText = (await rowOf(page, b.username).innerText()) ?? "";
    expect(rowText).toContain("Name B");
    expect(rowText).not.toContain(b.user.email);
    await expect(rowOf(page, b.username)).toContainText("Active");

    await page.goto("/admin/users");
    await page
      .getByRole("combobox", { name: /trạng thái/i })
      .selectOption("active");
    await expect(rowOf(page, b.username)).toBeVisible();
    await expect(
      page.locator("div[class*='min-h-']").filter({ hasText: "Suspended" }),
    ).toHaveCount(0);

    await page.locator('input[name="q"]').fill(b.username);
    await page.getByRole("button", { name: /^Tìm$/ }).click();
    const row = rowOf(page, b.username);
    await expect.soft(row).toContainText(/STAVE\+|Free|Gói|Plan/i, quick);
    await expect.soft(row).toContainText(/\d+\s*(dự án|projects?)/i, quick);
    await expect
      .soft(row.getByRole("button", { name: /hoạt động|activity/i }))
      .toBeVisible(quick);
  });

  test("ADM-USR-002 finds an account by exact email without revealing full addresses", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    const b = await makeActor("B");
    const c = await makeActor("C");
    await adminSession(page, adminActor);
    await openUsers(page, b.user.email);
    await expect(rowOf(page, b.username)).toBeVisible();
    await expect(page.getByText(`@${c.username}`)).toHaveCount(0);
    const body = await page.locator("body").innerText();
    for (const email of [b.user.email, c.user.email, adminActor.user.email]) {
      expect(body).not.toContain(email);
    }
    expect(await rowOf(page, b.username).innerText()).toMatch(/\*/);
  });

  test("ADM-USR-003 reports an error when the account list cannot be retrieved", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    await adminSession(page, adminActor);
    await page.route(/^http:\/\/localhost:3101\/admin\/users(\?.*)?$/, (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "Internal server error" }),
          })
        : route.continue(),
    );
    await page.goto("/admin/users");
    await expect(
      page.getByText(/không tải được danh sách người dùng/i),
    ).toBeVisible();
    await expect(page.getByText("Không có kết quả.")).toHaveCount(0);
  });

  test("ADM-USR-004 says there are no results for an address that does not exist", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    await adminSession(page, adminActor);
    await openUsers(page, "nobody_zz_123@example.com");
    await expect(page.getByText("Không có kết quả.")).toBeVisible();
    await expect(page.getByText(/tồn tại|exist|đăng ký/i)).toHaveCount(0);
  });

  test("ADM-USR-005 gives the administrator no way to open a private project of a user", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    const a = await makeActor("A");
    const aApi = await UserApi.for(a.user);
    const project = await aApi.createProject("Test Song");
    await aApi.putDraft(project.id, [{ id: "n1" }]);
    await aApi.commit(project.branchId, "Verse idea");
    await adminSession(page, adminActor);
    await openUsers(page, a.username);
    const buttons = rowOf(page, a.username).getByRole("button");
    const names = await buttons.allInnerTexts();
    expect(names.join(" ")).not.toMatch(/mở|phát|xuất|open|play|export/i);
    expect(await rowOf(page, a.username).getByRole("link").count()).toBe(0);

    await page.goto(`/projects/${project.id}/edit`);
    await expect(
      page.getByText(/không tìm thấy|không có quyền/i).first(),
    ).toBeVisible();
    await expect(page.getByText("Test Song")).toHaveCount(0);

    const adminApi = await UserApi.for(adminActor.user);
    expect(await adminFetch(adminApi, "GET", `/projects/${project.id}`)).toBe(
      404,
    );
    expect(
      await adminFetch(adminApi, "GET", `/projects/${project.id}/draft`),
    ).toBeGreaterThanOrEqual(403);
    const after = (await aApi.call("GET", `/projects/${project.id}`)) as {
      name: string;
    };
    expect(after.name).toBe("Test Song");
  });

  test("ADM-USR-007 suspends a user with a reason: sessions end, nothing is deleted", async ({
    page,
    browser,
  }) => {
    test.fail(
      true,
      "DFID068, DFID070: no completion message after suspending, the suspend dialog has no policy category, and the suspended account's public project stays on Explore (its profile is DFID063)",
    );
    const adminActor = await makeActor("Admin", { role: "admin" });
    const b = await makeActor("B");
    const pub = await publicProject(b, "Public Song");
    const bApi = pub.api;
    const bContext = await browser.newContext({ baseURL: FRONTEND });
    const bPage = await bContext.newPage();
    await loginThroughUi(bPage, b.user);
    await bPage.goto("/projects");

    await adminSession(page, adminActor);
    await openUsers(page, b.username);
    await rowOf(page, b.username)
      .getByRole("button", { name: /tạm khoá/i })
      .click();
    await expect
      .soft(dialog(page).getByRole("combobox"))
      .toBeVisible(quick);
    await dialog(page).locator("textarea").fill("Spam uploads test");
    await dialog(page)
      .getByRole("button", { name: /xác nhận/i })
      .click();
    await expect(rowOf(page, b.username)).toContainText("Suspended");
    await expect
      .soft(page.getByText(/đã hoàn tất|đã ghi|thành công/i).first())
      .toBeVisible(quick);

    expect(await statusOf(b.user.id)).toBe("suspended");
    expect(await passwordLoginStatus(b.user.email, b.user.password)).not.toBe(
      200,
    );
    let sessionEnded = false;
    try {
      await bApi.call("GET", "/projects");
    } catch {
      sessionEnded = true;
    }
    expect(sessionEnded).toBe(true);
    await bPage.reload();
    await expect
      .soft(bPage.getByText(/phiên.*kết thúc|đăng nhập lại/i).first())
      .toBeVisible(quick);
    await bContext.close();

    expect.soft(await exploreHas(pub.id)).toBe(false);
    expect.soft(await profileStatus(b.user.id)).toBe(404);
    expect(await countProjectsOf(b.user.id)).toBe(1);
    const notes = await notificationsOf(b.user.id);
    expect(
      notes.some(
        (n) =>
          n.type === "account_suspended" &&
          (n.payload as { reason?: string }).reason === "Spam uploads test",
      ),
    ).toBe(true);
    const audit = await auditRows(b.user.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].admin_id).toBe(adminActor.user.id);
    expect(audit[0].reason).toBe("Spam uploads test");
  });

  test("ADM-USR-008 leaves the account unchanged when the suspension dialog is cancelled", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    const b = await makeActor("B");
    await adminSession(page, adminActor);
    await openUsers(page, b.username);
    await rowOf(page, b.username)
      .getByRole("button", { name: /tạm khoá/i })
      .click();
    await dialog(page).locator("textarea").fill("Not sent");
    await dialog(page).getByRole("button", { name: /huỷ/i }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(rowOf(page, b.username)).toContainText("Active");
    expect(await statusOf(b.user.id)).toBe("active");
    expect(await passwordLoginStatus(b.user.email, b.user.password)).toBe(200);
    expect(await auditRows(b.user.id)).toHaveLength(0);
  });

  test("ADM-USR-009 does not offer to suspend the administrator's own account", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    await adminSession(page, adminActor);
    await openUsers(page, adminActor.username);
    await expect(rowOf(page, adminActor.username)).toBeVisible();
    await expect(rowOf(page, adminActor.username).getByRole("button")).toHaveCount(
      0,
    );
    const adminApi = await UserApi.for(adminActor.user);
    expect(
      await adminFetch(
        adminApi,
        "POST",
        `/admin/users/${adminActor.user.id}/suspend`,
        { reason: "self" },
      ),
    ).toBe(403);
    expect(await statusOf(adminActor.user.id)).toBe("active");
  });

  test("ADM-USR-010 does not offer to suspend another administrator account", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    const admin2 = await makeActor("Admin2", { role: "admin" });
    await adminSession(page, adminActor);
    await openUsers(page, admin2.username);
    await expect(rowOf(page, admin2.username)).toBeVisible();
    await expect(rowOf(page, admin2.username).getByRole("button")).toHaveCount(
      0,
    );
    const adminApi = await UserApi.for(adminActor.user);
    expect(
      await adminFetch(
        adminApi,
        "POST",
        `/admin/users/${admin2.user.id}/suspend`,
        { reason: "other admin" },
      ),
    ).toBe(403);
    expect(await statusOf(admin2.user.id)).toBe("active");
  });

  test("ADM-USR-011 does not suspend without a reason and shows a required-field message", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID069: with an empty reason the confirm button is only disabled; no required-field message is shown",
    );
    const adminActor = await makeActor("Admin", { role: "admin" });
    const b = await makeActor("B");
    await adminSession(page, adminActor);
    await openUsers(page, b.username);
    await rowOf(page, b.username)
      .getByRole("button", { name: /tạm khoá/i })
      .click();
    await expect(
      dialog(page).getByRole("button", { name: /xác nhận/i }),
    ).toBeDisabled();
    expect(await statusOf(b.user.id)).toBe("active");
    expect(await auditRows(b.user.id)).toHaveLength(0);
    expect(await notificationsOf(b.user.id)).toHaveLength(0);
    await expect(
      dialog(page).getByText(/bắt buộc|không được để trống|required/i),
    ).toBeVisible(quick);
  });

  test("ADM-USR-012 reports a server error on suspension and leaves the account active", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    const b = await makeActor("B");
    const pub = await publicProject(b, "Public Song");
    await adminSession(page, adminActor);
    await openUsers(page, b.username);
    await page.route(/\/admin\/users\/[^/]+\/suspend$/, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Internal server error" }),
      }),
    );
    await rowOf(page, b.username)
      .getByRole("button", { name: /tạm khoá/i })
      .click();
    await dialog(page).locator("textarea").fill("Server error test");
    await dialog(page)
      .getByRole("button", { name: /xác nhận/i })
      .click();
    await expect(dialog(page).getByRole("alert")).toBeVisible();
    expect(await statusOf(b.user.id)).toBe("active");
    expect(await passwordLoginStatus(b.user.email, b.user.password)).toBe(200);
    expect(await exploreHas(pub.id)).toBe(true);
    expect(await auditRows(b.user.id)).toHaveLength(0);
  });

  test("ADM-USR-014 reactivates a user: login works again and the reactivation is recorded", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID068, DFID071: no completion message after reactivating, and the reactivate dialog does not show why and when the account was suspended",
    );
    const adminActor = await makeActor("Admin", { role: "admin" });
    const b = await makeActor("B");
    const pub = await publicProject(b, "Public Song");
    const adminApi = await UserApi.for(adminActor.user);
    await adminApi.call("POST", `/admin/users/${b.user.id}/suspend`, {
      reason: "Spam uploads test",
    });
    await adminSession(page, adminActor);
    await openUsers(page, b.username);
    await rowOf(page, b.username)
      .getByRole("button", { name: /mở khoá/i })
      .click();
    await expect
      .soft(dialog(page).getByText(/Spam uploads test/))
      .toBeVisible(quick);
    await dialog(page).locator("textarea").fill("Appeal accepted");
    await dialog(page)
      .getByRole("button", { name: /xác nhận/i })
      .click();
    await expect(rowOf(page, b.username)).toContainText("Active");
    await expect
      .soft(page.getByText(/đã hoàn tất|đã ghi|thành công/i).first())
      .toBeVisible(quick);
    expect(await statusOf(b.user.id)).toBe("active");
    expect(await passwordLoginStatus(b.user.email, b.user.password)).toBe(200);
    expect(await exploreHas(pub.id)).toBe(true);
    expect(await profileStatus(b.user.id)).toBe(200);
    const notes = await notificationsOf(b.user.id);
    expect(notes.some((n) => n.type === "account_reactivated")).toBe(true);
    const audit = (await auditRows(b.user.id)).filter(
      (row) => row.action === "reactivate_user",
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].reason).toBe("Appeal accepted");
    expect(audit[0].admin_id).toBe(adminActor.user.id);
  });

  test("ADM-USR-015 leaves the account suspended when the reactivation dialog is cancelled", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    const b = await makeActor("B");
    const adminApi = await UserApi.for(adminActor.user);
    await adminApi.call("POST", `/admin/users/${b.user.id}/suspend`, {
      reason: "Spam uploads test",
    });
    await adminSession(page, adminActor);
    await openUsers(page, b.username);
    await rowOf(page, b.username)
      .getByRole("button", { name: /mở khoá/i })
      .click();
    await dialog(page).getByRole("button", { name: /huỷ/i }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(rowOf(page, b.username)).toContainText("Suspended");
    expect(await statusOf(b.user.id)).toBe("suspended");
    expect(await passwordLoginStatus(b.user.email, b.user.password)).not.toBe(
      200,
    );
    expect(
      (await auditRows(b.user.id)).filter((r) => r.action === "reactivate_user"),
    ).toHaveLength(0);
  });

  test("ADM-USR-018 reports a server error on reactivation and leaves the account suspended", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    const b = await makeActor("B");
    const pub = await publicProject(b, "Public Song");
    const adminApi = await UserApi.for(adminActor.user);
    await adminApi.call("POST", `/admin/users/${b.user.id}/suspend`, {
      reason: "Spam uploads test",
    });
    await adminSession(page, adminActor);
    await openUsers(page, b.username);
    await page.route(/\/admin\/users\/[^/]+\/reactivate$/, (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Internal server error" }),
      }),
    );
    await rowOf(page, b.username)
      .getByRole("button", { name: /mở khoá/i })
      .click();
    await dialog(page).locator("textarea").fill("Appeal accepted");
    await dialog(page)
      .getByRole("button", { name: /xác nhận/i })
      .click();
    await expect(dialog(page).getByRole("alert")).toBeVisible();
    expect(await statusOf(b.user.id)).toBe("suspended");
    expect(await passwordLoginStatus(b.user.email, b.user.password)).not.toBe(
      200,
    );
    expect(pub.id).toBeTruthy();
  });

  test("ADM-USR-019 does not offer to reactivate another administrator account", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    const admin2 = await makeActor("Admin2", {
      role: "admin",
      status: "suspended",
    });
    await adminSession(page, adminActor);
    await openUsers(page, admin2.username);
    await expect(rowOf(page, admin2.username)).toContainText("Suspended");
    await expect(rowOf(page, admin2.username).getByRole("button")).toHaveCount(
      0,
    );
    expect(await statusOf(admin2.user.id)).toBe("suspended");
  });

  test("API: reactivating another administrator account is refused", async () => {
    test.fail(
      true,
      "DFID073: the API reactivates a suspended administrator account; only the interface hides the button",
    );
    const adminActor = await makeActor("Admin", { role: "admin" });
    const admin2 = await makeActor("Admin2", {
      role: "admin",
      status: "suspended",
    });
    const adminApi = await UserApi.for(adminActor.user);
    expect(
      await adminFetch(
        adminApi,
        "POST",
        `/admin/users/${admin2.user.id}/reactivate`,
        { reason: "other admin" },
      ),
    ).toBe(403);
    expect(await statusOf(admin2.user.id)).toBe("suspended");
  });

  test("ADM-USR-020 removes a user: account and projects go, the removal is recorded", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID068, DFID072, DFID074: no completion message, the removal dialog does not say what is removed and what remains, and an account that has committed is not removed although the API answers success",
    );
    const adminActor = await makeActor("Admin", { role: "admin" });
    const b = await makeActor("B");
    const pub = await publicProject(b, "Public Song");
    const bApi = pub.api;
    await bApi.createProject("B Private");
    await adminSession(page, adminActor);
    await openUsers(page, b.username);
    await rowOf(page, b.username).getByRole("button", { name: /xoá/i }).click();
    await expect
      .soft(dialog(page).getByText(/sẽ bị xoá|còn lại|vẫn giữ|được giữ/i))
      .toBeVisible(quick);
    await expect(dialog(page).getByText(/không thể hoàn tác/i)).toBeVisible();
    const confirm = dialog(page).getByRole("button", { name: /xác nhận/i });
    await expect(confirm).toBeDisabled();
    await dialog(page).locator("textarea").fill("Repeated policy violation");
    await expect(confirm).toBeDisabled();
    await dialog(page).locator("input").fill(b.username);
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText(`@${b.username}`)).toHaveCount(0);
    await expect
      .soft(page.getByText(/đã hoàn tất|đã ghi|thành công/i).first())
      .toBeVisible(quick);

    expect(await passwordLoginStatus(b.user.email, b.user.password)).not.toBe(
      200,
    );
    expect(await countProjectsOf(b.user.id)).toBe(0);
    expect(await exploreHas(pub.id)).toBe(false);
    expect(await statusOf(b.user.id)).toBeUndefined();
    const audit = await auditRows(b.user.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("remove_user");
    expect(audit[0].admin_id).toBe(adminActor.user.id);
    expect(audit[0].reason).toBe("Repeated policy violation");
  });

  test("ADM-USR-022 leaves the account unchanged when the removal dialog is cancelled", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    const b = await makeActor("B");
    await publicProject(b, "Public Song");
    await adminSession(page, adminActor);
    await openUsers(page, b.username);
    await rowOf(page, b.username).getByRole("button", { name: /xoá/i }).click();
    await dialog(page).locator("textarea").fill("Not sent");
    await dialog(page).locator("input").fill(b.username);
    await dialog(page).getByRole("button", { name: /huỷ/i }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(rowOf(page, b.username)).toContainText("Active");
    expect(await statusOf(b.user.id)).toBe("active");
    expect(await countProjectsOf(b.user.id)).toBe(1);
    expect(await auditRows(b.user.id)).toHaveLength(0);
  });

  test("ADM-USR-023 keeps confirm disabled when the typed handle differs by one character", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    const b = await makeActor("B");
    await adminSession(page, adminActor);
    await openUsers(page, b.username);
    await rowOf(page, b.username).getByRole("button", { name: /xoá/i }).click();
    await dialog(page).locator("textarea").fill("Test");
    await dialog(page).locator("input").fill(`${b.username.slice(0, -1)}x`);
    await expect(
      dialog(page).getByRole("button", { name: /xác nhận/i }),
    ).toBeDisabled();
    expect(await statusOf(b.user.id)).toBe("active");
    const adminApi = await UserApi.for(adminActor.user);
    expect(
      await adminFetch(adminApi, "DELETE", `/admin/users/${b.user.id}`, {
        reason: "Test",
        confirmUsername: `${b.username.slice(0, -1)}x`,
      }),
    ).toBe(400);
    expect(await statusOf(b.user.id)).toBe("active");
  });

  test("ADM-USR-024 does not offer to remove the administrator's own account", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    await adminSession(page, adminActor);
    await openUsers(page, adminActor.username);
    await expect(rowOf(page, adminActor.username).getByRole("button")).toHaveCount(
      0,
    );
    const adminApi = await UserApi.for(adminActor.user);
    expect(
      await adminFetch(adminApi, "DELETE", `/admin/users/${adminActor.user.id}`, {
        reason: "self",
        confirmUsername: adminActor.username,
      }),
    ).toBe(403);
    expect(await statusOf(adminActor.user.id)).toBe("active");
  });

  test("ADM-USR-025 does not offer to remove another administrator account", async ({
    page,
  }) => {
    const adminActor = await makeActor("Admin", { role: "admin" });
    const admin2 = await makeActor("Admin2", { role: "admin" });
    await adminSession(page, adminActor);
    await openUsers(page, admin2.username);
    await expect(rowOf(page, admin2.username).getByRole("button")).toHaveCount(
      0,
    );
    const adminApi = await UserApi.for(adminActor.user);
    expect(
      await adminFetch(adminApi, "DELETE", `/admin/users/${admin2.user.id}`, {
        reason: "other admin",
        confirmUsername: admin2.username,
      }),
    ).toBe(403);
    expect(await statusOf(admin2.user.id)).toBe("active");
  });

  test("API: removing an account that owns commits and tags removes the account", async () => {
    test.fail(
      true,
      "DFID074: the API answers success but the account stays because commits.author_id has no cascade and the failed delete is ignored",
    );
    const adminActor = await makeActor("Admin", { role: "admin" });
    const b = await makeActor("B");
    const pub = await publicProject(b, "Public Song");
    const head = await pub.api.head(pub.branchId);
    await pub.api.tag(head.id, "v1");
    const adminApi = await UserApi.for(adminActor.user);
    const status = await adminFetch(
      adminApi,
      "DELETE",
      `/admin/users/${b.user.id}`,
      { reason: "Cleanup check", confirmUsername: b.username },
    );
    expect(status).toBe(200);
    expect(await statusOf(b.user.id)).toBeUndefined();
    expect(await countProjectsOf(b.user.id)).toBe(0);
  });
});
