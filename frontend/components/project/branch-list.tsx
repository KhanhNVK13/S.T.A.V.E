"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GitBranch, GitMerge, History, Plus, Trash2 } from "lucide-react";
import {
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
  ConflictChoice,
  MergeConflictResult,
} from "../../lib/api-client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { INPUT_CLASS } from "../ui/form";
import { RowList, RowHeader, RowItem, RowTime } from "../ui/row-list";
import { Toast } from "../ui/toast";
import { formatRelativeTime } from "../../lib/format-date";
import { MergeConflictDialog } from "./merge-conflict-dialog";
import { apiErrorMessage } from "../../lib/error-message";

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
export function BranchList({ projectId }: { projectId: string }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [divergence, setDivergence] = useState<Record<string, BranchDivergence>>({});
  const [merged, setMerged] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [deletePreview, setDeletePreview] = useState<BranchDeletePreview | null>(null);
  const [deletePreviewState, setDeletePreviewState] = useState<"loading" | "ready" | "error">("loading");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [mergeSource, setMergeSource] = useState<Branch | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState<Branch | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
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
    } catch (err) {
      setError(apiErrorMessage(err, "Không tải được danh sách nhánh."));
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
    if (!name) return;
    setCreateBusy(true);
    try {
      await createBranch(projectId, { name });
      setNewName("");
      setCreating(false);
      setNotice(`Đã tạo nhánh "${name}".`);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Không tạo được nhánh."));
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
      setNotice(`Đã xoá nhánh "${deleteTarget.name}".`);
      setDeleteTarget(null);
      setDeletePreview(null);
      await load();
    } catch (err) {
      setDeleteError(apiErrorMessage(err, "Không xoá được nhánh."));
    } finally {
      setDeleteBusy(false);
    }
  }

  function openMergeConfirm(source: Branch) {
    setMergeError(null);
    setMergeConfirm(source);
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
        setNotice(`Đã hợp nhất "${source.name}" vào "${defaultBranch.name}".`);
        setMergeSource(null);
        await load();
      }
    } catch (err) {
      setMergeError(apiErrorMessage(err, "Không hợp nhất được nhánh."));
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
      setNotice(`Đã hợp nhất "${mergeSource.name}" sau khi xử lý xung đột.`);
      setConflicts(null);
      setMergeSource(null);
      await load();
    } catch (err) {
      setResolveError(apiErrorMessage(err, "Không hoàn tất được việc hợp nhất."));
    } finally {
      setMergeBusy(false);
    }
  }

  if (loading && branches.length === 0) {
    return (
      <RowList cols={COLS}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-[68px] animate-pulse items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0"
          >
            <div className="h-4 w-4 shrink-0 rounded bg-surface-subtle" />
            <div className="flex-1">
              <div className="mb-1.5 h-3 w-1/4 rounded bg-surface-subtle" />
              <div className="h-2.5 w-1/5 rounded bg-surface-subtle" />
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
        <div className="text-xs text-muted">
          <p>
            <span className="font-mono">{branches.length}</span> nhánh · mặc định{" "}
            <span className="font-mono text-foreground">{defaultBranch?.name ?? "—"}</span>
          </p>
          <p className="mt-1">
            Nhánh là bản làm thử song song: thử ý tưởng mới mà không ảnh hưởng nhánh mặc định,
            rồi hợp nhất khi hài lòng.
          </p>
        </div>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> Tạo nhánh
          </Button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="mb-3 flex flex-wrap items-end gap-2 rounded-card border border-border bg-surface p-4"
        >
          <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
            <span className="text-xs font-semibold">Tên nhánh mới</span>
            <input
              name="branchName"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={50}
              placeholder="vd: thu-phoi-bass"
              className={`${INPUT_CLASS} h-[37px] font-mono`}
            />
          </label>
          <p className="basis-full text-xs text-muted">
            Nhánh mới bắt đầu từ commit mới nhất của nhánh mặc định.
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={createBusy || !newName.trim()}>
              {createBusy ? "Đang tạo…" : "Tạo nhánh"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCreating(false);
                setNewName("");
              }}
            >
              Huỷ
            </Button>
          </div>
        </form>
      )}

      {error && (
        <div className="mb-3 rounded-card border border-danger/20 bg-danger-muted px-4 py-3">
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      <RowList cols={COLS}>
        <RowHeader>
          <span>Nhánh</span>
          <span>So với mặc định</span>
          <span>Người tạo</span>
          <span className="text-right">Tạo lúc</span>
          <span />
        </RowHeader>

        {branches.map((branch) => {
          const div = divergence[branch.id];
          const authorName =
            branch.author.display_name ?? branch.author.username ?? "Người dùng";
          return (
            <RowItem key={branch.id}>
              <div className="flex min-w-0 items-center gap-2.5">
                <GitBranch className="h-4 w-4 shrink-0 text-muted" />
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate font-mono text-[13px] font-semibold">
                    {branch.name}
                  </span>
                  {branch.is_default && <Badge variant="info">Mặc định</Badge>}
                  {/* UC-48: nhánh editor đang mở. Cũng là nhánh DUY NHẤT
                      không xoá được (backend chặn) — hiện ra để người dùng
                      hiểu vì sao nút xoá bị khoá. */}
                  {branch.is_active && <Badge variant="neutral">Đang mở</Badge>}
                  {merged[branch.id] && <Badge variant="success">Đã hợp nhất</Badge>}
                </div>
              </div>

              <span className="font-mono text-xs text-muted">
                {branch.is_default ? (
                  "—"
                ) : div ? (
                  <>
                    <span className="text-success-foreground">+{div.ahead}</span>{" "}
                    <span className="text-danger">-{div.behind}</span>
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
                  <Button variant="ghost" title="Xem lịch sử commit của nhánh này">
                    <History className="h-3.5 w-3.5" /> Lịch sử
                  </Button>
                </Link>
                {!branch.is_default && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => openMergeConfirm(branch)}
                      disabled={mergeBusy || !defaultBranch || div?.ahead === 0}
                      title={
                        div?.ahead === 0
                          ? `Nhánh mặc định đã có mọi commit của nhánh này`
                          : undefined
                      }
                    >
                      <GitMerge className="h-3.5 w-3.5" />
                      {mergeBusy && mergeSource?.id === branch.id
                        ? "Đang hợp nhất…"
                        : `Hợp nhất vào ${defaultBranch?.name ?? ""}`}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => void openDelete(branch)}
                      disabled={branch.is_active}
                      title={
                        branch.is_active
                          ? "Không xoá được nhánh đang mở trong editor — mở editor và chuyển sang nhánh khác trước"
                          : "Xoá nhánh"
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </RowItem>
          );
        })}
      </RowList>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Xoá nhánh "${deleteTarget?.name}"?`}
        message={
          deletePreviewState === "loading" ? (
            "Đang kiểm tra các commit chưa hợp nhất…"
          ) : deletePreviewState === "error" ? (
            <strong className="text-danger">
              Không kiểm tra được nhánh này còn commit chưa hợp nhất hay không. Xoá lúc này có
              thể làm mất commit.
            </strong>
          ) : deletePreview && deletePreview.unmergedCommitsCount > 0 ? (
            <>
              Nhánh này còn{" "}
              <strong className="text-danger">
                {deletePreview.unmergedCommitsCount} commit chưa được hợp nhất
              </strong>{" "}
              vào nhánh mặc định. Xoá nhánh đồng nghĩa mất những commit đó.
            </>
          ) : (
            "Mọi commit của nhánh này đã có ở nhánh mặc định, xoá nhánh sẽ không làm mất nội dung nào."
          )
        }
        confirmLabel="Xoá nhánh"
        danger
        loading={deleteBusy}
        confirmDisabled={deletePreviewState === "loading"}
        error={deleteError}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          setDeleteTarget(null);
          setDeletePreview(null);
        }}
      />

      <ConfirmDialog
        open={!!mergeConfirm}
        title={`Hợp nhất "${mergeConfirm?.name}" vào "${defaultBranch?.name ?? ""}"?`}
        message={
          <>
            {mergeConfirm && divergence[mergeConfirm.id]
              ? `${divergence[mergeConfirm.id].ahead} commit của nhánh "${mergeConfirm.name}" sẽ được đưa vào "${defaultBranch?.name ?? ""}".`
              : `Các commit của nhánh "${mergeConfirm?.name}" sẽ được đưa vào "${defaultBranch?.name ?? ""}".`}
            <br />
            Nếu cùng một nốt bị sửa khác nhau ở hai nhánh, bạn sẽ được chọn giữ bên nào trước khi
            hợp nhất.
          </>
        }
        confirmLabel="Hợp nhất"
        loading={mergeBusy}
        error={mergeError}
        onConfirm={() => mergeConfirm && void handleMerge(mergeConfirm)}
        onCancel={() => {
          setMergeConfirm(null);
          setMergeError(null);
        }}
      />

      {conflicts && mergeSource && defaultBranch && (
        <MergeConflictDialog
          result={conflicts}
          sourceName={mergeSource.name}
          targetName={defaultBranch.name}
          submitting={mergeBusy}
          error={resolveError}
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
