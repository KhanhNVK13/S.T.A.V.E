"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GitBranch,
  GitCommitVertical,
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
import { EmptyState } from "../ui/empty-state";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Dialog, DialogActions } from "../ui/dialog";
import { FieldError, INPUT_CLASS } from "../ui/form";
import { validateMaxLength, validateRequired } from "../../lib/validation";
import { createAndActivateBranch } from "../../lib/create-and-activate-branch";
import { RowList, RowHeader, RowItem, RowTime } from "../ui/row-list";
import { Toast } from "../ui/toast";
import { CommitCompare } from "./commit-compare";
import type { CompareSide } from "./commit-compare";
import { apiErrorMessage } from "../../lib/error-message";
import { APP_LOCALE } from "../../lib/format-date";
import { formatAuthorName } from "../../lib/format-name";

/** Chọn | commit | tác giả | mã | thời điểm | thao tác. */
const COLS = "md:grid-cols-[20px_minmax(0,1fr)_150px_88px_96px_auto]";

const PAGE_SIZE = 20;

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
      setError(apiErrorMessage(err, "Không tải được lịch sử commit."));
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
          setError("Dự án chưa có nhánh nào.");
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(apiErrorMessage(err, "Không tải được danh sách nhánh."));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, initialBranchId, loadHistory]);

  function selectBranch(branchId: string) {
    const next = branches.find((b) => b.id === branchId) ?? null;
    setBranch(next);
    setPage(1);
    setSelected([]);
    setTaggingId(null);
    if (next) void loadHistory(next.id);
  }

  async function handleTag(commitId: string, replaceConfirmed = false) {
    const name = tagName.trim();
    const invalid =
      validateRequired(name, "Vui lòng nhập tên tag.") ??
      validateMaxLength(name, 30, "Tên tag") ??
      (TAG_PATTERN.test(name)
        ? null
        : "Tên tag chỉ gồm chữ, số và dấu gạch ngang, không bắt đầu hoặc kết thúc bằng dấu gạch ngang.");
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
      setNotice(`Đã gắn tag "${name}".`);
      if (branch) await loadHistory(branch.id);
    } catch (err) {
      setError(apiErrorMessage(err, "Không gắn được tag."));
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
      setNotice(`Đã bỏ tag "${removeTag.name}". Commit vẫn được giữ nguyên.`);
      setRemoveTag(null);
      if (branch) await loadHistory(branch.id);
    } catch (err) {
      setRemoveTagError(apiErrorMessage(err, "Không bỏ được tag."));
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
      validateRequired(name, "Vui lòng nhập tên nhánh.") ?? validateMaxLength(name, 50, "Tên nhánh");
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
          ? `Đã tạo nhánh "${name}" từ commit ${branchFrom.id.slice(0, 7)} và chuyển sang nhánh này.`
          : `Đã tạo nhánh "${name}" từ commit ${branchFrom.id.slice(0, 7)} nhưng chưa chuyển sang được: ${apiErrorMessage(outcome.switchError, "không rõ nguyên nhân")} Bạn có thể chuyển nhánh trong editor.`,
      );
      setBranchFrom(null);
      setBranchFromName("");
    } catch (err) {
      setBranchFromError(apiErrorMessage(err, "Không tạo được nhánh."));
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
      setNotice("Đã khôi phục — một commit mới đã được tạo, lịch sử cũ vẫn giữ nguyên.");
      setPage(1);
      setSelected([]);
      await loadHistory(branch.id);
    } catch (err) {
      setRestoreError(apiErrorMessage(err, "Không khôi phục được phiên bản này."));
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

  const head = commits[0] ?? null;
  const isDefault = branch?.is_default ?? false;
  const uniqueCount = commits.filter((c) => c.isUniqueToBranch).length;
  const totalPages = Math.max(1, Math.ceil(commits.length / PAGE_SIZE));
  const pageItems = commits.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedCommits = selected
    .map((id) => commits.find((c) => c.id === id))
    .filter((c): c is BranchHistoryCommit => !!c);
  const canCompare = commits.length >= 2; // UC-45 PRE-3

  if (loading && commits.length === 0 && !error) {
    return (
      <RowList cols={COLS}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[68px] animate-pulse items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0"
          >
            <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-surface-subtle" />
            <div className="flex-1">
              <div className="mb-1.5 h-3 w-1/3 rounded bg-surface-subtle" />
              <div className="h-2.5 w-1/4 rounded bg-surface-subtle" />
            </div>
          </div>
        ))}
      </RowList>
    );
  }

  return (
    <>
      {notice && <Toast message={notice} variant="success" onDismiss={() => setNotice(null)} />}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <GitBranch className="h-3.5 w-3.5" />
          {/* UC-50 Alt 1.1: đổi bộ lọc lịch sử sang 1 nhánh cụ thể. */}
          <select
            value={branch?.id ?? ""}
            onChange={(e) => selectBranch(e.target.value)}
            className={`${INPUT_CLASS} h-8 w-auto font-mono`}
            aria-label="Chọn nhánh để xem lịch sử"
            disabled={branches.length === 0}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.is_default ? " (mặc định)" : ""}
              </option>
            ))}
          </select>
          {commits.length > 0 && (
            <span>
              <span className="font-mono">{commits.length.toLocaleString(APP_LOCALE)}</span> commit
              {!isDefault && (
                <>
                  {" "}
                  · <span className="font-mono">{uniqueCount}</span> riêng của nhánh
                </>
              )}
            </span>
          )}
        </div>

        {canCompare && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">
              {selected.length === 0
                ? "Tích 2 commit để so sánh"
                : `Đã chọn ${selected.length}/2`}
            </span>
            {selected.length > 0 && (
              <Button variant="ghost" onClick={() => setSelected([])}>
                Bỏ chọn
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={selectedCommits.length !== 2}
              onClick={() => openCompare(selectedCommits[0], selectedCommits[1])}
            >
              <GitCompareArrows className="h-3.5 w-3.5" /> So sánh
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-danger/20 bg-danger-muted px-4 py-3">
          <p className="text-xs text-danger">{error}</p>
          {branch && (
            <Button variant="secondary" onClick={() => void loadHistory(branch.id)}>
              Thử lại
            </Button>
          )}
        </div>
      )}

      {/* UC-50 2.E1: nhánh chưa có commit riêng — nói rõ chứ không để người dùng tưởng lỗi. */}
      {!isDefault && !error && commits.length > 0 && uniqueCount === 0 && (
        <p className="mb-3 rounded-card border border-border bg-surface-subtle px-4 py-2.5 text-xs text-muted">
          Nhánh <span className="font-mono text-foreground">{branch?.name}</span> chưa có commit
          riêng nào (chưa rẽ khỏi nhánh mặc định) — bên dưới là lịch sử kế thừa.
        </p>
      )}

      {commits.length === 1 && !error && (
        <p className="mb-3 rounded-card border border-border bg-surface-subtle px-4 py-2.5 text-xs text-muted">
          Mới có một commit nên chưa so sánh được. Hãy commit thêm một phiên bản nữa, khi đó mỗi
          commit sẽ có lựa chọn so sánh.
        </p>
      )}

      {commits.length === 0 && !error ? (
        <EmptyState
          icon={GitCommitVertical}
          title="Chưa có commit nào."
          description="Commit là một phiên bản có tên của bản nhạc, có thể quay lại bất cứ lúc nào. Mở trình soạn nhạc, thay đổi bản nhạc rồi bấm Commit Changes để tạo commit đầu tiên."
        />
      ) : commits.length > 0 ? (
        <RowList cols={COLS}>
          <RowHeader>
            <span />
            <span>Commit</span>
            <span>Tác giả</span>
            <span>Mã</span>
            <span className="text-right">Thời điểm</span>
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
                      aria-label={`Chọn commit ${commit.id.slice(0, 7)} để so sánh`}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                  )}
                </span>

                <div className="flex min-w-0 items-start gap-2.5">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      isHead ? "bg-accent" : "bg-border-strong"
                    }`}
                    title={isHead ? "Commit mới nhất của nhánh" : undefined}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{commit.message}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {isHead && <Badge variant="info">Mới nhất</Badge>}
                      {/* UC-50 bước 3: phân biệt commit riêng của nhánh và commit kế thừa. */}
                      {!isDefault &&
                        (commit.isUniqueToBranch ? (
                          <Badge variant="success">Riêng nhánh</Badge>
                        ) : (
                          <Badge variant="neutral">Kế thừa</Badge>
                        ))}
                      {commit.tags.map((tag) => (
                        <Badge key={tag.id} variant="metal">
                          <TagIcon className="h-3 w-3" /> {tag.name}
                          <button
                            type="button"
                            aria-label={`Bỏ tag ${tag.name}`}
                            title="Bỏ tag"
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
                        <span className="text-xs text-muted">Đang tính thay đổi…</span>
                      )}
                      {changeCounts[commit.id] === "error" && (
                        <span className="text-xs text-danger">Không tính được thay đổi</span>
                      )}
                      {changeCounts[commit.id] === "first" && (
                        <span className="text-xs text-muted">Bản ghi đầu tiên của dự án</span>
                      )}
                      {typeof changeCounts[commit.id] === "object" && (
                        <span className="font-mono text-xs text-muted">
                          +{(changeCounts[commit.id] as { added: number }).added} thêm ·{" "}
                          −{(changeCounts[commit.id] as { removed: number }).removed} xoá ·{" "}
                          {(changeCounts[commit.id] as { modified: number }).modified} sửa
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
                  {new Date(commit.created_at).toLocaleString(APP_LOCALE, {
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
                        placeholder="Tên tag"
                        className={`${INPUT_CLASS} h-8 w-28 font-mono`}
                      />
                      <Button type="submit" disabled={tagBusy}>
                        {tagBusy ? "Đang lưu…" : "Lưu"}
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
                        Huỷ
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
                          title="So sánh commit này với commit mới nhất của nhánh"
                        >
                          <GitCompareArrows className="h-3.5 w-3.5" /> So với mới nhất
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
                        <TagIcon className="h-3.5 w-3.5" /> Gắn tag
                      </Button>
                      {changeCounts[commit.id] === undefined && (
                        <Button variant="ghost" onClick={() => void showChangeCount(commit)}>
                          Thay đổi
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
                        <GitBranchPlus className="h-3.5 w-3.5" /> Nhánh từ đây
                      </Button>
                      <Button variant="secondary" onClick={() => setRestoreTarget(commit)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Khôi phục
                      </Button>
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
            Trước
          </Button>
          <span className="px-2 font-mono text-xs text-muted">
            {page} / {totalPages}
          </span>
          <Button
            variant="secondary"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
          >
            Sau
          </Button>
        </div>
      )}

      {comparing && (
        <CommitCompare
          base={comparing.base}
          target={comparing.target}
          onClose={() => setComparing(null)}
        />
      )}

      <ConfirmDialog
        open={!!removeTag}
        title="Bỏ tag của commit này?"
        message={
          <>
            Tag <strong className="font-mono text-foreground">{removeTag?.name}</strong> sẽ được gỡ
            khỏi commit. Commit và nội dung của nó không bị ảnh hưởng.
          </>
        }
        confirmLabel="Bỏ tag"
        danger
        loading={removeTagBusy}
        error={removeTagError}
        onConfirm={() => void handleRemoveTag()}
        onCancel={() => setRemoveTag(null)}
      />

      <Dialog
        open={!!branchFrom}
        title="Tạo nhánh từ commit này"
        onClose={() => setBranchFrom(null)}
        closeDisabled={branchFromBusy}
        className="max-w-sm p-6"
      >
        <p className="mb-3 text-[13px] text-muted">
          Nhánh mới bắt đầu từ commit{" "}
          <span className="font-mono text-foreground">{branchFrom?.id.slice(0, 7)}</span>
          {branchFrom ? ` ("${branchFrom.message}")` : ""}.
        </p>
        <label className="mb-3 flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">Tên nhánh mới</span>
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
            placeholder="vd: thu-phoi-bass"
            className={`${INPUT_CLASS} w-full font-mono`}
          />
          {branchFromError && <FieldError>{branchFromError}</FieldError>}
        </label>
        <DialogActions>
          <Button variant="secondary" onClick={() => setBranchFrom(null)} disabled={branchFromBusy}>
            Huỷ
          </Button>
          <Button onClick={() => void handleBranchFrom()} disabled={branchFromBusy}>
            {branchFromBusy ? "Đang tạo…" : "Tạo nhánh"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!replaceTag}
        title="Thay tag của commit này?"
        message={
          <>
            Commit này đã có tag{" "}
            <strong className="font-mono text-foreground">{replaceTag?.oldName}</strong>. Mỗi
            commit chỉ mang một tag, nên tag mới{" "}
            <strong className="font-mono text-foreground">{replaceTag?.newName}</strong> sẽ thay
            tag cũ.
          </>
        }
        confirmLabel="Thay tag"
        loading={tagBusy}
        onConfirm={() => replaceTag && void handleTag(replaceTag.commitId, true)}
        onCancel={() => setReplaceTag(null)}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        title="Khôi phục phiên bản này?"
        message={
          <>
            Bản nhạc của nhánh <span className="font-mono">{branch?.name}</span> sẽ quay về trạng
            thái của commit <span className="font-mono">{restoreTarget?.id.slice(0, 7)}</span> (
            {restoreTarget?.message}).
            <br />
            <br />
            Lịch sử KHÔNG bị xoá — hệ thống tạo một commit mới mang nội dung cũ, và bản nháp
            đang mở của nhánh này sẽ được đặt lại theo nội dung đó.
          </>
        }
        confirmLabel="Khôi phục"
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
