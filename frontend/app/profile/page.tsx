"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Smartphone,
  TriangleAlert,
  CircleUserRound,
  Lock,
  SlidersHorizontal,
} from "lucide-react";
import { RequireAuth } from "../../components/require-auth";
import { useAuth } from "../../context/auth-context";
import { apiFetch, ApiError } from "../../lib/api-client";
import type { Profile } from "../../lib/types";
import { Button } from "../../components/ui/button";
import { Field, INPUT_CLASS } from "../../components/ui/form";
import { Avatar } from "../../components/ui/avatar";
import { ThemePicker } from "../../components/settings/theme-picker";

type SettingsTab = "profile" | "security" | "personalization";

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
    <>
      <h2 className="text-lg font-semibold">Hồ sơ</h2>
      <p className="mb-5 mt-1.5 text-xs text-muted">
        Những thông tin này hiển thị trên trang tác giả công khai của bạn.
      </p>

      <div className="mb-5 flex items-center gap-3">
        <Avatar
          id={profile?.id ?? ""}
          label={displayName || profile?.email || "?"}
          imageUrl={avatarUrl}
          size="lg"
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{profile?.email}</p>
          <p className="text-[11px] text-muted">Email không thể thay đổi</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex max-w-[560px] flex-col gap-3.5">
        <Field label="Tên hiển thị">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={`${INPUT_CLASS} h-[37px]`}
          />
        </Field>
        <Field label="Username">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={`${INPUT_CLASS} h-[37px] font-mono`}
          />
        </Field>
        <Field label="Giới thiệu">
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
            className={`${INPUT_CLASS} h-[37px]`}
          />
        </Field>
        {error && <p className="text-xs text-danger">{error}</p>}
        {success && <p className="text-xs text-success">Đã lưu.</p>}
        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Đang lưu…" : "Lưu hồ sơ"}
          </Button>
        </div>
      </form>
    </>
  );
}

/** Một dòng cài đặt: mô tả bên trái, hành động/trạng thái bên phải. */
function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[75px] flex-wrap items-center justify-between gap-3 border-t border-border py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold">{title}</p>
        {description && <div className="mt-1 text-[11px] text-muted">{description}</div>}
      </div>
      {children}
    </div>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

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
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SettingRow
        title="Mật khẩu"
        description={
          success ? (
            <span className="text-success">
              Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.
            </span>
          ) : (
            "Dùng mật khẩu đủ mạnh và không dùng lại ở nơi khác."
          )
        }
      >
        <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
          {open ? "Đóng" : "Đổi mật khẩu"}
        </Button>
      </SettingRow>

      {open && (
        <form onSubmit={handleSubmit} className="flex max-w-[420px] flex-col gap-3.5 pb-4">
          <Field label="Mật khẩu hiện tại">
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={`${INPUT_CLASS} h-[37px]`}
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
              className={`${INPUT_CLASS} h-[37px]`}
            />
          </Field>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Đang xử lý…" : "Cập nhật mật khẩu"}
            </Button>
          </div>
        </form>
      )}
    </>
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
    <>
      <SettingRow
        title="Xoá tài khoản"
        description="Hành động này không thể hoàn tác — toàn bộ dự án và lịch sử sẽ bị xoá."
      >
        {!confirming && (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            <TriangleAlert className="h-3.5 w-3.5" /> Xoá tài khoản
          </Button>
        )}
      </SettingRow>

      {confirming && (
        <div className="flex max-w-[420px] flex-col gap-3 pb-4">
          <p className="text-xs text-danger">Nhập mật khẩu để xác nhận xoá vĩnh viễn.</p>
          <input
            type="password"
            placeholder="Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${INPUT_CLASS} h-[37px]`}
          />
          {error && <p className="text-xs text-danger">{error}</p>}
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
    </>
  );
}

export default function ProfilePage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<SettingsTab>("profile");

  const navItemClass = (id: SettingsTab) =>
    `flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-xs transition-colors ${
      tab === id
        ? "bg-accent-muted font-bold text-accent"
        : "text-muted hover:bg-surface-subtle hover:text-foreground"
    }`;

  return (
    <RequireAuth>
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
            Cài đặt tài khoản
          </p>
          <h1 className="mb-1 mt-0.5 text-[26px] font-semibold leading-tight tracking-tight">
            {profile?.display_name ?? profile?.username ?? "Hồ sơ của tôi"}
          </h1>
          <p className="text-sm text-muted">
            Quản lý hồ sơ công khai, bảo mật tài khoản và giao diện làm việc.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-[210px_minmax(0,1fr)]">
          <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            <button onClick={() => setTab("profile")} className={navItemClass("profile")}>
              <CircleUserRound className="h-4 w-4" /> Hồ sơ
            </button>
            <button onClick={() => setTab("security")} className={navItemClass("security")}>
              <Lock className="h-4 w-4" /> Bảo mật
            </button>
            <button
              onClick={() => setTab("personalization")}
              className={navItemClass("personalization")}
            >
              <SlidersHorizontal className="h-4 w-4" /> Cá nhân hoá
            </button>
          </nav>

          <section className="min-h-[480px] rounded-card border border-border bg-surface p-6">
            {tab === "profile" ? (
              <ProfileForm />
            ) : tab === "personalization" ? (
              <ThemePicker />
            ) : (
              <>
                <h2 className="text-lg font-semibold">Bảo mật</h2>
                <p className="mb-2 mt-1.5 text-xs text-muted">
                  Bảo vệ tài khoản và kiểm soát các thiết bị đang truy cập.
                </p>

                <ChangePasswordForm />

                <SettingRow
                  title="Thiết bị đang đăng nhập"
                  description="Xem và đăng xuất từng thiết bị đang truy cập tài khoản."
                >
                  <Link href="/profile/sessions">
                    <Button variant="secondary">
                      <Smartphone className="h-3.5 w-3.5" /> Quản lý
                    </Button>
                  </Link>
                </SettingRow>

                <DeleteAccountSection />
              </>
            )}
          </section>
        </div>
      </div>
    </RequireAuth>
  );
}
