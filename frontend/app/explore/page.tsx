'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { listPublicProjects, PublicProjectsResponse } from '../../lib/api-client';
import { ProjectCard } from '../../components/project-card';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'popular', label: 'Phổ biến nhất' },
  { value: 'most_played', label: 'Lượt nghe nhiều' },
] as const;

function ExploreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<PublicProjectsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters from URL
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const sort = (searchParams.get('sort') ?? 'newest') as 'newest' | 'popular' | 'most_played';
  const genre = searchParams.get('genre') ?? '';

  useEffect(() => {
    async function fetchProjects() {
      setLoading(true);
      setError(null);
      try {
        const result = await listPublicProjects({ page, limit: 12, sort, genre: genre || undefined });
        setData(result);
      } catch {
        setError('Không thể tải danh sách dự án. Vui lòng thử lại.');
      } finally {
        setLoading(false);
      }
    }
    void fetchProjects();
  }, [page, sort, genre]);

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
        {/* Sort */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-[#1F2126]">Sắp xếp:</label>
          <select
            value={sort}
            onChange={(e) => updateParams({ sort: e.target.value })}
            className="rounded-lg border border-[#E3E4E8] bg-white px-3 py-2 text-sm text-[#1F2126] focus:border-[#1D4ED8] focus:outline-none focus:ring-1 focus:ring-[#1D4ED8]"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Genre filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-[#1F2126]">Thể loại:</label>
          <input
            type="text"
            value={genre}
            onChange={(e) => updateParams({ genre: e.target.value })}
            placeholder="VD: Jazz, Rock..."
            className="rounded-lg border border-[#E3E4E8] bg-white px-3 py-2 text-sm text-[#1F2126] placeholder:text-[#8A8D93] focus:border-[#1D4ED8] focus:outline-none focus:ring-1 focus:ring-[#1D4ED8]"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-[#E3E4E8] bg-white p-4">
              <div className="mb-2 h-5 w-3/4 rounded bg-[#F7F7F5]" />
              <div className="mb-3 h-4 w-full rounded bg-[#F7F7F5]" />
              <div className="flex justify-between">
                <div className="h-4 w-1/3 rounded bg-[#F7F7F5]" />
                <div className="h-4 w-1/4 rounded bg-[#F7F7F5]" />
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
      ) : data?.items.length === 0 ? (
        <div className="rounded-lg border border-[#E3E4E8] bg-white p-8 text-center">
          <p className="text-[#8A8D93]">Không tìm thấy dự án nào.</p>
          {genre && (
            <button
              onClick={() => updateParams({ genre: null })}
              className="mt-4 text-sm text-[#1D4ED8] hover:underline"
            >
              Xóa bộ lọc thể loại
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Stats */}
          <p className="mb-4 text-sm text-[#8A8D93]">
            {data?.total ?? 0} dự án công khai
          </p>

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
                className="rounded-lg border border-[#E3E4E8] bg-white px-4 py-2 text-sm font-medium text-[#1F2126] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#F7F7F5]"
              >
                ← Trước
              </button>
              <span className="px-4 text-sm text-[#8A8D93]">
                Trang {page} / {data.totalPages}
              </span>
              <button
                onClick={() => updateParams({ page: String(page + 1) })}
                disabled={page >= data.totalPages}
                className="rounded-lg border border-[#E3E4E8] bg-white px-4 py-2 text-sm font-medium text-[#1F2126] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#F7F7F5]"
              >
                Sau →
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
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#1F2126]">Khám phá dự án</h1>
        <p className="mt-2 text-[#8A8D93]">
          Tìm kiếm cảm hứng từ cộng đồng sáng tác
        </p>
      </div>

      {/* Wrap content in Suspense for useSearchParams */}
      <Suspense fallback={
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-[#E3E4E8] bg-white p-4">
              <div className="mb-2 h-5 w-3/4 rounded bg-[#F7F7F5]" />
              <div className="mb-3 h-4 w-full rounded bg-[#F7F7F5]" />
              <div className="flex justify-between">
                <div className="h-4 w-1/3 rounded bg-[#F7F7F5]" />
                <div className="h-4 w-1/4 rounded bg-[#F7F7F5]" />
              </div>
            </div>
          ))}
        </div>
      }>
        <ExploreContent />
      </Suspense>
    </div>
  );
}
