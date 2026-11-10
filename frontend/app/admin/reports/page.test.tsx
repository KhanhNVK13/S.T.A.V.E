import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  AdminReportListResponse,
  ReportDetail,
  ReportGroup,
  ReportPreview,
} from "@stave/shared-types";
import AdminReportsPage from "./page";
import { getReportDetails, getReportPreview, listReportGroups } from "../../../lib/admin-reports-api";
import { ApiError } from "../../../lib/api-client";
import { setLang } from "../../../lib/i18n";

vi.mock("../../../lib/admin-reports-api", () => ({
  ADMIN_REPORTS_PAGE_SIZE: 20,
  listReportGroups: vi.fn(),
  getReportDetails: vi.fn(),
  getReportPreview: vi.fn(),
}));

const P1 = "33333333-3333-4333-8333-333333333333";
const P2 = "55555555-5555-4555-8555-555555555555";

function group(over: Partial<ReportGroup> = {}): ReportGroup {
  return {
    projectId: P1,
    projectName: "Song A",
    projectExists: true,
    ownerDisplayName: "Alice",
    reportCount: 2,
    reasons: [
      { reason: "spam", count: 1 },
      { reason: "copyright", count: 1 },
    ],
    latestAt: "2026-11-03T10:00:00.000Z",
    ...over,
  };
}

function listOf(items: ReportGroup[], over: Partial<AdminReportListResponse> = {}): AdminReportListResponse {
  return { items, total: items.length, page: 1, limit: 20, ...over };
}

function detail(over: Partial<ReportDetail> = {}): ReportDetail {
  return {
    id: "r1",
    reason: "copyright",
    details: "giống bài X",
    createdAt: "2026-11-02T10:00:00.000Z",
    reporter: { id: "u1", displayName: "Bob" },
    status: "pending",
    resolution: null,
    ...over,
  };
}

function preview(over: Partial<ReportPreview> = {}): ReportPreview {
  return {
    project: { id: P1, name: "Song A", description: "A description", genre: "Pop" },
    hasCommit: true,
    trackCount: 2,
    noteCount: 1234,
    tracks: [
      { name: "Lead", instrument: "Flute" },
      { name: "Bass", instrument: null },
    ],
    ...over,
  };
}

beforeEach(() => {
  setLang("en");
  vi.mocked(listReportGroups).mockResolvedValue(listOf([group()]));
  vi.mocked(getReportDetails).mockResolvedValue([detail()]);
  vi.mocked(getReportPreview).mockResolvedValue(preview());
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const toggle = (n: number | string) => screen.getByRole("button", { name: new RegExp(`${n} reports?`) });

describe("AdminReportsPage: tải, rỗng, lỗi là ba trạng thái khác nhau", () => {
  it("đang tải: hiện trạng thái đang tải, chưa có danh sách, rỗng hay lỗi", () => {
    vi.mocked(listReportGroups).mockReturnValue(new Promise(() => {}));
    render(<AdminReportsPage />);
    expect(screen.getByRole("status").textContent).toContain("Loading…");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("No open reports")).toBeNull();
    expect(screen.queryByText("Song A")).toBeNull();
  });

  it("rỗng: hiện EmptyState, không có cảnh báo lỗi", async () => {
    vi.mocked(listReportGroups).mockResolvedValue(listOf([]));
    render(<AdminReportsPage />);
    expect(await screen.findByText("No open reports")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("lỗi tải: role=alert kèm nút Thử lại, KHÔNG hiện thành rỗng", async () => {
    vi.mocked(listReportGroups).mockRejectedValue(new ApiError(500, "Could not load reports"));
    render(<AdminReportsPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load reports.");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText("No open reports")).toBeNull();
    expect(screen.queryByText("Song A")).toBeNull();
  });

  it("lỗi 500 từ RPC (migration chưa áp) ra màn hình lỗi chứ không rỗng", async () => {
    vi.mocked(listReportGroups).mockRejectedValue(new ApiError(500, "Could not load reports"));
    render(<AdminReportsPage />);
    await screen.findByRole("alert");
    expect(screen.queryByText("No open reports")).toBeNull();
  });

  it("lỗi mạng cũng ra màn hình lỗi", async () => {
    vi.mocked(listReportGroups).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<AdminReportsPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Could not load reports.");
  });

  it("Thử lại tải lại và hiện danh sách khi thành công", async () => {
    vi.mocked(listReportGroups)
      .mockRejectedValueOnce(new ApiError(500, "x"))
      .mockResolvedValueOnce(listOf([group()]));
    render(<AdminReportsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Song A")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(listReportGroups).toHaveBeenCalledTimes(2);
  });

  it("Thử lại mà vẫn lỗi thì vẫn là màn hình lỗi", async () => {
    vi.mocked(listReportGroups).mockRejectedValue(new ApiError(500, "x"));
    render(<AdminReportsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(listReportGroups).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("No open reports")).toBeNull();
  });
});

describe("AdminReportsPage: danh sách", () => {
  it("hiện dự án, chủ, lý do, số báo cáo bằng RowList", async () => {
    render(<AdminReportsPage />);
    expect(await screen.findByText("Song A")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Spam or scam")).toBeTruthy();
    expect(screen.getByText("Copyright infringement")).toBeTruthy();
    expect(toggle(2)).toBeTruthy();
    for (const header of ["Project", "Owner", "Reasons", "Reports", "Latest"]) {
      expect(screen.getByText(header)).toBeTruthy();
    }
  });

  it("mốc thời gian là thẻ time mang giá trị ISO gốc, không phụ thuộc múi giờ", async () => {
    const { container } = render(<AdminReportsPage />);
    await screen.findByText("Song A");
    const time = container.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-11-03T10:00:00.000Z");
  });

  it("chủ dự án không rõ thì hiện câu thay thế", async () => {
    vi.mocked(listReportGroups).mockResolvedValue(listOf([group({ ownerDisplayName: null })]));
    render(<AdminReportsPage />);
    expect(await screen.findByText("Unknown owner")).toBeTruthy();
  });

  it("nhãn lý do đổi theo ngôn ngữ", async () => {
    setLang("vi");
    render(<AdminReportsPage />);
    expect(await screen.findByText("Spam hoặc lừa đảo")).toBeTruthy();
    expect(screen.getByText("Dự án")).toBeTruthy();
  });
});

describe("AdminReportsPage: tab", () => {
  it("ba tab đúng thứ tự: Open, Removed, Dismissed; tải tab đầu với open trang 1", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Open", "Removed", "Dismissed"]);
    expect(listReportGroups).toHaveBeenCalledWith("open", 1);
  });

  it("đổi tab tải lại đúng trạng thái và không hiện dữ liệu cũ trong lúc chờ", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("Song A");

    let resolve: (value: AdminReportListResponse) => void = () => {};
    vi.mocked(listReportGroups).mockReturnValue(new Promise((r) => (resolve = r)));
    fireEvent.click(screen.getByRole("tab", { name: "Removed" }));

    expect(listReportGroups).toHaveBeenLastCalledWith("upheld", 1);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("Song A")).toBeNull();
    expect(screen.getByRole("tab", { name: "Removed" }).getAttribute("aria-selected")).toBe("true");

    await act(async () => resolve(listOf([group({ projectName: "Song B", projectId: P2 })])));
    expect(await screen.findByText("Song B")).toBeTruthy();
  });

  it("tab Dismissed gọi với dismissed", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(screen.getByRole("tab", { name: "Dismissed" }));
    await waitFor(() => expect(listReportGroups).toHaveBeenLastCalledWith("dismissed", 1));
  });

  it("mỗi tab có EmptyState riêng khi rỗng", async () => {
    vi.mocked(listReportGroups).mockResolvedValue(listOf([]));
    render(<AdminReportsPage />);
    await screen.findByText("No open reports");
    fireEvent.click(screen.getByRole("tab", { name: "Removed" }));
    expect(await screen.findByText("No removed projects")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Dismissed" }));
    expect(await screen.findByText("No dismissed reports")).toBeTruthy();
  });

  it("lỗi ở một tab không làm hỏng tab khác", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    vi.mocked(listReportGroups).mockRejectedValueOnce(new ApiError(500, "x"));
    fireEvent.click(screen.getByRole("tab", { name: "Removed" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("tab", { name: "Open" }));
    expect(await screen.findByText("Song A")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tab đã xử lý hiện lý do quyết định; tab đang mở thì không", async () => {
    vi.mocked(listReportGroups).mockImplementation(async (status) =>
      status === "open"
        ? listOf([group()])
        : listOf([group({ resolution: "upheld", resolutionNote: "Copied a song", resolvedAt: "2026-11-04T00:00:00.000Z" })]),
    );
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    expect(screen.queryByText(/Decision:/)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Removed" }));
    expect(await screen.findByText("Decision: Copied a song")).toBeTruthy();
  });

  it("quyết định không có ghi chú hiện câu thay thế", async () => {
    vi.mocked(listReportGroups).mockResolvedValue(
      listOf([group({ resolution: "dismissed", resolutionNote: null, resolvedAt: "2026-11-04T00:00:00.000Z" })]),
    );
    render(<AdminReportsPage />);
    expect(await screen.findByText("Decision: No reason recorded.")).toBeTruthy();
  });
});

describe("AdminReportsPage: phân trang", () => {
  it("không hiện phân trang khi chỉ có một trang", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  });

  it("Trang sau gọi trang 2, Trang trước quay lại 1", async () => {
    vi.mocked(listReportGroups).mockResolvedValue(listOf([group()], { total: 45 }));
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(listReportGroups).toHaveBeenLastCalledWith("open", 2));
    expect(await screen.findByText("Page 2 of 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() => expect(listReportGroups).toHaveBeenLastCalledWith("open", 1));
  });

  it("đổi tab quay về trang 1", async () => {
    vi.mocked(listReportGroups).mockResolvedValue(listOf([group()], { total: 45 }));
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Page 2 of 3");
    fireEvent.click(screen.getByRole("tab", { name: "Dismissed" }));
    await waitFor(() => expect(listReportGroups).toHaveBeenLastCalledWith("dismissed", 1));
  });
});

describe("AdminReportsPage: mở rộng nhóm (tải chi tiết lười)", () => {
  it("chưa mở thì không gọi API chi tiết", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    expect(getReportDetails).not.toHaveBeenCalled();
    expect(toggle(2).getAttribute("aria-expanded")).toBe("false");
  });

  it("mở nhóm gọi chi tiết đúng một lần với đúng id và status của tab", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(toggle(2));
    expect(toggle(2).getAttribute("aria-expanded")).toBe("true");
    expect(await screen.findByText("Reported by Bob")).toBeTruthy();
    expect(getReportDetails).toHaveBeenCalledTimes(1);
    expect(getReportDetails).toHaveBeenCalledWith(P1, "open");
  });

  it("đóng rồi mở lại không tải lại", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(toggle(2));
    await screen.findByText("Reported by Bob");
    fireEvent.click(toggle(2));
    expect(toggle(2).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Reported by Bob")).toBeNull();
    fireEvent.click(toggle(2));
    expect(await screen.findByText("Reported by Bob")).toBeTruthy();
    expect(getReportDetails).toHaveBeenCalledTimes(1);
  });

  it("đang tải chi tiết hiện trạng thái đang tải", async () => {
    vi.mocked(getReportDetails).mockReturnValue(new Promise(() => {}));
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(toggle(2));
    expect(screen.getByText("Loading reports…")).toBeTruthy();
  });

  it("chi tiết hiện lý do, chi tiết, người báo cáo; người báo cáo null có câu riêng", async () => {
    vi.mocked(getReportDetails).mockResolvedValue([
      detail({ id: "r1" }),
      detail({ id: "r2", reporter: null, details: null, reason: "spam" }),
    ]);
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(toggle(2));
    expect(await screen.findByText("Reported by Bob")).toBeTruthy();
    expect(screen.getByText("giống bài X")).toBeTruthy();
    expect(screen.getByText("Reporter unavailable")).toBeTruthy();
    expect(screen.getByText("No details provided.")).toBeTruthy();
  });

  it("người báo cáo có id nhưng chưa có tên vẫn hiện câu không rỗng", async () => {
    vi.mocked(getReportDetails).mockResolvedValue([detail({ reporter: { id: "u1", displayName: null } })]);
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(toggle(2));
    expect(await screen.findByText("Reporter unavailable")).toBeTruthy();
  });

  it("lỗi tải chi tiết hiện cảnh báo trong nhóm, Thử lại tải lại và thành công", async () => {
    vi.mocked(getReportDetails)
      .mockRejectedValueOnce(new ApiError(500, "x"))
      .mockResolvedValueOnce([detail()]);
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(toggle(2));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load the reports for this project.");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Reported by Bob")).toBeTruthy();
    expect(getReportDetails).toHaveBeenCalledTimes(2);
  });

  it("chi tiết nhiều dòng giữ xuống dòng bằng whitespace-pre-wrap", async () => {
    vi.mocked(getReportDetails).mockResolvedValue([detail({ details: "dòng 1\ndòng 2" })]);
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(toggle(2));
    const text = await screen.findByText(/dòng 1/);
    expect(text.className).toContain("whitespace-pre-wrap");
    expect(text.textContent).toBe("dòng 1\ndòng 2");
  });

  it("nội dung chứa thẻ HTML hiện nguyên chữ, không dựng phần tử", async () => {
    vi.mocked(listReportGroups).mockResolvedValue(
      listOf([group({ projectName: "<b>x</b> project", ownerDisplayName: "<i>owner</i>" })]),
    );
    vi.mocked(getReportDetails).mockResolvedValue([
      detail({ details: "<script>alert(1)</script><b>bold</b>", reporter: { id: "u1", displayName: "<u>Bob</u>" } }),
    ]);
    const { container } = render(<AdminReportsPage />);
    expect(await screen.findByText("<b>x</b> project")).toBeTruthy();
    expect(screen.getByText("<i>owner</i>")).toBeTruthy();
    fireEvent.click(toggle(2));
    expect(await screen.findByText("<script>alert(1)</script><b>bold</b>")).toBeTruthy();
    expect(screen.getByText("Reported by <u>Bob</u>")).toBeTruthy();
    for (const tag of ["b", "i", "u", "script"]) {
      expect(container.querySelector(tag)).toBeNull();
    }
  });
});

describe("AdminReportsPage: nhóm không còn xử lý được", () => {
  it("projectId null: có nhãn đánh dấu, không mở được chi tiết, không xem được dự án", async () => {
    vi.mocked(listReportGroups).mockResolvedValue(
      listOf([group({ projectId: null, projectName: null, projectExists: false, ownerDisplayName: null, reportCount: 3 })]),
    );
    render(<AdminReportsPage />);
    expect(await screen.findByText("Project no longer exists")).toBeTruthy();
    expect(screen.getByText("No longer actionable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /reports?$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "View project" })).toBeNull();
    expect(screen.queryByRole("button", { name: /expand|3 reports/ })).toBeNull();
    expect(screen.getByText("3")).toBeTruthy();
    expect(getReportDetails).not.toHaveBeenCalled();
  });

  it("projectExists false (còn id) cũng không mở được", async () => {
    vi.mocked(listReportGroups).mockResolvedValue(
      listOf([group({ projectExists: false, projectName: null })]),
    );
    render(<AdminReportsPage />);
    expect(await screen.findByText("No longer actionable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View project" })).toBeNull();
    expect(screen.queryByRole("button", { name: /2 reports/ })).toBeNull();
  });
});

describe("AdminReportsPage: hộp Xem dự án", () => {
  it("chưa bấm thì không gọi /preview", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    expect(getReportPreview).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("bấm xem gọi /preview đúng một lần và hiện tên, mô tả, thể loại, số track, số nốt, danh sách track", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(screen.getByRole("button", { name: "View project" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("A description");
    expect(getReportPreview).toHaveBeenCalledTimes(1);
    expect(getReportPreview).toHaveBeenCalledWith(P1);
    expect(within(dialog).getByText("Song A")).toBeTruthy();
    expect(within(dialog).getByText("Pop")).toBeTruthy();
    expect(within(dialog).getByText("Tracks").nextElementSibling?.textContent).toBe("2");
    expect(within(dialog).getByText("Notes").nextElementSibling?.textContent).toBe((1234).toLocaleString("en-US"));
    expect(within(dialog).getByText("Lead")).toBeTruthy();
    expect(within(dialog).getByText("Flute")).toBeTruthy();
    expect(within(dialog).getByText("Bass")).toBeTruthy();
    expect(within(dialog).getByText("Default instrument")).toBeTruthy();
  });

  it("đang tải hiện trạng thái đang tải trong hộp", async () => {
    vi.mocked(getReportPreview).mockReturnValue(new Promise(() => {}));
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(screen.getByRole("button", { name: "View project" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("status").textContent).toContain("Loading…");
  });

  it("403: hiện câu giải thích dự án không còn báo cáo đang mở, không phải lỗi chung", async () => {
    vi.mocked(getReportPreview).mockRejectedValue(new ApiError(403, "This project has no open reports"));
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(screen.getByRole("button", { name: "View project" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText("This project no longer has open reports, so it can't be viewed here."),
    ).toBeTruthy();
    expect(within(dialog).queryByText("Could not load the project.")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("404: hiện câu dự án không còn tồn tại", async () => {
    vi.mocked(getReportPreview).mockRejectedValue(new ApiError(404, "Project not found"));
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(screen.getByRole("button", { name: "View project" }));
    expect(await screen.findByText("This project no longer exists.")).toBeTruthy();
  });

  it("lỗi khác: hiện lỗi chung có Thử lại và thử lại thành công", async () => {
    vi.mocked(getReportPreview)
      .mockRejectedValueOnce(new ApiError(500, "x"))
      .mockResolvedValueOnce(preview());
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(screen.getByRole("button", { name: "View project" }));
    const dialog = await screen.findByRole("dialog");
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Could not load the project.");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await within(dialog).findByText("A description")).toBeTruthy();
    expect(getReportPreview).toHaveBeenCalledTimes(2);
  });

  it("dự án chưa có commit hiện câu riêng", async () => {
    vi.mocked(getReportPreview).mockResolvedValue(preview({ hasCommit: false, trackCount: 0, noteCount: 0, tracks: [] }));
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(screen.getByRole("button", { name: "View project" }));
    expect(await screen.findByText("This project has no saved version yet.")).toBeTruthy();
  });

  it("mô tả, thể loại có thể rỗng", async () => {
    vi.mocked(getReportPreview).mockResolvedValue(
      preview({ project: { id: P1, name: "Song A", description: null, genre: null } }),
    );
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(screen.getByRole("button", { name: "View project" }));
    expect(await screen.findByText("No description.")).toBeTruthy();
    expect(screen.getByText("No genre")).toBeTruthy();
  });

  it("tên, mô tả, tên track chứa HTML hiện nguyên chữ", async () => {
    vi.mocked(getReportPreview).mockResolvedValue(
      preview({
        project: { id: P1, name: "<b>name</b>", description: "<img src=x onerror=alert(1)>\nline2", genre: "<i>g</i>" },
        tracks: [{ name: "<u>track</u>", instrument: "<s>inst</s>" }],
      }),
    );
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(screen.getByRole("button", { name: "View project" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("<b>name</b>")).toBeTruthy();
    const description = within(dialog).getByText(/<img src=x/);
    expect(description.className).toContain("whitespace-pre-wrap");
    expect(within(dialog).getByText("<u>track</u>")).toBeTruthy();
    expect(within(dialog).getByText("<s>inst</s>")).toBeTruthy();
    for (const tag of ["b", "img", "i", "u", "s"]) {
      expect(dialog.querySelector(tag)).toBeNull();
    }
  });

  it("đóng hộp bằng nút Close", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(screen.getByRole("button", { name: "View project" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("A description");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("đóng hộp khi đang tải rồi dữ liệu về muộn không gây lỗi", async () => {
    let resolve: (value: ReportPreview) => void = () => {};
    vi.mocked(getReportPreview).mockReturnValue(new Promise((r) => (resolve = r)));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(screen.getByRole("button", { name: "View project" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await act(async () => resolve(preview()));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe("AdminReportsPage: an toàn dữ liệu và vòng đời", () => {
  it("không có email ở bất kỳ đâu trong DOM, kể cả khi mở chi tiết và xem dự án", async () => {
    const { container } = render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(toggle(2));
    await screen.findByText("Reported by Bob");
    fireEvent.click(screen.getByRole("button", { name: "View project" }));
    await screen.findByText("A description");
    expect(container.ownerDocument.body.innerHTML).not.toMatch(/@|e-?mail/i);
  });

  it("không có nút hành động xử lý (gỡ, bỏ qua) ở giai đoạn này", async () => {
    render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(toggle(2));
    await screen.findByText("Reported by Bob");
    for (const name of [/remove/i, /dismiss report/i, /restore/i]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("unmount khi danh sách đang tải: không lỗi, không cập nhật state", async () => {
    let resolve: (value: AdminReportListResponse) => void = () => {};
    vi.mocked(listReportGroups).mockReturnValue(new Promise((r) => (resolve = r)));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<AdminReportsPage />);
    unmount();
    await act(async () => resolve(listOf([group()])));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("unmount khi chi tiết đang tải: không lỗi", async () => {
    let resolve: (value: ReportDetail[]) => void = () => {};
    vi.mocked(getReportDetails).mockReturnValue(new Promise((r) => (resolve = r)));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<AdminReportsPage />);
    await screen.findByText("Song A");
    fireEvent.click(toggle(2));
    unmount();
    await act(async () => resolve([detail()]));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("unmount khi danh sách bị lỗi muộn: không lỗi", async () => {
    let reject: (reason: unknown) => void = () => {};
    vi.mocked(listReportGroups).mockReturnValue(new Promise((_, r) => (reject = r)));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<AdminReportsPage />);
    unmount();
    await act(async () => reject(new ApiError(500, "x")));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
