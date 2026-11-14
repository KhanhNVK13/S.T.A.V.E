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
  size?: "default" | "hero";
}

/**
 * Breadcrumb được trình bày theo kiểu "eyebrow" (chữ hoa nhỏ, màu accent, phân
 * cách bằng "/") — cùng ngôn ngữ với các màn thiết kế: "MINA PARK / PUBLIC
 * PROJECT", "ACCOUNT SETTINGS"…
 */
export function PageHeader({ title, description, breadcrumbs, action, size = "default" }: PageHeaderProps) {
  const hero = size === "hero";
  const t = useT();
  const trail = breadcrumbs && breadcrumbs.length > 0 ? [{ label: t("ui.home"), href: "/" }, ...breadcrumbs] : null;
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-7">
      <div className="min-w-0">
        {trail && (
          <nav
            aria-label={t("ui.breadcrumb")}
            className="eyebrow flex flex-wrap items-center gap-1.5"
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
        <h1 className={hero ? "text-display mb-4 mt-3" : "text-title mb-1.5 mt-2"}>
          {title}
        </h1>
        {description && (
          <p
            className={
              hero
                ? "max-w-[56ch] text-lg font-light leading-snug text-muted sm:text-xl"
                : "max-w-[62ch] text-sm leading-relaxed text-muted"
            }
          >
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
    </div>
  );
}
