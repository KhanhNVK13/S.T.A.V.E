"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Music4, RefreshCw, TriangleAlert } from "lucide-react";
import type {
  JamActivityItem,
  JamEvent,
  JamParticipant,
} from "@stave/shared-types";
import { useAuth } from "../../context/auth-context";
import { apiErrorMessage } from "../../lib/error-message";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";
import { formatDateTime } from "../../lib/format-date";
import { JamParticipantsBar } from "./jam-participants-bar";
import { JamCountdownTimer } from "./jam-countdown-timer";
import { useJamSocket } from "./use-jam-socket";
import { PIANO_ROLL_FALLBACK_NOTES } from "./jam-piano-roll";
import { JamPianoRoll } from "./jam-piano-roll";

/**
 * UC-66 — the shared jam room. The note view is a READ-ONLY re-use of the
 * MIDI editor's `PianoRoll`, driven purely by props (`notes`/`tracks` come
 * from the server broadcast, no local draft) — BR-74: there is no
 * commit/branch/merge/history UI here at all.
 *
 * Layout: header (event name, status, countdown), the participants bar, the
 * read-only roll, and the recent-activity feed (50 items, kept in client
 * memory + mirrored by the server).
 */

function activityLabel(item: JamActivityItem): string {
  const who = item.displayName?.trim() || "Người dùng";
  switch (item.op) {
    case "join":
      return `${who} đã vào phòng`;
    case "leave":
      return `${who} đã rời phòng`;
    case "add":
      return `${who} thêm nốt${item.detail ? ` (${item.detail})` : ""}`;
    case "remove":
      return `${who} xoá nốt${item.detail ? ` (${item.detail})` : ""}`;
    default:
      return `${who} chỉnh nốt${item.detail ? ` (${item.detail})` : ""}`;
  }
}

export function JamSession({ event }: { event: JamEvent }) {
  const { user } = useAuth();
  const myId = user?.id ?? null;

  const socket = useJamSocket(event.id);
  const [showBanner, setShowBanner] = useState(true);

  // Read-only render state: the broadcast snapshot is the single source.
  const notes = socket.state?.snapshot.notes ?? PIANO_ROLL_FALLBACK_NOTES;
  const tracks = socket.state?.snapshot.tracks ?? [];
  const ppq = socket.state?.snapshot.meta.ppq ?? 480;

  const joined = useMemo(
    () =>
      socket.participants.some((p: JamParticipant) => p.userId === myId),
    [socket.participants, myId],
  );

  const isEnded = event.status === "ended" || event.status === "cancelled";

  // 3.E1: a rejected join — "Không vào được phiên" + retry, no music shown.
  if (socket.joinError) {
    const codeText: Record<string, string> = {
      EVENT_NOT_STARTED: "Sự kiện chưa bắt đầu — hãy quay lại đúng giờ mở.",
      EVENT_COMPLETED: "Sự kiện đã kết thúc.",
      ROOM_FULL: "Phòng Jam hiện đã đầy — hãy thử sự kiện khác.",
      ACCOUNT_NOT_ACTIVE: "Tài khoản của bạn không ở trạng thái hoạt động.",
      EVENT_NOT_FOUND: "Không tìm thấy sự kiện này.",
    };
    return (
      <Card className="p-8">
        <EmptyState
          icon={TriangleAlert}
          title="Không vào được phiên Jam"
          description={
            codeText[socket.joinError.code] ??
            apiErrorMessage(
              new Error(socket.joinError.message),
              "Không thể kết nối phòng Jam. Vui lòng thử lại.",
            )
          }
          action={
            <Button variant="secondary" onClick={socket.retry}>
              <RefreshCw className="h-3.5 w-3.5" /> Thử lại
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 4.E1 — dropped connection: yellow banner, auto-reconnect, banner
          hides as soon as the link recovers. */}
      {socket.isReconnecting && showBanner && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-card border border-warning/40 bg-warning-muted px-4 py-2.5 text-sm text-warning-foreground"
        >
          <span className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4" />
            Mất kết nối tới phòng Jam. Đang thử kết nối lại…
          </span>
          <button
            className="text-xs font-semibold underline"
            onClick={() => setShowBanner(false)}
          >
            Bỏ qua
          </button>
        </div>
      )}

      {socket.failed && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-card border border-danger/40 bg-danger-muted px-4 py-2.5 text-sm text-danger"
        >
          <span className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4" />
            Không kết nối được phòng Jam. Hãy kiểm tra mạng rồi thử lại.
          </span>
          <Button variant="secondary" onClick={socket.retry}>
            <RefreshCw className="h-3.5 w-3.5" /> Thử lại
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{event.name || "Phòng Jam"}</h2>
            {event.status === "active" && (
              <Badge variant="success">Đang diễn ra</Badge>
            )}
            {isEnded && <Badge variant="neutral">Đã kết thúc</Badge>}
            {event.status === "scheduled" && (
              <Badge variant="info">
                {event.scheduled_start_at
                  ? `Mở lúc ${formatDateTime(event.scheduled_start_at)}`
                  : "Sắp diễn ra"}
              </Badge>
            )}
          </div>
          {event.description && (
            <p className="mt-1 text-sm text-muted">{event.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <JamCountdownTimer
            endsAt={event.status === "active" ? event.scheduled_end_at : null}
          />
          <JamParticipantsBar participants={socket.participants} myId={myId} />
        </div>
      </div>

      {/* Pre-window (1.1): show the info + opening time, no shared draft. */}
      {event.status === "scheduled" ? (
        <Card className="p-8">
          <EmptyState
            icon={Loader2}
            title="Sự kiện chưa bắt đầu"
            description={
              event.scheduled_start_at
                ? `Phòng mở lúc ${formatDateTime(event.scheduled_start_at)}. Bản nhạc chung sẽ hiện tại đây khi sự kiện bắt đầu.`
                : "Phòng sẽ mở khi đến giờ diễn ra. Bản nhạc chung sẽ hiện tại đây."
            }
          />
        </Card>
      ) : socket.state ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          {/* BR-74: no commit/branch/merge/history controls exist here. */}
          <Card className="flex h-[320px] min-h-[320px] flex-col overflow-hidden lg:h-[460px]">
            <JamPianoRoll notes={notes} tracks={tracks} ppq={ppq} />
          </Card>

          <Card className="flex max-h-[420px] flex-col overflow-hidden">
            <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">
              Hoạt động gần đây
            </div>
            {socket.activity.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">
                Chưa có hoạt động nào.
              </p>
            ) : (
              <ol className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
                {socket.activity.map((item) => (
                  <li key={item.id} className="text-[13px] text-muted">
                    {activityLabel(item)}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      ) : (
        <Card className="flex min-h-[320px] items-center justify-center">
          {socket.failed ? (
            <EmptyState
              icon={Music4}
              title="Chưa tải được bản nhạc"
              description="Không thể kết nối tới phòng Jam lúc này."
              action={
                <Button variant="secondary" onClick={socket.retry}>
                  <RefreshCw className="h-3.5 w-3.5" /> Thử lại
                </Button>
              }
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              Đang tải bản nhạc chung…
            </div>
          )}
        </Card>
      )}

      {isEnded && joined && (
        <p className="text-sm text-muted">
          Sự kiện đã kết thúc — xem{" "}
          <Link href={`/jam/${event.id}`} className="text-accent hover:underline">
            kết quả
          </Link>{" "}
          (UC-68).
        </p>
      )}
    </div>
  );
}
