"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase-browser";

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
      <div className="mx-auto max-w-sm px-4 py-16">
        <h1 className="text-2xl font-bold">Kiểm tra email</h1>
        <p className="mt-4 text-sm opacity-80">
          Mình đã gửi email xác nhận tới <strong>{email}</strong>. Bấm vào
          link trong email để hoàn tất đăng ký.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">Đăng ký</h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Mật khẩu (tối thiểu 8 ký tự)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
        />
        <input
          type="password"
          required
          placeholder="Nhập lại mật khẩu"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {submitting ? "Đang tạo tài khoản…" : "Đăng ký"}
        </button>
      </form>
      <p className="mt-4 text-sm">
        Đã có tài khoản?{" "}
        <Link href="/login" className="underline">
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
