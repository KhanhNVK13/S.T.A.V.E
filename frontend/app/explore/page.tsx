'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search as SearchIcon, ChevronLeft, ChevronRight, X, Play, GitFork } from 'lucide-react';
import { listPublicProjects, PublicProjectsResponse } from '../../lib/api-client';
import { useApiResource } from '../../lib/use-api-resource';
import { formatRelativeTime } from '../../lib/format-date';
import { PageHeader } from '../../components/ui/page-header';
import { EmptyState } from '../../components/ui/empty-state';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Avatar } from '../../components/ui/avatar';
import { INPUT_CLASS } from '../../components/ui/form';
import { RowList, RowHeader, RowItem, RowTitle, RowStat, RowTime } from '../../components/ui/row-list';

const GENRE_FILTERS = [
  { value: '', label: 'Tất cả thể loại' },
  { value: 'Jazz', label: 'Jazz' },
  { value: 'Rock', label: 'Rock' },
  { value: 'Pop', label: 'Pop' },
  { value: 'Lo-Fi', label: 'Lo-Fi' },
  { value: 'Electronic', label: 'Electronic' },
  { value: 'Classical', label: 'Classical' },
  { value: 'Hip-Hop', label: 'Hip-Hop' },
] as const;

const SORT_OPTIONS = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'most_played', label: 'Nghe nhiều nhất' },
] as const;

/** Tên | thể loại | lượt nghe | fork | cập nhật — dùng chung cho hàng tiêu đề và hàng dữ liệu. */
const COLS = 'md:grid-cols-[minmax(0,1fr)_112px_84px_84px_78px]';

function RowSkeleton() {
  return (
    <RowList>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex min-h-[68px] animate-pulse items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0">
          <div className="h-8 w-8 shrink-0 rounded-full bg-surface-subtle" />
          <div className="flex-1">
            <div className="mb-1.5 h-3 w-1/3 rounded bg-surface-subtle" />
            <div className="h-2.5 w-1/4 rounded bg-surface-subtle" />
          </div>
        </div>
      ))}
    </RowList>
  );
}

function ExploreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const sort = (searchParams.get('sort') ?? 'newest') as 'newest' | 'most_played';
  const genre = searchParams.get('genre') ?? '';
  const search = searchParams.get('search') ?? '';
  const tag = searchParams.get('tag') ?? '';

  const { data, loading, error } = useApiResource<PublicProjectsResponse>(
    () =>
      listPublicProjects({
        page,
        limit: 20,
        sort,
        genre: genre || undefined,
        search: search || undefined,
        tag: tag || undefined,
      }),
    [page, sort, genre, search, tag],
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
    if (
      newParams.sort !== undefined ||
      newParams.genre !== undefined ||
      newParams.search !== undefined ||
      newParams.tag !== undefined
    ) {
      params.set('page', '1');
    }
    router.push(`/explore?${params.toString()}`);
  }

  // Ô nhập gõ mượt (state local), URL/refetch chỉ cập nhật sau khi ngừng gõ 400ms
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(() => updateParams({ search: searchInput || null }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const items = data?.items;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-[380px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm dự án công khai"
            className={`${INPUT_CLASS} h-[34px] w-full pl-8`}
          />
        </div>

        <select
          value={genre}
          onChange={(e) => updateParams({ genre: e.target.value })}
          aria-label="Lọc theo thể loại"
          className={`${INPUT_CLASS} h-[34px]`}
        >
          {GENRE_FILTERS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => updateParams({ sort: e.target.value })}
          aria-label="Sắp xếp"
          className={`${INPUT_CLASS} h-[34px]`}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {tag && (
          <button
            onClick={() => updateParams({ tag: null })}
            className="flex h-[34px] items-center gap-1.5 rounded-md border border-accent bg-accent-muted px-3 text-xs font-semibold text-accent"
          >
            #{tag}
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <RowSkeleton />
      ) : error ? (
        <div className="rounded-card border border-danger/20 bg-danger-muted p-8 text-center">
          <p className="text-[13px] text-danger">{error}</p>
          <Button variant="secondary" onClick={() => window.location.reload()} className="mt-4">
            Thử lại
          </Button>
        </div>
      ) : items?.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="Không tìm thấy dự án nào."
          action={
            search || genre || tag ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchInput('');
                  updateParams({ search: null, genre: null, tag: null });
                }}
              >
                Xoá bộ lọc
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mb-2 text-[11px] text-muted">
            {search
              ? `${data?.total ?? 0} kết quả cho "${search}"`
              : `${data?.total ?? 0} dự án công khai`}
          </p>

          <RowList>
            <RowHeader cols={COLS}>
              <span>Dự án</span>
              <span>Thể loại</span>
              <span>Lượt nghe</span>
              <span>Fork</span>
              <span className="text-right">Cập nhật</span>
            </RowHeader>

            {items?.map((project) => {
              const ownerName = project.owner.display_name ?? project.owner.username ?? 'Người dùng';
              return (
                <RowItem key={project.id} cols={COLS}>
                  <RowTitle
                    href={`/projects/${project.id}`}
                    name={project.name}
                    meta={
                      <>
                        <Link href={`/creator/${project.owner.id}`} className="hover:text-accent hover:underline">
                          {ownerName}
                        </Link>
                        {project.description ? ` · ${project.description}` : ''}
                      </>
                    }
                    leading={
                      <Avatar
                        id={project.owner.id}
                        label={ownerName}
                        imageUrl={project.owner.avatar_url}
                      />
                    }
                  />
                  <span>{project.genre && <Badge variant="neutral">{project.genre}</Badge>}</span>
                  <RowStat icon={Play} value={project.play_count} title="Lượt nghe" />
                  <RowStat icon={GitFork} value={project.fork_count} title="Lượt fork" />
                  <RowTime>{formatRelativeTime(project.updated_at)}</RowTime>
                </RowItem>
              );
            })}
          </RowList>

          {data && data.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                onClick={() => updateParams({ page: String(page - 1) })}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Trước
              </Button>
              <span className="px-3 font-mono text-[11px] text-muted">
                {page} / {data.totalPages}
              </span>
              <Button
                variant="secondary"
                onClick={() => updateParams({ page: String(page + 1) })}
                disabled={page >= data.totalPages}
              >
                Sau <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-page px-5 py-8">
      <PageHeader
        breadcrumbs={[{ label: 'Thư viện công khai' }]}
        title="Khám phá"
        description="Tìm dự án MIDI công khai để nghe, học hỏi và fork."
      />

      <Suspense fallback={<RowSkeleton />}>
        <ExploreContent />
      </Suspense>
    </div>
  );
}
