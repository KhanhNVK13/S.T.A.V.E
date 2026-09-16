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
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent-muted">
            <MailCheck className="h-5 w-5 text-accent" />
          </span>
          <h2 className="mb-2 text-lg font-semibold text-foreground">Kiểm tra email</h2>
          <p className="text-sm text-muted">
            Nếu <span className="font-mono text-foreground">{email}</span> đã đăng ký, mình
            đã gửi link đặt lại mật khẩu (hiệu lực 1 giờ, dùng được 1 lần).
          </p>
          <Link href="/login" className="mt-5 text-sm text-accent hover:underline">
            Quay lại đăng nhập
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow="Khôi phục truy cập"
      title="Quên mật khẩu"
      description="Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu."
    >
      <p className="mb-4 -mt-2 text-sm text-muted">
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
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Đang gửi…" : "Gửi link đặt lại mật khẩu"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        <Link href="/login" className="text-accent hover:underline">
          Quay lại đăng nhập
        </Link>
      </p>
    </AuthCard>
  );
}
