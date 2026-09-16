'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { Search, Music2, Piano, Archive, Undo2, Settings as SettingsIcon, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { RequireAuth } from '../../components/require-auth';
import {
  archiveProject,
  unarchiveProject,
  listProjects,
  ApiError,
  type ProjectVisibility,
} from '../../lib/api-client';
import { formatRelativeTime } from '../../lib/format-date';
import { PageHeader } from '../../components/ui/page-header';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Tabs } from '../../components/ui/tabs';
import { EmptyState } from '../../components/ui/empty-state';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { INPUT_CLASS } from '../../components/ui/form';
import { RowList, RowHeader, RowItem, RowTitle, RowTime } from '../../components/ui/row-list';

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

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'default', label: 'Công khai trước' },
  { value: 'updated_desc', label: 'Mới cập nhật' },
  { value: 'updated_asc', label: 'Cũ nhất' },
  { value: 'name_asc', label: 'Tên A→Z' },
  { value: 'name_desc', label: 'Tên Z→A' },
];

const PAGE_SIZE = 12;

type Tab = 'all' | 'active' | 'archived';

/** Dự án | thể loại | trạng thái | hiển thị | cập nhật | thao tác. */
const COLS = 'md:grid-cols-[minmax(0,1fr)_104px_108px_92px_78px_auto]';

function VisibilityBadge({ visibility }: { visibility: ProjectVisibility }) {
  const isPublic = visibility === 'public';
  return <Badge variant={isPublic ? 'info' : 'neutral'}>{isPublic ? 'Công khai' : 'Riêng tư'}</Badge>;
}

function StatusBadge({ archivedAt }: { archivedAt: string | null }) {
  const isArchived = !!archivedAt;
  return (
    <Badge variant={isArchived ? 'warning' : 'success'}>
      <span className={`h-1.5 w-1.5 rounded-full ${isArchived ? 'bg-warning' : 'bg-success'}`} />
      {isArchived ? 'Đã lưu trữ' : 'Hoạt động'}
    </Badge>
  );
}

function ProjectRow({
  project,
  onArchive,
  onUnarchive,
}: {
  project: Project;
  onArchive: (id: string) => Promise<void>;
  onUnarchive: (id: string) => Promise<void>;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const isArchived = !!project.archived_at;

  async function handleArchive() {
    setArchiving(true);
    try {
      await onArchive(project.id);
      setShowConfirm(false);
    } catch {
      setArchiving(false);
    }
  }

  async function handleUnarchive() {
    setRestoring(true);
    try {
      await onUnarchive(project.id);
    } catch {
      setRestoring(false);
    }
  }

  return (
    <>
      <RowItem cols={COLS}>
        <RowTitle
          href={`/projects/${project.id}/edit`}
          name={project.name}
          meta={project.description ?? undefined}
          leading={<Music2 className="h-4 w-4 shrink-0 text-muted" />}
        />

        <span>{project.genre && <Badge variant="neutral">{project.genre}</Badge>}</span>
        <span><StatusBadge archivedAt={project.archived_at} /></span>
        <span><VisibilityBadge visibility={project.visibility} /></span>
        <RowTime>{formatRelativeTime(project.updated_at)}</RowTime>

        <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
          <Link
            href={`/projects/${project.id}/edit`}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold hover:border-border-strong hover:bg-surface-subtle"
          >
            <Piano className="h-3.5 w-3.5" /> {isArchived ? 'Xem' : 'Mở Editor'}
          </Link>

          {isArchived ? (
            <Button variant="ghost" onClick={() => void handleUnarchive()} disabled={restoring}>
              <Undo2 className="h-3.5 w-3.5" /> {restoring ? 'Đang khôi phục…' : 'Khôi phục'}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setShowConfirm(true)}>
              <Archive className="h-3.5 w-3.5" /> Lưu trữ
            </Button>
          )}

          <Link
            href={`/projects/${project.id}/settings`}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-subtle hover:text-foreground"
            title="Cài đặt dự án"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
      </RowItem>

      <ConfirmDialog
        open={showConfirm}
        title="Xác nhận lưu trữ"
        message={`Bạn có chắc muốn lưu trữ dự án "${project.name}"? Dự án sẽ chuyển sang phần đã lưu trữ.`}
        confirmLabel="Lưu trữ"
        loading={archiving}
        onConfirm={() => void handleArchive()}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

function ProjectsContent() {
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
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof TypeError && /fetch/i.test(String(err))) {
        setError(
          'Không thể kết nối tới máy chủ. Vui lòng kiểm tra backend đang chạy và thử lại.',
        );
      } else {
        setError('Có lỗi xảy ra');
      }
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
  const paginatedProjects = filteredProjects.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const activeCount = projects.filter((p) => !p.archived_at).length;
  const archivedCount = projects.filter((p) => p.archived_at).length;

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: 'all', label: 'Tất cả', count: projects.length },
    { value: 'active', label: 'Đang hoạt động', count: activeCount },
    { value: 'archived', label: 'Đã lưu trữ', count: archivedCount },
  ];

  // Build page numbers (max 5 shown)
  const pageNumbers: (number | '...')[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (currentPage > 3) pageNumbers.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pageNumbers.push(i);
    }
    if (currentPage < totalPages - 2) pageNumbers.push('...');
    pageNumbers.push(totalPages);
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8">
      <PageHeader
        breadcrumbs={[{ label: 'Không gian của bạn' }]}
        title="Dự án của tôi"
        description="Bản phác, bản phối đã hoàn thiện và những ý tưởng đã lưu trữ."
        action={
          <Link href="/projects/new">
            <Button>
              <Plus className="h-3.5 w-3.5" /> Tạo dự án mới
            </Button>
          </Link>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-[380px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              updateUrl({ page: null }); // reset to page 1 on search
            }}
            placeholder="Lọc dự án của bạn"
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
            aria-label="Lọc theo thể loại"
            className={`${INPUT_CLASS} h-[34px]`}
          >
            <option value="">Tất cả thể loại</option>
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
          aria-label="Sắp xếp"
          className={`${INPUT_CLASS} h-[34px]`}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-5">
        <Tabs
          tabs={tabs.map((t) => ({ id: t.value, label: `${t.label} (${t.count})` }))}
          active={tab}
          onChange={(id) => updateUrl({ tab: id, page: null })}
        />
      </div>

      {/* Content */}
      {loading && (
        <RowList>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex min-h-[68px] animate-pulse items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0">
              <div className="h-4 w-4 shrink-0 rounded bg-surface-subtle" />
              <div className="flex-1">
                <div className="mb-1.5 h-3 w-1/3 rounded bg-surface-subtle" />
                <div className="h-2.5 w-1/2 rounded bg-surface-subtle" />
              </div>
            </div>
          ))}
        </RowList>
      )}

      {error && (
        <div className="rounded-card border border-danger/20 bg-danger-muted p-4">
          <p className="text-sm text-danger">{error}</p>
          <button
            onClick={() => void fetchProjects()}
            className="mt-2 rounded-lg border border-danger/30 px-3 py-1 text-xs text-danger hover:bg-danger-muted"
          >
            Thử lại
          </button>
        </div>
      )}

      {!loading && !error && filteredProjects.length === 0 && (
        <EmptyState
          icon={search || genre ? Search : Music2}
          title={
            search || genre
              ? `Không tìm thấy dự án nào${search ? ` matching "${search}"` : ''}${genre ? ` #${genre}` : ''}`
              : projects.length === 0
                ? 'Chưa có dự án nào.'
                : 'Không có dự án nào trong mục này.'
          }
          description={projects.length === 0 && !search && !genre ? 'Tạo dự án đầu tiên của bạn để bắt đầu sáng tác!' : undefined}
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
                Xóa bộ lọc
              </button>
            ) : projects.length === 0 ? (
              <Link href="/projects/new">
                <Button className="gap-1.5">
                  <Plus className="h-4 w-4" /> Tạo dự án mới
                </Button>
              </Link>
            ) : (
              <button
                onClick={() => updateUrl({ tab: 'all', page: null })}
                className="text-sm text-accent hover:underline"
              >
                Xem tất cả dự án
              </button>
            )
          }
        />
      )}

      {!loading && !error && filteredProjects.length > 0 && (
        <>
          <p className="mb-2 text-[11px] text-muted">
            {filteredProjects.length === 1
              ? '1 dự án'
              : `${filteredProjects.length} dự án`}
            {genre ? ` • #${genre}` : ''}
            {search ? ` • "${search}"` : ''}
          </p>

          <RowList>
            <RowHeader cols={COLS}>
              <span>Dự án</span>
              <span>Thể loại</span>
              <span>Trạng thái</span>
              <span>Hiển thị</span>
              <span className="text-right">Cập nhật</span>
              <span />
            </RowHeader>

            {paginatedProjects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
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
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-xs hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {pageNumbers.map((p, i) =>
                p === '...' ? (
                  <span key={`ellipsis-${i}`} className="flex h-8 w-8 items-center justify-center text-xs text-muted">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
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
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <div className="mx-auto max-w-page px-5 py-8">
            <div className="mb-6 flex items-center justify-between">
              <div className="h-8 w-40 animate-pulse rounded bg-surface-subtle" />
              <div className="h-8 w-32 animate-pulse rounded bg-surface-subtle" />
            </div>
            <RowList>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex min-h-[68px] animate-pulse items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0">
                  <div className="h-4 w-4 shrink-0 rounded bg-surface-subtle" />
                  <div className="flex-1">
                    <div className="mb-1.5 h-3 w-1/3 rounded bg-surface-subtle" />
                    <div className="h-2.5 w-1/2 rounded bg-surface-subtle" />
                  </div>
                </div>
              ))}
            </RowList>
          </div>
        }
      >
        <ProjectsContent />
      </Suspense>
    </RequireAuth>
  );
}
