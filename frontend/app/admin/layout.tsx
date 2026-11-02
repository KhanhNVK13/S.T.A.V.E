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
 * Người không phải admin vào /admin/* thấy EmptyState. Layout là nơi duy nhất
 * kiểm đăng nhập và vai trò ở client (quyền thật do backend AdminGuard đảm bảo).
 */
function AdminSidebar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Trang quản trị"
      className="flex shrink-0 flex-col gap-1 border-b border-border pb-3 md:sticky md:top-0 md:w-[200px] md:border-b-0 md:border-r md:py-6 md:pr-4"
    >
      <p className="mb-2 px-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">
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
      <div className="mx-auto flex max-w-page flex-col px-5 py-8 md:flex-row">
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
            <div className="min-w-0 flex-1 py-4 md:py-2 md:pl-6">{children}</div>
          </>
        )}
      </div>
    </RequireAuth>
  );
}
