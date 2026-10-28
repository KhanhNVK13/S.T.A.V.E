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
import { APP_LOCALE, formatRelativeTime } from "../../lib/format-date";

const FILTER_TABS: Array<{ id: NotificationFilter; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "unread", label: "Chưa đọc" },
  { id: "mentions", label: "Nhắc đến bạn" },
];

const EMPTY_TEXT: Record<NotificationFilter, { title: string; description: string }> = {
  all: {
    title: "Chưa có thông báo nào.",
    description: "Khi có người mời cộng tác, bình luận hay fork dự án của bạn, thông báo sẽ hiện ở đây.",
  },
  unread: {
    title: "Bạn đã đọc hết thông báo.",
    description: "Thông báo mới sẽ xuất hiện ở đây.",
  },
  mentions: {
    title: "Chưa có ai nhắc đến bạn.",
    description: "Câu trả lời cho bình luận của bạn sẽ hiện ở đây.",
  },
};

function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Hôm nay";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Hôm qua";
  return date.toLocaleDateString(APP_LOCALE, { day: "2-digit", month: "2-digit", year: "numeric" });
}

function groupByDay(items: NotificationItem[]): Array<{ key: string; label: string; items: NotificationItem[] }> {
  const groups: Array<{ key: string; label: string; items: NotificationItem[] }> = [];
  for (const item of items) {
    const key = dayKey(item.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabel(item.created_at), items: [item] });
  }
  return groups;
}

function NotificationsView() {
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
      setError(apiErrorMessage(err, "Không tải được thông báo."));
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
      setToast(apiErrorMessage(err, "Không tải thêm được thông báo."));
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
      setToast(apiErrorMessage(err, "Không mở được thông báo."));
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
      setToast(apiErrorMessage(err, "Không đánh dấu được các thông báo."));
    } finally {
      setMarkingAll(false);
    }
  }

  const hasUnread = items.some((entry) => !entry.read_at);
  const groups = groupByDay(items);

  return (
    <div className="mx-auto min-h-full max-w-3xl px-5 py-8">
      <PageHeader
        title="Thông báo"
        breadcrumbs={[{ label: "Tài khoản" }]}
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void markAllRead()} disabled={markingAll || !hasUnread}>
              <CheckCheck className="h-3.5 w-3.5" />
              {markingAll ? "Đang xử lý…" : "Đánh dấu tất cả đã đọc"}
            </Button>
            <Link
              href="/notifications/settings"
              aria-label="Cài đặt thông báo"
              title="Cài đặt thông báo"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-surface-subtle hover:text-foreground"
            >
              <SettingsIcon className="h-4 w-4" />
            </Link>
          </div>
        }
      />

      <Tabs tabs={FILTER_TABS} active={filter} onChange={(id) => setFilter(id as NotificationFilter)} />

      <div className="mt-5">
        {loading && <div className="h-16 animate-pulse rounded-card border border-border bg-surface-subtle" />}

        {!loading && error && (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/30 bg-danger-muted p-4 text-sm text-danger">
            <p>{error}</p>
            <Button variant="secondary" onClick={() => void load()}>
              Thử lại
            </Button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <EmptyState icon={Bell} title={EMPTY_TEXT[filter].title} description={EMPTY_TEXT[filter].description} />
        )}

        {!loading && !error && items.length > 0 && (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.label}>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">{group.label}</h2>
                <ul className="overflow-hidden rounded-card border border-border bg-surface">
                  {group.items.map((item) => {
                    const unread = !item.read_at;
                    return (
                      <li key={item.id} className="border-b border-border last:border-b-0">
                        <button
                          type="button"
                          onClick={() => void openItem(item)}
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-subtle ${
                            unread ? "bg-accent-muted/40" : ""
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-accent" : "bg-transparent"}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-3">
                              <span className={`truncate text-[13px] ${unread ? "font-bold" : "font-semibold"}`}>
                                {item.payload.title ?? "Thông báo"}
                              </span>
                              <span className="shrink-0 font-mono text-xs text-muted">
                                {formatRelativeTime(item.created_at)}
                              </span>
                            </span>
                            {item.payload.body && (
                              <span className="mt-0.5 block text-[13px] text-muted">{item.payload.body}</span>
                            )}
                            {unread && <span className="sr-only">Chưa đọc</span>}
                            {missing.has(item.id) && (
                              <span role="status" className="mt-1 block text-xs font-semibold text-warning-foreground">
                                Mục này không còn tồn tại.
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
                  {loadingMore ? "Đang tải…" : "Tải thêm"}
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
