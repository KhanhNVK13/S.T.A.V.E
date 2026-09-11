"use client";

import Link from "next/link";
import { Play, GitFork } from "lucide-react";
import type { PublicProject } from "../lib/api-client";
import { Avatar } from "./ui/avatar";

interface ProjectCardProps {
  project: PublicProject;
  showOwner?: boolean;
}

/** Format relative time (e.g., "2 ngày trước", "10/09/2026") */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hôm nay';
  if (diffDays === 1) return '1 ngày trước';
  if (diffDays < 7) return `${diffDays} ngày trước`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`;

  // For older dates, show actual date
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Grid-style project card following Bible 13.5 design principles.
 * Provides enough information for users to make decisions without opening new tabs.
 * Thumbnail uses gradient placeholder with Music icon (no real waveform data yet).
 */
export function ProjectCard({ project, showOwner = true }: ProjectCardProps) {
  const ownerName = project.owner?.display_name ?? project.owner?.username ?? 'Người dùng';
  const timeAgo = formatRelativeTime(project.created_at);

  return (
    <article className="group flex flex-col overflow-hidden rounded-card border border-slate-200 bg-white transition-all hover:border-accent-600/30 hover:shadow-card">
      {/* Thumbnail / Preview Area — container `relative` này KHÔNG phải là <Link>, để nút
          Play (position: absolute, sibling) không bị lồng vào trong 1 phần tử tương tác khác. */}
      <div className="relative aspect-video bg-gradient-to-br from-accent-600/10 to-slate-100">
        {/* Link chỉ bọc nội dung trang trí (waveform + badge thể loại), không chứa button/link con
            nào khác — tránh nested interactive elements (a > button là vi phạm HTML semantics,
            gây lỗi Tab/Enter/right-click nếu chặn bằng stopPropagation thay vì sửa cấu trúc). */}
        <Link
          href={`/explore/${project.id}`}
          className="absolute inset-0 z-0"
          aria-label={`Xem chi tiết dự án ${project.name}`}
        >
          {/* Placeholder waveform visualization */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 24 }).map((_, i) => {
                // Generate deterministic "waveform" heights based on project id
                const hash = project.id.charCodeAt(i % project.id.length) + i;
                const height = 8 + (hash % 32);
                return (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-accent-600/40 transition-all group-hover:bg-accent-600/70"
                    style={{ height: `${height}px` }}
                  />
                );
              })}
            </div>
          </div>

          {/* Genre Badge */}
          {project.genre && (
            <span className="absolute left-3 top-3 rounded-full bg-accent-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              {project.genre}
            </span>
          )}
        </Link>

        {/* Play Preview Button — sibling của Link ở trên (không lồng bên trong), không cần stopPropagation */}
        <button
          onClick={() => {
            // TODO(PLACEHOLDER): Implement actual preview playback (UC-24 fork/play preview)
            console.log('Preview (PLACEHOLDER):', project.id);
          }}
          className="absolute bottom-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-accent-600 shadow-md backdrop-blur transition-all hover:scale-110 hover:bg-white"
          title="Nghe thử (PLACEHOLDER)"
        >
          <Play className="h-4 w-4 fill-current pl-0.5" />
        </button>
      </div>

      {/* Card Body */}
      <div className="flex flex-1 flex-col p-4">
        {/* Title — Link riêng, chỉ bọc text, không lồng bên trong Link thumbnail ở trên */}
        <Link
          href={`/explore/${project.id}`}
          className="mb-1 text-lg font-semibold leading-tight text-slate-900 line-clamp-1 hover:text-accent-600"
        >
          {project.name}
        </Link>

        {/* Owner + Time */}
        {showOwner && project.owner && (
          <Link
            href={`/creator/${project.owner.id}`}
            className="mb-2 flex items-center gap-1.5 text-xs text-slate-500 hover:text-accent-600"
          >
            <Avatar
              id={project.owner.id}
              label={ownerName}
              imageUrl={project.owner.avatar_url}
              size="sm"
            />
            <span>{ownerName}</span>
            <span className="text-slate-300">•</span>
            <span>{timeAgo}</span>
          </Link>
        )}

        {/* Description */}
        {project.description && (
          <p className="mb-3 line-clamp-2 text-sm text-slate-500">
            {project.description}
          </p>
        )}

        {/* Genre Tags */}
        {project.tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {project.tags.slice(0, 3).map((tag) => (
              <Link
                key={tag}
                href={`/explore?tag=${encodeURIComponent(tag)}`}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-accent-50 hover:text-accent-600"
              >
                #{tag}
              </Link>
            ))}
            {project.tags.length > 3 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                +{project.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Spacer to push footer down */}
        <div className="flex-1" />

        {/* Card Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          {/* Stats */}
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span title="Lượt nghe" className="flex items-center gap-1">
              <Play className="h-3.5 w-3.5" />
              {project.play_count.toLocaleString()}
            </span>
            <span title="Lượt fork" className="flex items-center gap-1">
              <GitFork className="h-3.5 w-3.5" />
              {project.fork_count.toLocaleString()}
            </span>
          </div>

          {/* Quick Action: Fork */}
          <button
            onClick={() => {
              // TODO(PLACEHOLDER): Implement fork with login redirect (UC-24)
              console.log('Fork (PLACEHOLDER):', project.id);
            }}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-accent-600 hover:text-accent-600"
            title="Fork (PLACEHOLDER)"
          >
            <GitFork className="h-3 w-3" />
            Fork
          </button>
        </div>
      </div>
    </article>
  );
}
