"use client";

import Link from "next/link";
import { Play, GitFork, Eye } from "lucide-react";
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
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-[#E3E4E8] bg-white transition-all hover:border-[#1D4ED8]/30 hover:shadow-lg">
      {/* Overlay link phủ toàn card */}
      <Link
        href={`/explore/${project.id}`}
        className="absolute inset-0 z-0"
        aria-label={`Xem chi tiết dự án ${project.name}`}
      />

      {/* Thumbnail / Preview Area */}
      <div className="relative aspect-video bg-gradient-to-br from-[#1D4ED8]/10 to-slate-100">
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
                  className="w-1 bg-[#1D4ED8]/40 rounded-full transition-all group-hover:bg-[#1D4ED8]/70"
                  style={{ height: `${height}px` }}
                />
              );
            })}
          </div>
        </div>

        {/* Play Preview Button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // TODO: Implement actual preview playback (UC-24 fork/play preview)
            console.log('Preview:', project.id);
          }}
          className="absolute bottom-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#1D4ED8] shadow-md backdrop-blur transition-all hover:bg-white hover:scale-110"
          title="Nghe thử"
        >
          <Play className="h-4 w-4 fill-current pl-0.5" />
        </button>

        {/* Genre Badge */}
        {project.genre && (
          <span className="absolute left-3 top-3 z-20 rounded-full bg-[#1D4ED8] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            {project.genre}
          </span>
        )}
      </div>

      {/* Card Body */}
      <div className="relative z-10 flex flex-1 flex-col p-4">
        {/* Title */}
        <h3 className="mb-1 text-lg font-semibold leading-tight text-[#1F2126] line-clamp-1 group-hover:text-[#1D4ED8]">
          {project.name}
        </h3>

        {/* Owner + Time */}
        {showOwner && project.owner && (
          <Link
            href={`/creator/${project.owner.id}`}
            onClick={(e) => e.stopPropagation()}
            className="mb-2 flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#1D4ED8]"
          >
            <Avatar
              id={project.owner.id}
              label={ownerName}
              imageUrl={project.owner.avatar_url}
              size="sm"
            />
            <span>{ownerName}</span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {timeAgo}
            </span>
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
              <span
                key={tag}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
              >
                #{tag}
              </span>
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
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // TODO: Implement fork with login redirect (UC-24)
              console.log('Fork:', project.id);
            }}
            className="z-20 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-[#1D4ED8] hover:text-[#1D4ED8]"
          >
            <GitFork className="h-3 w-3" />
            Fork
          </button>
        </div>
      </div>
    </article>
  );
}
