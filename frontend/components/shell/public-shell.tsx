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
    `flex h-9 items-center border-b-2 px-0.5 text-sm font-medium transition-colors ${
      isActivePath(pathname, href)
        ? "border-accent text-foreground"
        : "border-transparent text-muted hover:border-border-strong hover:text-foreground"
    }`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className={`relative z-40 shrink-0 border-b ${
          landing ? "border-transparent bg-transparent" : "border-border/70 bg-background/70 backdrop-blur"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-page items-center gap-3 px-4 sm:gap-7 sm:px-6">
          <Logo />

          {!minimal && (
            <nav aria-label={t("shell.siteNav")} className="hidden items-center gap-6 md:flex">
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
            {!authPath && <LanguageSwitch className={minimal ? "" : "max-sm:hidden"} />}
            {!minimal && (
              <>
                <Link
                  href="/login"
                  className="flex h-9 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/10"
                >
                  {t("nav.signIn")}
                </Link>
                <Link
                  href="/register"
                  aria-label={t("nav.startFree")}
                  className={`flex h-9 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors ${
                    landing
                      ? "border border-foreground text-foreground hover:bg-foreground/10"
                      : "bg-accent text-accent-foreground hover:bg-accent-hover"
                  }`}
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
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-foreground/10 md:hidden"
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
            className="absolute inset-x-0 top-full flex flex-col gap-1 border-b border-border bg-background p-3 md:hidden"
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
            {!authPath && <LanguageSwitch className="mx-3 my-1 w-max sm:hidden" />}
          </nav>
        )}
      </header>

      <MainRegion>
        {landing ? (
          children
        ) : (
          <div className="flex min-h-full flex-col">
            <div className="grid flex-1 grid-cols-[minmax(0,1fr)]">{children}</div>
            <SiteFooter />
          </div>
        )}
      </MainRegion>
    </div>
  );
}
