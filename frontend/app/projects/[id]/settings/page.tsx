"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Globe2, Archive, Undo2, Trash2, TriangleAlert } from "lucide-react";
import { RequireAuth } from "../../../../components/require-auth";
import {
  archiveProject,
  unarchiveProject,
  deleteProject,
  getProject,
  getProjectDeletePreview,
  setProjectVisibility,
  updateProject,
  ProjectVisibility,
  type ProjectDeletePreview,
} from "../../../../lib/api-client";
import { PageHeader } from "../../../../components/ui/page-header";
import { Card } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Field, INPUT_CLASS } from "../../../../components/ui/form";
import { Dialog, DialogActions, DialogError } from "../../../../components/ui/dialog";
import { ConfirmDialog } from "../../../../components/ui/confirm-dialog";
import { apiErrorMessage } from "../../../../lib/error-message";
import { useI18n } from "../../../../context/i18n-context";
import {validateRequired, validateMaxLength, focusFirstInvalid } from "../../../../lib/validation";
import { SkyLoading } from "../../../../components/project/sky-state";

const NAME_MAX = 100;

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

function ProjectInfoCard({
  project,
  onSaved,
}: {
  project: Project;
  onSaved: (updated: Pick<Project, "name" | "description" | "genre">) => void;
}) {
  const { t, locale } = useI18n();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [genre, setGenre] = useState(project.genre ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const isArchived = !!project.archived_at;
  const dirty =
    name.trim() !== project.name ||
    description !== (project.description ?? "") ||
    genre !== (project.genre ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isArchived) return;
    const form = e.currentTarget;
    const invalid =
      validateRequired(name, t("new.nameRequired")) ?? validateMaxLength(name, NAME_MAX, t("new.nameLabel"));
    setNameError(invalid);
    if (invalid) {
      focusFirstInvalid(form);
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await updateProject(project.id, { name: name.trim(), description, genre });
      onSaved({ name: name.trim(), description: description || null, genre: genre || null });
      setSaved(true);
    } catch (err) {
      setSaveError(apiErrorMessage(err, t("pset.saveFail")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-base font-semibold text-foreground">{t("pset.infoTitle")}</h2>
      {isArchived && (
        <p className="mb-4 flex items-start gap-2 text-sm text-muted">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          {t("pset.archivedNote")}
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field label={t("new.nameField")} error={nameError}>
          <input
            name="name"
            autoComplete="off"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
              setSaved(false);
            }}
            disabled={isArchived}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label={t("new.description")}>
          <textarea
            name="description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setSaved(false);
            }}
            rows={4}
            maxLength={2000}
            disabled={isArchived}
            className={INPUT_CLASS}
            placeholder={t("new.descriptionPlaceholder")}
          />
        </Field>
        <Field label={t("new.genre")}>
          <input
            name="genre"
            autoComplete="off"
            type="text"
            maxLength={60}
            value={genre}
            onChange={(e) => {
              setGenre(e.target.value);
              setSaved(false);
            }}
            disabled={isArchived}
            className={INPUT_CLASS}
            placeholder={t("pset.genrePlaceholder")}
          />
        </Field>
        <dl className="grid grid-cols-3 gap-y-2 text-sm">
          <dt className="text-muted">{t("pset.status")}</dt>
          <dd className="col-span-2">
            {isArchived ? (
              <Badge variant="warning">{t("project.archived")}</Badge>
            ) : (
              <Badge variant="success">{t("pset.statusActive")}</Badge>
            )}
          </dd>
          <dt className="text-muted">{t("pset.createdOn")}</dt>
          <dd className="col-span-2 font-mono text-xs text-foreground">
            {new Date(project.created_at).toLocaleDateString(locale)}
          </dd>
        </dl>
        {saveError && (
          <p role="alert" className="text-sm text-danger">
            {saveError}
          </p>
        )}
        {!isArchived && (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving || !dirty}>
              {saving ? t("pset.saving") : t("pset.save")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={saving || !dirty}
              onClick={() => {
                setName(project.name);
                setDescription(project.description ?? "");
                setGenre(project.genre ?? "");
                setNameError(null);
                setSaveError(null);
              }}
            >
              {t("pset.discard")}
            </Button>
            {saved && (
              <span role="status" className="text-sm text-success-foreground">
                {t("pset.saved")}
              </span>
            )}
          </div>
        )}
      </form>
    </Card>
  );
}

export default function ProjectSettingsPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showUnarchiveConfirm, setShowUnarchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [unarchiving, setUnarchiving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [visibilitySuccess, setVisibilitySuccess] = useState<string | null>(null);
  const [settingVisibility, setSettingVisibility] = useState(false);
  const [pendingVisibility, setPendingVisibility] = useState<ProjectVisibility | null>(null);
  const [deletePreview, setDeletePreview] = useState<ProjectDeletePreview | "error" | null>(null);
  const [archiveNotice, setArchiveNotice] = useState<"archived" | "restored" | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = (await getProject(projectId)) as Project;
        setProject(data);
      } catch (err) {
        setError(apiErrorMessage(err, t("pset.loadFail")));
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, loadAttempt]);

  async function handleArchive() {
    setError(null);
    setArchiving(true);
    try {
      await archiveProject(projectId);
      setProject((await getProject(projectId)) as Project);
      setShowArchiveConfirm(false);
      setShowDeleteConfirm(false);
      setArchiveNotice("archived");
    } catch (err) {
      setError(apiErrorMessage(err, t("pset.archiveFail")));
    } finally {
      setArchiving(false);
    }
  }

  async function handleUnarchive() {
    setError(null);
    setUnarchiving(true);
    try {
      await unarchiveProject(projectId);
      setProject((await getProject(projectId)) as Project);
      setShowUnarchiveConfirm(false);
      setArchiveNotice("restored");
    } catch (err) {
      setError(apiErrorMessage(err, t("pset.restoreFail")));
    } finally {
      setUnarchiving(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      await deleteProject(projectId);
      router.push("/projects");
    } catch (err) {
      setError(apiErrorMessage(err, t("pset.deleteFail")));
      setDeleting(false);
    }
  }

  async function openDeleteDialog() {
    setDeleteConfirmName("");
    setDeletePreview(null);
    setShowDeleteConfirm(true);
    try {
      setDeletePreview(await getProjectDeletePreview(projectId));
    } catch {
      setDeletePreview("error");
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/projects/${projectId}`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      setError(t("pset.copyFail"));
    }
  }

  async function handleSetVisibility(visibility: ProjectVisibility) {
    setError(null);
    setVisibilitySuccess(null);
    setSettingVisibility(true);
    try {
      const updated = await setProjectVisibility(projectId, visibility);
      setProject((prev) => (prev ? { ...prev, visibility: updated.visibility } : prev));
      const msg =
        visibility === 'public'
          ? t("pset.madePublic")
          : t("pset.madePrivate");
      setVisibilitySuccess(msg);
      // Auto-dismiss success banner after 4 seconds
      setTimeout(() => setVisibilitySuccess(null), 4000);
    } catch (err) {
      setError(apiErrorMessage(err, t("pset.visibilityFail")));
    } finally {
      setSettingVisibility(false);
      setPendingVisibility(null);
    }
  }

  const canDelete = deleteConfirmName === project?.name;

  return (
    <RequireAuth>
      <div className="mx-auto max-w-3xl px-5 py-8">
        <Link
          href="/projects"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-accent hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t("new.back")}
        </Link>
        <PageHeader
          title={t("pset.title")}
          description={project?.name}
          breadcrumbs={[{ label: t("nav.projects"), href: "/projects" }, { label: t("pset.crumbProject"), href: `/projects/${projectId}` }]}
        />

        {loading && <SkyLoading label={t("pset.loading")} />}

        {error && !loading && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger/20 bg-danger-muted p-4 text-sm text-danger"
          >
            <span>{error}</span>
            {!project && (
              <Button
                variant="secondary"
                onClick={() => {
                  setError(null);
                  setLoadAttempt((n) => n + 1);
                }}
              >
                {t("ui.retry")}
              </Button>
            )}
          </div>
        )}

        {archiveNotice && project && (
          <div
            role="status"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-success/20 bg-success-muted p-4 text-sm text-success-foreground"
          >
            <span>
              {archiveNotice === "archived"
                ? t("pset.archivedNotice")
                : t("pset.restoredNotice")}
            </span>
            {archiveNotice === "archived" && (
              <Button
                variant="secondary"
                onClick={() => void handleUnarchive()}
                disabled={unarchiving}
              >
                {unarchiving ? t("pset.undoing") : t("pset.undo")}
              </Button>
            )}
          </div>
        )}

        {!loading && project && (
          <div className="flex flex-col gap-6">
            <ProjectInfoCard
              project={project}
              onSaved={(updated) => setProject((prev) => (prev ? { ...prev, ...updated } : prev))}
            />

            <Card className="p-6">
              <h2 className="mb-1 text-base font-semibold text-foreground">{t("pset.visibilityTitle")}</h2>
              <p className="mb-4 text-sm text-muted">{t("pset.visibilityLead")}</p>

              {visibilitySuccess && (
                <div className="mb-4 rounded-card border border-success/20 bg-success-muted p-3 text-sm text-success-foreground">
                  {visibilitySuccess}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-card border border-border p-4 hover:bg-surface-subtle">
                  <input
                    type="radio"
                    name="visibility"
                    value="private"
                    checked={project.visibility === "private"}
                    onChange={() => setPendingVisibility("private")}
                    disabled={settingVisibility}
                    className="mt-1 accent-accent"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-muted" />
                      <span className="font-medium text-foreground">{t("common.private")}</span>
                      {project.visibility === "private" && <Badge variant="neutral">{t("pset.current")}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {t("pset.privateDesc")}
                    </p>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-card border border-border p-4 hover:bg-surface-subtle">
                  <input
                    type="radio"
                    name="visibility"
                    value="public"
                    checked={project.visibility === "public"}
                    onChange={() => setPendingVisibility("public")}
                    disabled={settingVisibility}
                    className="mt-1 accent-accent"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Globe2 className="h-4 w-4 text-muted" />
                      <span className="font-medium text-foreground">{t("common.public")}</span>
                      {project.visibility === "public" && <Badge variant="info">{t("pset.current")}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {t("pset.publicDesc")}
                    </p>
                  </div>
                </label>
              </div>

              {settingVisibility && <p className="mt-3 text-sm text-muted">{t("pset.updating")}</p>}

              {project.visibility === "public" && (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface-subtle p-3">
                  <span className="text-xs text-muted">{t("pset.shareLink")}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                    {typeof window !== "undefined" ? window.location.origin : ""}/projects/{project.id}
                  </span>
                  <Button variant="secondary" onClick={() => void copyShareLink()}>
                    {linkCopied ? t("pset.copied") : t("pset.copyLink")}
                  </Button>
                </div>
              )}
            </Card>

            <Card className="border-danger/20 p-6">
              <div className="mb-2 flex items-center gap-2">
                <TriangleAlert className="h-5 w-5 text-danger" />
                <h2 className="text-base font-semibold text-foreground">{t("pset.dangerTitle")}</h2>
              </div>
              <p className="mb-4 text-sm text-muted">
                {t("pset.dangerLead")}
              </p>
              <div className="flex flex-wrap gap-2">
                {project.archived_at ? (
                  <Button
                    variant="secondary"
                    onClick={() => setShowUnarchiveConfirm(true)}
                    disabled={unarchiving}
                    className="gap-1.5 border-warning text-warning-foreground hover:bg-warning-muted"
                  >
                    <Undo2 className="h-4 w-4" /> {unarchiving ? t("pset.restoring") : t("pset.restoreProject")}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => setShowArchiveConfirm(true)}
                    disabled={archiving}
                    className="gap-1.5 border-danger text-danger hover:bg-danger-muted"
                  >
                    <Archive className="h-4 w-4" /> {archiving ? t("pset.archiving") : t("pset.archiveProject")}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => void openDeleteDialog()}
                  className="gap-1.5 border-danger text-danger hover:bg-danger-muted"
                >
                  <Trash2 className="h-4 w-4" /> {t("pset.deleteProject")}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>

      <Dialog
        open={showUnarchiveConfirm}
        title={t("pset.restoreDialogTitle")}
        onClose={() => {
          setShowUnarchiveConfirm(false);
          setError(null);
        }}
        closeDisabled={unarchiving}
      >
        <p className="mb-6 text-sm text-muted">
          {t("pset.restoreDialogBody", { name: project?.name ?? "" })}
        </p>
        <DialogError message={error} />
        <DialogActions>
          <Button
            variant="secondary"
            onClick={() => {
              setShowUnarchiveConfirm(false);
              setError(null);
            }}
            disabled={unarchiving}
          >
            {t("ui.cancel")}

          </Button>
          <Button onClick={() => void handleUnarchive()} disabled={unarchiving}>
            {unarchiving ? t("pset.restoring") : t("pset.restoreConfirm")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showArchiveConfirm}
        title={t("pset.archiveDialogTitle")}
        onClose={() => {
          setShowArchiveConfirm(false);
          setError(null);
        }}
        closeDisabled={archiving}
        role="alertdialog"
      >
        <p className="mb-6 text-sm text-muted">
          {t("pset.archiveDialogBody", { name: project?.name ?? "" })}
        </p>
        <DialogError message={error} />
        <DialogActions>
          <Button
            variant="secondary"
            onClick={() => {
              setShowArchiveConfirm(false);
              setError(null);
            }}
            disabled={archiving}
          >
            {t("ui.cancel")}

          </Button>
          <Button variant="danger" onClick={() => void handleArchive()} disabled={archiving}>
            {archiving ? t("pset.processing") : t("pset.archiveConfirm")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showDeleteConfirm}
        title={t("pset.deleteDialogTitle")}
        titleClassName="text-danger"
        onClose={() => {
          setShowDeleteConfirm(false);
          setDeleteConfirmName("");
          setError(null);
        }}
        closeDisabled={deleting}
        role="alertdialog"
      >
        <p className="mb-3 text-sm text-muted">
          {t("pset.deleteDialogBody", { name: project?.name ?? "" })}
        </p>
        <p className="mb-4 rounded-card border border-border bg-surface-subtle px-3 py-2 text-sm text-foreground">
          {deletePreview === null
            ? t("pset.counting")
            : deletePreview === "error"
              ? t("pset.countFail")
              : t("pset.willLose", { commits: deletePreview.commitCount.toLocaleString(locale), branches: deletePreview.branchCount.toLocaleString(locale) })}
        </p>
        {!project?.archived_at && (
          <p className="mb-4 text-sm text-muted">
            {t("pset.notSure")}{" "}
            <button
              type="button"
              className="text-accent hover:underline"
              onClick={() => {
                setShowDeleteConfirm(false);
                setShowArchiveConfirm(true);
              }}
            >
              {t("pset.archiveInstead")}
            </button>{" "}
            {t("pset.keepHistory")}
          </p>
        )}
        <label className="mb-4 flex flex-col gap-2 text-sm">
          <span className="font-medium text-foreground">
            {t("pset.typeName")}{" "}
            <span className="font-semibold text-foreground">{project?.name}</span>
          </span>
          <input
            type="text"
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            placeholder={project?.name ?? ""}
            autoComplete="off"
            spellCheck={false}
            data-autofocus
            className={INPUT_CLASS}
          />
        </label>
        <DialogError message={error} />
        <DialogActions>
          <Button
            variant="secondary"
            onClick={() => {
              setShowDeleteConfirm(false);
              setDeleteConfirmName("");
              setError(null);
            }}
            disabled={deleting}
          >
            {t("ui.cancel")}

          </Button>
          <Button variant="danger" onClick={() => void handleDelete()} disabled={!canDelete || deleting}>
            {deleting ? t("pset.deleting") : t("pset.deleteForever")}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!pendingVisibility}
        title={
          pendingVisibility === "public" ? t("pset.makePublicTitle") : t("pset.makePrivateTitle")
        }
        message={
          pendingVisibility === "public"
            ? t("pset.makePublicBody")
            : t("pset.makePrivateBody")
        }
        confirmLabel={pendingVisibility === "public" ? t("pset.makePublicConfirm") : t("pset.makePrivateConfirm")}
        loading={settingVisibility}
        onConfirm={() => pendingVisibility && void handleSetVisibility(pendingVisibility)}
        onCancel={() => setPendingVisibility(null)}
      />
    </RequireAuth>
  );
}
