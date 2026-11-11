import type { NotificationTemplateInfo, NotificationTemplatePreview } from "@stave/shared-types";
import { apiFetch } from "./api-client";

const BASE = "/admin/notification-templates";

export function listNotificationTemplates(): Promise<NotificationTemplateInfo[]> {
  return apiFetch<NotificationTemplateInfo[]>(BASE);
}

export function saveNotificationTemplate(
  type: string,
  body: { name: string; subject: string; body: string },
): Promise<{ created: boolean }> {
  return apiFetch<{ created: boolean }>(`${BASE}/${encodeURIComponent(type)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteNotificationTemplate(type: string): Promise<void> {
  await apiFetch<unknown>(`${BASE}/${encodeURIComponent(type)}`, { method: "DELETE" });
}

export function previewNotificationTemplate(body: {
  type: string;
  subject: string;
  body: string;
}): Promise<NotificationTemplatePreview> {
  return apiFetch<NotificationTemplatePreview>(`${BASE}/preview`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
