"use client";

import { useState } from "react";
import { ApiError } from "../../../lib/api-client";
import { deleteNotificationTemplate } from "../../../lib/admin-notification-templates-api";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { useI18n } from "../../../context/i18n-context";

interface DeleteDialogProps {
  type: string;
  onCancel: () => void;
  onDone: (message: string) => void;
}

/**
 * Hộp xác nhận xoá mẫu. Xoá mẫu **không** sửa thông báo đã gửi — chúng giữ
 * nguyên chữ cũ; chỉ những thông báo **sau này** mới quay về wording mặc định.
 *
 * Backend cũng từ chối xoá loại bắt buộc (403) — giao diện không hiện nút cho
 * loại đó, nhưng quyền thuộc về backend.
 */
export function DeleteDialog({ type, onCancel, onDone }: DeleteDialogProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      await deleteNotificationTemplate(type);
      onDone(t("ntp.deletedToast"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError(t("ntp.deleteForbidden"));
      } else if (err instanceof ApiError && err.status === 404) {
        setError(t("ntp.notFound"));
      } else {
        setError(t("ntp.deleteFail"));
      }
      setLoading(false);
    }
  }

  return (
    <ConfirmDialog
      open
      title={t("ntp.deleteTitle")}
      message={t("ntp.deleteIntro")}
      confirmLabel={t("ntp.deleteConfirm")}
      danger
      loading={loading}
      error={error}
      onConfirm={() => void handleConfirm()}
      onCancel={onCancel}
    />
  );
}
