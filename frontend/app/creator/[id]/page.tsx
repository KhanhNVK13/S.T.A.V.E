'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, FolderOpen, Play, GitFork } from 'lucide-react';
import { getPublicUserProfile, getUserPublicProjects, PublicUserProfile, PublicProject } from '../../../lib/api-client';
import { formatMonthYear, formatRelativeTime } from '../../../lib/format-date';
import { useI18n } from '../../../context/i18n-context';
import { tNow } from '../../../lib/i18n';
import { useApiResource } from '../../../lib/use-api-resource';
import { Button } from '../../../components/ui/button';
import { Avatar } from '../../../components/ui/avatar';
import { EmptyState } from '../../../components/ui/empty-state';
import { Badge } from '../../../components/ui/badge';
import { RowList, RowHeader, RowTitle, RowStat, RowTime } from '../../../components/ui/row-list';
import { GalaxyPage } from '../../../components/galaxy/galaxy-page';
import { GalaxyRow } from '../../../components/galaxy/galaxy-row';
import { CreatorConstellation } from '../../../components/galaxy/creator-constellation';

interface Props {
  params: Promise<{ id: string }>;
}

/** Tên | thể loại | lượt nghe | fork | cập nhật. */
const COLS = 'md:grid-cols-[minmax(0,1fr)_112px_84px_84px_96px]';

interface CreatorPageData {
  profile: PublicUserProfile;
  projects: PublicProject[];
}

export default function CreatorProfilePage({ params }: Props) {
  const { t, locale } = useI18n();
  const { id } = use(params);

  const { data, loading, error } = useApiResource<CreatorPageData>(
    () =>
      Promise.all([getPublicUserProfile(id), getUserPublicProjects(id)]).then(([profile, projects]) => ({
        profile,
        projects,
      })),
    [id],
    tNow('cr.notFoundMsg'),
  );
  const profile = data?.profile ?? null;
  const projects = data?.projects ?? [];
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (loading) {
    return (
      <GalaxyPage>
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
      </GalaxyPage>
    );
  }

  if (error || !profile) {
    return (
      <GalaxyPage>
        <div className="rounded-card border border-danger/20 bg-danger-muted p-8 text-center">
          <h1 className="text-xl font-semibold text-danger">{t('cr.notFound')}</h1>
          <p className="mt-2 text-muted">{error ?? t('cr.notExist')}</p>
          <Link href="/explore">
            <Button className="mt-4">{t('cr.backExplore')}</Button>
          </Link>
        </div>
      </GalaxyPage>
    );
  }

  const joinDate = formatMonthYear(profile.created_at);

  return (
    <GalaxyPage>
      <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Avatar
            id={profile.id}
            label={profile.display_name ?? profile.username ?? '?'}
            imageUrl={profile.avatar_url}
            size="lg"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-accent">
              <Link href="/" className="hover:underline">
                {t('ui.home')}
              </Link>
              <span className="text-muted">/</span>
              <span>{t('cr.crumb')}</span>
            </p>
            <h1 className="mb-0.5 mt-0.5 text-[26px] font-semibold leading-tight tracking-tight">
              {profile.display_name ?? profile.username ?? t('ex.user')}
            </h1>
            <p className="font-mono text-xs text-muted">@{profile.username ?? 'unknown'}</p>
            {profile.bio && <p className="mt-2 max-w-2xl text-[13px] text-muted">{profile.bio}</p>}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <CalendarDays className="h-3.5 w-3.5" /> {t('cr.joined', { date: joinDate })}
            </p>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 overflow-hidden rounded-card border border-border bg-surface">
          <div className="border-r border-border px-5 py-3">
            <p className="font-mono text-[17px] font-bold">
              {profile.total_public_projects.toLocaleString(locale)}
            </p>
            <p className="text-xs text-muted">{t('cr.publicProjects')}</p>
          </div>
          <div className="px-5 py-3">
            <p className="font-mono text-[17px] font-bold">{profile.total_forks.toLocaleString(locale)}</p>
            <p className="text-xs text-muted">{t('ex.statForks')}</p>
          </div>
        </div>
      </div>

      <CreatorConstellation
        stars={projects.map((p) => ({ id: p.id, playCount: p.play_count, forkCount: p.fork_count }))}
        activeId={hoveredId}
      />

      <h2 className="mb-2.5 text-[17px] font-semibold">{t('cr.projectsHeading', { n: projects.length })}</h2>
      {projects.length === 0 ? (
        <EmptyState icon={FolderOpen} title={t('cr.empty')} />
      ) : (
        <RowList cols={COLS}>
          <RowHeader>
            <span>{t('ex.colProject')}</span>
            <span>{t('ex.colGenre')}</span>
            <span>{t('ex.colPlays')}</span>
            <span>Fork</span>
            <span className="text-right">{t('ex.colUpdated')}</span>
          </RowHeader>

          {projects.map((project) => (
            <GalaxyRow
              key={project.id}
              onActiveChange={(active) =>
                setHoveredId((current) => (active ? project.id : current === project.id ? null : current))
              }
            >
              <RowTitle href={`/projects/${project.id}`} name={project.name} meta={project.description ?? undefined} />
              <span>{project.genre && <Badge variant="neutral">{project.genre}</Badge>}</span>
              <RowStat icon={Play} value={project.play_count} title={t('ex.statPlays')} />
              <RowStat icon={GitFork} value={project.fork_count} title={t('ex.statForks')} />
              <RowTime>{formatRelativeTime(project.updated_at)}</RowTime>
            </GalaxyRow>
          ))}
        </RowList>
      )}
    </GalaxyPage>
  );
}
