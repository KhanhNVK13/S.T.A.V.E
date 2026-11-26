"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { AudioWaveform } from "lucide-react";
import { getSimilarProjects, type SimilarProjectItem } from "../../lib/api-similar";
import { useI18n } from "../../context/i18n-context";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";

export function SimilarProjectsCard({
  projectId,
  isPublic = true,
}: {
  projectId: string;
  isPublic?: boolean;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const [state, setState] = useState<{
    projectId: string;
    items: SimilarProjectItem[];
  } | null>(null);

  useEffect(() => {
    if (!isPublic) return;
    let cancelled = false;
    getSimilarProjects(projectId)
      .then((items) => {
        if (!cancelled) setState({ projectId, items });
      })
      .catch(() => {
        if (!cancelled) setState({ projectId, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, isPublic]);

  if (!isPublic || !state || state.projectId !== projectId || state.items.length === 0) {
    return null;
  }

  return (
    <section
      data-testid="similar-projects-card"
      aria-labelledby={titleId}
      className="mt-5 rounded-card border border-border bg-surface"
    >
      <div className="border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <AudioWaveform className="h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
          <h2 id={titleId} className="text-[13px] font-semibold text-foreground">
            {t("sim.title")}
          </h2>
        </div>
        <p className="mt-0.5 text-xs text-muted">{t("sim.subtitle")}</p>
      </div>

      <ul className="grid gap-2.5 p-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
        {state.items.map((item) => {
          const ownerName =
            item.owner.display_name ?? item.owner.username ?? t("ui.unknownUser");
          const matchPct = Math.round(item.similarity * 100);
          const keyLabel =
            item.tonalityTonic && item.tonalityMode
              ? t(item.tonalityMode === "major" ? "sim.keyMajor" : "sim.keyMinor", {
                  tonic: item.tonalityTonic,
                })
              : null;

          return (
            <li key={item.id}>
              <Link
                href={`/projects/${item.id}`}
                className="flex h-full flex-col justify-between gap-2 rounded-card border border-border bg-surface-subtle/60 p-3 transition-colors hover:border-border-strong hover:bg-surface-subtle"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-[13px] font-semibold text-foreground">
                    {item.name}
                  </span>
                  <Badge variant="info">{t("sim.match", { pct: matchPct })}</Badge>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="neutral">{t("sim.bpm", { bpm: item.tempo })}</Badge>
                  {keyLabel && <Badge variant="neutral">{keyLabel}</Badge>}
                  {item.genre && <Badge variant="neutral">{item.genre}</Badge>}
                </div>

                <div className="flex items-center gap-2 text-xs text-muted">
                  <Avatar
                    id={item.owner.id}
                    label={ownerName}
                    imageUrl={item.owner.avatar_url}
                    size="sm"
                  />
                  <span className="truncate">{t("sim.by", { name: ownerName })}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
