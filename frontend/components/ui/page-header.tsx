"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useT } from "../../context/i18n-context";

interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  action?: ReactNode;
}

/**
 * Breadcrumb được trình bày theo kiểu "eyebrow" (chữ hoa nhỏ, màu accent, phân
 * cách bằng "/") — cùng ngôn ngữ với các màn thiết kế: "MINA PARK / PUBLIC
 * PROJECT", "ACCOUNT SETTINGS"…
 */
export function PageHeader({ title, description, breadcrumbs, action }: PageHeaderProps) {
  const t = useT();
  const trail = breadcrumbs && breadcrumbs.length > 0 ? [{ label: t("ui.home"), href: "/" }, ...breadcrumbs] : null;
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-7">
      <div className="min-w-0">
        {trail && (
          <nav
            aria-label={t("ui.breadcrumb")}
            className="flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-accent"
          >
            {trail.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-muted">/</span>}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="mb-1 mt-0.5 text-[26px] font-semibold leading-tight tracking-tight">
          {title}
        </h1>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
    </div>
  );
}
