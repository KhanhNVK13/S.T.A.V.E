"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase-browser";
import { authErrorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { apiFetch, setStoredSessionId } from "../../lib/api-client";
import { setFlashToast } from "../../lib/flash-toast";
import { DEFAULT_AFTER_LOGIN_PATH } from "../../lib/safe-redirect";
import {requiredMessage, focusFirstInvalid } from "../../lib/validation";
import { useAuth } from "../../context/auth-context";
import { AuthCard, AuthField, AUTH_INPUT_CLASS } from "../../components/auth-card";
import { useT } from "../../context/i18n-context";
import { Button } from "../../components/ui/button";

export default function ResetPasswordPage() {
  const t = useT();
  const router = useRouter();
  const { session, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<ErrorSource | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);

    const nextErrors: typeof fieldErrors = {};
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
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    if (updateError) {
      setSubmitting(false);
      setError(authErrorSource(updateError));
      return;
    }

    // BR-10: thu hồi mọi phiên cũ rồi cấp phiên mới cho thiết bị này.
    let othersSignedOut = true;
    try {
      const { sessionId } = await apiFetch<{ sessionId: string }>("/auth/sessions/reset", {
        method: "POST",
        body: JSON.stringify({
          deviceLabel: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        }),
      });
      setStoredSessionId(sessionId);
    } catch {
      othersSignedOut = false;
    }
    setSubmitting(false);
    setFlashToast(
      othersSignedOut
        ? t("auth.reset.doneOthersOut")
        : t("auth.reset.doneOthersFailed"),
      othersSignedOut ? "success" : "warning",
    );
    router.push(DEFAULT_AFTER_LOGIN_PATH);
  }

  if (loading || (!session && !waited)) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center gap-2 py-4 text-sm text-muted">
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-accent" />
          <h1 className="text-sm font-normal">{t("auth.reset.processing")}</h1>
        </div>
      </AuthCard>
    );
  }

  if (!session) {
    return (
      <AuthCard title={t("auth.reset.invalidTitle")}>
        <p className="text-sm text-muted">
          {t("auth.reset.invalidBody")}
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow={t("auth.reset.eyebrow")}
      title={t("auth.reset.title")}
      description={t("auth.reset.description")}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <AuthField label={t("auth.reset.newPassword")} error={fieldErrors.password}>
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
        <AuthField label={t("auth.reset.confirmNew")} error={fieldErrors.confirmPassword}>
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
        {error && (
          <p role="alert" className="text-sm text-danger">
            {renderError(error)}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? t("auth.reset.saving") : t("auth.reset.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}
