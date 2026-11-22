"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TERMS_VERSION, needsTermsAcceptance } from "@stave/shared-types";
import { useAuth } from "../context/auth-context";
import { useI18n } from "../context/i18n-context";
import { acceptTerms } from "../lib/api-client";
import { Button } from "./ui/button";
import { Dialog, DialogActions, DialogError } from "./ui/dialog";

export function TermsGate() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  if (!user || !profile || !needsTermsAcceptance(profile.terms_accepted_version) || pathname === "/terms") return null;

  async function handleAccept() {
    if (!agreed || saving) return;
    setSaving(true);
    setError(false);
    try {
      await acceptTerms(TERMS_VERSION);
      await refreshProfile();
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  async function handleDecline() {
    router.replace("/");
    await signOut();
  }

  return (
    <Dialog
      open
      role="alertdialog"
      title={t("terms.gateTitle")}
      onClose={() => undefined}
      closeDisabled
      className="max-w-lg p-6"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm">{t("terms.gateIntro")}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>{t("terms.sum1")}</li>
          <li>{t("terms.sum2")}</li>
          <li>{t("terms.sum3")}</li>
          <li>{t("terms.sum4")}</li>
        </ul>
        <a href="/terms" target="_blank" rel="noreferrer" className="text-sm text-accent underline underline-offset-2">
          {t("terms.readFull")}
        </a>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="terms-agree"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={saving}
            data-autofocus
            className="mt-0.5 accent-accent"
          />
          <span>{t("terms.agreeLabel")}</span>
        </label>
        <DialogError message={error ? t("terms.errAccept") : null} />
        <p className="text-xs text-muted">{t("terms.declineHint")}</p>
        <DialogActions>
          <Button type="button" variant="ghost" onClick={handleDecline} disabled={saving}>
            {t("terms.decline")}
          </Button>
          <Button type="button" onClick={handleAccept} disabled={!agreed || saving}>
            {saving ? t("terms.accepting") : t("terms.accept")}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
