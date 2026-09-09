'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { RequireAuth } from '../../components/require-auth';
import {
  archiveProject,
  listProjects,
  ApiError,
  type ProjectVisibility,
} from '../../lib/api-client';
import { formatRelativeTime } from '../../lib/format-date';

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
  { value: 'default', label: '🌐 Công khai trước' },
  { value: 'updated_desc', label: '🕐 Mới cập nhật' },
  { value: 'updated_asc', label: '🕰️ Cũ nhất' },
  { value: 'name_asc', label: '🔤 Tên A→Z' },
  { value: 'name_desc', label: '🔤 Tên Z→A' },
];

const PAGE_SIZE = 12;

type Tab = 'all' | 'active' | 'archived';

function VisibilityBadge({ visibility }: { visibility: ProjectVisibility }) {
  const isPublic = visibility === 'public';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        isPublic
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
      }`}
    >
      {isPublic ? '🌐' : '🔒'}
      {isPublic ? 'Công khai' : 'Riêng tư'}
    </span>
  );
}

function StatusBadge({ archivedAt }: { archivedAt: string | null }) {
  const isArchived = !!archivedAt;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        isArchived
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
          : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isArchived ? 'bg-amber-500' : 'bg-green-500'}`} />
      {isArchived ? 'Đã lưu trữ' : 'Hoạt động'}
    </span>
  );
}

function ProjectCard({
  project,
  onArchive,
}: {
  project: Project;
  onArchive: (id: string) => Promise<void>;
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
      const { unarchiveProject } = await import('../../lib/api-client');
      await unarchiveProject(project.id);
      window.location.reload();
    } catch {
      setRestoring(false);
    }
  }

  return (
    <>
      <div className="flex flex-col rounded-lg border border-[#E3E4E8] bg-white p-4 transition-all hover:border-[#1D4ED8] hover:shadow-sm dark:border-white/10 dark:bg-[#1F2126]">
        {/* Header: icon + name + visibility */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">🎵</span>
            <h3 className="truncate font-semibold text-[#1F2126] dark:text-white">
              {project.name}
            </h3>
          </div>
          <VisibilityBadge visibility={project.visibility} />
        </div>

        {/* Meta: relative time */}
        <p className="mb-2 text-xs text-[#8A8D93]">
          Cập nhật: {formatRelativeTime(project.updated_at)}
        </p>

        {/* Description */}
        {project.description && (
          <p className="mb-3 line-clamp-2 text-sm text-[#8A8D93]">
            {project.description}
          </p>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Status row: badges + genre */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusBadge archivedAt={project.archived_at} />
          {project.genre && (
            <span className="rounded-full bg-[#F7F7F5] px-2 py-0.5 text-xs text-[#8A8D93] dark:bg-white/5">
              #{project.genre}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Editor placeholder */}
          <button
            disabled
            title="Sắp ra mắt"
            className="flex items-center gap-1 rounded border border-[#E3E4E8] bg-[#F7F7F5] px-3 py-1.5 text-xs text-[#8A8D93] dark:border-white/10 dark:bg-white/5 dark:text-gray-500"
          >
            🎹 Mở Editor
          </button>

          {isArchived ? (
            <button
              onClick={() => void handleUnarchive()}
              disabled={restoring}
              className="flex items-center gap-1 rounded border border-green-400 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 disabled:opacity-50 dark:border-green-400/50 dark:text-green-400 dark:hover:bg-green-900/20"
            >
              {restoring ? 'Đang khôi phục...' : '↩ Khôi phục'}
            </button>
          ) : (
            <>
              <Link
                href={`/projects/${project.id}/edit`}
                className="rounded border border-[#1D4ED8] px-3 py-1.5 text-xs font-medium text-[#1D4ED8] hover:bg-[#1D4ED8]/10"
              >
                Chỉnh sửa
              </Link>
              <button
                onClick={() => setShowConfirm(true)}
                className="rounded border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 dark:border-amber-400/50 dark:text-amber-400 dark:hover:bg-amber-900/20"
              >
                📦 Lưu trữ
              </button>
            </>
          )}

          <Link
            href={`/projects/${project.id}/settings`}
            className="rounded border border-[#E3E4E8] px-3 py-1.5 text-xs text-[#8A8D93] hover:bg-[#F7F7F5] dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/5"
          >
            ⚙️ Cài đặt
          </Link>
        </div>
      </div>

      {/* Confirm archive dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
            <h3 className="mb-2 text-lg font-semibold text-[#1F2126] dark:text-white">
              Xác nhận lưu trữ
            </h3>
            <p className="mb-6 text-sm text-[#8A8D93]">
              Bạn có chắc muốn lưu trữ dự án &quot;{project.name}&quot;? Dự
              án sẽ chuyển sang phần đã lưu trữ.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={archiving}
                className="rounded border border-[#E3E4E8] px-4 py-2 text-sm hover:bg-[#F7F7F5] dark:border-white/10 dark:hover:bg-white/5"
              >
                Huỷ
              </button>
              <button
                onClick={() => void handleArchive()}
                disabled={archiving}
                className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {archiving ? 'Đang xử lý...' : 'Xác nhận lưu trữ'}
              </button>
            </div>
          </div>
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
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1F2126] dark:text-white">
          Dự án của tôi
        </h1>
        <Link
          href="/projects/new"
          className="rounded bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1E40AF]"
        >
          + Tạo dự án mới
        </Link>
      </div>

      {/* Row 1: Search + Sort */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8D93]">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              updateUrl({ page: null }); // reset to page 1 on search
            }}
            placeholder="Tìm theo tên..."
            className="w-full rounded-lg border border-[#E3E4E8] bg-white py-2 pl-9 pr-3 text-sm text-[#1F2126] placeholder:text-[#8A8D93] focus:border-[#1D4ED8] focus:outline-none focus:ring-1 focus:ring-[#1D4ED8] dark:border-white/10 dark:bg-[#1F2126] dark:text-white"
          />
        </div>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="rounded-lg border border-[#E3E4E8] bg-white px-3 py-2 text-sm text-[#1F2126] focus:border-[#1D4ED8] focus:outline-none focus:ring-1 focus:ring-[#1D4ED8] dark:border-white/10 dark:bg-[#1F2126] dark:text-white"
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
          <span className="text-xs text-[#8A8D93]">Thể loại:</span>
          <button
            onClick={() => {
              setGenre('');
              updateUrl({ page: null });
            }}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              genre === ''
                ? 'bg-[#1D4ED8] text-white'
                : 'bg-[#F7F7F5] text-[#8A8D93] hover:bg-[#E3E4E8] dark:bg-white/5 dark:hover:bg-white/10'
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
                genre === g
                  ? 'bg-[#1D4ED8] text-white'
                  : 'bg-[#F7F7F5] text-[#8A8D93] hover:bg-[#E3E4E8] dark:bg-white/5 dark:hover:bg-white/10'
              }`}
            >
              #{g}
            </button>
          ))}
        </div>
      )}

      {/* Row 3: Tabs */}
      <div className="mb-6 flex gap-1 border-b border-[#E3E4E8] dark:border-white/10">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => updateUrl({ tab: t.value, page: null })}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.value
                ? 'border-b-2 border-[#1D4ED8] text-[#1D4ED8]'
                : 'text-[#8A8D93] hover:text-[#1F2126]'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-lg border border-[#E3E4E8] bg-white p-4 dark:border-white/10 dark:bg-[#1F2126]"
            >
              <div className="mb-2 h-5 w-2/3 rounded bg-[#F7F7F5] dark:bg-white/5" />
              <div className="mb-3 h-3 w-1/2 rounded bg-[#F7F7F5] dark:bg-white/5" />
              <div className="mb-4 h-3 w-full rounded bg-[#F7F7F5] dark:bg-white/5" />
              <div className="flex gap-2">
                <div className="h-6 w-16 rounded bg-[#F7F7F5] dark:bg-white/5" />
                <div className="h-6 w-20 rounded bg-[#F7F7F5] dark:bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => void fetchProjects()}
            className="mt-2 rounded border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900"
          >
            Thử lại
          </button>
        </div>
      )}

      {!loading && !error && filteredProjects.length === 0 && (
        <div className="rounded-lg border border-[#E3E4E8] bg-white p-12 text-center dark:border-white/10 dark:bg-[#1F2126]">
          <p className="mb-2 text-4xl">
            {search || genre ? '🔍' : projects.length === 0 ? '🎵' : '📂'}
          </p>
          {search || genre ? (
            <>
              <p className="text-[#8A8D93]">
                Không tìm thấy dự án nào
                {search ? ` matching "${search}"` : ''}
                {genre ? ` #${genre}` : ''}
              </p>
              <button
                onClick={() => {
                  setSearch('');
                  setGenre('');
                  updateUrl({ page: null });
                }}
                className="mt-3 text-sm text-[#1D4ED8] hover:underline"
              >
                Xóa bộ lọc
              </button>
            </>
          ) : projects.length === 0 ? (
            <>
              <p className="text-[#8A8D93]">Chưa có dự án nào.</p>
              <p className="mt-1 text-sm text-[#8A8D93]">
                Tạo dự án đầu tiên của bạn để bắt đầu sáng tác!
              </p>
              <Link
                href="/projects/new"
                className="mt-4 inline-block rounded bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1E40AF]"
              >
                + Tạo dự án mới
              </Link>
            </>
          ) : (
            <>
              <p className="text-[#8A8D93]">Không có dự án nào trong mục này.</p>
              <button
                onClick={() => updateUrl({ tab: 'all', page: null })}
                className="mt-3 text-sm text-[#1D4ED8] hover:underline"
              >
                Xem tất cả dự án
              </button>
            </>
          )}
        </div>
      )}

      {!loading && !error && filteredProjects.length > 0 && (
        <>
          <p className="mb-4 text-sm text-[#8A8D93]">
            {filteredProjects.length === 1
              ? '1 dự án'
              : `${filteredProjects.length} dự án`}
            {genre ? ` • #${genre}` : ''}
            {search ? ` • "${search}"` : ''}
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onArchive={handleArchive}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-1">
              <button
                onClick={() => updateUrl({ page: String(currentPage - 1) })}
                disabled={currentPage <= 1}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E3E4E8] bg-white text-sm text-[#1F2126] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#F7F7F5] dark:border-white/10 dark:bg-[#1F2126] dark:text-white disabled:dark:opacity-30"
              >
                ‹
              </button>

              {pageNumbers.map((p, i) =>
                p === '...' ? (
                  <span key={`ellipsis-${i}`} className="flex h-9 w-9 items-center justify-center text-[#8A8D93]">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => updateUrl({ page: String(p) })}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-medium ${
                      p === currentPage
                        ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white'
                        : 'border-[#E3E4E8] bg-white text-[#1F2126] hover:bg-[#F7F7F5] dark:border-white/10 dark:bg-[#1F2126] dark:text-white dark:hover:bg-white/10'
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}

              <button
                onClick={() => updateUrl({ page: String(currentPage + 1) })}
                disabled={currentPage >= totalPages}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E3E4E8] bg-white text-sm text-[#1F2126] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#F7F7F5] dark:border-white/10 dark:bg-[#1F2126] dark:text-white disabled:dark:opacity-30"
              >
                ›
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
          <div className="mx-auto max-w-5xl px-4 py-8">
            <div className="mb-6 flex items-center justify-between">
              <div className="h-8 w-40 animate-pulse rounded bg-[#F7F7F5] dark:bg-white/5" />
              <div className="h-10 w-40 animate-pulse rounded bg-[#F7F7F5] dark:bg-white/5" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-lg border border-[#E3E4E8] bg-white p-4 dark:border-white/10 dark:bg-[#1F2126]"
                >
                  <div className="mb-2 h-5 w-2/3 rounded bg-[#F7F7F5] dark:bg-white/5" />
                  <div className="mb-3 h-3 w-1/2 rounded bg-[#F7F7F5] dark:bg-white/5" />
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
