"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { use } from "react";
import { RequireAuth } from "../../../../components/require-auth";
import { useAuth } from "../../../../context/auth-context";
import {
  adminGetJamEvent,
  adminListJamEvents,
} from "../../../../lib/api-jam";
import { errorSource, renderError, type ErrorSource } from "../../../../lib/error-message";
import type { JamEvent, JamEventListItem } from "@stave/shared-types";
import { PageHeader } from "../../../../components/ui/page-header";
import { EmptyState } from "../../../../components/ui/empty-state";
import { Toast } from "../../../../components/ui/toast";
import {
  JamEventControlPanel,
} from "../../../../components/admin/jam/jam-event-control-panel";
import { useI18n } from "../../../../context/i18n-context";
import { tNow } from "../../../../lib/i18n";

/**
 * UC-95 — trang điều khiển quản trị 1 sự kiện Jam (admin-only phía
 * server, triple guard). 1.E3: người không phải admin thấy cảnh báo "không
 * có quyền". Nút "Kết thúc sự kiện" mở hộp xác nhận rồi gọi
 * `POST /admin/jam-events/:id/end` (hoặc alias `jam/events`).
 */
export default function AdminJamEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <RequireAuth>
      <AdminJamEventContent params={params} />
    </RequireAuth>
  );
}

function AdminJamEventContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t } = useI18n();
  const { id } = use(params);
  const { profile, loading } = useAuth();

  const [event, setEvent] = useState<JamEvent | null>(null);
  const [online, setOnline] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<ErrorSource | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingEvent(true);
    setLoadError(null);
    try {
      // Chi tiết + số người online (1 dòng trong listing) — 2 lần gọi nhẹ,
      // số liệu "đang online" có thể vắng (phòng chưa hydrate) → null.
      const [detail, items] = await Promise.all([
        adminGetJamEvent(id),
        adminListJamEvents().catch(() => [] as JamEventListItem[]),
      ]);
      setEvent(detail);
      setOnline(items.find((e: JamEventListItem) => e.id === id)?.currentParticipantCount ?? 0);
    } catch (err) {
      // 3.E1 (404): sự kiện không tồn tại → empty state "Quay lại danh sách".
      setEvent(null);
      setLoadError(errorSource(err, "aj.ctlLoadFail"));
    } finally {
      setLoadingEvent(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  const handleEnded = useCallback((endedId: string) => {
    setDoneMessage(tNow("aj.ctlEnded"));
    setEvent((prev) =>
      prev && prev.id === endedId
        ? {
            ...prev,
            status: "ended" as const,
            ended_at: new Date().toISOString(),
          }
        : prev,
    );
  }, []);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: t("aj.crumb") }, { label: t("aj.ctlCrumb") }]}
        title={t("aj.ctlTitle")}
        description={t("aj.ctlDescription")}
      />
      {loading ? (
        <p className="text-sm text-muted">{t("ui.loading")}</p>
      ) : profile?.role !== "admin" ? (
        <EmptyState
          icon={ShieldAlert}
          title={t("aj.noAdminTitle")}
          description={t("aj.noAdminBody")}
        />
      ) : (
        <JamEventControlPanel
          event={
            event && online !== null
              ? { ...event, currentParticipantCount: online }
              : event
          }
          loadError={renderError(loadError)}
          onRetry={() => void load()}
          loading={loadingEvent}
          onEnded={handleEnded}
        />
      )}
      {doneMessage && (
        <Toast
          message={doneMessage}
          variant="success"
          onDismiss={() => setDoneMessage(null)}
        />
      )}
    </div>
  );
}
