"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { RequireAuth } from "../../../components/require-auth";
import { PageHeader } from "../../../components/ui/page-header";
import { Button } from "../../../components/ui/button";
import { Toast } from "../../../components/ui/toast";
import { getNotificationPreferences, setNotificationPreference } from "../../../lib/api-client";
import type { NotificationChannel, NotificationPreference } from "../../../lib/api-client";
import { apiErrorMessage } from "../../../lib/error-message";

const MANDATORY_CATEGORY = "Bảo mật và thanh toán";

function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "border-accent bg-accent" : "border-border-strong bg-surface-muted"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function SettingsView() {
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
      setError(apiErrorMessage(err, "Không tải được cài đặt thông báo."));
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
      setToast(apiErrorMessage(err, "Không lưu được thay đổi. Cài đặt đã được trả về như cũ."));
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
        title="Cài đặt thông báo"
        description="Chọn loại thông báo bạn muốn nhận. Thay đổi được lưu ngay và không ảnh hưởng thông báo đã nhận."
        breadcrumbs={[{ label: "Thông báo", href: "/notifications" }, { label: "Cài đặt" }]}
      />

      {loading && <div className="h-24 animate-pulse rounded-card border border-border bg-surface-subtle" />}

      {!loading && error && (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/30 bg-danger-muted p-4 text-sm text-danger">
          <p>{error}</p>
          <Button variant="secondary" onClick={() => void load()}>
            Thử lại
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
                    Thông báo về bảo mật và thanh toán luôn được gửi để bạn không bỏ lỡ thông tin quan trọng về tài
                    khoản, nên không thể tắt.
                  </p>
                )}
                <div className="overflow-hidden rounded-card border border-border bg-surface">
                  <div className="hidden items-center gap-4 border-b border-border bg-surface-subtle px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-muted sm:flex">
                    <span className="flex-1">Loại thông báo</span>
                    <span className="w-24 text-center">Trong ứng dụng</span>
                    <span className="w-32 text-center">Email (PLACEHOLDER)</span>
                  </div>
                  {rows.map((preference) => (
                    <div
                      key={preference.type}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 text-[13px] font-semibold">{preference.label}</span>
                      <span className="flex w-24 items-center justify-center gap-2">
                        <span className="text-xs text-muted sm:hidden">Trong ứng dụng</span>
                        <Switch
                          checked={preference.channels.in_app}
                          disabled={preference.mandatory}
                          label={`${preference.label}: nhận trong ứng dụng`}
                          onChange={(next) => void toggle(preference, "in_app", next)}
                        />
                      </span>
                      <span className="flex w-32 items-center justify-center gap-2">
                        <span className="text-xs text-muted sm:hidden">Email (PLACEHOLDER)</span>
                        <Switch
                          checked={preference.channels.email}
                          disabled={preference.mandatory}
                          label={`${preference.label}: nhận qua email (PLACEHOLDER, chưa gửi email thật)`}
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
            PLACEHOLDER — hệ thống chưa gửi email thật; lựa chọn email vẫn được lưu cho khi tính năng này sẵn sàng.
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
