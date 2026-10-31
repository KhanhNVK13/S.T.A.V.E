"use client";

import { useCallback, useEffect, useState } from "react";
import { use } from "react";
import { ShieldAlert } from "lucide-react";
import { RequireAuth } from "../../../../components/require-auth";
import { useAuth } from "../../../../context/auth-context";
import {
  adminGetJamEvent,
  adminListJamEvents,
} from "../../../../lib/api-jam";
import { apiErrorMessage } from "../../../../lib/error-message";
import type { JamEvent, JamEventListItem } from "@stave/shared-types";
import { PageHeader } from "../../../../components/ui/page-header";
import { EmptyState } from "../../../../components/ui/empty-state";
import { Toast } from "../../../../components/ui/toast";
import { JamEventControlPanel } from "../../../../components/admin/jam/jam-event-control-panel";

/**
 * UC-95 — trang điều khiển quản trị 1 sự kiện Jam (route chuẩn:
 * `/admin/jam-events/:id`; backend cũng nhận alias `/admin/jam/events/:id`).
 * 1.E3: người không phải admin thấy cảnh báo "không có quyền"; phía server
 * triple guard (JwtAuth → SessionAuth → Admin) chặn mọi endpoint tương ứng.
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
    try {
      // Chi tiết (admin GET) + số người online (từ listing — phòng có thể
      // chưa hydrate nên có thể vắng → null).
      const [detail, items] = await Promise.all([
        adminGetJamEvent(id),
        adminListJamEvents().catch(() => [] as JamEventListItem[]),
      ]);
      setEvent(detail);
      setOnline(items.find((e) => e.id === id)?.currentParticipantCount ?? 0);
    } catch (err) {
      // 3.E1 (404): sự kiện không tồn tại → empty state "Quay lại danh sách".
      setEvent(null);
      setLoadError(apiErrorMessage(err, "Không tải được thông tin sự kiện."));
    } finally {
      setLoadingEvent(false);
    }
  }, [id]);

  // Load lần đầu khi mount (định dạng inline IIFE + `active` guard — cùng
  // pattern với trang danh sách UC-94; tránh `set-state-in-effect`).
  // `loadingEvent` đã là `true` ban đầu nên mount không cần set lại; chỉ
  // `retryLoad` (event handler) mới bật cờ loading thủ công.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [detail, items] = await Promise.all([
          adminGetJamEvent(id),
          adminListJamEvents().catch(() => [] as JamEventListItem[]),
        ]);
        if (!active) return;
        setEvent(detail);
        setOnline(
          items.find((e) => e.id === id)?.currentParticipantCount ?? 0,
        );
      } catch (err) {
        if (!active) return;
        setEvent(null);
        setLoadError(apiErrorMessage(err, "Không tải được thông tin sự kiện."));
      } finally {
        if (active) setLoadingEvent(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  /** Retry after a load error (cũng là đường vào "Thử lại" của panel). */
  const retryLoad = useCallback(() => {
    setLoadError(null);
    setLoadingEvent(true);
    void load();
  }, [load]);

  const handleEnded = useCallback(() => {
    setDoneMessage("Sự kiện Community Jam đã kết thúc thành công.");
    setEvent((prev) =>
      prev
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
              ? ({ ...event, currentParticipantCount: online } as JamEvent & {
                  currentParticipantCount?: number;
                })
              : event
          }
          loadError={loadError}
          onRetry={retryLoad}
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
