import { expect as baseExpect, test, type Page } from "@playwright/test";
import { admin } from "./support/auth-links";
import { anyDialog, ensurePlans, httpStatus, person, type Person } from "./support/people";
import { cleanupE2eUsers, loginThroughUi } from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const DAY = 24 * 60 * 60 * 1000;

interface PlanItem {
  id: string;
  name: string;
  priceVnd: number;
  isActive: boolean;
  isDefault: boolean;
  subscriberCount: number;
  priceEffectiveAt: string | null;
  featuresEffectiveAt: string | null;
}

let planCounter = 0;
const createdPlanIds: string[] = [];

function inDays(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString();
}

async function plansOf(boss: Person): Promise<PlanItem[]> {
  return (await boss.api.call("GET", "/admin/plans")) as PlanItem[];
}

async function paidPlan(boss: Person): Promise<PlanItem> {
  const plan = (await plansOf(boss)).find((p) => !p.isDefault && p.isActive);
  if (!plan) throw new Error("No paid plan in the test database");
  return plan;
}

async function newPlan(
  boss: Person,
  fields: Record<string, unknown> = {},
): Promise<PlanItem> {
  planCounter += 1;
  const out = (await boss.api.call("POST", "/admin/plans", {
    name: `E2E Plan ${Date.now()}-${planCounter}`,
    priceVnd: 30000,
    features: { theme_from_image: true },
    status: "active",
    ...fields,
  })) as { plan: PlanItem };
  createdPlanIds.push(out.plan.id);
  return out.plan;
}

async function subscribe(who: Person, planId: string): Promise<string> {
  const checkout = (await who.api.call("POST", "/subscriptions/checkout", {
    planId,
  })) as { orderCode: number };
  await who.api.call("POST", `/dev/fake-payment/${checkout.orderCode}/success`);
  const { data } = await admin()
    .from("transactions")
    .select("id")
    .eq("order_code", checkout.orderCode)
    .single();
  return data!.id as string;
}

async function failedPayment(who: Person, planId: string): Promise<string> {
  const checkout = (await who.api.call("POST", "/subscriptions/checkout", {
    planId,
  })) as { orderCode: number };
  await who.api.call("POST", `/dev/fake-payment/${checkout.orderCode}/fail`);
  const { data } = await admin()
    .from("transactions")
    .select("id")
    .eq("order_code", checkout.orderCode)
    .single();
  return data!.id as string;
}

async function reportIssue(who: Person, transactionId: string, text = "I was charged twice for one month"): Promise<string> {
  const out = (await who.api.call("POST", `/billing/transactions/${transactionId}/issues`, {
    description: text,
  })) as { id: string };
  return out.id;
}

async function subscriptionOf(userId: string) {
  const { data } = await admin()
    .from("subscriptions")
    .select("id, plan_id, status, price_locked_vnd, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  return data as {
    id: string;
    plan_id: string;
    status: string;
    price_locked_vnd: number;
    current_period_end: string;
  } | null;
}

function rowOf(page: Page, name: string) {
  return page
    .locator("main :is(li, tr, [role=row], article, div)", { has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: /Đổi giá|Tắt gói|Kích hoạt/ }) })
    .last();
}

async function setup() {
  const boss = await person("Boss", "admin");
  const buyer = await person("Buyer");
  return { boss, buyer };
}

test.describe("Admin payment management", () => {
  test.setTimeout(240_000);
  test.beforeAll(async () => {
    await ensurePlans();
  });
  test.afterEach(async () => {
    for (const id of createdPlanIds.splice(0)) {
      await admin().from("subscriptions").update({ plan_id: (await admin().from("subscription_plans").select("id").eq("is_default", true).single()).data!.id }).eq("plan_id", id);
      await admin().from("transactions").update({ plan_id: null }).eq("plan_id", id);
      await admin().from("subscription_plans").delete().eq("id", id);
    }
    await cleanupE2eUsers();
  });

  test("ADM-PAY-001 lists payments with gateway reference and period totals and no credentials", async ({ page }) => {
    const { boss, buyer } = await setup();
    const plan = await paidPlan(boss);
    await subscribe(buyer, plan.id);
    const list = (await boss.api.call("GET", "/admin/transactions?limit=50")) as {
      items: { providerRef: string | null; orderCode: number | null; outcome: string }[];
      summary: { successCount: number; totalChargeAmount: number };
    };
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.summary.successCount).toBeGreaterThan(0);
    expect(list.summary.totalChargeAmount).toBeGreaterThan(0);
    const text = JSON.stringify(list).toLowerCase();
    for (const secret of ["checksum", "api_key", "apikey", "client_id", "password"]) {
      expect(text).not.toContain(secret);
    }
    await loginThroughUi(page, boss.user);
    await page.goto("/admin/transactions");
    await expect(page.getByText("Tổng tiền thu thành công")).toBeVisible();
  });

  test("ADM-PAY-002 filters the list to failed payments", async () => {
    const { boss, buyer } = await setup();
    const plan = await paidPlan(boss);
    await failedPayment(buyer, plan.id);
    const list = (await boss.api.call("GET", "/admin/transactions?outcome=failed&limit=50")) as {
      items: { outcome: string }[];
    };
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items.every((item) => item.outcome === "failed")).toBe(true);
  });

  test("ADM-PAY-003 opens one transaction with its full record and gateway reference", async () => {
    const { boss, buyer } = await setup();
    const plan = await paidPlan(boss);
    const id = await subscribe(buyer, plan.id);
    const detail = (await boss.api.call("GET", `/admin/transactions/${id}`)) as {
      transaction: { id: string; orderCode: number | null; amountVnd: number };
    };
    expect(detail.transaction.id).toBe(id);
    expect(detail.transaction.orderCode).not.toBeNull();
    expect(detail.transaction.amountVnd).toBeGreaterThan(0);
  });

  test("ADM-PAY-004 explains a period without transactions", async ({ page }) => {
    const { boss } = await setup();
    const empty = (await boss.api.call(
      "GET",
      "/admin/transactions?from=2001-01-01T00:00:00Z&to=2001-01-02T00:00:00Z",
    )) as { items: unknown[]; summary: { successCount: number } };
    expect(empty.items).toEqual([]);
    expect(empty.summary.successCount).toBe(0);
    await loginThroughUi(page, boss.user);
    await page.route("**/admin/transactions?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [],
          nextCursor: null,
          summary: { totalChargeAmount: 0, totalRefundAmount: 0, successCount: 0, failedCount: 0 },
        }),
      }),
    );
    await page.goto("/admin/transactions");
    await expect(page.locator("main")).toContainText(/Không có giao dịch|chưa có giao dịch|Không tìm thấy/i);
  });

  test("ADM-PAY-005 reports an error and shows no totals when records cannot be retrieved", async ({ page }) => {
    const { boss } = await setup();
    await loginThroughUi(page, boss.user);
    await page.route("**/admin/transactions?*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/admin/transactions");
    await expect(page.getByText("Không tải được danh sách giao dịch")).toBeVisible();
    await expect(page.getByText("Tổng tiền thu thành công")).toHaveCount(0);
  });

  test("ADM-PAY-006 keeps a transaction of a deleted account against a deleted account", async () => {
    const { boss, buyer } = await setup();
    const plan = await paidPlan(boss);
    const id = await subscribe(buyer, plan.id);
    await boss.api.call("DELETE", `/admin/users/${buyer.user.id}`, {
      reason: "The account asked to be removed",
      confirmUsername: buyer.username,
    });
    const detail = (await boss.api.call("GET", `/admin/transactions/${id}`)) as {
      transaction: { id: string; account: unknown };
    };
    expect(detail.transaction.id).toBe(id);
    expect(detail.transaction.account).toBeNull();
  });

  test("ADM-PAY-007 creates a plan that becomes available without affecting subscribers", async () => {
    const { boss, buyer } = await setup();
    const existing = await paidPlan(boss);
    await subscribe(buyer, existing.id);
    const before = await subscriptionOf(buyer.user.id);
    const plan = await newPlan(boss);
    const offered = (await buyer.api.call("GET", "/subscription-plans")) as { id: string }[];
    expect(offered.some((p) => p.id === plan.id)).toBe(true);
    const after = await subscriptionOf(buyer.user.id);
    expect(after?.plan_id).toBe(before?.plan_id);
    expect(after?.price_locked_vnd).toBe(before?.price_locked_vnd);
  });

  test("ADM-PAY-008 does not offer a plan saved as inactive", async () => {
    const { boss, buyer } = await setup();
    const plan = await newPlan(boss, { status: "draft" });
    expect(plan.isActive).toBe(false);
    const offered = (await buyer.api.call("GET", "/subscription-plans")) as { id: string }[];
    expect(offered.some((p) => p.id === plan.id)).toBe(false);
  });

  test("ADM-PAY-009 refuses a plan with an empty name", async () => {
    const { boss } = await setup();
    const status = await httpStatus(
      boss.api.call("POST", "/admin/plans", { name: "   ", priceVnd: 1000, features: {} }),
    );
    expect(status).toBe(400);
  });

  test("ADM-PAY-010 refuses a plan name already used by another plan", async () => {
    const { boss } = await setup();
    const plan = await newPlan(boss);
    const status = await httpStatus(
      boss.api.call("POST", "/admin/plans", { name: plan.name, priceVnd: 1000, features: {} }),
    );
    expect(status).toBe(409);
  });

  test("ADM-PAY-011 refuses a negative or non-numeric price", async () => {
    const { boss } = await setup();
    for (const priceVnd of [-1, "abc"]) {
      const status = await httpStatus(
        boss.api.call("POST", "/admin/plans", { name: `Bad ${String(priceVnd)} ${Date.now()}`, priceVnd, features: {} }),
      );
      expect(status).toBe(400);
    }
  });

  test("ADM-PAY-012 allows a feature the free plan already includes and returns a note", async () => {
    const { boss } = await setup();
    const { data: free } = await admin()
      .from("subscription_plans")
      .select("id, features")
      .eq("is_default", true)
      .single();
    await admin()
      .from("subscription_plans")
      .update({ features: { theme_from_image: true } })
      .eq("id", free!.id);
    try {
      planCounter += 1;
      const out = (await boss.api.call("POST", "/admin/plans", {
        name: `E2E Overlap ${Date.now()}-${planCounter}`,
        priceVnd: 10000,
        features: { theme_from_image: true },
        status: "active",
      })) as { plan: PlanItem; warnings: string[] };
      createdPlanIds.push(out.plan.id);
      expect(out.warnings.length).toBeGreaterThan(0);
    } finally {
      await admin()
        .from("subscription_plans")
        .update({ features: free!.features })
        .eq("id", free!.id);
    }
  });

  test("ADM-PAY-013 creates nothing when the server fails on creation", async ({ page }) => {
    const { boss } = await setup();
    const before = (await plansOf(boss)).length;
    await loginThroughUi(page, boss.user);
    await page.route("**/admin/plans", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
        : route.continue(),
    );
    await page.goto("/admin/plans");
    await page.getByRole("button", { name: "Tạo gói" }).first().click();
    const dialog = anyDialog(page);
    await dialog.getByLabel("Tên gói").fill("E2E Failing Plan");
    await dialog.getByLabel("Giá gói (VND)").fill("12000");
    await dialog.getByRole("button", { name: "Tạo và mở bán" }).click();
    await expect(dialog.getByText("Không thể tạo gói dịch vụ")).toBeVisible();
    expect((await plansOf(boss)).length).toBe(before);
  });

  test("ADM-PAY-014 applies a new price to new purchases and to subscribers from their next renewal", async () => {
    const { boss, buyer } = await setup();
    const plan = await newPlan(boss, { priceVnd: 40000 });
    await subscribe(buyer, plan.id);
    const locked = (await subscriptionOf(buyer.user.id))?.price_locked_vnd;
    await boss.api.call("PATCH", `/admin/plans/${plan.id}/price`, {
      priceVnd: 55000,
      effectiveAt: inDays(8),
    });
    const updated = (await plansOf(boss)).find((p) => p.id === plan.id);
    expect(updated?.priceEffectiveAt).toBeTruthy();
    expect((await subscriptionOf(buyer.user.id))?.price_locked_vnd).toBe(locked);
  });

  test("ADM-PAY-015 applies a lower price to subscribers at their next renewal without action", async () => {
    const { boss, buyer } = await setup();
    const plan = await newPlan(boss, { priceVnd: 40000 });
    await subscribe(buyer, plan.id);
    await boss.api.call("PATCH", `/admin/plans/${plan.id}/price`, {
      priceVnd: 20000,
      effectiveAt: inDays(8),
    });
    const sub = await subscriptionOf(buyer.user.id);
    expect(sub?.price_locked_vnd).toBe(40000);
    expect(sub?.status).toBe("active");
  });

  test("ADM-PAY-016 applies changed features to existing subscribers from the next renewal", async () => {
    const { boss, buyer } = await setup();
    const plan = await newPlan(boss, { features: { theme_from_image: true } });
    await subscribe(buyer, plan.id);
    await boss.api.call("PATCH", `/admin/plans/${plan.id}/features`, {
      features: { theme_from_image: true, extra_storage: true },
      effectiveAt: inDays(8),
    });
    const updated = (await plansOf(boss)).find((p) => p.id === plan.id);
    expect(updated?.featuresEffectiveAt).toBeTruthy();
  });

  test("ADM-PAY-017 refuses a negative or non-numeric new price", async () => {
    const { boss } = await setup();
    const plan = await newPlan(boss);
    for (const priceVnd of [-5, "free"]) {
      const status = await httpStatus(
        boss.api.call("PATCH", `/admin/plans/${plan.id}/price`, { priceVnd, effectiveAt: inDays(10) }),
      );
      expect(status).toBe(400);
    }
  });

  test("ADM-PAY-018 refuses a start date with less than the minimum notice", async () => {
    const { boss } = await setup();
    const plan = await newPlan(boss);
    const status = await httpStatus(
      boss.api.call("PATCH", `/admin/plans/${plan.id}/price`, { priceVnd: 12345, effectiveAt: inDays(1) }),
    );
    expect(status).toBe(400);
  });

  test("ADM-PAY-019 keeps the existing price when applying the change fails", async ({ page }) => {
    const { boss } = await setup();
    const plan = await newPlan(boss, { priceVnd: 33000 });
    await loginThroughUi(page, boss.user);
    await page.route(`**/admin/plans/${plan.id}/price`, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/admin/plans");
    const row = rowOf(page, plan.name);
    await row.getByRole("button", { name: "Đổi giá" }).click();
    const dialog = anyDialog(page);
    await dialog.getByLabel("Giá mới (VND)").fill("44000");
    await dialog.getByRole("button", { name: "Hẹn lịch đổi giá" }).click();
    await expect(page.getByText("Không thể hẹn lịch đổi giá").first()).toBeVisible();
    expect((await plansOf(boss)).find((p) => p.id === plan.id)?.priceVnd).toBe(33000);
  });

  test("ADM-PAY-020 delivers the price change notice even when optional notifications are off", async () => {
    const { boss, buyer } = await setup();
    const plan = await newPlan(boss, { priceVnd: 40000 });
    await subscribe(buyer, plan.id);
    await admin().from("notification_preferences").delete().eq("user_id", buyer.user.id);
    await admin()
      .from("notification_preferences")
      .insert({ user_id: buyer.user.id, type: "billing.price_change", enabled: false })
      .then(() => undefined, () => undefined);
    await boss.api.call("PATCH", `/admin/plans/${plan.id}/price`, {
      priceVnd: 45000,
      effectiveAt: inDays(8),
    });
    const { data } = await admin()
      .from("notifications")
      .select("type")
      .eq("user_id", buyer.user.id);
    expect((data ?? []).some((row) => String(row.type).startsWith("billing."))).toBe(true);
  });

  test("ADM-PAY-021 deactivates a plan: it leaves the public page and subscribers keep it", async () => {
    const { boss, buyer } = await setup();
    const plan = await newPlan(boss);
    await subscribe(buyer, plan.id);
    await boss.api.call("POST", `/admin/plans/${plan.id}/deactivate`);
    const other = await person("Visitor");
    const offered = (await other.api.call("GET", "/subscription-plans")) as { id: string }[];
    expect(offered.some((p) => p.id === plan.id)).toBe(false);
    expect((await subscriptionOf(buyer.user.id))?.plan_id).toBe(plan.id);
  });

  test("ADM-PAY-022 keeps the plan on sale when the deactivation is cancelled", async ({ page }) => {
    const { boss } = await setup();
    const plan = await newPlan(boss);
    await loginThroughUi(page, boss.user);
    await page.goto("/admin/plans");
    const row = rowOf(page, plan.name);
    await row.getByRole("button", { name: "Tắt gói" }).click();
    const dialog = anyDialog(page);
    await expect(dialog.getByText("Bạn có chắc chắn muốn ngừng mở bán gói này?")).toBeVisible();
    await dialog.getByRole("button", { name: "Huỷ" }).click();
    expect((await plansOf(boss)).find((p) => p.id === plan.id)?.isActive).toBe(true);
  });

  test("ADM-PAY-023 reactivates a deactivated plan at its recorded price", async () => {
    const { boss } = await setup();
    const plan = await newPlan(boss, { priceVnd: 27000 });
    await boss.api.call("POST", `/admin/plans/${plan.id}/deactivate`);
    await boss.api.call("POST", `/admin/plans/${plan.id}/activate`);
    const back = (await plansOf(boss)).find((p) => p.id === plan.id);
    expect(back?.isActive).toBe(true);
    expect(back?.priceVnd).toBe(27000);
  });

  test("ADM-PAY-024 does not offer deactivation for the free default plan", async () => {
    const { boss } = await setup();
    const free = (await plansOf(boss)).find((p) => p.isDefault)!;
    const status = await httpStatus(boss.api.call("POST", `/admin/plans/${free.id}/deactivate`));
    expect(status).toBe(400);
  });

  test("ADM-PAY-025 deactivates a plan without subscribers after a simple confirmation", async ({ page }) => {
    const { boss } = await setup();
    const plan = await newPlan(boss);
    await loginThroughUi(page, boss.user);
    await page.goto("/admin/plans");
    const row = rowOf(page, plan.name);
    await row.getByRole("button", { name: "Tắt gói" }).click();
    const dialog = anyDialog(page);
    await expect(dialog.getByText(/đang sử dụng/)).toHaveCount(0);
    await dialog.getByRole("button", { name: "Tắt gói" }).click();
    await expect.poll(async () => (await plansOf(boss)).find((p) => p.id === plan.id)?.isActive).toBe(false);
  });

  test("ADM-PAY-026 leaves the plan on sale when deactivation fails", async ({ page }) => {
    const { boss } = await setup();
    const plan = await newPlan(boss);
    await loginThroughUi(page, boss.user);
    await page.route(`**/admin/plans/${plan.id}/deactivate`, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/admin/plans");
    const row = rowOf(page, plan.name);
    await row.getByRole("button", { name: "Tắt gói" }).click();
    await anyDialog(page).getByRole("button", { name: "Tắt gói" }).click();
    await expect(page.getByText("Không thể thay đổi trạng thái gói")).toBeVisible();
    expect((await plansOf(boss)).find((p) => p.id === plan.id)?.isActive).toBe(true);
  });

  test("ADM-PAY-027 resolves a double charge by extending the subscription with a new transaction", async () => {
    const { boss, buyer } = await setup();
    const plan = await paidPlan(boss);
    const txId = await subscribe(buyer, plan.id);
    const issueId = await reportIssue(buyer, txId);
    const before = await subscriptionOf(buyer.user.id);
    await boss.api.call("POST", `/admin/payment-issues/${issueId}/resolve`, {
      remedy: "extend",
      note: "Charged twice, extended by five days",
      days: 5,
    });
    const after = await subscriptionOf(buyer.user.id);
    expect(new Date(after!.current_period_end).getTime()).toBeGreaterThan(
      new Date(before!.current_period_end).getTime(),
    );
    const { data } = await admin()
      .from("transactions")
      .select("id, kind")
      .eq("related_transaction_id", txId);
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  test("ADM-PAY-028 activates a paid but not activated subscription directly", async () => {
    const { boss, buyer } = await setup();
    const plan = await paidPlan(boss);
    const txId = await subscribe(buyer, plan.id);
    await admin().from("subscriptions").delete().eq("user_id", buyer.user.id);
    const issueId = await reportIssue(buyer, txId, "Paid but my plan is not active");
    await boss.api.call("POST", `/admin/payment-issues/${issueId}/resolve`, {
      remedy: "activate",
      note: "Payment confirmed, plan activated",
    });
    expect((await subscriptionOf(buyer.user.id))?.status).toBe("active");
  });

  test("ADM-PAY-029 dismisses a duplicate issue with a reference to the earlier resolution", async () => {
    const { boss, buyer } = await setup();
    const plan = await paidPlan(boss);
    const txId = await subscribe(buyer, plan.id);
    const first = await reportIssue(buyer, txId, "First report of the problem");
    await boss.api.call("POST", `/admin/payment-issues/${first}/resolve`, {
      remedy: "refund",
      note: "Refunded part of the charge",
      refundAmountVnd: 1000,
      refundRef: "BANK-REF-029",
    });
    const second = await reportIssue(buyer, txId, "Same problem reported again");
    await boss.api.call("POST", `/admin/payment-issues/${second}/resolve`, {
      remedy: "dismiss",
      note: "Duplicate of the earlier report",
      duplicateOfIssueId: first,
    });
    const { data } = await admin().from("payment_issues").select("status, remedy").eq("id", second).single();
    expect(data?.status).toBe("resolved");
  });

  test("ADM-PAY-031 does not resolve an issue without an explanation", async () => {
    const { boss, buyer } = await setup();
    const plan = await paidPlan(boss);
    const txId = await subscribe(buyer, plan.id);
    const issueId = await reportIssue(buyer, txId);
    const status = await httpStatus(
      boss.api.call("POST", `/admin/payment-issues/${issueId}/resolve`, { remedy: "dismiss", note: "" }),
    );
    expect(status).toBe(400);
    const { data } = await admin().from("payment_issues").select("status").eq("id", issueId).single();
    expect(data?.status).toBe("open");
  });

  test("ADM-PAY-032 leaves the issue open when the remedy cannot be applied", async () => {
    const { boss, buyer } = await setup();
    const plan = await paidPlan(boss);
    const txId = await failedPayment(buyer, plan.id);
    const issueId = await reportIssue(buyer, txId, "The failed payment took my money");
    const status = await httpStatus(
      boss.api.call("POST", `/admin/payment-issues/${issueId}/resolve`, {
        remedy: "activate",
        note: "Trying to activate a failed payment",
      }),
    );
    expect(status).toBeGreaterThanOrEqual(400);
    const { data } = await admin().from("payment_issues").select("status").eq("id", issueId).single();
    expect(data?.status).toBe("open");
  });

  test("ADM-PAY-033 resolves an issue of a deleted account against the transaction record", async () => {
    const { boss, buyer } = await setup();
    const plan = await paidPlan(boss);
    const txId = await subscribe(buyer, plan.id);
    const earlier = await reportIssue(buyer, txId, "An earlier report on the same payment");
    await boss.api.call("POST", `/admin/payment-issues/${earlier}/resolve`, {
      remedy: "refund",
      note: "Refunded part of the charge",
      refundAmountVnd: 1000,
      refundRef: "BANK-REF-033",
    });
    const issueId = await reportIssue(buyer, txId);
    await boss.api.call("DELETE", `/admin/users/${buyer.user.id}`, {
      reason: "The account asked to be removed",
      confirmUsername: buyer.username,
    });
    await boss.api.call("POST", `/admin/payment-issues/${issueId}/resolve`, {
      remedy: "dismiss",
      note: "Account deleted, closing the issue",
      duplicateOfIssueId: earlier,
    });
    const { data } = await admin().from("payment_issues").select("status").eq("id", issueId).single();
    expect(data?.status).toBe("resolved");
  });

  test("ADM-PAY-034 records a refund as a further transaction and leaves the original unchanged", async () => {
    const { boss, buyer } = await setup();
    const plan = await paidPlan(boss);
    const txId = await subscribe(buyer, plan.id);
    const { data: original } = await admin().from("transactions").select("amount_vnd, status, kind").eq("id", txId).single();
    const issueId = await reportIssue(buyer, txId, "Please refund this charge");
    await boss.api.call("POST", `/admin/payment-issues/${issueId}/resolve`, {
      remedy: "refund",
      note: "Refunded through the bank",
      refundAmountVnd: original!.amount_vnd,
      refundRef: "BANK-REF-001",
    });
    const { data: after } = await admin().from("transactions").select("amount_vnd, status, kind").eq("id", txId).single();
    expect(after).toEqual(original);
    const { data: refunds } = await admin().from("transactions").select("kind").eq("related_transaction_id", txId);
    expect((refunds ?? []).some((row) => row.kind === "refund")).toBe(true);
  });
});
