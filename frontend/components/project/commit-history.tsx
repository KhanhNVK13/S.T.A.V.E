"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GitBranch,
  GitCompareArrows,
  GitBranchPlus,
  RotateCcw,
  Tag as TagIcon,
  X,
} from "lucide-react";
import {
  compareCommits,
  deleteCommitTag,
  getBranchHistory,
  listProjectBranches,
  restoreCommit,
  tagCommit,
} from "../../lib/api-client";
import type { Branch, BranchHistoryCommit } from "../../lib/api-client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Dialog, DialogActions } from "../ui/dialog";
import { FieldError, INPUT_CLASS } from "../ui/form";
import { validateMaxLength, validateRequired } from "../../lib/validation";
import { createAndActivateBranch } from "../../lib/create-and-activate-branch";
import { RowList, RowHeader, RowItem, RowTime } from "../ui/row-list";
import { Toast } from "../ui/toast";
import { CommitCompare } from "./commit-compare";
import { VersionPickerDialog } from "./version-picker-dialog";
import { SkyEmpty, SkyLoading } from "./sky-state";
import type { CompareSide } from "./commit-compare";
import { apiErrorMessage } from "../../lib/error-message";
import { formatAuthorName } from "../../lib/format-name";
import { useI18n } from "../../context/i18n-context";
import { tNow } from "../../lib/i18n";

/** Chọn | commit | tác giả | mã | thời điểm | thao tác. */
const COLS = "md:grid-cols-[20px_minmax(0,1fr)_150px_88px_96px_auto]";

const PAGE_SIZE = 20;

const ALL_BRANCHES = "__all__";

const TAG_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

/**
 * UC-43 (xem lịch sử commit) + UC-44 (gắn tag) + UC-45 (so sánh) + UC-46
 * (khôi phục) + UC-50 (lịch sử theo nhánh) ở cấp PROJECT — tách khỏi MIDI
 * Editor để xem được lịch sử mà không phải mở trình soạn nhạc.
 *
 * Chỉ chủ dự án gọi được các endpoint này (backend trả 403 cho người khác —
 * đúng SRS: UC-43 actor là User/chủ dự án, còn UC-09 "Guest xem dự án công
 * khai" chỉ gồm playback/mô tả/thống kê). Trang cha chịu trách nhiệm ẩn tab
 * này với người không phải chủ.
 *
 * Lịch sử đọc qua `GET /branches/:id/history` cho MỌI nhánh (kể cả nhánh mặc
 * định) để một nhánh luôn hiện cả commit kế thừa từ điểm rẽ nhánh (UC-50
 * POST-1). Endpoint đó không phân trang nên phân trang ở client.
 */
export function CommitHistory({
  projectId,
  initialBranchId,
}: {
  projectId: string;
  /** UC-50: mở thẳng lịch sử 1 nhánh (từ nút "Lịch sử" ở tab Nhánh). */
  initialBranchId?: string | null;
}) {
  const { t, tx, locale } = useI18n();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [commits, setCommits] = useState<BranchHistoryCommit[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [taggingId, setTaggingId] = useState<string | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [removeTag, setRemoveTag] = useState<{ commitId: string; name: string } | null>(null);
  const [removeTagBusy, setRemoveTagBusy] = useState(false);
  const [removeTagError, setRemoveTagError] = useState<string | null>(null);
  const [changeCounts, setChangeCounts] = useState<
    Record<string, "loading" | "error" | "first" | { added: number; removed: number; modified: number }>
  >({});
  const [branchFrom, setBranchFrom] = useState<BranchHistoryCommit | null>(null);
  const [branchFromName, setBranchFromName] = useState("");
  const [branchFromError, setBranchFromError] = useState<string | null>(null);
  const [branchFromBusy, setBranchFromBusy] = useState(false);
  const [replaceTag, setReplaceTag] = useState<{ commitId: string; oldName: string; newName: string } | null>(null);

  const [restoreTarget, setRestoreTarget] = useState<BranchHistoryCommit | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  /** Tối đa 2 commit được chọn để so sánh; chọn cái thứ 3 thì bỏ cái chọn sớm nhất. */
  const [selected, setSelected] = useState<string[]>([]);
  const [allView, setAllView] = useState(false);
  const [picker, setPicker] = useState<"compare" | "restore" | null>(null);
  const [comparing, setComparing] = useState<{ base: CompareSide; target: CompareSide } | null>(
    null,
  );

  const loadHistory = useCallback(async (branchId: string) => {
    setLoading(true);
    try {
      const data = await getBranchHistory(branchId);
      setCommits([...data.commits].reverse()); // API trả cũ nhất trước
      setError(null);
    } catch (err) {
      // 2.E2: báo lỗi kèm nút thử lại, không hiện danh sách rỗng dễ gây hiểu
      // nhầm là mất lịch sử.
      setCommits([]);
      setError(apiErrorMessage(err, tNow("chist.loadFail")));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllHistory = useCallback(async (list: Branch[]) => {
    setLoading(true);
    try {
      const results = await Promise.all(list.map((b) => getBranchHistory(b.id)));
      const byId = new Map<string, BranchHistoryCommit>();
      for (const result of results) {
        for (const commit of result.commits) byId.set(commit.id, commit);
      }
      setCommits(
        [...byId.values()].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
      );
      setError(null);
    } catch (err) {
      setCommits([]);
      setError(apiErrorMessage(err, tNow("chist.loadFail")));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const list = await listProjectBranches(projectId);
        if (cancelled) return;
        setBranches(list);
        const target =
          list.find((b) => b.id === initialBranchId) ??
          list.find((b) => b.is_default) ??
          list[0] ??
          null;
        setBranch(target);
        if (target) {
          await loadHistory(target.id);
        } else {
          setError(tNow("chist.noBranches"));
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(apiErrorMessage(err, tNow("chist.branchesFail")));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, initialBranchId, loadHistory]);

  function selectBranch(branchId: string) {
    setPage(1);
    setSelected([]);
    setTaggingId(null);
    if (branchId === ALL_BRANCHES) {
      setAllView(true);
      setBranch(null);
      void loadAllHistory(branches);
      return;
    }
    const next = branches.find((b) => b.id === branchId) ?? null;
    setAllView(false);
    setBranch(next);
    if (next) void loadHistory(next.id);
  }

  function retryLoad() {
    if (allView) void loadAllHistory(branches);
    else if (branch) void loadHistory(branch.id);
  }

  async function handleTag(commitId: string, replaceConfirmed = false) {
    const name = tagName.trim();
    const invalid =
      validateRequired(name, t("chist.tagRequired")) ??
      validateMaxLength(name, 30, t("chist.tagLabel")) ??
      (TAG_PATTERN.test(name)
        ? null
        : t("chist.tagPattern"));
    setTagError(invalid);
    if (invalid) return;
    const existing = commits.find((c) => c.id === commitId)?.tags[0];
    if (existing && !replaceConfirmed) {
      setReplaceTag({ commitId, oldName: existing.name, newName: name });
      return;
    }
    setTagBusy(true);
    try {
      await tagCommit(commitId, name);
      setTaggingId(null);
      setTagName("");
      setNotice(t("chist.tagged", { name }));
      if (branch) await loadHistory(branch.id);
    } catch (err) {
      setError(apiErrorMessage(err, t("chist.tagFail")));
    } finally {
      setTagBusy(false);
      setReplaceTag(null);
    }
  }

  async function handleRemoveTag() {
    if (!removeTag) return;
    setRemoveTagBusy(true);
    setRemoveTagError(null);
    try {
      await deleteCommitTag(removeTag.commitId, removeTag.name);
      setNotice(t("chist.untagged", { name: removeTag.name }));
      setRemoveTag(null);
      if (branch) await loadHistory(branch.id);
    } catch (err) {
      setRemoveTagError(apiErrorMessage(err, t("chist.untagFail")));
    } finally {
      setRemoveTagBusy(false);
    }
  }

  async function showChangeCount(commit: BranchHistoryCommit) {
    if (!commit.parent_commit_id) {
      setChangeCounts((prev) => ({ ...prev, [commit.id]: "first" }));
      return;
    }
    setChangeCounts((prev) => ({ ...prev, [commit.id]: "loading" }));
    try {
      const diff = await compareCommits(commit.parent_commit_id, commit.id);
      setChangeCounts((prev) => ({ ...prev, [commit.id]: diff.summary.notes }));
    } catch {
      setChangeCounts((prev) => ({ ...prev, [commit.id]: "error" }));
    }
  }

  async function handleBranchFrom() {
    if (!branchFrom) return;
    const name = branchFromName.trim();
    const invalid =
      validateRequired(name, t("chist.branchNameRequired")) ?? validateMaxLength(name, 50, t("chist.branchNameLabel"));
    if (invalid) {
      setBranchFromError(invalid);
      return;
    }
    setBranchFromBusy(true);
    setBranchFromError(null);
    try {
      const outcome = await createAndActivateBranch(projectId, {
        name,
        startCommitId: branchFrom.id,
      });
      setNotice(
        outcome.switched
          ? t("chist.branchCreated", { name, id: branchFrom.id.slice(0, 7) })
          : t("chist.branchCreatedNoSwitch", { name, id: branchFrom.id.slice(0, 7), reason: apiErrorMessage(outcome.switchError, t("chist.unknownReason")) }),
      );
      setBranchFrom(null);
      setBranchFromName("");
    } catch (err) {
      setBranchFromError(apiErrorMessage(err, t("chist.branchFail")));
    } finally {
      setBranchFromBusy(false);
    }
  }

  async function handleRestore() {
    if (!restoreTarget || !branch) return;
    setRestoreBusy(true);
    setRestoreError(null);
    try {
      await restoreCommit(restoreTarget.id, { branch_id: branch.id });
      setRestoreTarget(null);
      setNotice(t("chist.restored"));
      setPage(1);
      setSelected([]);
      await loadHistory(branch.id);
    } catch (err) {
      setRestoreError(apiErrorMessage(err, t("chist.restoreFail")));
    } finally {
      setRestoreBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2),
    );
  }

  /** Bản cũ hơn làm mốc (gốc), bản mới hơn đem ra so — người dùng đảo được trong màn so sánh. */
  function openCompare(a: BranchHistoryCommit, b: BranchHistoryCommit) {
    const [older, newer] =
      new Date(a.created_at).getTime() <= new Date(b.created_at).getTime() ? [a, b] : [b, a];
    setComparing({ base: older, target: newer });
  }

  const head = allView ? null : (commits[0] ?? null);
  const isDefault = allView || (branch?.is_default ?? false);
  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  const uniqueCount = commits.filter((c) => c.isUniqueToBranch).length;
  const totalPages = Math.max(1, Math.ceil(commits.length / PAGE_SIZE));
  const pageItems = commits.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedCommits = selected
    .map((id) => commits.find((c) => c.id === id))
    .filter((c): c is BranchHistoryCommit => !!c);
  const canCompare = commits.length >= 2; // UC-45 PRE-3

  if (loading && commits.length === 0 && !error) {
    return <SkyLoading label={t("chist.loading")} />;
  }

  return (
    <>
      {notice && <Toast message={notice} variant="success" onDismiss={() => setNotice(null)} />}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <GitBranch className="h-3.5 w-3.5" />
          {/* UC-50 Alt 1.1: đổi bộ lọc lịch sử sang 1 nhánh cụ thể. */}
          <select
            value={allView ? ALL_BRANCHES : (branch?.id ?? "")}
            onChange={(e) => selectBranch(e.target.value)}
            className={`${INPUT_CLASS} h-8 w-auto font-mono`}
            aria-label={t("chist.pickBranch")}
            disabled={branches.length === 0}
          >
            {branches.length > 1 && <option value={ALL_BRANCHES}>{t("chist.allBranches")}</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.is_default ? t("chist.defaultSuffix") : ""}
              </option>
            ))}
          </select>
          {commits.length > 0 && (
            <span>
              <span className="font-mono">{commits.length.toLocaleString(locale)}</span> commit
              {!isDefault && (
                <>
                  {" "}
                  · <span className="font-mono">{uniqueCount}</span> {t("chist.uniqueSuffix")}
                </>
              )}
            </span>
          )}
        </div>

        {canCompare && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">
              {selected.length === 0
                ? t("chist.pickTwo")
                : t("chist.selected", { n: selected.length })}
            </span>
            {selected.length > 0 && (
              <Button variant="ghost" onClick={() => setSelected([])}>
                {t("chist.clear")}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={selectedCommits.length !== 2}
              onClick={() => openCompare(selectedCommits[0], selectedCommits[1])}
            >
              <GitCompareArrows className="h-3.5 w-3.5" /> {t("chist.compare")}
            </Button>
            <Button variant="ghost" onClick={() => setPicker("compare")}>
              {t("chist.pickVersions")}
            </Button>
          </div>
        )}
        {!allView && commits.length > 0 && (
          <Button variant="ghost" onClick={() => setPicker("restore")}>
            <RotateCcw className="h-3.5 w-3.5" /> {t("chist.restoreByVersion")}
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-danger/20 bg-danger-muted px-4 py-3">
          <p className="text-xs text-danger">{error}</p>
          {(branch || allView) && (
            <Button variant="secondary" onClick={retryLoad}>
              {t("ui.retry")}
            </Button>
          )}
        </div>
      )}

      {/* UC-50 2.E1: nhánh chưa có commit riêng — nói rõ chứ không để người dùng tưởng lỗi. */}
      {!isDefault && !error && commits.length > 0 && uniqueCount === 0 && (
        <p className="mb-3 rounded-card border border-border bg-surface-subtle px-4 py-2.5 text-xs text-muted">
          {tx("chist.branchNoOwn", { name: <span className="font-mono text-foreground">{branch?.name}</span> })}
        </p>
      )}

      {commits.length === 1 && !error && (
        <p className="mb-3 rounded-card border border-border bg-surface-subtle px-4 py-2.5 text-xs text-muted">
          {t("chist.onlyOne")}
        </p>
      )}

      {commits.length === 0 && !error ? (
        <SkyEmpty
          title={t("chist.emptyTitle")}
          description={t("chist.emptyBody")}
        />
      ) : commits.length > 0 ? (
        <RowList cols={COLS}>
          <RowHeader>
            <span />
            <span>Commit</span>
            <span>{t("chist.colAuthor")}</span>
            <span>{t("chist.colId")}</span>
            <span className="text-right">{t("chist.colTime")}</span>
            <span />
          </RowHeader>

          {pageItems.map((commit) => {
            const isHead = commit.id === head?.id;
            const isSelected = selected.includes(commit.id);
            const authorName = formatAuthorName(commit.author);
            return (
              <RowItem
                key={commit.id}
                className={isSelected ? "bg-accent-muted hover:bg-accent-muted" : ""}
              >
                <span className="flex items-center">
                  {canCompare && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(commit.id)}
                      aria-label={t("chist.pickToCompare", { id: commit.id.slice(0, 7) })}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                  )}
                </span>

                <div className="flex min-w-0 items-start gap-2.5">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      isHead ? "bg-accent" : "bg-border-strong"
                    }`}
                    title={isHead ? t("chist.latestTitle") : undefined}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{commit.message}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {isHead && <Badge variant="info">{t("chist.latest")}</Badge>}
                      {/* UC-50 bước 3: phân biệt commit riêng của nhánh và commit kế thừa. */}
                      {allView && (
                        <Badge variant="neutral">
                          <GitBranch className="h-3 w-3" />{" "}
                          {branchNames.get(commit.branch_id) ?? t("chist.deletedBranch")}
                        </Badge>
                      )}
                      {!isDefault &&
                        (commit.isUniqueToBranch ? (
                          <Badge variant="success">{t("chist.ownToBranch")}</Badge>
                        ) : (
                          <Badge variant="neutral">{t("chist.inherited")}</Badge>
                        ))}
                      {commit.tags.map((tag) => (
                        <Badge key={tag.id} variant="metal">
                          <TagIcon className="h-3 w-3" /> {tag.name}
                          <button
                            type="button"
                            aria-label={t("chist.removeTagLabel", { name: tag.name })}
                            title={t("chist.removeTagShort")}
                            onClick={() => {
                              setRemoveTagError(null);
                              setRemoveTag({ commitId: commit.id, name: tag.name });
                            }}
                            className="ml-0.5 rounded hover:bg-surface-muted"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      {changeCounts[commit.id] === "loading" && (
                        <span className="text-xs text-muted">{t("chist.counting")}</span>
                      )}
                      {changeCounts[commit.id] === "error" && (
                        <span className="text-xs text-danger">{t("chist.countFail")}</span>
                      )}
                      {changeCounts[commit.id] === "first" && (
                        <span className="text-xs text-muted">{t("chist.firstRecord")}</span>
                      )}
                      {typeof changeCounts[commit.id] === "object" && (
                        <span className="font-mono text-xs text-muted">
                          {t("chist.changeCounts", changeCounts[commit.id] as { added: number; removed: number; modified: number })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <span className="truncate text-xs text-muted">{authorName}</span>
                <span className="font-mono text-xs text-accent">
                  {commit.id.slice(0, 7)}
                </span>
                <RowTime>
                  {new Date(commit.created_at).toLocaleString(locale, {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </RowTime>

                <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                  {taggingId === commit.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleTag(commit.id);
                      }}
                      noValidate
                      className="flex flex-wrap items-center gap-1.5"
                    >
                      <input
                        name="tagName"
                        autoComplete="off"
                        spellCheck={false}
                        autoFocus
                        value={tagName}
                        onChange={(e) => {
                          setTagName(e.target.value);
                          setTagError(null);
                        }}
                        placeholder={t("chist.tagPlaceholder")}
                        aria-label={t("chist.tagPlaceholder")}
                        className={`${INPUT_CLASS} h-8 w-28 font-mono`}
                      />
                      <Button type="submit" disabled={tagBusy}>
                        {tagBusy ? t("chist.saving") : t("chist.save")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setTaggingId(null);
                          setTagName("");
                          setTagError(null);
                        }}
                      >
                        {t("ui.cancel")}
                      </Button>
                      {tagError && (
                        <div className="basis-full">
                          <FieldError>{tagError}</FieldError>
                        </div>
                      )}
                    </form>
                  ) : (
                    <>
                      {/* UC-45 Trigger: "Compare with latest" trên 1 commit. */}
                      {!isHead && head && (
                        <Button
                          variant="ghost"
                          onClick={() => openCompare(commit, head)}
                          title={t("chist.compareWithLatestTitle")}
                        >
                          <GitCompareArrows className="h-3.5 w-3.5" /> {t("chist.compareWithLatest")}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setTaggingId(commit.id);
                          setTagName("");
                          setTagError(null);
                        }}
                      >
                        <TagIcon className="h-3.5 w-3.5" /> {t("chist.addTag")}
                      </Button>
                      {changeCounts[commit.id] === undefined && (
                        <Button variant="ghost" onClick={() => void showChangeCount(commit)}>
                          {t("chist.changes")}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setBranchFromError(null);
                          setBranchFromName("");
                          setBranchFrom(commit);
                        }}
                      >
                        <GitBranchPlus className="h-3.5 w-3.5" /> {t("chist.branchFromHere")}
                      </Button>
                      {!allView && (
                        <Button variant="secondary" onClick={() => setRestoreTarget(commit)}>
                          <RotateCcw className="h-3.5 w-3.5" /> {t("chist.restore")}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </RowItem>
            );
          })}
        </RowList>
      ) : null}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="secondary" onClick={() => setPage(page - 1)} disabled={page <= 1}>
            {t("chist.prev")}
          </Button>
          <span className="px-2 font-mono text-xs text-muted">
            {page} / {totalPages}
          </span>
          <Button
            variant="secondary"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
          >
                        {t("chist.next")}

          </Button>
        </div>
      )}

      <VersionPickerDialog
        open={picker !== null}
        mode={picker ?? "compare"}
        commits={commits}
        initialIds={
          picker === "compare"
            ? selected.length === 2
              ? selected
              : [commits[1]?.id ?? "", commits[0]?.id ?? ""]
            : [commits.find((c) => c.tags.length > 0)?.id ?? commits[0]?.id ?? ""]
        }
        onClose={() => setPicker(null)}
        onConfirm={(ids) => {
          const chosen = ids
            .map((id) => commits.find((c) => c.id === id))
            .filter((c): c is BranchHistoryCommit => !!c);
          setPicker(null);
          if (picker === "compare" && chosen.length === 2) openCompare(chosen[0], chosen[1]);
          else if (picker === "restore" && chosen[0]) setRestoreTarget(chosen[0]);
        }}
      />

      {comparing && (
        <CommitCompare
          projectId={projectId}
          base={comparing.base}
          target={comparing.target}
          onClose={() => setComparing(null)}
        />
      )}

      <ConfirmDialog
        open={!!removeTag}
        title={t("chist.removeTagTitle")}
        message={
          <>
            {tx("chist.removeTagBody", { name: <strong className="font-mono text-foreground">{removeTag?.name}</strong> })}
          </>
        }
        confirmLabel={t("chist.removeTagShort")}
        danger
        loading={removeTagBusy}
        error={removeTagError}
        onConfirm={() => void handleRemoveTag()}
        onCancel={() => setRemoveTag(null)}
      />

      <Dialog
        open={!!branchFrom}
        title={t("chist.branchFromTitle")}
        onClose={() => setBranchFrom(null)}
        closeDisabled={branchFromBusy}
        className="max-w-sm p-6"
      >
        <p className="mb-3 text-[13px] text-muted">
          {tx("chist.branchFromBody", { id: <span className="font-mono text-foreground">{branchFrom?.id.slice(0, 7)}</span>, message: branchFrom ? ` ("${branchFrom.message}")` : "" })}
        </p>
        <label className="mb-3 flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">{t("chist.newBranchName")}</span>
          <input
            name="branchFromName"
            autoComplete="off"
            spellCheck={false}
            data-autofocus
            value={branchFromName}
            onChange={(e) => {
              setBranchFromName(e.target.value);
              setBranchFromError(null);
            }}
            placeholder={t("chist.newBranchPlaceholder")}
            className={`${INPUT_CLASS} w-full font-mono`}
          />
          {branchFromError && <FieldError>{branchFromError}</FieldError>}
        </label>
        <DialogActions>
          <Button variant="secondary" onClick={() => setBranchFrom(null)} disabled={branchFromBusy}>
            {t("ui.cancel")}
          </Button>
          <Button onClick={() => void handleBranchFrom()} disabled={branchFromBusy}>
            {branchFromBusy ? t("chist.creating") : t("chist.createBranch")}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!replaceTag}
        title={t("chist.replaceTitle")}
        message={
          <>
            {tx("chist.replaceBody", { oldName: <strong className="font-mono text-foreground">{replaceTag?.oldName}</strong>, newName: <strong className="font-mono text-foreground">{replaceTag?.newName}</strong> })}
          </>
        }
        confirmLabel={t("chist.replaceConfirm")}
        loading={tagBusy}
        onConfirm={() => replaceTag && void handleTag(replaceTag.commitId, true)}
        onCancel={() => setReplaceTag(null)}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        title={t("chist.restoreTitle")}
        message={
          <>
            {tx("chist.restoreBody1", { branch: <span className="font-mono">{branch?.name}</span>, id: <span className="font-mono">{restoreTarget?.id.slice(0, 7)}</span>, message: restoreTarget?.message ?? "" })} <br /> <br /> {t("chist.restoreBody2")}
          </>
        }
        confirmLabel={t("chist.restore")}
        loading={restoreBusy}
        error={restoreError}
        onConfirm={() => void handleRestore()}
        onCancel={() => {
          setRestoreTarget(null);
          setRestoreError(null);
        }}
      />
    </>
  );
}
