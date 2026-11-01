"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { RequireAuth } from "../../components/require-auth";
import { useAuth } from "../../context/auth-context";
import { EmptyState } from "../../components/ui/empty-state";
import { ADMIN_NAV_ITEMS } from "../../components/admin/admin-nav-items";

/**
 * Khung trang quản trị (nền tảng 25/10): menu bên trái (đọc từ
 * ADMIN_NAV_ITEMS — Đức/Hải thêm mục vào đúng mảng này), nội dung bên phải.
 *
 * Người không phải admin vào /admin/* thấy EmptyState. Trang /admin/users
 * hiện tự bọc RequireAuth và tự kiểm vai trò — layout dùng CÙNG auth context
 * (không thêm network call), nên không gây nhấp nháy kép.
 */
function AdminSidebar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Trang quản trị"
      className="sticky top-0 flex max-h-screen w-[200px] shrink-0 flex-col gap-1 border-r border-border py-6 pr-4"
    >
      <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
        Quản trị
      </p>
      {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] font-medium transition-colors ${
              active
                ? "bg-surface-subtle text-accent"
                : "text-foreground hover:bg-surface-subtle"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const pathname = usePathname() ?? "";

  return (
    <RequireAuth>
      <div className="mx-auto flex max-w-page px-5 py-8">
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" /> Đang tải…
          </div>
        ) : profile?.role !== "admin" ? (
          <EmptyState
            icon={ShieldAlert}
            title="Chỉ quản trị viên mới xem được trang này"
            description="Tài khoản của bạn không có quyền truy cập khu vực quản trị."
          />
        ) : (
          <>
            <AdminSidebar pathname={pathname} />
            <div className="min-w-0 flex-1 py-2 pl-6">{children}</div>
          </>
        )}
      </div>
    </RequireAuth>
  );
}
