"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase-browser";
import { authErrorMessage } from "../../lib/error-message";
import { AuthCard, AuthField, AUTH_INPUT_CLASS } from "../../components/auth-card";
import { Button } from "../../components/ui/button";
import {validateEmail, REQUIRED_MESSAGE, focusFirstInvalid } from "../../lib/validation";
import { MailCheck } from "lucide-react";

const REGISTRATION_CLOSED_MESSAGE =
  "Việc đăng ký tài khoản mới đang tạm đóng. Bạn vui lòng quay lại sau.";

async function isRegistrationOpen(): Promise<boolean> {
  const { data } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "registration_enabled")
    .maybeSingle();
  return data?.value !== false && data?.value !== "false";
}

export default function RegisterPage() {
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
    if (!(await isRegistrationOpen().catch(() => true))) {
      setSubmitting(false);
      setClosed(true);
      setError(REGISTRATION_CLOSED_MESSAGE);
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
      setError(
        "Email này đã được đăng ký. Nếu đây là tài khoản của bạn, hãy đăng nhập hoặc dùng chức năng quên mật khẩu."
      );
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
          <h2 className="mb-2 text-lg font-semibold text-foreground">Chưa gửi được email xác nhận</h2>
          <p className="text-sm text-muted">
            Tài khoản cho <span className="font-mono text-foreground">{email}</span> có thể đã được tạo
            nhưng email xác nhận chưa gửi đi được. Hãy gửi lại, hoặc đăng nhập nếu bạn đã nhận được email trước đó.
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
              ? "Đang gửi…"
              : resendState === "sent"
                ? "Đã gửi lại, kiểm tra hộp thư"
                : "Gửi lại email xác nhận"}
          </Button>
          <Link href="/login" className="mt-4 text-sm text-accent hover:underline">
            Đến trang đăng nhập
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
          <h2 className="mb-2 text-lg font-semibold text-foreground">Kiểm tra email</h2>
          <p className="text-sm text-muted">
            Mình đã gửi email xác nhận tới{" "}
            <span className="font-mono text-foreground">{email}</span>. Bấm vào link trong
            email để hoàn tất đăng ký.
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Tạo không gian làm việc"
      title="Tạo tài khoản STAVE"
      description="Bắt đầu quản lý phiên bản cho các dự án MIDI của bạn."
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <AuthField label="Email" error={fieldErrors.email}>
          <input
            name="email"
            autoComplete="email"
            spellCheck={false}
            type="email"
            aria-invalid={fieldErrors.email ? true : undefined}
            placeholder="ban@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </AuthField>
        <AuthField label="Mật khẩu" error={fieldErrors.password}>
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
        <AuthField label="Nhập lại mật khẩu" error={fieldErrors.confirmPassword}>
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
            {REGISTRATION_CLOSED_MESSAGE}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting || closed} className="w-full">
          {submitting ? "Đang tạo tài khoản…" : "Đăng ký"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Đã có tài khoản?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Đăng nhập
        </Link>
      </p>
    </AuthCard>
  );
}
