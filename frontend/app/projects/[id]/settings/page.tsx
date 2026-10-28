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
import { APP_LOCALE } from "../../../../lib/format-date";
import {validateRequired, validateMaxLength, focusFirstInvalid } from "../../../../lib/validation";

const NAME_MAX = 100;
const NAME_REQUIRED = "Vui lòng nhập tên dự án.";

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
      validateRequired(name, NAME_REQUIRED) ?? validateMaxLength(name, NAME_MAX, "Tên dự án");
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
      setSaveError(apiErrorMessage(err, "Không lưu được thông tin dự án."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-base font-semibold text-foreground">Thông tin dự án</h2>
      {isArchived && (
        <p className="mb-4 flex items-start gap-2 text-sm text-muted">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          Dự án đã lưu trữ nên chỉ xem được. Khôi phục dự án ở cuối trang để chỉnh sửa lại.
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Tên dự án *" error={nameError}>
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
        <Field label="Mô tả">
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
            placeholder="Mô tả ngắn về dự án của bạn"
          />
        </Field>
        <Field label="Thể loại">
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
            placeholder="Ví dụ: Lo-Fi, Jazz,…"
          />
        </Field>
        <dl className="grid grid-cols-3 gap-y-2 text-sm">
          <dt className="text-muted">Trạng thái</dt>
          <dd className="col-span-2">
            {isArchived ? (
              <Badge variant="warning">Đã lưu trữ</Badge>
            ) : (
              <Badge variant="success">Đang hoạt động</Badge>
            )}
          </dd>
          <dt className="text-muted">Ngày tạo</dt>
          <dd className="col-span-2 font-mono text-xs text-foreground">
            {new Date(project.created_at).toLocaleDateString(APP_LOCALE)}
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
              {saving ? "Đang lưu…" : "Lưu thay đổi"}
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
              Huỷ thay đổi
            </Button>
            {saved && (
              <span role="status" className="text-sm text-success-foreground">
                Đã lưu.
              </span>
            )}
          </div>
        )}
      </form>
    </Card>
  );
}

export default function ProjectSettingsPage() {
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
        setError(apiErrorMessage(err, "Không tải được thông tin dự án."));
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
      setError(apiErrorMessage(err, "Không lưu trữ được dự án."));
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
      setError(apiErrorMessage(err, "Không khôi phục được dự án."));
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
      setError(apiErrorMessage(err, "Không xoá được dự án."));
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
      setError("Không sao chép được liên kết. Hãy chọn và sao chép thủ công.");
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
          ? "Dự án đã được đặt thành công khai."
          : "Dự án đã được đặt thành riêng tư.";
      setVisibilitySuccess(msg);
      // Auto-dismiss success banner after 4 seconds
      setTimeout(() => setVisibilitySuccess(null), 4000);
    } catch (err) {
      setError(apiErrorMessage(err, "Không đổi được chế độ hiển thị."));
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
          <ArrowLeft className="h-3.5 w-3.5" /> Quay lại danh sách dự án
        </Link>
        <PageHeader title="Cài đặt dự án" description={project?.name} />

        {loading && <p className="text-center text-sm text-muted">Đang tải thông tin dự án…</p>}

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
                Thử lại
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
                ? "Đã lưu trữ dự án. Bạn có thể khôi phục bất cứ lúc nào."
                : "Đã khôi phục dự án."}
            </span>
            {archiveNotice === "archived" && (
              <Button
                variant="secondary"
                onClick={() => void handleUnarchive()}
                disabled={unarchiving}
              >
                {unarchiving ? "Đang hoàn tác…" : "Hoàn tác"}
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
              <h2 className="mb-1 text-base font-semibold text-foreground">Hiển thị dự án</h2>
              <p className="mb-4 text-sm text-muted">Chọn ai có thể xem và truy cập dự án này.</p>

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
                      <span className="font-medium text-foreground">Riêng tư</span>
                      {project.visibility === "private" && <Badge variant="neutral">Hiện tại</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      Chỉ chủ dự án và cộng tác viên được mời mới có quyền xem và chỉnh sửa.
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
                      <span className="font-medium text-foreground">Công khai</span>
                      {project.visibility === "public" && <Badge variant="info">Hiện tại</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      Dự án xuất hiện trên trang Explore, cho phép cộng đồng nghe thử và xem chi
                      tiết.
                    </p>
                  </div>
                </label>
              </div>

              {settingVisibility && <p className="mt-3 text-sm text-muted">Đang cập nhật…</p>}

              {project.visibility === "public" && (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface-subtle p-3">
                  <span className="text-xs text-muted">Liên kết chia sẻ:</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                    {typeof window !== "undefined" ? window.location.origin : ""}/projects/{project.id}
                  </span>
                  <Button variant="secondary" onClick={() => void copyShareLink()}>
                    {linkCopied ? "Đã sao chép" : "Sao chép liên kết"}
                  </Button>
                </div>
              )}
            </Card>

            <Card className="border-danger/20 p-6">
              <div className="mb-2 flex items-center gap-2">
                <TriangleAlert className="h-5 w-5 text-danger" />
                <h2 className="text-base font-semibold text-foreground">Vùng nguy hiểm</h2>
              </div>
              <p className="mb-4 text-sm text-muted">
                Lưu trữ dự án sẽ ẩn dự án khỏi danh sách chính. Bạn vẫn có thể khôi phục dự án
                từ đây.
              </p>
              <div className="flex flex-wrap gap-2">
                {project.archived_at ? (
                  <Button
                    variant="secondary"
                    onClick={() => setShowUnarchiveConfirm(true)}
                    disabled={unarchiving}
                    className="gap-1.5 border-warning text-warning-foreground hover:bg-warning-muted"
                  >
                    <Undo2 className="h-4 w-4" /> {unarchiving ? "Đang khôi phục…" : "Khôi phục dự án"}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => setShowArchiveConfirm(true)}
                    disabled={archiving}
                    className="gap-1.5 border-danger text-danger hover:bg-danger-muted"
                  >
                    <Archive className="h-4 w-4" /> {archiving ? "Đang lưu trữ…" : "Lưu trữ dự án"}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => void openDeleteDialog()}
                  className="gap-1.5 border-danger text-danger hover:bg-danger-muted"
                >
                  <Trash2 className="h-4 w-4" /> Xóa dự án
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>

      <Dialog
        open={showUnarchiveConfirm}
        title="Khôi phục dự án"
        onClose={() => {
          setShowUnarchiveConfirm(false);
          setError(null);
        }}
        closeDisabled={unarchiving}
      >
        <p className="mb-6 text-sm text-muted">
          Dự án &quot;{project?.name}&quot; sẽ được khôi phục và hiển thị lại trong danh sách dự
          án chính.
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
            Huỷ
          </Button>
          <Button onClick={() => void handleUnarchive()} disabled={unarchiving}>
            {unarchiving ? "Đang khôi phục…" : "Khôi phục"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showArchiveConfirm}
        title="Xác nhận lưu trữ dự án"
        onClose={() => {
          setShowArchiveConfirm(false);
          setError(null);
        }}
        closeDisabled={archiving}
        role="alertdialog"
      >
        <p className="mb-6 text-sm text-muted">
          Bạn có chắc chắn muốn lưu trữ dự án &quot;{project?.name}&quot;? Dự án sẽ được chuyển
          sang phần dự án đã lưu trữ và không còn xuất hiện trong danh sách chính. Bạn có thể khôi
          phục dự án bất cứ lúc nào, và hoàn tác ngay sau khi lưu trữ.
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
            Huỷ
          </Button>
          <Button variant="danger" onClick={() => void handleArchive()} disabled={archiving}>
            {archiving ? "Đang xử lý…" : "Xác nhận lưu trữ"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showDeleteConfirm}
        title="Xóa dự án vĩnh viễn"
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
          Hành động này không thể hoàn tác. Tất cả dữ liệu bao gồm lịch sử phiên bản, các bản
          nháp và thành viên của dự án &quot;{project?.name}&quot; sẽ bị xóa vĩnh viễn.
        </p>
        <p className="mb-4 rounded-card border border-border bg-surface-subtle px-3 py-2 text-sm text-foreground">
          {deletePreview === null
            ? "Đang đếm commit và nhánh…"
            : deletePreview === "error"
              ? "Không đếm được số commit và nhánh sẽ mất."
              : `Sẽ mất ${deletePreview.commitCount.toLocaleString(APP_LOCALE)} commit và ${deletePreview.branchCount.toLocaleString(APP_LOCALE)} nhánh.`}
        </p>
        {!project?.archived_at && (
          <p className="mb-4 text-sm text-muted">
            Chưa chắc chắn?{" "}
            <button
              type="button"
              className="text-accent hover:underline"
              onClick={() => {
                setShowDeleteConfirm(false);
                setShowArchiveConfirm(true);
              }}
            >
              Lưu trữ dự án thay vì xoá
            </button>{" "}
            để giữ lại toàn bộ lịch sử và khôi phục sau.
          </p>
        )}
        <label className="mb-4 flex flex-col gap-2 text-sm">
          <span className="font-medium text-foreground">
            Để xác nhận, hãy nhập tên dự án:{" "}
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
            Huỷ
          </Button>
          <Button variant="danger" onClick={() => void handleDelete()} disabled={!canDelete || deleting}>
            {deleting ? "Đang xóa…" : "Xóa vĩnh viễn"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!pendingVisibility}
        title={
          pendingVisibility === "public" ? "Công khai dự án?" : "Chuyển dự án về riêng tư?"
        }
        message={
          pendingVisibility === "public"
            ? "Dự án sẽ xuất hiện trên trang Explore. Mọi người có thể xem, nghe thử và fork dự án này. Bạn có thể chuyển về riêng tư bất cứ lúc nào."
            : "Dự án sẽ biến mất khỏi Explore. Chỉ bạn và cộng tác viên được mời xem được."
        }
        confirmLabel={pendingVisibility === "public" ? "Công khai" : "Chuyển về riêng tư"}
        loading={settingVisibility}
        onConfirm={() => pendingVisibility && void handleSetVisibility(pendingVisibility)}
        onCancel={() => setPendingVisibility(null)}
      />
    </RequireAuth>
  );
}
