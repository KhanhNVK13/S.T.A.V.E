"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase-browser";
import { ApiError, loginWithPassword } from "../../lib/api-client";
import { authErrorSource, rawErrorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { takeAuthNotice } from "../../lib/auth-notice";
import { DEFAULT_AFTER_LOGIN_PATH, readNextParam, withNextParam } from "../../lib/safe-redirect";
import { AuthCard, AuthField, AuthDivider, GoogleButton, AUTH_INPUT_CLASS } from "../../components/auth-card";
import { useT } from "../../context/i18n-context";
import { Button } from "../../components/ui/button";
import {validateEmail, requiredMessage, focusFirstInvalid } from "../../lib/validation";

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ErrorSource | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [nextPath, setNextPath] = useState<string | null>(null);

  useEffect(() => {
    const notice = takeAuthNotice();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage và URL search chỉ đọc được ở client
    if (notice) setError(rawErrorSource(notice));
    setNextPath(readNextParam(window.location.search));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);
    const nextErrors: { email?: string; password?: string } = {};
    const emailInvalid = validateEmail(email);
    if (emailInvalid) nextErrors.email = emailInvalid;
    if (!password) nextErrors.password = requiredMessage();
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalid(form);
      return;
    }
    setUnconfirmed(false);
    setResendState("idle");
    setSubmitting(true);
    let signInError: { code?: string; message?: string } | null = null;
    try {
      const grant = await loginWithPassword(email, password);
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: grant.access_token,
        refresh_token: grant.refresh_token,
      });
      signInError = sessionError;
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { code?: string } | undefined) : undefined;
      signInError = { code: body?.code, message: err instanceof Error ? err.message : undefined };
    }
    setSubmitting(false);
    if (signInError) {
      setError(authErrorSource(signInError));
      setUnconfirmed(signInError.code === "email_not_confirmed");
      return;
    }
    const next = readNextParam(window.location.search);
    router.push(next ?? DEFAULT_AFTER_LOGIN_PATH);
  }

  async function handleResend() {
    setResendState("sending");
    const next = readNextParam(window.location.search);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: withNextParam(`${window.location.origin}/auth/callback`, next) },
    });
    if (resendError) {
      setResendState("idle");
      setError(authErrorSource(resendError));
      return;
    }
    setResendState("sent");
  }

  async function handleGoogle() {
    const next = readNextParam(window.location.search);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: withNextParam(`${window.location.origin}/auth/callback`, next) },
    });
  }

  return (
    <AuthCard
      eyebrow={t("auth.login.eyebrow")}
      title={t("auth.login.title")}
      description={t("auth.login.description")}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5">
        <AuthField label={t("auth.email")} error={fieldErrors.email}>
          <input
            name="email"
            autoComplete="email"
            spellCheck={false}
            type="email"
            placeholder={t("auth.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </AuthField>
        <AuthField label={t("auth.password")} error={fieldErrors.password}>
          <input
            name="password"
            autoComplete="current-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </AuthField>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {renderError(error)}
          </p>
        )}
        {unconfirmed && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleResend()}
            disabled={resendState !== "idle"}
            className="w-full"
          >
            {resendState === "sending"
              ? t("auth.sending")
              : resendState === "sent"
                ? t("auth.resentCheck")
                : t("auth.resend")}
          </Button>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? t("auth.signingIn") : t("auth.signIn")}
        </Button>
      </form>

      <AuthDivider />
      <GoogleButton onClick={() => void handleGoogle()} />

      <div className="mt-5 flex justify-between text-xs">
        <Link href="/forgot-password" className="font-semibold text-accent hover:underline">
          {t("auth.forgot")}
        </Link>
        <Link href={withNextParam("/register", nextPath)} className="font-semibold text-accent hover:underline">
          {t("auth.noAccount")}
        </Link>
      </div>
    </AuthCard>
  );
}
