"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, Trash2, Loader2, AudioWaveform } from "lucide-react";
import {
  ApiError,
  attachAudioSketch,
  createSketchUploadUrl,
  listAudioSketches,
} from "../../lib/api-client";
import type { AudioSketch } from "../../lib/api-client";
import { supabase } from "../../lib/supabase-browser";
import {
  computeWaveformPeaks,
  decodeRecording,
  encodeWav,
  normalizeForStorage,
} from "../../lib/wav-encoder";
import { MAX_RECORDING_SEC, useAudioRecorder } from "../../lib/use-audio-recorder";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { INPUT_CLASS } from "../ui/form";

const BUCKET = "audio-sketches";
/** BR-56 — nâng từ 10MB lên 20MB ngày 16/09/2026, xem PROJECT_STATE §33. */
const MAX_SIZE_BYTES = 20 * 1024 * 1024;
const PEAK_COUNT = 160;

function formatTime(sec: number): string {
  const total = Math.floor(sec);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Dạng sóng tĩnh + 2 tay cầm cắt (UC-54). */
function TrimmableWaveform({
  peaks,
  duration,
  trimStart,
  trimEnd,
  onChange,
}: {
  peaks: number[];
  duration: number;
  trimStart: number;
  trimEnd: number;
  onChange: (next: { start: number; end: number }) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"start" | "end" | null>(null);

  const positionToSec = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return 0;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const handle = draggingRef.current;
      if (!handle) return;
      const sec = positionToSec(e.clientX);
      // Chặn 2 tay cầm vượt qua nhau — luôn chừa tối thiểu 0,1s để đoạn giữ lại
      // không bao giờ rỗng.
      if (handle === "start") {
        onChange({ start: Math.min(sec, trimEnd - 0.1), end: trimEnd });
      } else {
        onChange({ start: trimStart, end: Math.max(sec, trimStart + 0.1) });
      }
    }
    function handleUp() {
      draggingRef.current = null;
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [onChange, positionToSec, trimStart, trimEnd]);

  const startPct = duration > 0 ? (trimStart / duration) * 100 : 0;
  const endPct = duration > 0 ? (trimEnd / duration) * 100 : 100;

  return (
    <div
      ref={trackRef}
      className="relative h-24 select-none overflow-hidden rounded-md border border-border bg-surface-subtle"
    >
      <div className="flex h-full items-center gap-px px-1">
        {peaks.map((peak, i) => {
          const sec = duration * (i / peaks.length);
          const inRange = sec >= trimStart && sec <= trimEnd;
          return (
            <span
              key={i}
              className={`flex-1 rounded-sm ${inRange ? "bg-accent" : "bg-border-strong"}`}
              // Sàn 2% để đoạn im lặng vẫn thấy được vạch, không biến mất hẳn.
              style={{ height: `${Math.max(2, peak * 100)}%` }}
            />
          );
        })}
      </div>

      {/* Vùng bị cắt bỏ làm mờ đi cho thấy rõ phần sẽ giữ lại */}
      <div
        className="absolute inset-y-0 left-0 bg-surface/70"
        style={{ width: `${startPct}%` }}
      />
      <div
        className="absolute inset-y-0 right-0 bg-surface/70"
        style={{ width: `${100 - endPct}%` }}
      />

      {(["start", "end"] as const).map((handle) => (
        <button
          key={handle}
          type="button"
          aria-label={handle === "start" ? "Điểm bắt đầu" : "Điểm kết thúc"}
          onPointerDown={() => {
            draggingRef.current = handle;
          }}
          className="absolute inset-y-0 w-2 cursor-ew-resize bg-accent"
          style={{
            left: `calc(${handle === "start" ? startPct : endPct}% - 4px)`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * UC-53 (ghi âm) + UC-54 (cắt đầu/cuối) + UC-55 (đính kèm vào dự án).
 *
 * File đi THẲNG từ trình duyệt lên Supabase Storage bằng signed URL do backend
 * cấp — backend chỉ quyết định quyền (BR-26) và giới hạn (BR-56), không nhận
 * byte file (kiến trúc đã chốt, PROJECT_STATE §31).
 */
export function AudioSketchPanel({ projectId }: { projectId: string }) {
  const recorder = useAudioRecorder();

  const [sketches, setSketches] = useState<AudioSketch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bản ghi vừa thu, đang chờ cắt + đặt tên
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [trim, setTrim] = useState({ start: 0, end: 0 });
  const [name, setName] = useState("");
  const [attaching, setAttaching] = useState(false);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSketches(await listAudioSketches(projectId));
      setError(null);
    } catch (err) {
      setError(messageOf(err, "Không tải được danh sách audio sketch."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp danh sách lần đầu
    void load();
  }, [load]);

  // Sau khi dừng ghi: giải mã MỘT lần, dùng chung cho dạng sóng và cho lúc encode WAV.
  useEffect(() => {
    if (!recorder.blob) return;
    let cancelled = false;
    const url = URL.createObjectURL(recorder.blob);

    void (async () => {
      try {
        const decoded = await decodeRecording(recorder.blob!);
        if (cancelled) return;
        setBuffer(decoded);
        setPeaks(computeWaveformPeaks(decoded, PEAK_COUNT));
        setTrim({ start: 0, end: decoded.duration });
        setPreviewUrl(url);
        setName(
          `Sketch ${new Date().toLocaleString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}`,
        );
      } catch {
        if (!cancelled) setError("Không đọc được bản ghi vừa thu.");
      }
    })();

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [recorder.blob]);

  function discardRecording() {
    audioRef.current?.pause();
    setPlayingId(null);
    setBuffer(null);
    setPeaks([]);
    setPreviewUrl(null);
    setName("");
    recorder.reset();
  }

  /** Phát thử đúng đoạn giữa 2 tay cầm (UC-54 bước 3-4). */
  function previewTrimmed() {
    const audio = audioRef.current;
    if (!audio || !previewUrl) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    setPlayingId(null); // đang nghe bản ghi mới, không phải sketch đã lưu
    if (audio.src !== previewUrl) audio.src = previewUrl;
    audio.currentTime = trim.start;
    void audio.play();
  }

  async function handleAttach() {
    if (!buffer) return;
    setAttaching(true);
    setError(null);
    try {
      // Hạ mono 22.05kHz rồi mới encode: WAV không nén, giữ nguyên chất lượng
      // thu thì 3 phút vượt xa giới hạn 10MB (xem `normalizeForStorage`).
      const normalized = await normalizeForStorage(buffer);
      const wav = encodeWav(normalized);

      if (wav.size > MAX_SIZE_BYTES) {
        // UC-53 ngoại lệ 6.E1 — báo rõ giới hạn, giữ nguyên bản ghi để người
        // dùng cắt ngắn rồi thử lại.
        setError(
          `Bản ghi ${(wav.size / 1024 / 1024).toFixed(1)}MB, vượt giới hạn 20MB. Hãy ghi ngắn hơn rồi thử lại.`,
        );
        return;
      }

      const { sketchId, path, token } = await createSketchUploadUrl(projectId, {
        durationSec: buffer.duration,
        sizeBytes: wav.size,
      });

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(path, token, wav, { contentType: "audio/wav" });

      if (uploadError) {
        // UC-55 ngoại lệ 4.E1 — giữ nguyên bản ghi trong trình soạn để thử lại.
        throw new Error(`Tải lên thất bại: ${uploadError.message}`);
      }

      await attachAudioSketch(projectId, {
        sketchId,
        name: name.trim() || `Sketch ${new Date().toISOString()}`,
        durationSec: buffer.duration,
        sizeBytes: wav.size,
        trimStartSec: trim.start,
        // Cắt tới đúng cuối bản ghi thì coi như không cắt đuôi (lưu NULL).
        trimEndSec: trim.end < buffer.duration ? trim.end : undefined,
      });

      discardRecording();
      await load();
    } catch (err) {
      setError(messageOf(err, "Không đính kèm được audio sketch."));
    } finally {
      setAttaching(false);
    }
  }

  function playSketch(sketch: AudioSketch) {
    const audio = audioRef.current;
    if (!audio || !sketch.playbackUrl) return;
    if (playingId === sketch.id && !audio.paused) {
      audio.pause();
      return;
    }
    audio.src = sketch.playbackUrl;
    audio.currentTime = sketch.trim_start_sec;
    setPlayingId(sketch.id);
    void audio.play();
  }

  /** Dừng đúng điểm cắt cuối thay vì phát tới hết file gốc. */
  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId) {
      const sketch = sketches.find((s) => s.id === playingId);
      if (sketch?.trim_end_sec != null && audio.currentTime >= sketch.trim_end_sec) {
        audio.pause();
      }
    } else if (buffer && audio.currentTime >= trim.end) {
      audio.pause();
    }
  }

  const recording = recorder.status === "recording";
  const reviewing = !!buffer;

  return (
    <div className="flex flex-col gap-4">
      {/*
        CỐ Ý không đặt `src` qua JSX: cùng một thẻ audio phục vụ 2 nguồn (bản
        ghi đang xem lại và sketch đã lưu). Nếu để React quản `src`, mỗi lần
        `previewUrl` đổi là nó ghi đè nguồn đang phát dở.
      */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setPlayingId(null)}
        hidden
      />

      {(error || recorder.error) && (
        <div className="rounded-card border border-danger/20 bg-danger-muted px-4 py-3">
          <p className="text-xs text-danger">{error ?? recorder.error}</p>
        </div>
      )}
      {recorder.warning && (
        <div className="rounded-card border border-warning/30 bg-warning-muted px-4 py-3">
          <p className="text-xs text-warning">{recorder.warning}</p>
        </div>
      )}

      {/* ── Ghi âm (UC-53) ─────────────────────────────────────── */}
      {!reviewing && (
        <div className="rounded-card border border-border bg-surface p-4">
          {recording ? (
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-2 font-mono text-[17px] font-bold">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
                {formatTime(recorder.elapsedSec)}
                <span className="text-[11px] font-normal text-muted">
                  / {formatTime(MAX_RECORDING_SEC)}
                </span>
              </span>

              {/* Dạng sóng trực tiếp: cột cao thấp theo mức tín hiệu thật từ micro */}
              <span className="flex h-8 flex-1 items-center gap-0.5">
                {Array.from({ length: 40 }).map((_, i) => (
                  <span
                    key={i}
                    className="flex-1 rounded-sm bg-accent"
                    style={{
                      height: `${Math.max(4, recorder.level * 100 * (0.55 + 0.45 * Math.sin(i * 0.7)))}%`,
                    }}
                  />
                ))}
              </span>

              <Button onClick={recorder.stop}>
                <Square className="h-3.5 w-3.5" /> Dừng
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold">Ghi nhanh một ý tưởng</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  Tối đa 3 phút. Bản ghi là tư liệu tham chiếu, không trộn vào bản phối và
                  không nằm trong bản xuất (BR-57).
                </p>
              </div>
              <Button
                onClick={() => void recorder.start()}
                disabled={recorder.status === "requesting"}
              >
                {recorder.status === "requesting" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xin quyền micro…
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5" /> Ghi âm
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Cắt + đặt tên + đính kèm (UC-54, UC-55) ────────────── */}
      {reviewing && buffer && (
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-semibold">Cắt đầu/cuối rồi đính kèm</p>
            <span className="font-mono text-[11px] text-muted">
              Giữ lại {formatTime(trim.end - trim.start)} / {formatTime(buffer.duration)}
            </span>
          </div>

          <TrimmableWaveform
            peaks={peaks}
            duration={buffer.duration}
            trimStart={trim.start}
            trimEnd={trim.end}
            onChange={(next) => setTrim(next)}
          />

          <p className="text-[10px] text-muted">
            Kéo 2 thanh dọc để chọn đoạn giữ lại. Bản ghi gốc vẫn được lưu nguyên vẹn nên
            có thể chỉnh lại điểm cắt sau (UC-54).
          </p>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <span className="text-[11px] font-semibold">Tên sketch</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className={`${INPUT_CLASS} h-[37px]`}
              />
            </label>
            <Button variant="secondary" onClick={previewTrimmed}>
              <Play className="h-3.5 w-3.5" /> Nghe thử đoạn đã cắt
            </Button>
            <Button onClick={() => void handleAttach()} disabled={attaching}>
              {attaching ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải lên…
                </>
              ) : (
                "Đính kèm vào dự án"
              )}
            </Button>
            <Button variant="ghost" onClick={discardRecording} disabled={attaching}>
              <Trash2 className="h-3.5 w-3.5" /> Bỏ bản ghi
            </Button>
          </div>
        </div>
      )}

      {/* ── Danh sách sketch đã đính kèm ───────────────────────── */}
      {loading ? (
        <div className="h-16 animate-pulse rounded-card border border-border bg-surface-subtle" />
      ) : sketches.length === 0 ? (
        <EmptyState
          icon={AudioWaveform}
          title="Chưa có audio sketch nào."
          description="Ghi nhanh một đoạn hát hoặc đàn để giữ lại ý tưởng trước khi nó trôi mất."
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {sketches.map((sketch) => {
            const playing = playingId === sketch.id;
            const heard =
              (sketch.trim_end_sec ?? sketch.duration_sec) - sketch.trim_start_sec;
            return (
              <div
                key={sketch.id}
                className="flex min-h-[64px] flex-wrap items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0"
              >
                <Button
                  variant="secondary"
                  onClick={() => playSketch(sketch)}
                  disabled={!sketch.playbackUrl}
                  title={sketch.playbackUrl ? undefined : "Không tạo được link nghe"}
                >
                  {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{sketch.name}</p>
                  <p className="font-mono text-[10px] text-muted">
                    {formatTime(heard)} · {(sketch.size_bytes / 1024 / 1024).toFixed(1)}MB
                  </p>
                </div>

                {sketch.trim_start_sec > 0 || sketch.trim_end_sec != null ? (
                  <Badge variant="neutral">Đã cắt</Badge>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
