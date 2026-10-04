"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase-browser";
import { authErrorMessage } from "../../lib/error-message";
import { AuthCard, AuthField, AuthDivider, GoogleButton, AUTH_INPUT_CLASS } from "../../components/auth-card";
import { Button } from "../../components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUnconfirmed(false);
    setResendState("idle");
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(authErrorMessage(signInError));
      setUnconfirmed(signInError.code === "email_not_confirmed");
      return;
    }
    router.push("/");
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
      setError(authErrorMessage(resendError));
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
      eyebrow="Chào mừng trở lại"
      title="Đăng nhập vào STAVE"
      description="Tiếp tục từ nơi bản nhạc của bạn đang dang dở."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <AuthField label="Email">
          <input
            name="email"
            autoComplete="email"
            spellCheck={false}
            type="email"
            required
            placeholder="ban@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </AuthField>
        <AuthField label="Mật khẩu">
          <input
            name="password"
            autoComplete="current-password"
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </AuthField>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
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
              ? "Đang gửi…"
              : resendState === "sent"
                ? "Đã gửi lại thư xác nhận — kiểm tra hộp thư"
                : "Gửi lại email xác nhận"}
          </Button>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
      </form>

      <AuthDivider />
      <GoogleButton onClick={() => void handleGoogle()} />

      <div className="mt-5 flex justify-between text-xs">
        <Link href="/forgot-password" className="font-semibold text-accent hover:underline">
          Quên mật khẩu?
        </Link>
        <Link href="/register" className="font-semibold text-accent hover:underline">
          Chưa có tài khoản?
        </Link>
      </div>
    </AuthCard>
  );
}
