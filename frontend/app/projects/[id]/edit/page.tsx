"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { RequireAuth } from "../../../../components/require-auth";
import {
  updateProject,
  getProject,
  ApiError,
} from "../../../../lib/api-client";

interface Project {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function EditProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [archivedAt, setArchivedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isArchived = !!archivedAt;

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const project = (await getProject(projectId)) as Project;
        setName(project.name);
        setDescription(project.description ?? "");
        setGenre(project.genre ?? "");
        setArchivedAt(project.archived_at);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isArchived) return;
    setError(null);
    setSubmitting(true);

    try {
      await updateProject(projectId, {
        name: name || undefined,
        description,
        genre,
      });
      router.push("/projects");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
      setSubmitting(false);
    }
  }

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
          <h1 className="text-2xl font-bold">
            {isArchived ? "Xem dự án đã lưu trữ" : "Chỉnh sửa dự án"}
          </h1>
        </div>

        {loading && (
          <p className="text-center opacity-70">Đang tải thông tin dự án...</p>
        )}

        {error && !loading && !submitting && (
          <p className="mb-4 rounded border border-red-600 bg-red-50 p-4 text-red-600 dark:bg-red-950">
            {error}
          </p>
        )}

        {!loading && isArchived && (
          <p className="mb-6 rounded border border-amber-400 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-400/50 dark:bg-amber-900/20 dark:text-amber-400">
            Dự án này đã được lưu trữ nên chỉ xem được, không chỉnh sửa được.
            Khôi phục dự án từ trang danh sách để chỉnh sửa lại.
          </p>
        )}

        {!loading && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <fieldset disabled={isArchived} className="contents">
              <label className="flex flex-col gap-2">
                <span className="font-medium">
                  Tên dự án <span className="text-red-600">*</span>
                </span>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded border border-black/20 px-3 py-2 disabled:opacity-60 dark:border-white/20"
                  placeholder="Nhập tên dự án"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="font-medium">Mô tả</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-24 rounded border border-black/20 px-3 py-2 disabled:opacity-60 dark:border-white/20"
                  placeholder="Mô tả ngắn về dự án của bạn"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="font-medium">Thể loại</span>
                <input
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="rounded border border-black/20 px-3 py-2 disabled:opacity-60 dark:border-white/20"
                  placeholder="Ví dụ: Khoa học viễn tưởng, Giả tưởng,..."
                />
              </label>
            </fieldset>

            {error && submitting && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-3">
              {!isArchived && (
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-[#1D4ED8] px-4 py-2 text-white hover:bg-[#1E40AF] disabled:opacity-50"
                >
                  {submitting ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              )}
              <Link
                href="/projects"
                className="rounded border border-black/20 px-4 py-2 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
              >
                {isArchived ? "Quay lại" : "Huỷ"}
              </Link>
            </div>
          </form>
        )}
      </div>
    </RequireAuth>
  );
}
