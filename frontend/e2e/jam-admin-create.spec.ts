import { expect as baseExpect, test, type Page } from "@playwright/test";
import { admin } from "./support/auth-links";
import { person, publicProject, type Person } from "./support/people";
import { cleanupE2eUsers, loginThroughUi } from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });

function local(offsetMinutes: number): string {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tomorrowAt(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`;
}

async function eventsNamed(name: string) {
  const { data } = await admin().from("jam_events").select("*").eq("name", name);
  return (data ?? []) as Array<Record<string, unknown>>;
}

async function openCreate(page: Page, boss: Person) {
  await loginThroughUi(page, boss.user);
  await page.goto("/admin/jam");
  await page.getByRole("button", { name: "Sự kiện mới" }).click();
  return page.getByRole("dialog");
}

async function fill(dialog: ReturnType<Page["getByRole"]>, values: { name?: string; start?: string; end?: string }) {
  if (values.name !== undefined) await dialog.locator('input[name="jam-name"]').fill(values.name);
  if (values.start !== undefined) await dialog.locator('input[name="jam-start"]').fill(values.start);
  if (values.end !== undefined) await dialog.locator('input[name="jam-end"]').fill(values.end);
}

async function endLiveEvents() {
  await admin().from("jam_events").delete().not("id", "is", null);
}

test.describe("Admin Jam creation and cancellation", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(240_000);
  test.beforeEach(async () => {
    await endLiveEvents();
  });
  test.afterEach(async () => {
    await endLiveEvents();
    await cleanupE2eUsers();
  });

  test("JAM-019 creates a scheduled event from an empty project and records it in the action log", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const dialog = await openCreate(page, boss);
    await fill(dialog, { name: "Autumn Jam 2026", start: tomorrowAt(19), end: tomorrowAt(21) });
    await dialog.getByRole("button", { name: "Tạo sự kiện" }).click();
    await expect(page.getByText("Đã tạo sự kiện “Autumn Jam 2026”.")).toBeVisible();
    await page.getByRole("tab", { name: "Sắp diễn ra" }).click();
    await expect(page.getByText("Autumn Jam 2026").first()).toBeVisible();
    const rows = await eventsNamed("Autumn Jam 2026");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("scheduled");
    expect(rows[0].starting_project_id).toBeNull();
    expect(rows[0].jam_project_id).not.toBeNull();
    const { data: workspace } = await admin().from("projects").select("owner_id, visibility").eq("id", rows[0].jam_project_id as string).single();
    expect(workspace?.visibility).toBe("private");
    const { data: logs } = await admin()
      .from("admin_audit_log")
      .select("id, admin_id, action, created_at")
      .eq("target_id", rows[0].id as string);
    expect(logs).toHaveLength(1);
    expect(logs?.[0].admin_id).toBe(boss.user.id);
    expect(logs?.[0].action).toBe("create_jam_event");
    const edit = await admin().from("admin_audit_log").update({ reason: "tampered" }).eq("id", logs?.[0].id as string).select();
    const del = await admin().from("admin_audit_log").delete().eq("id", logs?.[0].id as string).select();
    expect((edit.error ?? null) !== null || (edit.data ?? []).length === 0).toBe(true);
    expect((del.error ?? null) !== null || (del.data ?? []).length === 0).toBe(true);
  });

  test("JAM-020 starting from a public project works on a copy and leaves the original untouched", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const owner = await person("B");
    const project = await publicProject(owner, "Public Song");
    const before = await owner.api.history(project.branchId);
    const dialog = await openCreate(page, boss);
    await fill(dialog, { name: "Remix Jam", start: tomorrowAt(10), end: tomorrowAt(12) });
    await dialog.locator('select[name="jam-starting-project"]').selectOption({ label: "Public Song" });
    await dialog.getByRole("button", { name: "Tạo sự kiện" }).click();
    await expect(page.getByText("Đã tạo sự kiện “Remix Jam”.")).toBeVisible();
    const rows = await eventsNamed("Remix Jam");
    expect(rows).toHaveLength(1);
    expect(rows[0].starting_project_id).toBe(project.id);
    expect(rows[0].jam_project_id).not.toBe(project.id);
    const { data: original } = await admin().from("projects").select("owner_id, visibility").eq("id", project.id).single();
    expect(original).toMatchObject({ owner_id: owner.user.id, visibility: "public" });
    const after = await owner.api.history(project.branchId);
    expect(after.map((c) => c.id)).toEqual(before.map((c) => c.id));
  });

  test("JAM-021 an event scheduled to begin now opens at once", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const dialog = await openCreate(page, boss);
    await fill(dialog, { name: "Now Jam", start: local(-1), end: local(60) });
    await dialog.getByRole("button", { name: "Tạo sự kiện" }).click();
    await expect(page.getByText("Đã tạo sự kiện “Now Jam”.")).toBeVisible();
    const rows = await eventsNamed("Now Jam");
    expect(rows[0].status).toBe("active");
    await page.getByRole("tab", { name: "Đang diễn ra" }).click();
    await expect(page.getByText("Now Jam").first()).toBeVisible();
    const user = await person("A");
    const active = (await user.api.call("GET", "/jam/events?status=active")) as Array<{ name: string }>;
    expect(active.map((e) => e.name)).toContain("Now Jam");
    const scheduled = (await user.api.call("GET", "/jam/events?status=scheduled")) as Array<{ name: string }>;
    expect(scheduled.map((e) => e.name)).not.toContain("Now Jam");
  });

  test("JAM-022 a missing name or missing end time shows an inline error and creates nothing", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const dialog = await openCreate(page, boss);
    await fill(dialog, { start: tomorrowAt(19), end: tomorrowAt(21) });
    await dialog.getByRole("button", { name: "Tạo sự kiện" }).click();
    await expect(dialog.getByText("Tên sự kiện không được để trống.")).toBeVisible();
    await fill(dialog, { name: "No Time Jam", end: "" });
    await dialog.getByRole("button", { name: "Tạo sự kiện" }).click();
    await expect(dialog.getByText("Vui lòng chọn thời gian kết thúc.")).toBeVisible();
    expect(await eventsNamed("No Time Jam")).toHaveLength(0);
    const { count } = await admin().from("jam_events").select("id", { count: "exact", head: true }).eq("status", "scheduled");
    expect(count).toBe(0);
  });

  test("JAM-023 an end time at or before the start time is rejected", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const dialog = await openCreate(page, boss);
    await fill(dialog, { name: "Bad Window", start: tomorrowAt(20), end: tomorrowAt(20) });
    await dialog.getByRole("button", { name: "Tạo sự kiện" }).click();
    await expect(dialog.getByText("Thời gian kết thúc phải sau thời gian bắt đầu.")).toBeVisible();
    await fill(dialog, { end: tomorrowAt(19) });
    await dialog.getByRole("button", { name: "Tạo sự kiện" }).click();
    await expect(dialog.getByText("Thời gian kết thúc phải sau thời gian bắt đầu.")).toBeVisible();
    expect(await eventsNamed("Bad Window")).toHaveLength(0);
  });

  test("JAM-024 a window overlapping a live event needs confirmation", async ({ page }) => {
    const boss = await person("Boss", "admin");
    await boss.api.call("POST", "/admin/jam", {
      name: "Open Jam",
      scheduledStartAt: new Date(Date.now() - 60_000).toISOString(),
      scheduledEndAt: new Date(Date.now() + 3_600_000).toISOString(),
      editCooldownSec: 10,
    });
    const dialog = await openCreate(page, boss);
    await fill(dialog, { name: "Overlap Jam", start: local(-1), end: local(120) });
    await dialog.getByRole("button", { name: "Tạo sự kiện" }).click();
    await expect(dialog.getByText("Trùng giờ với một sự kiện khác")).toBeVisible();
    await expect(dialog.getByText(/cạnh tranh cùng một nhóm người tham gia/)).toBeVisible();
    await dialog.getByRole("button", { name: "Huỷ", exact: true }).click();
    expect(await eventsNamed("Overlap Jam")).toHaveLength(0);
    await dialog.getByRole("button", { name: "Tạo sự kiện" }).click();
    await dialog.getByRole("button", { name: "Vẫn tạo" }).click();
    await expect(page.getByText("Đã tạo sự kiện “Overlap Jam”.")).toBeVisible();
    expect(await eventsNamed("Overlap Jam")).toHaveLength(1);
  });

  test("JAM-025 no event is created when the starting project cannot be copied", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const owner = await person("B");
    const project = await publicProject(owner, "Public Song");
    const dialog = await openCreate(page, boss);
    await fill(dialog, { name: "Gone Jam", start: tomorrowAt(10), end: tomorrowAt(12) });
    await dialog.locator('select[name="jam-starting-project"]').selectOption({ label: "Public Song" });
    await owner.api.setVisibility(project.id, "private");
    const { count: projectsBefore } = await admin().from("projects").select("id", { count: "exact", head: true });
    await dialog.getByRole("button", { name: "Tạo sự kiện" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Không sao chép được dự án khởi đầu");
    expect(await eventsNamed("Gone Jam")).toHaveLength(0);
    const { count: projectsAfter } = await admin().from("projects").select("id", { count: "exact", head: true });
    expect(projectsAfter).toBe(projectsBefore);
  });

  test("JAM-029 cancelling a scheduled event removes it and notifies interested users", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await person("A");
    const created = (await boss.api.call("POST", "/admin/jam", {
      name: "Autumn Jam 2026",
      scheduledStartAt: new Date(Date.now() + 86_400_000).toISOString(),
      scheduledEndAt: new Date(Date.now() + 86_400_000 + 7_200_000).toISOString(),
    })) as { id: string };
    await admin().from("jam_participants").insert({ event_id: created.id, user_id: user.user.id });
    await loginThroughUi(page, boss.user);
    await page.goto("/admin/jam");
    await page.getByRole("tab", { name: "Sắp diễn ra" }).click();
    await expect(page.getByText("Autumn Jam 2026").first()).toBeVisible();
    await page.getByRole("button", { name: "Huỷ", exact: true }).first().click();
    await page.getByRole("dialog").or(page.getByRole("alertdialog")).getByRole("button", { name: "Hủy sự kiện" }).click();
    await expect(page.getByText(/Đã hủy sự kiện/)).toBeVisible();
    await expect(page.getByText("Autumn Jam 2026", { exact: true })).toHaveCount(0);
    const { data: event } = await admin().from("jam_events").select("status").eq("id", created.id).single();
    expect(event?.status).toBe("cancelled");
    await expect
      .poll(async () => {
        const { data } = await admin().from("notifications").select("type").eq("user_id", user.user.id);
        return (data ?? []).map((n) => n.type);
      })
      .toContain("jam.cancelled");
    const { data: logs } = await admin().from("admin_audit_log").select("action").eq("target_id", created.id);
    expect((logs ?? []).map((l) => l.action)).toContain("jam.cancel");
  });
});
