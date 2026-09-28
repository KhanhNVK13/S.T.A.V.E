"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Play, Pause, Trash2, Loader2, Music, X } from "lucide-react";
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

const BUCKET = "custom-sounds";
/** BR-60 — 30 giây và 10MB */
const MAX_DURATION_SEC = 30;
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

/** Panel hiển thị Sound Library trong MIDI Editor toolbar */
export function SoundLibraryPanel() {
  const [sounds, setSounds] = useState<CustomSound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    e.target.value = ""; // reset để chọn lại cùng file

    setError(null);

    // Validate size
    if (file.size > MAX_SIZE_BYTES) {
      setError(`File quá lớn. Tối đa ${MAX_SIZE_BYTES / 1024 / 1024}MB (BR-60).`);
      return;
    }

    // Validate type
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext)) {
      setError(`Định dạng không được hỗ trợ. Chỉ chấp nhận: ${ACCEPTED_TYPES.join(", ")}`);
      return;
    }

    setUploading(true);
    try {
      // Lấy duration
      const durationSec = await getAudioDuration(file);
      if (durationSec > MAX_DURATION_SEC) {
        setError(`Âm thanh quá dài. Tối đa ${MAX_DURATION_SEC} giây (BR-60).`);
        return;
      }

      const mimeType = file.type || "audio/wav";
      const name = file.name.replace(/\.[^.]+$/, ""); // bỏ extension

      // Bước 1: xin signed URL
      const { soundId, path, token } = await createCustomSoundUploadUrl({
        durationSec,
        sizeBytes: file.size,
        name,
        mimeType,
      });

      // Bước 2: upload trực tiếp lên Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
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
        originalFilename: file.name,
        durationSec,
        sizeBytes: file.size,
        mimeType,
      });

      // Refresh list
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
    <div className="flex flex-col gap-4 p-4">
      {/* Hidden audio player */}
      <audio ref={audioRef} />

      {/* Upload button */}
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
          Upload Sound
        </Button>
        <span className="text-xs text-muted-foreground">
          Tối đa {MAX_DURATION_SEC}s, {MAX_SIZE_BYTES / 1024 / 1024}MB
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
          description="Upload file âm thanh để sử dụng trong MIDI Editor"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {sounds.map((sound) => (
            <div
              key={sound.id}
              className="flex items-center gap-3 rounded-md border border-border bg-surface p-3"
            >
              {/* Play button */}
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

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">{sound.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatTime(sound.duration_sec)} · {formatSize(sound.size_bytes)}
                </div>
              </div>

              {/* Delete button */}
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
  );
}
