'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search as SearchIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { listPublicProjects, PublicProjectsResponse } from '../../lib/api-client';
import { ProjectCard } from '../../components/project-card';
import { useApiResource } from '../../lib/use-api-resource';
import { PageHeader } from '../../components/ui/page-header';
import { EmptyState } from '../../components/ui/empty-state';
import { INPUT_CLASS } from '../../components/ui/form';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'popular', label: 'Phổ biến nhất' },
  { value: 'most_played', label: 'Lượt nghe nhiều' },
] as const;

function ProjectCardSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-card border border-slate-200 bg-white p-4">
          <div className="mb-3 h-24 w-full rounded-lg bg-slate-100" />
          <div className="mb-2 h-5 w-3/4 rounded bg-slate-100" />
          <div className="mb-3 h-4 w-full rounded bg-slate-100" />
          <div className="flex justify-between">
            <div className="h-4 w-1/3 rounded bg-slate-100" />
            <div className="h-4 w-1/4 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ExploreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filters from URL
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const sort = (searchParams.get('sort') ?? 'newest') as 'newest' | 'popular' | 'most_played';
  const genre = searchParams.get('genre') ?? '';

  const { data, loading, error } = useApiResource<PublicProjectsResponse>(
    () => listPublicProjects({ page, limit: 12, sort, genre: genre || undefined }),
    [page, sort, genre],
    'Không thể tải danh sách dự án. Vui lòng thử lại.',
  );

  function updateParams(newParams: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(newParams)) {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    // Reset to page 1 when changing filters
    if (newParams.sort !== undefined || newParams.genre !== undefined) {
      params.set('page', '1');
    }
    router.push(`/explore?${params.toString()}`);
  }

  return (
    <>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Sắp xếp:</label>
          <select
            value={sort}
            onChange={(e) => updateParams({ sort: e.target.value })}
            className={INPUT_CLASS}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="relative min-w-[200px]">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={genre}
            onChange={(e) => updateParams({ genre: e.target.value })}
            placeholder="Lọc theo thể loại: Jazz, Rock..."
            className={`${INPUT_CLASS} w-full pl-9`}
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <ProjectCardSkeletonGrid />
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
      ) : data?.items.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="Không tìm thấy dự án nào."
          action={
            genre ? (
              <button
                onClick={() => updateParams({ genre: null })}
                className="text-sm text-accent-600 hover:underline"
              >
                Xóa bộ lọc thể loại
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Stats */}
          <p className="mb-4 text-sm text-slate-500">{data?.total ?? 0} dự án công khai</p>

          {/* Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data?.items.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                onClick={() => updateParams({ page: String(page - 1) })}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" /> Trước
              </button>
              <span className="px-4 text-sm text-slate-500">
                Trang {page} / {data.totalPages}
              </span>
              <button
                onClick={() => updateParams({ page: String(page + 1) })}
                disabled={page >= data.totalPages}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sau <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader title="Khám phá dự án" description="Tìm kiếm cảm hứng từ cộng đồng sáng tác" />

      <Suspense fallback={<ProjectCardSkeletonGrid />}>
        <ExploreContent />
      </Suspense>
    </div>
  );
}
