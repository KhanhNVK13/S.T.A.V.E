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
import { apiErrorMessage } from "../../../lib/error-message";
import { useI18n } from "../../../context/i18n-context";
import { tNow } from "../../../lib/i18n";

const MANDATORY_CATEGORY = "Bảo mật và thanh toán";

function SettingsView() {
  const { t } = useI18n();
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPreferences(await getNotificationPreferences());
    } catch (err) {
      setError(apiErrorMessage(err, tNow("nts.loadFail")));
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
          <p>{error}</p>
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
                <h2 className="mb-1 text-[13px] font-bold">{category}</h2>
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
                      <span className="min-w-0 flex-1 text-[13px] font-semibold">{preference.label}</span>
                      <span className="flex w-24 items-center justify-center gap-2">
                        <span className="text-xs text-muted sm:hidden">{t("nts.colInApp")}</span>
                        <Switch
                          checked={preference.channels.in_app}
                          disabled={preference.mandatory}
                          label={t("nts.inAppLabel", { label: preference.label })}
                          onChange={(next) => void toggle(preference, "in_app", next)}
                        />
                      </span>
                      <span className="flex w-32 items-center justify-center gap-2">
                        <span className="text-xs text-muted sm:hidden">{t("nts.colEmail")}</span>
                        <Switch
                          checked={preference.channels.email}
                          disabled={preference.mandatory}
                          label={t("nts.emailLabel", { label: preference.label })}
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
