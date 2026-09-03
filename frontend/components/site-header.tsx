"use client";

import Link from "next/link";
import { useAuth } from "../context/auth-context";

export function SiteHeader() {
  const { user, profile, loading, signOut } = useAuth();

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold">
          STAVE
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {loading ? null : user ? (
            <>
              {profile?.role === "admin" && (
                <Link href="/admin/users" className="hover:underline">
                  Admin
                </Link>
              )}
              <Link href="/profile" className="hover:underline">
                {profile?.display_name ?? "Profile"}
              </Link>
              <button
                onClick={() => void signOut()}
                className="rounded bg-black/5 px-3 py-1 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:underline">
                Login
              </Link>
              <Link
                href="/register"
                className="rounded bg-black/5 px-3 py-1 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
