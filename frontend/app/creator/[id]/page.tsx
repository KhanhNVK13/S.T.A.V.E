'use client';

import { use } from 'react';
import Link from 'next/link';
import { CalendarDays, FolderOpen, Play, GitFork } from 'lucide-react';
import { getPublicUserProfile, getUserPublicProjects, PublicUserProfile, PublicProject } from '../../../lib/api-client';
import { formatMonthYear, formatRelativeTime } from '../../../lib/format-date';
import { useApiResource } from '../../../lib/use-api-resource';
import { Button } from '../../../components/ui/button';
import { Avatar } from '../../../components/ui/avatar';
import { EmptyState } from '../../../components/ui/empty-state';
import { Badge } from '../../../components/ui/badge';
import { RowList, RowHeader, RowItem, RowTitle, RowStat, RowTime } from '../../../components/ui/row-list';

interface Props {
  params: Promise<{ id: string }>;
}

/** Tên | thể loại | lượt nghe | fork | cập nhật. */
const COLS = 'md:grid-cols-[minmax(0,1fr)_112px_84px_84px_78px]';

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
      <div className="mx-auto max-w-page px-5 py-8">
        <div className="animate-pulse">
          <div className="mb-8 flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-surface-subtle" />
            <div>
              <div className="mb-2 h-6 w-48 rounded bg-surface-subtle" />
              <div className="h-4 w-32 rounded bg-surface-subtle" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 rounded-card bg-surface-subtle" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-page px-5 py-8">
        <div className="rounded-card border border-danger/20 bg-danger-muted p-8 text-center">
          <h1 className="text-xl font-semibold text-danger">Không tìm thấy</h1>
          <p className="mt-2 text-muted">{error ?? 'Người dùng này không tồn tại.'}</p>
          <Link href="/explore">
            <Button className="mt-4">Quay lại Khám phá</Button>
          </Link>
        </div>
      </div>
    );
  }

  const joinDate = formatMonthYear(profile.created_at);

  return (
    <div className="mx-auto max-w-page px-5 py-8">
      <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Avatar
            id={profile.id}
            label={profile.display_name ?? profile.username ?? '?'}
            imageUrl={profile.avatar_url}
            size="lg"
          />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">Hồ sơ tác giả</p>
            <h1 className="mb-0.5 mt-0.5 text-[26px] font-semibold leading-tight tracking-tight">
              {profile.display_name ?? profile.username ?? 'Người dùng'}
            </h1>
            <p className="font-mono text-xs text-muted">@{profile.username ?? 'unknown'}</p>
            {profile.bio && <p className="mt-2 max-w-2xl text-[13px] text-muted">{profile.bio}</p>}
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
              <CalendarDays className="h-3.5 w-3.5" /> Tham gia {joinDate}
            </p>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 overflow-hidden rounded-card border border-border bg-surface">
          <div className="border-r border-border px-5 py-3">
            <p className="font-mono text-[17px] font-bold">
              {profile.total_public_projects.toLocaleString('vi-VN')}
            </p>
            <p className="text-[10px] text-muted">Dự án công khai</p>
          </div>
          <div className="px-5 py-3">
            <p className="font-mono text-[17px] font-bold">
              {profile.total_forks.toLocaleString('vi-VN')}
            </p>
            <p className="text-[10px] text-muted">Lượt fork</p>
          </div>
        </div>
      </div>

      <h2 className="mb-2.5 text-[17px] font-semibold">Dự án công khai ({projects.length})</h2>
      {projects.length === 0 ? (
        <EmptyState icon={FolderOpen} title="Người dùng này chưa có dự án công khai nào." />
      ) : (
        <RowList>
          <RowHeader cols={COLS}>
            <span>Dự án</span>
            <span>Thể loại</span>
            <span>Lượt nghe</span>
            <span>Fork</span>
            <span className="text-right">Cập nhật</span>
          </RowHeader>

          {projects.map((project) => (
            <RowItem key={project.id} cols={COLS}>
              <RowTitle
                href={`/projects/${project.id}`}
                name={project.name}
                meta={project.description ?? undefined}
              />
              <span>{project.genre && <Badge variant="neutral">{project.genre}</Badge>}</span>
              <RowStat icon={Play} value={project.play_count} title="Lượt nghe" />
              <RowStat icon={GitFork} value={project.fork_count} title="Lượt fork" />
              <RowTime>{formatRelativeTime(project.updated_at)}</RowTime>
            </RowItem>
          ))}
        </RowList>
      )}
    </div>
  );
}
