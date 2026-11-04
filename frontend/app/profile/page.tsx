"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Smartphone, TriangleAlert, Music } from "lucide-react";
import { RequireAuth } from "../../components/require-auth";
import { useAuth } from "../../context/auth-context";
import { apiFetch, removeAvatar } from "../../lib/api-client";
import { uploadAvatar, validateAvatarFile } from "../../lib/avatar-upload";
import type { Profile } from "../../lib/types";
import { useI18n } from "../../context/i18n-context";
import { Button } from "../../components/ui/button";
import { Field, INPUT_CLASS } from "../../components/ui/form";
import { Avatar } from "../../components/ui/avatar";
import { ConnectedAccounts } from "../../components/settings/connected-accounts";
import { Dialog } from "../../components/ui/dialog";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { PageHeader } from "../../components/ui/page-header";
import { Tabs } from "../../components/ui/tabs";
import { SoundLibraryPanel } from "../../components/custom-sound/sound-library-panel";
import { apiErrorMessage } from "../../lib/error-message";
import {validateRequired, validateMaxLength, requiredMessage, focusFirstInvalid } from "../../lib/validation";

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

type SettingsTab = "profile" | "security";

function ProfileForm() {
  const { t } = useI18n();
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
      setAvatarMessage({ text: t("profile.avatarUpdated"), ok: true });
    } catch (err) {
      setAvatarMessage({
        text: apiErrorMessage(err, t("profile.avatarUploadFail")),
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
      setAvatarMessage({ text: t("profile.avatarRemoved"), ok: true });
    } catch (err) {
      setAvatarMessage({ text: apiErrorMessage(err, t("profile.avatarRemoveFail")), ok: false });
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
      validateRequired(displayName, t("profile.displayNameRequired")) ??
      validateMaxLength(displayName, 80, t("profile.displayName"));
    const userInvalid = !username.trim()
      ? requiredMessage()
      : USERNAME_PATTERN.test(username)
        ? null
        : t("profile.usernameRule");
    setDisplayNameError(nameInvalid);
    setUsernameError(userInvalid);
    if (nameInvalid || userInvalid) {
      focusFirstInvalid(form);
      return;
    }
    if (bio.length > 500) {
      setError(t("profile.bioMax"));
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
      setError(apiErrorMessage(err, t("profile.saveFail")));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="flex flex-col items-start gap-3">
        <Avatar
          id={profile?.id ?? ""}
          label={displayName || profile?.email || "?"}
          imageUrl={avatarUrl}
          size="lg"
        />
        <div className="min-w-0 max-w-full">
          <p className="truncate text-[13px] font-semibold">{profile?.email}</p>
          <p className="text-xs text-muted">{t("profile.emailLocked")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={avatarInputRef}
            type="file"
            name="avatarFile"
            accept="image/jpeg,image/png,image/webp"
            aria-label={t("accountPages.avatarFile")}
            onChange={(e) => void handleAvatarFile(e)}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={avatarBusy}
            onClick={() => avatarInputRef.current?.click()}
          >
            {avatarBusy ? t("profile.busy") : t("profile.upload")}
          </Button>
          {profile?.avatar_url && (
            <Button type="button" variant="ghost" disabled={avatarBusy} onClick={() => void handleAvatarRemove()}>
              {t("profile.removePhoto")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">{t("profile.avatarHint")}</p>
        {avatarMessage && (
          <p
            role={avatarMessage.ok ? "status" : "alert"}
            className={`text-xs ${avatarMessage.ok ? "text-success-foreground" : "text-danger"}`}
          >
            {avatarMessage.text}
          </p>
        )}
        {profile && (
          <p className="max-w-full break-all text-xs text-muted">
            {t("profile.publicAddress")}{" "}
            <Link href={`/creator/${profile.id}`} className="font-mono text-accent hover:underline">
              /creator/{profile.id}
            </Link>
          </p>
        )}
      </aside>

      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{t("profile.tabProfile")}</h2>
        <p className="mb-5 mt-1.5 text-xs text-muted">
          {t("profile.publicNote")}
        </p>

        <form onSubmit={handleSubmit} noValidate className="flex max-w-[560px] flex-col gap-3.5">
          <Field label={t("profile.displayName")} error={displayNameError}>
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
          <Field label={t("accountPages.username")} error={usernameError}>
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
          <Field label={t("profile.bio")}>
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
          <Field label={t("accountPages.avatarUrl")}>
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
              {t("profile.saved")}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? t("profile.saving") : t("profile.save")}
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
              {t("profile.discard")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { t } = useI18n();
  const { profile, refreshProfile } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const [soundsOpen, setSoundsOpen] = useState(false);

  if (!profile) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-sm text-danger">
          {t("profile.loadFail")}
        </p>
        <Button
          variant="secondary"
          disabled={retrying}
          onClick={() => {
            setRetrying(true);
            void refreshProfile().finally(() => setRetrying(false));
          }}
        >
          {retrying ? t("profile.loadingShort") : t("ui.retry")}
        </Button>
      </div>
    );
  }
  return (
    <>
      <ProfileForm key={profile.id} />
      <SettingRow
        title={t("profile.soundLibrary")}
        description={t("profile.soundLibraryDesc")}
      >
        <Button variant="secondary" onClick={() => setSoundsOpen(true)}>
          <Music className="h-3.5 w-3.5" /> {t("profile.openLibrary")}
        </Button>
      </SettingRow>
      {soundsOpen && (
        <Dialog title={t("profile.soundLibrary")} onClose={() => setSoundsOpen(false)} className="max-w-xl p-6">
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
  const { t } = useI18n();
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
    const currentInvalid = currentPassword ? null : requiredMessage();
    const newInvalid = !newPassword
      ? requiredMessage()
      : newPassword.length < 8
        ? t("profile.newPasswordShort")
        : newPassword === currentPassword
          ? t("profile.newPasswordSame")
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
      setError(apiErrorMessage(err, t("profile.changeFail")));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SettingRow
        title={t("profile.password")}
        description={
          success ? (
            <span className="text-success-foreground">
              {t("profile.passwordChanged")}
            </span>
          ) : (
            t("profile.passwordHint")
          )
        }
      >
        <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
          {open ? t("ui.close") : t("profile.changePassword")}
        </Button>
      </SettingRow>

      {open && (
        <form onSubmit={handleSubmit} noValidate className="flex max-w-[420px] flex-col gap-3.5 pb-4">
          <Field label={t("profile.currentPassword")} error={currentError}>
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
          <Field label={t("profile.newPassword")} error={newError}>
            <input
              name="new-password"
              autoComplete="new-password"
              type="password"
              placeholder={t("auth.passwordMin")}
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
              {submitting ? t("profile.busy") : t("profile.updatePassword")}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

function DeleteAccountSection() {
  const { t } = useI18n();
  const router = useRouter();
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setConfirming(false);
    setPassword("");
    setError(null);
  }

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
      setError(apiErrorMessage(err, t("profile.deleteFail")));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SettingRow
        title={t("profile.deleteAccount")}
        description={t("profile.deleteHint")}
      >
        <Button variant="danger" onClick={() => setConfirming(true)}>
          <TriangleAlert className="h-3.5 w-3.5" /> {t("profile.deleteAccount")}
        </Button>
      </SettingRow>

      <ConfirmDialog
        open={confirming}
        title={t("profile.deleteAccount")}
        message={
          <div className="flex flex-col gap-3">
            <p className="text-danger">{t("profile.deleteConfirmLead")}</p>
            <input
              name="password"
              autoComplete="current-password"
              type="password"
              placeholder={t("auth.password")}
              aria-label={t("auth.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-autofocus
              className={`${INPUT_CLASS} h-[37px]`}
            />
          </div>
        }
        confirmLabel={t("profile.deleteConfirm")}
        danger
        loading={submitting}
        confirmDisabled={!password}
        error={error}
        onConfirm={() => void handleDelete()}
        onCancel={close}
      />
    </>
  );
}

const SETTINGS_TABS: { id: SettingsTab; label: "profile.tabProfile" | "profile.tabSecurity" }[] = [
  { id: "profile", label: "profile.tabProfile" },
  { id: "security", label: "profile.tabSecurity" },
];

export default function ProfilePage() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [tab, setTab] = useState<SettingsTab>("profile");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tham số URL chỉ đọc được ở client
    if (requested === "security") setTab("security");
  }, []);

  return (
    <RequireAuth>
      <div className="mx-auto max-w-5xl px-5 py-8">
        <PageHeader
          breadcrumbs={[{ label: t("profile.eyebrow") }]}
          title={profile?.display_name ?? profile?.username ?? t("profile.myProfile")}
          description={t("profile.lead")}
        />

        <Tabs
          tabs={SETTINGS_TABS.map((item) => ({ id: item.id, label: t(item.label) }))}
          active={tab}
          onChange={(id) => setTab(id as SettingsTab)}
        />

        <section
          role="tabpanel"
          aria-label={t(tab === "profile" ? "profile.tabProfile" : "profile.tabSecurity")}
          className="mt-5 min-h-[480px] rounded-card border border-border bg-surface/80 p-6"
        >
          {tab === "profile" ? (
            <ProfileTab />
          ) : (
            <>
              <h2 className="text-lg font-semibold">{t("profile.tabSecurity")}</h2>
              <p className="mb-2 mt-1.5 text-xs text-muted">
                {t("profile.securityLead")}
              </p>

              <ChangePasswordForm />

              <ConnectedAccounts />

              <SettingRow
                title={t("profile.devices")}
                description={t("profile.devicesDesc")}
              >
                <Link
                  href="/profile/sessions"
                  className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-border-strong bg-surface-subtle/60 px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-surface-muted"
                >
                  <Smartphone aria-hidden="true" className="h-3.5 w-3.5" /> {t("profile.manage")}
                </Link>
              </SettingRow>

              <DeleteAccountSection />
            </>
          )}
        </section>
      </div>
    </RequireAuth>
  );
}
