"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RequireAuth } from "../../components/require-auth";
import { useAuth } from "../../context/auth-context";
import { apiFetch, ApiError } from "../../lib/api-client";
import type { Profile } from "../../lib/types";

function ProfileForm() {
  const { profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      await apiFetch<Profile>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName,
          username,
          bio,
          avatarUrl: avatarUrl || undefined,
        }),
      });
      await refreshProfile();
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="text-sm opacity-70">Email</label>
        <p className="mt-1">{profile?.email}</p>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Tên hiển thị
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Username
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Bio
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Avatar URL
        <input
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">Đã lưu.</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {submitting ? "Đang lưu…" : "Lưu thay đổi"}
      </button>
    </form>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input
        type="password"
        required
        placeholder="Mật khẩu hiện tại"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
      />
      <input
        type="password"
        required
        minLength={8}
        placeholder="Mật khẩu mới (tối thiểu 8 ký tự)"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && (
        <p className="text-sm text-green-600">
          Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded border border-black/20 px-3 py-2 disabled:opacity-50 dark:border-white/20"
      >
        {submitting ? "Đang xử lý…" : "Đổi mật khẩu"}
      </button>
    </form>
  );
}

function DeleteAccountSection() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/auth/account", {
        method: "DELETE",
        body: JSON.stringify({ password }),
      });
      await signOut();
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded border border-red-600 px-3 py-2 text-red-600"
      >
        Xoá tài khoản
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-red-600">
        Hành động này không thể hoàn tác. Nhập mật khẩu để xác nhận.
      </p>
      <input
        type="password"
        placeholder="Mật khẩu"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => void handleDelete()}
          disabled={submitting || !password}
          className="rounded bg-red-600 px-3 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Đang xoá…" : "Xác nhận xoá vĩnh viễn"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20"
        >
          Huỷ
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <div className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-2xl font-bold">Hồ sơ của tôi</h1>
        <Link
          href="/profile/sessions"
          className="mt-2 inline-block text-sm underline"
        >
          Xem các thiết bị đang đăng nhập
        </Link>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Thông tin cá nhân</h2>
          <div className="mt-4">
            <ProfileForm />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Đổi mật khẩu</h2>
          <div className="mt-4">
            <ChangePasswordForm />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Vùng nguy hiểm</h2>
          <div className="mt-4">
            <DeleteAccountSection />
          </div>
        </section>
      </div>
    </RequireAuth>
  );
}
