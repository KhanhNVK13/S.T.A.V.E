"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, Shield, UserRound, LogOut } from "lucide-react";
import { useAuth } from "../context/auth-context";
import { Logo } from "./ui/logo";
import { Avatar } from "./ui/avatar";

interface NavLink {
  href: string;
  label: string;
}

const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Trang chủ" },
  { href: "/explore", label: "Khám phá" },
  { href: "/rankings", label: "Bảng xếp hạng" },
  { href: "/projects", label: "Dự án của tôi" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { user, profile, loading, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleSignOut() {
    setDropdownOpen(false);
    await signOut();
  }

  const displayLabel = profile?.display_name ?? user?.email?.split("@")[0] ?? "";

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="hidden items-center gap-1 text-sm sm:flex">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                    isActive
                      ? "bg-accent-50 text-accent-700"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {loading ? (
            <div className="h-8 w-24 animate-pulse rounded-lg bg-slate-100" />
          ) : user ? (
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100"
              >
                <Avatar id={user.id} label={displayLabel} imageUrl={profile?.avatar_url} />
                <span className="hidden text-sm font-medium text-slate-700 sm:block">
                  {displayLabel}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-card">
                  {profile?.role === "admin" && (
                    <Link
                      href="/admin/users"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Shield className="h-4 w-4 text-slate-400" /> Quản trị
                    </Link>
                  )}
                  <Link
                    href="/profile"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <UserRound className="h-4 w-4 text-slate-400" /> Hồ sơ cá nhân
                  </Link>
                  <button
                    onClick={() => void handleSignOut()}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-danger-600 hover:bg-slate-50"
                  >
                    <LogOut className="h-4 w-4" /> Đăng xuất
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
              >
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile nav */}
      <div className="flex flex-wrap gap-1 border-t border-slate-100 px-4 py-2 sm:hidden">
        {NAV_LINKS.map((link) => {
          const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex-1 rounded-lg px-3 py-1.5 text-center text-xs font-medium ${
                isActive ? "bg-accent-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
