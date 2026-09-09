"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/auth-context";

interface NavLink {
  href: string;
  label: string;
}

const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Trang chủ" },
  { href: "/projects", label: "Dự án của tôi" },
  { href: "/rankings", label: "Bảng xếp hạng" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { user, profile, loading, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
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

  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-[#1F2126]/95">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-bold tracking-tight"
        >
          <span className="text-2xl">🎵</span>
          <span>STAVE</span>
        </Link>

        {/* Navigation */}
        <nav className="hidden items-center gap-1 text-sm sm:flex">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded px-3 py-1.5 transition-colors ${
                  isActive
                    ? "bg-[#1D4ED8] font-semibold text-white"
                    : "hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          {/* Explore placeholder — shown regardless of auth */}
          <Link
            href="/explore"
            className={`rounded px-3 py-1.5 transition-colors ${
              pathname.startsWith("/explore")
                ? "bg-[#1D4ED8] font-semibold text-white"
                : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            Khám phá
          </Link>
        </nav>

        {/* Right side: auth */}
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="h-8 w-24 animate-pulse rounded bg-black/5 dark:bg-white/10" />
          ) : user ? (
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-2 rounded-full px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1D4ED8] text-sm font-semibold text-white">
                  {(profile?.display_name ?? user.email ?? "?")[0]!.toUpperCase()}
                </div>
                <span className="hidden text-sm font-medium sm:block">
                  {profile?.display_name ?? user.email?.split("@")[0]}
                </span>
                <svg
                  className={`h-4 w-4 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded border border-black/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#1F2126]">
                  {profile?.role === "admin" && (
                    <Link
                      href="/admin/users"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <span>👤</span> Quản trị
                    </Link>
                  )}
                  <Link
                    href="/profile"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <span>⚙️</span> Hồ sơ cá nhân
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-black/5 dark:text-red-400 dark:hover:bg-white/10"
                  >
                    <span>🚪</span> Đăng xuất
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
              >
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="rounded bg-[#1D4ED8] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1E40AF]"
              >
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile nav */}
      <div className="flex flex-wrap gap-1 border-t border-black/5 px-4 py-2 sm:hidden">
        {NAV_LINKS.map((link) => {
          const isActive =
            link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex-1 rounded px-3 py-1.5 text-center text-xs font-medium ${
                isActive
                  ? "bg-[#1D4ED8] text-white"
                  : "bg-black/5 dark:bg-white/10"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
        <Link
          href="/explore"
          className={`flex-1 rounded px-3 py-1.5 text-center text-xs font-medium ${
            pathname.startsWith("/explore")
              ? "bg-[#1D4ED8] text-white"
              : "bg-black/5 dark:bg-white/10"
          }`}
        >
          Khám phá
        </Link>
      </div>
    </header>
  );
}
