"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Settings as SettingsIcon } from "lucide-react";
import { RequireAuth } from "../../components/require-auth";
import { NOTIFICATIONS_CHANGED_EVENT } from "../../components/notification-bell";
import { PageHeader } from "../../components/ui/page-header";
import { Button } from "../../components/ui/button";
import { Tabs } from "../../components/ui/tabs";
import { EmptyState } from "../../components/ui/empty-state";
import { Toast } from "../../components/ui/toast";
import {
  listNotifications,
  markAllNotificationsRead,
  openNotification,
} from "../../lib/api-client";
import type { NotificationFilter, NotificationItem } from "../../lib/api-client";
import { apiErrorMessage } from "../../lib/error-message";
import { formatRelativeTime } from "../../lib/format-date";
import { tNow, type TKey } from "../../lib/i18n";
import { useI18n } from "../../context/i18n-context";

const FILTER_TABS: Array<{ id: NotificationFilter; label: TKey }> = [
  { id: "all", label: "nt.tabAll" },
  { id: "unread", label: "nt.tabUnread" },
  { id: "mentions", label: "nt.tabMentions" },
];

const EMPTY_TEXT: Record<NotificationFilter, { title: TKey; description: TKey }> = {
  all: { title: "nt.emptyAllTitle", description: "nt.emptyAllBody" },
  unread: { title: "nt.emptyUnreadTitle", description: "nt.emptyUnreadBody" },
  mentions: { title: "nt.emptyMentionsTitle", description: "nt.emptyMentionsBody" },
};

function NotificationsView() {
  const { t } = useI18n();
  const router = useRouter();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const page = await listNotifications({ filter });
      if (request !== requestRef.current) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setMissing(new Set());
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(apiErrorMessage(err, tNow("nt.loadFail")));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp danh sách khi đổi bộ lọc
    void load();
  }, [load]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await listNotifications({ filter, cursor: nextCursor });
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setToast(apiErrorMessage(err, tNow("nt.moreFail")));
    } finally {
      setLoadingMore(false);
    }
  }

  async function openItem(item: NotificationItem) {
    try {
      const result = await openNotification(item.id);
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id && !entry.read_at ? { ...entry, read_at: new Date().toISOString() } : entry,
        ),
      );
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
      if (!result.ok) {
        setMissing((current) => new Set(current).add(item.id));
        return;
      }
      if (result.href) router.push(result.href);
    } catch (err) {
      setToast(apiErrorMessage(err, tNow("nt.openFail")));
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((current) => current.map((entry) => (entry.read_at ? entry : { ...entry, read_at: now })));
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    } catch (err) {
      setToast(apiErrorMessage(err, tNow("home.markFail")));
    } finally {
      setMarkingAll(false);
    }
  }

  const hasUnread = items.some((entry) => !entry.read_at);
  const allGroups: Array<{ key: string; label: TKey; items: NotificationItem[] }> = [
    { key: "unread", label: "notificationsPage.groupUnread", items: items.filter((entry) => !entry.read_at) },
    { key: "read", label: "notificationsPage.groupRead", items: items.filter((entry) => entry.read_at) },
  ];
  const groups = allGroups.filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto min-h-full max-w-3xl px-5 py-8">
      <PageHeader
        title={t("nt.title")}
        breadcrumbs={[{ label: t("nt.crumb") }]}
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void markAllRead()} disabled={markingAll || !hasUnread}>
              <CheckCheck aria-hidden="true" className="h-3.5 w-3.5" />
              {markingAll ? t("ui.processing") : t("nt.markAll")}
            </Button>
            <Link
              href="/notifications/settings"
              aria-label={t("nt.settings")}
              title={t("nt.settings")}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-surface-subtle hover:text-foreground"
            >
              <SettingsIcon aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <Tabs tabs={FILTER_TABS.map((tb) => ({ id: tb.id, label: t(tb.label) }))} active={filter} onChange={(id) => setFilter(id as NotificationFilter)} />

      <div className="mt-5">
        {loading && <div className="h-16 animate-pulse rounded-card border border-border bg-surface-subtle" />}

        {!loading && error && (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/30 bg-danger-muted p-4 text-sm text-danger">
            <p>{error}</p>
            <Button variant="secondary" onClick={() => void load()}>
              {t("ui.retry")}
            </Button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState icon={Bell} title={t(EMPTY_TEXT[filter].title)} description={t(EMPTY_TEXT[filter].description)} />
        )}

        {!loading && !error && items.length > 0 && (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <section key={group.key} aria-labelledby={`nt-group-${group.key}`}>
                <h2
                  id={`nt-group-${group.key}`}
                  className="mb-2 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.12em] text-muted"
                >
                  {t(group.label)}
                  <span className="font-mono tabular-nums">{group.items.length}</span>
                  <span aria-hidden="true" className="h-px flex-1 bg-border" />
                </h2>
                <ul className="overflow-hidden rounded-card border border-border bg-surface/80">
                  {group.items.map((item) => {
                    const unread = !item.read_at;
                    return (
                      <li
                        key={item.id}
                        className="border-b border-border last:border-b-0"
                      >
                        <button
                          type="button"
                          onClick={() => void openItem(item)}
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-subtle ${
                            unread ? "bg-accent-muted/40" : ""
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                              unread ? "bg-accent ring-4 ring-accent-muted" : "border border-border-strong bg-surface"
                            }`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-3">
                              <span className={`truncate text-[13px] ${unread ? "font-bold" : "font-semibold"}`}>
                                {item.payload.title ?? t("nt.fallback")}
                              </span>
                              <span className="shrink-0 font-mono text-xs text-muted">
                                {formatRelativeTime(item.created_at)}
                              </span>
                            </span>
                            {item.payload.body && (
                              <span className="mt-0.5 block text-[13px] text-muted">{item.payload.body}</span>
                            )}
                            {unread && <span className="sr-only">{t("nt.unreadSr")}</span>}
                            {missing.has(item.id) && (
                              <span role="status" className="mt-1 block text-xs font-semibold text-warning-foreground">
                                {t("nt.gone")}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            {nextCursor && (
              <div className="flex justify-center">
                <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? t("ui.loading") : t("nt.loadMore")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && <Toast message={toast} variant="danger" onDismiss={dismissToast} />}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsView />
    </RequireAuth>
  );
}
