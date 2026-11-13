import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { NotificationTemplateItem } from "@stave/shared-types";
import AdminNotificationTemplatesPage from "./page";
import {
  createNotificationTemplate,
  deleteNotificationTemplate,
  listNotificationTemplates,
  previewNotificationTemplate,
} from "../../../lib/admin-notification-templates-api";
import { ApiError } from "../../../lib/api-client";
import { setLang } from "../../../lib/i18n";

vi.mock("../../../lib/admin-notification-templates-api", () => ({
  listNotificationTemplates: vi.fn(),
  createNotificationTemplate: vi.fn(),
  deleteNotificationTemplate: vi.fn(),
  previewNotificationTemplate: vi.fn(),
}));

const TEMPLATE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UPDATED_AT = "2026-11-11T10:00:00.000Z";

function item(over: Partial<NotificationTemplateItem> = {}): NotificationTemplateItem {
  return {
    type: "collab.invite",
    category: "Cộng tác",
    mandatory: false,
    placeholders: ["inviterName", "projectName"],
    template: null,
    ...over,
  };
}

function withTemplate(over: Partial<NotificationTemplateItem> = {}): NotificationTemplateItem {
  return item({
    type: "pr.merged",
    category: "Pull request",
    placeholders: ["title", "projectName"],
    template: {
      id: TEMPLATE_ID,
      name: "Đã gộp",
      subject: "{{title}} đã gộp",
      bodyTemplate: "Dự án {{projectName}}",
      updatedAt: UPDATED_AT,
    },
    ...over,
  });
}

beforeEach(() => {
  setLang("en");
  vi.mocked(listNotificationTemplates).mockResolvedValue([
    item(),
    withTemplate(),
  ]);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("AdminNotificationTemplatesPage: tải danh sách", () => {
  it("đang tải: hiện trạng thái đang tải, chưa có danh sách", () => {
    vi.mocked(listNotificationTemplates).mockReturnValue(new Promise(() => {}));
    render(<AdminNotificationTemplatesPage />);
    expect(screen.getByRole("status").textContent).toContain("Loading…");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hiện loại thông báo, danh mục, placeholder, trạng thái", async () => {
    render(<AdminNotificationTemplatesPage />);
    expect(await screen.findByText("collab.invite")).toBeTruthy();
    expect(screen.getByText("pr.merged")).toBeTruthy();
    expect(screen.getByText("Collaboration")).toBeTruthy();
    expect(screen.getByText("Pull request")).toBeTruthy();
    expect(screen.getByText("{{inviterName}}")).toBeTruthy();
    expect(screen.getByText("Default wording")).toBeTruthy();
    expect(screen.getByText("Custom template")).toBeTruthy();
  });

  it("lỗi tải: role=alert kèm nút Thử lại, KHÔNG hiện thành rỗng", async () => {
    vi.mocked(listNotificationTemplates).mockRejectedValue(
      new ApiError(500, "Could not load templates"),
    );
    render(<AdminNotificationTemplatesPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load the notification templates.");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText("collab.invite")).toBeNull();
  });

  it("Thử lại tải lại và hiện danh sách khi thành công", async () => {
    vi.mocked(listNotificationTemplates)
      .mockRejectedValueOnce(new ApiError(500, "x"))
      .mockResolvedValueOnce([item()]);
    render(<AdminNotificationTemplatesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("collab.invite")).toBeTruthy();
    expect(listNotificationTemplates).toHaveBeenCalledTimes(2);
  });

  it("nhãn đổi theo ngôn ngữ", async () => {
    setLang("vi");
    render(<AdminNotificationTemplatesPage />);
    expect(await screen.findByText("Mẫu thông báo")).toBeTruthy();
    expect(screen.getByText("Cộng tác")).toBeTruthy();
  });

  it("unmount khi danh sách đang tải: không lỗi", async () => {
    let resolve: (value: NotificationTemplateItem[]) => void = () => {};
    vi.mocked(listNotificationTemplates).mockReturnValue(
      new Promise((r) => (resolve = r)),
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<AdminNotificationTemplatesPage />);
    unmount();
    await act(async () => resolve([item()]));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe("AdminNotificationTemplatesPage: hộp tạo mẫu", () => {
  async function openDialog() {
    render(<AdminNotificationTemplatesPage />);
    await screen.findByText("collab.invite");
    fireEvent.click(screen.getByRole("button", { name: "Create template" }));
    return screen.findByRole("dialog");
  }

  it("mở hộp khi bấm Tạo mẫu", async () => {
    const dialog = await openDialog();
    expect(within(dialog).getByText("New template for collab.invite")).toBeTruthy();
  });

  it("rỗng: báo lỗi inline, KHÔNG gọi API", async () => {
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(await within(dialog).findByText("Enter a template name.")).toBeTruthy();
    expect(within(dialog).getByText("Enter a subject.")).toBeTruthy();
    expect(within(dialog).getByText("Enter the message.")).toBeTruthy();
    expect(createNotificationTemplate).not.toHaveBeenCalled();
  });

  it("gõ tay placeholder sai: hiện đúng tên placeholder sai", async () => {
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Subject"), {
      target: { value: "{{khongTonTai}} mời bạn" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(
      await within(dialog).findByText('This type has no placeholder named "khongTonTai".'),
    ).toBeTruthy();
    expect(createNotificationTemplate).not.toHaveBeenCalled();
  });

  it("placeholder sai cú pháp: báo lỗi inline", async () => {
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Subject"), {
      target: { value: "{{a-b}} mời bạn" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(
      await within(dialog).findByText("This placeholder is malformed: {{a-b}}"),
    ).toBeTruthy();
    expect(createNotificationTemplate).not.toHaveBeenCalled();
  });

  it("placeholder sai trong NỘI DUNG báo lỗi ở ô nội dung, không phải ô tiêu đề", async () => {
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Message"), {
      target: { value: "Dự án {{khongTonTai}}" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    const message = await within(dialog).findByLabelText("Message");
    expect(message.parentElement?.textContent).toContain(
      'This type has no placeholder named "khongTonTai".',
    );
    expect(createNotificationTemplate).not.toHaveBeenCalled();
  });

  it("nút chèn placeholder đặt token vào đúng vị trí con trỏ", async () => {
    const dialog = await openDialog();
    const subject = within(dialog).getByLabelText("Subject") as HTMLTextAreaElement;
    fireEvent.change(subject, { target: { value: "Mời bạn" } });
    // Con trỏ đặt ngay sau "Mời" (index 3), trước dấu cách.
    subject.setSelectionRange(3, 3);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Insert {{inviterName}}" }),
    );
    await waitFor(() =>
      expect((within(dialog).getByLabelText("Subject") as HTMLTextAreaElement).value).toBe(
        "Mời{{inviterName}} bạn",
      ),
    );
  });

  it("xem trước hiện văn bản thuần, chuỗi có thẻ HTML không bị dựng thành phần tử", async () => {
    vi.mocked(previewNotificationTemplate).mockResolvedValue({
      subject: "<b>Tiêu đề</b>",
      body: "<script>alert(1)</script> nội dung",
    });
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Subject"), {
      target: { value: "{{inviterName}}" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Preview" }));
    expect(await within(dialog).findByText("<b>Tiêu đề</b>")).toBeTruthy();
    expect(dialog.querySelector("b")).toBeNull();
    expect(dialog.querySelector("script")).toBeNull();
  });

  it("lưu thành công: gọi API với giá trị đã cắt khoảng trắng, đóng hộp, hiện toast", async () => {
    vi.mocked(createNotificationTemplate).mockResolvedValue(item());
    render(<AdminNotificationTemplatesPage />);
    await screen.findByText("collab.invite");
    fireEvent.click(screen.getByRole("button", { name: "Create template" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Template name"), {
      target: { value: "  Mời cộng tác  " },
    });
    fireEvent.change(within(dialog).getByLabelText("Subject"), {
      target: { value: "{{inviterName}} mời bạn" },
    });
    fireEvent.change(within(dialog).getByLabelText("Message"), {
      target: { value: "Dự án {{projectName}}" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(createNotificationTemplate).toHaveBeenCalledWith("collab.invite", {
        name: "Mời cộng tác",
        subject: "{{inviterName}} mời bạn",
        bodyTemplate: "Dự án {{projectName}}",
      }),
    );
    expect(await screen.findByText("Template created.")).toBeTruthy();
    expect(listNotificationTemplates).toHaveBeenCalledTimes(2);
  });

  it("lưu thành công khi tạo mới KHÔNG gửi expectedUpdatedAt", async () => {
    vi.mocked(createNotificationTemplate).mockResolvedValue(item());
    render(<AdminNotificationTemplatesPage />);
    await screen.findByText("collab.invite");
    fireEvent.click(screen.getByRole("button", { name: "Create template" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Template name"), {
      target: { value: "Mời cộng tác" },
    });
    fireEvent.change(within(dialog).getByLabelText("Subject"), {
      target: { value: "{{inviterName}} mời bạn" },
    });
    fireEvent.change(within(dialog).getByLabelText("Message"), {
      target: { value: "Dự án {{projectName}}" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(createNotificationTemplate).toHaveBeenCalledTimes(1));
    expect(
      (vi.mocked(createNotificationTemplate).mock.calls[0][1] as Record<string, unknown>)
        .expectedUpdatedAt,
    ).toBeUndefined();
  });

  it("lỗi lưu: giữ nội dung đã nhập, không đóng hộp", async () => {
    vi.mocked(createNotificationTemplate).mockRejectedValue(
      new ApiError(500, "boom"),
    );
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Template name"), {
      target: { value: "Mời cộng tác" },
    });
    fireEvent.change(within(dialog).getByLabelText("Subject"), {
      target: { value: "{{inviterName}} mời bạn" },
    });
    fireEvent.change(within(dialog).getByLabelText("Message"), {
      target: { value: "Dự án {{projectName}}" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await within(dialog).findByRole("alert");
    expect(
      (within(dialog).getByLabelText("Template name") as HTMLInputElement).value,
    ).toBe("Mời cộng tác");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("hủy: đóng hộp, không gọi API lưu", async () => {
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(createNotificationTemplate).not.toHaveBeenCalled();
  });
});

describe("AdminNotificationTemplatesPage: sửa mẫu (UC-111)", () => {
  async function openEditDialog() {
    render(<AdminNotificationTemplatesPage />);
    await screen.findByText("pr.merged");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    return screen.findByRole("dialog");
  }

  it("hộp sửa ĐIỀN SẴN giá trị đang lưu", async () => {
    const dialog = await openEditDialog();
    expect(within(dialog).getByText("Edit the template for pr.merged")).toBeTruthy();
    expect((within(dialog).getByLabelText("Template name") as HTMLInputElement).value).toBe(
      "Đã gộp",
    );
    expect((within(dialog).getByLabelText("Subject") as HTMLTextAreaElement).value).toBe(
      "{{title}} đã gộp",
    );
    expect((within(dialog).getByLabelText("Message") as HTMLTextAreaElement).value).toBe(
      "Dự án {{projectName}}",
    );
  });

  it("lưu thì gửi kèm expectedUpdatedAt của bản đang mở", async () => {
    vi.mocked(createNotificationTemplate).mockResolvedValue(withTemplate());
    const dialog = await openEditDialog();
    fireEvent.change(within(dialog).getByLabelText("Subject"), {
      target: { value: "{{title}} đã gộp xong" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(createNotificationTemplate).toHaveBeenCalledWith("pr.merged", {
        name: "Đã gộp",
        subject: "{{title}} đã gộp xong",
        bodyTemplate: "Dự án {{projectName}}",
        expectedUpdatedAt: UPDATED_AT,
      }),
    );
    expect(await screen.findByText("Template updated.")).toBeTruthy();
  });

  it("placeholder sai khi sửa chặn gửi, không gọi API", async () => {
    const dialog = await openEditDialog();
    fireEvent.change(within(dialog).getByLabelText("Subject"), {
      target: { value: "{{khongTonTai}}" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(
      await within(dialog).findByText('This type has no placeholder named "khongTonTai".'),
    ).toBeTruthy();
    expect(createNotificationTemplate).not.toHaveBeenCalled();
  });

  it("409 đồng thời: hiện đúng câu, tải lại dữ liệu, GIỮ chữ người dùng vừa nhập", async () => {
    vi.mocked(createNotificationTemplate).mockRejectedValue(
      new ApiError(409, "This template was changed by someone else. Please reload."),
    );
    const dialog = await openEditDialog();
    fireEvent.change(within(dialog).getByLabelText("Subject"), {
      target: { value: "Bản của tôi" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await within(dialog).findByRole("alert");
    expect(
      within(dialog).getByRole("alert").textContent,
    ).toContain("This template was just changed by someone else.");
    // Đã tải lại danh sách…
    await waitFor(() => expect(listNotificationTemplates).toHaveBeenCalledTimes(2));
    // …nhưng hộp vẫn mở và giữ chữ người dùng vừa nhập.
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((within(dialog).getByLabelText("Subject") as HTMLTextAreaElement).value).toBe(
      "Bản của tôi",
    );
  });

  it("sau 409, lần lưu kế tiếp dùng updated_at MỚI (không phải mốc đã lỗi thời)", async () => {
    const NEW_UPDATED_AT = "2026-11-12T11:00:00.000Z";
    vi.mocked(createNotificationTemplate).mockRejectedValueOnce(
      new ApiError(409, "This template was changed by someone else. Please reload."),
    );
    vi.mocked(listNotificationTemplates)
      .mockResolvedValueOnce([item(), withTemplate()])
      .mockResolvedValueOnce([
        item(),
        withTemplate({
          template: {
            id: TEMPLATE_ID,
            name: "Đã gộp",
            subject: "{{title}} đã gộp",
            bodyTemplate: "Dự án {{projectName}}",
            updatedAt: NEW_UPDATED_AT,
          },
        }),
      ]);

    render(<AdminNotificationTemplatesPage />);
    await screen.findByText("pr.merged");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await within(dialog).findByRole("alert");
    await waitFor(() => expect(listNotificationTemplates).toHaveBeenCalledTimes(2));
    // Đợi hộp nhận mốc `updated_at` mới trước khi bấm lưu lần nữa.
    await act(async () => {
      await Promise.resolve();
    });

    vi.mocked(createNotificationTemplate).mockResolvedValueOnce(withTemplate());
    fireEvent.change(within(dialog).getByLabelText("Subject"), {
      target: { value: "{{title}} đã gộp xong" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(createNotificationTemplate).toHaveBeenCalledTimes(2));
    expect(
      (vi.mocked(createNotificationTemplate).mock.calls[1][1] as Record<string, unknown>)
        .expectedUpdatedAt,
    ).toBe(NEW_UPDATED_AT);
  });

  it("lỗi lưu khi sửa: giữ nội dung đã nhập", async () => {
    vi.mocked(createNotificationTemplate).mockRejectedValue(
      new ApiError(500, "boom"),
    );
    const dialog = await openEditDialog();
    fireEvent.change(within(dialog).getByLabelText("Subject"), {
      target: { value: "Bản của tôi" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await within(dialog).findByRole("alert");
    expect((within(dialog).getByLabelText("Subject") as HTMLTextAreaElement).value).toBe(
      "Bản của tôi",
    );
  });
});

describe("AdminNotificationTemplatesPage: xoá mẫu (UC-111)", () => {
  it("loại bắt buộc: KHÔNG có nút xoá, có chú thích chỉ sửa được", async () => {
    vi.mocked(listNotificationTemplates).mockResolvedValue([
      item({ type: "billing.payment_success", mandatory: true, template: {
        id: TEMPLATE_ID,
        name: "Thanh toán",
        subject: "s",
        bodyTemplate: "b",
        updatedAt: UPDATED_AT,
      } }),
    ]);
    render(<AdminNotificationTemplatesPage />);
    await screen.findByText("billing.payment_success");
    expect(screen.queryByRole("button", { name: "Delete template" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(
      screen.getByText("Mandatory type: its wording can be edited, but not deleted."),
    ).toBeTruthy();
  });

  it("loại không bắt buộc: có nút xoá, bấm ra hộp xác nhận", async () => {
    render(<AdminNotificationTemplatesPage />);
    await screen.findByText("pr.merged");
    fireEvent.click(screen.getByRole("button", { name: "Delete template" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete this template")).toBeTruthy();
    expect(within(dialog).getByText(/default wording again/)).toBeTruthy();
  });

  it("hộp xác nhận nói rõ quay về wording mặc định, thông báo đã gửi không đổi", async () => {
    render(<AdminNotificationTemplatesPage />);
    await screen.findByText("pr.merged");
    fireEvent.click(screen.getByRole("button", { name: "Delete template" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain(
      "The type will use the default wording again. Notifications already sent are not changed.",
    );
  });

  it("xác nhận thì gọi API xoá, đóng hộp, hiện toast, tải lại danh sách", async () => {
    vi.mocked(deleteNotificationTemplate).mockResolvedValue(undefined);
    render(<AdminNotificationTemplatesPage />);
    await screen.findByText("pr.merged");
    fireEvent.click(screen.getByRole("button", { name: "Delete template" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteNotificationTemplate).toHaveBeenCalledWith("pr.merged"));
    expect(
      await screen.findByText(
        "Template deleted. The type now uses the default wording.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(listNotificationTemplates).toHaveBeenCalledTimes(2);
  });

  it("huỷ hộp xác nhận thì KHÔNG gọi API xoá", async () => {
    render(<AdminNotificationTemplatesPage />);
    await screen.findByText("pr.merged");
    fireEvent.click(screen.getByRole("button", { name: "Delete template" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(deleteNotificationTemplate).not.toHaveBeenCalled();
  });

  it("backend từ chối xoá loại bắt buộc (403): hiện lỗi, hộp vẫn mở", async () => {
    vi.mocked(deleteNotificationTemplate).mockRejectedValue(
      new ApiError(403, "Mandatory notification types cannot be deleted"),
    );
    render(<AdminNotificationTemplatesPage />);
    await screen.findByText("pr.merged");
    fireEvent.click(screen.getByRole("button", { name: "Delete template" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await within(dialog).findByRole("alert");
    expect(
      within(dialog).getByRole("alert").textContent,
    ).toContain("Mandatory notification types can't be deleted.");
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});
