"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Smartphone, TriangleAlert } from "lucide-react";
import { RequireAuth } from "../../components/require-auth";
import { useAuth } from "../../context/auth-context";
import { apiFetch, ApiError } from "../../lib/api-client";
import type { Profile } from "../../lib/types";
import { PageHeader } from "../../components/ui/page-header";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Field, INPUT_CLASS } from "../../components/ui/form";
import { Tabs, TabPanel } from "../../components/ui/tabs";
import { Avatar } from "../../components/ui/avatar";

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
    <Card className="p-6">
      <div className="mb-6 flex items-center gap-4">
        <Avatar
          id={profile?.id ?? ""}
          label={displayName || profile?.email || "?"}
          imageUrl={avatarUrl}
          size="lg"
        />
        <div>
          <p className="text-sm font-medium text-slate-700">{profile?.email}</p>
          <p className="text-xs text-slate-400">Email không thể thay đổi</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Tên hiển thị">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Username">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Bio">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Avatar URL">
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
            className={INPUT_CLASS}
          />
        </Field>
        {error && <p className="text-sm text-danger-600">{error}</p>}
        {success && <p className="text-sm text-success-600">Đã lưu.</p>}
        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </div>
      </form>
    </Card>
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
    <Card className="p-6">
      <h2 className="mb-4 text-base font-semibold text-slate-900">Đổi mật khẩu</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Mật khẩu hiện tại">
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Mật khẩu mới">
          <input
            type="password"
            required
            minLength={8}
            placeholder="Tối thiểu 8 ký tự"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        {error && <p className="text-sm text-danger-600">{error}</p>}
        {success && (
          <p className="text-sm text-success-600">
            Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.
          </p>
        )}
        <div>
          <Button type="submit" variant="secondary" disabled={submitting}>
            {submitting ? "Đang xử lý…" : "Đổi mật khẩu"}
          </Button>
        </div>
      </form>
    </Card>
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

  return (
    <Card className="border-danger-600/20 p-6">
      <div className="mb-4 flex items-center gap-2">
        <TriangleAlert className="h-5 w-5 text-danger-600" />
        <h2 className="text-base font-semibold text-slate-900">Vùng nguy hiểm</h2>
      </div>
      {!confirming ? (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Xoá tài khoản
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-danger-600">
            Hành động này không thể hoàn tác. Nhập mật khẩu để xác nhận.
          </p>
          <input
            type="password"
            placeholder="Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${INPUT_CLASS} max-w-xs`}
          />
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={() => void handleDelete()}
              disabled={submitting || !password}
            >
              {submitting ? "Đang xoá…" : "Xác nhận xoá vĩnh viễn"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Huỷ
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function ProfilePage() {
  const [tab, setTab] = useState<"profile" | "security">("profile");

  return (
    <RequireAuth>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <PageHeader title="Hồ sơ của tôi" />

        <Tabs
          tabs={[
            { id: "profile", label: "Profile" },
            { id: "security", label: "Security" },
          ]}
          active={tab}
          onChange={(id) => setTab(id as "profile" | "security")}
        />

        <div className="mt-6 flex flex-col gap-6">
          <TabPanel hidden={tab !== "profile"}>
            <ProfileForm />
          </TabPanel>

          <TabPanel hidden={tab !== "security"}>
            <div className="flex flex-col gap-6">
              <ChangePasswordForm />
              <Card className="flex items-center justify-between p-6">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Thiết bị đang đăng nhập</p>
                    <p className="text-xs text-slate-500">Xem và đăng xuất từng thiết bị</p>
                  </div>
                </div>
                <Link href="/profile/sessions">
                  <Button variant="secondary">Quản lý</Button>
                </Link>
              </Card>
              <DeleteAccountSection />
            </div>
          </TabPanel>
        </div>
      </div>
    </RequireAuth>
  );
}
