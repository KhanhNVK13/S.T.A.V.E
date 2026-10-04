"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Music, Play, Pause, Trash2, X } from "lucide-react";
import {
  ApiError,
  listCustomSounds,
  createSoundMapping,
  type CustomSound,
} from "../../lib/api-client";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";

interface Props {
  projectId: string;
  trackId: string;
  pitch: number;
  onClose: () => void;
  onAssigned?: () => void;
}

function formatTime(sec: number): string {
  const total = Math.floor(sec);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** UC-57: Dialog chọn custom sound để assign vào note */
export function SoundMappingDialog({
  projectId,
  trackId,
  pitch,
  onClose,
  onAssigned,
}: Props) {
  const [sounds, setSounds] = useState<CustomSound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setSounds(await listCustomSounds());
      } catch (err) {
        setError(messageOf(err, "Không tải được danh sách sound."));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

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

  async function handleAssign(sound: CustomSound) {
    setAssigning(sound.id);
    setError(null);
    try {
      await createSoundMapping({
        projectId,
        trackId,
        pitch,
        soundId: sound.id,
      });
      onAssigned?.();
      onClose();
    } catch (err) {
      setError(messageOf(err, "Gán sound thất bại."));
    } finally {
      setAssigning(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <audio ref={audioRef} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Chọn Sound</h3>
          <p className="text-sm text-muted-foreground">
            Pitch: {pitch} · Track: {trackId.slice(0, 8)}...
          </p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
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
          description="Upload sound trước trong Sound Library"
        />
      ) : (
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {sounds.map((sound) => (
            <div
              key={sound.id}
              className="flex items-center gap-3 rounded-md border border-border bg-surface p-3 hover:border-accent/50"
            >
              {/* Play */}
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
                  {formatTime(sound.duration_sec)} · {(sound.size_bytes / 1024).toFixed(0)} KB
                </div>
              </div>

              {/* Assign */}
              <Button
                onClick={() => handleAssign(sound)}
                disabled={assigning !== null}
              >
                {assigning === sound.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Gán"
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Cancel */}
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Huỷ
        </Button>
      </div>
    </div>
  );
}
