"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import type { ReportReason } from "@stave/shared-types";
import { Button } from "../ui/button";
import { Toast } from "../ui/toast";
import { ReportDialog } from "./report-dialog";
import { useAuth } from "../../context/auth-context";
import { useI18n } from "../../context/i18n-context";

export function ReportProjectButton({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState(false);
  const dismissToast = useCallback(() => setSent(false), []);

  function handleOpen() {
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(`/projects/${projectId}`)}`);
      return;
    }
    setOpen(true);
  }

  function handleSent() {
    setOpen(false);
    setReason(null);
    setDetails("");
    setSent(true);
  }

  return (
    <>
      <Button variant="ghost" onClick={handleOpen}>
        <Flag aria-hidden="true" className="h-3.5 w-3.5" /> {t("rpt.report")}
      </Button>
      {open && (
        <ReportDialog
          projectId={projectId}
          reason={reason}
          details={details}
          onReasonChange={setReason}
          onDetailsChange={setDetails}
          onClose={() => setOpen(false)}
          onSent={handleSent}
        />
      )}
      {sent && <Toast message={t("rpt.sent")} variant="success" onDismiss={dismissToast} />}
    </>
  );
}
