"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { LogOut, Menu, Plus, Search, Settings, X } from "lucide-react";
import { useAuth } from "../../context/auth-context";
import { useT } from "../../context/i18n-context";
import type { TKey } from "../../lib/i18n";
import { usePendingInvitationCount } from "../../lib/use-pending-invitation-count";
import { isDialogOpen, useDialog } from "../../lib/use-dialog";
import { LanguageSwitch } from "../language-switch";
import { useUnreadNotificationCount } from "../notification-bell";
import { Avatar } from "../ui/avatar";
import { Logo } from "../ui/logo";
import { MainRegion } from "./main-region";
import {
  ADMIN_NAV,
  APP_NAV,
  NEW_PROJECT_HREF,
  SETTINGS_HREF,
  isActivePath,
  type ShellNavItem,
} from "./nav-items";
import { QuickFind } from "./quick-find";
import { useSessionReady } from "../../lib/use-session-ready";
import { useRecentProjects } from "./use-recent-projects";
import { useSignOut } from "./use-sign-out";

const NARROW_QUERY = "(max-width: 899.98px)";

function useNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(NARROW_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}

const ROW =
  "relative flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors";

function rowClass(active: boolean) {
  return `${ROW} ${
    active
      ? "bg-foreground/[0.13] font-medium text-foreground"
      : "text-muted hover:bg-foreground/[0.07] hover:text-foreground"
  }`;
}

function NavLink({
  item,
  pathname,
  count,
  countLabel = "nav.notificationsUnread",
}: {
  item: ShellNavItem;
  pathname: string;
  count?: number;
  countLabel?: TKey;
}) {
  const t = useT();
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;
  const showCount = typeof count === "number" && count > 0;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={showCount ? t(countLabel, { n: count }) : undefined}
      className={rowClass(active)}
    >
      <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${active ? "text-accent" : ""}`} />
      <span className="truncate">{t(item.label)}</span>
      {showCount && (
        <span
          aria-hidden="true"
          className="ml-auto min-w-[20px] rounded-full bg-accent px-1.5 text-center text-xs font-semibold leading-5 tabular-nums text-accent-foreground"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 mt-6 px-2.5 text-xs text-muted">{children}</p>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const narrow = useNarrow();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const sessionReady = useSessionReady();
  const unread = useUnreadNotificationCount(sessionReady);
  const pendingInvitations = usePendingInvitationCount(sessionReady);
  const recent = useRecentProjects(sessionReady);
  const { requestSignOut, signOutDialog } = useSignOut();

  const drawerActive = narrow && drawerOpen;
  const asideRef = useDialog<HTMLElement>({ open: drawerActive, onClose: () => setDrawerOpen(false) });

  const isAdmin = profile?.role === "admin";
  const pages = isAdmin ? [...APP_NAV, ...ADMIN_NAV] : APP_NAV;
  const displayLabel = profile?.display_name ?? user?.email?.split("@")[0] ?? "";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (isDialogOpen()) return;
        e.preventDefault();
        setFindOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function closeOnNavigate(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("a")) setDrawerOpen(false);
  }

  const hidden = narrow && !drawerOpen;

  return (
    <div className="flex h-full min-h-0 flex-col min-[900px]:flex-row">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-3 backdrop-blur min-[900px]:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t("shell.openNav")}
          aria-expanded={drawerOpen}
          aria-controls="app-sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-foreground/10 hover:text-foreground"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
        <Logo />
      </div>

      {drawerActive && (
        <div
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-background/70 min-[900px]:hidden"
        />
      )}

      <aside
        id="app-sidebar"
        ref={asideRef}
        tabIndex={-1}
        role={drawerActive ? "dialog" : undefined}
        aria-modal={drawerActive ? true : undefined}
        aria-label={t("shell.mainNav")}
        inert={hidden}
        className={`flex w-[min(300px,86vw)] flex-col border-r border-border bg-background/90 px-2.5 py-3.5 outline-none backdrop-blur transition-transform duration-300 ease-out motion-reduce:transition-none max-[899.98px]:fixed max-[899.98px]:inset-y-0 max-[899.98px]:left-0 max-[899.98px]:z-40 max-[899.98px]:shadow-card min-[900px]:w-[248px] min-[900px]:shrink-0 ${
          hidden ? "max-[899.98px]:-translate-x-full" : ""
        }`}
      >
        <div className="mb-3.5 flex items-center justify-between px-1.5">
          <Logo />
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            data-autofocus
            aria-label={t("shell.closeNav")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-foreground/10 hover:text-foreground min-[900px]:hidden"
          >
            <X aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
        </div>

        <Link
          href={NEW_PROJECT_HREF}
          onClick={() => setDrawerOpen(false)}
          className="mb-2 flex h-9 items-center justify-center gap-1.5 rounded-full bg-accent text-sm font-semibold text-accent-foreground transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-[0.98] motion-reduce:transition-none"
        >
          <Plus aria-hidden="true" className="h-4 w-4" /> {t("nav.newProject")}
        </Link>
        <button
          type="button"
          onClick={() => setFindOpen(true)}
          aria-keyshortcuts="Control+K Meta+K"
          className="mb-4 flex h-9 items-center gap-2 rounded-full border border-border-strong px-3.5 text-sm text-muted transition-colors hover:border-foreground hover:text-foreground"
        >
          <Search aria-hidden="true" className="h-4 w-4" />
          {t("shell.quickFind")}
          <kbd className="ml-auto rounded-md bg-foreground/10 px-1.5 font-mono text-xs text-muted">{t("shell.quickFindKeys")}</kbd>
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto" onClick={closeOnNavigate}>
          <nav aria-label={t("shell.mainNav")} className="flex flex-col gap-0.5">
            {APP_NAV.map((item) => (
              <NavLink
                key={item.id}
                item={item}
                pathname={pathname}
                count={
                  item.id === "notifications" ? unread : item.id === "invitations" ? pendingInvitations : undefined
                }
                countLabel={item.id === "invitations" ? "nav.invitationsPending" : undefined}
              />
            ))}
          </nav>

          {recent.length > 0 && (
            <nav aria-label={t("shell.recent")}>
              <GroupLabel>{t("shell.recent")}</GroupLabel>
              <ul className="flex flex-col gap-0.5">
                {recent.map((project) => {
                  const href = `/projects/${project.id}`;
                  const active = pathname === href;
                  return (
                    <li key={project.id}>
                      <Link href={href} aria-current={active ? "page" : undefined} className={rowClass(active)}>
                        <span aria-hidden="true" className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
                        <span className="truncate">{project.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          {isAdmin && (
            <nav aria-label={t("nav.admin")}>
              <GroupLabel>{t("nav.admin")}</GroupLabel>
              <div className="flex flex-col gap-0.5">
                {ADMIN_NAV.map((item) => (
                  <NavLink key={item.id} item={item} pathname={pathname} />
                ))}
              </div>
            </nav>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-0.5 border-t border-border pt-3" onClick={closeOnNavigate}>
          <Link
            href={SETTINGS_HREF}
            aria-current={isActivePath(pathname, SETTINGS_HREF) ? "page" : undefined}
            className={rowClass(isActivePath(pathname, SETTINGS_HREF))}
          >
            <Settings aria-hidden="true" className="h-4 w-4 shrink-0" /> {t("shell.settings")}
          </Link>
          <div className="my-1.5 px-2.5">
            <LanguageSwitch />
          </div>
          <div className="flex items-center gap-2.5 px-2.5 py-1.5" aria-label={t("shell.signedInAs", { name: displayLabel })} role="group">
            {user && <Avatar id={user.id} label={displayLabel} imageUrl={profile?.avatar_url} />}
            <span className="truncate text-sm font-medium">{displayLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              requestSignOut();
            }}
            className={`${ROW} w-full text-left text-muted hover:bg-foreground/[0.07] hover:text-danger`}
          >
            <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" /> {t("nav.signOut")}
          </button>
          <p className="mt-2 px-2.5 text-xs leading-snug text-muted">
            {t("shell.credits")}{" "}
            <a
              href="/instruments/CREDITS.txt"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              {t("footer.fullCredits")}
            </a>
          </p>
        </div>
      </aside>

      <MainRegion>{children}</MainRegion>

      <QuickFind open={findOpen} onClose={() => setFindOpen(false)} pages={pages} projects={recent} />
      {signOutDialog}
    </div>
  );
}
