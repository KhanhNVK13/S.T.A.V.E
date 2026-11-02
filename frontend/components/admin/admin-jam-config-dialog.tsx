"use client";

import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, Loader2, Lock, Trash2 } from "lucide-react";
import type {
  AvailableJamProjectDto,
  ConfigureJamEventDto,
  JamEvent,
} from "@stave/shared-types";
import { Dialog, DialogActions } from "../ui/dialog";
import { Button } from "../ui/button";
import { FieldError, INPUT_CLASS } from "../ui/form";
import { adminCancelJamEvent, adminConfigureJamEvent } from "../../lib/api-jam";
import { apiErrorMessage } from "../../lib/error-message";

export interface AdminJamConfigDialogProps {
  event: JamEvent;
  projects: AvailableJamProjectDto[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onCancelled?: (message: string) => void;
}

/** `datetime-local` input (local time) → ISO string formatting helper */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function AdminJamConfigDialog({
  event,
  projects,
  onClose,
  onSaved,
  onCancelled,
}: AdminJamConfigDialogProps) {
  const isActive = event.status === "active";
  const isScheduled = event.status === "scheduled";
  const isEndedOrCancelled =
    event.status === "ended" || event.status === "cancelled";

  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description ?? "");
  const [startAt, setStartAt] = useState(toLocalInput(event.scheduled_start_at));
  const [endAt, setEndAt] = useState(toLocalInput(event.scheduled_end_at));
  const [startingProjectId, setStartingProjectId] = useState(
    event.starting_project_id ?? "",
  );
  const [cooldown, setCooldown] = useState<string>(
    event.edit_cooldown_sec == null ? "" : String(event.edit_cooldown_sec),
  );

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const selectedProjectName = useMemo(() => {
    if (!startingProjectId) return "Không chọn (bắt đầu trống)";
    const found = projects.find((p) => p.id === startingProjectId);
    return found ? found.name : startingProjectId.slice(0, 8);
  }, [startingProjectId, projects]);

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!isActive && !name.trim()) {
      nextErrors.name = "Tên sự kiện không được để trống.";
    }

    if (endAt) {
      const endMs = new Date(endAt).getTime();
      if (Number.isNaN(endMs)) {
        nextErrors.end = "Thời gian kết thúc không hợp lệ.";
      } else if (endMs <= Date.now()) {
        nextErrors.end =
          "Thời gian kết thúc không hợp lệ. Thời gian phải lớn hơn thời điểm hiện tại và thời gian bắt đầu.";
      } else if (!isActive && startAt) {
        const startMs = new Date(startAt).getTime();
        if (!Number.isNaN(startMs) && endMs <= startMs) {
          nextErrors.end =
            "Thời gian kết thúc không hợp lệ. Thời gian phải lớn hơn thời điểm hiện tại và thời gian bắt đầu.";
        }
      }
    } else {
      nextErrors.end = "Vui lòng chọn thời gian kết thúc.";
    }

    if (!isActive && startAt) {
      const startMs = new Date(startAt).getTime();
      if (Number.isNaN(startMs)) {
        nextErrors.start = "Thời gian bắt đầu không hợp lệ.";
      }
    }

    if (cooldown !== "") {
      const c = Number(cooldown);
      if (!Number.isInteger(c) || c < 1 || c > 3600) {
        nextErrors.cooldown =
          "Thời gian chờ cooldown không hợp lệ. Giá trị phải từ 1 đến 3600 giây.";
      }
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  async function handleSave() {
    setError(null);
    if (!validate()) return;

    const patch: ConfigureJamEventDto = {};
    if (isActive) {
      // 2.E1 — when active: only extend end time and edit cooldown
      if (endAt) patch.scheduledEndAt = new Date(endAt).toISOString();
      if (cooldown !== "") patch.editCooldownSec = Number(cooldown);
    } else {
      patch.name = name.trim();
      patch.description = description.trim() || undefined;
      if (startAt) patch.scheduledStartAt = new Date(startAt).toISOString();
      if (endAt) patch.scheduledEndAt = new Date(endAt).toISOString();
      patch.startingProjectId = startingProjectId || undefined;
      if (cooldown !== "") patch.editCooldownSec = Number(cooldown);
    }

    setSubmitting(true);
    try {
      await adminConfigureJamEvent(event.id, patch);
      onSaved("Cập nhật cấu hình sự kiện Jam thành công.");
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Không lưu được cấu hình sự kiện."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelEvent() {
    setError(null);
    setCancelling(true);
    try {
      await adminCancelJamEvent(event.id);
      onCancelled?.(
        `Đã hủy sự kiện “${event.name}”. Hệ thống đã gửi thông báo đến người tham gia.`,
      );
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Không hủy được sự kiện Jam."));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Dialog
      title={
        <div className="flex items-center justify-between gap-3 pr-6">
          <div className="flex items-center gap-2">
            <span>Cấu hình sự kiện Community Jam</span>
          </div>
          <span className="truncate text-xs font-normal text-muted">
            {event.name}
          </span>
        </div>
      }
      titleClassName="text-foreground text-base"
      onClose={onClose}
      closeDisabled={submitting || cancelling}
      className="max-w-xl p-6"
    >
      {isEndedOrCancelled ? (
        <div className="rounded-card border border-border bg-surface-subtle p-4 text-sm text-muted">
          <p className="font-medium text-foreground">
            Sự kiện đã kết thúc, không thể thay đổi cấu hình.
          </p>
          <p className="mt-1 text-xs">
            Trạng thái hiện tại:{" "}
            <strong>
              {event.status === "ended" ? "Đã kết thúc" : "Đã hủy"}
            </strong>
            . Bạn có thể xem lại kết quả đóng góp hoặc tạo một sự kiện mới.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Warning banner for active event */}
          {isActive && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-card border border-warning/30 bg-warning-muted/40 p-3 text-xs text-foreground"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p className="font-semibold text-warning">
                  Sự kiện đang diễn ra
                </p>
                <p className="mt-0.5 text-muted">
                  Sự kiện đang diễn ra. Tên sự kiện và dự án khởi đầu đã được
                  khóa và không thể thay đổi. Bạn chỉ có thể kéo dài thời gian
                  kết thúc hoặc điều chỉnh thời gian chờ cooldown.
                </p>
              </div>
            </div>
          )}

          {/* Form fields */}
          <div className="space-y-3.5">
            {/* Tên sự kiện */}
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="flex items-center justify-between font-medium">
                <span>Tên sự kiện</span>
                {isActive && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Lock className="h-3 w-3" /> Đã khóa
                  </span>
                )}
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                disabled={isActive}
                placeholder="Nhập tên sự kiện Jam..."
                className={`${INPUT_CLASS} w-full ${
                  isActive ? "cursor-not-allowed opacity-60 bg-surface-subtle" : ""
                }`}
              />
              {fieldErrors.name && <FieldError>{fieldErrors.name}</FieldError>}
            </label>

            {/* Mô tả (tuỳ chọn) */}
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="flex items-center justify-between font-medium">
                <span>Mô tả sự kiện</span>
                {isActive && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Lock className="h-3 w-3" /> Đã khóa
                  </span>
                )}
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={2000}
                disabled={isActive}
                placeholder="Mô tả chủ đề, phong cách âm nhạc hoặc gợi ý cho người tham gia..."
                className={`${INPUT_CLASS} w-full resize-y ${
                  isActive ? "cursor-not-allowed opacity-60 bg-surface-subtle" : ""
                }`}
              />
            </label>

            {/* Khung giờ: Bắt đầu & Kết thúc */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-[13px]">
                <span className="flex items-center justify-between font-medium">
                  <span>Thời gian bắt đầu</span>
                  {isActive && (
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <Lock className="h-3 w-3" /> Đã bắt đầu
                    </span>
                  )}
                </span>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  disabled={isActive}
                  className={`${INPUT_CLASS} w-full ${
                    isActive ? "cursor-not-allowed opacity-60 bg-surface-subtle" : ""
                  }`}
                />
                {fieldErrors.start && (
                  <FieldError>{fieldErrors.start}</FieldError>
                )}
              </label>

              <label className="flex flex-col gap-1.5 text-[13px]">
                <span className="flex items-center justify-between font-medium">
                  <span>
                    {isActive ? "Kéo dài thời gian kết thúc" : "Thời gian kết thúc"}
                  </span>
                  <span className="text-xs text-accent">Mở khóa</span>
                </span>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className={`${INPUT_CLASS} w-full`}
                />
                {fieldErrors.end && <FieldError>{fieldErrors.end}</FieldError>}
              </label>
            </div>

            {/* Dự án khởi đầu */}
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="flex items-center justify-between font-medium">
                <span>Dự án khởi đầu</span>
                {isActive && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Lock className="h-3 w-3" /> Đã khóa
                  </span>
                )}
              </span>
              <select
                value={startingProjectId}
                onChange={(e) => setStartingProjectId(e.target.value)}
                disabled={isActive}
                className={`${INPUT_CLASS} w-full ${
                  isActive ? "cursor-not-allowed opacity-60 bg-surface-subtle" : ""
                }`}
              >
                <option value="">— Bắt đầu từ dự án trống —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">
                Dự án mẫu công khai được sao chép khi sự kiện mở màn. Đang chọn:{" "}
                <strong>{selectedProjectName}</strong>
              </span>
            </label>

            {/* Cooldown */}
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="flex items-center justify-between font-medium">
                <span>Thời gian chờ mỗi lượt sửa (giây)</span>
                <span className="text-xs text-accent">Mở khóa</span>
              </span>
              <input
                type="number"
                min={1}
                max={3600}
                value={cooldown}
                onChange={(e) => setCooldown(e.target.value)}
                placeholder="5"
                className={`${INPUT_CLASS} w-full`}
              />
              {fieldErrors.cooldown && (
                <FieldError>{fieldErrors.cooldown}</FieldError>
              )}
              <span className="text-xs text-muted">
                Giá trị hợp lệ: từ 1 đến 3600 giây (mặc định 5s). Áp dụng tức thì
                cho các lượt sửa tiếp theo.
              </span>
            </label>
          </div>

          {/* Confirm Cancel Danger Section for Scheduled Events */}
          {isScheduled && (
            <div className="mt-4 rounded-card border border-danger/30 bg-danger-muted/30 p-3.5">
              {!confirmCancel ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-muted">
                    <p className="font-semibold text-danger">Hủy sự kiện Jam</p>
                    <p>Sự kiện chưa bắt đầu có thể hủy bỏ và thông báo người đăng ký.</p>
                  </div>
                  <Button
                    type="button"
                    variant="danger"
                    className="h-7 px-2 text-xs"
                    onClick={() => setConfirmCancel(true)}
                    disabled={submitting || cancelling}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Hủy sự kiện này
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <p className="font-semibold text-danger">
                    Xác nhận hủy sự kiện “{event.name}”?
                  </p>
                  <p className="text-muted">
                    Sự kiện sẽ chuyển sang trạng thái <strong>Đã hủy</strong>. Mọi
                    người dùng đã đăng ký sẽ nhận được thông báo in-app. Thao tác
                    này được lưu vào nhật ký kiểm toán.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="danger"
                      className="h-7 px-2 text-xs"
                      onClick={() => void handleCancelEvent()}
                      disabled={cancelling}
                    >
                      {cancelling ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Đang hủy...
                        </>
                      ) : (
                        "Chắc chắn hủy"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-7 px-2 text-xs"
                      onClick={() => setConfirmCancel(false)}
                      disabled={cancelling}
                    >
                      Không, giữ lại
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error banner role="alert" */}
      {error && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-2 rounded-card border border-danger/30 bg-danger-muted p-3 text-xs text-danger"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="h-7 px-2 text-xs"
            onClick={() => void handleSave()}
            disabled={submitting}
          >
            Thử lại
          </Button>
        </div>
      )}

      {/* Dialog actions */}
      <div className="mt-6">
        <DialogActions>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitting || cancelling}
          >
            Đóng
          </Button>
          {!isEndedOrCancelled && (
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleSave()}
              disabled={submitting || cancelling}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                "Lưu thay đổi"
              )}
            </Button>
          )}
        </DialogActions>
      </div>
    </Dialog>
  );
}
