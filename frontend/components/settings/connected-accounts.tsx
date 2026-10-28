"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserIdentity } from "@supabase/supabase-js";
import { Link2, Unlink } from "lucide-react";
import { supabase } from "../../lib/supabase-browser";
import { apiFetch } from "../../lib/api-client";
import { authErrorMessage } from "../../lib/error-message";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Field, INPUT_CLASS } from "../ui/form";

const LINK_PENDING_KEY = "stave_google_link_pending";
const MIN_PASSWORD_LENGTH = 8;

function notifyBackend(event: "connected" | "disconnected", email?: string) {
  void apiFetch("/account/connected-accounts/notify", {
    method: "POST",
    body: JSON.stringify({ event, email }),
  }).catch(() => {});
}

function readReturnError(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const code = hash.get("error_code") ?? query.get("error_code");
  const error = hash.get("error") ?? query.get("error");
  if (!code && !error) return null;
  return authErrorMessage({ code: code ?? error ?? undefined });
}

function clearReturnParams() {
  const url = new URL(window.location.href);
  for (const key of ["error", "error_code", "error_description"]) url.searchParams.delete(key);
  url.hash = "";
  window.history.replaceState(null, "", url.toString());
}

export function ConnectedAccounts() {
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.auth.getUserIdentities();
    if (loadError) {
      setError(authErrorMessage(loadError));
      return null;
    }
    setIdentities(data.identities);
    return data.identities;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const returnError = readReturnError();
      if (returnError) {
        if (!cancelled) setError(returnError);
        clearReturnParams();
      }
      const loaded = await load();
      if (cancelled || !loaded) return;

      let pending = false;
      try {
        pending = window.sessionStorage.getItem(LINK_PENDING_KEY) === "1";
        if (pending) window.sessionStorage.removeItem(LINK_PENDING_KEY);
      } catch {}
      if (pending && !returnError && loaded.some((identity) => identity.provider === "google")) {
        notifyBackend("connected");
        setInfo("Đã kết nối tài khoản Google.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const google = identities?.find((identity) => identity.provider === "google") ?? null;
  const googleEmail = (google?.identity_data?.email as string | undefined) ?? "";
  const hasPassword = identities?.some((identity) => identity.provider === "email") ?? false;

  async function handleConnect() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      window.sessionStorage.setItem(LINK_PENDING_KEY, "1");
    } catch {}
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/profile?tab=security` },
    });
    if (linkError) {
      try {
        window.sessionStorage.removeItem(LINK_PENDING_KEY);
      } catch {}
      setError(authErrorMessage(linkError));
      setBusy(false);
    }
  }

  function handleDisconnectClick() {
    setError(null);
    setInfo(null);
    if (!hasPassword) {
      setNeedsPassword(true);
      return;
    }
    setConfirmOpen(true);
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(authErrorMessage(updateError));
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setNeedsPassword(false);
    await load();
    setConfirmOpen(true);
  }

  async function handleConfirmDisconnect() {
    if (!google) return;
    setBusy(true);
    setError(null);
    const { error: unlinkError } = await supabase.auth.unlinkIdentity(google);
    setBusy(false);
    setConfirmOpen(false);
    if (unlinkError) {
      setError(authErrorMessage(unlinkError));
      return;
    }
    notifyBackend("disconnected", googleEmail || undefined);
    setInfo("Đã ngắt kết nối tài khoản Google. Từ giờ bạn đăng nhập bằng mật khẩu.");
    await load();
  }

  return (
    <div className="border-t border-border py-3">
      <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold">Tài khoản liên kết</p>
          <div className="mt-1 text-xs text-muted">
            {identities === null ? (
              "Đang tải…"
            ) : google ? (
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="success">Google</Badge>
                <span className="font-mono">{googleEmail || "Đã liên kết"}</span>
              </span>
            ) : (
              "Liên kết tài khoản Google để đăng nhập nhanh hơn. Mật khẩu hiện tại vẫn dùng được."
            )}
          </div>
        </div>
        {identities !== null &&
          (google ? (
            <Button variant="secondary" onClick={handleDisconnectClick} disabled={busy}>
              <Unlink className="h-3.5 w-3.5" /> Ngắt kết nối
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void handleConnect()} disabled={busy}>
              <Link2 className="h-3.5 w-3.5" /> {busy ? "Đang chuyển tới Google…" : "Kết nối"}
            </Button>
          ))}
      </div>

      {needsPassword && (
        <form onSubmit={(e) => void handleSetPassword(e)} className="mt-3 flex max-w-sm flex-col gap-3">
          <p className="text-xs text-muted">
            Tài khoản của bạn chưa có mật khẩu. Hãy đặt mật khẩu trước khi ngắt kết nối Google để vẫn đăng nhập được.
          </p>
          <Field label="Mật khẩu mới">
            <input
              name="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Nhập lại mật khẩu">
            <input
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Đang lưu…" : "Đặt mật khẩu"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setNeedsPassword(false);
                setPassword("");
                setConfirmPassword("");
                setError(null);
              }}
              disabled={busy}
            >
              Huỷ
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="mt-2 text-xs text-success-foreground">
          {info}
        </p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Ngắt kết nối Google?"
        message={
          <>
            Sau khi ngắt kết nối, bạn phải đăng nhập bằng email và mật khẩu. Tài khoản Google{" "}
            <strong>{googleEmail}</strong> sẽ không còn đăng nhập được vào STAVE.
          </>
        }
        confirmLabel="Ngắt kết nối"
        danger
        loading={busy}
        onConfirm={() => void handleConfirmDisconnect()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
