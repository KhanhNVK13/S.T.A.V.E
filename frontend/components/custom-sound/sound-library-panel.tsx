"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Play, Pause, Trash2, Loader2, Music, X, Mic, Square, Save } from "lucide-react";
import {
  ApiError,
  createCustomSoundUploadUrl,
  confirmCustomSoundUpload,
  listCustomSounds,
  deleteCustomSound,
} from "../../lib/api-client";
import type { CustomSound } from "../../lib/api-client";
import { supabase } from "../../lib/supabase-browser";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { encodeWav } from "../../lib/wav-encoder";
import { useAudioRecorder, MAX_RECORDING_SEC } from "../../lib/use-audio-recorder";

const BUCKET = "custom-sounds";
/** BR-60 — 30 giây và 10MB cho custom sound recording */
const MAX_SOUND_DURATION_SEC = 30;
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = [".wav", ".mp3", ".ogg", ".flac", ".webm"];

function formatTime(sec: number): string {
  const total = Math.floor(sec);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** UC-118: Recording modal */
function RecordingModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const recorder = useAudioRecorder();
  const [name, setName] = useState(`Sound ${new Date().toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Tạo preview URL khi có blob
  useEffect(() => {
    if (!recorder.blob) return;
    const url = URL.createObjectURL(recorder.blob);
    setRecordingBlob(recorder.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recorder.blob]);

  // Cleanup audio khi đóng
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function handleStopRecording() {
    recorder.stop();
  }

  function handlePlayPreview() {
    if (!previewUrl) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.src === previewUrl && !audio.paused) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    audio.src = previewUrl;
    audio.currentTime = 0;
    void audio.play().then(() => setIsPlaying(true));
    audio.onended = () => setIsPlaying(false);
  }

  async function handleSave() {
    if (!recordingBlob) return;
    setSaving(true);

    try {
      // Decode blob → encode WAV → upload
      const arrayBuffer = await recordingBlob.arrayBuffer();
      const audioContext = new AudioContext();
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      } finally {
        await audioContext.close();
      }

      // Encode WAV
      const wavBuffer = encodeWav(audioBuffer);
      const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });

      // Validate size
      if (wavBlob.size > MAX_SIZE_BYTES) {
        throw new Error(`File quá lớn. Tối đa ${MAX_SIZE_BYTES / 1024 / 1024}MB (BR-60).`);
      }

      const durationSec = audioBuffer.duration;
      if (durationSec > MAX_SOUND_DURATION_SEC) {
        throw new Error(`Âm thanh quá dài. Tối đa ${MAX_SOUND_DURATION_SEC} giây (BR-60).`);
      }

      const mimeType = "audio/wav";

      // Bước 1: xin signed URL
      const { soundId, path } = await createCustomSoundUploadUrl({
        durationSec,
        sizeBytes: wavBlob.size,
        name,
        mimeType,
      });

      // Bước 2: upload WAV lên Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, wavBlob, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        throw new Error("Upload thất bại: " + uploadError.message);
      }

      // Bước 3: confirm với backend
      await confirmCustomSoundUpload({
        soundId,
        name,
        originalFilename: `${name}.wav`,
        durationSec,
        sizeBytes: wavBlob.size,
        mimeType,
      });

      onSaved();
      onClose();
    } catch (err) {
      alert(messageOf(err, "Lưu thất bại."));
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    recorder.reset();
    setRecordingBlob(null);
    setPreviewUrl(null);
  }

  const isRecording = recorder.status === "recording";
  const isRecorded = recorder.status === "recorded" || !!recordingBlob;
  const maxTime = Math.min(MAX_SOUND_DURATION_SEC, MAX_RECORDING_SEC);

  return (
    <div className="flex flex-col gap-4 p-4">
      <audio ref={audioRef} />

      {/* Timer + waveform */}
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-subtle p-6">
        {/* Timer */}
        <div className="text-4xl font-mono font-bold tabular-nums text-foreground">
          {formatTime(recorder.elapsedSec)} / {formatTime(maxTime)}
        </div>

        {/* Level meter */}
        <div className="h-2 w-full max-w-xs rounded-full bg-border">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${Math.min(100, recorder.level * 100)}%` }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {!isRecording && !isRecorded && (
            <Button
              onClick={() => void recorder.start()}
              disabled={recorder.status === "requesting"}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Mic className="h-5 w-5" />
            </Button>
          )}

          {isRecording && (
            <Button
              onClick={handleStopRecording}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Square className="h-5 w-5" />
            </Button>
          )}

          {isRecorded && (
            <>
              <Button
                onClick={handlePlayPreview}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
              </Button>
              <Button
                onClick={handleDiscard}
                variant="secondary"
                className="flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                Xoá
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Name input (chỉ hiện khi đã record) */}
      {isRecorded && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-foreground">Tên sound</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Nhập tên sound..."
          />
        </div>
      )}

      {/* Error */}
      {recorder.error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {recorder.error}
        </div>
      )}

      {/* Warning */}
      {recorder.warning && (
        <div className="rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-600">
          {recorder.warning}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Huỷ
        </Button>
        {isRecorded && (
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Lưu
          </Button>
        )}
      </div>
    </div>
  );
}

/** Panel hiển thị Sound Library trong MIDI Editor toolbar */
export function SoundLibraryPanel() {
  const [sounds, setSounds] = useState<CustomSound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showRecord, setShowRecord] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSounds(await listCustomSounds());
      setError(null);
    } catch (err) {
      setError(messageOf(err, "Không tải được danh sách sound."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Dọn audio khi unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  /** Lấy thời lượng file audio bằng AudioContext */
  async function getAudioDuration(file: File): Promise<number> {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext();
    try {
      const buffer = await audioContext.decodeAudioData(arrayBuffer);
      return buffer.duration;
    } finally {
      await audioContext.close();
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setError(null);

    if (file.size > MAX_SIZE_BYTES) {
      setError(`File quá lớn. Tối đa ${MAX_SIZE_BYTES / 1024 / 1024}MB (BR-60).`);
      return;
    }

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext)) {
      setError(`Định dạng không được hỗ trợ. Chỉ chấp nhận: ${ACCEPTED_TYPES.join(", ")}`);
      return;
    }

    setUploading(true);
    try {
      const durationSec = await getAudioDuration(file);
      if (durationSec > MAX_SOUND_DURATION_SEC) {
        setError(`Âm thanh quá dài. Tối đa ${MAX_SOUND_DURATION_SEC} giây (BR-60).`);
        return;
      }

      const mimeType = file.type || "audio/wav";
      const name = file.name.replace(/\.[^.]+$/, "");

      const { soundId, path } = await createCustomSoundUploadUrl({
        durationSec,
        sizeBytes: file.size,
        name,
        mimeType,
      });

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        throw new Error("Upload thất bại: " + uploadError.message);
      }

      await confirmCustomSoundUpload({
        soundId,
        name,
        originalFilename: file.name,
        durationSec,
        sizeBytes: file.size,
        mimeType,
      });

      await load();
    } catch (err) {
      setError(messageOf(err, "Upload thất bại."));
    } finally {
      setUploading(false);
    }
  }

  function playSound(sound: CustomSound) {
    if (!sound.playbackUrl) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.src === sound.playbackUrl && !audio.paused) {
      audio.pause();
      setPlayingId(null);
      return;
    }

    audio.src = sound.playbackUrl;
    audio.currentTime = 0;
    void audio.play().then(() => setPlayingId(sound.id));
    audio.onended = () => setPlayingId(null);
  }

  async function handleDelete(sound: CustomSound) {
    setDeletingId(sound.id);
    try {
      await deleteCustomSound(sound.id);
      await load();
    } catch (err) {
      setError(messageOf(err, "Xoá thất bại."));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {showRecord && (
        <RecordingModal
          onClose={() => setShowRecord(false)}
          onSaved={() => {
            setShowRecord(false);
            void load();
          }}
        />
      )}

      <div className="flex flex-col gap-4 p-4">
        {/* Hidden audio player */}
        <audio ref={audioRef} />

        {/* Upload + Record buttons */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowRecord(true)}
            className="flex items-center gap-2"
          >
            <Mic className="h-4 w-4" />
            Record
          </Button>
          <span className="text-xs text-muted-foreground">
            Tối đa {MAX_SOUND_DURATION_SEC}s, {MAX_SIZE_BYTES / 1024 / 1024}MB
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Sound list */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sounds.length === 0 ? (
          <EmptyState
            icon={<Music className="h-8 w-8 text-muted-foreground" />}
            title="Chưa có custom sound"
            description="Upload file hoặc record trực tiếp để tạo custom sound"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {sounds.map((sound) => (
              <div
                key={sound.id}
                className="flex items-center gap-3 rounded-md border border-border bg-surface p-3"
              >
                <button
                  onClick={() => playSound(sound)}
                  disabled={!sound.playbackUrl}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
                >
                  {playingId === sound.id ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4 ml-0.5" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">{sound.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatTime(sound.duration_sec)} · {formatSize(sound.size_bytes)}
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(sound)}
                  disabled={deletingId === sound.id}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  {deletingId === sound.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
