import { afterEach, describe, expect, it } from "vitest";
import { setLang, tFor } from "./i18n";
import { notificationText } from "./notification-text";

const tEn = (key: Parameters<typeof tFor>[1], vars?: Parameters<typeof tFor>[2]) => tFor("en", key, vars);
const tVi = (key: Parameters<typeof tFor>[1], vars?: Parameters<typeof tFor>[2]) => tFor("vi", key, vars);

describe("notificationText", () => {
  afterEach(() => setLang("en"));

  it("builds the text from type and params in the active language", () => {
    const item = {
      type: "fork.created",
      payload: { params: { forkerName: "An", projectName: "Song" }, title: "Dự án của bạn được fork", body: "x" },
    };
    expect(notificationText(item, tEn)).toEqual({
      title: "Your project was forked",
      body: 'An forked your project "Song".',
    });
    expect(notificationText(item, tVi).title).toBe("Dự án của bạn được fork");
  });

  it("formats money and dates for the active locale", () => {
    setLang("en");
    const item = {
      type: "billing.price_change",
      payload: { params: { planName: "PLUS", newPrice: 59000, effectiveDate: "2026-12-06T10:00:00.000Z" } },
    };
    const body = notificationText(item, tEn).body ?? "";
    expect(body).toContain("Dec 6, 2026");
    expect(body).toMatch(/59,000/);
    setLang("vi");
    const vi = notificationText(item, tVi).body ?? "";
    expect(vi).toContain("06/12/2026");
    expect(vi).toMatch(/59\.000/);
  });

  it("translates the collaboration permission level", () => {
    const item = {
      type: "collab.permission_changed",
      payload: { params: { projectName: "Song", permissionLabel: "edit" } },
    };
    expect(notificationText(item, tEn).body).toContain("changed to edit");
    expect(notificationText(item, tVi).body).toContain("chỉnh sửa");
    const view = { ...item, payload: { params: { projectName: "Song", permissionLabel: "view" } } };
    expect(notificationText(view, tVi).body).toContain("xem");
  });

  it("keeps the stored text for old notifications without params", () => {
    const item = { type: "fork.created", payload: { title: "Cũ", body: "Nội dung cũ", projectName: "P" } };
    expect(notificationText(item, tEn)).toEqual({ title: "Cũ", body: "Nội dung cũ" });
  });

  it("keeps the stored text when an admin template was used", () => {
    const item = {
      type: "fork.created",
      payload: { customText: true, params: { forkerName: "An", projectName: "P" }, title: "Riêng", body: "Mẫu riêng" },
    };
    expect(notificationText(item, tEn)).toEqual({ title: "Riêng", body: "Mẫu riêng" });
  });

  it("builds account notifications that were stored without text", () => {
    const item = { type: "account_suspended", payload: { reason: "Spam" } };
    expect(notificationText(item, tEn)).toEqual({
      title: "Account suspended",
      body: "Your account was suspended. Reason: Spam",
    });
  });

  it("picks the body by remedy for resolved payment issues", () => {
    const item = {
      type: "billing.issue_resolved",
      payload: { params: { remedy: "extend", days: 7, summary: "đã đền bù thêm 7 ngày" } },
    };
    expect(notificationText(item, tEn).body).toBe("Your payment issue was resolved: we added 7 extra days to your plan.");
  });

  it("returns stored or null text for unknown types", () => {
    expect(notificationText({ type: "mystery", payload: {} }, tEn)).toEqual({ title: null, body: null });
  });
});
