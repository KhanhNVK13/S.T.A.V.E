"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase-browser";
import { AuthCard, AuthField, AUTH_INPUT_CLASS } from "../../components/auth-card";
import { Button } from "../../components/ui/button";
import { MailCheck } from "lucide-react";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Mật khẩu phải có ít nhất 8 ký tự.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }

    setSubmitting(true);
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
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

  if (done) {
    return (
      <AuthCard>
        <div className="flex flex-col items-center text-center">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent-50">
            <MailCheck className="h-5 w-5 text-accent-600" />
          </span>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Kiểm tra email</h2>
          <p className="text-sm text-slate-500">
            Mình đã gửi email xác nhận tới{" "}
            <span className="font-mono text-slate-700">{email}</span>. Bấm vào link trong
            email để hoàn tất đăng ký.
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Đăng ký">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthField label="Email">
          <input
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
            type="password"
            required
            minLength={8}
            placeholder="Tối thiểu 8 ký tự"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </AuthField>
        <AuthField label="Nhập lại mật khẩu">
          <input
            type="password"
            required
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={AUTH_INPUT_CLASS}
          />
        </AuthField>
        {error && <p className="text-sm text-danger-600">{error}</p>}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Đang tạo tài khoản…" : "Đăng ký"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">
        Đã có tài khoản?{" "}
        <Link href="/login" className="text-accent-600 hover:underline">
          Đăng nhập
        </Link>
      </p>
    </AuthCard>
  );
}
