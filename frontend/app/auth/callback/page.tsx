"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../../context/auth-context";
import { authErrorMessage, authErrorSource, renderError, type ErrorSource } from "../../../lib/error-message";
import { supabase } from "../../../lib/supabase-browser";
import { setFlashToast } from "../../../lib/flash-toast";
import { safeRedirectPath } from "../../../lib/safe-redirect";
import { tNow } from "../../../lib/i18n";
import { useT } from "../../../context/i18n-context";
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
  const t = useT();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<ErrorSource | null>(null);

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
      setError(authErrorSource(resendError));
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <p role="status" className="text-sm text-success-foreground">
        {t("auth.cb.resentNotice")}
      </p>
    );
  }

  return (
    <form onSubmit={handleResend} noValidate className="flex w-full flex-col gap-2 text-left">
      <label htmlFor="resend-email" className="text-xs font-semibold">
        {t("auth.resend")}
      </label>
      <input
        id="resend-email"
        name="email"
        type="email"
        autoComplete="email"
        spellCheck={false}
        placeholder={t("auth.emailPlaceholder")}
        value={email}
        aria-invalid={emailError ? true : undefined}
        onChange={(e) => {
          setEmail(e.target.value);
          setEmailError(null);
        }}
        className={AUTH_INPUT_CLASS}
      />
      {emailError && <FieldError>{emailError}</FieldError>}
      {error && <FieldError>{renderError(error)}</FieldError>}
      <Button type="submit" variant="secondary" disabled={state === "sending"}>
        {state === "sending" ? t("auth.sending") : t("auth.cb.sendConfirm")}
      </Button>
    </form>
  );
}

export default function AuthCallbackPage() {
  const t = useT();
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
      setFailure(tNow("auth.cb.timeout"));
    }, TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading && session) {
      const type = callbackTypeRef.current;
      if (type === "signup" || type === "email") {
        setFlashToast(tNow("auth.cb.confirmedToast"));
      }
      router.replace(safeRedirectPath(new URLSearchParams(window.location.search).get("next")));
    }
  }, [loading, session, router]);

  if (failure && !session) {
    return (
      <div
        role="alert"
        className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-4 px-5 text-center"
      >
        <h1 className="text-base font-semibold text-foreground">
          {expiredLink ? t("auth.cb.expiredTitle") : t("auth.cb.failedTitle")}
        </h1>
        <p className="text-sm text-muted">{failure}</p>
        {expiredLink && <ResendVerification />}
        <div className="flex flex-wrap justify-center gap-3 text-sm font-semibold">
          <Link href="/login" className="text-accent hover:underline">
            {t("auth.cb.toLogin")}
          </Link>
          <Link href="/forgot-password" className="text-accent hover:underline">
            {t("auth.cb.newLink")}
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
      <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-accent" />
      <h1 className="text-sm font-normal">{t("auth.cb.signingIn")}</h1>
    </div>
  );
}
