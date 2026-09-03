"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push("/");
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">Đăng nhập</h1>
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
          placeholder="Mật khẩu"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
      <button
        onClick={() => void handleGoogle()}
        className="mt-3 w-full rounded border border-black/20 px-3 py-2 dark:border-white/20"
      >
        Đăng nhập với Google
      </button>
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/forgot-password" className="underline">
          Quên mật khẩu?
        </Link>
        <Link href="/register" className="underline">
          Chưa có tài khoản?
        </Link>
      </div>
    </div>
  );
}
