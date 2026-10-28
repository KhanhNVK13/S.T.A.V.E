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
import { apiErrorMessage } from "../../../lib/error-message";
import { setFlashToast } from "../../../lib/flash-toast";
import {validateRequired, validateMaxLength, focusFirstInvalid } from "../../../lib/validation";

const NAME_MAX = 100;
const NAME_REQUIRED = "Vui lòng nhập tên dự án.";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const form = e.currentTarget;
    const invalid =
      validateRequired(name, NAME_REQUIRED) ?? validateMaxLength(name, NAME_MAX, "Tên dự án");
    setNameError(invalid);
    if (invalid) {
      focusFirstInvalid(form);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const created = (await createProject({
        name: name.trim(),
        description: description.trim() || null,
        genre: genre.trim() || null,
      })) as { id?: string } | null;
      setFlashToast("Đã tạo dự án.");
      router.push(created?.id ? `/projects/${created.id}/edit` : "/projects");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Một dự án với tên này đã tồn tại trong tài khoản của bạn.");
      } else {
        setError(apiErrorMessage(err, "Không tạo được dự án."));
      }
    } finally {
      // Only re-enable on error; on success we navigate away anyway
      setSubmitting(false);
    }
  }

  return (
    <RequireAuth>
      <div className="mx-auto max-w-2xl px-5 py-8">
        <Link
          href="/projects"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-accent hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Quay lại danh sách dự án
        </Link>
        <PageHeader title="Tạo dự án mới" />

        {error && (
          <div className="mb-4 rounded-card border border-danger/20 bg-danger-muted p-4 text-sm text-danger">
            {error}
          </div>
        )}

        <Card className="p-6">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
            <Field label="Tên dự án *" error={nameError}>
              <input
                name="name"
                autoComplete="off"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(null);
                }}
                className={`${INPUT_CLASS} h-[37px]`}
                placeholder="Nhập tên dự án"
              />
            </Field>

            <Field label="Mô tả">
              <textarea
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={4}
                className={`${INPUT_CLASS} h-[37px]`}
                placeholder="Mô tả ngắn về dự án của bạn"
              />
            </Field>

            <Field label="Thể loại">
              <input
                name="genre"
                autoComplete="off"
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                maxLength={60}
                className={`${INPUT_CLASS} h-[37px]`}
                placeholder="Ví dụ: Pop, Rock, Jazz"
              />
            </Field>

            <div className="flex gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Đang tạo…" : "Tạo dự án"}
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
