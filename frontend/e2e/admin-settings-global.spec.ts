import { expect as baseExpect, test } from "@playwright/test";
import { admin } from "./support/auth-links";
import { httpStatus, person, seedSound } from "./support/people";
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

test.describe("Admin system settings (global, run alone)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(240_000);
  test.afterEach(async () => {
    await resetSettings();
    await cleanupE2eUsers();
  });

  test("ADM-SET-001 changes the Jam cooldown, applies it at once and records the previous value", async () => {
    const boss = await person("Boss", "admin");
    const before = await settingValue(boss.api, "jam_edit_cooldown_sec");
    await boss.api.call("PUT", "/admin/settings", {
      changes: [{ key: "jam_edit_cooldown_sec", value: 12 }],
    });
    expect(await settingValue(boss.api, "jam_edit_cooldown_sec")).toBe(12);
    const { data } = await admin()
      .from("admin_audit_log")
      .select("reason")
      .eq("admin_id", boss.user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(JSON.stringify(data)).toContain(String(before));
  });

  test("ADM-SET-002 blocks sign-up when registrations are off but keeps existing accounts", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const existing = await person("Existing");
    await boss.api.call("PUT", "/admin/settings", {
      changes: [{ key: "registration_enabled", value: false }],
    });
    const created = await admin().auth.admin.createUser({
      email: `e2e-closed-${Date.now()}@stave-test.invalid`,
      password: "Test-Password-123!",
      email_confirm: true,
    });
    expect(created.error).not.toBeNull();
    expect(await httpStatus(existing.api.call("GET", "/auth/sessions"))).toBe(200);
    await page.goto("/register");
    await expect(page.getByText("Việc đăng ký tài khoản mới đang tạm đóng")).toBeVisible();
    await expect(page.locator('form button[type="submit"]')).toBeDisabled();
  });

  test("ADM-SET-003 discards unsaved changes when cancelled", async ({ page }) => {
    const boss = await person("Boss", "admin");
    await loginThroughUi(page, boss.user);
    await page.goto("/admin/settings");
    const input = page.locator('main input[type="text"]').first();
    await input.waitFor();
    const original = await input.inputValue();
    await input.fill(String(Number(original) + 3));
    await page.reload();
    await expect(page.locator('main input[type="text"]').first()).toHaveValue(original);
    expect(await settingValue(boss.api, "jam_edit_cooldown_sec")).toBe(5);
  });

  test("ADM-SET-004 refuses a value outside its permitted range and states the range", async () => {
    const boss = await person("Boss", "admin");
    let body = "";
    try {
      await boss.api.call("PUT", "/admin/settings", {
        changes: [{ key: "jam_edit_cooldown_sec", value: 99999 }],
      });
    } catch (error) {
      body = String(error);
    }
    expect(body).toContain("400");
    expect(body).toContain("out_of_range");
    expect(body).toContain("3600");
  });

  test("ADM-SET-005 warns when a limit drops below existing usage and keeps existing content", async () => {
    const boss = await person("Boss", "admin");
    const owner = await person("Heavy");
    const soundId = await seedSound(owner, "Big Sound");
    await admin().from("custom_sounds").update({ size_bytes: 6 * MB }).eq("id", soundId);
    const status = await httpStatus(
      boss.api.call("PUT", "/admin/settings", {
        changes: [{ key: "custom_sound_quota_bytes", value: 5 * MB }],
      }),
    );
    expect(status).toBe(409);
    expect(await settingValue(boss.api, "custom_sound_quota_bytes")).toBe(50 * MB);
    await boss.api.call("PUT", "/admin/settings", {
      changes: [{ key: "custom_sound_quota_bytes", value: 5 * MB }],
      confirmReduction: true,
    });
    const { data } = await admin().from("custom_sounds").select("id").eq("id", soundId);
    expect(data?.length).toBe(1);
  });

  test("ADM-SET-006 keeps the previous values when saving fails", async ({ page }) => {
    const boss = await person("Boss", "admin");
    await loginThroughUi(page, boss.user);
    await page.route("**/admin/settings", (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
        : route.continue(),
    );
    await page.goto("/admin/settings");
    const input = page.locator('main input[type="text"]').first();
    await input.waitFor();
    await input.fill("17");
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    expect(await settingValue(boss.api, "jam_edit_cooldown_sec")).toBe(5);
  });
});
