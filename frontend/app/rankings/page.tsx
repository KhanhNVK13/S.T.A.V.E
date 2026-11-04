'use client';

import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { getProjectRankings, PublicProject } from '../../lib/api-client';
import { useApiResource } from '../../lib/use-api-resource';
import { PageHeader } from '../../components/ui/page-header';
import { Tabs } from '../../components/ui/tabs';
import { EmptyState } from '../../components/ui/empty-state';
import { Button } from '../../components/ui/button';
import { ProjectRows, ProjectRowsSkeleton } from '../../components/explore/project-rows';
import { useI18n } from '../../context/i18n-context';
import { tNow } from '../../lib/i18n';

type RankingType = 'trending' | 'top_forked' | 'top_played';

export default function RankingsPage() {
  const { t } = useI18n();
  const [type, setType] = useState<RankingType>('trending');

  const { data, loading, error } = useApiResource<PublicProject[]>(
    () => getProjectRankings(type),
    [type],
    tNow('rk.loadFail'),
  );
  const projects = data ?? [];

  const tabs = [
    { id: 'trending', label: t('rk.trending') },
    { id: 'top_forked', label: t('rk.topForked') },
    { id: 'top_played', label: t('rk.topPlayed') },
  ];

  return (
    <div className="mx-auto min-h-full w-full min-w-0 max-w-page px-5 py-8">
      <PageHeader
        breadcrumbs={[{ label: t('rk.crumb') }]}
        title={t('rk.title')}
        description={
          type === 'trending'
            ? t('rk.descTrending')
            : type === 'top_forked'
              ? t('rk.descForked')
              : t('rk.descPlayed')
        }
      />

      <div className="mb-6 min-w-0">
        <Tabs tabs={tabs} active={type} onChange={(id) => setType(id as RankingType)} />
      </div>

      {loading ? (
        <ProjectRowsSkeleton rows={10} />
      ) : error ? (
        <div role="alert" className="rounded-card border border-danger/20 bg-danger-muted p-8 text-center">
          <p className="text-[13px] text-danger">{error}</p>
          <Button variant="secondary" onClick={() => window.location.reload()} className="mt-4">
            {t('ui.retry')}
          </Button>
        </div>
      ) : projects.length === 0 ? (
        <EmptyState icon={Trophy} title={t('rk.empty')} />
      ) : (
        <ProjectRows projects={projects} rankFrom={1} />
      )}
    </div>
  );
}
