import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getReportDetails,
  getRemovalImpact,
  getReportPreview,
  listReportGroups,
  removeProject,
  restoreProject,
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

  it("getRemovalImpact gọi /removal-impact và mã hoá id", async () => {
    const impact = { forkCount: 3, retentionDays: 30, ownerSounds: [] };
    vi.mocked(apiFetch).mockResolvedValue(impact);
    await expect(getRemovalImpact("p 1")).resolves.toEqual(impact);
    expect(apiFetch).toHaveBeenCalledWith("/admin/reports/p%201/removal-impact");
  });

  it("removeProject POST tới /remove với đúng body và mã hoá id", async () => {
    const result = {
      hiddenAt: "2026-11-09T00:00:00.000Z",
      retainedUntil: "2026-12-09T00:00:00.000Z",
      closedReports: 4,
      soundResults: [],
    };
    vi.mocked(apiFetch).mockResolvedValue(result);
    await expect(
      removeProject("a/b", { reason: "copied", policy: "copyright", removeSoundIds: ["s1"] }),
    ).resolves.toEqual(result);
    expect(apiFetch).toHaveBeenCalledWith("/admin/reports/a%2Fb/remove", {
      method: "POST",
      body: JSON.stringify({ reason: "copied", policy: "copyright", removeSoundIds: ["s1"] }),
    });
  });

  it("restoreProject POST tới /admin/projects/:id/restore với đúng body", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ restored: true });
    await expect(restoreProject("a/b", "restored")).resolves.toEqual({ restored: true });
    expect(apiFetch).toHaveBeenCalledWith("/admin/projects/a%2Fb/restore", {
      method: "POST",
      body: JSON.stringify({ reason: "restored" }),
    });
  });

  it("để lỗi của apiFetch đi tiếp", async () => {
    const failure = new Error("boom");
    vi.mocked(apiFetch).mockRejectedValue(failure);
    await expect(listReportGroups("open", 1)).rejects.toBe(failure);
  });
});
