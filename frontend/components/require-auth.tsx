"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useT } from "../context/i18n-context";
import { useAuth } from "../context/auth-context";
import { withNextParam } from "../lib/safe-redirect";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { user, loading } = useAuth();
  const router = useRouter();
  const wasAuthenticatedRef = useRef(false);

  useEffect(() => {
    if (user) {
      wasAuthenticatedRef.current = true;
      return;
    }
    if (!loading) {
      if (wasAuthenticatedRef.current) {
        router.replace("/login");
        return;
      }
      const current =
        typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "";
      router.replace(withNextParam("/login", current));
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin text-accent" /> {t("ui.loading")}
      </div>
    );
  }

  return <>{children}</>;
}
