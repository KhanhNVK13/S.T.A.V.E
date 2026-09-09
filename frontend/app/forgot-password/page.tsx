"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { supabase } from "../../lib/supabase-browser";
import { AuthCard, AuthField, AUTH_INPUT_CLASS } from "../../components/auth-card";
import { Button } from "../../components/ui/button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/reset-password` },
    );
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
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
            Nếu <span className="font-mono text-slate-700">{email}</span> đã đăng ký, mình
            đã gửi link đặt lại mật khẩu (hiệu lực 1 giờ, dùng được 1 lần).
          </p>
          <Link href="/login" className="mt-5 text-sm text-accent-600 hover:underline">
            Quay lại đăng nhập
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Quên mật khẩu">
      <p className="mb-4 -mt-2 text-sm text-slate-500">
        Nhập email, mình sẽ gửi link để đặt lại mật khẩu.
      </p>
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
        {error && <p className="text-sm text-danger-600">{error}</p>}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Đang gửi…" : "Gửi link đặt lại mật khẩu"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">
        <Link href="/login" className="text-accent-600 hover:underline">
          Quay lại đăng nhập
        </Link>
      </p>
    </AuthCard>
  );
}
