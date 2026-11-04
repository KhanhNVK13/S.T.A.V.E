"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { useT } from "../../context/i18n-context";
import { LanguageSwitch } from "../language-switch";
import { isLandingPath } from "../landing/landing-paths";
import { SiteFooter } from "../site-footer";
import { Logo } from "../ui/logo";
import { MainRegion } from "./main-region";
import { AUTH_PATH_RE, PUBLIC_NAV, isActivePath } from "./nav-items";

interface PublicShellProps {
  children: ReactNode;
  /** Khung trung tính lúc chưa biết trạng thái đăng nhập: chỉ logo + ngôn ngữ. */
  minimal?: boolean;
}

export function PublicShell({ children, minimal = false }: PublicShellProps) {
  const t = useT();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const landing = isLandingPath(pathname);
  const authPath = AUTH_PATH_RE.test(pathname);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const linkClass = (href: string) =>
    `flex h-8 items-center rounded-md px-3 text-[13px] font-semibold transition-colors ${
      isActivePath(pathname, href)
        ? "bg-surface-muted text-foreground"
        : "text-muted hover:bg-surface-subtle hover:text-foreground"
    }`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className={`relative z-40 shrink-0 border-b ${
          landing ? "border-transparent bg-transparent" : "border-border bg-surface/90 backdrop-blur"
        }`}
      >
        <div className="mx-auto flex h-14 max-w-page items-center gap-5 px-5">
          <Logo />

          {!minimal && (
            <nav aria-label={t("shell.siteNav")} className="hidden items-center gap-0.5 md:flex">
              {PUBLIC_NAV.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
                  className={linkClass(item.href)}
                >
                  {t(item.label)}
                </Link>
              ))}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            {!authPath && <LanguageSwitch />}
            {!minimal && (
              <>
                <Link
                  href="/login"
                  className="flex h-8 items-center whitespace-nowrap rounded-md px-3 text-[13px] font-semibold text-muted hover:bg-surface-subtle hover:text-foreground"
                >
                  {t("nav.signIn")}
                </Link>
                <Link
                  href="/register"
                  aria-label={t("nav.startFree")}
                  className="flex h-8 items-center whitespace-nowrap rounded-md border border-accent bg-accent px-3 text-[13px] font-semibold text-accent-foreground hover:border-accent-hover hover:bg-accent-hover"
                >
                  <span aria-hidden="true" className="sm:hidden">{t("nav.start")}</span>
                  <span aria-hidden="true" className="hidden sm:inline">{t("nav.startFree")}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-expanded={menuOpen}
                  aria-controls="public-menu"
                  aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-subtle md:hidden"
                >
                  {menuOpen ? <X aria-hidden="true" className="h-[18px] w-[18px]" /> : <Menu aria-hidden="true" className="h-[18px] w-[18px]" />}
                </button>
              </>
            )}
          </div>
        </div>

        {!minimal && menuOpen && (
          <nav
            id="public-menu"
            aria-label={t("shell.siteNav")}
            className="absolute inset-x-0 top-full flex flex-col gap-1 border-b border-border bg-surface p-2 md:hidden"
          >
            {PUBLIC_NAV.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
                className={linkClass(item.href)}
              >
                {t(item.label)}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <MainRegion>{children}</MainRegion>
      <SiteFooter />
    </div>
  );
}
