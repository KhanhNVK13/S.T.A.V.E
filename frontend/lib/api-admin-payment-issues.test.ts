import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAdminPaymentIssue,
  listAdminPaymentIssues,
  resolveAdminPaymentIssue,
} from "./api-admin-payment-issues";
import { apiFetch } from "./api-client";

vi.mock("./api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("api-admin-payment-issues", () => {
  it("list gửi GET với status và cursor", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], nextCursor: null });

    await listAdminPaymentIssues("open", "c1");
    expect(apiFetch).toHaveBeenCalledWith(
      "/admin/payment-issues?status=open&cursor=c1",
    );

    await listAdminPaymentIssues("resolved");
    expect(apiFetch).toHaveBeenCalledWith("/admin/payment-issues?status=resolved");
  });

  it("get đọc chi tiết sự cố theo id", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ issue: {} } as never);

    await getAdminPaymentIssue("abc");
    expect(apiFetch).toHaveBeenCalledWith("/admin/payment-issues/abc");
  });

  it("resolve gửi POST với payload đầy đủ", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ issueId: "x" });

    await resolveAdminPaymentIssue("x", {
      remedy: "refund",
      note: "ghi chú",
      refundAmountVnd: 1000,
      refundRef: "REF-1",
    });

    const [path, init] = vi.mocked(apiFetch).mock.calls[0];
    expect(path).toBe("/admin/payment-issues/x/resolve");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      remedy: "refund",
      note: "ghi chú",
      refundAmountVnd: 1000,
      refundRef: "REF-1",
    });
  });

  it("resolve gửi nguyên payload trang chi tiết đã lọc theo remedy", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ issueId: "x" });

    await resolveAdminPaymentIssue("x", {
      remedy: "dismiss",
      note: "trùng",
      duplicateOfIssueId: "y",
      days: 7,
    });

    const [path, init] = vi.mocked(apiFetch).mock.calls[0];
    expect(path).toBe("/admin/payment-issues/x/resolve");
    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({
      remedy: "dismiss",
      note: "trùng",
      duplicateOfIssueId: "y",
      days: 7,
    });
  });
});
