"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Smartphone,
  TriangleAlert,
  CircleUserRound,
  Lock,
  SlidersHorizontal,
  Music,
} from "lucide-react";
import { RequireAuth } from "../../components/require-auth";
import { useAuth } from "../../context/auth-context";
import { apiFetch, removeAvatar } from "../../lib/api-client";
import { uploadAvatar, validateAvatarFile } from "../../lib/avatar-upload";
import type { Profile } from "../../lib/types";
import { Button } from "../../components/ui/button";
import { Field, INPUT_CLASS } from "../../components/ui/form";
import { Avatar } from "../../components/ui/avatar";
import { ThemePicker } from "../../components/settings/theme-picker";
import { ConnectedAccounts } from "../../components/settings/connected-accounts";
import { Dialog } from "../../components/ui/dialog";
import { SoundLibraryPanel } from "../../components/custom-sound/sound-library-panel";
import { apiErrorMessage } from "../../lib/error-message";
import {validateRequired, validateMaxLength, REQUIRED_MESSAGE, focusFirstInvalid } from "../../lib/validation";

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

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
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const invalid = validateAvatarFile(file);
    if (invalid) {
      setAvatarMessage({ text: invalid, ok: false });
      return;
    }
    setAvatarBusy(true);
    setAvatarMessage(null);
    try {
      const newUrl = await uploadAvatar(file);
      setAvatarUrl(newUrl ?? "");
      await refreshProfile();
      setAvatarMessage({ text: "Đã cập nhật ảnh đại diện.", ok: true });
    } catch (err) {
      setAvatarMessage({
        text: apiErrorMessage(err, "Không tải được ảnh đại diện. Hãy thử lại với ảnh khác."),
        ok: false,
      });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleAvatarRemove() {
    setAvatarBusy(true);
    setAvatarMessage(null);
    try {
      await removeAvatar();
      await refreshProfile();
      setAvatarUrl("");
      setAvatarMessage({ text: "Đã xoá ảnh đại diện.", ok: true });
    } catch (err) {
      setAvatarMessage({ text: apiErrorMessage(err, "Không xoá được ảnh đại diện."), ok: false });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);
    setSuccess(false);
    const nameInvalid =
      validateRequired(displayName, "Vui lòng nhập tên hiển thị.") ??
      validateMaxLength(displayName, 80, "Tên hiển thị");
    const userInvalid = !username.trim()
      ? REQUIRED_MESSAGE
      : USERNAME_PATTERN.test(username)
        ? null
        : "Username gồm 3-20 ký tự: chữ thường, số hoặc dấu gạch dưới.";
    setDisplayNameError(nameInvalid);
    setUsernameError(userInvalid);
    if (nameInvalid || userInvalid) {
      focusFirstInvalid(form);
      return;
    }
    if (bio.length > 500) {
      setError("Giới thiệu tối đa 500 ký tự.");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch<Profile>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: displayName.trim(),
          username,
          bio,
          avatarUrl: avatarUrl.trim() || null,
        }),
      });
      await refreshProfile();
      setSuccess(true);
    } catch (err) {
      setError(apiErrorMessage(err, "Không lưu được hồ sơ."));
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
          <p className="text-xs text-muted">Email không thể thay đổi</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={avatarInputRef}
              type="file"
              name="avatarFile"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void handleAvatarFile(e)}
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={avatarBusy}
              onClick={() => avatarInputRef.current?.click()}
            >
              {avatarBusy ? "Đang xử lý…" : "Tải ảnh lên"}
            </Button>
            {profile?.avatar_url && (
              <Button type="button" variant="ghost" disabled={avatarBusy} onClick={() => void handleAvatarRemove()}>
                Xoá ảnh
              </Button>
            )}
            <span className="text-xs text-muted">JPG, PNG hoặc WebP, ảnh gốc tối đa 10 MB. Ảnh được cắt vuông và thu nhỏ còn 256×256 (tối đa 2 MB sau khi thu nhỏ).</span>
          </div>
          {avatarMessage && (
            <p
              role={avatarMessage.ok ? "status" : "alert"}
              className={`mt-1.5 text-xs ${avatarMessage.ok ? "text-success-foreground" : "text-danger"}`}
            >
              {avatarMessage.text}
            </p>
          )}
        </div>
      </div>

      {profile && (
        <p className="mb-5 text-xs text-muted">
          Địa chỉ trang công khai:{" "}
          <Link href={`/creator/${profile.id}`} className="font-mono text-accent hover:underline">
            /creator/{profile.id}
          </Link>
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex max-w-[560px] flex-col gap-3.5">
        <Field label="Tên hiển thị" error={displayNameError}>
          <input
            name="displayName"
            autoComplete="name"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setDisplayNameError(null);
            }}
            className={`${INPUT_CLASS} h-[37px]`}
          />
        </Field>
        <Field label="Username" error={usernameError}>
          <input
            name="username"
            autoComplete="username"
            spellCheck={false}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setUsernameError(null);
            }}
            className={`${INPUT_CLASS} h-[37px] font-mono`}
          />
        </Field>
        <Field label="Giới thiệu">
          <textarea
            name="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className={INPUT_CLASS}
          />
          <span
            className={`text-right font-mono text-xs tabular-nums ${bio.length > 500 ? "text-danger" : "text-muted"}`}
          >
            {bio.length}/500
          </span>
        </Field>
        <Field label="Avatar URL">
          <input
            name="avatarUrl"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            className={`${INPUT_CLASS} h-[37px]`}
          />
        </Field>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="text-xs text-success-foreground">
            Đã lưu.
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Đang lưu…" : "Lưu hồ sơ"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={submitting}
            onClick={() => {
              setDisplayName(profile?.display_name ?? "");
              setUsername(profile?.username ?? "");
              setBio(profile?.bio ?? "");
              setAvatarUrl(profile?.avatar_url ?? "");
              setDisplayNameError(null);
              setUsernameError(null);
              setError(null);
              setSuccess(false);
            }}
          >
            Huỷ thay đổi
          </Button>
        </div>
      </form>
    </>
  );
}

function ProfileTab() {
  const { profile, refreshProfile } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const [soundsOpen, setSoundsOpen] = useState(false);

  if (!profile) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-sm text-danger">
          Không tải được hồ sơ của bạn. Hãy kiểm tra kết nối rồi thử lại.
        </p>
        <Button
          variant="secondary"
          disabled={retrying}
          onClick={() => {
            setRetrying(true);
            void refreshProfile().finally(() => setRetrying(false));
          }}
        >
          {retrying ? "Đang tải…" : "Thử lại"}
        </Button>
      </div>
    );
  }
  return (
    <>
      <ProfileForm key={profile.id} />
      <SettingRow
        title="Thư viện âm thanh"
        description="Âm thanh riêng bạn đã tải lên hoặc ghi âm để gán cho nốt nhạc trong editor."
      >
        <Button variant="secondary" onClick={() => setSoundsOpen(true)}>
          <Music className="h-3.5 w-3.5" /> Mở thư viện
        </Button>
      </SettingRow>
      {soundsOpen && (
        <Dialog title="Thư viện âm thanh" onClose={() => setSoundsOpen(false)} className="max-w-xl p-6">
          <SoundLibraryPanel />
        </Dialog>
      )}
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
        {description && <div className="mt-1 text-xs text-muted">{description}</div>}
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
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);
    setSuccess(false);
    const currentInvalid = currentPassword ? null : REQUIRED_MESSAGE;
    const newInvalid = !newPassword
      ? REQUIRED_MESSAGE
      : newPassword.length < 8
        ? "Mật khẩu mới phải có ít nhất 8 ký tự."
        : newPassword === currentPassword
          ? "Mật khẩu mới phải khác mật khẩu hiện tại."
          : null;
    setCurrentError(currentInvalid);
    setNewError(newInvalid);
    if (currentInvalid || newInvalid) {
      focusFirstInvalid(form);
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
      setError(apiErrorMessage(err, "Không đổi được mật khẩu."));
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
            <span className="text-success-foreground">
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
        <form onSubmit={handleSubmit} noValidate className="flex max-w-[420px] flex-col gap-3.5 pb-4">
          <Field label="Mật khẩu hiện tại" error={currentError}>
            <input
              name="current-password"
              autoComplete="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                setCurrentError(null);
              }}
              className={`${INPUT_CLASS} h-[37px]`}
            />
          </Field>
          <Field label="Mật khẩu mới" error={newError}>
            <input
              name="new-password"
              autoComplete="new-password"
              type="password"
              placeholder="Tối thiểu 8 ký tự"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setNewError(null);
              }}
              className={`${INPUT_CLASS} h-[37px]`}
            />
          </Field>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
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
      setError(apiErrorMessage(err, "Không xoá được tài khoản."));
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
            name="password"
            autoComplete="current-password"
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

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tham số URL chỉ đọc được ở client
    if (requested === "security") setTab("security");
  }, []);

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
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">
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
              <ProfileTab />
            ) : tab === "personalization" ? (
              <ThemePicker />
            ) : (
              <>
                <h2 className="text-lg font-semibold">Bảo mật</h2>
                <p className="mb-2 mt-1.5 text-xs text-muted">
                  Bảo vệ tài khoản và kiểm soát các thiết bị đang truy cập.
                </p>

                <ChangePasswordForm />

                <ConnectedAccounts />

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
