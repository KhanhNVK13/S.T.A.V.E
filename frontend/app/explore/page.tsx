'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search as SearchIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  getFeaturedContent,
  listPublicProjects,
  FeaturedContent,
  PublicProjectsResponse,
} from '../../lib/api-client';
import { useApiResource } from '../../lib/use-api-resource';
import {
  MAX_INSTRUMENT_FILTERS,
  addInstrument,
  groupInstrumentsByCategory,
  instrumentCategoryKey,
  parseInstrumentParam,
  removeInstrument,
  serializeInstrumentParam,
} from '../../lib/explore-instrument-filter';
import { PageHeader } from '../../components/ui/page-header';
import { EmptyState } from '../../components/ui/empty-state';
import { Button } from '../../components/ui/button';
import { INPUT_CLASS } from '../../components/ui/form';
import { ProjectRows, ProjectRowsSkeleton } from '../../components/explore/project-rows';
import { useI18n } from '../../context/i18n-context';
import { tNow } from '../../lib/i18n';

const GENRES = ['Jazz', 'Rock', 'Pop', 'Lo-Fi', 'Electronic', 'Classical', 'Hip-Hop'] as const;

const SORT_OPTIONS = [
  { value: 'newest', label: 'ex.sortNewest' },
  { value: 'most_played', label: 'ex.sortPopular' },
] as const;

const CHIP_BASE =
  'inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors';

function ExploreContent() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const sort = (searchParams.get('sort') ?? 'newest') as 'newest' | 'most_played';
  const genre = searchParams.get('genre') ?? '';
  const search = searchParams.get('search') ?? '';
  const tag = searchParams.get('tag') ?? '';
  const instrumentParam = searchParams.get('instrument');
  const instruments = useMemo(() => parseInstrumentParam(instrumentParam), [instrumentParam]);
  const filtered = Boolean(search || genre || tag || instruments.length > 0);

  const { data, loading, error } = useApiResource<PublicProjectsResponse>(
    () =>
      listPublicProjects({
        page,
        limit: 20,
        sort,
        genre: genre || undefined,
        search: search || undefined,
        tag: tag || undefined,
        instrument: instruments.length > 0 ? instruments : undefined,
      }),
    [page, sort, genre, search, tag, instruments],
    tNow('ex.loadFail'),
  );

  const [featuredTry, setFeaturedTry] = useState(0);
  const { data: featured, error: featuredError } = useApiResource<FeaturedContent>(
    () => getFeaturedContent(),
    [featuredTry],
    tNow('explorePage.featuredFail'),
  );
  const showFeatured = !filtered && page === 1;
  const featuredProjects = showFeatured ? (featured?.featured_projects ?? []) : [];

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
      newParams.tag !== undefined ||
      newParams.instrument !== undefined
    ) {
      params.set('page', '1');
    }
    router.push(`/explore?${params.toString()}`);
  }

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
        <div className="relative min-w-[200px] max-w-[420px] flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
          />
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
            type="button"
            onClick={() => updateParams({ tag: null })}
            aria-label={t('explorePage.removeTag', { tag })}
            className="flex h-[34px] items-center gap-1.5 rounded-md border border-accent bg-accent-muted px-3 text-xs font-semibold text-accent"
          >
            #{tag}
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div role="group" aria-label={t('ex.filterGenre')} className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={genre === ''}
          onClick={() => updateParams({ genre: null })}
          className={`${CHIP_BASE} ${
            genre === ''
              ? 'border-accent bg-accent-muted text-foreground'
              : 'border-border-strong text-muted hover:text-foreground'
          }`}
        >
          {t('ex.allGenres')}
        </button>
        {GENRES.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={genre === g}
            onClick={() => updateParams({ genre: g })}
            className={`${CHIP_BASE} ${
              genre === g
                ? 'border-accent bg-accent-muted text-foreground'
                : 'border-border-strong text-muted hover:text-foreground'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value === '') return;
            updateParams({
              instrument: serializeInstrumentParam(addInstrument(instruments, e.target.value)),
            });
          }}
          disabled={instruments.length >= MAX_INSTRUMENT_FILTERS}
          aria-label={t('exi.filterLabel')}
          className={`${INPUT_CLASS} h-[34px] max-w-full`}
        >
          <option value="">
            {instruments.length >= MAX_INSTRUMENT_FILTERS
              ? t('exi.limitReached', { n: MAX_INSTRUMENT_FILTERS })
              : t('exi.add')}
          </option>
          {groupInstrumentsByCategory(instruments).map((group) => (
            <optgroup
              key={group.category}
              label={(() => {
                const key = instrumentCategoryKey(group.category);
                return key ? t(key) : group.category;
              })()}
            >
              {group.names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {instruments.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() =>
              updateParams({
                instrument: serializeInstrumentParam(removeInstrument(instruments, name)),
              })
            }
            aria-label={t('exi.remove', { name })}
            className="flex h-[34px] items-center gap-1.5 rounded-md border border-accent bg-accent-muted px-3 text-xs font-semibold text-accent"
          >
            {name}
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      {showFeatured && (featuredProjects.length > 0 || featuredError) && (
        <section aria-labelledby="explore-featured" className="mb-8">
          <h2 id="explore-featured" className="mb-2.5 text-[17px] font-semibold">
            {t('explorePage.featured')}
          </h2>
          {featuredError ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger/20 bg-danger-muted px-4 py-3"
            >
              <p className="text-[13px] text-danger">{featuredError}</p>
              <Button variant="secondary" onClick={() => setFeaturedTry((n) => n + 1)}>
                {t('ui.retry')}
              </Button>
            </div>
          ) : (
            <ProjectRows projects={featuredProjects} />
          )}
        </section>
      )}

      <section aria-labelledby="explore-all">
        <h2 id="explore-all" className="mb-2.5 text-[17px] font-semibold">
          {t('explorePage.allProjects')}
        </h2>
        {loading ? (
          <ProjectRowsSkeleton />
        ) : error ? (
          <div role="alert" className="rounded-card border border-danger/20 bg-danger-muted p-8 text-center">
            <p className="text-[13px] text-danger">{error}</p>
            <Button variant="secondary" onClick={() => window.location.reload()} className="mt-4">
              {t('ui.retry')}
            </Button>
          </div>
        ) : items?.length === 0 ? (
          <EmptyState
            icon={SearchIcon}
            title={filtered ? t('ex.noneFound') : t('ex.nonePublic')}
            description={filtered ? undefined : t('ex.noneHint')}
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearchInput('');
                    updateParams({ search: null, genre: null, tag: null, instrument: null });
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
            <p role="status" className="mb-2 text-xs text-muted">
              {search
                ? t('ex.resultsFor', { n: data?.total ?? 0, q: search })
                : t('ex.publicCount', { n: data?.total ?? 0 })}
            </p>

            <ProjectRows projects={items ?? []} />

            {data && data.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => updateParams({ page: String(page - 1) })}
                  disabled={page <= 1}
                >
                  <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" /> {t('ex.prev')}
                </Button>
                <span className="px-3 font-mono text-xs text-muted">
                  {page} / {data.totalPages}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => updateParams({ page: String(page + 1) })}
                  disabled={page >= data.totalPages}
                >
                  {t('ex.next')} <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

export default function ExplorePage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto min-h-full w-full max-w-page px-5 py-8">
      <PageHeader
        breadcrumbs={[{ label: t('ex.crumb') }]}
        title={t('ex.title')}
        description={t('ex.description')}
        action={
          <Link href="/jam">
            <Button>Jam</Button>
          </Link>
        }
      />

      <Suspense fallback={<ProjectRowsSkeleton />}>
        <ExploreContent />
      </Suspense>
    </div>
  );
}
