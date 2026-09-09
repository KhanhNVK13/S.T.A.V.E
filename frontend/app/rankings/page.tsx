'use client';

import Link from 'next/link';
import { Play, GitFork } from 'lucide-react';
import { getProjectRankings, PublicProject } from '../../lib/api-client';
import { useApiResource } from '../../lib/use-api-resource';
import { PageHeader } from '../../components/ui/page-header';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Tabs } from '../../components/ui/tabs';
import { EmptyState } from '../../components/ui/empty-state';
import { useState } from 'react';
import { Trophy } from 'lucide-react';

type RankingType = 'trending' | 'top_forked' | 'top_played';

function RankBadge({ rank }: { rank: number }) {
  const style =
    rank === 1
      ? 'bg-amber-400 text-amber-900'
      : rank === 2
        ? 'bg-slate-300 text-slate-700'
        : rank === 3
          ? 'bg-amber-700 text-white'
          : 'bg-slate-50 text-slate-500';
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono font-bold ${style}`}>
      {rank}
    </div>
  );
}

export default function RankingsPage() {
  const [type, setType] = useState<RankingType>('trending');

  const { data, loading, error } = useApiResource<PublicProject[]>(
    () => getProjectRankings(type),
    [type],
    'Không thể tải bảng xếp hạng. Vui lòng thử lại.',
  );
  const projects = data ?? [];

  const tabs = [
    { id: 'trending', label: 'Xu hướng' },
    { id: 'top_forked', label: 'Fork nhiều nhất' },
    { id: 'top_played', label: 'Nghe nhiều nhất' },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader title="Bảng xếp hạng" description="Top dự án được nghe/fork nhiều nhất trên STAVE" />

      <div className="mb-6">
        <Tabs tabs={tabs} active={type} onChange={(id) => setType(id as RankingType)} />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-4 rounded-card border border-slate-200 bg-white p-4">
              <div className="h-9 w-9 rounded-full bg-slate-100" />
              <div className="flex-1">
                <div className="mb-1 h-5 w-2/3 rounded bg-slate-100" />
                <div className="h-4 w-1/3 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-card border border-danger-600/20 bg-danger-50 p-8 text-center">
          <p className="text-danger-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
          >
            Thử lại
          </button>
        </div>
      ) : projects.length === 0 ? (
        <EmptyState icon={Trophy} title="Chưa có dự án nào trong bảng xếp hạng này." />
      ) : (
        <Card className="divide-y divide-slate-100">
          {projects.map((project, index) => {
            const rank = index + 1;
            const metric = type === 'top_forked' ? project.fork_count : project.play_count;
            const MetricIcon = type === 'top_forked' ? GitFork : Play;

            return (
              <Link
                key={project.id}
                href={`/explore/${project.id}`}
                className="group flex items-center gap-4 p-4 transition-colors hover:bg-slate-50"
              >
                <RankBadge rank={rank} />

                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-slate-900 group-hover:text-accent-700">
                    {project.name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span>{project.owner.display_name ?? project.owner.username}</span>
                    {project.genre && (
                      <>
                        <span>·</span>
                        <Badge variant="neutral">{project.genre}</Badge>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <p className="flex items-center justify-end gap-1.5 font-mono text-lg font-bold text-slate-900">
                    <MetricIcon className="h-4 w-4 text-slate-400" /> {metric.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500">{type === 'top_forked' ? 'Fork' : 'Lượt nghe'}</p>
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
