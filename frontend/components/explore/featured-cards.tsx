"use client";

import Link from "next/link";
import { GitFork, Play } from "lucide-react";
import type { PublicProject } from "../../lib/api-client";
import { formatRelativeTime } from "../../lib/format-date";
import { useT } from "../../context/i18n-context";
import { Badge } from "../ui/badge";
import { ProjectThumb } from "../ui/project-thumb";
import { RowStat, RowTime } from "../ui/row-list";

const TINTS = [
  "bg-[color-mix(in_oklab,var(--accent-muted)_42%,var(--surface))]",
  "bg-[color-mix(in_oklab,var(--violet-muted)_55%,var(--surface))]",
  "bg-[color-mix(in_oklab,var(--teal-muted)_55%,var(--surface))]",
] as const;

export function FeaturedCards({ projects }: { projects: PublicProject[] }) {
  const t = useT();
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
      {projects.map((project, index) => {
        const ownerName = project.owner.display_name ?? project.owner.username ?? t("ex.user");
        return (
          <li
            key={project.id}
            className={`flex min-w-0 flex-col justify-between gap-5 rounded-panel border border-border p-4 transition-transform duration-300 ease-out hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5 ${TINTS[index % TINTS.length]}`}
          >
            <div className="relative">
              <ProjectThumb id={project.id} className="!h-36 !rounded-[14px] !bg-background/55" />
              {project.genre && (
                <span className="absolute left-3 top-3">
                  <Badge variant="neutral">{project.genre}</Badge>
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-[26px] leading-tight tracking-[-0.03em]">
                <Link href={`/projects/${project.id}`} className="underline-offset-4 hover:text-accent hover:underline">
                  {project.name}
                </Link>
              </h3>
              <p className="mt-1.5 truncate text-sm text-muted">
                <Link href={`/creator/${project.owner.id}`} className="underline-offset-4 hover:text-foreground hover:underline">
                  {ownerName}
                </Link>
                {project.description ? ` · ${project.description}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1">
                <RowStat icon={Play} value={project.play_count} title={t("ex.statPlays")} />
                <RowStat icon={GitFork} value={project.fork_count} title={t("ex.statForks")} />
                <RowTime>{formatRelativeTime(project.updated_at)}</RowTime>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
