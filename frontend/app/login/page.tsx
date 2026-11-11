"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase-browser";
import { authErrorSource, rawErrorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { takeAuthNotice } from "../../lib/auth-notice";
import { safeRedirectPath } from "../../lib/safe-redirect";
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

  useEffect(() => {
    const notice = takeAuthNotice();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage chỉ đọc được ở client
    if (notice) setError(rawErrorSource(notice));
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
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(authErrorSource(signInError));
      setUnconfirmed(signInError.code === "email_not_confirmed");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    router.push(safeRedirectPath(params.get("next") ?? params.get("redirect")));
  }

  async function handleResend() {
    setResendState("sending");
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (resendError) {
      setResendState("idle");
      setError(authErrorSource(resendError));
      return;
    }
    setResendState("sent");
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
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
        <Link href="/register" className="font-semibold text-accent hover:underline">
          {t("auth.noAccount")}
        </Link>
      </div>
    </AuthCard>
  );
}
