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
  setProjectVisibility,
  ApiError,
  ProjectVisibility,
} from "../../../../lib/api-client";
import { PageHeader } from "../../../../components/ui/page-header";
import { Card } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { INPUT_CLASS } from "../../../../components/ui/form";

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
  const [visibilitySuccess, setVisibilitySuccess] = useState<string | null>(null);
  const [settingVisibility, setSettingVisibility] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const data = (await getProject(projectId)) as Project;
        setProject(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  async function handleArchive() {
    setError(null);
    setArchiving(true);
    try {
      await archiveProject(projectId);
      router.push("/projects");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
      setArchiving(false);
    }
  }

  async function handleUnarchive() {
    setError(null);
    setUnarchiving(true);
    try {
      await unarchiveProject(projectId);
      router.push("/projects");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
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
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
      setDeleting(false);
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
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setSettingVisibility(false);
    }
  }

  const canDelete = deleteConfirmName === project?.name;

  return (
    <RequireAuth>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link
          href="/projects"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-accent-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Quay lại danh sách dự án
        </Link>
        <PageHeader title="Cài đặt dự án" description={project?.name} />

        {loading && <p className="text-center text-sm text-slate-500">Đang tải thông tin dự án...</p>}

        {error && !loading && (
          <div className="mb-4 rounded-card border border-danger-600/20 bg-danger-50 p-4 text-sm text-danger-600">
            {error}
          </div>
        )}

        {!loading && project && (
          <div className="flex flex-col gap-6">
            <Card className="p-6">
              <h2 className="mb-4 text-base font-semibold text-slate-900">Thông tin dự án</h2>
              <dl className="grid grid-cols-3 gap-y-3 text-sm">
                <dt className="text-slate-500">Tên:</dt>
                <dd className="col-span-2 font-medium text-slate-900">{project.name}</dd>
                <dt className="text-slate-500">Mô tả:</dt>
                <dd className="col-span-2 text-slate-700">{project.description || "Không có mô tả"}</dd>
                <dt className="text-slate-500">Thể loại:</dt>
                <dd className="col-span-2 text-slate-700">{project.genre || "Không có thể loại"}</dd>
                <dt className="text-slate-500">Trạng thái:</dt>
                <dd className="col-span-2">
                  {project.archived_at ? (
                    <Badge variant="warning">Đã lưu trữ</Badge>
                  ) : (
                    <Badge variant="success">Đang hoạt động</Badge>
                  )}
                </dd>
                <dt className="text-slate-500">Ngày tạo:</dt>
                <dd className="col-span-2 font-mono text-xs text-slate-700">
                  {new Date(project.created_at).toLocaleDateString("vi-VN")}
                </dd>
              </dl>
            </Card>

            <Card className="p-6">
              <h2 className="mb-1 text-base font-semibold text-slate-900">Hiển thị dự án</h2>
              <p className="mb-4 text-sm text-slate-500">Chọn ai có thể xem và truy cập dự án này.</p>

              {visibilitySuccess && (
                <div className="mb-4 rounded-card border border-success-600/20 bg-success-50 p-3 text-sm text-success-700">
                  {visibilitySuccess}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-card border border-slate-200 p-4 hover:bg-slate-50">
                  <input
                    type="radio"
                    name="visibility"
                    value="private"
                    checked={project.visibility === "private"}
                    onChange={() => void handleSetVisibility("private")}
                    disabled={settingVisibility}
                    className="mt-1 accent-accent-600"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-slate-400" />
                      <span className="font-medium text-slate-900">Riêng tư</span>
                      {project.visibility === "private" && <Badge variant="neutral">Hiện tại</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Chỉ chủ dự án và cộng tác viên được mời mới có quyền xem và chỉnh sửa.
                    </p>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-card border border-slate-200 p-4 hover:bg-slate-50">
                  <input
                    type="radio"
                    name="visibility"
                    value="public"
                    checked={project.visibility === "public"}
                    onChange={() => void handleSetVisibility("public")}
                    disabled={settingVisibility}
                    className="mt-1 accent-accent-600"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Globe2 className="h-4 w-4 text-slate-400" />
                      <span className="font-medium text-slate-900">Công khai</span>
                      {project.visibility === "public" && <Badge variant="info">Hiện tại</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Dự án xuất hiện trên trang Explore, cho phép cộng đồng nghe thử và xem chi
                      tiết.
                    </p>
                  </div>
                </label>
              </div>

              {settingVisibility && <p className="mt-3 text-sm text-slate-500">Đang cập nhật...</p>}
            </Card>

            <Card className="border-danger-600/20 p-6">
              <div className="mb-2 flex items-center gap-2">
                <TriangleAlert className="h-5 w-5 text-danger-600" />
                <h2 className="text-base font-semibold text-slate-900">Vùng nguy hiểm</h2>
              </div>
              <p className="mb-4 text-sm text-slate-500">
                Lưu trữ dự án sẽ ẩn dự án khỏi danh sách chính. Bạn vẫn có thể khôi phục dự án
                từ đây.
              </p>
              <div className="flex flex-wrap gap-2">
                {project.archived_at ? (
                  <Button
                    variant="secondary"
                    onClick={() => setShowUnarchiveConfirm(true)}
                    disabled={unarchiving}
                    className="gap-1.5 border-warning-600 text-warning-600 hover:bg-warning-50"
                  >
                    <Undo2 className="h-4 w-4" /> {unarchiving ? "Đang khôi phục..." : "Khôi phục dự án"}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => setShowArchiveConfirm(true)}
                    disabled={archiving}
                    className="gap-1.5 border-danger-600 text-danger-600 hover:bg-danger-50"
                  >
                    <Archive className="h-4 w-4" /> {archiving ? "Đang lưu trữ..." : "Lưu trữ dự án"}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDeleteConfirmName("");
                    setShowDeleteConfirm(true);
                  }}
                  className="gap-1.5 border-danger-600 text-danger-600 hover:bg-danger-50"
                >
                  <Trash2 className="h-4 w-4" /> Xóa dự án
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>

      {showUnarchiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="mb-4 text-lg font-semibold text-warning-700">Khôi phục dự án</h3>
            <p className="mb-6 text-sm text-slate-500">
              Dự án &quot;{project?.name}&quot; sẽ được khôi phục và hiển thị lại trong danh
              sách dự án chính.
            </p>
            {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}
            <div className="flex justify-end gap-3">
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
              <Button
                onClick={() => void handleUnarchive()}
                disabled={unarchiving}
                className="bg-warning-600 hover:bg-warning-700"
              >
                {unarchiving ? "Đang khôi phục..." : "Khôi phục"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showArchiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Xác nhận lưu trữ dự án</h3>
            <p className="mb-6 text-sm text-slate-500">
              Bạn có chắc chắn muốn lưu trữ dự án &quot;{project?.name}&quot;? Dự án sẽ được
              chuyển sang phần dự án đã lưu trữ và không còn xuất hiện trong danh sách chính.
            </p>
            {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}
            <div className="flex justify-end gap-3">
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
                {archiving ? "Đang xử lý..." : "Xác nhận lưu trữ"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="mb-4 text-lg font-semibold text-danger-600">Xóa dự án vĩnh viễn</h3>
            <p className="mb-4 text-sm text-slate-500">
              Hành động này không thể hoàn tác. Tất cả dữ liệu bao gồm lịch sử phiên bản, các
              bản nháp và thành viên của dự án &quot;{project?.name}&quot; sẽ bị xóa vĩnh viễn.
            </p>
            <label className="mb-4 flex flex-col gap-2 text-sm">
              <span className="font-medium text-slate-700">
                Để xác nhận, hãy nhập tên dự án:{" "}
                <span className="font-semibold text-slate-900">{project?.name}</span>
              </span>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={project?.name ?? ""}
                className={INPUT_CLASS}
              />
            </label>
            {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}
            <div className="flex justify-end gap-3">
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
                {deleting ? "Đang xóa..." : "Xóa vĩnh viễn"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </RequireAuth>
  );
}
