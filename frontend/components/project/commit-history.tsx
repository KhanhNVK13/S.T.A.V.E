"use client";

import { useCallback, useEffect, useState } from "react";
import {
  GitBranch,
  GitCommitVertical,
  GitCompareArrows,
  RotateCcw,
  Tag as TagIcon,
} from "lucide-react";
import {
  ApiError,
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
import { INPUT_CLASS } from "../ui/form";
import { RowList, RowHeader, RowItem, RowTime } from "../ui/row-list";
import { Toast } from "../ui/toast";
import { CommitCompare } from "./commit-compare";
import type { CompareSide } from "./commit-compare";

/** Chọn | commit | tác giả | mã | thời điểm | thao tác. */
const COLS = "md:grid-cols-[20px_minmax(0,1fr)_150px_88px_78px_auto]";

const PAGE_SIZE = 20;

function messageOf(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

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

  const [restoreTarget, setRestoreTarget] = useState<BranchHistoryCommit | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);

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
      setError(messageOf(err, "Không tải được lịch sử commit."));
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
          setError(messageOf(err, "Không tải được danh sách nhánh."));
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

  async function handleTag(commitId: string) {
    const name = tagName.trim();
    if (!name) return;
    setTagBusy(true);
    try {
      await tagCommit(commitId, name);
      setTaggingId(null);
      setTagName("");
      setNotice(`Đã gắn tag "${name}".`);
      if (branch) await loadHistory(branch.id);
    } catch (err) {
      setError(messageOf(err, "Không gắn được tag."));
    } finally {
      setTagBusy(false);
    }
  }

  async function handleRestore() {
    if (!restoreTarget || !branch) return;
    setRestoreBusy(true);
    try {
      await restoreCommit(restoreTarget.id, { branch_id: branch.id });
      setRestoreTarget(null);
      setNotice("Đã khôi phục — một commit mới đã được tạo, lịch sử cũ vẫn giữ nguyên.");
      setPage(1);
      setSelected([]);
      await loadHistory(branch.id);
    } catch (err) {
      setError(messageOf(err, "Không khôi phục được phiên bản này."));
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
      <RowList>
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
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
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
              <span className="font-mono">{commits.length.toLocaleString("vi-VN")}</span> commit
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
            <span className="text-[11px] text-muted">
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

      {commits.length === 0 && !error ? (
        <EmptyState
          icon={GitCommitVertical}
          title="Chưa có commit nào."
          description="Mở trình soạn nhạc, thay đổi bản nhạc rồi tạo commit đầu tiên."
        />
      ) : commits.length > 0 ? (
        <RowList>
          <RowHeader cols={COLS}>
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
            const authorName =
              commit.author.display_name ?? commit.author.username ?? "Người dùng";
            return (
              <RowItem
                key={commit.id}
                cols={COLS}
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
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <span className="truncate text-[11px] text-muted">{authorName}</span>
                <span className="font-mono text-[11px] text-accent">
                  {commit.id.slice(0, 7)}
                </span>
                <RowTime>
                  {new Date(commit.created_at).toLocaleString("vi-VN", {
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
                      className="flex items-center gap-1.5"
                    >
                      <input
                        autoFocus
                        value={tagName}
                        onChange={(e) => setTagName(e.target.value)}
                        placeholder="Tên tag"
                        className={`${INPUT_CLASS} h-8 w-28 font-mono`}
                      />
                      <Button type="submit" disabled={tagBusy || !tagName.trim()}>
                        {tagBusy ? "Đang lưu…" : "Lưu"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setTaggingId(null);
                          setTagName("");
                        }}
                      >
                        Huỷ
                      </Button>
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
                        }}
                      >
                        <TagIcon className="h-3.5 w-3.5" /> Gắn tag
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
          <span className="px-2 font-mono text-[11px] text-muted">
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
        onConfirm={() => void handleRestore()}
        onCancel={() => setRestoreTarget(null)}
      />
    </>
  );
}
