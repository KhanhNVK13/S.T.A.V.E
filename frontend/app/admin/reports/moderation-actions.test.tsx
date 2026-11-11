import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReportDetail, ReportGroup } from "@stave/shared-types";
import AdminReportsPage from "./page";
import {
  dismissReports,
  getReportDetails,
  getRemovalContext,
  listReportGroups,
  removeReportedProject,
  restoreReportedProject,
} from "../../../lib/admin-reports-api";
import { ApiError } from "../../../lib/api-client";
import { setLang } from "../../../lib/i18n";

vi.mock("../../../lib/admin-reports-api", () => ({
  ADMIN_REPORTS_PAGE_SIZE: 20,
  listReportGroups: vi.fn(),
  getReportDetails: vi.fn(),
  getReportPreview: vi.fn(),
  getRemovalContext: vi.fn(),
  removeReportedProject: vi.fn(),
  dismissReports: vi.fn(),
  restoreReportedProject: vi.fn(),
}));

const P1 = "33333333-3333-4333-8333-333333333333";
const R1 = "44444444-4444-4444-8444-444444444444";
const SOUND = "55555555-5555-4555-8555-555555555555";
const LONG_REASON = "Copied a commercial track";

function group(over: Partial<ReportGroup> = {}): ReportGroup {
  return {
    projectId: P1,
    projectName: "Song A",
    projectExists: true,
    ownerDisplayName: "Alice",
    reportCount: 1,
    reasons: [{ reason: "copyright", count: 1 }],
    latestAt: "2026-11-03T10:00:00.000Z",
    ...over,
  };
}

function detail(): ReportDetail {
  return {
    id: R1,
    reason: "copyright",
    details: null,
    createdAt: "2026-11-02T10:00:00.000Z",
    reporter: { id: "u1", displayName: "Bob" },
    status: "pending",
    resolution: null,
  };
}

function reply(items: ReportGroup[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

beforeEach(() => {
  setLang("en");
  vi.mocked(listReportGroups).mockResolvedValue(reply([group()]));
  vi.mocked(getReportDetails).mockResolvedValue([detail()]);
  vi.mocked(getRemovalContext).mockResolvedValue({
    forkCount: 2,
    sounds: [{ id: SOUND, name: "Kick" }],
    truncated: false,
    retentionDays: 30,
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

async function openRemoveDialog() {
  render(<AdminReportsPage />);
  fireEvent.click(await screen.findByRole("button", { name: /Remove project: Song A/ }));
  await screen.findByRole("radio", { name: "Copyright infringement" });
}

describe("gỡ dự án (xác nhận phá huỷ)", () => {
  it("tab đang mở có cả nút Gỡ và Bỏ qua", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    expect(screen.getByRole("button", { name: /Remove project: Song A/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Dismiss: Song A/ })).toBeTruthy();
  });

  it("hộp hiện số fork, thời hạn lưu giữ và danh sách custom sound kèm cảnh báo", async () => {
    await openRemoveDialog();
    expect(screen.getByText(/2 forks made by other people/)).toBeTruthy();
    expect(screen.getByText(/Kept for 30 days/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Kick" })).toBeTruthy();
  });

  it("thiếu điều khoản hoặc lý do ngắn thì không gọi API", async () => {
    await openRemoveDialog();
    fireEvent.click(screen.getByRole("button", { name: "Remove project" }));
    expect(removeReportedProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "Copyright infringement" }));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove project" }));
    expect(removeReportedProject).not.toHaveBeenCalled();
    expect(screen.getByText("Write at least 10 characters.")).toBeTruthy();
  });

  it("gửi đúng điều khoản, lý do và sound đã chọn rồi tải lại danh sách", async () => {
    vi.mocked(removeReportedProject).mockResolvedValue({
      closedReports: 1,
      removedSounds: 1,
      retainUntil: "2026-12-11T00:00:00.000Z",
    });
    await openRemoveDialog();
    fireEvent.click(screen.getByRole("radio", { name: "Copyright infringement" }));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: LONG_REASON } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Kick" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove project" }));
    await waitFor(() =>
      expect(removeReportedProject).toHaveBeenCalledWith(P1, {
        reason: LONG_REASON,
        policy: "copyright",
        removeSoundIds: [SOUND],
      }),
    );
    expect(await screen.findByText("Project removed.")).toBeTruthy();
    expect(listReportGroups).toHaveBeenCalledTimes(2);
  });

  it("lỗi từ máy chủ hiện trong hộp và hộp vẫn mở", async () => {
    vi.mocked(removeReportedProject).mockRejectedValue(new ApiError(500, "boom"));
    await openRemoveDialog();
    fireEvent.click(screen.getByRole("radio", { name: "Copyright infringement" }));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: LONG_REASON } });
    fireEvent.click(screen.getByRole("button", { name: "Remove project" }));
    expect(await screen.findByText("Could not remove the project. Nothing was changed.")).toBeTruthy();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("403 khi tải ngữ cảnh: báo báo cáo đã đóng, không mời Thử lại", async () => {
    vi.mocked(getRemovalContext).mockRejectedValueOnce(new ApiError(403, "closed"));
    render(<AdminReportsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Remove project: Song A/ }));
    expect(await screen.findByText(/no open reports/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("không tải được ngữ cảnh thì báo lỗi và không cho chọn gỡ", async () => {
    vi.mocked(getRemovalContext).mockRejectedValueOnce(new ApiError(500, "x"));
    render(<AdminReportsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Remove project: Song A/ }));
    expect(await screen.findByText("Could not load the project details.")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
  });
});

describe("bỏ qua báo cáo", () => {
  async function openDismiss() {
    render(<AdminReportsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Dismiss: Song A/ }));
    await screen.findByLabelText(/Why are these reports/);
  }

  it("gửi đúng danh sách id báo cáo đang mở cùng ghi chú", async () => {
    vi.mocked(dismissReports).mockResolvedValue({ dismissed: 1 });
    await openDismiss();
    fireEvent.change(screen.getByLabelText(/Why are these reports/), { target: { value: "Not a violation" } });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss reports" }));
    await waitFor(() =>
      expect(dismissReports).toHaveBeenCalledWith(P1, { reportIds: [R1], reason: "Not a violation" }),
    );
    expect(await screen.findByText("Reports dismissed.")).toBeTruthy();
  });

  it("thiếu ghi chú thì không đóng", async () => {
    await openDismiss();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss reports" }));
    expect(dismissReports).not.toHaveBeenCalled();
  });

  it("409 vì có báo cáo mới: báo xem lại và tải lại danh sách báo cáo", async () => {
    vi.mocked(dismissReports).mockRejectedValue(new ApiError(409, "changed"));
    await openDismiss();
    fireEvent.change(screen.getByLabelText(/Why are these reports/), { target: { value: "Not a violation" } });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss reports" }));
    expect(await screen.findByText(/New reports arrived/)).toBeTruthy();
    await waitFor(() => expect(getReportDetails).toHaveBeenCalledTimes(2));
  });
});

describe("khôi phục", () => {
  const removed = group({
    resolution: "upheld",
    resolutionNote: "x",
    projectHidden: true,
    retainUntil: "2999-01-01T00:00:00.000Z",
    retentionEnded: false,
  });

  async function openUpheld(g: ReportGroup) {
    vi.mocked(listReportGroups).mockResolvedValue(reply([g]));
    render(<AdminReportsPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "Removed" }));
    await screen.findByText("Song A");
  }

  it("dự án đang bị gỡ trong hạn: hiện hạn lưu giữ và nút Khôi phục dùng được", async () => {
    await openUpheld(removed);
    expect(screen.getByText(/Kept until/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Restore: Song A/ })).toHaveProperty("disabled", false);
  });

  it("hết hạn lưu giữ: nút Khôi phục bị khoá", async () => {
    await openUpheld({ ...removed, retentionEnded: true });
    expect(screen.getByText("Retention period ended")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Restore: Song A/ })).toHaveProperty("disabled", true);
  });

  it("đã khôi phục rồi thì không còn nút", async () => {
    await openUpheld(group({ resolution: "upheld", resolutionNote: "x" }));
    expect(screen.getByText("Restored")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Restore: Song A/ })).toBeNull();
  });

  it("xác nhận rồi gọi API khôi phục", async () => {
    vi.mocked(restoreReportedProject).mockResolvedValue({ restored: true });
    await openUpheld(removed);
    fireEvent.click(screen.getByRole("button", { name: /Restore: Song A/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore project" }));
    await waitFor(() => expect(restoreReportedProject).toHaveBeenCalledWith(P1));
    expect(await screen.findByText("Project restored.")).toBeTruthy();
  });

  it("410 hiện câu hết hạn trong hộp xác nhận", async () => {
    vi.mocked(restoreReportedProject).mockRejectedValue(new ApiError(410, "gone"));
    await openUpheld(removed);
    fireEvent.click(screen.getByRole("button", { name: /Restore: Song A/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore project" }));
    expect(await screen.findByText(/retention period has ended/)).toBeTruthy();
  });
});
