"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { RequireAuth } from "../../components/require-auth";
import { archiveProject, listProjects, ApiError } from "../../lib/api-client";

interface Project {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
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

  async function handleArchive() {
    setArchiving(true);
    try {
      await onArchive(project.id);
      setShowConfirm(false);
    } catch {
      setArchiving(false);
    }
  }

  const isArchived = !!project.archived_at;

  return (
    <>
      <div className="flex items-center justify-between rounded border border-black/20 p-4 dark:border-white/20">
        <div className="flex-1">
          <h3 className="font-medium">{project.name}</h3>
          {project.description && (
            <p className="mt-1 text-sm opacity-70">{project.description}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            {isArchived ? (
              <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                Đã lưu trữ
              </span>
            ) : (
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Hoạt động
              </span>
            )}
            {project.genre && (
              <span className="rounded bg-[#1D4ED8]/10 px-2 py-0.5 text-xs text-[#1D4ED8] dark:bg-[#1D4ED8]/20">
                {project.genre}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 ml-4">
          <Link
            href={`/projects/${project.id}/edit`}
            className="rounded border border-[#1D4ED8] px-3 py-1.5 text-sm text-[#1D4ED8] hover:bg-[#1D4ED8]/10"
          >
            {isArchived ? "Xem" : "Chỉnh sửa"}
          </Link>
          {!isArchived && (
            <button
              onClick={() => setShowConfirm(true)}
              className="rounded border border-red-400 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:border-red-400/50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              Lưu trữ
            </button>
          )}
          <Link
            href={`/projects/${project.id}/settings`}
            className="rounded border border-black/20 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
          >
            Cài đặt
          </Link>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
            <h3 className="mb-2 text-lg font-semibold">Xác nhận lưu trữ</h3>
            <p className="mb-6 text-sm opacity-70">
              Bạn có chắc muốn lưu trữ dự án &quot;{project.name}&quot;? Dự án sẽ
              chuyển sang phần đã lưu trữ.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={archiving}
                className="rounded border border-black/20 px-4 py-2 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
              >
                Huỷ
              </button>
              <button
                onClick={() => void handleArchive()}
                disabled={archiving}
                className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {archiving ? "Đang xử lý..." : "Xác nhận lưu trữ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchProjects(silent = false) {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = (await listProjects()) as Project[];
      setProjects(data);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof TypeError && /fetch/i.test(err.message)) {
        setError("Không thể kết nối tới máy chủ. Vui lòng kiểm tra backend đang chạy và thử lại.");
      } else {
        setError("Có lỗi xảy ra");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchProjects();
  }, []);

  const activeProjects = projects.filter((p) => !p.archived_at);
  const archivedProjects = projects.filter((p) => p.archived_at);

  async function handleArchive(id: string) {
    await archiveProject(id);
    // Update local state — no full reload
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, archived_at: new Date().toISOString() } : p,
      ),
    );
  }

  return (
    <RequireAuth>
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dự án của tôi</h1>
          <Link
            href="/projects/new"
            className="rounded bg-[#1D4ED8] px-4 py-2 text-white hover:bg-[#1E40AF]"
          >
            Tạo dự án mới
          </Link>
        </div>

        {loading && (
          <p className="text-center opacity-70">Đang tải danh sách dự án...</p>
        )}

        {error && (
          <div className="rounded border border-red-600 bg-red-50 p-4 text-red-600 dark:bg-red-950">
            <p>{error}</p>
            <button
              onClick={() => void fetchProjects()}
              className="mt-2 rounded border border-red-600 px-3 py-1 text-sm hover:bg-red-600 hover:text-white"
            >
              Thử lại
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {activeProjects.length > 0 && (
              <section className="mb-10">
                <h2 className="mb-4 text-lg font-semibold opacity-70">
                  Dự án đang hoạt động
                </h2>
                <div className="flex flex-col gap-4">
                  {activeProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onArchive={handleArchive}
                    />
                  ))}
                </div>
              </section>
            )}

            {activeProjects.length === 0 && (
              <p className="mb-10 text-center opacity-70">
                Chưa có dự án nào. Tạo dự án đầu tiên của bạn!
              </p>
            )}

            {archivedProjects.length > 0 && (
              <section>
                <h2 className="mb-4 text-lg font-semibold opacity-70">
                  Dự án đã lưu trữ
                </h2>
                <div className="flex flex-col gap-4">
                  {archivedProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onArchive={handleArchive}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </RequireAuth>
  );
}
