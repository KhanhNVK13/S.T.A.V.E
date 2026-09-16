'use client';

import { Play, GitFork, Trophy } from 'lucide-react';
import { getProjectRankings, PublicProject } from '../../lib/api-client';
import { useApiResource } from '../../lib/use-api-resource';
import { PageHeader } from '../../components/ui/page-header';
import { Badge } from '../../components/ui/badge';
import { RowList, RowHeader, RowItem, RowTitle } from '../../components/ui/row-list';
import { Tabs } from '../../components/ui/tabs';
import { EmptyState } from '../../components/ui/empty-state';
import { Button } from '../../components/ui/button';
import { useState } from 'react';

type RankingType = 'trending' | 'top_forked' | 'top_played';

/** Hạng | dự án | thể loại | số liệu. */
const COLS = 'md:grid-cols-[52px_minmax(0,1fr)_112px_112px]';

function RankBadge({ rank }: { rank: number }) {
  // Huy chương vàng/bạc/đồng suy ra từ token (metal/neutral/warning) để vẫn đổi
  // theo theme người dùng chọn, thay vì neo vào bảng màu amber/slate cố định.
  const style =
    rank === 1
      ? 'bg-metal text-background'
      : rank === 2
        ? 'bg-border-strong text-background'
        : rank === 3
          ? 'bg-warning text-background'
          : 'bg-surface-subtle text-muted';
  return (
    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${style}`}>
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
    <div className="mx-auto max-w-page px-5 py-8">
      <PageHeader
        breadcrumbs={[{ label: 'Cộng đồng' }]}
        title="Bảng xếp hạng"
        description="Những dự án được nghe và fork nhiều nhất trên STAVE."
      />

      <div className="mb-6">
        <Tabs tabs={tabs} active={type} onChange={(id) => setType(id as RankingType)} />
      </div>

      {loading ? (
        <RowList>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex min-h-[68px] animate-pulse items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0">
              <div className="h-7 w-7 shrink-0 rounded-full bg-surface-subtle" />
              <div className="flex-1">
                <div className="mb-1.5 h-3 w-1/3 rounded bg-surface-subtle" />
                <div className="h-2.5 w-1/4 rounded bg-surface-subtle" />
              </div>
            </div>
          ))}
        </RowList>
      ) : error ? (
        <div className="rounded-card border border-danger/20 bg-danger-muted p-8 text-center">
          <p className="text-[13px] text-danger">{error}</p>
          <Button variant="secondary" onClick={() => window.location.reload()} className="mt-4">
            Thử lại
          </Button>
        </div>
      ) : projects.length === 0 ? (
        <EmptyState icon={Trophy} title="Chưa có dự án nào trong bảng xếp hạng này." />
      ) : (
        <RowList>
          <RowHeader cols={COLS}>
            <span>Hạng</span>
            <span>Dự án</span>
            <span>Thể loại</span>
            <span className="text-right">{type === 'top_forked' ? 'Fork' : 'Lượt nghe'}</span>
          </RowHeader>

          {projects.map((project, index) => {
            const rank = index + 1;
            const metric = type === 'top_forked' ? project.fork_count : project.play_count;
            const MetricIcon = type === 'top_forked' ? GitFork : Play;

            return (
              <RowItem key={project.id} cols={COLS}>
                <RankBadge rank={rank} />
                <RowTitle
                  href={`/projects/${project.id}`}
                  name={project.name}
                  meta={project.owner.display_name ?? project.owner.username ?? 'Người dùng'}
                />
                <span>{project.genre && <Badge variant="neutral">{project.genre}</Badge>}</span>
                <span className="flex items-center gap-1.5 font-mono text-[13px] font-bold md:justify-end">
                  <MetricIcon className="h-3.5 w-3.5 text-muted" />
                  {metric.toLocaleString('vi-VN')}
                </span>
              </RowItem>
            );
          })}
        </RowList>
      )}
    </div>
  );
}
