"use client";

import type { CollaboratorItem, CollaboratorPermissionLevel } from "@stave/shared-types";
import { INPUT_CLASS } from "../ui/form";

/** Nhãn tiếng Việt cho 2 mức quyền — dùng ở cả dialog lẫn trang lời mời. */
export const PERMISSION_LABELS: Record<CollaboratorPermissionLevel, string> = {
  view: "Xem",
  edit: "Chỉnh sửa",
};

/** Tên hiển thị của một cộng tác viên (display_name → username → fallback). */
export function collaboratorDisplayName(
  item: Pick<CollaboratorItem, "user">,
): string {
  return (
    item.user.displayName?.trim() ||
    item.user.username?.trim() ||
    "Người dùng"
  );
}

/**
 * Dropdown chọn mức quyền (view/edit). Người dùng `pending`: đổi mức quyền
 * *sẽ cấp* khi họ chấp nhận, không cấp quyền thật (BR-65) — vì vậy giữ
 * `title` cho rõ.
 */
export function CollaboratorPermissionSelect({
  name,
  value,
  onChange,
  disabled,
  busy,
  pending,
  className = "",
}: {
  name?: string;
  value: CollaboratorPermissionLevel;
  onChange: (level: CollaboratorPermissionLevel) => void;
  disabled?: boolean;
  busy?: boolean;
  /** Hiển thị gợi ý "sẽ cấp quyền" cho người đang chờ chấp nhận. */
  pending?: boolean;
  className?: string;
}) {
  const levels: CollaboratorPermissionLevel[] = ["view", "edit"];
  return (
    <select
      name={name}
      value={value}
      disabled={disabled || busy}
      onChange={(e) => onChange(e.target.value as CollaboratorPermissionLevel)}
      aria-label="Quyền"
      title={pending ? "Quyền sẽ được cấp khi người này chấp nhận lời mời" : "Quyền"}
      className={`${INPUT_CLASS} w-32 py-1.5 sm:py-1 text-xs ${busy ? "opacity-50" : ""} ${className}`}
    >
      {levels.map((level) => (
        <option key={level} value={level}>
          {PERMISSION_LABELS[level]}
        </option>
      ))}
    </select>
  );
}
