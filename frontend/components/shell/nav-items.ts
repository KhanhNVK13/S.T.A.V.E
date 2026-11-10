import { Bell, Compass, Flag, FolderOpen, House, Music4, Shield, SlidersHorizontal, Trophy, type LucideIcon } from "lucide-react";
import type { TKey } from "../../lib/i18n";

export interface ShellNavItem {
  id: string;
  href: string;
  label: TKey;
  icon: LucideIcon;
}

export const EDITOR_PATH_RE = /^\/projects\/[^/]+\/edit$/;
export const AUTH_PATH_RE = /^\/(login|register|forgot-password|reset-password|auth\/callback)$/;
export const PUBLIC_ONLY_PATHS = new Set(["/welcome"]);

export function isEditorPath(pathname: string): boolean {
  return EDITOR_PATH_RE.test(pathname);
}

export function usesPublicShell(pathname: string): boolean {
  return PUBLIC_ONLY_PATHS.has(pathname) || AUTH_PATH_RE.test(pathname);
}

export const APP_NAV: ShellNavItem[] = [
  { id: "home", href: "/", label: "nav.home", icon: House },
  { id: "projects", href: "/projects", label: "nav.projects", icon: FolderOpen },
  { id: "explore", href: "/explore", label: "nav.explore", icon: Compass },
  { id: "rankings", href: "/rankings", label: "nav.rankings", icon: Trophy },
  { id: "notifications", href: "/notifications", label: "nav.notifications", icon: Bell },
];

export const ADMIN_NAV: ShellNavItem[] = [
  { id: "admin-users", href: "/admin/users", label: "nav.admin", icon: Shield },
  { id: "admin-jam", href: "/admin/jam", label: "nav.jam", icon: Music4 },
  { id: "admin-settings", href: "/admin/settings", label: "nav.settings", icon: SlidersHorizontal },
  { id: "admin-reports", href: "/admin/reports", label: "nav.reports", icon: Flag },
];

export const PUBLIC_NAV: Pick<ShellNavItem, "id" | "href" | "label">[] = [
  { id: "explore", href: "/explore", label: "nav.explore" },
  { id: "rankings", href: "/rankings", label: "nav.rankings" },
];

export const NEW_PROJECT_HREF = "/projects/new";
export const SETTINGS_HREF = "/profile";

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
