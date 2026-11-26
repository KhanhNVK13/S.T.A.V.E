'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search as SearchIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  getFeaturedContent,
  listPublicProjects,
  FeaturedContent,
  PublicProjectsResponse,
} from '../../lib/api-client';
import {
  listFilteredPublicProjects,
  parseExploreQuery,
  type ExploreParseResponse,
} from '../../lib/api-similar';
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
import { AiActionButton, AiCallout } from '../../components/ai/ai-ui';
import { ProjectRows, ProjectRowsSkeleton } from '../../components/explore/project-rows';
import { FeaturedCards } from '../../components/explore/featured-cards';
import { useAuth } from '../../context/auth-context';
import { useI18n } from '../../context/i18n-context';
import { tNow } from '../../lib/i18n';
import { GENRES } from '../../lib/genres';
import { useSpaceScene, useSpaceScroll } from '../../components/space/use-space-scene';

const SORT_OPTIONS = [
  { value: 'newest', label: 'ex.sortNewest' },
  { value: 'recently_updated', label: 'ex.sortRecentlyUpdated' },
  { value: 'popular', label: 'ex.sortPopular' },
  { value: 'most_played', label: 'ex.sortMostPlayed' },
  { value: 'most_forked', label: 'ex.sortMostForked' },
] as const;

const CHIP_BASE =
  'inline-flex h-10 items-center gap-1.5 rounded-full border px-[18px] text-sm font-medium transition-colors';
const CHIP_ON = 'border-accent bg-accent text-accent-foreground';
const CHIP_OFF = 'border-border-strong bg-background/60 text-foreground hover:border-foreground';
const SELECT_CLASS =
  'h-10 max-w-full rounded-full border border-border-strong bg-surface-subtle px-4 text-base text-foreground transition-colors hover:border-foreground/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:text-muted sm:text-sm';
const FILTER_PILL =
  'flex h-10 items-center gap-1.5 rounded-full border border-accent/60 bg-accent-muted px-4 text-[13px] font-medium text-accent transition-colors hover:border-accent';

function parseBpmParam(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 20 && n <= 300 ? n : undefined;
}

function parseModeParam(raw: string | null): 'major' | 'minor' | undefined {
  return raw === 'major' || raw === 'minor' ? raw : undefined;
}

function ExploreContent() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const sort = (searchParams.get('sort') ?? 'newest') as
    | 'newest'
    | 'recently_updated'
    | 'popular'
    | 'most_played'
    | 'most_forked';
  const genre = searchParams.get('genre') ?? '';
  const search = searchParams.get('search') ?? '';
  const tag = searchParams.get('tag') ?? '';
  const instrumentParam = searchParams.get('instrument');
  const instruments = useMemo(() => parseInstrumentParam(instrumentParam), [instrumentParam]);
  const tempoMin = parseBpmParam(searchParams.get('tempoMin'));
  const tempoMax = parseBpmParam(searchParams.get('tempoMax'));
  const mode = parseModeParam(searchParams.get('mode'));
  const hasMusicalFilters = tempoMin !== undefined || tempoMax !== undefined || mode !== undefined;
  const filtered = Boolean(search || genre || tag || instruments.length > 0 || hasMusicalFilters);

  const { data, loading, error } = useApiResource<PublicProjectsResponse>(
    () =>
      hasMusicalFilters
        ? listFilteredPublicProjects({
            page,
            limit: 9,
            sort,
            genre: genre || undefined,
            search: search || undefined,
            tag: tag || undefined,
            instrument: instruments.length > 0 ? instruments : undefined,
            tempoMin,
            tempoMax,
            mode,
          })
        : listPublicProjects({
            page,
            limit: 9,
            sort,
            genre: genre || undefined,
            search: search || undefined,
            tag: tag || undefined,
            instrument: instruments.length > 0 ? instruments : undefined,
          }),
    [page, sort, genre, search, tag, instruments, tempoMin, tempoMax, mode],
    tNow('ex.loadFail'),
  );

  const [featuredTry, setFeaturedTry] = useState(0);
  const { data: featured, error: featuredError } = useApiResource<FeaturedContent>(
    () => getFeaturedContent(),
    [featuredTry],
    tNow('explorePage.featuredFail'),
  );
  const showFeatured = !filtered && page === 1;
  const needNewestFallback =
    showFeatured &&
    featured !== null &&
    featured.trending_projects.length === 0 &&
    sort !== 'newest';
  const { data: newestFallback } = useApiResource<PublicProjectsResponse>(
    () =>
      needNewestFallback
        ? listPublicProjects({ page: 1, limit: 6, sort: 'newest' })
        : Promise.resolve({ items: [], total: 0, page: 1, totalPages: 0, limit: 6 }),
    [needNewestFallback],
  );
  const fallbackNewest =
    sort === 'newest' ? (data?.items ?? []).slice(0, 6) : (newestFallback?.items ?? []);
  const featuredProjects =
    showFeatured && featured
      ? featured.trending_projects.length > 0
        ? featured.trending_projects
        : fallbackNewest
      : [];

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
      newParams.instrument !== undefined ||
      newParams.tempoMin !== undefined ||
      newParams.tempoMax !== undefined ||
      newParams.mode !== undefined
    ) {
      params.set('page', '1');
    }
    router.push(`/explore?${params.toString()}`);
  }

  const [searchInput, setSearchInput] = useState(search);
  const skipNextDebounceRef = useRef(false);
  const [aiNotice, setAiNotice] = useState<{
    loading: boolean;
    error: boolean;
    result: ExploreParseResponse | null;
  } | null>(null);

  useEffect(() => {
    if (skipNextDebounceRef.current) {
      skipNextDebounceRef.current = false;
      return;
    }
    if (searchInput === search) return;
    const timer = setTimeout(() => updateParams({ search: searchInput || null }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  async function handleAiSearch() {
    const trimmed = searchInput.trim();
    if (!trimmed) return;
    setAiNotice({ loading: true, error: false, result: null });
    try {
      const parsed = await parseExploreQuery(trimmed, lang);
      skipNextDebounceRef.current = true;
      setSearchInput(parsed.search ?? '');
      updateParams({
        search: parsed.search,
        genre: parsed.genre,
        instrument: serializeInstrumentParam(parsed.instruments),
        tempoMin: parsed.tempoMin !== null ? String(parsed.tempoMin) : null,
        tempoMax: parsed.tempoMax !== null ? String(parsed.tempoMax) : null,
        mode: parsed.mode,
      });
      setAiNotice({ loading: false, error: false, result: parsed });
    } catch {
      setAiNotice({ loading: false, error: true, result: null });
    }
  }

  const items = data?.items;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[560px]">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
          />
          <input
            name="q"
            autoComplete="off"
            type="search"
            value={searchInput}
            onChange={(e) => {
              skipNextDebounceRef.current = false;
              setSearchInput(e.target.value);
            }}
            placeholder={t('ex.search')}
            aria-label={t('ex.search')}
            className="h-14 w-full rounded-full border border-border-strong bg-surface-subtle/60 pl-[52px] pr-5 text-base transition-colors placeholder:text-muted hover:border-foreground/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 sm:text-[17px]"
          />
        </div>

        {user && (
          <AiActionButton
            label={t('exAi.button')}
            loadingLabel={t('exAi.loading')}
            loading={aiNotice?.loading ?? false}
            disabled={searchInput.trim().length === 0}
            onClick={() => void handleAiSearch()}
            testId="explore-ai-search-btn"
          />
        )}

        {tag && (
          <button
            type="button"
            onClick={() => updateParams({ tag: null })}
            aria-label={t('explorePage.removeTag', { tag })}
            className={FILTER_PILL}
          >
            #{tag}
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {aiNotice && (
        <div className="mb-5">
          <AiCallout
            title={t('exAi.title')}
            loading={aiNotice.loading}
            loadingLabel={t('exAi.loading')}
            unavailable={aiNotice.error}
            unavailableLabel={t('exAi.error')}
            text={aiNotice.result?.explanation ?? null}
            subtitle={
              aiNotice.result
                ? aiNotice.result.source === 'rule'
                  ? t('exAi.ruleNote')
                  : t('exAi.aiNote')
                : undefined
            }
            testId="explore-ai-callout"
          >
            {!aiNotice.loading && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setAiNotice(null)}
                  aria-label={t('exAi.dismiss')}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-surface/60 px-2.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
                >
                  <X aria-hidden="true" className="h-3 w-3" />
                  {t('ui.close')}
                </button>
              </div>
            )}
          </AiCallout>
        </div>
      )}

      <div role="group" aria-label={t('ex.filterGenre')} className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={genre === ''}
          onClick={() => updateParams({ genre: null })}
          className={`${CHIP_BASE} ${genre === '' ? CHIP_ON : CHIP_OFF}`}
        >
          {t('ex.allGenres')}
        </button>
        {GENRES.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={genre === g}
            onClick={() => updateParams({ genre: g })}
            className={`${CHIP_BASE} ${genre === g ? CHIP_ON : CHIP_OFF}`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="mb-12 flex flex-wrap items-center gap-2">
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
          className={SELECT_CLASS}
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
            className={FILTER_PILL}
          >
            {name}
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ))}

        {tempoMin !== undefined && (
          <button
            type="button"
            onClick={() => updateParams({ tempoMin: null })}
            aria-label={t('exAi.removeTempoMin')}
            className={FILTER_PILL}
          >
            {t('exAi.pillTempoMin', { bpm: tempoMin })}
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}

        {tempoMax !== undefined && (
          <button
            type="button"
            onClick={() => updateParams({ tempoMax: null })}
            aria-label={t('exAi.removeTempoMax')}
            className={FILTER_PILL}
          >
            {t('exAi.pillTempoMax', { bpm: tempoMax })}
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}

        {mode && (
          <button
            type="button"
            onClick={() => updateParams({ mode: null })}
            aria-label={t('exAi.removeMode')}
            className={FILTER_PILL}
          >
            {t(mode === 'minor' ? 'exAi.pillModeMinor' : 'exAi.pillModeMajor')}
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showFeatured && (featuredProjects.length > 0 || featuredError) && (
        <section aria-labelledby="explore-featured" className="mb-14">
          <h2 id="explore-featured" className="text-section mb-5">
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
            <FeaturedCards projects={featuredProjects} />
          )}
        </section>
      )}

      <section aria-labelledby="explore-all">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="explore-all" className="text-section">
            {t('explorePage.allProjects')}
          </h2>
          <select
            value={sort}
            onChange={(e) => updateParams({ sort: e.target.value })}
            aria-label={t('ex.sort')}
            className={SELECT_CLASS}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.label)}
              </option>
            ))}
          </select>
        </div>
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
                    skipNextDebounceRef.current = true;
                    setSearchInput('');
                    setAiNotice(null);
                    updateParams({
                      search: null,
                      genre: null,
                      tag: null,
                      instrument: null,
                      tempoMin: null,
                      tempoMax: null,
                      mode: null,
                    });
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
            <p role="status" className="mb-3 text-[13px] text-muted">
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
  useSpaceScene('full', 4);
  useSpaceScroll(4, 0.7);
  return (
    <div className="mx-auto min-h-full w-full max-w-page px-5 py-10 sm:px-8 lg:px-10">
      <PageHeader
        size="hero"
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
