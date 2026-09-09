"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase-browser";
import { apiFetch } from "../../lib/api-client";
import { useAuth } from "../../context/auth-context";
import { AuthCard, AuthField, AUTH_INPUT_CLASS } from "../../components/auth-card";
import { Button } from "../../components/ui/button";

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
    return (
      <AuthCard>
        <div className="flex flex-col items-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-accent-600" />
          Đang xử lý link…
        </div>
      </AuthCard>
    );
  }

  if (!session) {
    return (
      <AuthCard title="Link không hợp lệ hoặc đã hết hạn">
        <p className="text-sm text-slate-500">
          Yêu cầu 1 link đặt lại mật khẩu mới ở trang Quên mật khẩu.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Đặt mật khẩu mới">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthField label="Mật khẩu mới">
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
        <AuthField label="Nhập lại mật khẩu mới">
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
          {submitting ? "Đang lưu…" : "Đặt mật khẩu mới"}
        </Button>
      </form>
    </AuthCard>
  );
}
