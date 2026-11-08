import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReportReason } from "@stave/shared-types";
import { ReportDialog } from "./report-dialog";
import { reportProject } from "../../lib/report-api";
import { ApiError } from "../../lib/api-client";
import { setLang } from "../../lib/i18n";

vi.mock("../../lib/report-api", () => ({ reportProject: vi.fn() }));

beforeEach(() => setLang("en"));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness({
  onClose = () => {},
  onSent = () => {},
  initialReason = null,
  initialDetails = "",
}: {
  onClose?: () => void;
  onSent?: () => void;
  initialReason?: ReportReason | null;
  initialDetails?: string;
}) {
  const [reason, setReason] = useState<ReportReason | null>(initialReason);
  const [details, setDetails] = useState(initialDetails);
  return (
    <ReportDialog
      projectId="p1"
      reason={reason}
      details={details}
      onReasonChange={setReason}
      onDetailsChange={setDetails}
      onClose={onClose}
      onSent={onSent}
    />
  );
}

const submit = () => screen.getByRole("button", { name: /^(Send report|Sending…)$/ }) as HTMLButtonElement;

describe("ReportDialog", () => {
  it("hiện năm lý do theo key, dịch qua từ điển", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Reason" })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByLabelText("Copyright infringement")).toBeTruthy();
    expect(screen.getByLabelText("Spam or scam")).toBeTruthy();
  });

  it("đổi ngôn ngữ thì nhãn lý do đổi theo", () => {
    setLang("vi");
    render(<Harness />);
    expect(screen.getByLabelText("Vi phạm bản quyền")).toBeTruthy();
    expect(screen.getByLabelText("Quấy rối")).toBeTruthy();
  });

  it("không gửi được khi chưa chọn lý do", () => {
    render(<Harness />);
    expect(submit().disabled).toBe(true);
    fireEvent.click(submit());
    expect(reportProject).not.toHaveBeenCalled();
  });

  it("chọn lý do thì nút gửi bật", () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("Harassment"));
    expect(submit().disabled).toBe(false);
  });

  it("bộ đếm cập nhật theo nội dung", () => {
    render(<Harness />);
    expect(screen.getByText("0/500")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello" } });
    expect(screen.getByText("5/500")).toBeTruthy();
  });

  it("vượt 500 ký tự hiện lỗi, tắt nút gửi và không gọi API", () => {
    render(<Harness initialReason="spam" initialDetails={"x".repeat(501)} />);
    expect(screen.getByText("Details can be at most 500 characters.")).toBeTruthy();
    expect(submit().disabled).toBe(true);
    fireEvent.click(submit());
    expect(reportProject).not.toHaveBeenCalled();
  });

  it("đúng 500 ký tự thì gửi được", () => {
    render(<Harness initialReason="spam" initialDetails={"x".repeat(500)} />);
    expect(screen.queryByText("Details can be at most 500 characters.")).toBeNull();
    expect(submit().disabled).toBe(false);
  });

  it("không cắt chữ âm thầm: textarea không có maxLength", () => {
    render(<Harness />);
    expect(screen.getByRole("textbox").hasAttribute("maxlength")).toBe(false);
  });

  it("gửi gọi API đúng payload, details đã trim, rồi báo onSent", async () => {
    vi.mocked(reportProject).mockResolvedValue({ id: "r1" });
    const onSent = vi.fn();
    render(<Harness onSent={onSent} initialReason="copyright" initialDetails="  giống bài X  " />);
    fireEvent.click(submit());
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(reportProject).toHaveBeenCalledWith("p1", { reason: "copyright", details: "giống bài X" });
  });

  it("không gửi trường details khi để trống", async () => {
    vi.mocked(reportProject).mockResolvedValue({ id: "r1" });
    render(<Harness initialReason="other" initialDetails="   " />);
    fireEvent.click(submit());
    await waitFor(() => expect(reportProject).toHaveBeenCalled());
    expect(reportProject).toHaveBeenCalledWith("p1", { reason: "other" });
  });

  it.each([
    [409, "You have already reported this project."],
    [403, "You can't report your own project."],
    [404, "This project can't be reported. It may have been removed or made private."],
    [500, "Could not send the report. Try again."],
  ])("lỗi %i hiện đúng câu trong hộp và cho gửi lại", async (status, message) => {
    vi.mocked(reportProject).mockRejectedValue(new ApiError(status, "whatever the server said"));
    const onSent = vi.fn();
    render(<Harness onSent={onSent} initialReason="spam" />);
    fireEvent.click(submit());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(message);
    expect(screen.getByRole("dialog").contains(alert)).toBe(true);
    expect(onSent).not.toHaveBeenCalled();
    expect(submit().disabled).toBe(false);
  });

  it("lỗi mạng (không phải ApiError) hiện câu chung", async () => {
    vi.mocked(reportProject).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Harness initialReason="spam" />);
    fireEvent.click(submit());
    expect((await screen.findByRole("alert")).textContent).toBe("Could not send the report. Try again.");
  });

  it("đang gửi thì nút gửi bị tắt và không gửi lần hai", async () => {
    let resolve: (value: { id: string }) => void = () => {};
    vi.mocked(reportProject).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Harness initialReason="spam" />);
    fireEvent.click(submit());
    const sending = await screen.findByRole("button", { name: "Sending…" });
    expect((sending as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sending);
    expect(reportProject).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ id: "r1" }));
  });

  it("unmount khi đang gửi không gọi onSent và không cập nhật state", async () => {
    let resolve: (value: { id: string }) => void = () => {};
    vi.mocked(reportProject).mockReturnValue(new Promise((r) => (resolve = r)));
    const onSent = vi.fn();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<Harness onSent={onSent} initialReason="spam" />);
    fireEvent.click(submit());
    unmount();
    await act(async () => resolve({ id: "r1" }));
    expect(onSent).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("unmount khi gửi lỗi không cập nhật state", async () => {
    let reject: (reason: unknown) => void = () => {};
    vi.mocked(reportProject).mockReturnValue(new Promise((_, r) => (reject = r)));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<Harness initialReason="spam" />);
    fireEvent.click(submit());
    unmount();
    await act(async () => reject(new ApiError(409, "x")));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("Huỷ gọi onClose", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ô nhập có name và autoComplete", () => {
    render(<Harness />);
    const box = screen.getByRole("textbox");
    expect(box.getAttribute("name")).toBe("details");
    expect(box.getAttribute("autocomplete")).toBe("off");
  });
});
