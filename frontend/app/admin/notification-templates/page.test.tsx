import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { NotificationTemplateInfo } from "@stave/shared-types";
import AdminNotificationTemplatesPage from "./page";
import {
  deleteNotificationTemplate,
  listNotificationTemplates,
  previewNotificationTemplate,
  saveNotificationTemplate,
} from "../../../lib/admin-notification-templates-api";
import { ApiError } from "../../../lib/api-client";
import { setLang } from "../../../lib/i18n";

vi.mock("../../../lib/admin-notification-templates-api", () => ({
  listNotificationTemplates: vi.fn(),
  saveNotificationTemplate: vi.fn(),
  deleteNotificationTemplate: vi.fn(),
  previewNotificationTemplate: vi.fn(),
}));

function template(over: Partial<NotificationTemplateInfo> = {}): NotificationTemplateInfo {
  return {
    type: "collab.invite",
    mandatory: false,
    placeholders: ["inviterName", "projectName"],
    defaultSubject: "Lời mời cộng tác",
    defaultBody: "{{inviterName}} mời bạn vào {{projectName}}",
    custom: null,
    ...over,
  };
}

const custom = { name: "Invite", subject: "Hi", body: "Join {{projectName}}", updatedAt: "2026-11-12T00:00:00Z" };

beforeEach(() => {
  setLang("en");
  vi.mocked(listNotificationTemplates).mockResolvedValue([
    template(),
    template({ type: "comment.new", placeholders: ["authorName"], custom }),
    template({ type: "security.google_disconnected", mandatory: true, placeholders: ["email"], custom }),
  ]);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("trang mẫu thông báo", () => {
  it("hiện trạng thái mặc định, đã tuỳ chỉnh và bắt buộc", async () => {
    render(<AdminNotificationTemplatesPage />);
    await screen.findByText("collab.invite");
    expect(screen.getAllByText("Customised")).toHaveLength(2);
    expect(screen.getByText("Required")).toBeTruthy();
  });

  it("loại bắt buộc có nút Sửa nhưng không có nút về mặc định", async () => {
    render(<AdminNotificationTemplatesPage />);
    await screen.findByText("collab.invite");
    expect(screen.getByRole("button", { name: "Edit: security.google_disconnected" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reset to default: security.google_disconnected" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reset to default: comment.new" })).toBeTruthy();
  });

  it("lỗi tải có Thử lại, không hiện danh sách rỗng", async () => {
    vi.mocked(listNotificationTemplates).mockRejectedValueOnce(new ApiError(500, "x"));
    render(<AdminNotificationTemplatesPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("tạo mẫu: điền sẵn chữ mặc định, thiếu tên thì báo và không lưu", async () => {
    render(<AdminNotificationTemplatesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Customise: collab.invite" }));
    await screen.findByLabelText("Template name");
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    expect(saveNotificationTemplate).not.toHaveBeenCalled();
    expect(screen.getByText("This field is required.")).toBeTruthy();
  });

  it("hộp soạn: chưa sửa thì bấm nền đóng luôn, đã gõ thì hỏi trước khi bỏ", async () => {
    render(<AdminNotificationTemplatesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Customise: collab.invite" }));
    await screen.findByLabelText("Template name");
    const overlay = () => screen.getByRole("dialog").parentElement as HTMLElement;

    fireEvent.mouseDown(overlay());
    expect(screen.queryByLabelText("Template name")).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Customise: collab.invite" }));
    fireEvent.change(await screen.findByLabelText("Template name"), { target: { value: "My template" } });
    fireEvent.mouseDown(overlay());
    expect(screen.getByText("Discard changes?")).toBeTruthy();
    expect(screen.getByLabelText("Template name")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByLabelText("Template name")).toBeNull();
  });

  it("lưu gửi đúng tên, tiêu đề, nội dung rồi tải lại", async () => {
    vi.mocked(saveNotificationTemplate).mockResolvedValue({ created: true });
    render(<AdminNotificationTemplatesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Customise: collab.invite" }));
    fireEvent.change(await screen.findByLabelText("Template name"), { target: { value: "Invite" } });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() =>
      expect(saveNotificationTemplate).toHaveBeenCalledWith("collab.invite", {
        name: "Invite",
        subject: "Lời mời cộng tác",
        body: "{{inviterName}} mời bạn vào {{projectName}}",
      }),
    );
    expect(await screen.findByText("Template created.")).toBeTruthy();
    expect(listNotificationTemplates).toHaveBeenCalledTimes(2);
  });

  it("placeholder sai: hiện đúng tên placeholder trong hộp", async () => {
    vi.mocked(saveNotificationTemplate).mockRejectedValue(
      new ApiError(400, "Unknown placeholders", { code: "UNKNOWN_PLACEHOLDER", placeholders: ["nope"] }),
    );
    render(<AdminNotificationTemplatesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Customise: collab.invite" }));
    fireEvent.change(await screen.findByLabelText("Template name"), { target: { value: "Invite" } });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    expect(await screen.findByText(/\{\{nope\}\}/)).toBeTruthy();
  });

  it("nút chèn thêm đúng placeholder vào nội dung", async () => {
    render(<AdminNotificationTemplatesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Customise: collab.invite" }));
    const bodyField = (await screen.findByLabelText("Message")) as HTMLTextAreaElement;
    fireEvent.change(bodyField, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "{{projectName}}" }));
    expect(bodyField.value).toBe("{{projectName}}");
  });

  it("xem trước hiện chữ đã dựng", async () => {
    vi.mocked(previewNotificationTemplate).mockResolvedValue({ subject: "Hi Alex", body: "Join Midnight Sketch" });
    render(<AdminNotificationTemplatesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Customise: collab.invite" }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview" }));
    expect(await screen.findByText("Hi Alex")).toBeTruthy();
  });

  it("về mặc định cần xác nhận rồi mới gọi xoá", async () => {
    vi.mocked(deleteNotificationTemplate).mockResolvedValue(undefined);
    render(<AdminNotificationTemplatesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Reset to default: comment.new" }));
    expect(deleteNotificationTemplate).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Reset to default" }));
    await waitFor(() => expect(deleteNotificationTemplate).toHaveBeenCalledWith("comment.new"));
    expect(await screen.findByText("Default wording restored.")).toBeTruthy();
  });
});
