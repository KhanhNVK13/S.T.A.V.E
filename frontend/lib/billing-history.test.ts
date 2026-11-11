import { beforeEach, describe, expect, it } from "vitest";
import type { EffectiveSubscription, SubscriptionPlan } from "@stave/shared-types";
import { formatDate } from "./format-date";
import { setLang } from "./i18n";
import { subscriptionSummary, validateIssueDescription } from "./billing-history";

const plan = (name: string, isDefault = false): SubscriptionPlan => ({
  id: name,
  name,
  description: "",
  priceVnd: isDefault ? 0 : 49000,
  features: {},
  isActive: true,
  isDefault,
  sortOrder: 0,
  priceEffectiveAt: null,
});

beforeEach(() => setLang("vi"));

const END = "2026-12-06T10:00:00.000Z";
const sub = (overrides: Partial<EffectiveSubscription> = {}): EffectiveSubscription => ({
  plan: plan("STAVE+"),
  status: "active",
  currentPeriodEnd: END,
  graceUntil: null,
  cancelAtPeriodEnd: false,
  pendingPlan: null,
  hasPaidAccess: true,
  inGrace: false,
  ...overrides,
});

describe("FE-BIL-08 validateIssueDescription", () => {
  it("UTCID01 accepts 1 to 500 characters after trimming", () => {
    expect(validateIssueDescription("  Đã trừ tiền  ")).toBeNull();
    expect(validateIssueDescription("a".repeat(500))).toBeNull();
  });

  it("UTCID02 explains what is wrong in Vietnamese", () => {
    expect(validateIssueDescription("   ")).toBe("Hãy mô tả sự cố bạn gặp.");
    expect(validateIssueDescription("a".repeat(501))).toBe("Mô tả tối đa 500 ký tự.");
  });

  it("UTCID03 explains what is wrong in English", () => {
    setLang("en");
    expect(validateIssueDescription("   ")).toBe("Describe the problem you ran into.");
    expect(validateIssueDescription("a".repeat(501))).toBe("The description can be at most 500 characters.");
  });
});

describe("FE-BIL-09 subscriptionSummary", () => {
  let end = "";

  beforeEach(() => {
    end = formatDate(END);
  });

  it("UTCID01 shows the next payment date of a running subscription", () => {
    expect(subscriptionSummary(sub())).toEqual([`Thanh toán kế tiếp: ${end}.`]);
  });

  it("UTCID02 shows until when a canceled subscription stays active", () => {
    expect(subscriptionSummary(sub({ status: "canceled", cancelAtPeriodEnd: true }))).toEqual([
      `Đã huỷ gia hạn. Hiệu lực đến ${end}.`,
    ]);
  });

  it("UTCID03 mentions a scheduled downgrade", () => {
    expect(subscriptionSummary(sub({ pendingPlan: plan("Free", true) }))).toEqual([
      `Thanh toán kế tiếp: ${end}.`,
      `Sẽ chuyển sang Free vào ${end}.`,
    ]);
  });

  it("UTCID04 says the user is on the free plan", () => {
    expect(subscriptionSummary(sub({ plan: plan("Free", true), hasPaidAccess: false, status: "none" }))).toEqual([
      "Bạn đang dùng gói miễn phí.",
    ]);
  });
});
