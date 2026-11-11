import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dismissReports,
  getReportDetails,
  getReportPreview,
  listReportGroups,
} from "./admin-reports-api";
import { apiFetch } from "./api-client";

vi.mock("./api-client", () => ({ apiFetch: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe("admin-reports-api", () => {
  it("listReportGroups gọi GET với status, page, limit", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 2, limit: 20 });
    await listReportGroups("upheld", 2);
    expect(apiFetch).toHaveBeenCalledWith("/admin/reports?status=upheld&page=2&limit=20");
  });

  it("listReportGroups cho phép đổi limit", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [], total: 0, page: 1, limit: 5 });
    await listReportGroups("open", 1, 5);
    expect(apiFetch).toHaveBeenCalledWith("/admin/reports?status=open&page=1&limit=5");
  });

  it("getReportDetails gọi đúng đường dẫn và mã hoá id", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    await getReportDetails("a/b", "dismissed");
    expect(apiFetch).toHaveBeenCalledWith("/admin/reports/a%2Fb?status=dismissed");
  });

  it("getReportPreview gọi /preview và mã hoá id", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    await getReportPreview("p 1");
    expect(apiFetch).toHaveBeenCalledWith("/admin/reports/p%201/preview");
  });

  it("dismissReports POST tới /dismiss với đúng body và mã hoá id", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ dismissedCount: 2 });
    await expect(dismissReports("a/b", { reportIds: ["r1", "r2"], reason: "ok" })).resolves.toEqual({
      dismissedCount: 2,
    });
    expect(apiFetch).toHaveBeenCalledWith("/admin/reports/a%2Fb/dismiss", {
      method: "POST",
      body: JSON.stringify({ reportIds: ["r1", "r2"], reason: "ok" }),
    });
  });

  it("để lỗi của apiFetch đi tiếp", async () => {
    const failure = new Error("boom");
    vi.mocked(apiFetch).mockRejectedValue(failure);
    await expect(listReportGroups("open", 1)).rejects.toBe(failure);
  });
});
