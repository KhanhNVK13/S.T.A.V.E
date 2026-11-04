"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { JamEvent } from "@stave/shared-types";
import { Dialog, DialogActions, DialogError } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { adminEndJamEvent } from "../../../lib/api-jam";
import { apiErrorMessage } from "../../../lib/error-message";
import { useI18n } from "../../../context/i18n-context";

export interface EndJamConfirmModalProps {
  event: JamEvent;
  /** Số người đang có mặt trong phòng (từ dữ liệu listing/room). */
  participantCount?: number;
  onClosed: () => void;
  /** Thành công: thông báo toast (đã map tiếng Việt), kèm id sự kiện. */
  onEnded: (eventId: string) => void;
}

/**
 * UC-95 — hộp xác nhận "Kết thúc ngay" cho admin. Cảnh báo rõ ràng vì hành
 * động không hoàn tác được (đóng băng + lưu trữ + khóa chỉnh sửa). 1.1
 * (duc.md): nêu "đang có N người đang sửa" khi phòng còn người.
 */
export function EndJamConfirmModal({
  event,
  participantCount = 0,
  onClosed,
  onEnded,
}: EndJamConfirmModalProps) {
  const { t, tx } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      await adminEndJamEvent(event.id);
      onEnded(event.id);
    } catch (err) {
      // Hiển thị nguyên văn thông báo tiếng Việt (error-message.ts).
      setError(apiErrorMessage(err, t("aj.endFail")));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title={t("aj.endTitle")}
      titleClassName="text-foreground text-base"
      onClose={onClosed}
      closeDisabled={submitting}
      role="alertdialog"
      className="max-w-sm p-6"
    >
      <p className="text-sm text-muted">
        <strong className="text-foreground">{event.name}</strong>
      </p>
      {participantCount > 0 && (
        <p className="mt-2 text-xs text-muted">
          {tx("aj.endPeople", { n: <strong className="text-foreground">{participantCount}</strong> })}
        </p>
      )}
      <div className="mt-3 rounded-card border border-danger/40 bg-danger-muted p-3 text-xs text-danger">
        {t("aj.endWarn")}
      </div>
      <DialogError message={error} />
      <DialogActions>
        <Button variant="secondary" onClick={onClosed} disabled={submitting}>
          {t("aj.endBack")}
        </Button>
        <Button
          variant="danger"
          onClick={() => void handleConfirm()}
          disabled={submitting}
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {submitting ? t("aj.ending") : t("aj.endConfirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
