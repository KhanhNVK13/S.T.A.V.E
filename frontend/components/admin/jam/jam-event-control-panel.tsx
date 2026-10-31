"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Loader2, TriangleAlert, Users } from "lucide-react";
import type { JamEvent, JamEventStatus } from "@stave/shared-types";
import { Card } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { EmptyState } from "../../ui/empty-state";
import { formatDateTime } from "../../../lib/format-date";
import { EndJamConfirmModal } from "./end-jam-confirm-modal";

export function JamStatusBadge({ status }: { status: JamEventStatus }) {
  switch (status) {
    case "active":
      return <Badge variant="success">Đang diễn ra</Badge>;
    case "scheduled":
      return <Badge variant="info">Đã lên lịch</Badge>;
    case "cancelled":
      return <Badge variant="danger">Đã huỷ</Badge>;
    default:
      return <Badge variant="neutral">Đã kết thúc</Badge>;
  }
}

export interface JamEventControlPanelProps {
  /** `null` = empty state "Không tìm thấy thông tin sự kiện Jam". */
  event: (JamEvent & { currentParticipantCount?: number }) | null;
  /** Lỗi tải dữ kiện (hiển thị alert đỏ + nút thử lại). */
  loadError: string | null;
  onRetry: () => void;
  loading: boolean;
  /** Sự kiện vừa được kết thúc thành công → toast. */
  onEnded: (eventId: string) => void;
}

/**
 * UC-95 — bảng điều khiển quản trị cho 1 sự kiện Jam: thông tin sự kiện,
 * trạng thái, số người online và nút "Kết thúc sự kiện" (chỉ khi
 * `active`/`scheduled` — mở `EndJamConfirmModal`).
 */
export function JamEventControlPanel({
  event,
  loadError,
  onRetry,
  loading,
  onEnded,
}: JamEventControlPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const canEnd =
    event !== null &&
    (event.status === "active" || event.status === "scheduled");

  if (loading) {
    return (
      <Card className="flex min-h-[200px] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Đang tải thông tin sự kiện…
        </div>
      </Card>
    );
  }

  if (loadError && !event) {
    return (
      <Card className="p-6">
        <div
          role="alert"
          className="flex items-center gap-2 rounded-card bg-danger-muted px-3 py-2 text-xs text-danger"
        >
          <TriangleAlert className="h-3.5 w-3.5" />
          {loadError}
        </div>
      </Card>
    );
  }

  if (!event) {
    return (
      <Card className="p-8">
        <EmptyState
          icon={TriangleAlert}
          title="Không tìm thấy thông tin sự kiện Jam."
          description="Sự kiện có thể đã bị gỡ hoặc liên kết không còn tồn tại."
          action={
            <Link href="/admin/jam" className="inline-block">
              <Button variant="secondary">Quay lại danh sách</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const online = (event as JamEvent & { currentParticipantCount?: number })
    .currentParticipantCount;

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">{event.name}</h3>
              <JamStatusBadge status={event.status} />
            </div>
            {event.description && (
              <p className="mt-1 text-sm text-muted">{event.description}</p>
            )}
          </div>
          {canEnd && (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Kết thúc sự kiện
            </Button>
          )}
        </div>

        <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="flex items-center gap-1.5 text-muted">
              <CalendarClock className="h-3.5 w-3.5" /> Khung giờ
            </dt>
            <dd className="mt-1 tabular-nums text-foreground">
              {event.scheduled_start_at
                ? formatDateTime(event.scheduled_start_at)
                : "—"}
              {" → "}
              {event.scheduled_end_at
                ? formatDateTime(event.scheduled_end_at)
                : event.status === "ended" && event.ended_at
                  ? `kết thúc lúc ${formatDateTime(event.ended_at)}`
                  : "mở"}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-muted">
              <Users className="h-3.5 w-3.5" /> Người online
            </dt>
            <dd className="mt-1 font-mono tabular-nums text-foreground">
              {typeof online === "number" ? online : "—"}
            </dd>
          </div>
          {event.status === "ended" && event.ended_at && (
            <div>
              <dt className="text-muted">Thời điểm kết thúc</dt>
              <dd className="mt-1 tabular-nums text-foreground">
                {formatDateTime(event.ended_at)}
              </dd>
            </div>
          )}
          {event.resulting_project_id && (
            <div>
              <dt className="text-muted">Dự án kết quả</dt>
              <dd className="mt-1">
                <Link
                  href={`/projects/${event.resulting_project_id}`}
                  className="text-accent hover:underline"
                >
                  Xem dự án
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </Card>

      {confirming && event && (
        <EndJamConfirmModal
          event={event}
          participantCount={typeof online === "number" ? online : 0}
          onClosed={() => setConfirming(false)}
          onEnded={(id) => {
            setConfirming(false);
            onEnded(id);
          }}
        />
      )}
    </div>
  );
}
