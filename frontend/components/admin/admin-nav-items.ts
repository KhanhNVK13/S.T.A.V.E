import { Users, type LucideIcon } from "lucide-react";
import type { TKey } from "../../lib/i18n";

/**
 * Single source of truth for the admin sidebar (foundation, 25/10).
 *
 * Read by `frontend/app/admin/layout.tsx`. Other team members add their own
 * section to THIS array (Đức — Jam; Hải — giao dịch / gói / sự cố thanh
 * toán); do not re-declare the list anywhere else.
 *
 * `href` is matched with a prefix so `/admin/users/[id]/...` still highlights
 * the "Người dùng" item.
 */
export const ADMIN_NAV_ITEMS: {
  href: string;
  label: TKey;
  icon: LucideIcon;
}[] = [
  { href: "/admin/users", label: "adm.navUsers", icon: Users },
];
