'use client';

import Link from 'next/link';
import type { PublicProject } from '../lib/api-client';
import { getInitials } from '../lib/format-name';

interface ProjectCardProps {
  project: PublicProject;
  showOwner?: boolean;
}

export function ProjectCard({ project, showOwner = true }: ProjectCardProps) {
  const ownerInitials = getInitials(project.owner.display_name, project.owner.username);

  return (
    <div className="group relative rounded-lg border border-[#E3E4E8] bg-white p-4 transition-all hover:border-[#1D4ED8] hover:shadow-md">
      {/* Overlay link phủ toàn card - click vào vùng này sẽ mở chi tiết project */}
      <Link
        href={`/explore/${project.id}`}
        className="absolute inset-0 z-0"
        aria-label={`Mở dự án ${project.name}`}
      />

      {/* Header: name + genre */}
      <div className="relative z-10 mb-2 flex items-start justify-between gap-2">
        <h3 className="font-semibold text-[#1F2126] line-clamp-1 group-hover:text-[#1D4ED8]">
          {project.name}
        </h3>
        {project.genre && (
          <span className="shrink-0 rounded-full bg-[#1D4ED8]/10 px-2 py-0.5 text-xs font-medium text-[#1D4ED8]">
            {project.genre}
          </span>
        )}
      </div>

      {/* Description */}
      {project.description && (
        <p className="relative z-10 mb-3 text-sm text-[#8A8D93] line-clamp-2">
          {project.description}
        </p>
      )}

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="relative z-10 mb-3 flex flex-wrap gap-1">
          {project.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded bg-[#F7F7F5] px-1.5 py-0.5 text-xs text-[#8A8D93]"
            >
              #{tag}
            </span>
          ))}
          {project.tags.length > 3 && (
            <span className="text-xs text-[#8A8D93]">+{project.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer: stats + owner */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-[#8A8D93]">
          <span title="Lượt nghe">
            🎵 {project.play_count.toLocaleString()}
          </span>
          <span title="Lượt fork">
            🍴 {project.fork_count.toLocaleString()}
          </span>
        </div>

        {showOwner && (
          // Link owner nằm trên overlay (z-20) — khi click vào owner sẽ dừng propagation để không mở card
          <Link
            href={`/creator/${project.owner.id}`}
            className="relative z-20 flex items-center gap-1.5 text-xs text-[#8A8D93] hover:text-[#1D4ED8]"
            onClick={(e) => e.stopPropagation()}
          >
            {project.owner.avatar_url ? (
              <img
                src={project.owner.avatar_url}
                alt={project.owner.display_name ?? project.owner.username ?? ''}
                className="h-5 w-5 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1D4ED8] text-[10px] font-semibold text-white">
                {ownerInitials}
              </div>
            )}
            <span className="truncate max-w-[80px]">
              {project.owner.display_name ?? project.owner.username}
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
