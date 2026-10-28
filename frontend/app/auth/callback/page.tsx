"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../../context/auth-context";
import { authErrorMessage } from "../../../lib/error-message";
import { supabase } from "../../../lib/supabase-browser";
import { setFlashToast } from "../../../lib/flash-toast";
import { validateEmail } from "../../../lib/validation";
import { AUTH_INPUT_CLASS } from "../../../components/auth-card";
import { Button } from "../../../components/ui/button";
import { FieldError } from "../../../components/ui/form";

const TIMEOUT_MS = 15000;

function readCallbackError(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const code = params.get("error_code") ?? query.get("error_code");
  const error = params.get("error") ?? query.get("error");
  if (!code && !error) return null;
  return authErrorMessage({ code: code ?? error ?? undefined });
}

function readCallbackType(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  return params.get("type") ?? query.get("type");
}

function ResendVerification() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const invalid = validateEmail(email);
    setEmailError(invalid);
    if (invalid) return;
    setState("sending");
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (resendError) {
      setState("idle");
      setError(authErrorMessage(resendError));
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <p role="status" className="text-sm text-success-foreground">
        Nếu địa chỉ này đã đăng ký mà chưa xác nhận, mình đã gửi email xác nhận mới. Hãy kiểm tra hộp thư.
      </p>
    );
  }

  return (
    <form onSubmit={handleResend} noValidate className="flex w-full flex-col gap-2 text-left">
      <label htmlFor="resend-email" className="text-xs font-semibold">
        Gửi lại email xác nhận
      </label>
      <input
        id="resend-email"
        name="email"
        type="email"
        autoComplete="email"
        spellCheck={false}
        placeholder="ban@email.com"
        value={email}
        aria-invalid={emailError ? true : undefined}
        onChange={(e) => {
          setEmail(e.target.value);
          setEmailError(null);
        }}
        className={AUTH_INPUT_CLASS}
      />
      {emailError && <FieldError>{emailError}</FieldError>}
      {error && <FieldError>{error}</FieldError>}
      <Button type="submit" variant="secondary" disabled={state === "sending"}>
        {state === "sending" ? "Đang gửi…" : "Gửi email xác nhận"}
      </Button>
    </form>
  );
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [failure, setFailure] = useState<string | null>(null);
  const [expiredLink, setExpiredLink] = useState(false);
  const callbackTypeRef = useRef<string | null>(null);

  useEffect(() => {
    callbackTypeRef.current = readCallbackType();
    const message = readCallbackError();
    if (message) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL chỉ đọc được ở client
      setFailure(message);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);
      setExpiredLink((hash.get("error_code") ?? query.get("error_code")) === "otp_expired");
      return;
    }
    const timer = setTimeout(() => {
      setFailure("Đăng nhập mất quá nhiều thời gian. Hãy thử đăng nhập lại.");
    }, TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading && session) {
      const type = callbackTypeRef.current;
      if (type === "signup" || type === "email") {
        setFlashToast("Email đã được xác nhận. Chào mừng bạn đến với STAVE!");
      }
      router.replace("/projects");
    }
  }, [loading, session, router]);

  if (failure && !session) {
    return (
      <div
        role="alert"
        className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-4 px-5 text-center"
      >
        <p className="text-base font-semibold text-foreground">
          {expiredLink ? "Liên kết không còn dùng được" : "Không đăng nhập được"}
        </p>
        <p className="text-sm text-muted">{failure}</p>
        {expiredLink && <ResendVerification />}
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
