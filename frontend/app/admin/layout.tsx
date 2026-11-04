"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import { RequireAuth } from "../../components/require-auth";
import { useAuth } from "../../context/auth-context";
import { EmptyState } from "../../components/ui/empty-state";
import { useI18n } from "../../context/i18n-context";

/**
 * Khung trang quản trị: kiểm đăng nhập và vai trò ở client (quyền thật do
 * backend AdminGuard đảm bảo). Điều hướng giữa các trang admin nằm ở thanh bên
 * của AppShell (ADMIN_NAV trong components/shell/nav-items.ts).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const { profile, loading } = useAuth();

  return (
    <RequireAuth>
      <div className="mx-auto max-w-page px-5 py-8">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent" /> {t("ui.loading")}
          </div>
        ) : profile?.role !== "admin" ? (
          <>
            <h1 className="sr-only">{t("adm.navTitle")}</h1>
            <EmptyState
              icon={ShieldAlert}
              title={t("adm.onlyAdmin")}
              description={t("adm.noAccess")}
            />
          </>
        ) : (
          <div className="min-w-0">{children}</div>
        )}
      </div>
    </RequireAuth>
  );
}
