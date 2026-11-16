import { expect as baseExpect, test } from "@playwright/test";
import { admin } from "./support/auth-links";
import {
  anyDialog,
  httpStatus,
  person,
  publicProject,
  seedSound,
  type Person,
} from "./support/people";
import { cleanupE2eUsers, loginThroughUi } from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const REASON = "Violates the community policy on shared content";

interface Setup {
  boss: Person;
  owner: Person;
  reporter: Person;
  projectId: string;
  branchId: string;
}

async function reported(name: string, reporters = 1): Promise<Setup> {
  const boss = await person("Boss", "admin");
  const owner = await person("Owner");
  const reporter = await person("Reporter");
  const project = await publicProject(owner, name);
  await reporter.api.call("POST", `/projects/${project.id}/reports`, {
    reason: "copyright",
    details: "Copied from a song",
  });
  for (let i = 1; i < reporters; i += 1) {
    const other = await person("Other");
    await other.api.call("POST", `/projects/${project.id}/reports`, {
      reason: "spam",
    });
  }
  return { boss, owner, reporter, projectId: project.id, branchId: project.branchId };
}

async function notificationTypes(userId: string): Promise<string[]> {
  const { data } = await admin()
    .from("notifications")
    .select("type")
    .eq("user_id", userId);
  return (data ?? []).map((row) => row.type as string);
}

async function projectRow(id: string) {
  const { data } = await admin()
    .from("projects")
    .select("moderation_hidden_at, moderation_policy")
    .eq("id", id)
    .single();
  return data as { moderation_hidden_at: string | null; moderation_policy: string | null };
}

async function reportRows(projectId: string) {
  const { data } = await admin()
    .from("reports")
    .select("id, resolution, reporter_id")
    .eq("project_id", projectId);
  return (data ?? []) as { id: string; resolution: string | null; reporter_id: string }[];
}

test.describe("Admin content moderation", () => {
  test.setTimeout(240_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("ADM-CNT-001 groups open reports by project with reasons and counts", async ({ page }) => {
    const s = await reported("Grouped Song", 2);
    await loginThroughUi(page, s.boss.user);
    await page.goto("/admin/reports");
    const row = page.getByText("Grouped Song").first();
    await expect(row).toBeVisible();
    await expect(page.getByText("2 báo cáo").first()).toBeVisible();
    await expect(page.getByText("Vi phạm bản quyền").first()).toBeVisible();
    const list = (await s.boss.api.call("GET", "/admin/reports")) as {
      items: { projectId: string; reportCount: number; reasons: unknown[] }[];
    };
    const group = list.items.find((g) => g.projectId === s.projectId);
    expect(group?.reportCount).toBe(2);
    expect(group?.reasons.length).toBe(2);
  });

  test("ADM-CNT-002 shows past decisions with reasons in the resolved and dismissed tabs", async ({ page }) => {
    const s = await reported("Past Decision");
    await s.boss.api.call("POST", `/admin/reports/${s.projectId}/dismiss`, {
      reportIds: (await reportRows(s.projectId)).map((r) => r.id),
      reason: "The report has no merit at all",
    });
    await loginThroughUi(page, s.boss.user);
    await page.goto("/admin/reports");
    await page.getByRole("tab", { name: "Đã bỏ qua" }).click();
    await expect(page.getByText("Past Decision")).toBeVisible();
    const detail = (await s.boss.api.call(
      "GET",
      `/admin/reports/${s.projectId}?status=dismissed`,
    )) as { resolution: { resolution?: string } | string | null; status: string }[];
    expect(detail.length).toBe(1);
    expect(detail[0].status).toBe("resolved");
  });

  test("ADM-CNT-003 lets the admin review a reported project that is now private", async () => {
    const s = await reported("Went Private");
    await s.owner.api.setVisibility(s.projectId, "private");
    const preview = (await s.boss.api.call(
      "GET",
      `/admin/reports/${s.projectId}/preview`,
    )) as { project: { id: string; name: string } };
    expect(preview.project.id).toBe(s.projectId);
    expect(preview.project.name).toBe("Went Private");
  });

  test("ADM-CNT-004 shows an empty state when no report is open", async ({ page }) => {
    const boss = await person("Boss", "admin");
    await loginThroughUi(page, boss.user);
    await page.route("**/admin/reports?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, page: 1, limit: 20 }),
      }),
    );
    await page.goto("/admin/reports");
    await expect(page.getByText("Không có báo cáo đang mở")).toBeVisible();
  });

  test("ADM-CNT-005 reports an error when the reports cannot be retrieved", async ({ page }) => {
    const boss = await person("Boss", "admin");
    await loginThroughUi(page, boss.user);
    await page.route("**/admin/reports?*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/admin/reports");
    await expect(page.getByRole("alert").filter({ hasText: "Không tải được danh sách báo cáo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Thử lại" })).toBeVisible();
  });

  test("ADM-CNT-006 marks a group whose project was deleted as not actionable", async ({ page }) => {
    const s = await reported("Gone Project");
    await s.owner.api.call("DELETE", `/projects/${s.projectId}`);
    const list = (await s.boss.api.call("GET", "/admin/reports")) as {
      items: { projectExists: boolean; projectName: string | null; reportCount: number }[];
    };
    const orphan = list.items.find((g) => !g.projectExists);
    expect(orphan).toBeTruthy();
    await loginThroughUi(page, s.boss.user);
    await page.goto("/admin/reports");
    await expect(page.getByText("Không còn xử lý được").first()).toBeVisible();
    await page.getByRole("button", { name: "Bỏ qua", exact: true }).first().click();
    const dialog = anyDialog(page);
    await dialog.locator("textarea").fill("The project is gone, closing the reports");
    await dialog.getByRole("button", { name: /Bỏ qua/ }).last().click();
    await expect(dialog).toHaveCount(0);
    const { data } = await admin()
      .from("reports")
      .select("id")
      .is("project_id", null)
      .eq("resolution", "dismissed");
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  test("ADM-CNT-007 shows the reporter only to admins, never to the reported user", async () => {
    const s = await reported("Secret Reporter");
    const detail = (await s.boss.api.call(
      "GET",
      `/admin/reports/${s.projectId}`,
    )) as { reporter: { id: string } | null }[];
    expect(detail[0].reporter?.id).toBe(s.reporter.user.id);
    expect(await httpStatus(s.owner.api.call("GET", `/admin/reports/${s.projectId}`))).toBe(403);
    await s.boss.api.call("POST", `/admin/reports/${s.projectId}/remove`, {
      reason: REASON,
      policy: "copyright",
    });
    const { data } = await admin()
      .from("notifications")
      .select("payload")
      .eq("user_id", s.owner.user.id);
    expect(JSON.stringify(data ?? [])).not.toContain(s.reporter.user.id);
  });

  test("ADM-CNT-008 removes a project with reason and policy, keeps it hidden and tells the owner", async () => {
    const s = await reported("Public Song");
    const out = (await s.boss.api.call("POST", `/admin/reports/${s.projectId}/remove`, {
      reason: REASON,
      policy: "copyright",
    })) as { closedReports: number; retainUntil: string };
    expect(out.closedReports).toBe(1);
    expect(out.retainUntil).toBeTruthy();
    const row = await projectRow(s.projectId);
    expect(row.moderation_hidden_at).not.toBeNull();
    expect(row.moderation_policy).toBe("copyright");
    expect(await notificationTypes(s.owner.user.id)).toContain("moderation.project_removed");
    const { data } = await admin().from("projects").select("id").eq("id", s.projectId);
    expect(data?.length).toBe(1);
    expect(
      await httpStatus(s.reporter.api.call("GET", `/explore/projects/${s.projectId}/graph`)),
    ).toBeGreaterThanOrEqual(400);
  });

  test("ADM-CNT-009 dismisses the reports instead of removing the project", async () => {
    const s = await reported("Dismissed Song");
    const ids = (await reportRows(s.projectId)).map((r) => r.id);
    const out = (await s.boss.api.call("POST", `/admin/reports/${s.projectId}/dismiss`, {
      reportIds: ids,
      reason: "The content is acceptable and original",
    })) as { dismissed: number };
    expect(out.dismissed).toBe(1);
    expect((await projectRow(s.projectId)).moderation_hidden_at).toBeNull();
    expect((await reportRows(s.projectId))[0].resolution).toBe("dismissed");
  });

  test("ADM-CNT-010 restores a removed project within the retention period and tells the owner", async () => {
    const s = await reported("Restore Me");
    await s.boss.api.call("POST", `/admin/reports/${s.projectId}/remove`, {
      reason: REASON,
      policy: "spam",
    });
    await s.boss.api.call("POST", `/admin/reports/${s.projectId}/restore`);
    expect((await projectRow(s.projectId)).moderation_hidden_at).toBeNull();
    expect(await notificationTypes(s.owner.user.id)).toContain("moderation.project_restored");
  });

  test("ADM-CNT-011 deletes a violating custom sound completely while the project keeps working", async () => {
    const s = await reported("Sound Project");
    const soundId = await seedSound(s.owner, "Bad Sound");
    const draft = await s.owner.api.draft(s.projectId);
    const snapshot = JSON.parse(JSON.stringify(draft)) as {
      tracks: Record<string, unknown>[];
    };
    if (snapshot.tracks.length > 0) snapshot.tracks[0].soundMap = { "36": soundId };
    await s.owner.api.call("PUT", `/projects/${s.projectId}/draft`, snapshot);
    const context = (await s.boss.api.call(
      "GET",
      `/admin/reports/${s.projectId}/removal-context`,
    )) as { sounds: { id: string }[] };
    const removeSoundIds = context.sounds.map((sound) => sound.id).filter((id) => id === soundId);
    const out = (await s.boss.api.call("POST", `/admin/reports/${s.projectId}/remove`, {
      reason: REASON,
      policy: "copyright",
      removeSoundIds,
    })) as { removedSounds: number };
    expect(out.removedSounds).toBe(removeSoundIds.length);
    if (removeSoundIds.length > 0) {
      const { data } = await admin().from("custom_sounds").select("id").eq("id", soundId);
      expect(data?.length).toBe(0);
    }
    const { data: project } = await admin().from("projects").select("id").eq("id", s.projectId);
    expect(project?.length).toBe(1);
  });

  test("ADM-CNT-012 refuses removal without a reason", async () => {
    const s = await reported("No Reason");
    const status = await httpStatus(
      s.boss.api.call("POST", `/admin/reports/${s.projectId}/remove`, { reason: "  ", policy: "spam" }),
    );
    expect(status).toBe(400);
    expect((await projectRow(s.projectId)).moderation_hidden_at).toBeNull();
  });

  test("ADM-CNT-013 leaves forks of a removed project unaffected", async () => {
    const s = await reported("Forked Song");
    const forker = await person("Forker");
    const fork = (await forker.api.call("POST", `/projects/${s.projectId}/fork`)) as { id?: string; project?: { id: string } };
    const forkId = fork.id ?? fork.project?.id ?? "";
    await s.boss.api.call("POST", `/admin/reports/${s.projectId}/remove`, {
      reason: REASON,
      policy: "copyright",
    });
    expect(forkId).toBeTruthy();
    expect((await projectRow(forkId)).moderation_hidden_at).toBeNull();
  });

  test("ADM-CNT-014 keeps the project visible when removal fails on the server", async ({ page }) => {
    const s = await reported("Server Error Song");
    await loginThroughUi(page, s.boss.user);
    await page.route(`**/admin/reports/${s.projectId}/remove`, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/admin/reports");
    await page.getByRole("button", { name: "Gỡ dự án" }).first().click();
    const dialog = anyDialog(page);
    await dialog.locator('input[name="removal-policy"]').first().check();
    await dialog.locator("textarea").fill(REASON);
    await dialog.getByRole("button", { name: /^Gỡ dự án$/ }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    expect((await projectRow(s.projectId)).moderation_hidden_at).toBeNull();
  });

  test("ADM-CNT-015 dismisses a report group with a reason and tells the reporter", async () => {
    const s = await reported("Dismiss With Note");
    const ids = (await reportRows(s.projectId)).map((r) => r.id);
    await s.boss.api.call("POST", `/admin/reports/${s.projectId}/dismiss`, {
      reportIds: ids,
      reason: "No policy was violated here",
    });
    expect(await notificationTypes(s.reporter.user.id)).toContain("report.reviewed");
  });

  test("ADM-CNT-016 closes the reports as upheld when the project is removed", async () => {
    const s = await reported("Upheld Song", 2);
    await s.boss.api.call("POST", `/admin/reports/${s.projectId}/remove`, {
      reason: REASON,
      policy: "harassment",
    });
    const rows = await reportRows(s.projectId);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.resolution === "upheld")).toBe(true);
  });

  test("ADM-CNT-017 dismisses abusive reports and lets the admin act against the reporting account", async () => {
    const s = await reported("Abusive Report");
    const ids = (await reportRows(s.projectId)).map((r) => r.id);
    await s.boss.api.call("POST", `/admin/reports/${s.projectId}/dismiss`, {
      reportIds: ids,
      reason: "The report is abusive and groundless",
    });
    await s.boss.api.call("POST", `/admin/users/${s.reporter.user.id}/suspend`, {
      reason: "Filed abusive reports repeatedly",
    });
    const { data } = await admin().from("users").select("status").eq("id", s.reporter.user.id).single();
    expect(data?.status).toBe("suspended");
  });

  test("ADM-CNT-018 does not close a report without a reason", async () => {
    const s = await reported("Silent Dismiss");
    const ids = (await reportRows(s.projectId)).map((r) => r.id);
    const status = await httpStatus(
      s.boss.api.call("POST", `/admin/reports/${s.projectId}/dismiss`, { reportIds: ids, reason: "" }),
    );
    expect(status).toBe(400);
    expect((await reportRows(s.projectId))[0].resolution).toBeNull();
  });

  test("ADM-CNT-019 adds a report that arrives after a decision to a new open group", async () => {
    const s = await reported("Late Report");
    const ids = (await reportRows(s.projectId)).map((r) => r.id);
    await s.boss.api.call("POST", `/admin/reports/${s.projectId}/dismiss`, {
      reportIds: ids,
      reason: "First batch is acceptable",
    });
    const late = await person("Late");
    await late.api.call("POST", `/projects/${s.projectId}/reports`, { reason: "spam" });
    const list = (await s.boss.api.call("GET", "/admin/reports")) as {
      items: { projectId: string; reportCount: number }[];
    };
    expect(list.items.find((g) => g.projectId === s.projectId)?.reportCount).toBe(1);
  });

  test("ADM-CNT-020 leaves the report open when recording the closure fails", async ({ page }) => {
    const s = await reported("Failed Closure");
    await loginThroughUi(page, s.boss.user);
    await page.route(`**/admin/reports/${s.projectId}/dismiss`, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/admin/reports");
    await page.getByRole("button", { name: "Bỏ qua" }).first().click();
    const dialog = anyDialog(page);
    await dialog.locator("textarea").fill("The report has no merit at all");
    await dialog.getByRole("button", { name: /Bỏ qua/ }).last().click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    expect((await reportRows(s.projectId))[0].resolution).toBeNull();
  });
});
