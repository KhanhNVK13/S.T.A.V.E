"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "../../context/auth-context";
import { AppShell } from "./app-shell";
import { EditorBar } from "./editor-bar";
import { isEditorPath, usesPublicShell } from "./nav-items";
import { PublicShell } from "./public-shell";

export function ShellSwitch({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  if (isEditorPath(pathname)) return <EditorBar>{children}</EditorBar>;
  if (usesPublicShell(pathname)) return <PublicShell>{children}</PublicShell>;
  if (loading) return <PublicShell minimal>{children}</PublicShell>;
  if (user) return <AppShell>{children}</AppShell>;
  return <PublicShell>{children}</PublicShell>;
}
