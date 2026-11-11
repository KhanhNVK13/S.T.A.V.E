"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { RequireAuth } from "../../../components/require-auth";
import { PageHeader } from "../../../components/ui/page-header";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { Toast } from "../../../components/ui/toast";
import { getNotificationPreferences, setNotificationPreference } from "../../../lib/api-client";
import type { NotificationChannel, NotificationPreference } from "../../../lib/api-client";
import { apiErrorMessage, errorSource, renderError, type ErrorSource } from "../../../lib/error-message";
import { useI18n } from "../../../context/i18n-context";
import { tNow, type TKey } from "../../../lib/i18n";

const MANDATORY_CATEGORY = "Bảo mật và thanh toán";

const CATEGORY_KEYS: Record<string, TKey> = {
  "Cộng tác": "nts.cat.collab",
  "Bình luận": "nts.cat.comments",
  Fork: "nts.cat.forks",
  "Pull request": "nts.cat.pullRequests",
  "Sự kiện Jam": "nts.cat.jam",
  "Bảo mật và thanh toán": "nts.cat.securityBilling",
  "Kiểm duyệt": "nts.cat.moderation",
  "Báo cáo": "nts.cat.reports",
};

const TYPE_KEYS: Record<string, TKey> = {
  "collab.invite": "nts.type.collab.invite",
  "collab.invite_accepted": "nts.type.collab.invite_accepted",
  "collab.invite_declined": "nts.type.collab.invite_declined",
  "collab.permission_changed": "nts.type.collab.permission_changed",
  "collab.access_removed": "nts.type.collab.access_removed",
  "comment.new": "nts.type.comment.new",
  "comment.reply": "nts.type.comment.reply",
  "fork.created": "nts.type.fork.created",
  "pr.opened": "nts.type.pr.opened",
  "pr.comment": "nts.type.pr.comment",
  "pr.merged": "nts.type.pr.merged",
  "pr.closed": "nts.type.pr.closed",
  "jam.started": "nts.type.jam.started",
  "jam.ended": "nts.type.jam.ended",
  "jam.end_extended": "nts.type.jam.end_extended",
  "jam.cancelled": "nts.type.jam.cancelled",
  "billing.payment_success": "nts.type.billing.payment_success",
  "billing.payment_failed": "nts.type.billing.payment_failed",
  "billing.plan_changed": "nts.type.billing.plan_changed",
  "billing.canceled": "nts.type.billing.canceled",
  "billing.renewal_due": "nts.type.billing.renewal_due",
  "billing.price_change": "nts.type.billing.price_change",
  "billing.issue_resolved": "nts.type.billing.issue_resolved",
  "security.google_connected": "nts.type.security.google_connected",
  "security.google_disconnected": "nts.type.security.google_disconnected",
  "moderation.project_removed": "nts.type.moderation.project_removed",
  "moderation.project_restored": "nts.type.moderation.project_restored",
  "report.reviewed": "nts.type.report.reviewed",
};

function SettingsView() {
  const { t } = useI18n();
  const typeLabel = (preference: NotificationPreference) =>
    TYPE_KEYS[preference.type] ? t(TYPE_KEYS[preference.type]) : preference.label;
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorSource | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPreferences(await getNotificationPreferences());
    } catch (err) {
      setError(errorSource(err, "nts.loadFail"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp cài đặt lần đầu
    void load();
  }, [load]);

  function setLocal(type: string, channel: NotificationChannel, enabled: boolean) {
    setPreferences((current) =>
      current.map((entry) =>
        entry.type === type ? { ...entry, channels: { ...entry.channels, [channel]: enabled } } : entry,
      ),
    );
  }

  async function toggle(preference: NotificationPreference, channel: NotificationChannel, enabled: boolean) {
    const key = `${preference.type}|${channel}`;
    if (pending.has(key)) return;
    setPending((current) => new Set(current).add(key));
    setLocal(preference.type, channel, enabled);
    try {
      await setNotificationPreference({ type: preference.type, channel, enabled });
    } catch (err) {
      setLocal(preference.type, channel, !enabled);
      setToast(apiErrorMessage(err, tNow("nts.saveFail")));
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  const categories: string[] = [];
  for (const entry of preferences) {
    if (!categories.includes(entry.category)) categories.push(entry.category);
  }

  return (
    <div className="mx-auto min-h-full max-w-3xl px-5 py-8">
      <PageHeader
        title={t("nt.settings")}
        description={t("nts.description")}
        breadcrumbs={[{ label: t("nt.title"), href: "/notifications" }, { label: t("nts.crumb") }]}
      />

      {loading && <div className="h-24 animate-pulse rounded-card border border-border bg-surface-subtle" />}

      {!loading && error && (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/30 bg-danger-muted p-4 text-sm text-danger">
          <p>{renderError(error)}</p>
          <Button variant="secondary" onClick={() => void load()}>
            {t("ui.retry")}
          </Button>
        </div>
      )}

      {!loading && !error && (
        <div className="flex flex-col gap-6">
          {categories.map((category) => {
            const mandatory = category === MANDATORY_CATEGORY;
            const rows = preferences.filter((entry) => entry.category === category);
            return (
              <section key={category}>
                <h2 className="mb-1 text-[13px] font-bold">{CATEGORY_KEYS[category] ? t(CATEGORY_KEYS[category]) : category}</h2>
                {mandatory && (
                  <p className="mb-2 flex items-start gap-1.5 text-xs text-muted">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t("nts.mandatory")}
                  </p>
                )}
                <div className="overflow-hidden rounded-card border border-border bg-surface">
                  <div className="hidden items-center gap-4 border-b border-border bg-surface-subtle px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-muted sm:flex">
                    <span className="flex-1">{t("nts.colType")}</span>
                    <span className="w-24 text-center">{t("nts.colInApp")}</span>
                    <span className="w-32 text-center">{t("nts.colEmail")}</span>
                  </div>
                  {rows.map((preference) => (
                    <div
                      key={preference.type}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 text-[13px] font-semibold">{typeLabel(preference)}</span>
                      <span className="flex w-24 items-center justify-center gap-2">
                        <span className="text-xs text-muted sm:hidden">{t("nts.colInApp")}</span>
                        <Switch
                          checked={preference.channels.in_app}
                          disabled={preference.mandatory}
                          label={t("nts.inAppLabel", { label: typeLabel(preference) })}
                          onChange={(next) => void toggle(preference, "in_app", next)}
                        />
                      </span>
                      <span className="flex w-32 items-center justify-center gap-2">
                        <span className="text-xs text-muted sm:hidden">{t("nts.colEmail")}</span>
                        <Switch
                          checked={preference.channels.email}
                          disabled={preference.mandatory}
                          label={t("nts.emailLabel", { label: typeLabel(preference) })}
                          onChange={(next) => void toggle(preference, "email", next)}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          <p className="text-xs text-muted">
            {t("nts.placeholder")}
          </p>
        </div>
      )}

      {toast && <Toast message={toast} variant="danger" onDismiss={dismissToast} />}
    </div>
  );
}

export default function NotificationSettingsPage() {
  return (
    <RequireAuth>
      <SettingsView />
    </RequireAuth>
  );
}
