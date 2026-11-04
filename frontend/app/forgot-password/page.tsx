"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { supabase } from "../../lib/supabase-browser";
import { authErrorMessage } from "../../lib/error-message";
import { AuthCard, AuthField, AUTH_INPUT_CLASS } from "../../components/auth-card";
import { useI18n } from "../../context/i18n-context";
import { Button } from "../../components/ui/button";
import {validateEmail, focusFirstInvalid } from "../../lib/validation";

export default function ForgotPasswordPage() {
  const { t, tx } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);
    const invalid = validateEmail(email);
    setEmailError(invalid);
    if (invalid) {
      focusFirstInvalid(form);
      return;
    }
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/reset-password` },
    );
    setSubmitting(false);
    if (resetError) {
      setError(authErrorMessage(resetError));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center text-center">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent-muted">
            <MailCheck className="h-5 w-5 text-accent" />
          </span>
          <h1 className="mb-2 text-lg font-semibold text-foreground">{t("auth.checkEmail")}</h1>
          <p className="text-sm text-muted">
            {tx("auth.forgot.sentBody", { email: <span className="font-mono text-foreground">{email}</span> })}
          </p>
          <Link href="/login" className="mt-5 text-sm text-accent hover:underline">
            {t("auth.backToLogin")}
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow={t("auth.forgot.eyebrow")}
      title={t("auth.forgot.title")}
      description={t("auth.forgot.description")}
    >
      <p className="mb-4 -mt-2 text-sm text-muted">
        {t("auth.forgot.lead")}
      </p>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <AuthField label={t("auth.email")} error={emailError}>
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
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? t("auth.sending") : t("auth.forgot.submit")}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        <Link href="/login" className="text-accent hover:underline">
          {t("auth.backToLogin")}
        </Link>
      </p>
    </AuthCard>
  );
}
