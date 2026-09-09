'use client';

import { use } from 'react';
import Link from 'next/link';
import { getPublicUserProfile, getUserPublicProjects, PublicUserProfile, PublicProject } from '../../../lib/api-client';
import { ProjectCard } from '../../../components/project-card';
import { getInitials } from '../../../lib/format-name';
import { formatMonthYear } from '../../../lib/format-date';
import { useApiResource } from '../../../lib/use-api-resource';

interface Props {
  params: Promise<{ id: string }>;
}

interface CreatorPageData {
  profile: PublicUserProfile;
  projects: PublicProject[];
}

export default function CreatorProfilePage({ params }: Props) {
  const { id } = use(params);

  const { data, loading, error } = useApiResource<CreatorPageData>(
    () =>
      Promise.all([getPublicUserProfile(id), getUserPublicProjects(id)]).then(
        ([profile, projects]) => ({ profile, projects }),
      ),
    [id],
    'Không tìm thấy người dùng này.',
  );
  const profile = data?.profile ?? null;
  const projects = data?.projects ?? [];

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="animate-pulse">
          <div className="mb-8 flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-[#F7F7F5]" />
            <div>
              <div className="mb-2 h-6 w-48 rounded bg-[#F7F7F5]" />
              <div className="h-4 w-32 rounded bg-[#F7F7F5]" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-[#F7F7F5]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-lg border border-[#B3242E]/20 bg-[#B3242E]/5 p-8 text-center">
          <h1 className="text-xl font-semibold text-[#B3242E]">Không tìm thấy</h1>
          <p className="mt-2 text-[#8A8D93]">{error ?? 'Người dùng này không tồn tại.'}</p>
          <Link
            href="/explore"
            className="mt-4 inline-block rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1E40AF]"
          >
            Quay lại Khám phá
          </Link>
        </div>
      </div>
    );
  }

  const initials = getInitials(profile.display_name, profile.username);
  const joinDate = formatMonthYear(profile.created_at);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Profile Header */}
      <div className="mb-8 flex items-start gap-6">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.display_name ?? profile.username ?? ''}
            className="h-24 w-24 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#1D4ED8] text-3xl font-bold text-white">
            {initials}
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-[#1F2126]">
            {profile.display_name ?? profile.username ?? 'Người dùng'}
          </h1>
          <p className="text-[#8A8D93]">@{profile.username ?? 'unknown'}</p>
          {profile.bio && (
            <p className="mt-3 max-w-2xl text-[#1F2126]">{profile.bio}</p>
          )}
          <p className="mt-2 text-sm text-[#8A8D93]">
            Tham gia {joinDate}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-[#E3E4E8] bg-white p-4 text-center">
          <p className="text-3xl font-bold text-[#1F2126]">
            {profile.total_public_projects.toLocaleString()}
          </p>
          <p className="text-sm text-[#8A8D93]">Dự án công khai</p>
        </div>
        <div className="rounded-lg border border-[#E3E4E8] bg-white p-4 text-center">
          <p className="text-3xl font-bold text-[#1F2126]">
            {profile.total_forks.toLocaleString()}
          </p>
          <p className="text-sm text-[#8A8D93]">Lượt fork</p>
        </div>
      </div>

      {/* Projects */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-[#1F2126]">
          Dự án công khai ({projects.length})
        </h2>
        {projects.length === 0 ? (
          <div className="rounded-lg border border-[#E3E4E8] bg-white p-8 text-center">
            <p className="text-[#8A8D93]">Người dùng này chưa có dự án công khai nào.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} showOwner={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
