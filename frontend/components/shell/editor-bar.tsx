"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Bell, ChevronDown, LogOut, Settings } from "lucide-react";
import { useAuth } from "../../context/auth-context";
import { useT } from "../../context/i18n-context";
import { LanguageSwitch } from "../language-switch";
import { Avatar } from "../ui/avatar";
import { Logo } from "../ui/logo";
import { MainRegion } from "./main-region";
import { SETTINGS_HREF } from "./nav-items";
import { useSignOut } from "./use-sign-out";

const MENU_ITEM =
  "flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] text-foreground hover:bg-surface-subtle";

function AccountMenu() {
  const t = useT();
  const { user, profile, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { requestSignOut, signOutDialog } = useSignOut();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (loading) return <div aria-hidden="true" className="h-8 w-16 animate-pulse rounded-md bg-surface-subtle" />;
  if (!user) return null;
  const label = profile?.display_name ?? user.email?.split("@")[0] ?? "";

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="true"
          aria-label={t("shell.accountMenu")}
          className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1.5 hover:bg-surface-subtle"
        >
          <Avatar id={user.id} label={label} imageUrl={profile?.avatar_url} />
          <ChevronDown aria-hidden="true" className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-card border border-border-strong bg-surface py-1 shadow-card">
            <p className="truncate px-4 py-2 text-xs text-muted">{t("shell.signedInAs", { name: label })}</p>
            <Link href={SETTINGS_HREF} onClick={() => setOpen(false)} className={MENU_ITEM}>
              <Settings aria-hidden="true" className="h-4 w-4 text-muted" /> {t("shell.settings")}
            </Link>
            <Link href="/notifications" onClick={() => setOpen(false)} className={MENU_ITEM}>
              <Bell aria-hidden="true" className="h-4 w-4 text-muted" /> {t("nav.notifications")}
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                requestSignOut();
              }}
              className={`${MENU_ITEM} text-danger`}
            >
              <LogOut aria-hidden="true" className="h-4 w-4" /> {t("nav.signOut")}
            </button>
            <div className="mt-1 border-t border-border px-4 py-2 text-xs leading-snug text-muted">
              {t("shell.credits")}{" "}
              <a href="/instruments/CREDITS.txt" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                {t("footer.fullCredits")}
              </a>
            </div>
          </div>
        )}
      </div>
      {signOutDialog}
    </>
  );
}

export function EditorBar({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const projectId = pathname.split("/")[2] ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        aria-label={t("shell.editorBar")}
        className="relative z-40 flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface/95 px-3 backdrop-blur"
      >
        <Link
          href={`/projects/${projectId}`}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-muted hover:bg-surface-subtle hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          <span className="hidden sm:inline">{t("shell.backToProject")}</span>
          <span className="sr-only sm:hidden">{t("shell.backToProject")}</span>
        </Link>
        <span aria-hidden="true" className="h-5 w-px bg-border" />
        <Logo compact />
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitch />
          <AccountMenu />
        </div>
      </header>
      <MainRegion>{children}</MainRegion>
    </div>
  );
}
