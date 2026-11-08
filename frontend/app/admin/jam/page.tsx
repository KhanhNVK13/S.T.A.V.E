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
import { EndJamConfirmModal } from "../../../components/admin/jam/end-jam-confirm-modal";
import { PageHeader } from "../../../components/ui/page-header";
import { RowList, RowHeader, RowItem } from "../../../components/ui/row-list";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Tabs } from "../../../components/ui/tabs";
import { EmptyState } from "../../../components/ui/empty-state";
import { Dialog, DialogActions, DialogError } from "../../../components/ui/dialog";
import { Toast } from "../../../components/ui/toast";
import { formatDateTime } from "../../../lib/format-date";
import { useI18n } from "../../../context/i18n-context";
import { tNow, type TKey } from "../../../lib/i18n";

// ── helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: JamEventStatus }) {
  const { t } = useI18n();
  if (status === "active")
    return <Badge variant="success">{t("aj.live")}</Badge>;
  if (status === "scheduled")
    return <Badge variant="info">{t("aj.upcoming")}</Badge>;
  if (status === "cancelled")
    return <Badge variant="danger">{t("aj.cancelled")}</Badge>;
  return <Badge variant="neutral">{t("aj.ended")}</Badge>;
}

const STATUS_TABS: { key: JamEventStatus | ""; label: TKey }[] = [
  { key: "", label: "aj.all" },
  { key: "scheduled", label: "aj.upcoming" },
  { key: "active", label: "aj.live" },
  { key: "ended", label: "aj.ended" },
  { key: "cancelled", label: "aj.cancelled" },
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
  const { t, tx } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      await adminCancelJamEvent(event.id);
      onCancelled(
        t("aj.cancelDone", { name: event.name }),
      );
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t("aj.cancelFail")));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title={t("aj.cancelTitle", { name: event.name })}
      titleClassName="text-foreground text-base"
      onClose={onClose}
      closeDisabled={submitting}
      role="alertdialog"
      className="max-w-sm p-6"
    >
      <p className="mb-3 text-[13px] text-muted">
        {tx("aj.cancelBody", { cancelled: <strong>{t("aj.cancelledWord")}</strong>, code: <em>jam.cancelled</em> })}
      </p>
      <DialogError message={error} />
      <DialogActions>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          {t("aj.close")}
        </Button>
        <Button
          variant="danger"
          onClick={() => void handleConfirm()}
          disabled={submitting}
        >
          {submitting ? t("aj.cancelling") : t("aj.cancelEvent")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── main page ───────────────────────────────────────────────────────────────

const JAM_COLS = "md:grid-cols-[minmax(0,1fr)_120px_190px_88px_auto]";

function AdminJamManager() {
  const { t } = useI18n();
  const [tab, setTab] = useState<JamEventStatus | "">("");
  const [events, setEvents] = useState<JamEventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<JamEvent | null>(null);
  const [cancelling, setCancelling] = useState<JamEvent | null>(null);
  const [ending, setEnding] = useState<JamEvent | null>(null);
  const [endingCount, setEndingCount] = useState(0);
  const [projects, setProjects] = useState<AvailableJamProjectDto[]>([]);

  const load = useCallback(async (status: JamEventStatus | "") => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminListJamEvents(status || undefined);
      setEvents(data);
    } catch (err) {
      setError(apiErrorMessage(err, tNow("aj.listFail")));
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
          setError(apiErrorMessage(err, tNow("aj.listFail")));
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
      setToast(apiErrorMessage(err, tNow("aj.eventFail")));
    }
  };

  const openEnd = async (row: JamEventListItem) => {
    // UC-95 — fetch the full event + keep the row's live participant count
    // for the "đang có N người đang sửa" warning (1.1 duc.md).
    try {
      const detail = await adminGetJamEvent(row.id);
      setEnding(detail);
      setEndingCount(row.currentParticipantCount ?? 0);
    } catch (err) {
      setToast(apiErrorMessage(err, tNow("aj.eventFail")));
    }
  };

  const isMuted = tab === "";
  const visible = isMuted
    ? events
    : events.filter((e) => e.status === tab);

  return (
    <div>
      <Tabs
        tabs={STATUS_TABS.map((st) => ({ id: st.key || "all", label: t(st.label) }))}
        active={tab || "all"}
        onChange={(id) => setTab(id === "all" ? "" : (id as JamEventStatus))}
      />

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      {error && (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-xs text-danger"
        >
          <span>{error}</span>
          <Button variant="secondary" onClick={() => void load(tab)}>
            {t("ui.retry")}
          </Button>
        </div>
      )}

      <div className="mt-3">
        <RowList cols={JAM_COLS}>
          <RowHeader>
            <span>{t("aj.colEvent")}</span>
            <span>{t("aj.colStatus")}</span>
            <span>{t("aj.colWindow")}</span>
            <span>{t("aj.colJoined")}</span>
            <span />
          </RowHeader>

          {loading ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted">
              {t("ui.loading")}
            </p>
          ) : visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted">
              {t("aj.noneInStatus")}
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
                      : t("aj.open")}
                  </span>
                </div>
                <span className="font-mono text-xs tabular-nums text-muted">
                  <span className="font-sans md:hidden">{t("aj.colJoined")}: </span>
                  {e.currentParticipantCount}
                </span>
                <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                  <Link href={`/jam/${e.id}`} className="text-xs text-accent hover:underline">
                    {t("aj.view")}
                  </Link>
                  {(e.status === "scheduled" || e.status === "active") && (
                    <>
                      <Button variant="ghost" onClick={() => void openConfigure(e)}>
                        {t("aj.configure")}
                      </Button>
                      {e.status === "scheduled" && (
                        <Button variant="danger" onClick={() => setCancelling(e)}>
                          {t("aj.cancel")}
                        </Button>
                      )}
                      {e.status === "active" && (
                        <Button
                          variant="danger"
                          onClick={() => void openEnd(e)}
                        >
                          {t("aj.endEvent")}
                        </Button>
                      )}
                    </>
                  )}
                  {e.status === "ended" && (
                    <>
                      <Button variant="ghost" onClick={() => void openConfigure(e)}>
                        {t("aj.details")}
                      </Button>
                      {e.resulting_project_id && (
                        <Link
                          href={`/projects/${e.resulting_project_id}`}
                          className="text-xs text-muted hover:underline"
                        >
                          {t("aj.result")}
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
      {ending && (
        <EndJamConfirmModal
          event={ending}
          participantCount={endingCount}
          onClosed={() => setEnding(null)}
          onEnded={() => {
            setEnding(null);
            setToast(t("aj.endedToast"));
            void load(tab);
          }}
        />
      )}
    </div>
  );
}

export default function AdminJamPage() {
  const { t } = useI18n();
  const { profile, loading } = useAuth();

  return (
    <RequireAuth>
      <div>
        <PageHeader
          breadcrumbs={[{ label: t("aj.crumb") }]}
          title={t("aj.title")}
          description={t("aj.description")}
        />
        {loading ? (
          <p className="text-sm text-muted">{t("ui.loading")}</p>
        ) : profile?.role !== "admin" ? (
          <EmptyState
            icon={ShieldAlert}
            title={t("aj.noAccessTitle")}
            description={t("aj.noAccessBody")}
          />
        ) : (
          <AdminJamManager />
        )}
      </div>
    </RequireAuth>
  );
}
