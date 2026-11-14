"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, MoreHorizontal, Mic, Music, Pause, Pencil, Play, Save, Square, Trash2, Upload, X } from "lucide-react";
import {
  confirmCustomSoundUpload,
  createCustomSoundUploadUrl,
  deleteCustomSound,
  getCustomSoundUsage,
  listCustomSounds,
  renameCustomSound,
} from "../../lib/api-client";
import type { CustomSound, CustomSoundLibrary, CustomSoundUsage } from "../../lib/api-client";
import { supabase } from "../../lib/supabase-browser";
import { errorSource, rawErrorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { encodeWav, normalizeForStorage } from "../../lib/wav-encoder";
import { useAudioRecorder } from "../../lib/use-audio-recorder";
import { loadWaveformPeaks } from "../../lib/sound-waveform";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogActions, DialogError } from "../ui/dialog";
import { EmptyState } from "../ui/empty-state";
import { Field, INPUT_CLASS } from "../ui/form";
import { useI18n } from "../../context/i18n-context";
import { tNow, type TKey } from "../../lib/i18n";

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
    throw new Error(tNow("snd.undecodable"));
  }
  if (buffer.duration > MAX_SOUND_DURATION_SEC) {
    throw new Error(tNow("snd.tooLong", { sec: Math.ceil(buffer.duration), max: MAX_SOUND_DURATION_SEC }));
  }

  const wav = encodeWav(await normalizeForStorage(buffer));
  if (wav.size > MAX_SIZE_BYTES) {
    throw new Error(tNow("snd.tooBigStored"));
  }

  const { soundId, path, token } = await createCustomSoundUploadUrl({
    durationSec: buffer.duration,
    sizeBytes: wav.size,
  });

  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(path, token, wav, { contentType: "audio/wav" });
  if (error) throw new Error(tNow("snd.uploadFail"));

  return confirmCustomSoundUpload({ soundId, name, source: kind });
}

function isErrorSource(value: unknown): value is ErrorSource {
  return typeof value === "object" && value !== null && "fallback" in value;
}

function toErrorSource(err: unknown, fallback: TKey): ErrorSource {
  if (err instanceof Error && !("status" in err)) return rawErrorSource(err.message);
  return errorSource(err, fallback);
}

function RecordSection({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const { t, locale } = useI18n();
  const recorder = useAudioRecorder(MAX_SOUND_DURATION_SEC);
  const [name, setName] = useState(() =>
    t("snd.recordingName", { when: new Date().toLocaleString(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) }),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorSource | null>(null);
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
      setError(errorSource(null, "snd.nameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveSound(recorder.blob, trimmed, "recorded");
      onSaved();
    } catch (err) {
      setError(toErrorSource(err, "snd.saveRecordingFail"));
    } finally {
      setSaving(false);
    }
  }

  const isRecording = recorder.status === "recording";
  const isRecorded = recorder.status === "recorded" && !!recorder.blob;

  return (
    <section aria-label={t("snd.recordSection")} className="flex flex-col gap-3 rounded-card border border-border bg-surface-subtle p-4">
      <div className="flex items-center gap-3">
        {!isRecording && !isRecorded && (
          <Button onClick={() => void recorder.start()} disabled={recorder.status === "requesting"}>
            <Mic size={14} /> {t("snd.startRecording")}
          </Button>
        )}
        {isRecording && (
          <Button variant="danger" onClick={recorder.stop}>
            <Square size={14} /> {t("snd.stop")}
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
        <Field label={t("snd.soundName")}>
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

      {error && <p role="alert" className="rounded-card bg-danger-muted px-3 py-2 text-xs text-danger">{renderError(error)}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => { recorder.reset(); onCancel(); }} disabled={saving}>
          <X size={14} /> {t("ui.cancel")}
        </Button>
        {isRecorded && (
          <>
            <Button variant="secondary" onClick={() => recorder.reset()} disabled={saving}>
              {t("snd.rerecord")}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? t("snd.saving") : t("snd.save")}
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
  const { t, tx } = useI18n();
  const [externalCount, setExternalCount] = useState<number | null>(null);
  const [usage, setUsage] = useState<CustomSoundUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCustomSoundUsage(sound.id)
      .then((u) => {
        if (cancelled) return;
        setExternalCount(u.externalProjectCount);
        setUsage(u);
      })
      .catch((err) => !cancelled && setError(errorSource(err, "snd.usageFail")));
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
      setError(errorSource(err, "snd.deleteFail"));
      setBusy(false);
    }
  }

  const shared = (externalCount ?? 0) > 0;

  return (
    <Dialog title={t("snd.deleteTitle", { name: sound.name })} onClose={onClose} closeDisabled={busy} role="alertdialog" className="max-w-md p-6">
      <div className="mb-5 space-y-2 text-[13px] leading-relaxed text-muted">
        {externalCount === null && !error && <p>{t("snd.checkingUsage")}</p>}
        {externalCount !== null && !shared && (
          <p>{t("snd.notShared")}</p>
        )}
        {shared && (
          <>
            <p>
              {tx("snd.sharedUse", { count: <strong className="text-foreground">{t("snd.sharedCount", { n: externalCount ?? 0 })}</strong> })}
            </p>
            {usage && (usage.externalProjects.length > 0 || usage.privateProjectCount > 0) && (
              <ul className="list-disc space-y-0.5 pl-5">
                {usage.externalProjects.map((p) => (
                  <li key={p.id} className="text-foreground">{p.name}</li>
                ))}
                {usage.privateProjectCount > 0 && (
                  <li>{t("snd.privateProjects", { n: usage.privateProjectCount })}</li>
                )}
              </ul>
            )}
            <p><strong className="text-foreground">{t("snd.removeSelfLabel")}</strong> {t("snd.removeSelfBody")}</p>
            <p><strong className="text-foreground">{t("snd.removeAllLabel")}</strong> {t("snd.removeAllBody")}</p>
          </>
        )}
      </div>
      <DialogError message={renderError(error)} />
      <DialogActions>
        <Button variant="secondary" onClick={onClose} disabled={busy}>{t("ui.cancel")}</Button>
        {shared && (
          <Button variant="secondary" onClick={() => void run("self")} disabled={busy}>
            {t("snd.removeSelf")}
          </Button>
        )}
        <Button variant="danger" onClick={() => void run("hard")} disabled={busy || externalCount === null}>
          {busy ? t("snd.deleting") : shared ? t("snd.deleteAll") : t("snd.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const WAVE_BARS = 48;
const WAVE_W = 96;
const WAVE_H = 28;

function Waveform({ soundId, url }: { soundId: string; url: string | null }) {
  const [peaks, setPeaks] = useState<number[] | "error" | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    loadWaveformPeaks(soundId, url, WAVE_BARS)
      .then((p) => !cancelled && setPeaks(p))
      .catch(() => !cancelled && setPeaks("error"));
    return () => {
      cancelled = true;
    };
  }, [soundId, url]);

  const bar = WAVE_W / WAVE_BARS;
  const values = Array.isArray(peaks) ? peaks : null;
  return (
    <svg
      width={WAVE_W}
      height={WAVE_H}
      viewBox={`0 0 ${WAVE_W} ${WAVE_H}`}
      className="hidden shrink-0 sm:block"
      aria-hidden="true"
    >
      {values
        ? values.map((v, i) => {
            const h = Math.max(2, v * (WAVE_H - 2));
            return (
              <rect
                key={i}
                x={i * bar + 0.5}
                y={(WAVE_H - h) / 2}
                width={Math.max(1, bar - 1)}
                height={h}
                rx={0.5}
                style={{ fill: "var(--accent)" }}
              />
            );
          })
        : (
          <line
            x1={0}
            x2={WAVE_W}
            y1={WAVE_H / 2}
            y2={WAVE_H / 2}
            strokeWidth={2}
            strokeDasharray="2 3"
            style={{ stroke: "var(--border-strong)" }}
          />
        )}
    </svg>
  );
}

function RowMenu({
  name,
  onRename,
  onDelete,
}: {
  name: string;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("snd.options", { name })}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-subtle hover:text-foreground"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 min-w-40 rounded-card border border-border bg-surface p-1 text-[13px]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-surface-subtle"
          >
            <Pencil size={14} aria-hidden /> {t("snd.rename")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-danger hover:bg-danger-muted"
          >
            <Trash2 size={14} aria-hidden /> {t("snd.delete")}
          </button>
        </div>
      )}
    </div>
  );
}

export interface SoundLibraryPanelProps {
  renderRowAction?: (sound: CustomSound) => React.ReactNode;
  mappedIds?: Set<string>;
  onLibraryChange?: (library: CustomSoundLibrary) => void;
}

export function SoundLibraryPanel({ renderRowAction, mappedIds, onLibraryChange }: SoundLibraryPanelProps = {}) {
  const { t } = useI18n();
  const [library, setLibrary] = useState<CustomSoundLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorSource | null>(null);
  const [loadError, setLoadError] = useState<ErrorSource | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CustomSound | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<ErrorSource | null>(null);
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
      setLoadError(null);
    } catch (err) {
      setLoadError(errorSource(err, "snd.loadFail"));
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
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    const rejected: string[] = [];
    let saved = 0;
    for (const file of files) {
      try {
        if (!/\.(wav|mp3)$/i.test(file.name)) throw errorSource(null, "snd.onlyWavMp3");
        if (file.size > MAX_SIZE_BYTES) throw errorSource(null, "snd.fileTooBig", { size: formatSize(file.size) });
        const name = file.name.replace(/\.[^.]+$/, "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100) || t("snd.defaultName");
        await saveSound(file, name, "uploaded");
        saved++;
      } catch (err) {
        const source = isErrorSource(err) ? err : toErrorSource(err, "snd.uploadError");
        const reason = renderError(source) ?? "";
        rejected.push(files.length > 1 ? `${file.name}: ${reason}` : reason);
      }
    }
    if (saved > 0) await load();
    if (rejected.length > 0) setError(rawErrorSource(rejected.join(" ")));
    setUploading(false);
  }

  async function submitRename(sound: CustomSound) {
    const next = renameValue.trim();
    if (!next) {
      setRenameError(errorSource(null, "snd.nameRequired"));
      return;
    }
    if (next === sound.name) {
      setRenamingId(null);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      await renameCustomSound(sound.id, next);
      setRenamingId(null);
      await load();
    } catch (err) {
      setRenameError(errorSource(err, "snd.renameFail"));
    } finally {
      setRenameBusy(false);
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
      .catch(() => setError(errorSource(null, "snd.playFail")));
  }

  const items = library?.items ?? [];
  const usedPct = library ? Math.min(100, (library.usedBytes / library.quotaBytes) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <audio ref={audioRef} />

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInputRef} type="file" accept={ACCEPT} multiple onChange={(e) => void handleFileSelect(e)} className="hidden" />
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading || recording}>
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? t("snd.uploading") : t("snd.upload")}
        </Button>
        <Button variant="secondary" onClick={() => setRecording(true)} disabled={uploading || recording}>
          <Mic size={14} /> {t("snd.record")}
        </Button>
        <span className="text-xs text-muted">{t("snd.limits", { sec: MAX_SOUND_DURATION_SEC })}</span>
      </div>

      {library && (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-muted">
            <span>{t("snd.quota")}</span>
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
          {renderError(error)}
        </p>
      )}

      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-xs text-danger"
        >
          <span>{renderError(loadError)}</span>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            {t("ui.retry")}
          </Button>
        </div>
      )}

      {loadError && !library ? null : loading && !library ? (
        <div className="flex justify-center py-8 text-muted">
          <Loader2 size={20} className="animate-spin" aria-label={t("ui.loading")} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Music} title={t("snd.emptyTitle")} description={t("snd.emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((sound) => (
            <li key={sound.id} className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2">
              <button
                type="button"
                onClick={() => togglePlay(sound)}
                disabled={!sound.playbackUrl}
                aria-label={playingId === sound.id ? t("snd.stopListening", { name: sound.name }) : t("snd.listen", { name: sound.name })}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-foreground hover:bg-surface-subtle disabled:opacity-50"
              >
                {playingId === sound.id ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <div className="min-w-0 flex-1">
                {renamingId === sound.id ? (
                  <form
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitRename(sound);
                    }}
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    <input
                      name="sound-rename"
                      autoComplete="off"
                      data-autofocus
                      autoFocus
                      value={renameValue}
                      maxLength={100}
                      aria-label={t("snd.newName", { name: sound.name })}
                      onChange={(e) => {
                        setRenameValue(e.target.value);
                        setRenameError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setRenamingId(null);
                        }
                      }}
                      className={`${INPUT_CLASS} h-8 min-w-0 flex-1`}
                    />
                    <Button type="submit" disabled={renameBusy}>
                      {renameBusy ? t("snd.saving") : t("snd.save")}
                    </Button>
                    <Button type="button" variant="ghost" disabled={renameBusy} onClick={() => setRenamingId(null)}>
                      {t("ui.cancel")}
                    </Button>
                    {renameError && (
                      <p role="alert" className="basis-full text-xs text-danger">
                        {renderError(renameError)}
                      </p>
                    )}
                  </form>
                ) : (
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13px] font-semibold">{sound.name}</span>
                    {mappedIds && (
                      <Badge variant={mappedIds.has(sound.id) ? "success" : "neutral"}>
                        {mappedIds.has(sound.id) ? t("snd.assigned") : t("snd.unassigned")}
                      </Badge>
                    )}
                  </div>
                )}
                <div className="text-xs text-muted">
                  <span className="font-mono tabular-nums">{formatTime(sound.durationSec)}</span> · {formatSize(sound.sizeBytes)} ·{" "}
                  {sound.source === "recorded" ? t("snd.recorded") : t("snd.uploaded")}
                </div>
                {!sound.playbackUrl && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-warning-foreground">
                    <AlertTriangle size={12} aria-hidden /> {t("snd.unavailable")}
                  </div>
                )}
              </div>
              <Waveform soundId={sound.id} url={sound.playbackUrl} />
              {renderRowAction?.(sound)}
              <RowMenu
                name={sound.name}
                onRename={() => {
                  setRenameValue(sound.name);
                  setRenameError(null);
                  setRenamingId(sound.id);
                }}
                onDelete={() => setDeleting(sound)}
              />
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
