"use client";

import { useCallback, useEffect, useState } from "react";
import type { NotificationTemplateItem } from "@stave/shared-types";
import { PageHeader } from "../../../components/ui/page-header";
import { RowList, RowHeader, RowItem } from "../../../components/ui/row-list";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Toast } from "../../../components/ui/toast";
import { listNotificationTemplates } from "../../../lib/admin-notification-templates-api";
import type { TKey } from "../../../lib/i18n";
import { apiErrorMessage } from "../../../lib/error-message";
import { useI18n } from "../../../context/i18n-context";
import { TemplateDialog } from "./template-dialog";
import { DeleteDialog } from "./delete-dialog";

/** Loại | danh mục | placeholder | trạng thái | thao tác. */
const COLS = "md:grid-cols-[minmax(0,1.6fr)_160px_minmax(0,1fr)_140px_180px]";

/**
 * Danh mục trả về danh mục tiếng Việt ghi cứng ở backend, nên giao diện tự
 * suy ra khoá i18n từ tiền tố của loại thông báo.
 */
const CATEGORY_KEYS: Record<string, TKey> = {
  collab: "ntp.category.collab",
  comment: "ntp.category.comment",
  fork: "ntp.category.fork",
  pr: "ntp.category.pullRequest",
  jam: "ntp.category.jam",
  security: "ntp.category.billing",
  billing: "ntp.category.billing",
  moderation: "ntp.category.moderation",
  report: "ntp.category.report",
};

function categoryKey(type: string): TKey {
  const prefix = type.split(".")[0];
  return CATEGORY_KEYS[prefix] ?? "ntp.category.collab";
}

export default function AdminNotificationTemplatesPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<NotificationTemplateItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  /** Loại đang mở hộp tạo/sửa. */
  const [editing, setEditing] = useState<NotificationTemplateItem | null>(null);
  /** Loại đang mở hộp xoá. */
  const [deleting, setDeleting] = useState<NotificationTemplateItem | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listNotificationTemplates();
      setItems(data);
    } catch (err) {
      setError(apiErrorMessage(err, t("ntp.loadFail")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  /**
   * Tải lại danh sách sau khi gặp 409 đồng thời và trả về mẫu mới nhất của
   * loại đang mở, để hộp dùng `updated_at` mới cho lần lưu kế tiếp.
   */
  const reloadTemplate = useCallback(
    async (type: string) => {
      setError(null);
      try {
        const data = await listNotificationTemplates();
        setItems(data);
        return data.find((entry) => entry.type === type)?.template ?? undefined;
      } catch (err) {
        setError(apiErrorMessage(err, t("ntp.loadFail")));
        return undefined;
      }
    },
    [t],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải danh sách lần đầu khi mở trang
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: t("ntp.crumb") }]}
        title={t("ntp.title")}
        description={t("ntp.description")}
      />

      {doneMessage && (
        <Toast
          message={doneMessage}
          variant="success"
          onDismiss={() => setDoneMessage(null)}
        />
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-xs text-danger"
        >
          <span>{error}</span>
          <Button variant="secondary" onClick={() => void load()}>
            {t("ui.retry")}
          </Button>
        </div>
      )}

      <div className="mt-3">
        <RowList cols={COLS}>
          <RowHeader>
            <span>{t("ntp.colType")}</span>
            <span>{t("ntp.colCategory")}</span>
            <span>{t("ntp.colPlaceholders")}</span>
            <span>{t("ntp.colStatus")}</span>
            <span />
          </RowHeader>

          {items?.map((item) => (
            <RowItem key={item.type}>
              <div className="min-w-0">
                <p className="truncate font-mono text-[13px] font-semibold">
                  {item.type}
                </p>
                {item.mandatory && (
                  <p className="mt-0.5 text-xs text-muted">
                    {t("ntp.mandatory")}
                  </p>
                )}
              </div>
              <span className="truncate text-xs text-muted">
                {t(categoryKey(item.type))}
              </span>
              <span className="flex flex-wrap gap-1">
                {item.placeholders.map((placeholder) => (
                  <code
                    key={placeholder}
                    className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted"
                  >
                    {`{{${placeholder}}}`}
                  </code>
                ))}
              </span>
              <span>
                {item.template ? (
                  <Badge variant="success">{t("ntp.statusCustom")}</Badge>
                ) : (
                  <Badge variant="neutral">{t("ntp.statusDefault")}</Badge>
                )}
              </span>
              <div className="flex items-center gap-2 md:justify-end">
                {item.template ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => setEditing(item)}
                    >
                      {t("ntp.edit")}
                    </Button>
                    {/* Loại bắt buộc không có nút xoá; backend cũng từ chối (403). */}
                    {!item.mandatory ? (
                      <Button
                        variant="secondary"
                        onClick={() => setDeleting(item)}
                      >
                        {t("ntp.delete")}
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted">
                        {t("ntp.mandatoryNoDelete")}
                      </span>
                    )}
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => setEditing(item)}
                  >
                    {t("ntp.create")}
                  </Button>
                )}
              </div>
            </RowItem>
          ))}

          {loading && !items && (
            <p role="status" className="px-4 py-8 text-center text-[13px] text-muted">
              {t("ui.loading")}
            </p>
          )}

          {items && items.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-muted">
              {t("ntp.noResults")}
            </p>
          )}
        </RowList>
      </div>

      {editing && (
        <TemplateDialog
          type={editing.type}
          placeholders={editing.placeholders}
          existing={editing.template}
          onCancel={() => setEditing(null)}
          onDone={(message) => {
            setEditing(null);
            setDoneMessage(message);
            void load();
          }}
          onReload={() => {
            // 409 đồng thời: tải lại bảng mẫu nhưng giữ hộp đang mở và giữ
            // chữ người dùng vừa nhập để họ so sánh.
            return reloadTemplate(editing.type);
          }}
        />
      )}

      {deleting && (
        <DeleteDialog
          type={deleting.type}
          onCancel={() => setDeleting(null)}
          onDone={(message) => {
            setDeleting(null);
            setDoneMessage(message);
            void load();
          }}
        />
      )}
    </div>
  );
}
