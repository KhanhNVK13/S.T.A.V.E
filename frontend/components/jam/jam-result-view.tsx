"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Loader2,
  Music4,
  Pause,
  Play,
  TriangleAlert,
} from "lucide-react";
import type {
  DraftNote,
  DraftTrack,
  JamResultResponseDto,
} from "@stave/shared-types";
import { useAuth } from "../../context/auth-context";
import { forkProject } from "../../lib/api-client";
import { resolveAndLoadCustomSounds } from "../../lib/custom-sound-buffers";
import { apiErrorMessage } from "../../lib/error-message";
import { formatDateTime } from "../../lib/format-date";
import { setFlashToast } from "../../lib/flash-toast";
import { SnapshotPlayer } from "../../lib/snapshot-player";
import { PianoRoll } from "../midi-editor/piano-roll";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";
import { Toast, type ToastVariant } from "../ui/toast";
import { JamContributorsList } from "./jam-contributors-list";

/**
 * UC-68 — the read-only result of an ended Community Jam.
 *
 * 1.E1 (guest clicks Fork): warn + redirect to `/login?redirect=...` (BR-12).
 * 4.E1 (sample/audio failure): caught per play attempt, inline banner,
 * `SnapshotPlayer.stop()` on unmount. 2.E1: an empty result shows an
 * EmptyState — never a blank grid without explanation.
 */
export function JamResultView({
  result,
}: {
  result: JamResultResponseDto;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [toast, setToast] = useState<{
    message: string;
    variant: ToastVariant;
  } | null>(null);

  const [forking, setForking] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [playBusy, setPlayBusy] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);

  const hasNotes =
    result.hasContributions &&
    result.snapshot !== null &&
    result.snapshot.notes.length > 0;

  // UC-68: a frozen grid, driven purely by the result snapshot.
  const notes = result.snapshot?.notes ?? [];
  const tracks = result.snapshot?.tracks ?? [];
  const ppq = result.snapshot?.meta.ppq ?? 480;

  const notify = (message: string, variant: ToastVariant = "warning") =>
    setToast({ message, variant });

  // 4.E1 — the player owns a Tone.Context that must not leak past unmount.
  const playerRef = useRef<SnapshotPlayer | null>(null);
  useEffect(() => {
    const player = new SnapshotPlayer();
    playerRef.current = player;
    return () => {
      player.stop();
      playerRef.current = null;
    };
  }, []);

  async function togglePlay() {
    if (playing) {
      playerRef.current?.stop();
      setPlaying(false);
      return;
    }
    const player = playerRef.current;
    if (!player || !result.snapshot) return;
    setPlayError(null);
    setPlayBusy(true);
    try {
      // 4.E1: offline → sample fetch throws; fall back to built-in voices
      // rather than silencing the whole button.
      const customBuffers = result.resultingProjectId
        ? await resolveAndLoadCustomSounds(
            result.resultingProjectId,
            result.snapshot,
          ).catch(() => new Map<string, AudioBuffer>())
        : new Map<string, AudioBuffer>();
      const started = await player.play(result.snapshot, customBuffers, () =>
        setPlaying(false),
      );
      if (!started) {
        setPlayError("Bản nhạc này chưa có nốt nào để nghe.");
      } else {
        setPlaying(true);
      }
    } catch {
      setPlayError(
        "Không thể tải mẫu âm thanh để phát thử. Vui lòng kiểm tra lại kết nối mạng.",
      );
    } finally {
      setPlayBusy(false);
    }
  }

  /** 1.E1 (BR-12): guests are sent to login and come straight back. */
  async function handleFork() {
    if (!user) {
      notify("Vui lòng đăng nhập để sao chép kết quả Jam về tài khoản của bạn.");
      router.push(
        `/login?redirect=${encodeURIComponent(`/jam/${result.eventId}/result`)}`,
      );
      return;
    }
    if (!result.resultingProjectId) return;
    setForking(true);
    setForkError(null);
    try {
      const created = await forkProject(result.resultingProjectId);
      setFlashToast("Đã sao chép kết quả Jam về dự án của bạn.");
      router.push(`/projects/${created.id}/edit`);
    } catch (err) {
      setForkError(apiErrorMessage(err, "Không sao chép được dự án."));
      setForking(false);
    }
  }

  return (
    <div className="space-y-4">
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{result.name}</h2>
            <Badge variant="neutral">Đã kết thúc</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {result.startedAt && result.endedAt
              ? `Diễn ra từ ${formatDateTime(result.startedAt)} đến ${formatDateTime(result.endedAt)}.`
              : "Sự kiện đã kết thúc."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasNotes && (
            <Button onClick={() => void togglePlay()} disabled={playBusy}>
              {playBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : playing ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {playing ? "Tạm dừng" : "Nghe thử"}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => void handleFork()}
            disabled={forking || !result.resultingProjectId}
          >
            {forking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            Sao chép về dự án của tôi
          </Button>
          <Button variant="ghost" onClick={() => router.push("/jam")}>
            Quay lại Khám phá
          </Button>
        </div>
      </div>

      {/* 4.E1 — audio playback failure, inline + retry-friendly. */}
      {playError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-card border border-warning/40 bg-warning-muted px-4 py-2.5 text-sm text-warning-foreground"
        >
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {playError}
        </div>
      )}

      {/* 1.E1 / fork failure */}
      {forkError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-card border border-danger/40 bg-danger-muted px-4 py-2.5 text-sm text-danger"
        >
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {forkError}
        </div>
      )}

      {/* Content */}
      {hasNotes ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="flex h-[320px] min-h-[320px] flex-col overflow-hidden lg:h-[460px]">
            <JamReadOnlyRoll notes={notes} tracks={tracks} ppq={ppq} onNotify={notify} />
          </Card>
          <Card className="flex max-h-[420px] flex-col overflow-hidden p-4">
            <JamContributorsList contributors={result.contributors} />
          </Card>
        </div>
      ) : (
        <Card className="p-6">
          <EmptyState
            icon={Music4}
            title="Không có đóng góp"
            description="Sự kiện đã kết thúc mà không có đóng góp nào."
          />
          {result.contributors.length > 0 && (
            <div className="mt-4">
              <JamContributorsList contributors={result.contributors} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/**
 * The frozen result grid: `PianoRoll` in read-only mode — UC-68 3.E1,
 * every draw/drag/resize/delete attempt reports "sự kiện đã kết thúc".
 */
function JamReadOnlyRoll({
  notes,
  tracks,
  ppq,
  onNotify,
}: {
  notes: DraftNote[];
  tracks: DraftTrack[];
  ppq: number;
  onNotify: (message: string, variant: "success" | "warning" | "info") => void;
}) {
  const emptySelection = useMemo(() => new Set<string>(), []);
  const noopMutator = useMemo(
    () => (): void => {
      // UC-68: read-only — edits are impossible by design.
    },
    [],
  );

  return (
    <PianoRoll
      notes={notes}
      tracks={tracks}
      selectedTrackId={tracks[0]?.id ?? null}
      tool="pointer"
      zoom={0.5}
      ppq={ppq}
      gridDivision={16}
      playheadTick={0}
      isReadOnly
      onNotesChange={noopMutator}
      onNotify={onNotify}
      selectedNoteIds={emptySelection}
      onSelectedNotesChange={noopMutator}
      isPlaying={false}
      onSeek={noopMutator}
    />
  );
}
