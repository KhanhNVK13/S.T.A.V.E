'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
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
import { RowList, RowHeader, RowTitle, RowStat, RowTime } from '../../components/ui/row-list';
import { useI18n } from '../../context/i18n-context';
import { tNow } from '../../lib/i18n';
import { GalaxyPage } from '../../components/galaxy/galaxy-page';
import { GalaxyMap } from '../../components/galaxy/galaxy-map';
import { GalaxyRow } from '../../components/galaxy/galaxy-row';
import { weightOf } from '../../components/galaxy/constellation';

const GENRE_FILTERS = [
  { value: '', label: 'ex.allGenres' },
  { value: 'Jazz', label: 'Jazz' },
  { value: 'Rock', label: 'Rock' },
  { value: 'Pop', label: 'Pop' },
  { value: 'Lo-Fi', label: 'Lo-Fi' },
  { value: 'Electronic', label: 'Electronic' },
  { value: 'Classical', label: 'Classical' },
  { value: 'Hip-Hop', label: 'Hip-Hop' },
] as const;

const SORT_OPTIONS = [
  { value: 'newest', label: 'ex.sortNewest' },
  { value: 'most_played', label: 'ex.sortPopular' },
] as const;

/** Tên | thể loại | lượt nghe | fork | cập nhật — dùng chung cho hàng tiêu đề và hàng dữ liệu. */
const COLS = 'md:grid-cols-[minmax(0,1fr)_112px_84px_84px_96px]';

function RowSkeleton() {
  return (
    <RowList cols={COLS}>
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
  const { t } = useI18n();
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
    tNow('ex.loadFail'),
  );

  function updateParams(newParams: Record<string, string | null>) {
    const params = new URLSearchParams(window.location.search);
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

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const galaxyItems = useMemo(
    () => (items ?? []).map((p) => ({ id: p.id, weight: weightOf(p.play_count, p.fork_count) })),
    [items],
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-[380px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            name="q"
            autoComplete="off"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('ex.search')}
            aria-label={t('ex.search')}
            className={`${INPUT_CLASS} h-[34px] w-full pl-8`}
          />
        </div>

        <select
          value={genre}
          onChange={(e) => updateParams({ genre: e.target.value })}
          aria-label={t('ex.filterGenre')}
          className={`${INPUT_CLASS} h-[34px]`}
        >
          {GENRE_FILTERS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.value === '' ? t('ex.allGenres') : g.label}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => updateParams({ sort: e.target.value })}
          aria-label={t('ex.sort')}
          className={`${INPUT_CLASS} h-[34px]`}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.label)}
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

      <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(300px,36%)] min-[900px]:items-start">
      <div className="min-w-0">
        {loading ? (
          <RowSkeleton />
        ) : error ? (
          <div className="rounded-card border border-danger/20 bg-danger-muted p-8 text-center">
            <p className="text-[13px] text-danger">{error}</p>
            <Button variant="secondary" onClick={() => window.location.reload()} className="mt-4">
              {t('ui.retry')}
            </Button>
          </div>
        ) : items?.length === 0 ? (
          <EmptyState
            icon={SearchIcon}
            title={
              search || genre || tag
                ? t('ex.noneFound')
                : t('ex.nonePublic')
            }
            description={
              search || genre || tag
                ? undefined
                : t('ex.noneHint')
            }
            action={
              search || genre || tag ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearchInput('');
                    updateParams({ search: null, genre: null, tag: null });
                  }}
                >
                  {t('ex.clearFilters')}
                </Button>
              ) : (
                <Link href="/projects/new">
                  <Button>{t('ex.createProject')}</Button>
                </Link>
              )
            }
          />
        ) : (
          <>
            <p className="mb-2 text-xs text-muted">
              {search
                ? t('ex.resultsFor', { n: data?.total ?? 0, q: search })
                : t('ex.publicCount', { n: data?.total ?? 0 })}
            </p>

            <RowList cols={COLS}>
              <RowHeader>
                <span>{t('ex.colProject')}</span>
                <span>{t('ex.colGenre')}</span>
                <span>{t('ex.colPlays')}</span>
                <span>Fork</span>
                <span className="text-right">{t('ex.colUpdated')}</span>
              </RowHeader>

              {items?.map((project) => {
                const ownerName = project.owner.display_name ?? project.owner.username ?? t('ex.user');
                return (
                  <GalaxyRow key={project.id} onActiveChange={(active) => setHoveredId((current) => (active ? project.id : current === project.id ? null : current))}>
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
                    <RowStat icon={Play} value={project.play_count} title={t('ex.statPlays')} />
                    <RowStat icon={GitFork} value={project.fork_count} title={t('ex.statForks')} />
                    <RowTime>{formatRelativeTime(project.updated_at)}</RowTime>
                  </GalaxyRow>
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
                  <ChevronLeft className="h-3.5 w-3.5" /> {t('ex.prev')}
                </Button>
                <span className="px-3 font-mono text-xs text-muted">
                  {page} / {data.totalPages}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => updateParams({ page: String(page + 1) })}
                  disabled={page >= data.totalPages}
                >
                  {t('ex.next')} <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <aside aria-hidden="true" className="sticky top-6 hidden overflow-hidden rounded-card border border-border bg-background min-[900px]:block">
        <div className="border-b border-border px-3.5 py-2.5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">{t('ex.galaxy')}</p>
          <p className="text-xs text-muted">{t('ex.galaxyHint')}</p>
        </div>
        <GalaxyMap items={galaxyItems} activeId={hoveredId} className="h-[calc(100svh-21rem)] max-h-[620px] min-h-[340px]" />
      </aside>
      </div>
    </>
  );
}

export default function ExplorePage() {
  const { t } = useI18n();
  return (
    <GalaxyPage>
      <PageHeader
        breadcrumbs={[{ label: t('ex.crumb') }]}
        title={t('ex.title')}
        description={t('ex.description')}
        action={
          // UC-66: liên kết "Jam" nổi bật dẫn về trang sự kiện Community Jam.
          <Link href="/jam">
            <Button>Jam</Button>
          </Link>
        }
      />

      <Suspense fallback={<RowSkeleton />}>
        <ExploreContent />
      </Suspense>
    </GalaxyPage>
  );
}
