"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mic, Music, Pause, Play, Save, Square, Trash2, Upload, X } from "lucide-react";
import {
  confirmCustomSoundUpload,
  createCustomSoundUploadUrl,
  deleteCustomSound,
  getCustomSoundUsage,
  listCustomSounds,
} from "../../lib/api-client";
import type { CustomSound, CustomSoundLibrary } from "../../lib/api-client";
import { supabase } from "../../lib/supabase-browser";
import { apiErrorMessage } from "../../lib/error-message";
import { APP_LOCALE } from "../../lib/format-date";
import { encodeWav, normalizeForStorage } from "../../lib/wav-encoder";
import { useAudioRecorder } from "../../lib/use-audio-recorder";
import { Button } from "../ui/button";
import { Dialog, DialogActions, DialogError } from "../ui/dialog";
import { EmptyState } from "../ui/empty-state";
import { Field, INPUT_CLASS } from "../ui/form";

const BUCKET = "custom-sounds";
export const MAX_SOUND_DURATION_SEC = 30;
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".wav,.mp3,audio/wav,audio/x-wav,audio/mpeg";

function formatTime(sec: number): string {
  const total = Math.round(sec);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function decodeFile(blob: Blob): Promise<AudioBuffer> {
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void context.close();
  }
}

async function saveSound(
  source: Blob,
  name: string,
  kind: "uploaded" | "recorded",
): Promise<CustomSound> {
  let buffer: AudioBuffer;
  try {
    buffer = await decodeFile(source);
  } catch {
    throw new Error("Không đọc được file âm thanh. Hãy dùng file WAV hoặc MP3.");
  }
  if (buffer.duration > MAX_SOUND_DURATION_SEC) {
    throw new Error(`Âm thanh dài ${Math.ceil(buffer.duration)} giây, vượt giới hạn ${MAX_SOUND_DURATION_SEC} giây. Hãy cắt ngắn rồi thử lại.`);
  }

  const wav = encodeWav(await normalizeForStorage(buffer));
  if (wav.size > MAX_SIZE_BYTES) {
    throw new Error("Âm thanh vượt giới hạn 10MB.");
  }

  const { soundId, path, token } = await createCustomSoundUploadUrl({
    durationSec: buffer.duration,
    sizeBytes: wav.size,
  });

  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(path, token, wav, { contentType: "audio/wav" });
  if (error) throw new Error("Tải file lên thất bại. Hãy kiểm tra mạng rồi thử lại.");

  return confirmCustomSoundUpload({ soundId, name, source: kind });
}

function errorText(err: unknown, fallback: string): string {
  if (err instanceof Error && !("status" in err)) return err.message;
  return apiErrorMessage(err, fallback);
}

function RecordSection({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const recorder = useAudioRecorder(MAX_SOUND_DURATION_SEC);
  const [name, setName] = useState(() =>
    `Ghi âm ${new Date().toLocaleString(APP_LOCALE, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useMemo(
    () => (recorder.blob ? URL.createObjectURL(recorder.blob) : null),
    [recorder.blob],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleSave() {
    if (!recorder.blob) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Hãy đặt tên cho âm thanh.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveSound(recorder.blob, trimmed, "recorded");
      onSaved();
    } catch (err) {
      setError(errorText(err, "Không lưu được bản ghi."));
    } finally {
      setSaving(false);
    }
  }

  const isRecording = recorder.status === "recording";
  const isRecorded = recorder.status === "recorded" && !!recorder.blob;

  return (
    <section aria-label="Ghi âm" className="flex flex-col gap-3 rounded-card border border-border bg-surface-subtle p-4">
      <div className="flex items-center gap-3">
        {!isRecording && !isRecorded && (
          <Button onClick={() => void recorder.start()} disabled={recorder.status === "requesting"}>
            <Mic size={14} /> Bắt đầu ghi
          </Button>
        )}
        {isRecording && (
          <Button variant="danger" onClick={recorder.stop}>
            <Square size={14} /> Dừng
          </Button>
        )}
        {isRecorded && previewUrl && <audio src={previewUrl} controls className="h-8 min-w-0 flex-1" />}
        <span className="font-mono text-xs tabular-nums text-muted">
          {formatTime(recorder.elapsedSec)} / {formatTime(MAX_SOUND_DURATION_SEC)}
        </span>
      </div>

      {isRecording && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden>
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, recorder.level * 100)}%` }} />
        </div>
      )}

      {recorder.error && <p role="alert" className="text-xs text-danger">{recorder.error}</p>}
      {recorder.warning && <p className="text-xs text-warning-foreground">{recorder.warning}</p>}

      {isRecorded && (
        <Field label="Tên âm thanh">
          <input
            name="sound-name"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className={INPUT_CLASS}
          />
        </Field>
      )}

      {error && <p role="alert" className="rounded-card bg-danger-muted px-3 py-2 text-xs text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => { recorder.reset(); onCancel(); }} disabled={saving}>
          <X size={14} /> Huỷ
        </Button>
        {isRecorded && (
          <>
            <Button variant="secondary" onClick={() => recorder.reset()} disabled={saving}>
              Ghi lại
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function DeleteSoundDialog({
  sound,
  onClose,
  onDeleted,
}: {
  sound: CustomSound;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [externalCount, setExternalCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCustomSoundUsage(sound.id)
      .then((u) => !cancelled && setExternalCount(u.externalProjectCount))
      .catch((err) => !cancelled && setError(apiErrorMessage(err, "Không kiểm tra được âm thanh này đang được dùng ở đâu.")));
    return () => {
      cancelled = true;
    };
  }, [sound.id]);

  async function run(mode: "self" | "hard") {
    setBusy(true);
    setError(null);
    try {
      await deleteCustomSound(sound.id, mode);
      onDeleted();
    } catch (err) {
      setError(apiErrorMessage(err, "Không xoá được âm thanh."));
      setBusy(false);
    }
  }

  const shared = (externalCount ?? 0) > 0;

  return (
    <Dialog title={`Xoá “${sound.name}”?`} onClose={onClose} closeDisabled={busy} role="alertdialog" className="max-w-md p-6">
      <div className="mb-5 space-y-2 text-[13px] leading-relaxed text-muted">
        {externalCount === null && !error && <p>Đang kiểm tra âm thanh này đang được dùng ở đâu…</p>}
        {externalCount !== null && !shared && (
          <p>Âm thanh sẽ bị xoá vĩnh viễn. Các nốt trong dự án của bạn đang dùng nó sẽ phát bằng nhạc cụ của track.</p>
        )}
        {shared && (
          <>
            <p>
              Âm thanh này đang được dùng trong <strong className="text-foreground">{externalCount} dự án của người khác</strong>.
            </p>
            <p><strong className="text-foreground">Xoá khỏi thư viện của tôi:</strong> bạn không thấy nó nữa, dự án của bạn phát bằng nhạc cụ của track, nhưng dự án của người khác vẫn nghe được. File tự dọn khi không còn ai dùng.</p>
            <p><strong className="text-foreground">Xoá hoàn toàn:</strong> xoá file ngay, mọi dự án (kể cả của người khác) đều mất âm thanh này. Không hoàn tác được.</p>
          </>
        )}
      </div>
      <DialogError message={error} />
      <DialogActions>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Huỷ</Button>
        {shared && (
          <Button variant="secondary" onClick={() => void run("self")} disabled={busy}>
            Xoá khỏi thư viện của tôi
          </Button>
        )}
        <Button variant="danger" onClick={() => void run("hard")} disabled={busy || externalCount === null}>
          {busy ? "Đang xoá…" : shared ? "Xoá hoàn toàn" : "Xoá"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export interface SoundLibraryPanelProps {
  renderRowAction?: (sound: CustomSound) => React.ReactNode;
  onLibraryChange?: (library: CustomSoundLibrary) => void;
}

export function SoundLibraryPanel({ renderRowAction, onLibraryChange }: SoundLibraryPanelProps = {}) {
  const [library, setLibrary] = useState<CustomSoundLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CustomSound | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const onLibraryChangeRef = useRef(onLibraryChange);

  useEffect(() => {
    onLibraryChangeRef.current = onLibraryChange;
  }, [onLibraryChange]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listCustomSounds();
      setLibrary(next);
      onLibraryChangeRef.current?.(next);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Không tải được thư viện âm thanh."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp danh sách lần đầu
    void load();
  }, [load]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, []);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.(wav|mp3)$/i.test(file.name)) {
      setError("Chỉ nhận file WAV hoặc MP3.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const name = file.name.replace(/\.[^.]+$/, "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100) || "Âm thanh";
      await saveSound(file, name, "uploaded");
      await load();
    } catch (err) {
      setError(errorText(err, "Không tải lên được âm thanh."));
    } finally {
      setUploading(false);
    }
  }

  function togglePlay(sound: CustomSound) {
    const audio = audioRef.current;
    if (!audio || !sound.playbackUrl) return;
    if (playingId === sound.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = sound.playbackUrl;
    audio.currentTime = 0;
    audio.onended = () => setPlayingId(null);
    audio
      .play()
      .then(() => setPlayingId(sound.id))
      .catch(() => setError("Không phát được âm thanh này."));
  }

  const items = library?.items ?? [];
  const usedPct = library ? Math.min(100, (library.usedBytes / library.quotaBytes) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <audio ref={audioRef} />

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInputRef} type="file" accept={ACCEPT} onChange={(e) => void handleFileSelect(e)} className="hidden" />
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading || recording}>
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? "Đang tải lên…" : "Tải lên"}
        </Button>
        <Button variant="secondary" onClick={() => setRecording(true)} disabled={uploading || recording}>
          <Mic size={14} /> Ghi âm
        </Button>
        <span className="text-xs text-muted">WAV hoặc MP3, tối đa {MAX_SOUND_DURATION_SEC} giây</span>
      </div>

      {library && (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-muted">
            <span>Dung lượng thư viện</span>
            <span className="font-mono tabular-nums">
              {formatSize(library.usedBytes)} / {formatSize(library.quotaBytes)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden>
            <div className={`h-full rounded-full ${usedPct >= 90 ? "bg-warning" : "bg-accent"}`} style={{ width: `${usedPct}%` }} />
          </div>
        </div>
      )}

      {recording && (
        <RecordSection
          onCancel={() => setRecording(false)}
          onSaved={() => {
            setRecording(false);
            void load();
          }}
        />
      )}

      {error && (
        <p role="alert" className="rounded-card bg-danger-muted px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {loading && !library ? (
        <div className="flex justify-center py-8 text-muted">
          <Loader2 size={20} className="animate-spin" aria-label="Đang tải…" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Music} title="Chưa có âm thanh nào" description="Tải lên file hoặc ghi âm trực tiếp để dùng làm tiếng cho nốt nhạc." />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((sound) => (
            <li key={sound.id} className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2">
              <button
                type="button"
                onClick={() => togglePlay(sound)}
                disabled={!sound.playbackUrl}
                aria-label={playingId === sound.id ? `Dừng nghe ${sound.name}` : `Nghe thử ${sound.name}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-foreground hover:bg-surface-subtle disabled:opacity-50"
              >
                {playingId === sound.id ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">{sound.name}</div>
                <div className="text-xs text-muted">
                  <span className="font-mono tabular-nums">{formatTime(sound.durationSec)}</span> · {formatSize(sound.sizeBytes)} ·{" "}
                  {sound.source === "recorded" ? "Ghi âm" : "Tải lên"}
                </div>
              </div>
              {renderRowAction?.(sound)}
              <button
                type="button"
                onClick={() => setDeleting(sound)}
                aria-label={`Xoá ${sound.name}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-danger-muted hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <DeleteSoundDialog
          sound={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            if (playingId === deleting.id) audioRef.current?.pause();
            setDeleting(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
