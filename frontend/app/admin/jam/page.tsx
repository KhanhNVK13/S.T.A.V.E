"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, ShieldAlert } from "lucide-react";
import { RequireAuth } from "../../../components/require-auth";
import { useAuth } from "../../../context/auth-context";
import {
  adminCancelJamEvent,
  adminGetAvailableJamProjects,
  adminGetJamEvent,
  adminListJamEvents,
} from "../../../lib/api-jam";
import { listPublicProjects } from "../../../lib/api-client";
import { apiErrorMessage } from "../../../lib/error-message";
import type {
  AvailableJamProjectDto,
  JamEvent,
  JamEventListItem,
  JamEventStatus,
} from "@stave/shared-types";
import { AdminJamConfigDialog } from "../../../components/admin/admin-jam-config-dialog";
import { PageHeader } from "../../../components/ui/page-header";
import { RowList, RowHeader, RowItem } from "../../../components/ui/row-list";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import { Dialog, DialogActions, DialogError } from "../../../components/ui/dialog";
import { Toast } from "../../../components/ui/toast";
import { formatDateTime } from "../../../lib/format-date";

// ── helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: JamEventStatus }) {
  if (status === "active")
    return <Badge variant="success">Đang diễn ra</Badge>;
  if (status === "scheduled")
    return <Badge variant="info">Sắp diễn ra</Badge>;
  if (status === "cancelled")
    return <Badge variant="danger">Đã huỷ</Badge>;
  return <Badge variant="neutral">Đã kết thúc</Badge>;
}

const STATUS_TABS: { key: JamEventStatus | ""; label: string }[] = [
  { key: "", label: "Tất cả" },
  { key: "scheduled", label: "Sắp diễn ra" },
  { key: "active", label: "Đang diễn ra" },
  { key: "ended", label: "Đã kết thúc" },
  { key: "cancelled", label: "Đã huỷ" },
];

// ── cancel confirm dialog ───────────────────────────────────────────────────

function CancelJamDialog({
  event,
  onClose,
  onCancelled,
}: {
  event: JamEvent;
  onClose: () => void;
  onCancelled: (message: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      await adminCancelJamEvent(event.id);
      onCancelled(
        `Đã hủy sự kiện “${event.name}”. Hệ thống đã gửi thông báo đến người tham gia.`,
      );
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Không hủy được sự kiện."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title={`Hủy “${event.name}”?`}
      titleClassName="text-foreground text-base"
      onClose={onClose}
      closeDisabled={submitting}
      role="alertdialog"
      className="max-w-sm p-6"
    >
      <p className="mb-3 text-[13px] text-muted">
        Sự kiện sẽ chuyển sang trạng thái <strong>Đã hủy</strong> và mọi
        người đăng ký nhận thông báo <em>jam.cancelled</em>. Thao tác được
        ghi vào nhật ký quản trị.
      </p>
      <DialogError message={error} />
      <DialogActions>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Đóng
        </Button>
        <Button
          variant="danger"
          onClick={() => void handleConfirm()}
          disabled={submitting}
        >
          {submitting ? "Đang hủy…" : "Hủy sự kiện"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── main page ───────────────────────────────────────────────────────────────

const JAM_COLS = "md:grid-cols-[minmax(0,1fr)_120px_190px_88px_auto]";

function AdminJamManager() {
  const [tab, setTab] = useState<JamEventStatus | "">("");
  const [events, setEvents] = useState<JamEventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<JamEvent | null>(null);
  const [cancelling, setCancelling] = useState<JamEvent | null>(null);
  const [projects, setProjects] = useState<AvailableJamProjectDto[]>([]);

  const load = useCallback(async (status: JamEventStatus | "") => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminListJamEvents(status || undefined);
      setEvents(data);
    } catch (err) {
      setError(apiErrorMessage(err, "Không tải được danh sách sự kiện."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await adminListJamEvents(tab || undefined);
        if (active) {
          setEvents(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(apiErrorMessage(err, "Không tải được danh sách sự kiện."));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [tab]);

  // Public candidate projects for the "starting project" picker (BR-106).
  useEffect(() => {
    void adminGetAvailableJamProjects()
      .then((items) => setProjects(items))
      .catch(() => {
        // Fallback to general public projects if available-projects endpoint fails
        void listPublicProjects({ page: 1, limit: 50 })
          .then((res) =>
            setProjects(res.items.map((p) => ({ id: p.id, name: p.name }))),
          )
          .catch(() => {
            /* picker degrades to empty list */
          });
      });
  }, []);

  const openConfigure = async (row: JamEventListItem) => {
    // Fresh copy from the admin endpoint (full field values).
    try {
      setConfiguring(await adminGetJamEvent(row.id));
    } catch (err) {
      setToast(apiErrorMessage(err, "Không tải được sự kiện."));
    }
  };

  const isMuted = tab === "";
  const visible = isMuted
    ? events
    : events.filter((e) => e.status === tab);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5" role="tablist">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key || "all"}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
              tab === t.key
                ? "bg-accent-muted text-accent"
                : "text-muted hover:bg-surface-subtle"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      {error && (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-xs text-danger"
        >
          <span>{error}</span>
          <Button variant="secondary" onClick={() => void load(tab)}>
            Thử lại
          </Button>
        </div>
      )}

      <div className="mt-3">
        <RowList cols={JAM_COLS}>
          <RowHeader>
            <span>Sự kiện</span>
            <span>Trạng thái</span>
            <span>Khung giờ</span>
            <span>Tham gia</span>
            <span />
          </RowHeader>

          {loading ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted">
              Đang tải…
            </p>
          ) : visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted">
              Không có sự kiện nào ở trạng thái này.
            </p>
          ) : (
            visible.map((e) => (
              <RowItem key={e.id}>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">
                    {e.name}
                  </p>
                  {e.description && (
                    <p className="truncate text-xs text-muted">
                      {e.description}
                    </p>
                  )}
                </div>
                <StatusBadge status={e.status} />
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  {e.scheduled_start_at ? (
                    <CalendarClock className="h-3.5 w-3.5" />
                  ) : null}
                  <span className="tabular-nums">
                    {e.scheduled_start_at
                      ? formatDateTime(e.scheduled_start_at)
                      : "—"}
                    {" → "}
                    {e.scheduled_end_at
                      ? formatDateTime(e.scheduled_end_at)
                      : "mở"}
                  </span>
                </div>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {e.currentParticipantCount}
                </span>
                <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                  <Link href={`/jam/${e.id}`} className="text-xs text-accent hover:underline">
                    Xem
                  </Link>
                  {(e.status === "scheduled" || e.status === "active") && (
                    <>
                      <Button variant="ghost" onClick={() => void openConfigure(e)}>
                        {e.status === "active" ? "Kéo dài" : "Cấu hình"}
                      </Button>
                      {e.status === "scheduled" && (
                        <Button variant="danger" onClick={() => setCancelling(e)}>
                          Huỷ
                        </Button>
                      )}
                    </>
                  )}
                  {e.status === "ended" && (
                    <>
                      <Button variant="ghost" onClick={() => void openConfigure(e)}>
                        Chi tiết
                      </Button>
                      {e.resulting_project_id && (
                        <Link
                          href={`/projects/${e.resulting_project_id}`}
                          className="text-xs text-muted hover:underline"
                        >
                          Kết quả
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </RowItem>
            ))
          )}
        </RowList>
      </div>

      {configuring && (
        <AdminJamConfigDialog
          event={configuring}
          projects={projects}
          onClose={() => setConfiguring(null)}
          onSaved={(message) => {
            setToast(message);
            void load(tab);
          }}
          onCancelled={(message) => {
            setToast(message);
            void load(tab);
          }}
        />
      )}
      {cancelling && (
        <CancelJamDialog
          event={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={(message) => {
            setToast(message);
            void load(tab);
          }}
        />
      )}
    </div>
  );
}

export default function AdminJamPage() {
  const { profile, loading } = useAuth();

  return (
    <RequireAuth>
      <div className="mx-auto max-w-page px-5 py-8">
        <PageHeader
          breadcrumbs={[{ label: "Quản trị" }]}
          title="Quản lý sự kiện Community Jam"
          description="Cấu hình khung giờ, dự án khởi đầu, thời gian chờ — hoặc huỷ sự kiện sắp diễn ra. Mọi thao tác được ghi vào nhật ký quản trị."
        />
        {loading ? (
          <p className="text-sm text-muted">Đang tải…</p>
        ) : profile?.role !== "admin" ? (
          <EmptyState
            icon={ShieldAlert}
            title="Không có quyền truy cập"
            description="Bạn không có quyền truy cập trang này."
          />
        ) : (
          <AdminJamManager />
        )}
      </div>
    </RequireAuth>
  );
}
