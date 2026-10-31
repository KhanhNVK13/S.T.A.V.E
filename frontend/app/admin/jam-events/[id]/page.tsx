"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { use } from "react";
import { RequireAuth } from "../../../../components/require-auth";
import { useAuth } from "../../../../context/auth-context";
import {
  adminEndJamEvent,
  adminGetJamEvent,
  adminListJamEvents,
} from "../../../../lib/api-jam";
import { apiErrorMessage } from "../../../../lib/error-message";
import type { JamEvent, JamEventListItem } from "@stave/shared-types";
import { PageHeader } from "../../../../components/ui/page-header";
import { EmptyState } from "../../../../components/ui/empty-state";
import { Toast } from "../../../../components/ui/toast";
import {
  JamEventControlPanel,
} from "../../../../components/admin/jam/jam-event-control-panel";

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
  const { id } = use(params);
  const { profile, loading } = useAuth();

  const [event, setEvent] = useState<JamEvent | null>(null);
  const [online, setOnline] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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
      setLoadError(apiErrorMessage(err, "Không tải được thông tin sự kiện."));
    } finally {
      setLoadingEvent(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleEnded = useCallback((endedId: string) => {
    setDoneMessage("Sự kiện Community Jam đã kết thúc thành công.");
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
    <div className="mx-auto max-w-page px-5 py-8">
      <PageHeader
        breadcrumbs={[{ label: "Quản trị" }, { label: "Community Jam" }]}
        title="Điều khiển sự kiện Jam"
        description="Xem trạng thái và kết thúc sự kiện khi cần (UC-95)."
      />
      {loading ? (
        <p className="text-sm text-muted">Đang tải…</p>
      ) : profile?.role !== "admin" ? (
        <EmptyState
          icon={ShieldAlert}
          title="Bạn không có quyền truy cập"
          description="Bạn không có quyền quản trị để thực hiện thao tác này."
        />
      ) : (
        <JamEventControlPanel
          event={
            event && online !== null
              ? { ...event, currentParticipantCount: online }
              : event
          }
          loadError={loadError}
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
