"use client";

import type { CollaboratorItem, CollaboratorPermissionLevel } from "@stave/shared-types";
import { INPUT_CLASS } from "../ui/form";
import { useI18n } from "../../context/i18n-context";
import { tNow, type TKey } from "../../lib/i18n";

/** Khoá nhãn cho 2 mức quyền — dùng ở cả dialog lẫn trang lời mời. */
export const PERMISSION_KEYS: Record<CollaboratorPermissionLevel, TKey> = {
  view: "perm.view",
  edit: "perm.edit",
};

/** Tên hiển thị của một cộng tác viên (display_name → username → fallback). */
export function collaboratorDisplayName(
  item: Pick<CollaboratorItem, "user">,
): string {
  return (
    item.user.displayName?.trim() ||
    item.user.username?.trim() ||
    tNow("col.user")
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
  const { t } = useI18n();
  const levels: CollaboratorPermissionLevel[] = ["view", "edit"];
  return (
    <select
      name={name}
      value={value}
      disabled={disabled || busy}
      onChange={(e) => onChange(e.target.value as CollaboratorPermissionLevel)}
      aria-label={t("perm.label")}
      title={pending ? t("perm.pendingTitle") : t("perm.label")}
      className={`${INPUT_CLASS} w-32 py-1.5 sm:py-1 text-xs ${busy ? "opacity-50" : ""} ${className}`}
    >
      {levels.map((level) => (
        <option key={level} value={level}>
          {t(PERMISSION_KEYS[level])}
        </option>
      ))}
    </select>
  );
}
