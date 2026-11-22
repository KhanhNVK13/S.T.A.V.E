"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase-browser";
import { authErrorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { apiFetch, setStoredSessionId } from "../../lib/api-client";
import { setFlashToast } from "../../lib/flash-toast";
import {validatePassword, requiredMessage, focusFirstInvalid } from "../../lib/validation";
import { useAuth } from "../../context/auth-context";
import { AuthCard, AuthField, AUTH_INPUT_CLASS } from "../../components/auth-card";
import { useT } from "../../context/i18n-context";
import { Button } from "../../components/ui/button";

type ResetUrlState = "checking" | "error" | "no-token" | "has-token";

function inspectResetUrl(): Exclude<ResetUrlState, "checking"> {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  if (hash.has("error") || hash.has("error_code") || query.has("error") || query.has("error_code")) {
    return "error";
  }
  if (
    hash.has("access_token") ||
    hash.has("token_hash") ||
    hash.get("type") === "recovery" ||
    query.has("code") ||
    query.has("token_hash") ||
    query.get("type") === "recovery"
  ) {
    return "has-token";
  }
  return "no-token";
}

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
  const [urlState, setUrlState] = useState<ResetUrlState>("checking");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL chỉ đọc được ở client
    setUrlState(inspectResetUrl());
    const timer = setTimeout(() => setWaited(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);

    const nextErrors: typeof fieldErrors = {};
    const passwordError = validatePassword(password);
    if (passwordError) nextErrors.password = passwordError;
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
    router.push("/projects");
  }

  const isProcessing =
    urlState === "checking" ||
    (urlState !== "error" && !waited && (loading || (urlState === "has-token" && !session)));

  if (isProcessing) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center gap-2 py-4 text-sm text-muted">
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-accent" />
          <h1 className="text-sm font-normal">{t("auth.reset.processing")}</h1>
        </div>
      </AuthCard>
    );
  }

  if (urlState === "error" || !session) {
    return (
      <AuthCard title={t("auth.reset.invalidTitle")}>
        <p className="text-sm text-muted">
          {t("auth.reset.invalidBody")}
        </p>
        <Link
          href="/forgot-password"
          className="mt-4 inline-block text-sm font-semibold text-accent hover:underline"
        >
          {t("auth.cb.newLink")}
        </Link>
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
