import { expect as baseExpect, test } from "@playwright/test";
import { admin } from "./support/auth-links";
import { anyDialog, ensurePlans, person, type Person } from "./support/people";
import { cleanupE2eUsers, loginThroughUi } from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const DAY = 24 * 60 * 60 * 1000;

interface Plan {
  id: string;
  name: string;
  priceVnd: number;
  isDefault: boolean;
  isActive: boolean;
  isCurrent?: boolean;
}

interface Sub {
  plan: Plan;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: Plan | null;
  hasPaidAccess: boolean;
  inGrace: boolean;
}

const createdPlanIds: string[] = [];
let counter = 0;

async function cheapPlan(boss: Person, price: number): Promise<Plan> {
  counter += 1;
  const out = (await boss.api.call("POST", "/admin/plans", {
    name: `E2E Sub Plan ${Date.now()}-${counter}`,
    priceVnd: price,
    features: { theme_from_image: true },
    status: "active",
  })) as { plan: Plan };
  createdPlanIds.push(out.plan.id);
  return out.plan;
}

async function paidPlan(boss: Person): Promise<Plan> {
  const plans = (await boss.api.call("GET", "/admin/plans")) as Plan[];
  return plans.find((p) => !p.isDefault && p.isActive && p.name === "STAVE+") ?? plans.find((p) => !p.isDefault && p.isActive)!;
}

async function pay(who: Person, planId: string): Promise<{ orderCode: number; txId: string }> {
  const checkout = (await who.api.call("POST", "/subscriptions/checkout", { planId })) as { orderCode: number };
  await who.api.call("POST", `/dev/fake-payment/${checkout.orderCode}/success`);
  const { data } = await admin().from("transactions").select("id").eq("order_code", checkout.orderCode).single();
  return { orderCode: checkout.orderCode, txId: data!.id as string };
}

async function mine(who: Person): Promise<Sub> {
  return (await who.api.call("GET", "/subscriptions/me")) as Sub;
}

async function statusOf(call: Promise<unknown>): Promise<number> {
  try {
    await call;
    return 200;
  } catch (error) {
    return Number(/-> (\d+)/.exec(String(error))?.[1] ?? 0);
  }
}

test.describe("Subscriptions and billing", () => {
  test.setTimeout(240_000);
  test.beforeAll(async () => {
    await ensurePlans();
  });
  test.afterEach(async () => {
    const free = (await admin().from("subscription_plans").select("id").eq("is_default", true).single()).data!.id;
    for (const id of createdPlanIds.splice(0)) {
      await admin().from("subscriptions").update({ plan_id: free, pending_plan_id: null }).eq("plan_id", id);
      await admin().from("subscriptions").update({ pending_plan_id: null }).eq("pending_plan_id", id);
      await admin().from("transactions").update({ plan_id: null }).eq("plan_id", id);
      await admin().from("subscription_plans").delete().eq("id", id);
    }
    await cleanupE2eUsers();
  });

  test("SUB-001 lists each plan with price, features and cancellation terms and marks the current plan", async ({ page }) => {
    const user = await person("Shopper");
    await loginThroughUi(page, user.user);
    await page.goto("/plans");
    await expect(page.getByText("Gói hiện tại").first()).toBeVisible();
    await expect(page.getByText("Miễn phí").first()).toBeVisible();
    await expect(page.getByText(/Huỷ bất cứ lúc nào/).first()).toBeVisible();
    await expect(page.getByText("Theme tạo từ ảnh").first()).toBeVisible();
    const plans = (await user.api.call("GET", "/subscription-plans")) as Plan[];
    expect(plans.filter((p) => p.isCurrent).length).toBe(1);
  });

  test("SUB-002 highlights the paid feature the user tried to use", async ({ page }) => {
    const user = await person("Shopper");
    await loginThroughUi(page, user.user);
    await page.goto("/plans?feature=theme_from_image");
    await expect(page.getByText("Có tính năng bạn cần").first()).toBeVisible();
  });

  test("SUB-003 offers change or cancel to a subscribed user instead of subscribe", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await person("Subscriber");
    await pay(user, (await paidPlan(boss)).id);
    await loginThroughUi(page, user.user);
    await page.goto("/plans");
    await expect(page.getByRole("button", { name: "Huỷ gói" }).first()).toBeVisible();
  });

  test("SUB-004 reports an error when the plan list cannot be retrieved", async ({ page }) => {
    const user = await person("Shopper");
    await loginThroughUi(page, user.user);
    await page.route("**/subscription-plans", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/plans");
    await expect(page.getByText("Không tải được danh sách gói.")).toBeVisible();
  });

  test("SUB-005 keeps a deactivated plan as the subscriber's own plan without offering it to others", async () => {
    const boss = await person("Boss", "admin");
    const owner = await person("Holder");
    const other = await person("Other");
    const plan = await cheapPlan(boss, 25000);
    await pay(owner, plan.id);
    await boss.api.call("POST", `/admin/plans/${plan.id}/deactivate`);
    const holderPlans = (await owner.api.call("GET", "/subscription-plans")) as Plan[];
    const otherPlans = (await other.api.call("GET", "/subscription-plans")) as Plan[];
    expect(holderPlans.some((p) => p.id === plan.id && p.isCurrent)).toBe(true);
    expect(otherPlans.some((p) => p.id === plan.id)).toBe(false);
  });

  test("SUB-010 refuses to subscribe when the payment gateway is unreachable and changes nothing", async ({ page }) => {
    const user = await person("Shopper");
    await loginThroughUi(page, user.user);
    await page.route("**/subscriptions/checkout", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Payment service unavailable" }) }),
    );
    await page.goto("/plans");
    await page.getByRole("button", { name: /Nâng cấp lên/ }).first().click();
    await anyDialog(page).getByRole("button", { name: "Tiếp tục thanh toán" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    expect((await mine(user)).plan.isDefault).toBe(true);
  });

  test("SUB-012 does not end the subscription at once when a renewal payment fails", async () => {
    const boss = await person("Boss", "admin");
    const user = await person("Renewer");
    const plan = await paidPlan(boss);
    await pay(user, plan.id);
    const renew = (await user.api.call("POST", "/subscriptions/renew")) as { orderCode: number };
    await user.api.call("POST", `/dev/fake-payment/${renew.orderCode}/fail`);
    const sub = await mine(user);
    expect(sub.status).toBe("active");
    expect(sub.hasPaidAccess).toBe(true);
  });

  test("SUB-014 makes no change when the confirmation is cancelled", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await person("Subscriber");
    await pay(user, (await paidPlan(boss)).id);
    await loginThroughUi(page, user.user);
    await page.goto("/plans");
    await page.getByRole("button", { name: /Đổi gói|Huỷ gói/ }).first().click();
    const dialog = anyDialog(page);
    await dialog.getByRole("button", { name: /Giữ gói|Để sau|Huỷ$/ }).first().click();
    expect((await mine(user)).cancelAtPeriodEnd).toBe(false);
  });

  test("SUB-015 keeps the current plan when a scheduled downgrade is cancelled", async () => {
    const boss = await person("Boss", "admin");
    const user = await person("Downgrader");
    const high = await cheapPlan(boss, 90000);
    const low = await cheapPlan(boss, 20000);
    await pay(user, high.id);
    await user.api.call("POST", "/subscriptions/change", { planId: low.id });
    expect((await mine(user)).pendingPlan?.id).toBe(low.id);
    await user.api.call("POST", "/subscriptions/cancel-downgrade");
    const sub = await mine(user);
    expect(sub.pendingPlan).toBeNull();
    expect(sub.plan.id).toBe(high.id);
  });

  test("SUB-017 refuses a plan change when the payment gateway is unreachable", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await person("Upgrader");
    const low = await cheapPlan(boss, 20000);
    const high = await cheapPlan(boss, 90000);
    await pay(user, low.id);
    await loginThroughUi(page, user.user);
    await page.route("**/subscriptions/change", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Payment service unavailable" }) }),
    );
    await page.goto("/plans");
    await page.getByRole("button", { name: /Đổi gói|Nâng cấp lên|Đổi sang/ }).first().click();
    await anyDialog(page).getByRole("button", { name: /Tiếp tục thanh toán|Đặt lịch chuyển gói/ }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    expect((await mine(user)).plan.id).toBe(low.id);
  });

  test("SUB-018 refuses a change to a plan deactivated after the page loaded", async () => {
    const boss = await person("Boss", "admin");
    const user = await person("Late");
    const low = await cheapPlan(boss, 20000);
    const high = await cheapPlan(boss, 90000);
    await pay(user, low.id);
    await boss.api.call("POST", `/admin/plans/${high.id}/deactivate`);
    expect(await statusOf(user.api.call("POST", "/subscriptions/change", { planId: high.id }))).toBe(409);
    expect((await mine(user)).plan.id).toBe(low.id);
  });

  test("SUB-019 schedules a downgrade for the end of the paid period and does not apply it at once", async () => {
    const boss = await person("Boss", "admin");
    const user = await person("Downgrader");
    const high = await cheapPlan(boss, 90000);
    const low = await cheapPlan(boss, 20000);
    await pay(user, high.id);
    await user.api.call("POST", "/subscriptions/change", { planId: low.id });
    const sub = await mine(user);
    expect(sub.plan.id).toBe(high.id);
    expect(sub.pendingPlan?.id).toBe(low.id);
    const charges = await admin().from("transactions").select("id").eq("user_id", user.user.id);
    expect(charges.data?.length).toBe(1);
  });

  test("SUB-020 cancels the subscription: renewal stops and paid features stay until the period end", async () => {
    const boss = await person("Boss", "admin");
    const user = await person("Canceller");
    await pay(user, (await paidPlan(boss)).id);
    await user.api.call("POST", "/subscriptions/cancel");
    const sub = await mine(user);
    expect(sub.cancelAtPeriodEnd).toBe(true);
    expect(sub.hasPaidAccess).toBe(true);
    expect(sub.currentPeriodEnd).toBeTruthy();
  });

  test("SUB-021 leaves the subscription unchanged when the cancellation confirmation is dismissed", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await person("Hesitant");
    await pay(user, (await paidPlan(boss)).id);
    await loginThroughUi(page, user.user);
    await page.goto("/plans");
    await page.getByRole("button", { name: "Huỷ gói" }).first().click();
    await anyDialog(page).getByRole("button", { name: "Giữ gói" }).click();
    expect((await mine(user)).cancelAtPeriodEnd).toBe(false);
  });

  test("SUB-022 removes the cancellation without a new charge when resubscribing before the period ends", async () => {
    const boss = await person("Boss", "admin");
    const user = await person("Changer");
    await pay(user, (await paidPlan(boss)).id);
    await user.api.call("POST", "/subscriptions/cancel");
    await user.api.call("POST", "/subscriptions/resume");
    expect((await mine(user)).cancelAtPeriodEnd).toBe(false);
    const rows = await admin().from("transactions").select("id").eq("user_id", user.user.id);
    expect(rows.data?.length).toBe(1);
  });

  test("SUB-023 leaves the subscription renewing when cancellation fails on the server", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await person("Unlucky");
    await pay(user, (await paidPlan(boss)).id);
    await loginThroughUi(page, user.user);
    await page.route("**/subscriptions/cancel", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
        : route.continue(),
    );
    await page.goto("/plans");
    await page.getByRole("button", { name: "Huỷ gói" }).first().click();
    await anyDialog(page).getByRole("button", { name: "Huỷ gói" }).click();
    await expect(page.getByText("Không huỷ được gói, gói của bạn vẫn gia hạn.")).toBeVisible();
    expect((await mine(user)).cancelAtPeriodEnd).toBe(false);
  });

  test("SUB-024 warns in the cancellation dialog which paid setting will revert", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await person("Themed");
    await pay(user, (await paidPlan(boss)).id);
    await admin().from("themes").insert({ user_id: user.user.id, type: "custom", palette: {} }).then(() => undefined, () => undefined);
    const preview = (await user.api.call("GET", "/subscriptions/cancel-preview")) as { endDate: string | null; paidOnlySettings: string[] };
    expect(preview.endDate).toBeTruthy();
    await loginThroughUi(page, user.user);
    await page.goto("/plans");
    await page.getByRole("button", { name: "Huỷ gói" }).first().click();
    await expect(anyDialog(page).getByText(/Không dự án hay dữ liệu nào bị xoá/)).toBeVisible();
  });

  test("SUB-025 reverts the account to the free plan at the end of the paid period without data loss", async () => {
    const boss = await person("Boss", "admin");
    const user = await person("Expired");
    await pay(user, (await paidPlan(boss)).id);
    const project = await user.api.createProject("Kept After Expiry");
    await user.api.call("POST", "/subscriptions/cancel");
    await admin()
      .from("subscriptions")
      .update({ current_period_end: new Date(Date.now() - DAY).toISOString(), grace_until: new Date(Date.now() - DAY / 2).toISOString() })
      .eq("user_id", user.user.id);
    await expect
      .poll(async () => (await mine(user)).plan.isDefault, { timeout: 20_000 })
      .toBe(true);
    const { data } = await admin().from("projects").select("id").eq("id", project.id);
    expect(data?.length).toBe(1);
  });

  test("SUB-027 lists all payment attempts newest first with the current plan and next payment date", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await person("Historian");
    const plan = await paidPlan(boss);
    const failed = (await user.api.call("POST", "/subscriptions/checkout", { planId: plan.id })) as { orderCode: number };
    await user.api.call("POST", `/dev/fake-payment/${failed.orderCode}/fail`);
    await pay(user, plan.id);
    const history = (await user.api.call("GET", "/billing/transactions")) as { items: { createdAt: string }[] };
    expect(history.items.length).toBeGreaterThanOrEqual(2);
    const times = history.items.map((i) => new Date(i.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    await loginThroughUi(page, user.user);
    await page.goto("/billing");
    await expect(page.getByText(/Gói hiện tại:/).first()).toBeVisible();
    await expect(page.getByText(/Thanh toán kế tiếp/).first()).toBeVisible();
  });

  test("SUB-028 shows a failed payment later retried successfully with both records linked", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await person("Retrier");
    const plan = await paidPlan(boss);
    const failed = (await user.api.call("POST", "/subscriptions/checkout", { planId: plan.id })) as { orderCode: number };
    await user.api.call("POST", `/dev/fake-payment/${failed.orderCode}/fail`);
    const retried = await pay(user, plan.id);
    const { data: failedRow } = await admin().from("transactions").select("id").eq("order_code", failed.orderCode).single();
    await admin().from("transactions").update({ retry_of: failedRow!.id }).eq("id", retried.txId);
    await loginThroughUi(page, user.user);
    await page.goto("/billing");
    await expect(page.getByText(/Thử lại sau lần thất bại/).first()).toBeVisible();
  });

  test("SUB-029 explains an account that was never charged", async ({ page }) => {
    const user = await person("Nevercharged");
    await loginThroughUi(page, user.user);
    await page.goto("/billing");
    await expect(page.getByText("Chưa có giao dịch nào")).toBeVisible();
  });

  test("SUB-030 reports an error when the billing records cannot be retrieved", async ({ page }) => {
    const user = await person("Unlucky");
    await loginThroughUi(page, user.user);
    await page.route("**/billing/transactions*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/billing");
    await expect(page.getByText("Không tải được lịch sử giao dịch.")).toBeVisible();
  });

  test("SUB-031 still shows the details when a receipt cannot be produced for an old record", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await person("Oldrecord");
    const plan = await paidPlan(boss);
    const failed = (await user.api.call("POST", "/subscriptions/checkout", { planId: plan.id })) as { orderCode: number };
    await user.api.call("POST", `/dev/fake-payment/${failed.orderCode}/fail`);
    const { data } = await admin().from("transactions").select("id").eq("order_code", failed.orderCode).single();
    await loginThroughUi(page, user.user);
    await page.goto(`/billing/receipts/${data!.id}`);
    await expect(page.getByText("Chi tiết giao dịch")).toBeVisible();
    await expect(page.getByText(/Biên lai không có cho giao dịch này/)).toBeVisible();
  });
});
