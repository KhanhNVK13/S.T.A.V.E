"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RequireAuth } from "../../../components/require-auth";
import { createProject } from "../../../lib/api-client";
import { PageHeader } from "../../../components/ui/page-header";
import { Card } from "../../../components/ui/card";
import { useT } from "../../../context/i18n-context";
import { Button } from "../../../components/ui/button";
import { Field, INPUT_CLASS } from "../../../components/ui/form";
import { errorSource, renderError, type ErrorSource } from "../../../lib/error-message";
import { setFlashToast } from "../../../lib/flash-toast";
import { DEFAULT_LICENSE, type ProjectLicense } from "../../../lib/license";
import { buildCreateProjectPayload, createdToastKey, type NewProjectVisibility } from "../../../lib/new-project";
import { NewProjectVisibilityField } from "../../../components/project/new-project-visibility";
import {validateRequired, validateMaxLength, focusFirstInvalid } from "../../../lib/validation";

const NAME_MAX = 100;

export default function NewProjectPage() {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [visibility, setVisibility] = useState<NewProjectVisibility>("private");
  const [license, setLicense] = useState<ProjectLicense>(DEFAULT_LICENSE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ErrorSource | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const form = e.currentTarget;
    const invalid =
      validateRequired(name, t("new.nameRequired")) ?? validateMaxLength(name, NAME_MAX, t("new.nameLabel"));
    setNameError(invalid);
    if (invalid) {
      focusFirstInvalid(form);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const created = (await createProject(
        buildCreateProjectPayload({ name, description, genre, visibility, license }),
      )) as { id?: string; visibilityKeptPrivate?: boolean } | null;
      setFlashToast(t(createdToastKey(created)));
      router.push(created?.id ? `/projects/${created.id}/edit` : "/projects");
    } catch (err) {
      setError(errorSource(err, "new.fail"));
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
          <ArrowLeft className="h-3.5 w-3.5" /> {t("new.back")}
        </Link>
        <PageHeader title={t("new.title")} breadcrumbs={[{ label: t("nav.projects"), href: "/projects" }]} />

        {error && (
          <div role="alert" className="mb-4 rounded-card border border-danger/20 bg-danger-muted p-4 text-sm text-danger">
            {renderError(error)}
          </div>
        )}

        <Card className="p-6">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
            <Field label={t("new.nameField")} error={nameError}>
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
                placeholder={t("new.namePlaceholder")}
              />
            </Field>

            <Field label={t("new.description")}>
              <textarea
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={4}
                className={INPUT_CLASS}
                placeholder={t("new.descriptionPlaceholder")}
              />
            </Field>

            <Field label={t("new.genre")}>
              <input
                name="genre"
                autoComplete="off"
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                maxLength={60}
                className={`${INPUT_CLASS} h-[37px]`}
                placeholder={t("new.genrePlaceholder")}
              />
            </Field>

            <NewProjectVisibilityField
              visibility={visibility}
              license={license}
              onVisibilityChange={setVisibility}
              onLicenseChange={setLicense}
              disabled={submitting}
            />

            <div className="flex gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? t("new.creating") : t("new.submit")}
              </Button>
              <Link href="/projects">
                <Button type="button" variant="secondary">
                  {t("ui.cancel")}
                </Button>
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </RequireAuth>
  );
}
