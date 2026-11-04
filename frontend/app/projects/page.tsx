'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { Search, Piano, Archive, Undo2, Settings as SettingsIcon, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { RequireAuth } from '../../components/require-auth';
import { useI18n } from '../../context/i18n-context';
import type { TKey } from '../../lib/i18n';
import {
  archiveProject,
  unarchiveProject,
  listProjects,
  type ProjectVisibility,
} from '../../lib/api-client';
import { formatDateTime, formatRelativeTime } from '../../lib/format-date';
import { PageHeader } from '../../components/ui/page-header';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Tabs } from '../../components/ui/tabs';
import { StarPrint } from '../../components/project/star-print';
import { SkyEmpty, SkyLoading } from '../../components/project/sky-state';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Toast } from '../../components/ui/toast';
import { INPUT_CLASS } from '../../components/ui/form';
import { RowList, RowHeader, RowItem, RowTitle, RowTime } from '../../components/ui/row-list';
import { apiErrorMessage } from "../../lib/error-message";

interface Project {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  visibility: ProjectVisibility;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

type SortOption = 'default' | 'updated_desc' | 'updated_asc' | 'name_asc' | 'name_desc';

const SORT_OPTIONS: { value: SortOption; label: TKey }[] = [
  { value: 'default', label: 'projects.sortDefault' },
  { value: 'updated_desc', label: 'projects.sortNewest' },
  { value: 'updated_asc', label: 'projects.sortOldest' },
  { value: 'name_asc', label: 'projects.sortNameAsc' },
  { value: 'name_desc', label: 'projects.sortNameDesc' },
];

const PAGE_SIZE = 12;

type Tab = 'all' | 'active' | 'archived';

/** Dự án | thể loại | trạng thái | hiển thị | cập nhật | thao tác. */
const COLS = 'md:grid-cols-[minmax(0,1fr)_104px_108px_92px_96px_auto]';

function VisibilityBadge({ visibility }: { visibility: ProjectVisibility }) {
  const { t } = useI18n();
  const isPublic = visibility === 'public';
  return <Badge variant={isPublic ? 'info' : 'neutral'}>{isPublic ? t('common.public') : t('common.private')}</Badge>;
}

function StatusBadge({ archivedAt }: { archivedAt: string | null }) {
  const { t } = useI18n();
  const isArchived = !!archivedAt;
  return (
    <Badge variant={isArchived ? 'warning' : 'success'}>
      <span className={`h-1.5 w-1.5 rounded-full ${isArchived ? 'bg-warning' : 'bg-success'}`} />
      {isArchived ? t('projects.statusArchived') : t('projects.statusActive')}
    </Badge>
  );
}

function ProjectRow({
  project,
  sharesName,
  onArchive,
  onUnarchive,
}: {
  project: Project;
  sharesName: boolean;
  onArchive: (id: string) => Promise<void>;
  onUnarchive: (id: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [showConfirm, setShowConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const isArchived = !!project.archived_at;

  async function handleArchive() {
    setArchiving(true);
    setArchiveError(null);
    try {
      await onArchive(project.id);
      setShowConfirm(false);
    } catch (err) {
      setArchiveError(apiErrorMessage(err, t('projects.archiveFail')));
      setArchiving(false);
    }
  }

  async function handleUnarchive() {
    setRestoring(true);
    setRestoreError(null);
    try {
      await onUnarchive(project.id);
    } catch (err) {
      setRestoreError(apiErrorMessage(err, t('projects.restoreFail')));
      setRestoring(false);
    }
  }

  return (
    <>
      <RowItem>
        <RowTitle
          href={`/projects/${project.id}`}
          name={project.name}
          meta={
            sharesName
              ? [t('projects.created', { when: formatDateTime(project.created_at) }), project.description].filter(Boolean).join(' · ')
              : (project.description ?? undefined)
          }
          leading={<StarPrint id={project.id} size="sm" />}
        />

        <span>{project.genre && <Badge variant="neutral">{project.genre}</Badge>}</span>
        <span><StatusBadge archivedAt={project.archived_at} /></span>
        <span><VisibilityBadge visibility={project.visibility} /></span>
        <RowTime>{formatRelativeTime(project.updated_at)}</RowTime>

        <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
          {!isArchived && (
            <Link
              href={`/projects/${project.id}/edit`}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[13px] font-semibold hover:border-border-strong hover:bg-surface-subtle"
            >
              <Piano className="h-3.5 w-3.5" /> {t('home.openEditor')}
            </Link>
          )}

          {isArchived ? (
            <Button variant="ghost" onClick={() => void handleUnarchive()} disabled={restoring}>
              <Undo2 className="h-3.5 w-3.5" /> {restoring ? t('projects.restoring') : t('projects.restore')}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setShowConfirm(true)}>
              <Archive className="h-3.5 w-3.5" /> {t('projects.archive')}
            </Button>
          )}

          <Link
            href={`/projects/${project.id}/settings`}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-subtle hover:text-foreground"
            title={t('projects.settings')}
            aria-label={t('projects.settings')}
          >
            <SettingsIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
      </RowItem>

      <ConfirmDialog
        open={showConfirm}
        title={t('projects.archiveTitle')}
        message={t('projects.archiveBody', { name: project.name })}
        confirmLabel={t('projects.archive')}
        loading={archiving}
        error={archiveError}
        onConfirm={() => void handleArchive()}
        onCancel={() => {
          setShowConfirm(false);
          setArchiveError(null);
        }}
      />
      {restoreError && (
        <Toast message={restoreError} variant="danger" onDismiss={() => setRestoreError(null)} duration={0} />
      )}
    </>
  );
}

function ProjectsContent() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter/sort/pagination state
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('default');
  const [genre, setGenre] = useState<string>('');
  const tab = (searchParams.get('tab') as Tab) || 'all';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

  async function fetchProjects() {
    try {
      const data = (await listProjects()) as Project[];
      setProjects(data);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, t('projects.loadFail')));
    }
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      await fetchProjects();
      setLoading(false);
    })();
  }, []);

  async function handleArchive(id: string) {
    await archiveProject(id);
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, archived_at: new Date().toISOString() } : p,
      ),
    );
  }

  async function handleUnarchive(id: string) {
    await unarchiveProject(id);
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, archived_at: null } : p)),
    );
  }

  function updateUrl(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === 'default' || value === 'all' || value === '1') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    router.push(`/projects?${params.toString()}`);
  }

  // Collect unique genres
  const allGenres = useMemo(() => {
    const genres = new Set<string>();
    projects.forEach((p) => { if (p.genre) genres.add(p.genre); });
    return Array.from(genres).sort();
  }, [projects]);

  // Filter + sort
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // Tab filter
    if (tab === 'active') result = result.filter((p) => !p.archived_at);
    if (tab === 'archived') result = result.filter((p) => p.archived_at);

    // Genre filter
    if (genre) {
      result = result.filter((p) => p.genre === genre);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }

    // Sort
    switch (sort) {
      case 'updated_desc':
        result.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        break;
      case 'updated_asc':
        result.sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
        break;
      case 'name_asc':
        result.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
        break;
      case 'name_desc':
        result.sort((a, b) => b.name.localeCompare(a.name, 'vi'));
        break;
      case 'default':
      default:
        // Public first, then by updated_at desc
        result.sort((a, b) => {
          if (a.visibility === 'public' && b.visibility !== 'public') return -1;
          if (a.visibility !== 'public' && b.visibility === 'public') return 1;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
    }

    return result;
  }, [projects, tab, genre, search, sort]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const duplicateNames = useMemo(() => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const p of projects) {
      const key = p.name.trim().toLowerCase();
      if (seen.has(key)) dups.add(key);
      seen.add(key);
    }
    return dups;
  }, [projects]);

  const paginatedProjects = filteredProjects.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const activeCount = projects.filter((p) => !p.archived_at).length;
  const archivedCount = projects.filter((p) => p.archived_at).length;

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: 'all', label: t('projects.tabAll'), count: projects.length },
    { value: 'active', label: t('projects.tabActive'), count: activeCount },
    { value: 'archived', label: t('projects.tabArchived'), count: archivedCount },
  ];

  // Build page numbers (max 5 shown)
  const pageNumbers: (number | '…')[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (currentPage > 3) pageNumbers.push('…');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pageNumbers.push(i);
    }
    if (currentPage < totalPages - 2) pageNumbers.push('…');
    pageNumbers.push(totalPages);
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8">
      <PageHeader
        breadcrumbs={[{ label: t('projects.crumb') }]}
        title={t('projects.title')}
        description={t('projects.description')}
        action={
          <Link href="/projects/new">
            <Button>
              <Plus className="h-3.5 w-3.5" /> {t('projects.create')}
            </Button>
          </Link>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-[380px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            name="q"
            autoComplete="off"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              updateUrl({ page: null }); // reset to page 1 on search
            }}
            placeholder={t('projects.filterPlaceholder')}
            aria-label={t('projects.filterPlaceholder')}
            className={`${INPUT_CLASS} h-[34px] w-full pl-8`}
          />
        </div>

        {allGenres.length > 0 && (
          <select
            value={genre}
            onChange={(e) => {
              setGenre(e.target.value);
              updateUrl({ page: null });
            }}
            aria-label={t('projects.filterGenre')}
            className={`${INPUT_CLASS} h-[34px]`}
          >
            <option value="">{t('projects.allGenres')}</option>
            {allGenres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          aria-label={t('projects.sort')}
          className={`${INPUT_CLASS} h-[34px]`}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.label)}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-5">
        <Tabs
          tabs={tabs.map((tb) => ({ id: tb.value, label: `${tb.label} (${tb.count})` }))}
          active={tab}
          onChange={(id) => updateUrl({ tab: id, page: null })}
        />
      </div>

      {/* Content */}
      {loading && <SkyLoading label={t('projects.loading')} />}

      {error && (
        <div className="rounded-card border border-danger/20 bg-danger-muted p-4">
          <p className="text-sm text-danger">{error}</p>
          <button
            onClick={() => void fetchProjects()}
            className="mt-2 rounded-lg border border-danger/30 px-3 py-1 text-xs text-danger hover:bg-danger-muted"
          >
            {t('ui.retry')}
          </button>
        </div>
      )}

      {!loading && !error && filteredProjects.length === 0 && (
        <SkyEmpty
          title={
            search || genre
              ? `${t('projects.noMatch')}${search ? t('projects.matching', { q: search }) : ''}${genre ? ` #${genre}` : ''}`
              : projects.length === 0
                ? t('projects.none')
                : t('projects.noneInTab')
          }
          description={projects.length === 0 && !search && !genre ? t('projects.noneHint') : undefined}
          action={
            search || genre ? (
              <button
                onClick={() => {
                  setSearch('');
                  setGenre('');
                  updateUrl({ page: null });
                }}
                className="text-sm text-accent hover:underline"
              >
                {t('projects.clearFilters')}
              </button>
            ) : projects.length === 0 ? (
              <Link href="/projects/new">
                <Button className="gap-1.5">
                  <Plus className="h-4 w-4" /> {t('projects.create')}
                </Button>
              </Link>
            ) : (
              <button
                onClick={() => updateUrl({ tab: 'all', page: null })}
                className="text-sm text-accent hover:underline"
              >
                {t('projects.showAll')}
              </button>
            )
          }
        />
      )}

      {!loading && !error && filteredProjects.length > 0 && (
        <>
          <p className="mb-2 text-xs text-muted">
            {t('projects.count', { n: filteredProjects.length })}
            {genre ? ` • #${genre}` : ''}
            {search ? ` • "${search}"` : ''}
          </p>

          <RowList cols={COLS}>
            <RowHeader>
              <span>{t('projects.colProject')}</span>
              <span>{t('projects.colGenre')}</span>
              <span>{t('projects.colStatus')}</span>
              <span>{t('projects.colVisibility')}</span>
              <span className="text-right">{t('projects.colUpdated')}</span>
              <span />
            </RowHeader>

            {paginatedProjects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                sharesName={duplicateNames.has(project.name.trim().toLowerCase())}
                onArchive={handleArchive}
                onUnarchive={handleUnarchive}
              />
            ))}
          </RowList>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-1">
              <button
                onClick={() => updateUrl({ page: String(currentPage - 1) })}
                disabled={currentPage <= 1}
                aria-label={t('projects.prevPage')}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-xs hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {pageNumbers.map((p, i) =>
                p === '…' ? (
                  <span key={`ellipsis-${i}`} className="flex h-8 w-8 items-center justify-center text-xs text-muted">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    aria-label={t('projects.page', { n: p })}
                    aria-current={p === currentPage ? 'page' : undefined}
                    onClick={() => updateUrl({ page: String(p) })}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border font-mono text-xs font-semibold ${
                      p === currentPage
                        ? 'border-accent bg-accent text-accent-foreground'
                        : 'border-border bg-surface hover:bg-surface-subtle'
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}

              <button
                onClick={() => updateUrl({ page: String(currentPage + 1) })}
                disabled={currentPage >= totalPages}
                aria-label={t('projects.nextPage')}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-xs hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  const { t } = useI18n();
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <div className="mx-auto max-w-page px-5 py-8">
            <SkyLoading label={t('projects.loading')} />
          </div>
        }
      >
        <ProjectsContent />
      </Suspense>
    </RequireAuth>
  );
}
