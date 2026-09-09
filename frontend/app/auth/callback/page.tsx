"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../../context/auth-context";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && session) {
      router.replace("/");
    }
  }, [loading, session, router]);

  return (
    <div className="flex min-h-[calc(100vh-8.5rem)] flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <Loader2 className="h-6 w-6 animate-spin text-accent-600" />
      Đang đăng nhập…
    </div>
  );
}
