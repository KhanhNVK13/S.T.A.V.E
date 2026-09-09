"use client";

import Link from "next/link";
import { Play, GitFork } from "lucide-react";
import type { PublicProject } from "../lib/api-client";
import { Badge } from "./ui/badge";
import { Avatar } from "./ui/avatar";
import { ProjectThumb } from "./ui/project-thumb";

interface ProjectCardProps {
  project: PublicProject;
  showOwner?: boolean;
}

export function ProjectCard({ project, showOwner = true }: ProjectCardProps) {
  return (
    <div className="group relative flex flex-col rounded-card border border-slate-200 bg-white p-4 shadow-card transition-all hover:border-accent-300 hover:shadow-md">
      {/* Overlay link phủ toàn card - click vào vùng này sẽ mở chi tiết project */}
      <Link
        href={`/explore/${project.id}`}
        className="absolute inset-0 z-0"
        aria-label={`Mở dự án ${project.name}`}
      />

      <div className="relative z-10 mb-3">
        <ProjectThumb id={project.id} />
      </div>

      {/* Header: name + genre */}
      <div className="relative z-10 mb-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-1 font-semibold text-slate-900 group-hover:text-accent-700">
          {project.name}
        </h3>
        {project.genre && <Badge variant="info">{project.genre}</Badge>}
      </div>

      {/* Description */}
      {project.description && (
        <p className="relative z-10 mb-3 line-clamp-2 text-sm text-slate-500">
          {project.description}
        </p>
      )}

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="relative z-10 mb-3 flex flex-wrap gap-1">
          {project.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded bg-slate-50 px-1.5 py-0.5 text-xs text-slate-500">
              #{tag}
            </span>
          ))}
          {project.tags.length > 3 && (
            <span className="text-xs text-slate-500">+{project.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="flex-1" />

      {/* Footer: stats + owner */}
      <div className="relative z-10 flex items-center justify-between pt-2">
        <div className="flex items-center gap-3 font-mono text-xs text-slate-500">
          <span title="Lượt nghe" className="flex items-center gap-1">
            <Play className="h-3.5 w-3.5" /> {project.play_count.toLocaleString()}
          </span>
          <span title="Lượt fork" className="flex items-center gap-1">
            <GitFork className="h-3.5 w-3.5" /> {project.fork_count.toLocaleString()}
          </span>
        </div>

        {showOwner && (
          // Link owner nằm trên overlay (z-20) — khi click vào owner sẽ dừng propagation để không mở card
          <Link
            href={`/creator/${project.owner.id}`}
            className="relative z-20 flex items-center gap-1.5 text-xs text-slate-500 hover:text-accent-700"
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar
              id={project.owner.id}
              label={project.owner.display_name ?? project.owner.username ?? "?"}
              imageUrl={project.owner.avatar_url}
              size="sm"
            />
            <span className="max-w-[80px] truncate">
              {project.owner.display_name ?? project.owner.username}
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
