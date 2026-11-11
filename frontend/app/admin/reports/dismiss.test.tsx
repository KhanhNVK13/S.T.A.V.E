import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AdminReportListResponse, ReportDetail, ReportGroup } from "@stave/shared-types";
import AdminReportsPage from "./page";
import { dismissReports, getReportDetails, listReportGroups } from "../../../lib/admin-reports-api";
import { ApiError } from "../../../lib/api-client";
import { setLang } from "../../../lib/i18n";

vi.mock("../../../lib/admin-reports-api", () => ({
  ADMIN_REPORTS_PAGE_SIZE: 20,
  listReportGroups: vi.fn(),
  getReportDetails: vi.fn(),
  getReportPreview: vi.fn(),
  dismissReports: vi.fn(),
}));

const P1 = "33333333-3333-4333-8333-333333333333";

function group(over: Partial<ReportGroup> = {}): ReportGroup {
  return {
    projectId: P1,
    projectName: "Song A",
    projectExists: true,
    ownerDisplayName: "Alice",
    reportCount: 2,
    reasons: [{ reason: "spam", count: 2 }],
    latestAt: "2026-11-03T10:00:00.000Z",
    ...over,
  };
}

function listOf(items: ReportGroup[]): AdminReportListResponse {
  return { items, total: items.length, page: 1, limit: 20 };
}

function detail(id: string, over: Partial<ReportDetail> = {}): ReportDetail {
  return {
    id,
    reason: "spam",
    details: `details of ${id}`,
    createdAt: "2026-11-02T10:00:00.000Z",
    reporter: { id: `u-${id}`, displayName: `Reporter ${id}` },
    status: "pending",
    resolution: null,
    ...over,
  };
}

const R1 = "r1";
const R2 = "r2";
const R3 = "r3";

beforeEach(() => {
  setLang("en");
  vi.mocked(listReportGroups).mockResolvedValue(listOf([group()]));
  vi.mocked(getReportDetails).mockResolvedValue([detail(R1), detail(R2)]);
  vi.mocked(dismissReports).mockResolvedValue({ dismissedCount: 2 });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

async function openGroup() {
  const view = render(<AdminReportsPage />);
  await screen.findByText("Song A");
  fireEvent.click(screen.getByRole("button", { name: /2 reports/ }));
  await screen.findAllByRole("checkbox");
  return view;
}

const reasonBox = () => screen.getByRole("textbox", { name: "Reason for dismissing" }) as HTMLTextAreaElement;
const dismissButton = () => screen.getByRole("button", { name: /^(Dismiss reports|Dismissing…)$/ }) as HTMLButtonElement;
const checkboxes = () => screen.getAllByRole("checkbox") as HTMLInputElement[];
const typeReason = (value: string) => fireEvent.change(reasonBox(), { target: { value } });

describe("Bỏ qua báo cáo: chọn và lý do", () => {
  it("mặc định chọn hết các báo cáo đang mở", async () => {
    await openGroup();
    expect(checkboxes()).toHaveLength(2);
    expect(checkboxes().every((box) => box.checked)).toBe(true);
  });

  it("mỗi ô chọn có nhãn riêng để đọc màn hình", async () => {
    await openGroup();
    expect(screen.getByRole("checkbox", { name: "Select report 1" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Select report 2" })).toBeTruthy();
  });

  it("chưa có lý do thì nút vô hiệu và có gợi ý", async () => {
    await openGroup();
    expect(dismissButton().disabled).toBe(true);
    expect(screen.getByText("Select at least one report and enter a reason to dismiss.")).toBeTruthy();
  });

  it("lý do chỉ có khoảng trắng vẫn vô hiệu và không gọi API", async () => {
    await openGroup();
    typeReason("   \n ");
    expect(dismissButton().disabled).toBe(true);
    fireEvent.click(dismissButton());
    expect(dismissReports).not.toHaveBeenCalled();
  });

  it("bỏ chọn hết thì nút vô hiệu dù có lý do", async () => {
    await openGroup();
    typeReason("not a violation");
    expect(dismissButton().disabled).toBe(false);
    for (const box of checkboxes()) fireEvent.click(box);
    expect(checkboxes().every((box) => !box.checked)).toBe(true);
    expect(dismissButton().disabled).toBe(true);
    fireEvent.click(dismissButton());
    expect(dismissReports).not.toHaveBeenCalled();
  });

  it("bộ đếm tính theo lý do đã trim", async () => {
    await openGroup();
    expect(screen.getByText("0/1000")).toBeTruthy();
    typeReason("  hello  ");
    expect(screen.getByText("5/1000")).toBeTruthy();
  });

  it("lý do vượt 1000 ký tự hiện lỗi bằng code và vô hiệu nút", async () => {
    await openGroup();
    typeReason("x".repeat(1001));
    expect(screen.getByText("The reason can be at most 1000 characters.")).toBeTruthy();
    expect(dismissButton().disabled).toBe(true);
    expect(reasonBox().hasAttribute("maxlength")).toBe(false);
    expect(reasonBox().hasAttribute("minlength")).toBe(false);
  });

  it("ô lý do có name và autoComplete", async () => {
    await openGroup();
    expect(reasonBox().getAttribute("name")).toBe("dismiss-reason");
    expect(reasonBox().getAttribute("autocomplete")).toBe("off");
  });
});

describe("Bỏ qua báo cáo: gửi", () => {
  it("gửi đúng payload: tất cả id đã chọn và lý do đã trim", async () => {
    await openGroup();
    typeReason("  Not a violation  ");
    fireEvent.click(dismissButton());
    await waitFor(() => expect(dismissReports).toHaveBeenCalledTimes(1));
    expect(dismissReports).toHaveBeenCalledWith(P1, { reportIds: [R1, R2], reason: "Not a violation" });
  });

  it("bỏ chọn một báo cáo thì payload không có id đó", async () => {
    await openGroup();
    fireEvent.click(checkboxes()[1]);
    typeReason("ok");
    fireEvent.click(dismissButton());
    await waitFor(() => expect(dismissReports).toHaveBeenCalled());
    expect(dismissReports).toHaveBeenCalledWith(P1, { reportIds: [R1], reason: "ok" });
  });

  it("đang gửi thì nút vô hiệu và không gửi lần hai", async () => {
    let resolve: (value: { dismissedCount: number }) => void = () => {};
    vi.mocked(dismissReports).mockReturnValue(new Promise((r) => (resolve = r)));
    await openGroup();
    typeReason("ok");
    fireEvent.click(dismissButton());
    const sending = await screen.findByRole("button", { name: "Dismissing…" });
    expect((sending as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sending);
    fireEvent.click(sending);
    expect(dismissReports).toHaveBeenCalledTimes(1);
    expect(reasonBox().disabled).toBe(true);
    await act(async () => resolve({ dismissedCount: 2 }));
  });

  it("thành công: làm mới danh sách và hiện thông báo; nhóm không còn ở tab Đang mở", async () => {
    await openGroup();
    vi.mocked(listReportGroups).mockResolvedValue(listOf([]));
    typeReason("ok");
    fireEvent.click(dismissButton());
    expect(await screen.findByText("2 reports dismissed.")).toBeTruthy();
    await waitFor(() => expect(listReportGroups).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No open reports")).toBeTruthy();
    expect(screen.queryByText("Song A")).toBeNull();
  });

  it("thành công với một báo cáo hiện câu số ít", async () => {
    vi.mocked(getReportDetails).mockResolvedValue([detail(R1)]);
    vi.mocked(listReportGroups).mockResolvedValue(listOf([group({ reportCount: 1 })]));
    vi.mocked(dismissReports).mockResolvedValue({ dismissedCount: 1 });
    const view = render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(screen.getByRole("button", { name: /1 report/ }));
    await screen.findAllByRole("checkbox");
    typeReason("ok");
    vi.mocked(listReportGroups).mockResolvedValue(listOf([]));
    fireEvent.click(dismissButton());
    expect(await screen.findByText("1 report dismissed.")).toBeTruthy();
    view.unmount();
  });
});

describe("Bỏ qua báo cáo: 409 và lỗi", () => {
  it("409 có báo cáo mới: tải lại chi tiết, cảnh báo, chọn sẵn báo cáo mới và KHÔNG đóng", async () => {
    vi.mocked(dismissReports).mockRejectedValue(
      new ApiError(409, "New reports were filed", { message: "New reports were filed", newReportIds: [R3] }),
    );
    await openGroup();
    vi.mocked(getReportDetails).mockResolvedValue([detail(R1), detail(R2), detail(R3)]);
    typeReason("ok");
    fireEvent.click(dismissButton());

    const alert = await screen.findByText(/New reports were filed for this project/);
    expect(alert.closest('[role="alert"]')).toBeTruthy();
    await waitFor(() => expect(checkboxes()).toHaveLength(3));
    expect(checkboxes().every((box) => box.checked)).toBe(true);
    expect(getReportDetails).toHaveBeenCalledTimes(2);
    expect(listReportGroups).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/reports? dismissed\./)).toBeNull();
    expect(reasonBox().value).toBe("ok");
    expect(dismissButton().disabled).toBe(false);
  });

  it("409 không có newReportIds: câu 'đã thay đổi' và vẫn tải lại chi tiết", async () => {
    vi.mocked(dismissReports).mockRejectedValue(
      new ApiError(409, "Reports changed", { message: "Reports changed", newReportIds: [] }),
    );
    await openGroup();
    typeReason("ok");
    fireEvent.click(dismissButton());
    expect(await screen.findByText(/These reports changed while you were reviewing/)).toBeTruthy();
    await waitFor(() => expect(getReportDetails).toHaveBeenCalledTimes(2));
    expect(listReportGroups).toHaveBeenCalledTimes(1);
  });

  it("409 không có body vẫn xử lý như báo cáo đã thay đổi, không sập", async () => {
    vi.mocked(dismissReports).mockRejectedValue(new ApiError(409, "Conflict"));
    await openGroup();
    typeReason("ok");
    fireEvent.click(dismissButton());
    expect(await screen.findByText(/These reports changed while you were reviewing/)).toBeTruthy();
  });

  it("sau 409 gửi lại được", async () => {
    vi.mocked(dismissReports)
      .mockRejectedValueOnce(new ApiError(409, "x", { newReportIds: [R3] }))
      .mockResolvedValueOnce({ dismissedCount: 3 });
    await openGroup();
    vi.mocked(getReportDetails).mockResolvedValue([detail(R1), detail(R2), detail(R3)]);
    typeReason("ok");
    fireEvent.click(dismissButton());
    await waitFor(() => expect(checkboxes()).toHaveLength(3));
    fireEvent.click(dismissButton());
    await waitFor(() => expect(dismissReports).toHaveBeenCalledTimes(2));
    expect(dismissReports).toHaveBeenLastCalledWith(P1, { reportIds: [R1, R2, R3], reason: "ok" });
  });

  it("lỗi khác (500): hiện trong vùng lỗi, báo cáo vẫn mở, không làm mới danh sách", async () => {
    vi.mocked(dismissReports).mockRejectedValue(new ApiError(500, "Could not dismiss reports"));
    await openGroup();
    typeReason("ok");
    fireEvent.click(dismissButton());
    const alert = await screen.findByText("Could not dismiss the reports. They are still open.");
    expect(alert.closest('[role="alert"]')).toBeTruthy();
    expect(checkboxes()).toHaveLength(2);
    expect(listReportGroups).toHaveBeenCalledTimes(1);
    expect(getReportDetails).toHaveBeenCalledTimes(1);
    expect(dismissButton().disabled).toBe(false);
    expect(screen.queryByText(/reports? dismissed\./)).toBeNull();
  });

  it("lỗi mạng cũng hiện trong vùng lỗi", async () => {
    vi.mocked(dismissReports).mockRejectedValue(new TypeError("Failed to fetch"));
    await openGroup();
    typeReason("ok");
    fireEvent.click(dismissButton());
    expect(await screen.findByText("Could not dismiss the reports. They are still open.")).toBeTruthy();
  });

  it("lỗi cũ biến mất khi gửi lại", async () => {
    vi.mocked(dismissReports)
      .mockRejectedValueOnce(new ApiError(500, "x"))
      .mockResolvedValueOnce({ dismissedCount: 2 });
    await openGroup();
    typeReason("ok");
    fireEvent.click(dismissButton());
    await screen.findByText("Could not dismiss the reports. They are still open.");
    fireEvent.click(dismissButton());
    await waitFor(() => expect(screen.queryByText("Could not dismiss the reports. They are still open.")).toBeNull());
  });
});

describe("Bỏ qua báo cáo: vòng đời và phạm vi", () => {
  it("unmount khi đang gửi (thành công muộn): không lỗi, không cập nhật state", async () => {
    let resolve: (value: { dismissedCount: number }) => void = () => {};
    vi.mocked(dismissReports).mockReturnValue(new Promise((r) => (resolve = r)));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = await openGroup();
    typeReason("ok");
    fireEvent.click(dismissButton());
    view.unmount();
    await act(async () => resolve({ dismissedCount: 2 }));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("unmount khi đang gửi (lỗi muộn): không lỗi", async () => {
    let reject: (reason: unknown) => void = () => {};
    vi.mocked(dismissReports).mockReturnValue(new Promise((_, r) => (reject = r)));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = await openGroup();
    typeReason("ok");
    fireEvent.click(dismissButton());
    view.unmount();
    await act(async () => reject(new ApiError(409, "x", { newReportIds: [R3] })));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("tab Đã gỡ và Đã bỏ qua không có ô chọn hay nút bỏ qua", async () => {
    vi.mocked(getReportDetails).mockResolvedValue([
      detail(R1, { status: "resolved", resolution: "dismissed" }),
    ]);
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    for (const tab of ["Removed", "Dismissed"]) {
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      await screen.findByText("Song A");
      fireEvent.click(screen.getByRole("button", { name: /2 reports/ }));
      await screen.findByText("Reported by Reporter r1");
      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(screen.queryByRole("button", { name: "Dismiss reports" })).toBeNull();
    }
  });

  it("nhóm không còn xử lý được không có form bỏ qua", async () => {
    vi.mocked(listReportGroups).mockResolvedValue(
      listOf([group({ projectId: null, projectName: null, projectExists: false })]),
    );
    render(<AdminReportsPage />);
    await screen.findByText("No longer actionable");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss reports" })).toBeNull();
  });

  it("nội dung chi tiết báo cáo chứa HTML vẫn hiện nguyên chữ trong danh sách có ô chọn", async () => {
    vi.mocked(getReportDetails).mockResolvedValue([detail(R1, { details: "<b>x</b>" }), detail(R2)]);
    const view = await openGroup();
    expect(screen.getByText("<b>x</b>")).toBeTruthy();
    expect(view.container.querySelector("b")).toBeNull();
  });

  it("không có email trong DOM khi mở form bỏ qua", async () => {
    await openGroup();
    expect(document.body.innerHTML).not.toMatch(/@|e-?mail/i);
  });
});
