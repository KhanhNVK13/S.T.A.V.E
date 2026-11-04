"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Music4, RefreshCw, TriangleAlert } from "lucide-react";
import type {
  JamActivityItem,
  JamEvent,
  JamParticipant,
  JamNoteDto,
} from "@stave/shared-types";
import { useAuth } from "../../context/auth-context";
import { apiErrorMessage } from "../../lib/error-message";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";
import { Toast } from "../ui/toast";
import { formatDateTime } from "../../lib/format-date";
import { JamParticipantsBar } from "./jam-participants-bar";
import { JamCountdownTimer } from "./jam-countdown-timer";
import { JamFrozenBanner } from "./jam-frozen-banner";
import { useJamSocket } from "./use-jam-socket";
import { PIANO_ROLL_FALLBACK_NOTES } from "./jam-piano-roll";
import { JamLiveEditor } from "./jam-live-editor";
import { useI18n } from "../../context/i18n-context";
import { tNow } from "../../lib/i18n";

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
  const who = item.displayName?.trim() || tNow("jam.user");
  const detail = item.detail ? ` (${item.detail})` : "";
  switch (item.op) {
    case "join":
      return tNow("jam.actJoin", { who });
    case "leave":
      return tNow("jam.actLeave", { who });
    case "add":
      return tNow("jam.actAdd", { who }) + detail;
    case "remove":
      return tNow("jam.actRemove", { who }) + detail;
    default:
      return tNow("jam.actEdit", { who }) + detail;
  }
}

export function JamSession({ event }: { event: JamEvent }) {
  const { t, tx } = useI18n();
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

  // 2.E1 / 5.E1 / 12.E1 — surface for toasts raised by the collaborative
  // editor (cooldown, read-only attempt, storage flush warning, 8.E1 note
  // overwrite notice). A single transient toast at a time.
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "warning" | "info" | "danger";
  } | null>(null);
  const notify = (message: string, variant: "success" | "warning" | "info" = "info") =>
    setToast({ message, variant });

  // The editNote callback the live editor drives. Pre-checks read-only /
  // cooldown, optimistically applies locally, and emits `jam:edit_note`.
  const sendNote = (action: "add" | "update" | "delete", note: JamNoteDto) =>
    socket.editNote(action, note);

  // 8.E1 — a remote note just overwrote one of ours; surface a brief inline
  // hint that auto-dismisses 6s after each new remote write. The hint is
  // derived from state (show while the note's `at` is newer than the last
  // dismissed one) so nothing is set synchronously in an effect body.
  const remoteNote = socket.lastRemoteNoteUpdate;
  const [hintDismissedAt, setHintDismissedAt] = useState(0);
  useEffect(() => {
    const at = remoteNote?.at;
    if (at == null) return;
    const id = window.setTimeout(() => setHintDismissedAt(at), 6000);
    return () => clearTimeout(id);
  }, [remoteNote?.at]);
  const showRemoteHint =
    remoteNote !== null && remoteNote.at > hintDismissedAt;

  // 3.E1: a rejected join — "Không vào được phiên" + retry, no music shown.
  // Wording follows the UC-66 exception table (REPORT 3/4).
  if (socket.joinError) {
    const codeText: Record<string, string> = {
      EVENT_NOT_STARTED:
        t("jam.code.EVENT_NOT_STARTED"),
      EVENT_COMPLETED:
        t("jam.code.EVENT_COMPLETED"),
      ROOM_FULL:
        t("jam.code.ROOM_FULL"),
      ACCOUNT_NOT_ACTIVE:
        t("jam.code.ACCOUNT_NOT_ACTIVE"),
      EVENT_NOT_FOUND:
        t("jam.code.EVENT_NOT_FOUND"),
      JAM_CONNECTION_FAILED:
        t("jam.code.JAM_CONNECTION_FAILED"),
    };
    return (
      <Card className="p-8">
        <EmptyState
          icon={TriangleAlert}
          title={t("jam.joinFailTitle")}
          description={
            codeText[socket.joinError.code] ??
            apiErrorMessage(
              new Error(socket.joinError.message),
              t("jam.connectFail"),
            )
          }
          action={
            <Button variant="secondary" onClick={socket.retry}>
              <RefreshCw className="h-3.5 w-3.5" /> {t("ui.retry")}
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
            {t("jam.reconnecting")}
          </span>
          <button
            className="text-xs font-semibold underline"
            onClick={() => setShowBanner(false)}
          >
            {t("jam.dismiss")}
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
            {t("jam.failed")}
          </span>
          <Button variant="secondary" onClick={socket.retry}>
            <RefreshCw className="h-3.5 w-3.5" /> {t("ui.retry")}
          </Button>
        </div>
      )}

      {/* 12.E1 — the background flush has been failing; the in-RAM snapshot
          is still live but not yet saved to the DB. The banner clears itself
          the moment a flush succeeds again (the server re-broadcasts a 0). */}
      {socket.storageWarning && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-card border border-warning/40 bg-warning-muted px-4 py-2.5 text-sm text-warning-foreground"
        >
          <span className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4" />
            {t("jam.storage")}
          </span>
        </div>
      )}

      {/* 8.E1 — a remote contributor just wrote a note the caller also had
          open; a short, self-dismissing inline hint (not blocking). */}
      {showRemoteHint && remoteNote && (
        <div
          role="status"
          className="rounded-card border border-accent/30 bg-accent-muted px-3 py-1.5 text-xs text-accent"
        >
          {tx("jam.overwritten", { who: <span className="font-semibold">{remoteNote.displayName?.trim() || t("jam.someoneElse")}</span> })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{event.name || t("jam.room")}</h2>
            {event.status === "active" && (
              <Badge variant="success">{t("jam.live")}</Badge>
            )}
            {isEnded && <Badge variant="neutral">{t("jam.ended")}</Badge>}
            {event.status === "scheduled" && (
              <Badge variant="info">
                {event.scheduled_start_at
                  ? t("jam.opensAtLong", { when: formatDateTime(event.scheduled_start_at) })
                  : t("jam.upcoming")}
              </Badge>
            )}
          </div>
          {event.description && (
            <p className="mt-1 text-sm text-muted">{event.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* UC-94 (BR-75) — the LIVE end time: the socket's `endsAt` is the
              source of truth (an admin's `jam:end_extended` rewrite lands
              here); the HTTP `scheduled_end_at` is only the cold-start value. */}
          <JamCountdownTimer
            endsAt={
              event.status === "active"
                ? socket.state?.endsAt ?? event.scheduled_end_at
                : null
            }
          />
          <JamParticipantsBar participants={socket.participants} myId={myId} />
        </div>
      </div>

      {/* Pre-window (1.1): show the info + opening time, no shared draft. */}
      {event.status === "scheduled" ? (
        <Card className="p-8">
          <EmptyState
            icon={Loader2}
            title={t("jam.notStartedTitle")}
            description={
              event.scheduled_start_at
                ? t("jam.notStartedAt", { when: formatDateTime(event.scheduled_start_at) })
                : t("jam.notStarted")
            }
          />
        </Card>
      ) : socket.state ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          {/* UC-67: the collaborative live editor (shared canvas + velocity
              lane). Read-only when the room froze (BR-70). No commit /
              branch / merge / history controls — BR-74. */}
          <Card className="flex h-[320px] min-h-[320px] flex-col overflow-hidden lg:h-[460px]">
            <JamLiveEditor
              notes={notes}
              tracks={tracks}
              ppq={ppq}
              isReadOnly={socket.isReadonly}
              cooldownRemainingMs={socket.cooldownRemainingMs}
              callbacks={{ sendNote, notify }}
            />
          </Card>

          <Card className="flex max-h-[420px] flex-col overflow-hidden">
            <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">
              {t("jam.recent")}
            </div>
            {socket.activity.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">
                {t("jam.noActivity")}
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
              title={t("jam.trackFailTitle")}
              description={t("jam.trackFailBody")}
              action={
                <Button variant="secondary" onClick={socket.retry}>
                  <RefreshCw className="h-3.5 w-3.5" /> {t("ui.retry")}
                </Button>
              }
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              {t("jam.trackLoading")}
            </div>
          )}
        </Card>
      )}

      {/* UC-95 / BR-70 — the event ended: either it was already `ended` on
          load (`isEnded`) or the server just broadcast `jam:ended` /
          `jam:event_ended` while we were in the room (`endedByServer`).
          The room is frozen read-only; the banner steers to the result. */}
      {isEnded || socket.endedByServer ? (
        <JamFrozenBanner eventId={event.id} />
      ) : null}

      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
