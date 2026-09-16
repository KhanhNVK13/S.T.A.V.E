"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, Shield, UserRound, LogOut, Plus, Menu, X } from "lucide-react";
import { useAuth } from "../context/auth-context";
import { Logo } from "./ui/logo";
import { Avatar } from "./ui/avatar";

interface NavLink {
  href: string;
  label: string;
}

/*
 * Chỉ những mục có nghĩa khi CHƯA chọn project nào mới được nằm ở đây.
 * Lịch sử commit / Compare & merge là khái niệm theo từng project — chúng nằm
 * trong trang project (tab riêng) và trong thanh công cụ của MIDI Editor, không
 * phải nav toàn cục.
 */
const NAV_LINKS: NavLink[] = [
  { href: "/explore", label: "Khám phá" },
  { href: "/rankings", label: "Bảng xếp hạng" },
  { href: "/projects", label: "Dự án của tôi" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { user, profile, loading, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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

  function navClass(href: string) {
    const isActive = pathname === href || pathname.startsWith(`${href}/`);
    return `flex h-8 items-center rounded-md px-3 text-[13px] font-semibold transition-colors ${
      isActive
        ? "bg-accent-muted text-accent"
        : "text-muted hover:bg-surface-subtle hover:text-foreground"
    }`;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-page items-center gap-5 px-5">
        <Logo />

        <nav className="hidden items-center gap-0.5 md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={navClass(link.href)}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {loading ? (
            <div className="h-8 w-24 animate-pulse rounded-md bg-surface-subtle" />
          ) : user ? (
            <>
              <Link
                href="/projects/new"
                className="hidden h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-hover sm:flex"
              >
                <Plus className="h-3.5 w-3.5" /> Dự án mới
              </Link>

              <div ref={dropdownRef} className="relative">
                <button
                  onClick={() => setDropdownOpen((o) => !o)}
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-surface-subtle"
                >
                  <Avatar id={user.id} label={displayLabel} imageUrl={profile?.avatar_url} />
                  <span className="hidden text-[13px] font-medium sm:block">{displayLabel}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 rounded-card border border-border bg-surface py-1">
                    {profile?.role === "admin" && (
                      <Link
                        href="/admin/users"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-[13px] hover:bg-surface-subtle"
                      >
                        <Shield className="h-4 w-4 text-muted" /> Quản trị
                      </Link>
                    )}
                    <Link
                      href="/profile"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-[13px] hover:bg-surface-subtle"
                    >
                      <UserRound className="h-4 w-4 text-muted" /> Hồ sơ cá nhân
                    </Link>
                    <button
                      onClick={() => void handleSignOut()}
                      className="flex w-full items-center gap-2 px-4 py-2 text-[13px] text-danger hover:bg-surface-subtle"
                    >
                      <LogOut className="h-4 w-4" /> Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="flex h-8 items-center rounded-md px-3 text-[13px] font-semibold text-muted hover:bg-surface-subtle hover:text-foreground"
              >
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="flex h-8 items-center rounded-md bg-accent px-3 text-[13px] font-semibold text-accent-foreground hover:bg-accent-hover"
              >
                Đăng ký
              </Link>
            </>
          )}

          <button
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? "Đóng menu" : "Mở menu"}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-subtle md:hidden"
          >
            {mobileOpen ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="flex flex-col gap-1 border-t border-border bg-surface p-2 md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={navClass(link.href)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
