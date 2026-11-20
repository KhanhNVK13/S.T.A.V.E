"use client";

import Link from "next/link";
import { GitFork, MessageSquare, Play } from "lucide-react";
import type { PublicProject } from "../../lib/api-client";
import { formatRelativeTime } from "../../lib/format-date";
import { useT } from "../../context/i18n-context";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { RowHeader, RowItem, RowList, RowStat, RowTime, RowTitle } from "../ui/row-list";

const COLS = "md:grid-cols-[minmax(0,1fr)_112px_84px_84px_108px]";
const COLS_COMMENTS = "md:grid-cols-[minmax(0,1fr)_112px_84px_84px_84px_108px]";
const COLS_RANKED = "md:grid-cols-[52px_minmax(0,1fr)_112px_84px_84px_108px]";
const COLS_RANKED_COMMENTS = "md:grid-cols-[52px_minmax(0,1fr)_112px_84px_84px_84px_108px]";

function RankBadge({ rank }: { rank: number }) {
  const podium = rank <= 3;
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
        podium ? "bg-metal-muted text-metal-foreground" : "bg-foreground/10 text-muted"
      }`}
    >
      {rank}
    </span>
  );
}

export function ProjectRows({
  projects,
  showOwner = true,
  rankFrom,
}: {
  projects: PublicProject[];
  showOwner?: boolean;
  rankFrom?: number;
}) {
  const t = useT();
  const showComments = projects.some((p) => p.comment_count !== undefined);
  const cols =
    rankFrom === undefined
      ? showComments
        ? COLS_COMMENTS
        : COLS
      : showComments
        ? COLS_RANKED_COMMENTS
        : COLS_RANKED;

  return (
    <RowList cols={cols}>
      <RowHeader>
        {rankFrom !== undefined && <span>{t("rk.colRank")}</span>}
        <span>{t("ex.colProject")}</span>
        <span>{t("ex.colGenre")}</span>
        <span>{t("ex.colPlays")}</span>
        <span>Fork</span>
        {showComments && <span>{t("ex.colComments")}</span>}
        <span className="text-right">{t("ex.colUpdated")}</span>
      </RowHeader>

      {projects.map((project, index) => {
        const ownerName = project.owner.display_name ?? project.owner.username ?? t("ex.user");
        return (
          <RowItem key={project.id}>
            {rankFrom !== undefined && <RankBadge rank={rankFrom + index} />}
            <RowTitle
              href={`/projects/${project.id}`}
              name={project.name}
              leading={
                showOwner ? (
                  <Avatar id={project.owner.id} label={ownerName} imageUrl={project.owner.avatar_url} />
                ) : undefined
              }
              meta={
                showOwner ? (
                  <>
                    <Link href={`/creator/${project.owner.id}`} className="underline-offset-4 hover:text-foreground hover:underline">
                      {ownerName}
                    </Link>
                    {project.description ? ` · ${project.description}` : ""}
                  </>
                ) : (
                  (project.description ?? undefined)
                )
              }
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 md:contents">
              <span className={project.genre ? undefined : "hidden md:block"}>
                {project.genre && <Badge variant="neutral">{project.genre}</Badge>}
              </span>
              <RowStat icon={Play} value={project.play_count} title={t("ex.statPlays")} />
              <RowStat icon={GitFork} value={project.fork_count} title={t("ex.statForks")} />
              {showComments && (
                <RowStat
                  icon={MessageSquare}
                  value={project.comment_count ?? 0}
                  title={t("ex.statComments")}
                />
              )}
              <RowTime>{formatRelativeTime(project.updated_at)}</RowTime>
            </div>
          </RowItem>
        );
      })}
    </RowList>
  );
}

export function ProjectRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <RowList>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-[68px] animate-pulse items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 motion-reduce:animate-none"
        >
          <div className="h-8 w-8 shrink-0 rounded-full bg-surface-subtle" />
          <div className="flex-1">
            <div className="mb-1.5 h-3 w-1/3 rounded bg-surface-subtle" />
            <div className="h-2.5 w-1/4 rounded bg-surface-subtle" />
          </div>
        </div>
      ))}
    </RowList>
  );
}
