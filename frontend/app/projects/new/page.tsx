"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RequireAuth } from "../../../components/require-auth";
import { createProject, ApiError } from "../../../lib/api-client";
import { PageHeader } from "../../../components/ui/page-header";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Field, INPUT_CLASS } from "../../../components/ui/form";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      await createProject({
        name: name.trim(),
        description: description.trim() || null,
        genre: genre.trim() || null,
      });
      router.push("/projects");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Một dự án với tên này đã tồn tại trong tài khoản của bạn.");
      } else {
        setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      }
    } finally {
      // Only re-enable on error; on success we navigate away anyway
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
        <PageHeader title="Tạo dự án mới" />

        {error && (
          <div className="mb-4 rounded-card border border-danger-600/20 bg-danger-50 p-4 text-sm text-danger-600">
            {error}
          </div>
        )}

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <Field label="Tên dự án *">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className={INPUT_CLASS}
                placeholder="Nhập tên dự án"
              />
            </Field>

            <Field label="Mô tả">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
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
                maxLength={60}
                className={INPUT_CLASS}
                placeholder="Ví dụ: Pop, Rock, Jazz"
              />
            </Field>

            <div className="flex gap-3">
              <Button type="submit" disabled={submitting || !name.trim()}>
                {submitting ? "Đang tạo..." : "Tạo dự án"}
              </Button>
              <Link href="/projects">
                <Button type="button" variant="secondary">
                  Huỷ
                </Button>
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </RequireAuth>
  );
}
