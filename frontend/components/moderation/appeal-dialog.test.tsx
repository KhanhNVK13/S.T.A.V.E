import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "../../lib/api-client";
import { appealRemoval, listRemovedProjects } from "../../lib/appeals-api";
import { setLang } from "../../lib/i18n";
import { I18nProvider } from "../../context/i18n-context";
import { AppealDialog } from "./appeal-dialog";
import { RemovedProjectsSection } from "./removed-projects-section";

vi.mock("../../lib/appeals-api", () => ({
  appealRemoval: vi.fn(),
  listRemovedProjects: vi.fn(),
}));

beforeEach(() => setLang("en"));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const withI18n = (node: React.ReactNode) => <I18nProvider>{node}</I18nProvider>;
const statement = "Đây là bài tôi tự sáng tác, có bản thảo gốc.";

describe("AppealDialog", () => {
  function open(onSent = () => {}) {
    return render(withI18n(<AppealDialog projectId="p1" projectName="Song" onClose={() => {}} onSent={onSent} />));
  }

  it("lời kháng cáo quá ngắn thì không gửi", () => {
    open();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ngắn" } });
    fireEvent.click(screen.getByRole("button", { name: "Send appeal" }));
    expect(appealRemoval).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("At least 20");
  });

  it("gửi lời kháng cáo đã trim rồi báo onSent", async () => {
    vi.mocked(appealRemoval).mockResolvedValue({ id: "a1" });
    const onSent = vi.fn();
    open(onSent);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: `  ${statement}  ` } });
    fireEvent.click(screen.getByRole("button", { name: "Send appeal" }));
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(appealRemoval).toHaveBeenCalledWith("p1", statement);
  });

  it.each([
    [410, "The appeal period has ended."],
    [409, "This removal has already been appealed."],
    [500, "Could not send the appeal. Try again."],
  ])("lỗi %i hiện đúng câu trong hộp", async (status, message) => {
    vi.mocked(appealRemoval).mockRejectedValue(new ApiError(status, "x"));
    open();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: statement } });
    fireEvent.click(screen.getByRole("button", { name: "Send appeal" }));
    await screen.findByText(message);
  });
});

describe("RemovedProjectsSection", () => {
  const removed = (over: Record<string, unknown> = {}) => ({
    projectId: "p1",
    name: "Song",
    reason: "Copied a track",
    policy: "copyright",
    removedAt: "2026-11-20T00:00:00.000Z",
    appealDeadline: "2026-12-20T00:00:00.000Z",
    canAppeal: true,
    appealStatus: null,
    appealNote: null,
    ...over,
  });

  it("không hiện gì khi không có dự án nào bị gỡ", async () => {
    vi.mocked(listRemovedProjects).mockResolvedValue([]);
    const { container } = render(withI18n(<RemovedProjectsSection />));
    await waitFor(() => expect(listRemovedProjects).toHaveBeenCalled());
    expect(container.querySelector("section")).toBeNull();
  });

  it("còn hạn thì có nút Kháng cáo, bấm mở hộp thoại", async () => {
    vi.mocked(listRemovedProjects).mockResolvedValue([removed()]);
    render(withI18n(<RemovedProjectsSection />));
    fireEvent.click(await screen.findByRole("button", { name: "Appeal" }));
    expect(screen.getByRole("dialog", { name: 'Appeal the removal of "Song"' })).toBeTruthy();
  });

  it("đang chờ xử lý thì chỉ hiện trạng thái, không có nút kháng cáo", async () => {
    vi.mocked(listRemovedProjects).mockResolvedValue([removed({ canAppeal: false, appealStatus: "pending" })]);
    render(withI18n(<RemovedProjectsSection />));
    await screen.findByText("Appeal sent, waiting for an administrator.");
    expect(screen.queryByRole("button", { name: "Appeal" })).toBeNull();
  });

  it("bị bác bỏ thì hiện ghi chú của quản trị viên", async () => {
    vi.mocked(listRemovedProjects).mockResolvedValue([
      removed({ canAppeal: false, appealStatus: "rejected", appealNote: "Không đủ chứng cứ" }),
    ]);
    render(withI18n(<RemovedProjectsSection />));
    await screen.findByText("Appeal rejected.");
    expect(screen.getByText(/Không đủ chứng cứ/)).toBeTruthy();
  });

  it("quá hạn và chưa kháng cáo thì báo đã hết hạn", async () => {
    vi.mocked(listRemovedProjects).mockResolvedValue([removed({ canAppeal: false })]);
    render(withI18n(<RemovedProjectsSection />));
    await screen.findByText("The appeal period has ended.");
  });

  it("tải lỗi thì hiện báo lỗi và cho thử lại", async () => {
    vi.mocked(listRemovedProjects).mockRejectedValueOnce(new Error("down"));
    vi.mocked(listRemovedProjects).mockResolvedValueOnce([]);
    render(withI18n(<RemovedProjectsSection />));
    await screen.findByText("Could not load your removed projects.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(listRemovedProjects).toHaveBeenCalledTimes(2));
  });
});
