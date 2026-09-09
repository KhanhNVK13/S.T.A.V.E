'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getProjectRankings, PublicProject } from '../../lib/api-client';

type RankingType = 'trending' | 'top_forked' | 'top_played';

export default function RankingsPage() {
  const [type, setType] = useState<RankingType>('trending');
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRankings() {
      setLoading(true);
      setError(null);
      try {
        const data = await getProjectRankings(type);
        setProjects(data);
      } catch {
        setError('Không thể tải bảng xếp hạng. Vui lòng thử lại.');
      } finally {
        setLoading(false);
      }
    }
    void fetchRankings();
  }, [type]);

  const tabs = [
    { value: 'trending' as const, label: 'Xu hướng', metric: 'Lượt nghe' },
    { value: 'top_forked' as const, label: 'Fork nhiều nhất', metric: 'Fork' },
    { value: 'top_played' as const, label: 'Nghe nhiều nhất', metric: 'Lượt nghe' },
  ];

  function getBadgeStyle(rank: number): { bg: string; text: string } {
    if (rank === 1) return { bg: 'bg-yellow-400', text: 'text-yellow-900' };
    if (rank === 2) return { bg: 'bg-gray-300', text: 'text-gray-700' };
    if (rank === 3) return { bg: 'bg-amber-600', text: 'text-white' };
    return { bg: 'bg-[#F7F7F5]', text: 'text-[#8A8D93]' };
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#1F2126]">Bảng xếp hạng</h1>
        <p className="mt-2 text-[#8A8D93]">
          Top dự án được yêu thích nhất trên STAVE
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-[#E3E4E8]">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setType(tab.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              type === tab.value
                ? 'border-b-2 border-[#1D4ED8] text-[#1D4ED8]'
                : 'text-[#8A8D93] hover:text-[#1F2126]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-4 rounded-lg border border-[#E3E4E8] bg-white p-4">
              <div className="h-8 w-8 rounded bg-[#F7F7F5]" />
              <div className="flex-1">
                <div className="mb-1 h-5 w-2/3 rounded bg-[#F7F7F5]" />
                <div className="h-4 w-1/3 rounded bg-[#F7F7F5]" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-[#B3242E]/20 bg-[#B3242E]/5 p-8 text-center">
          <p className="text-[#B3242E]">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1E40AF]"
          >
            Thử lại
          </button>
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-[#E3E4E8] bg-white p-8 text-center">
          <p className="text-[#8A8D93]">Chưa có dự án nào trong bảng xếp hạng này.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project, index) => {
            const rank = index + 1;
            const badge = getBadgeStyle(rank);
            const metric = type === 'top_forked' ? project.fork_count : project.play_count;

            return (
              <Link
                key={project.id}
                href={`/explore/${project.id}`}
                className="group flex items-center gap-4 rounded-lg border border-[#E3E4E8] bg-white p-4 transition-all hover:border-[#1D4ED8] hover:shadow-md"
              >
                {/* Rank */}
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${badge.bg} ${badge.text} font-bold`}>
                  {rank <= 3 ? rank : rank}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-[#1F2126] group-hover:text-[#1D4ED8]">
                    {project.name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-[#8A8D93]">
                    <span>{project.owner.display_name ?? project.owner.username}</span>
                    {project.genre && (
                      <>
                        <span>·</span>
                        <span>{project.genre}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Metric */}
                <div className="text-right">
                  <p className="text-lg font-bold text-[#1F2126]">
                    {type === 'top_forked' ? '🍴' : '🎵'}{' '}
                    {metric.toLocaleString()}
                  </p>
                  <p className="text-xs text-[#8A8D93]">
                    {type === 'top_forked' ? 'Fork' : 'Lượt nghe'}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
