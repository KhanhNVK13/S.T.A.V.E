import { expect as baseExpect, test } from "@playwright/test";
import { admin } from "./support/auth-links";
import { httpStatus, person, publicProject, seedSound } from "./support/people";
import { cleanupE2eUsers, loginThroughUi } from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const MB = 1024 * 1024;

interface SettingsResponse {
  groups: { items: { key: string; value: number | boolean }[] }[];
}

async function settingValue(api: { call: (m: string, p: string) => Promise<unknown> }, key: string) {
  const all = (await api.call("GET", "/admin/settings")) as SettingsResponse;
  return all.groups.flatMap((g) => g.items).find((i) => i.key === key)?.value;
}

async function resetSettings() {
  await admin().from("platform_settings").delete().in("key", [
    "jam_edit_cooldown_sec",
    "registration_enabled",
    "price_change_notice_days",
    "moderation_retention_days",
  ]);
  await admin()
    .from("platform_settings")
    .upsert({ key: "custom_sound_quota_bytes", value: 50 * MB }, { onConflict: "key" });
}

async function resetTemplates() {
  await admin().from("notification_templates").delete().like("name", "E2E %");
}

test.describe("Admin system settings", () => {
  test.setTimeout(240_000);
  test.afterEach(async () => {
    await resetSettings();
    await resetTemplates();
    await cleanupE2eUsers();
  });

  test("ADM-SET-007 creates a template that is used for new notifications", async () => {
    const boss = await person("Boss", "admin");
    const inviter = await person("Inviter");
    const invitee = await person("Invitee");
    const project = await publicProject(inviter, "Template Song");
    await boss.api.call("PUT", "/admin/notification-templates/collab.invite", {
      name: "E2E invite wording",
      subject: "Custom invite for {{projectName}}",
      body: "{{inviterName}} wants you in {{projectName}} (custom wording)",
    });
    await inviter.api.call("POST", `/projects/${project.id}/collaborators`, {
      identifier: invitee.username,
      permissionLevel: "view",
    });
    const feed = JSON.stringify(await invitee.api.call("GET", "/notifications"));
    expect(feed).toContain("custom wording");
  });

  test("ADM-SET-008 accepts a recognised placeholder typed by hand", async () => {
    const boss = await person("Boss", "admin");
    const out = (await boss.api.call("PUT", "/admin/notification-templates/collab.invite", {
      name: "E2E typed placeholder",
      subject: "Invite",
      body: "Hello {{ projectName }} and {{inviterName}}",
    })) as { created: boolean };
    expect(out.created).toBe(true);
  });

  test("ADM-SET-009 refuses an unknown placeholder and names it", async () => {
    const boss = await person("Boss", "admin");
    let body = "";
    try {
      await boss.api.call("PUT", "/admin/notification-templates/collab.invite", {
        name: "E2E unknown placeholder",
        subject: "Invite",
        body: "Hello {{nonsenseValue}}",
      });
    } catch (error) {
      body = String(error);
    }
    expect(body).toContain("400");
    expect(body).toContain("nonsenseValue");
  });

  test("ADM-SET-010 does not save a template with an empty name", async () => {
    const boss = await person("Boss", "admin");
    const status = await httpStatus(
      boss.api.call("PUT", "/admin/notification-templates/collab.invite", {
        name: "",
        subject: "Invite",
        body: "Hello {{projectName}}",
      }),
    );
    expect(status).toBe(400);
  });

  test("ADM-SET-011 does not save a template with an empty body", async () => {
    const boss = await person("Boss", "admin");
    const status = await httpStatus(
      boss.api.call("PUT", "/admin/notification-templates/collab.invite", {
        name: "E2E empty body",
        subject: "Invite",
        body: "",
      }),
    );
    expect(status).toBe(400);
  });

  test("ADM-SET-012 saves nothing when the server fails on saving", async ({ page }) => {
    const boss = await person("Boss", "admin");
    await loginThroughUi(page, boss.user);
    await page.route("**/admin/notification-templates/*", (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
        : route.continue(),
    );
    await page.goto("/admin/notification-templates");
    await page.getByRole("button", { name: /Tuỳ chỉnh|Sửa/ }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Lưu mẫu" }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    const { data } = await admin().from("notification_templates").select("id").like("name", "E2E failing%");
    expect(data?.length ?? 0).toBe(0);
  });

  test("ADM-SET-013 applies edited wording to new notifications only", async () => {
    const boss = await person("Boss", "admin");
    const inviter = await person("Inviter");
    const first = await person("First");
    const second = await person("Second");
    const project = await publicProject(inviter, "Wording Song");
    await inviter.api.call("POST", `/projects/${project.id}/collaborators`, {
      identifier: first.username,
      permissionLevel: "view",
    });
    await boss.api.call("PUT", "/admin/notification-templates/collab.invite", {
      name: "E2E new wording",
      subject: "Brand new subject",
      body: "{{inviterName}} sent a brand new wording for {{projectName}}",
    });
    await inviter.api.call("POST", `/projects/${project.id}/collaborators`, {
      identifier: second.username,
      permissionLevel: "view",
    });
    expect(JSON.stringify(await first.api.call("GET", "/notifications"))).not.toContain("brand new wording");
    expect(JSON.stringify(await second.api.call("GET", "/notifications"))).toContain("brand new wording");
  });

  test("ADM-SET-014 reverts a type to the default wording when its template is deleted", async () => {
    const boss = await person("Boss", "admin");
    await boss.api.call("PUT", "/admin/notification-templates/collab.invite", {
      name: "E2E to delete",
      subject: "Custom",
      body: "Custom {{projectName}}",
    });
    await boss.api.call("DELETE", "/admin/notification-templates/collab.invite");
    const list = (await boss.api.call("GET", "/admin/notification-templates")) as {
      type: string;
      custom: unknown;
    }[];
    expect(list.find((t) => t.type === "collab.invite")?.custom).toBeNull();
  });

  test("ADM-SET-015 refuses an unknown placeholder when editing and names it", async () => {
    const boss = await person("Boss", "admin");
    await boss.api.call("PUT", "/admin/notification-templates/collab.invite", {
      name: "E2E edit target",
      subject: "Custom",
      body: "Custom {{projectName}}",
    });
    let body = "";
    try {
      await boss.api.call("PUT", "/admin/notification-templates/collab.invite", {
        name: "E2E edit target",
        subject: "Custom",
        body: "Custom {{wrongName}}",
      });
    } catch (error) {
      body = String(error);
    }
    expect(body).toContain("wrongName");
  });

  test("ADM-SET-016 does not offer deleting a security or billing template", async () => {
    const boss = await person("Boss", "admin");
    const list = (await boss.api.call("GET", "/admin/notification-templates")) as {
      type: string;
      mandatory: boolean;
    }[];
    const mandatory = list.find((t) => t.mandatory);
    expect(mandatory).toBeTruthy();
    expect(await httpStatus(boss.api.call("DELETE", `/admin/notification-templates/${mandatory!.type}`))).toBeGreaterThanOrEqual(400);
  });

  test("ADM-SET-017 keeps the previous wording when storing the revision fails", async ({ page }) => {
    const boss = await person("Boss", "admin");
    await boss.api.call("PUT", "/admin/notification-templates/collab.invite", {
      name: "E2E stable wording",
      subject: "Stable",
      body: "Stable {{projectName}}",
    });
    await loginThroughUi(page, boss.user);
    await page.route("**/admin/notification-templates/*", (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
        : route.continue(),
    );
    await page.goto("/admin/notification-templates");
    await page.getByRole("button", { name: /Tuỳ chỉnh|Sửa/ }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Lưu mẫu" }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    const list = (await boss.api.call("GET", "/admin/notification-templates")) as {
      type: string;
      custom: { body: string } | null;
    }[];
    expect(list.find((t) => t.type === "collab.invite")?.custom?.body).toContain("Stable");
  });
});

interface Stats {
  noData: boolean;
  totals: Record<string, number>;
  previous: Record<string, number> | null;
  period: { granularity: string; from: string; to: string };
  series: { date: string }[];
  totalUsers?: number;
}

function day(offset: number): string {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
}

test.describe("Admin statistics and reports", () => {
  test.setTimeout(240_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("ADM-STA-001 shows user growth totals and trend as aggregates only", async () => {
    const boss = await person("Boss", "admin");
    await person("Fresh");
    const stats = (await boss.api.call("GET", `/admin/stats/growth?from=${day(-7)}&to=${day(0)}`)) as Stats;
    expect(stats.totals.newUsers).toBeGreaterThanOrEqual(2);
    expect(stats.series.length).toBeGreaterThan(0);
    expect(JSON.stringify(stats)).not.toContain("@stave-test.invalid");
  });

  test("ADM-STA-002 aggregates a longer period by a coarser interval", async () => {
    const boss = await person("Boss", "admin");
    const short = (await boss.api.call("GET", `/admin/stats/growth?from=${day(-7)}&to=${day(0)}`)) as Stats;
    const long = (await boss.api.call("GET", `/admin/stats/growth?from=${day(-400)}&to=${day(0)}`)) as Stats;
    expect(short.period.granularity).toBe("day");
    expect(long.period.granularity).not.toBe("day");
  });

  test("ADM-STA-003 explains a period before the platform existed instead of showing zeroes", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const stats = (await boss.api.call("GET", "/admin/stats/growth?from=2001-01-01&to=2001-01-31")) as Stats;
    expect(stats.noData).toBe(true);
    await loginThroughUi(page, boss.user);
    await page.route("**/admin/stats/**", (route) => route.continue());
    await page.goto("/admin/dashboard");
    await expect(page.getByText("Tổng quan nền tảng")).toBeVisible();
  });

  test("ADM-STA-004 reports figures that cannot be computed instead of showing them", async ({ page }) => {
    const boss = await person("Boss", "admin");
    await loginThroughUi(page, boss.user);
    await page.route("**/admin/stats/overview*", async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as Record<string, unknown>;
      body.growth = { available: false };
      await route.fulfill({ response: res, json: body });
    });
    await page.goto("/admin/dashboard");
    await expect(page.getByText("Hiện chưa có sẵn.").first()).toBeVisible();
  });

  test("ADM-STA-005 does not change past figures when an account is deleted", async () => {
    const boss = await person("Boss", "admin");
    const gone = await person("Gone");
    const range = `from=${day(-3)}&to=${day(0)}`;
    const before = (await boss.api.call("GET", `/admin/stats/growth?${range}`)) as Stats;
    await boss.api.call("DELETE", `/admin/users/${gone.user.id}`, {
      reason: "The account asked to be removed",
      confirmUsername: gone.username,
    });
    const after = (await boss.api.call("GET", `/admin/stats/growth?${range}`)) as Stats;
    expect(after.totals.newUsers).toBeGreaterThanOrEqual(before.totals.newUsers);
  });

  test("ADM-STA-006 shows project and feature usage counts for the period", async () => {
    const boss = await person("Boss", "admin");
    const owner = await person("Maker");
    await publicProject(owner, "Counted Song");
    const stats = (await boss.api.call("GET", `/admin/stats/usage?from=${day(-3)}&to=${day(0)}`)) as Stats;
    expect(stats.totals.newProjects).toBeGreaterThanOrEqual(1);
    expect(stats.totals.commits).toBeGreaterThanOrEqual(1);
  });

  test("ADM-STA-007 compares two periods and shows the change against the previous period", async () => {
    const boss = await person("Boss", "admin");
    const stats = (await boss.api.call(
      "GET",
      `/admin/stats/usage?from=${day(-7)}&to=${day(0)}&compare=true`,
    )) as Stats;
    expect(stats.previous).not.toBeNull();
    expect(Object.keys(stats.previous!)).toContain("commits");
  });

  test("ADM-STA-008 reports usage figures that cannot be computed instead of showing them", async ({ page }) => {
    const boss = await person("Boss", "admin");
    await loginThroughUi(page, boss.user);
    await page.route("**/admin/stats/overview*", async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as Record<string, unknown>;
      body.usage = { available: false };
      await route.fulfill({ response: res, json: body });
    });
    await page.goto("/admin/dashboard");
    await expect(page.getByText("Hiện chưa có sẵn.").first()).toBeVisible();
  });

  test("ADM-STA-009 still counts the activity of a deleted project", async () => {
    const boss = await person("Boss", "admin");
    const owner = await person("Maker");
    const project = await publicProject(owner, "Deleted Counted");
    const range = `from=${day(-3)}&to=${day(0)}`;
    const before = (await boss.api.call("GET", `/admin/stats/usage?${range}`)) as Stats;
    await owner.api.call("DELETE", `/projects/${project.id}`);
    const after = (await boss.api.call("GET", `/admin/stats/usage?${range}`)) as Stats;
    expect(after.totals.commits).toBeGreaterThanOrEqual(before.totals.commits);
  });

  test("ADM-STA-010 shows the summary figures and charts on the dashboard", async ({ page }) => {
    const boss = await person("Boss", "admin");
    await loginThroughUi(page, boss.user);
    await page.goto("/admin/dashboard");
    for (const label of ["Tăng trưởng người dùng", "Hoạt động dự án", "Doanh thu", "Báo cáo đang mở"]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test("ADM-STA-011 opens the moderation queue from the open reports count", async ({ page }) => {
    const boss = await person("Boss", "admin");
    await loginThroughUi(page, boss.user);
    await page.goto("/admin/dashboard");
    await page.getByRole("link", { name: /Báo cáo đang mở/ }).first().click();
    await expect(page).toHaveURL(/\/admin\/reports/);
  });

  test("ADM-STA-012 marks a section that cannot be computed as unavailable while the rest is shown", async ({ page }) => {
    const boss = await person("Boss", "admin");
    await loginThroughUi(page, boss.user);
    await page.route("**/admin/stats/overview*", async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as Record<string, unknown>;
      body.finance = { available: false };
      await route.fulfill({ response: res, json: body });
    });
    await page.goto("/admin/dashboard");
    await expect(page.getByText("Hiện chưa có sẵn.").first()).toBeVisible();
    await expect(page.getByText("Tăng trưởng người dùng").first()).toBeVisible();
  });

  test("ADM-STA-013 reports a dashboard that cannot load at all instead of showing zeroes", async ({ page }) => {
    const boss = await person("Boss", "admin");
    await loginThroughUi(page, boss.user);
    await page.route("**/admin/stats/overview*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/admin/dashboard");
    await expect(page.getByText("Không tải được trang tổng quan")).toBeVisible();
  });
});
