import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AdminOverviewStats } from "@stave/shared-types";
import AdminDashboardPage from "./page";
import { getAdminOverview } from "../../../lib/admin-stats-api";
import { ApiError } from "../../../lib/api-client";
import { setLang } from "../../../lib/i18n";

vi.mock("../../../lib/admin-stats-api", () => ({ getAdminOverview: vi.fn() }));

const point = {
  date: "2026-11-02T00:00:00Z",
  newUsers: 3,
  activeUsers: 5,
  newProjects: 1,
  commits: 9,
  newBranches: 0,
  merges: 0,
  forks: 0,
  pullRequests: 0,
};

function overview(over: Partial<AdminOverviewStats> = {}): AdminOverviewStats {
  return {
    period: { from: "2026-10-14", to: "2026-11-12", granularity: "day" },
    growth: {
      available: true,
      noData: false,
      totalUsers: 23,
      totals: { newUsers: 13, activeUsers: 9 },
      previous: { newUsers: 10, activeUsers: 9 },
      series: [point],
    },
    usage: {
      available: true,
      noData: false,
      totals: { newProjects: 4, commits: 30, newBranches: 5, merges: 3, forks: 1, pullRequests: 0 },
      previous: null,
      series: [point],
    },
    plans: { available: true, plans: [{ name: "Free", count: 20 }] },
    finance: { available: true, revenueVnd: 98000, failedTransactions: 2 },
    moderation: { available: true, openReports: 1, openPaymentIssues: 0 },
    ...over,
  };
}

beforeEach(() => {
  setLang("en");
  vi.mocked(getAdminOverview).mockResolvedValue(overview());
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("trang tổng quan admin", () => {
  it("mặc định 30 ngày, có so sánh kỳ trước, hiện số liệu và độ chênh", async () => {
    render(<AdminDashboardPage />);
    await screen.findByText("Total accounts");
    expect(getAdminOverview).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), true);
    expect(screen.getByText("+3 vs previous period")).toBeTruthy();
    expect(screen.getByText("23")).toBeTruthy();
  });

  it("đổi kỳ tính lại toàn bộ với khoảng ngày mới", async () => {
    render(<AdminDashboardPage />);
    await screen.findByText("Total accounts");
    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    expect(screen.getByRole("button", { name: "Last 7 days" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(getAdminOverview).toHaveBeenCalledTimes(2));
    const [from, to] = vi.mocked(getAdminOverview).mock.calls[1];
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBe(6);
  });

  it("tắt so sánh gọi lại với compare=false", async () => {
    render(<AdminDashboardPage />);
    await screen.findByText("Total accounts");
    fireEvent.click(screen.getByRole("checkbox", { name: "Compare with the previous period" }));
    await waitFor(() => expect(vi.mocked(getAdminOverview).mock.calls[1][2]).toBe(false));
  });

  it("mỗi phần độc lập: phần lỗi báo không có sẵn, phần khác vẫn hiện", async () => {
    vi.mocked(getAdminOverview).mockResolvedValue(overview({ growth: { available: false } }));
    render(<AdminDashboardPage />);
    await screen.findByText("Not available right now.");
    expect(screen.getByText("Commits", { selector: "dt" })).toBeTruthy();
    expect(screen.queryByText("Total accounts")).toBeNull();
  });

  it("kỳ trước tài khoản đầu tiên: nói không có dữ liệu, không hiện số 0", async () => {
    vi.mocked(getAdminOverview).mockResolvedValue(
      overview({
        growth: { available: true, noData: true, totalUsers: 0, totals: { newUsers: 0, activeUsers: 0 }, previous: null, series: [] },
      }),
    );
    render(<AdminDashboardPage />);
    await screen.findByText("No data for this period.");
    expect(screen.queryByText("New accounts")).toBeNull();
  });

  it("số liệu có liên kết tới màn hình giải thích", async () => {
    render(<AdminDashboardPage />);
    const reports = await screen.findByRole("link", { name: /Open reports/ });
    expect(reports.getAttribute("href")).toBe("/admin/reports");
    expect(screen.getByRole("link", { name: /Revenue/ }).getAttribute("href")).toBe("/admin/transactions");
    expect(screen.getByRole("link", { name: /Open payment issues/ }).getAttribute("href")).toBe("/admin/payment-issues");
  });

  it("biểu đồ có bảng số liệu thay thế", async () => {
    render(<AdminDashboardPage />);
    await screen.findByText("Total accounts");
    expect(screen.getAllByText("Show as table").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
  });

  it("lỗi tải toàn trang có Thử lại và không hiện số", async () => {
    vi.mocked(getAdminOverview).mockRejectedValueOnce(new ApiError(500, "x"));
    render(<AdminDashboardPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Total accounts");
  });
});
