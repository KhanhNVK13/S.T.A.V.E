"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-browser";
import { authErrorMessage } from "../../lib/error-message";
import { DEFAULT_AFTER_LOGIN_PATH } from "../../lib/safe-redirect";
import { AuthCard, AuthField, AUTH_INPUT_CLASS } from "../../components/auth-card";
import { useI18n } from "../../context/i18n-context";
import { Button } from "../../components/ui/button";
import {validateEmail, requiredMessage, focusFirstInvalid } from "../../lib/validation";
import { MailCheck } from "lucide-react";

async function isRegistrationOpen(): Promise<boolean> {
  const { data } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "registration_enabled")
    .maybeSingle();
  return data?.value !== false && data?.value !== "false";
}

export default function RegisterPage() {
  const { t, tx } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [closed, setClosed] = useState(false);
  const [mailFailed, setMailFailed] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  useEffect(() => {
    let cancelled = false;
    isRegistrationOpen()
      .then((open) => {
        if (!cancelled) setClosed(!open);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);

    const nextErrors: typeof fieldErrors = {};
    const emailError = validateEmail(email);
    if (emailError) nextErrors.email = emailError;
    if (!password) nextErrors.password = requiredMessage();
    else if (password.length < 8) nextErrors.password = t("auth.passwordTooShort");
    if (!confirmPassword) nextErrors.confirmPassword = requiredMessage();
    else if (password && password !== confirmPassword)
      nextErrors.confirmPassword = t("auth.passwordMismatch");
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalid(form);
      return;
    }

    setSubmitting(true);
    if (!(await isRegistrationOpen().catch(() => true))) {
      setSubmitting(false);
      setClosed(true);
      setError(t("auth.register.closed"));
      return;
    }
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSubmitting(false);

    if (signUpError) {
      if (
        signUpError.code === "unexpected_failure" ||
        /sending (confirmation|verification|email)/i.test(signUpError.message ?? "")
      ) {
        setMailFailed(true);
        return;
      }
      setError(authErrorMessage(signUpError));
      return;
    }

    // Supabase trả về error: null kể cả khi email đã đăng ký (chống dò email),
    // nhưng identities rỗng cho biết đây không phải tài khoản mới — không có email nào được gửi.
    if (signUpData.user && signUpData.user.identities?.length === 0) {
      setError(t("auth.register.alreadyRegistered"));
      return;
    }

    if (signUpData.session) {
      router.push(DEFAULT_AFTER_LOGIN_PATH);
      return;
    }

    setDone(true);
  }

  async function handleResend() {
    setResendState("sending");
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (resendError) {
      setResendState("idle");
      setError(authErrorMessage(resendError));
      return;
    }
    setError(null);
    setResendState("sent");
  }

  if (mailFailed) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center text-center">
          <h2 className="mb-2 text-lg font-semibold text-foreground">{t("auth.register.mailFailedTitle")}</h2>
          <p className="text-sm text-muted">
            {tx("auth.register.mailFailedBody", { email: <span className="font-mono text-foreground">{email}</span> })}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            variant="secondary"
            className="mt-4"
            disabled={resendState !== "idle"}
            onClick={() => void handleResend()}
          >
            {resendState === "sending"
              ? t("auth.sending")
              : resendState === "sent"
                ? t("auth.resentShort")
                : t("auth.resend")}
          </Button>
          <Link href="/login" className="mt-4 text-sm text-accent hover:underline">
            {t("auth.register.toLogin")}
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center text-center">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent-muted">
            <MailCheck className="h-5 w-5 text-accent" />
          </span>
          <h2 className="mb-2 text-lg font-semibold text-foreground">{t("auth.checkEmail")}</h2>
          <p className="text-sm text-muted">
            {tx("auth.register.sentBody", { email: <span className="font-mono text-foreground">{email}</span> })}
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow={t("auth.register.eyebrow")}
      title={t("auth.register.title")}
      description={t("auth.register.description")}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <AuthField label={t("auth.email")} error={fieldErrors.email}>
          <input
            name="email"
            autoComplete="email"
            spellCheck={false}
            type="email"
            aria-invalid={fieldErrors.email ? true : undefined}
            placeholder={t("auth.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </AuthField>
        <AuthField label={t("auth.password")} error={fieldErrors.password}>
          <input
            name="new-password"
            autoComplete="new-password"
            type="password"
            placeholder={t("auth.passwordMin")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </AuthField>
        <AuthField label={t("auth.confirmPassword")} error={fieldErrors.confirmPassword}>
          <input
            name="confirm-password"
            autoComplete="new-password"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </AuthField>
        {closed && !error && (
          <p role="status" className="text-sm text-muted">
            {t("auth.register.closed")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting || closed} className="w-full">
          {submitting ? t("auth.register.creating") : t("auth.register.submit")}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="text-accent hover:underline">
          {t("auth.signIn")}
        </Link>
      </p>
    </AuthCard>
  );
}
