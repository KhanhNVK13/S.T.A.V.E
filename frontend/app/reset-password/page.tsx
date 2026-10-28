"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase-browser";
import { authErrorMessage } from "../../lib/error-message";
import { apiFetch, setStoredSessionId } from "../../lib/api-client";
import { setFlashToast } from "../../lib/flash-toast";
import {REQUIRED_MESSAGE, focusFirstInvalid } from "../../lib/validation";
import { useAuth } from "../../context/auth-context";
import { AuthCard, AuthField, AUTH_INPUT_CLASS } from "../../components/auth-card";
import { Button } from "../../components/ui/button";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
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
    if (!password) nextErrors.password = REQUIRED_MESSAGE;
    else if (password.length < 8) nextErrors.password = "Mật khẩu phải có ít nhất 8 ký tự.";
    if (!confirmPassword) nextErrors.confirmPassword = REQUIRED_MESSAGE;
    else if (password && password !== confirmPassword)
      nextErrors.confirmPassword = "Mật khẩu nhập lại không khớp.";
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
      setError(authErrorMessage(updateError));
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
        ? "Đã đặt mật khẩu mới. Các thiết bị khác đã bị đăng xuất."
        : "Đã đặt mật khẩu mới, nhưng chưa đăng xuất được các thiết bị khác. Hãy vào Cài đặt > Bảo mật > Thiết bị đang đăng nhập để kiểm tra.",
      othersSignedOut ? "success" : "warning",
    );
    router.push("/projects");
  }

  if (loading || (!session && !waited)) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center gap-2 py-4 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          Đang xử lý link…
        </div>
      </AuthCard>
    );
  }

  if (!session) {
    return (
      <AuthCard title="Link không hợp lệ hoặc đã hết hạn">
        <p className="text-sm text-muted">
          Yêu cầu 1 link đặt lại mật khẩu mới ở trang Quên mật khẩu.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Bảo mật tài khoản"
      title="Đặt mật khẩu mới"
      description="Chọn mật khẩu mới có ít nhất 8 ký tự."
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <AuthField label="Mật khẩu mới" error={fieldErrors.password}>
          <input
            name="new-password"
            autoComplete="new-password"
            type="password"
            placeholder="Tối thiểu 8 ký tự"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </AuthField>
        <AuthField label="Nhập lại mật khẩu mới" error={fieldErrors.confirmPassword}>
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
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Đang lưu…" : "Đặt mật khẩu mới"}
        </Button>
      </form>
    </AuthCard>
  );
}
