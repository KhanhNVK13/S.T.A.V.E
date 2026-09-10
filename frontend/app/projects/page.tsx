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
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Tabs } from '../../components/ui/tabs';
import { EmptyState } from '../../components/ui/empty-state';
import { INPUT_CLASS } from '../../components/ui/form';
import { CARD_LIST_CLASS } from '../../components/ui/card-grid';

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

function VisibilityBadge({ visibility }: { visibility: ProjectVisibility }) {
  const isPublic = visibility === 'public';
  return <Badge variant={isPublic ? 'info' : 'neutral'}>{isPublic ? 'Công khai' : 'Riêng tư'}</Badge>;
}

function StatusBadge({ archivedAt }: { archivedAt: string | null }) {
  const isArchived = !!archivedAt;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
        isArchived ? 'bg-warning-50 text-warning-700' : 'bg-success-50 text-success-700'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isArchived ? 'bg-warning-600' : 'bg-success-600'}`} />
      {isArchived ? 'Đã lưu trữ' : 'Hoạt động'}
    </span>
  );
}

function ProjectCard({
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
      <Card className="flex flex-col gap-3 p-4 transition-all hover:border-accent-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
        {/* Left: icon + name + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Music2 className="h-4 w-4 shrink-0 text-slate-400" />
            <h3 className="truncate font-semibold text-slate-900">{project.name}</h3>
            <VisibilityBadge visibility={project.visibility} />
            <StatusBadge archivedAt={project.archived_at} />
            {project.genre && (
              <span className="rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
                #{project.genre}
              </span>
            )}
          </div>

          {project.description && (
            <p className="mt-1 line-clamp-1 text-sm text-slate-500">{project.description}</p>
          )}

          <p className="mt-1 font-mono text-xs text-slate-500">
            Cập nhật: {formatRelativeTime(project.updated_at)}
          </p>
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Editor placeholder */}
          <button
            disabled
            title="PLACEHOLDER — chưa xây dựng"
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-400"
          >
            <Piano className="h-3.5 w-3.5" /> Mở Editor
          </button>

          {isArchived ? (
            <>
              <Link
                href={`/projects/${project.id}/edit`}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Xem
              </Link>
              <button
                onClick={() => void handleUnarchive()}
                disabled={restoring}
                className="flex items-center gap-1 rounded-lg border border-success-600/40 px-3 py-1.5 text-xs font-medium text-success-600 hover:bg-success-50 disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" /> {restoring ? 'Đang khôi phục...' : 'Khôi phục'}
              </button>
            </>
          ) : (
            <>
              <Link
                href={`/projects/${project.id}/edit`}
                className="rounded-lg border border-accent-600 px-3 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-50"
              >
                Chỉnh sửa
              </Link>
              <button
                onClick={() => setShowConfirm(true)}
                className="flex items-center gap-1 rounded-lg border border-warning-600/40 px-3 py-1.5 text-xs font-medium text-warning-600 hover:bg-warning-50"
              >
                <Archive className="h-3.5 w-3.5" /> Lưu trữ
              </button>
            </>
          )}

          <Link
            href={`/projects/${project.id}/settings`}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
          >
            <SettingsIcon className="h-3.5 w-3.5" /> Cài đặt
          </Link>
        </div>
      </Card>

      {/* Confirm archive dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <Card className="w-full max-w-sm p-6">
            <h3 className="mb-2 text-lg font-semibold text-slate-900">Xác nhận lưu trữ</h3>
            <p className="mb-6 text-sm text-slate-500">
              Bạn có chắc muốn lưu trữ dự án &quot;{project.name}&quot;? Dự án sẽ chuyển sang
              phần đã lưu trữ.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowConfirm(false)} disabled={archiving}>
                Huỷ
              </Button>
              <Button
                onClick={() => void handleArchive()}
                disabled={archiving}
                className="bg-warning-600 hover:bg-warning-700"
              >
                {archiving ? 'Đang xử lý...' : 'Xác nhận lưu trữ'}
              </Button>
            </div>
          </Card>
        </div>
      )}
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
    <div className="mx-auto max-w-page px-4 py-8">
      <PageHeader
        title="Dự án của tôi"
        action={
          <Link href="/projects/new">
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" /> Tạo dự án mới
            </Button>
          </Link>
        }
      />

      {/* Row 1: Search + Sort */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              updateUrl({ page: null }); // reset to page 1 on search
            }}
            placeholder="Tìm theo tên..."
            className={`${INPUT_CLASS} w-full pl-9`}
          />
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className={INPUT_CLASS}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Row 2: Genre pills (only show if there are genres) */}
      {allGenres.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Thể loại:</span>
          <button
            onClick={() => {
              setGenre('');
              updateUrl({ page: null });
            }}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              genre === '' ? 'bg-accent-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
            }`}
          >
            Tất cả
          </button>
          {allGenres.map((g) => (
            <button
              key={g}
              onClick={() => {
                setGenre(g);
                updateUrl({ page: null });
              }}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                genre === g ? 'bg-accent-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              #{g}
            </button>
          ))}
        </div>
      )}

      {/* Row 3: Tabs */}
      <div className="mb-6">
        <Tabs
          tabs={tabs.map((t) => ({ id: t.value, label: `${t.label} (${t.count})` }))}
          active={tab}
          onChange={(id) => updateUrl({ tab: id, page: null })}
        />
      </div>

      {/* Content */}
      {loading && (
        <div className={CARD_LIST_CLASS}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-card border border-slate-200 bg-white p-4">
              <div className="mb-2 h-5 w-1/3 rounded bg-slate-100" />
              <div className="h-3 w-2/3 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-card border border-danger-600/20 bg-danger-50 p-4">
          <p className="text-sm text-danger-600">{error}</p>
          <button
            onClick={() => void fetchProjects()}
            className="mt-2 rounded-lg border border-danger-600/30 px-3 py-1 text-xs text-danger-600 hover:bg-danger-50"
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
                className="text-sm text-accent-600 hover:underline"
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
                className="text-sm text-accent-600 hover:underline"
              >
                Xem tất cả dự án
              </button>
            )
          }
        />
      )}

      {!loading && !error && filteredProjects.length > 0 && (
        <>
          <p className="mb-4 text-sm text-slate-500">
            {filteredProjects.length === 1
              ? '1 dự án'
              : `${filteredProjects.length} dự án`}
            {genre ? ` • #${genre}` : ''}
            {search ? ` • "${search}"` : ''}
          </p>

          <div className={CARD_LIST_CLASS}>
            {paginatedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onArchive={handleArchive}
                onUnarchive={handleUnarchive}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-1">
              <button
                onClick={() => updateUrl({ page: String(currentPage - 1) })}
                disabled={currentPage <= 1}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {pageNumbers.map((p, i) =>
                p === '...' ? (
                  <span key={`ellipsis-${i}`} className="flex h-9 w-9 items-center justify-center text-slate-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => updateUrl({ page: String(p) })}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-medium ${
                      p === currentPage
                        ? 'border-accent-600 bg-accent-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}

              <button
                onClick={() => updateUrl({ page: String(currentPage + 1) })}
                disabled={currentPage >= totalPages}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
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
          <div className="mx-auto max-w-page px-4 py-8">
            <div className="mb-6 flex items-center justify-between">
              <div className="h-8 w-40 animate-pulse rounded bg-slate-100" />
              <div className="h-10 w-40 animate-pulse rounded bg-slate-100" />
            </div>
            <div className={CARD_LIST_CLASS}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-card border border-slate-200 bg-white p-4">
                  <div className="mb-2 h-5 w-2/3 rounded bg-slate-100" />
                  <div className="mb-3 h-3 w-1/2 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
        }
      >
        <ProjectsContent />
      </Suspense>
    </RequireAuth>
  );
}
