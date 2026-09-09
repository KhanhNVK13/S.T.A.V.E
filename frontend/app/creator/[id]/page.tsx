'use client';

import { use } from 'react';
import Link from 'next/link';
import { CalendarDays, FolderOpen } from 'lucide-react';
import { getPublicUserProfile, getUserPublicProjects, PublicUserProfile, PublicProject } from '../../../lib/api-client';
import { ProjectCard } from '../../../components/project-card';
import { formatMonthYear } from '../../../lib/format-date';
import { useApiResource } from '../../../lib/use-api-resource';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Avatar } from '../../../components/ui/avatar';
import { EmptyState } from '../../../components/ui/empty-state';

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
            <div className="h-20 w-20 rounded-full bg-slate-100" />
            <div>
              <div className="mb-2 h-6 w-48 rounded bg-slate-100" />
              <div className="h-4 w-32 rounded bg-slate-100" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 rounded-card bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-card border border-danger-600/20 bg-danger-50 p-8 text-center">
          <h1 className="text-xl font-semibold text-danger-600">Không tìm thấy</h1>
          <p className="mt-2 text-slate-500">{error ?? 'Người dùng này không tồn tại.'}</p>
          <Link href="/explore">
            <Button className="mt-4">Quay lại Khám phá</Button>
          </Link>
        </div>
      </div>
    );
  }

  const joinDate = formatMonthYear(profile.created_at);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Profile Header */}
      <Card className="mb-8 flex items-start gap-6 p-6">
        <Avatar
          id={profile.id}
          label={profile.display_name ?? profile.username ?? '?'}
          imageUrl={profile.avatar_url}
          size="lg"
        />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">
            {profile.display_name ?? profile.username ?? 'Người dùng'}
          </h1>
          <p className="text-slate-500">@{profile.username ?? 'unknown'}</p>
          {profile.bio && <p className="mt-3 max-w-2xl text-slate-700">{profile.bio}</p>}
          <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" /> Tham gia {joinDate}
          </p>
        </div>
      </Card>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-4 text-center">
          <p className="font-mono text-3xl font-bold text-slate-900">
            {profile.total_public_projects.toLocaleString()}
          </p>
          <p className="text-sm text-slate-500">Dự án công khai</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="font-mono text-3xl font-bold text-slate-900">
            {profile.total_forks.toLocaleString()}
          </p>
          <p className="text-sm text-slate-500">Lượt fork</p>
        </Card>
      </div>

      {/* Projects */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-slate-900">
          Dự án công khai ({projects.length})
        </h2>
        {projects.length === 0 ? (
          <EmptyState icon={FolderOpen} title="Người dùng này chưa có dự án công khai nào." />
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
