import { expect as baseExpect, test } from "@playwright/test";
import { admin } from "./support/auth-links";
import { anyDialog, ensurePlans, person, publicProject } from "./support/people";
import { cleanupE2eUsers, loginThroughUi } from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });

test.describe("Confirmation and currency requirements", () => {
  test.setTimeout(300_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("NFR-035 every permanent deletion asks for confirmation first and cancelling deletes nothing", async ({ page, browser }) => {
    const user = await person("Owner");
    const project = await user.api.createProject("Delete Me Song");
    await user.api.putDraft(project.id, [{ id: "n1" }]);
    await user.api.commit(project.branchId, "One");
    await user.api.createBranch(project.id, "experiment");
    await loginThroughUi(page, user.user);

    await page.goto("/profile");
    await page.getByRole("tab", { name: /bảo mật/i }).click();
    await page.getByRole("button", { name: /^xoá tài khoản$/i }).click();
    await expect(page.getByRole("button", { name: "Xác nhận xoá vĩnh viễn" })).toBeVisible();
    await expect(page.getByText(/không thể hoàn tác|vĩnh viễn/i).first()).toBeVisible();
    await page.locator("main").getByRole("button", { name: /^huỷ$/i }).click();
    await expect(page.getByRole("button", { name: "Xác nhận xoá vĩnh viễn" })).toHaveCount(0);
    const { data: stillThere } = await admin().from("users").select("id").eq("id", user.user.id).maybeSingle();
    expect(stillThere).not.toBeNull();

    await page.goto(`/projects/${project.id}/settings`);
    await page.getByRole("button", { name: /xóa dự án/i }).click();
    const projectDialog = page.getByRole("alertdialog");
    await expect(projectDialog).toContainText(/\d+\s*(commit|phiên bản)/i);
    await projectDialog.getByRole("button", { name: /^huỷ$/i }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    const { data: kept } = await admin().from("projects").select("id").eq("id", project.id).maybeSingle();
    expect(kept).not.toBeNull();

    await page.goto(`/projects/${project.id}?tab=branches`);
    await page.getByRole("button", { name: /^xoá nhánh (?!mặc định)/i }).first().click();
    const branchDialog = page.getByRole("alertdialog");
    await expect(branchDialog).toBeVisible();
    await branchDialog.getByRole("button", { name: /^huỷ$/i }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(await user.api.branchNames(project.id)).toContain("experiment");

    const boss = await person("Boss", "admin");
    const victim = await person("Victim");
    const reported = await publicProject(victim, "Reported Song");
    const reporter = await person("Reporter");
    await reporter.api.call("POST", `/projects/${reported.id}/reports`, { reason: "spam" });
    const adminPage = await (await browser.newContext()).newPage();
    await loginThroughUi(adminPage, boss.user);

    await adminPage.goto("/admin/users");
    await adminPage.locator('input[name="q"]').fill(victim.username);
    await adminPage.getByRole("button", { name: /^Tìm$/ }).click();
    await adminPage
      .getByText(`@${victim.username}`, { exact: true })
      .first()
      .locator("xpath=ancestor::div[contains(@class,'min-h-')][1]")
      .getByRole("button", { name: /xoá/i })
      .click();
    const userDialog = anyDialog(adminPage);
    await expect(userDialog).toContainText(/không thể hoàn tác/i);
    await userDialog.getByRole("button", { name: /^huỷ$/i }).click();
    await expect(anyDialog(adminPage)).toHaveCount(0);
    const { data: victimRow } = await admin().from("users").select("status").eq("id", victim.user.id).single();
    expect(victimRow?.status).toBe("active");

    await adminPage.goto("/admin/reports");
    await adminPage.getByRole("button", { name: "Gỡ dự án" }).first().click();
    const removalDialog = anyDialog(adminPage);
    await expect(removalDialog).toBeVisible();
    await removalDialog.getByRole("button", { name: /^huỷ$/i }).click();
    await expect(anyDialog(adminPage)).toHaveCount(0);
    const { data: hidden } = await admin().from("projects").select("moderation_hidden_at").eq("id", reported.id).single();
    expect(hidden?.moderation_hidden_at).toBeNull();
    await adminPage.context().close();
  });

  test("NFR-041 all prices and transaction amounts are shown in VND", async ({ page, browser }) => {
    await ensurePlans();
    const boss = await person("Boss", "admin");
    const buyer = await person("Buyer");
    const plans = (await boss.api.call("GET", "/admin/plans")) as Array<{ id: string; isDefault: boolean; isActive: boolean }>;
    const paid = plans.find((p) => !p.isDefault && p.isActive)!;
    const checkout = (await buyer.api.call("POST", "/subscriptions/checkout", { planId: paid.id })) as { orderCode: number };
    await buyer.api.call("POST", `/dev/fake-payment/${checkout.orderCode}/success`);
    const foreign = /\$|USD|EUR|€|£|¥/;

    await loginThroughUi(page, buyer.user);
    await page.goto("/plans");
    await expect(page.getByText(/₫|VND/).first()).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(foreign);

    await page.goto("/billing");
    await expect(page.getByText(/₫|VND/).first()).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(foreign);

    const adminPage = await (await browser.newContext()).newPage();
    await loginThroughUi(adminPage, boss.user);
    await adminPage.goto("/admin/plans");
    await expect(adminPage.getByText(/₫|VND/).first()).toBeVisible();
    expect(await adminPage.locator("main").innerText()).not.toMatch(foreign);
    await adminPage.context().close();
  });
});
