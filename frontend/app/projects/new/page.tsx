"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RequireAuth } from "../../../components/require-auth";
import { createProject, ApiError } from "../../../lib/api-client";

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
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8">
          <Link
            href="/projects"
            className="mb-4 inline-block text-sm opacity-70 hover:underline"
          >
            &larr; Quay lại danh sách dự án
          </Link>
          <h1 className="text-2xl font-bold">Tạo dự án mới</h1>
        </div>

        {error && (
          <p className="mb-4 rounded border border-red-600 bg-red-50 p-4 text-red-600 dark:bg-red-950">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <label className="flex flex-col gap-2">
            <span className="font-medium">
              Tên dự án <span className="text-red-600">*</span>
            </span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
              placeholder="Nhập tên dự án"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="font-medium">Mô tả</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              className="min-h-24 rounded border border-black/20 px-3 py-2 dark:border-white/20"
              placeholder="Mô tả ngắn về dự án của bạn"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="font-medium">Thể loại</span>
            <input
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              maxLength={60}
              className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
              placeholder="Ví dụ: Pop, Rock, Jazz"
            />
          </label>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="rounded bg-[#1D4ED8] px-4 py-2 text-white hover:bg-[#1E40AF] disabled:opacity-50"
            >
              {submitting ? "Đang tạo..." : "Tạo dự án"}
            </button>
            <Link
              href="/projects"
              className="rounded border border-black/20 px-4 py-2 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
            >
              Huỷ
            </Link>
          </div>
        </form>
      </div>
    </RequireAuth>
  );
}
