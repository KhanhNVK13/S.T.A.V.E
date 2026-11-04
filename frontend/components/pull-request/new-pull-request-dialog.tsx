"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog, DialogActions, DialogError } from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Field, INPUT_CLASS } from "../ui/form";
import {
  ApiError,
  createPullRequest,
  getPullRequestTargetBranches,
  listProjectBranches,
  previewPullRequest,
} from "../../lib/api-client";
import type { Branch, PullRequestPreview } from "../../lib/api-client";
import { apiErrorMessage } from "../../lib/error-message";
import { useI18n } from "../../context/i18n-context";
import { tNow } from "../../lib/i18n";

const TITLE_MAX = 150;
const DESCRIPTION_MAX = 2000;

export function NewPullRequestDialog({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: (pullRequestId: string) => void;
}) {
  const { t } = useI18n();
  const [sourceBranches, setSourceBranches] = useState<Branch[]>([]);
  const [targetBranches, setTargetBranches] = useState<{ id: string; name: string; is_default: boolean }[]>([]);
  const [targetProjectName, setTargetProjectName] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [preview, setPreview] = useState<PullRequestPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [source, target] = await Promise.all([
          listProjectBranches(projectId),
          getPullRequestTargetBranches(projectId),
        ]);
        if (cancelled) return;
        setSourceBranches(source);
        setTargetBranches(target.branches);
        setTargetProjectName(target.targetProjectName);
        setSourceId((source.find((b) => b.is_active) ?? source.find((b) => b.is_default) ?? source[0])?.id ?? "");
        setTargetId((target.branches.find((b) => b.is_default) ?? target.branches[0])?.id ?? "");
      } catch (err) {
        if (!cancelled) setLoadError(apiErrorMessage(err, tNow("pr.dlgBranchesFail")));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!sourceId || !targetId) return;
    let cancelled = false;
    void (async () => {
      setPreviewing(true);
      setPreview(null);
      setPreviewError(null);
      try {
        const result = await previewPullRequest(projectId, sourceId, targetId);
        if (!cancelled) setPreview(result);
      } catch (err) {
        if (!cancelled) setPreviewError(apiErrorMessage(err, tNow("pr.dlgCompareFail")));
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, sourceId, targetId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setDuplicateId(null);

    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setTitleError(t("pr.dlgTitleRequired"));
      return;
    }
    if (trimmed.length > TITLE_MAX) {
      setTitleError(t("pr.dlgTitleMax", { max: TITLE_MAX }));
      return;
    }
    setTitleError(null);

    setSubmitting(true);
    try {
      const created = await createPullRequest(projectId, {
        sourceBranchId: sourceId,
        targetBranchId: targetId,
        title: trimmed,
        description: description.trim(),
      });
      onCreated(created.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { pullRequestId?: string } | undefined;
        if (body?.pullRequestId) setDuplicateId(body.pullRequestId);
      }
      setSubmitError(apiErrorMessage(err, t("pr.dlgCreateFail")));
      setSubmitting(false);
    }
  }

  const canSubmit = !!preview && !submitting && !previewing;

  return (
    <Dialog title={t("pr.new")} onClose={onClose} closeDisabled={submitting} className="max-w-xl p-6">
      {loading ? (
        <p className="text-sm text-muted">{t("ui.loading")}</p>
      ) : loadError ? (
        <>
          <DialogError message={loadError} />
          <DialogActions>
            <Button variant="secondary" onClick={onClose}>
              {t("ui.close")}
            </Button>
          </DialogActions>
        </>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("pr.dlgSource")}>
              <select
                name="source-branch"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className={INPUT_CLASS}
              >
                {sourceBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("pr.dlgTarget", { name: targetProjectName })}>
              <select
                name="target-branch"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className={INPUT_CLASS}
              >
                {targetBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div aria-live="polite" className="rounded-card border border-border bg-surface-subtle px-3 py-2.5 text-xs">
            {previewing && <span className="text-muted">{t("pr.dlgComparing")}</span>}
            {previewError && <span className="text-danger">{previewError}</span>}
            {preview && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t("pr.dlgNewCommits", { n: preview.newCommitCount })}</span>
                <Badge variant="success">{t("pr.dlgNotes", { n: preview.notes.added })}</Badge>
                <Badge variant="danger">{t("pr.dlgNotesRemoved", { n: preview.notes.removed })}</Badge>
                <Badge variant="warning">{t("pr.dlgNotesModified", { n: preview.notes.modified })}</Badge>
                {preview.hasConflicts && <Badge variant="warning">{t("pr.dlgConflicts", { n: preview.conflictsCount })}</Badge>}
              </div>
            )}
          </div>

          <Field label={t("pr.dlgTitle")}>
            <input
              name="title"
              autoComplete="off"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={INPUT_CLASS}
              aria-invalid={titleError ? true : undefined}
              data-autofocus
            />
            {titleError && (
              <span role="alert" className="text-xs text-danger">
                {titleError}
              </span>
            )}
          </Field>

          <Field label={t("pr.dlgDescription")}>
            <textarea
              name="description"
              rows={4}
              maxLength={DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={INPUT_CLASS}
            />
            <span className="text-right font-mono text-xs text-muted">
              {description.length}/{DESCRIPTION_MAX}
            </span>
          </Field>

          <DialogError message={submitError} />
          {duplicateId && (
            <p className="-mt-2 text-xs">
              <Link href={`/pull-requests/${duplicateId}`} className="font-semibold text-accent hover:underline">
                {t("pr.dlgOpenExisting")}
              </Link>
            </p>
          )}

          <DialogActions>
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {t("ui.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? t("chist.creating") : t("pr.dlgCreate")}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
}
