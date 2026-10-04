"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../../context/auth-context";
import { authErrorMessage } from "../../../lib/error-message";

const TIMEOUT_MS = 15000;

function readCallbackError(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const code = params.get("error_code") ?? query.get("error_code");
  const error = params.get("error") ?? query.get("error");
  if (!code && !error) return null;
  return authErrorMessage({ code: code ?? error ?? undefined });
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const message = readCallbackError();
    if (message) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL chỉ đọc được ở client
      setFailure(message);
      return;
    }
    const timer = setTimeout(() => {
      setFailure("Đăng nhập mất quá nhiều thời gian. Hãy thử đăng nhập lại.");
    }, TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading && session) {
      router.replace("/");
    }
  }, [loading, session, router]);

  if (failure && !session) {
    return (
      <div
        role="alert"
        className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-4 px-5 text-center"
      >
        <p className="text-base font-semibold text-foreground">Không đăng nhập được</p>
        <p className="text-sm text-muted">{failure}</p>
        <div className="flex flex-wrap justify-center gap-3 text-sm font-semibold">
          <Link href="/login" className="text-accent hover:underline">
            Về trang đăng nhập
          </Link>
          <Link href="/forgot-password" className="text-accent hover:underline">
            Gửi liên kết mới
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex min-h-full flex-col items-center justify-center gap-3 text-sm text-muted"
    >
      <Loader2 className="h-6 w-6 animate-spin text-accent" />
      Đang đăng nhập…
    </div>
  );
}
