"use client";

import { useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import type { NotificationTemplateInfo } from "@stave/shared-types";
import { PageHeader } from "../../../components/ui/page-header";
import { RowHeader, RowItem, RowList } from "../../../components/ui/row-list";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { EmptyState } from "../../../components/ui/empty-state";
import { Toast } from "../../../components/ui/toast";
import { deleteNotificationTemplate, listNotificationTemplates } from "../../../lib/admin-notification-templates-api";
import { useApiResource } from "../../../lib/use-api-resource";
import { useI18n } from "../../../context/i18n-context";
import type { TKey } from "../../../lib/i18n";
import { TemplateEditorDialog } from "./template-editor-dialog";

const COLS = "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_120px_auto]";

const CATEGORY_KEYS: Record<string, TKey> = {
  billing: "ntpl.cat.billing",
  collab: "ntpl.cat.collab",
  comment: "ntpl.cat.comment",
  fork: "ntpl.cat.fork",
  jam: "ntpl.cat.jam",
  moderation: "ntpl.cat.moderation",
  pr: "ntpl.cat.pr",
  report: "ntpl.cat.report",
  security: "ntpl.cat.security",
};

function categoryOf(type: string, t: (key: TKey) => string): string {
  const key = CATEGORY_KEYS[type.split(".")[0]];
  return key ? t(key) : t("ntpl.cat.other");
}

export default function AdminNotificationTemplatesPage() {
  const { t } = useI18n();
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<NotificationTemplateInfo | null>(null);
  const [resetting, setResetting] = useState<NotificationTemplateInfo | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error } = useApiResource(listNotificationTemplates, [reload], t("ntpl.loadFail"));

  async function confirmReset() {
    if (!resetting) return;
    setResetBusy(true);
    setResetError(null);
    try {
      await deleteNotificationTemplate(resetting.type);
      setResetting(null);
      setNotice(t("ntpl.resetDone"));
      setReload((n) => n + 1);
    } catch {
      setResetError(t("ntpl.errReset"));
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={t("ntpl.title")} description={t("ntpl.description")} />

      {loading ? (
        <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent" /> {t("ui.loading")}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-sm text-danger"
        >
          <span>{error}</span>
          <Button variant="secondary" onClick={() => setReload((n) => n + 1)}>
            {t("ui.retry")}
          </Button>
        </div>
      ) : data && data.length === 0 ? (
        <EmptyState icon={BellRing} title={t("ntpl.emptyTitle")} description={t("ntpl.emptyDesc")} />
      ) : data ? (
        <RowList cols={COLS}>
          <RowHeader>
            <span>{t("ntpl.colType")}</span>
            <span>{t("ntpl.colCategory")}</span>
            <span>{t("ntpl.colStatus")}</span>
            <span />
          </RowHeader>
          {data.map((template) => (
            <RowItem key={template.type}>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-mono text-xs">{template.type}</span>
                <span className="truncate text-[13px] text-muted">
                  {template.custom?.name || template.defaultSubject}
                </span>
              </div>
              <span className="truncate text-[13px] text-muted">{categoryOf(template.type, t)}</span>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant={template.custom ? "info" : "neutral"}>
                  {template.custom ? t("ntpl.statusCustom") : t("ntpl.statusDefault")}
                </Badge>
                {template.mandatory && <Badge variant="warning">{t("ntpl.statusRequired")}</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <Button
                  variant="secondary"
                  onClick={() => setEditing(template)}
                  aria-label={`${template.custom ? t("ntpl.edit") : t("ntpl.create")}: ${template.type}`}
                >
                  {template.custom ? t("ntpl.edit") : t("ntpl.create")}
                </Button>
                {template.custom && !template.mandatory && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setResetError(null);
                      setResetting(template);
                    }}
                    aria-label={`${t("ntpl.reset")}: ${template.type}`}
                  >
                    {t("ntpl.reset")}
                  </Button>
                )}
              </div>
            </RowItem>
          ))}
        </RowList>
      ) : null}

      {editing && (
        <TemplateEditorDialog
          key={editing.type}
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={(created) => {
            setEditing(null);
            setNotice(created ? t("ntpl.createdDone") : t("ntpl.savedDone"));
            setReload((n) => n + 1);
          }}
        />
      )}

      <ConfirmDialog
        open={resetting !== null}
        danger
        title={t("ntpl.resetTitle")}
        message={t("ntpl.resetMsg", { type: resetting?.type ?? "" })}
        confirmLabel={t("ntpl.reset")}
        loading={resetBusy}
        error={resetError}
        onConfirm={confirmReset}
        onCancel={() => setResetting(null)}
      />

      {notice && <Toast message={notice} variant="success" onDismiss={() => setNotice(null)} />}
    </div>
  );
}
