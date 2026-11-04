"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth-context";
import { useT } from "../../context/i18n-context";
import { hasUnsavedWork } from "../../lib/unsaved-guard";
import { ConfirmDialog } from "../ui/confirm-dialog";

export function useSignOut(): { requestSignOut: () => void; signOutDialog: ReactNode } {
  const t = useT();
  const router = useRouter();
  const { signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);

  async function perform() {
    setConfirming(false);
    router.replace("/");
    await signOut();
  }

  function requestSignOut() {
    if (hasUnsavedWork()) {
      setConfirming(true);
      return;
    }
    void perform();
  }

  const signOutDialog = (
    <ConfirmDialog
      open={confirming}
      title={t("nav.signOutUnsavedTitle")}
      message={t("nav.signOutUnsavedBody")}
      confirmLabel={t("nav.signOutAnyway")}
      cancelLabel={t("nav.stay")}
      danger
      onConfirm={() => void perform()}
      onCancel={() => setConfirming(false)}
    />
  );

  return { requestSignOut, signOutDialog };
}
