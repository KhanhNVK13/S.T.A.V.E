"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, TriangleAlert } from "lucide-react";
import { RequireAuth } from "../../../../components/require-auth";
import {
  updateProject,
  getProject,
  ApiError,
} from "../../../../lib/api-client";
import { PageHeader } from "../../../../components/ui/page-header";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Field, INPUT_CLASS } from "../../../../components/ui/form";

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
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link
          href="/projects"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-accent-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Quay lại danh sách dự án
        </Link>
        <PageHeader title={isArchived ? "Xem dự án đã lưu trữ" : "Chỉnh sửa dự án"} />

        {loading && <p className="text-center text-sm text-slate-500">Đang tải thông tin dự án...</p>}

        {error && !loading && !submitting && (
          <div className="mb-4 rounded-card border border-danger-600/20 bg-danger-50 p-4 text-sm text-danger-600">
            {error}
          </div>
        )}

        {!loading && isArchived && (
          <div className="mb-6 flex items-start gap-3 rounded-card border border-warning-600/30 bg-warning-50 p-4 text-sm text-warning-700">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Dự án này đã được lưu trữ nên chỉ xem được, không chỉnh sửa được. Khôi phục dự
              án từ trang danh sách để chỉnh sửa lại.
            </p>
          </div>
        )}

        {!loading && (
          <Card className={`relative p-6 ${isArchived ? "bg-slate-50" : ""}`}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <fieldset disabled={isArchived} className="contents">
                <Field label="Tên dự án *">
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="Nhập tên dự án"
                  />
                </Field>

                <Field label="Mô tả">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className={INPUT_CLASS}
                    placeholder="Mô tả ngắn về dự án của bạn"
                  />
                </Field>

                <Field label="Thể loại">
                  <input
                    type="text"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="Ví dụ: Lo-Fi, Jazz,..."
                  />
                </Field>
              </fieldset>

              {error && submitting && <p className="text-sm text-danger-600">{error}</p>}

              <div className="flex gap-3">
                {!isArchived && (
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Đang lưu..." : "Lưu thay đổi"}
                  </Button>
                )}
                <Link href="/projects">
                  <Button type="button" variant="secondary">
                    {isArchived ? "Quay lại" : "Huỷ"}
                  </Button>
                </Link>
              </div>
            </form>

            {isArchived && (
              <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-medium text-warning-700 shadow-card">
                <TriangleAlert className="h-3.5 w-3.5" /> Chỉ xem
              </div>
            )}
          </Card>
        )}
      </div>
    </RequireAuth>
  );
}
