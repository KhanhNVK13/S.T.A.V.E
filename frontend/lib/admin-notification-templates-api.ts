import { apiFetch } from "./api-client";
import type {
  NotificationTemplateItem,
  NotificationTemplatePreview,
} from "@stave/shared-types";

/**
 * Backend trả lỗi 400 với danh sách placeholder sai / sai cú pháp trong body
 * để giao diện chỉ ra đúng tên thay vì hiện một thông báo chung.
 */
export interface TemplateValidationError {
  message?: string;
  invalid?: string[];
  malformed?: string[];
}

export async function listNotificationTemplates(): Promise<
  NotificationTemplateItem[]
> {
  return apiFetch<NotificationTemplateItem[]>(
    "/admin/notification-templates",
  );
}

export interface CreateTemplatePayload {
  name: string;
  subject: string;
  bodyTemplate: string;
  /**
   * Khoá đồng thời (UC-111): `updated_at` của mẫu đang mở. Lệch với giá trị
   * hiện tại trong DB → backend trả 409.
   */
  expectedUpdatedAt?: string;
}

export async function createNotificationTemplate(
  type: string,
  payload: CreateTemplatePayload,
): Promise<NotificationTemplateItem> {
  return apiFetch<NotificationTemplateItem>(
    `/admin/notification-templates/${encodeURIComponent(type)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteNotificationTemplate(
  type: string,
): Promise<void> {
  await apiFetch<void>(
    `/admin/notification-templates/${encodeURIComponent(type)}`,
    { method: "DELETE" },
  );
}

export async function previewNotificationTemplate(
  payload: CreateTemplatePayload & { type: string },
): Promise<NotificationTemplatePreview> {
  return apiFetch<NotificationTemplatePreview>(
    "/admin/notification-templates/preview",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
