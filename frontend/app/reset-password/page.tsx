"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase-browser";
import { apiFetch } from "../../lib/api-client";
import { useAuth } from "../../context/auth-context";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 3000);
    return () => clearTimeout(timer);
  }, []);

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
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    if (updateError) {
      setSubmitting(false);
      setError(updateError.message);
      return;
    }

    // BR-10: revoke every other session now that the new password is set.
    await apiFetch("/auth/sessions/revoke-others", { method: "POST" }).catch(
      () => undefined,
    );
    setSubmitting(false);
    router.push("/");
  }

  if (loading || (!session && !waited)) {
    return <p className="p-6 text-sm opacity-60">Đang xử lý link…</p>;
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16">
        <h1 className="text-2xl font-bold">Link không hợp lệ hoặc đã hết hạn</h1>
        <p className="mt-4 text-sm opacity-80">
          Yêu cầu 1 link đặt lại mật khẩu mới ở trang Quên mật khẩu.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">Đặt mật khẩu mới</h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <input
          type="password"
          required
          minLength={8}
          placeholder="Mật khẩu mới (tối thiểu 8 ký tự)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
        />
        <input
          type="password"
          required
          placeholder="Nhập lại mật khẩu mới"
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
          {submitting ? "Đang lưu…" : "Đặt mật khẩu mới"}
        </button>
      </form>
    </div>
  );
}
