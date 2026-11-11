"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, GitBranch, GitMerge, History, Plus, Trash2 } from "lucide-react";
import {
  compareCommits,
  createBranch,
  deleteBranch,
  getBranchDeletePreview,
  getBranchDetails,
  listProjectBranches,
  mergeBranches,
  resolveMergeConflicts,
} from "../../lib/api-client";
import type {
  Branch,
  BranchDeletePreview,
  BranchDivergence,
  BranchHistoryCommit,
  ConflictChoice,
  MergeConflictResult,
} from "../../lib/api-client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { MergeRiskPanel } from "./merge-risk-panel";
import { FieldError, INPUT_CLASS } from "../ui/form";
import { validateMaxLength, validateRequired } from "../../lib/validation";
import { createAndActivateBranch } from "../../lib/create-and-activate-branch";
import { RowList, RowHeader, RowItem, RowTime } from "../ui/row-list";
import { Toast } from "../ui/toast";
import { formatRelativeTime } from "../../lib/format-date";
import { MergeConflictDialog } from "./merge-conflict-dialog";
import { CommitGraph } from "./commit-graph";
import { fetchHistories } from "../../lib/project-graph";
import { SkyLoading } from "./sky-state";
import { apiErrorMessage, errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { formatAuthorName } from "../../lib/format-name";
import { useI18n } from "../../context/i18n-context";

/** Nhánh | so với mặc định | tác giả | tạo lúc | thao tác. */
const COLS = "md:grid-cols-[minmax(0,1fr)_150px_140px_96px_auto]";

/**
 * UC-47 (tạo nhánh) · UC-49 (xem độ lệch ahead/behind) · UC-51 + UC-86 (hợp
 * nhất, kèm xử lý xung đột) · UC-52 (xoá nhánh) ở cấp PROJECT.
 *
 * KHÔNG làm ở đây: UC-48 chuyển nhánh đang mở — thao tác đó phải gửi kèm bản
 * nháp hiện hành của editor (`SwitchBranchDto.snapshot`), nên nó thuộc về MIDI
 * Editor chứ không phải trang này.
 *
 * Backend chỉ cho chủ dự án gọi mọi endpoint branch/merge; trang cha chịu trách
 * nhiệm ẩn tab này với người khác.
 */
export function BranchList({ projectId, readOnly = false }: { projectId: string; readOnly?: boolean }) {
  const { t, tx } = useI18n();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [divergence, setDivergence] = useState<Record<string, BranchDivergence>>({});
  const [merged, setMerged] = useState<Record<string, boolean>>({});
  const [commitsById, setCommitsById] = useState<Map<string, BranchHistoryCommit>>(new Map());
  const [graphState, setGraphState] = useState<"loading" | "ready" | "error">("loading");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorSource | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const mergeSummaryForRef = useRef<string | null>(null);
  const [mergeSummary, setMergeSummary] = useState<
    "loading" | "unavailable" | { added: number; removed: number; modified: number } | null
  >(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [switchAfterCreate, setSwitchAfterCreate] = useState(true);
  const [createBusy, setCreateBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [deletePreview, setDeletePreview] = useState<BranchDeletePreview | null>(null);
  const [deletePreviewState, setDeletePreviewState] = useState<"loading" | "ready" | "error">("loading");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<ErrorSource | null>(null);
  const [resolveError, setResolveError] = useState<ErrorSource | null>(null);

  const [mergeSource, setMergeSource] = useState<Branch | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState<Branch | null>(null);
  const [mergeError, setMergeError] = useState<ErrorSource | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [conflicts, setConflicts] = useState<MergeConflictResult | null>(null);

  const defaultBranch = branches.find((b) => b.is_default) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listProjectBranches(projectId);
      setBranches(list);
      setError(null);

      // Độ lệch chỉ có ở endpoint chi tiết từng nhánh — gọi song song thay vì
      // tuần tự để danh sách vài nhánh không phải chờ cộng dồn.
      const details = await Promise.allSettled(
        list.filter((b) => !b.is_default).map((b) => getBranchDetails(b.id)),
      );
      const nextDivergence: Record<string, BranchDivergence> = {};
      const nextMerged: Record<string, boolean> = {};
      for (const d of details) {
        if (d.status === "fulfilled") {
          nextDivergence[d.value.branchInfo.id] = d.value.divergence;
          nextMerged[d.value.branchInfo.id] = d.value.isMerged;
        }
      }
      setDivergence(nextDivergence);
      setMerged(nextMerged);

      const { commits: byId, failed } = await fetchHistories(list);
      setCommitsById(byId);
      setGraphState(failed ? "error" : "ready");
    } catch (err) {
      setError(errorSource(err, "blist.loadFail"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải danh sách nhánh lần đầu; `load` cũng được gọi lại sau mỗi thao tác tạo/xoá/merge
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    const invalid =
      validateRequired(name, t("chist.branchNameRequired")) ??
      validateMaxLength(name, 50, t("chist.branchNameLabel"));
    setNameError(invalid);
    if (invalid) return;
    setCreateBusy(true);
    try {
      if (!switchAfterCreate) {
        await createBranch(projectId, { name });
        setNewName("");
        setCreating(false);
        setNotice(
          t("blist.created", { name }),
        );
        await load();
        return;
      }
      const outcome = await createAndActivateBranch(projectId, { name });
      setNewName("");
      setCreating(false);
      setNotice(
        outcome.switched
          ? t("blist.createdSwitched", { name })
          : t("blist.createdNoSwitch", { name, reason: apiErrorMessage(outcome.switchError, t("chist.unknownReason")) }),
      );
      await load();
    } catch (err) {
      setError(errorSource(err, "blist.createFail"));
    } finally {
      setCreateBusy(false);
    }
  }

  async function openDelete(branch: Branch) {
    setDeleteTarget(branch);
    setDeletePreview(null);
    setDeletePreviewState("loading");
    setDeleteError(null);
    try {
      setDeletePreview(await getBranchDeletePreview(branch.id));
      setDeletePreviewState("ready");
    } catch {
      setDeletePreviewState("error");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteBranch(deleteTarget.id);
      setNotice(t("blist.deleted", { name: deleteTarget.name }));
      setDeleteTarget(null);
      setDeletePreview(null);
      await load();
    } catch (err) {
      setDeleteError(errorSource(err, "blist.deleteFail"));
    } finally {
      setDeleteBusy(false);
    }
  }

  function openMergeConfirm(source: Branch) {
    setMergeError(null);
    setMergeConfirm(source);
    setMergeSummary(null);
    mergeSummaryForRef.current = source.id;
    const behind = divergence[source.id]?.behind;
    if (behind !== 0 || !defaultBranch?.head_commit_id || !source.head_commit_id) return;
    setMergeSummary("loading");
    compareCommits(defaultBranch.head_commit_id, source.head_commit_id)
      .then((diff) => {
        if (mergeSummaryForRef.current === source.id) setMergeSummary(diff.summary.notes);
      })
      .catch(() => {
        if (mergeSummaryForRef.current === source.id) setMergeSummary("unavailable");
      });
  }

  function showNothingToMerge(source: Branch) {
    setInfoNotice(
      t("blist.nothingToMerge", { target: defaultBranch?.name ?? "", source: source.name }),
    );
  }

  function showDefaultBranchRefusal() {
    setInfoNotice(
      t("blist.defaultRefusal"),
    );
  }

  async function handleMerge(source: Branch) {
    if (!defaultBranch) return;
    setMergeSource(source);
    setMergeBusy(true);
    setMergeError(null);
    try {
      const result = await mergeBranches({
        sourceBranchId: source.id,
        targetBranchId: defaultBranch.id,
      });
      setMergeConfirm(null);
      if (result.hasConflicts) {
        setConflicts(result);
      } else {
        setNotice(
          result.commit.branch_id === source.id
            ? t("blist.mergedFastForward", { source: source.name, target: defaultBranch.name })
            : t("blist.mergedDone", { source: source.name, target: defaultBranch.name }),
        );
        setMergeSource(null);
        await load();
      }
    } catch (err) {
      setMergeError(errorSource(err, "blist.mergeFail"));
      setMergeSource(null);
    } finally {
      setMergeBusy(false);
    }
  }

  async function handleResolve(resolutions: { noteId: string; choice: ConflictChoice }[]) {
    if (!mergeSource || !defaultBranch) return;
    setMergeBusy(true);
    setResolveError(null);
    try {
      await resolveMergeConflicts({
        sourceBranchId: mergeSource.id,
        targetBranchId: defaultBranch.id,
        resolutions,
      });
      setNotice(t("blist.mergedResolved", { source: mergeSource.name }));
      setConflicts(null);
      setMergeSource(null);
      await load();
    } catch (err) {
      setResolveError(errorSource(err, "blist.resolveFail"));
    } finally {
      setMergeBusy(false);
    }
  }

  if (loading && branches.length === 0) {
    return <SkyLoading label={t("blist.loading")} />;
  }

  return (
    <>
      {notice && <Toast message={notice} variant="success" onDismiss={() => setNotice(null)} />}
      {infoNotice && (
        <Toast message={infoNotice} variant="info" onDismiss={() => setInfoNotice(null)} />
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted">
          <p>
            {tx("blist.summary", { n: <span className="font-mono">{branches.length}</span>, name: <span className="font-mono text-foreground">{defaultBranch?.name ?? "—"}</span> })}
          </p>
          <p className="mt-1">
            {t("blist.explain")}
          </p>
        </div>
        {!creating && !readOnly && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> {t("blist.create")}
          </Button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          noValidate
          className="mb-3 flex flex-wrap items-end gap-2 rounded-card border border-border bg-surface p-4"
        >
          <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <span className="text-xs font-semibold">{t("blist.newName")}</span>
            <input
              name="branchName"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setNameError(null);
              }}
              placeholder={t("chist.newBranchPlaceholder")}
              aria-invalid={nameError ? true : undefined}
              className={`${INPUT_CLASS} h-[37px] font-mono`}
            />
            {nameError && <FieldError>{nameError}</FieldError>}
          </label>
          <p className="basis-full text-xs text-muted">
            {t("blist.startsFrom")}
          </p>
          <label className="flex basis-full items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              name="switchAfterCreate"
              checked={switchAfterCreate}
              onChange={(e) => setSwitchAfterCreate(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            {t("blist.switchAfter")}
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={createBusy}>
              {createBusy ? t("blist.creating") : t("blist.create")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCreating(false);
                setNewName("");
                setNameError(null);
              }}
            >
              {t("ui.cancel")}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-danger/20 bg-danger-muted px-4 py-3"
        >
          <p className="text-xs text-danger">{renderError(error)}</p>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            {t("ui.retry")}
          </Button>
        </div>
      )}

      <section aria-label={t("blist.graph")} className="mb-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{t("blist.graph")}</h3>
        {graphState === "loading" ? (
          <SkyLoading compact label={t("blist.drawing")} />
        ) : (
          <>
            {graphState === "error" && (
              <p role="alert" className="mb-2 rounded-card border border-danger/20 bg-danger-muted px-4 py-2 text-xs text-danger">
                {t("blist.graphPartial")}
              </p>
            )}
            <CommitGraph projectId={projectId} branches={branches} commits={commitsById} />
          </>
        )}
      </section>

      <RowList cols={COLS}>
        <RowHeader>
          <span>{t("blist.colBranch")}</span>
          <span>{t("blist.colVsDefault")}</span>
          <span>{t("blist.colCreator")}</span>
          <span className="text-right">{t("blist.colCreated")}</span>
          <span />
        </RowHeader>

        {branches.map((branch) => {
          const div = divergence[branch.id];
          const authorName = formatAuthorName(branch.author);
          const isOpen = expanded.has(branch.id);
          const base = branch.base_commit_id ? commitsById.get(branch.base_commit_id) : undefined;
          const head = branch.head_commit_id ? commitsById.get(branch.head_commit_id) : undefined;
          return (
            <Fragment key={branch.id}>
            <RowItem>
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={isOpen ? t("blist.collapse", { name: branch.name }) : t("blist.expand", { name: branch.name })}
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(branch.id)) next.delete(branch.id);
                      else next.add(branch.id);
                      return next;
                    })
                  }
                  className="rounded p-0.5 text-muted hover:bg-surface-muted hover:text-foreground"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <GitBranch className="h-4 w-4 shrink-0 text-muted" />
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate font-mono text-[13px] font-semibold">
                    {branch.name}
                  </span>
                  {branch.is_default && <Badge variant="info">{t("blist.default")}</Badge>}
                  {/* UC-48: nhánh editor đang mở. Cũng là nhánh DUY NHẤT
                      không xoá được (backend chặn) — hiện ra để người dùng
                      hiểu vì sao nút xoá bị khoá. */}
                  {branch.is_active && <Badge variant="neutral">{t("blist.open")}</Badge>}
                  {merged[branch.id] && <Badge variant="success">{t("blist.merged")}</Badge>}
                  {merged[branch.id] && !branch.is_active && (
                    <span className="text-xs text-muted">{t("blist.safeDelete")}</span>
                  )}
                </div>
              </div>

              <span className="font-mono text-xs text-muted">
                {branch.is_default ? (
                  "—"
                ) : div ? (
                  <>
                    <span className="text-diff-add-foreground">+{div.ahead}</span>{" "}
                    <span className="text-diff-remove-foreground">-{div.behind}</span>
                  </>
                ) : (
                  "…"
                )}
              </span>

              <span className="truncate text-xs text-muted">{authorName}</span>
              <RowTime>{formatRelativeTime(branch.created_at)}</RowTime>

              <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                {/* UC-50 Trigger: "View history" từ menu của nhánh — mở tab Commit
                    đã lọc sẵn đúng nhánh này. Link bọc Button giống các nút điều
                    hướng khác của trang dự án. */}
                <Link href={`/projects/${projectId}?tab=commits&branch=${branch.id}`}>
                  <Button variant="ghost" title={t("blist.historyTitle")}>
                    <History className="h-3.5 w-3.5" /> {t("blist.history")}
                  </Button>
                </Link>
                {!readOnly && !branch.is_default && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        div?.ahead === 0 ? showNothingToMerge(branch) : openMergeConfirm(branch)
                      }
                      disabled={mergeBusy || !defaultBranch}
                      aria-disabled={div?.ahead === 0 || undefined}
                    >
                      <GitMerge className="h-3.5 w-3.5" />
                      {mergeBusy && mergeSource?.id === branch.id
                        ? t("blist.merging")
                        : t("blist.mergeInto", { name: defaultBranch?.name ?? "" })}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => void openDelete(branch)}
                      disabled={branch.is_active}
                      aria-label={t("blist.deleteLabel", { name: branch.name })}
                      title={
                        branch.is_active
                          ? t("blist.deleteActiveTitle")
                          : t("blist.deleteTitle")
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                {!readOnly && branch.is_default && (
                  <Button
                    variant="ghost"
                    onClick={showDefaultBranchRefusal}
                    title={t("blist.deleteTitle")}
                    aria-label={t("blist.deleteDefaultLabel")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </RowItem>
            {isOpen && (
              <dl className="grid gap-x-6 gap-y-2 border-b border-border bg-surface-subtle px-3.5 py-3 text-xs last:border-b-0 sm:grid-cols-3">
                <div>
                  <dt className="font-bold uppercase tracking-wide text-muted">{t("blist.startPoint")}</dt>
                  <dd className="mt-1">
                    {branch.is_default
                      ? t("blist.rootBranch")
                      : base
                        ? <><span className="font-mono text-accent">{base.id.slice(0, 7)}</span> · {base.message}</>
                        : branch.base_commit_id
                          ? <span className="font-mono text-accent">{branch.base_commit_id.slice(0, 7)}</span>
                          : t("blist.unknown")}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wide text-muted">{t("blist.latestCommit")}</dt>
                  <dd className="mt-1">
                    {head
                      ? <><span className="font-mono text-accent">{head.id.slice(0, 7)}</span> · {head.message}</>
                      : branch.head_commit_id
                        ? <span className="font-mono text-accent">{branch.head_commit_id.slice(0, 7)}</span>
                        : t("blist.noCommits")}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wide text-muted">{t("blist.latestAuthor")}</dt>
                  <dd className="mt-1">{head ? formatAuthorName(head.author) : "—"}</dd>
                </div>
              </dl>
            )}
            </Fragment>
          );
        })}
      </RowList>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("blist.deleteDialogTitle", { name: deleteTarget?.name ?? "" })}
        message={
          deletePreviewState === "loading" ? (
            t("blist.checking")
          ) : deletePreviewState === "error" ? (
            <strong className="text-danger">
              {t("blist.checkFail")}
            </strong>
          ) : deletePreview && deletePreview.unmergedCommitsCount > 0 ? (
            <>
              {tx("blist.unmerged", { count: <strong className="text-danger">{t("blist.unmergedCount", { n: deletePreview.unmergedCommitsCount })}</strong> })}
            </>
          ) : (
            t("blist.allMerged")
          )
        }
        confirmLabel={t("blist.deleteTitle")}
        danger
        loading={deleteBusy}
        confirmDisabled={deletePreviewState === "loading"}
        error={renderError(deleteError)}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          setDeleteTarget(null);
          setDeletePreview(null);
        }}
      />

      <ConfirmDialog
        open={!!mergeConfirm}
        title={t("blist.mergeDialogTitle", { source: mergeConfirm?.name ?? "", target: defaultBranch?.name ?? "" })}
        message={
          <>
            {mergeConfirm && divergence[mergeConfirm.id]
              ? t("blist.mergeAhead", { ahead: divergence[mergeConfirm.id].ahead, source: mergeConfirm.name, target: defaultBranch?.name ?? "" })
              : t("blist.mergeCommits", { source: mergeConfirm?.name ?? "", target: defaultBranch?.name ?? "" })}
            {mergeSummary === "loading" && (
              <>
                <br />
                {t("blist.calculating")}
              </>
            )}
            {mergeSummary && typeof mergeSummary === "object" && (
              <>
                <br />
                <strong className="text-foreground">
                  {t("blist.noteSummary", { added: mergeSummary.added, modified: mergeSummary.modified, removed: mergeSummary.removed })}
                </strong>
              </>
            )}
            <br />
            {t("blist.conflictNote")}
            {mergeConfirm && defaultBranch && (
              <MergeRiskPanel
                sourceBranchId={mergeConfirm.id}
                targetBranchId={defaultBranch.id}
              />
            )}
          </>
        }
        confirmLabel={t("blist.mergeConfirm")}
        loading={mergeBusy}
        error={renderError(mergeError)}
        onConfirm={() => mergeConfirm && void handleMerge(mergeConfirm)}
        onCancel={() => {
          setMergeConfirm(null);
          setMergeError(null);
          mergeSummaryForRef.current = null;
        }}
      />

      {conflicts && mergeSource && defaultBranch && (
        <MergeConflictDialog
          result={conflicts}
          sourceName={mergeSource.name}
          targetName={defaultBranch.name}
          submitting={mergeBusy}
          error={renderError(resolveError)}
          onCancel={() => {
            setConflicts(null);
            setMergeSource(null);
            setResolveError(null);
          }}
          onResolve={(resolutions) => void handleResolve(resolutions)}
        />
      )}
    </>
  );
}
