"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { RequireAuth } from "../../../../components/require-auth";
import { getStoredSessionId, archiveProject, deleteProject, ApiError } from "../../../../lib/api-client";
import { supabase } from "../../../../lib/supabase-browser";

interface Project {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function ProjectSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProject() {
      setLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token ?? "";
        const sessionId = getStoredSessionId() ?? "";

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
        if (sessionId) headers["X-Session-Id"] = sessionId;

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}`,
          { headers }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            message?: string;
          };
          throw new Error(
            Array.isArray(body.message)
              ? body.message.join(", ")
              : body.message ?? `Request failed (${res.status})`
          );
        }
        const data = (await res.json()) as Project;
        setProject(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      } finally {
        setLoading(false);
      }
    }

    void fetchProject();
  }, [projectId]);

  async function handleArchive() {
    setError(null);
    setArchiving(true);
    try {
      await archiveProject(projectId);
      router.push("/projects");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
      setArchiving(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      await deleteProject(projectId);
      router.push("/projects");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
      setDeleting(false);
    }
  }

  const canDelete = deleteConfirmName === project?.name;

  return (
    <RequireAuth>
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8">
          <Link
            href="/projects"
            className="mb-4 inline-block text-sm opacity-70 hover:underline"
          >
            &larr; Quay lại danh sách dự án
          </Link>
          <h1 className="text-2xl font-bold">Cài đặt dự án</h1>
          {project && (
            <p className="mt-1 text-sm opacity-70">{project.name}</p>
          )}
        </div>

        {loading && (
          <p className="text-center opacity-70">Đang tải thông tin dự án...</p>
        )}

        {error && !loading && (
          <p className="mb-4 rounded border border-red-600 bg-red-50 p-4 text-red-600 dark:bg-red-950">
            {error}
          </p>
        )}

        {!loading && project && (
          <>
            <section className="mb-8">
              <h2 className="mb-4 text-lg font-semibold">Thông tin dự án</h2>
              <div className="rounded border border-black/20 p-4 dark:border-white/20">
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <dt className="opacity-70">Tên:</dt>
                  <dd className="col-span-2 font-medium">{project.name}</dd>
                  <dt className="opacity-70">Mô tả:</dt>
                  <dd className="col-span-2">
                    {project.description || "Không có mô tả"}
                  </dd>
                  <dt className="opacity-70">Thể loại:</dt>
                  <dd className="col-span-2">
                    {project.genre || "Không có thể loại"}
                  </dd>
                  <dt className="opacity-70">Trạng thái:</dt>
                  <dd className="col-span-2">
                    {project.archived_at ? (
                      <span className="text-orange-600">Đã lưu trữ</span>
                    ) : (
                      <span className="text-green-600">Đang hoạt động</span>
                    )}
                  </dd>
                  <dt className="opacity-70">Ngày tạo:</dt>
                  <dd className="col-span-2">
                    {new Date(project.created_at).toLocaleDateString("vi-VN")}
                  </dd>
                </dl>
              </div>
            </section>

            <section className="rounded border border-red-600/50 p-6">
              <h2 className="mb-2 text-lg font-semibold text-red-600">
                Vùng nguy hiểm
              </h2>
              <p className="mb-4 text-sm opacity-70">
                Lưu trữ dự án sẽ ẩn dự án khỏi danh sách chính. Bạn vẫn có thể
                xem và khôi phục dự án từ phần dự án đã lưu trữ.
              </p>
              <button
                onClick={() => setShowArchiveConfirm(true)}
                disabled={!!project.archived_at}
                className="rounded border border-red-600 px-4 py-2 text-red-600 hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-red-600"
              >
                {project.archived_at ? "Đã lưu trữ" : "Lưu trữ dự án"}
              </button>
              <button
                onClick={() => {
                  setDeleteConfirmName("");
                  setShowDeleteConfirm(true);
                }}
                className="rounded border border-red-600 px-4 py-2 text-red-600 hover:bg-red-600 hover:text-white"
              >
                Xóa dự án
              </button>
            </section>
          </>
        )}
      </div>

      {showArchiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
            <h3 className="mb-4 text-lg font-semibold">
              Xác nhận lưu trữ dự án
            </h3>
            <p className="mb-6 text-sm opacity-70">
              Bạn có chắc chắn muốn lưu trữ dự án &quot;{project?.name}&quot;?
              Dự án sẽ được chuyển sang phần dự án đã lưu trữ và không còn xuất
              hiện trong danh sách chính.
            </p>
            {error && (
              <p className="mb-4 text-sm text-red-600">{error}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowArchiveConfirm(false);
                  setError(null);
                }}
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

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
            <h3 className="mb-4 text-lg font-semibold text-red-600">
              Xóa dự án vĩnh viễn
            </h3>
            <p className="mb-4 text-sm opacity-70">
              Hành động này không thể hoàn tác. Tất cả dữ liệu bao gồm lịch sử
              phiên bản, các bản nháp và thành viên của dự án &quot;{project?.name}&quot; sẽ
              bị xóa vĩnh viễn.
            </p>
            <label className="mb-4 flex flex-col gap-2 text-sm">
              <span className="font-medium">
                Để xác nhận, hãy nhập tên dự án:{" "}
                <span className="font-semibold">{project?.name}</span>
              </span>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={project?.name ?? ""}
                className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
              />
            </label>
            {error && (
              <p className="mb-4 text-sm text-red-600">{error}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmName("");
                  setError(null);
                }}
                disabled={deleting}
                className="rounded border border-black/20 px-4 py-2 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
              >
                Huỷ
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={!canDelete || deleting}
                className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Đang xóa..." : "Xóa vĩnh viễn"}
              </button>
            </div>
          </div>
        </div>
      )}
    </RequireAuth>
  );
}
