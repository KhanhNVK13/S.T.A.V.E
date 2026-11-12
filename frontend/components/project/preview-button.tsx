"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { useT } from "../../context/i18n-context";
import { useAuth } from "../../context/auth-context";
import { getProjectPreview, recordProjectPlay } from "../../lib/api-client";
import { apiErrorMessage } from "../../lib/error-message";
import { SnapshotPlayer } from "../../lib/snapshot-player";
import { Button } from "../ui/button";

type Status = "idle" | "loading" | "playing";

export function ProjectPreviewButton({
  projectId,
  projectName,
  variant = "secondary",
  compact = false,
  countPlay = true,
  isPublic = true,
}: {
  projectId: string;
  projectName: string;
  variant?: "primary" | "secondary" | "ghost";
  compact?: boolean;
  countPlay?: boolean;
  isPublic?: boolean;
}) {
  const t = useT();
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const playerRef = useRef<SnapshotPlayer | null>(null);

  useEffect(() => {
    const player = new SnapshotPlayer();
    playerRef.current = player;
    return () => {
      player.stop();
      playerRef.current = null;
    };
  }, []);

  async function toggle() {
    const player = playerRef.current;
    if (!player) return;
    if (status === "playing") {
      player.stop();
      setStatus("idle");
      return;
    }
    if (status === "loading") return;
    setMessage(null);
    setStatus("loading");
    try {
      const preview = await getProjectPreview(projectId, isPublic);
      if (!preview.snapshot) {
        setMessage(t("preview.empty"));
        setStatus("idle");
        return;
      }
      const started = await player.play(preview.snapshot, new Map(), () => setStatus("idle"));
      if (!started) {
        setMessage(t("preview.noNotes"));
        setStatus("idle");
        return;
      }
      setStatus("playing");
      if (isPublic && countPlay && user) void recordProjectPlay(projectId).catch(() => undefined);
    } catch (err) {
      setMessage(apiErrorMessage(err, t("preview.error")));
      setStatus("idle");
    }
  }

  const playing = status === "playing";
  const loading = status === "loading";
  const label = playing ? t("preview.stop") : loading ? t("preview.loading") : t("preview.play");
  const ariaLabel = playing
    ? t("preview.stopFor", { name: projectName })
    : t("preview.playFor", { name: projectName });

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={variant}
        onClick={() => void toggle()}
        aria-label={ariaLabel}
        aria-busy={loading}
        className={compact ? "h-8 px-3" : undefined}
      >
        {loading ? (
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
        ) : playing ? (
          <Square aria-hidden="true" className="h-3.5 w-3.5" />
        ) : (
          <Play aria-hidden="true" className="h-3.5 w-3.5" />
        )}{" "}
        {label}
      </Button>
      <p role="status" className="min-h-0 text-xs text-muted empty:hidden">
        {message ?? ""}
      </p>
    </div>
  );
}
