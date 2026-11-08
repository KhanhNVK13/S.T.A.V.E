import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReportProjectButton } from "./report-project-button";
import { reportProject } from "../../lib/report-api";
import { setLang } from "../../lib/i18n";

const push = vi.fn();
let currentUser: { id: string } | null = { id: "u1" };

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../context/auth-context", () => ({ useAuth: () => ({ user: currentUser }) }));
vi.mock("../../lib/report-api", () => ({ reportProject: vi.fn() }));

beforeEach(() => {
  setLang("en");
  currentUser = { id: "u1" };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const openButton = () => screen.getByRole("button", { name: "Report" });

describe("ReportProjectButton", () => {
  it("chưa mở thì không có hộp thoại", () => {
    render(<ReportProjectButton projectId="p1" />);
    expect(openButton()).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("đã đăng nhập: bấm mở hộp thoại", () => {
    render(<ReportProjectButton projectId="p1" />);
    fireEvent.click(openButton());
    expect(screen.getByRole("dialog", { name: "Report this project" })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("chưa đăng nhập: chuyển tới /login và không mở hộp", () => {
    currentUser = null;
    render(<ReportProjectButton projectId="p1" />);
    fireEvent.click(openButton());
    expect(push).toHaveBeenCalledWith("/login?redirect=%2Fprojects%2Fp1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("gửi xong: đóng hộp, hiện toast, xoá bản nháp", async () => {
    vi.mocked(reportProject).mockResolvedValue({ id: "r1" });
    render(<ReportProjectButton projectId="p1" />);
    fireEvent.click(openButton());
    fireEvent.click(screen.getByLabelText("Spam or scam"));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Report sent.")).toBeTruthy();

    fireEvent.click(openButton());
    expect((screen.getByLabelText("Spam or scam") as HTMLInputElement).checked).toBe(false);
  });

  it("đóng rồi mở lại giữ nguyên nội dung đang gõ", () => {
    render(<ReportProjectButton projectId="p1" />);
    fireEvent.click(openButton());
    fireEvent.click(screen.getByLabelText("Harassment"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "đang gõ dở" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(openButton());
    expect((screen.getByLabelText("Harassment") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("đang gõ dở");
  });

  it("gửi lỗi thì hộp vẫn mở và không có toast thành công", async () => {
    vi.mocked(reportProject).mockRejectedValue(new Error("x"));
    render(<ReportProjectButton projectId="p1" />);
    fireEvent.click(openButton());
    fireEvent.click(screen.getByLabelText("Other"));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText("Report sent.")).toBeNull();
  });
});
