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
import { MidiEditor } from "../../../../components/midi-editor/midi-editor";

interface Project {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

type Tab = "info" | "editor";

export default function EditProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [activeTab, setActiveTab] = useState<Tab>("editor");

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
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <Link
            href="/projects"
            className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-accent-600 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Quay lại danh sách dự án
          </Link>
          <div className="flex items-center justify-between">
            <PageHeader
              title={loading ? "Đang tải..." : name || "Dự án"}
              description={loading ? "" : isArchived ? "Dự án đã lưu trữ" : "Trình soạn nhạc"}
            />
            {/* Tab buttons */}
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              <button
                onClick={() => setActiveTab("editor")}
                disabled={loading}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === "editor"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Trình soạn nhạc
              </button>
              <button
                onClick={() => setActiveTab("info")}
                disabled={loading}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === "info"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Thông tin
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "editor" ? (
            <div className="h-full">
              {!loading && isArchived && (
                <div className="flex h-full items-center justify-center px-4">
                  <div className="flex max-w-md flex-col items-center gap-3 rounded-card border border-warning-600/30 bg-warning-50 p-6 text-center text-sm text-warning-700">
                    <Lock className="h-5 w-5" />
                    <p>
                      Dự án này đã được lưu trữ nên trình soạn nhạc chỉ ở chế độ chỉ xem thông
                      tin. Khôi phục dự án từ trang danh sách để chỉnh sửa lại.
                    </p>
                  </div>
                </div>
              )}
              {!loading && !isArchived && (
                <MidiEditor projectId={projectId} projectName={name} />
              )}
              {loading && (
                <div className="flex h-full items-center justify-center">
                  <p className="text-slate-500">Đang tải dự án...</p>
                </div>
              )}
              {error && !loading && (
                <div className="flex h-full items-center justify-center">
                  <div className="rounded-card border border-danger-600/20 bg-danger-50 p-4 text-sm text-danger-600">
                    {error}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-2xl px-4 py-10">
              {isArchived && (
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

                    {error && submitting && (
                      <p className="text-sm text-danger-600">{error}</p>
                    )}

                    <div className="flex gap-3">
                      {!isArchived && (
                        <Button type="submit" disabled={submitting}>
                          {submitting ? "Đang lưu..." : "Lưu thay đổi"}
                        </Button>
                      )}
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
          )}
        </div>
      </div>
    </RequireAuth>
  );
}
