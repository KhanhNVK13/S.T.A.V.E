/**
 * redesign/commit-dialog.tsx — UC-42 Create Commit.
 *
 * Nút "Commit Changes" ở header của bản redesign mở hộp thoại này.
 *
 * Phần tóm tắt thay đổi CHỈ ĐẾM số note/track thêm/xoá/sửa so với commit gần
 * nhất; vẽ diff trực quan lên piano roll là UC-45 (Compare) — phiên sau.
 * Nếu branch chưa có commit nào thì KHÔNG hiện số so sánh (không có gì để so,
 * hiện "0 thay đổi" sẽ gây hiểu nhầm) mà ghi rõ đây là bản ghi đầu tiên.
 */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { GitCommitHorizontal, RefreshCw } from "lucide-react";
import type { DraftSnapshot } from "@stave/shared-types";
import { COMMIT_MESSAGE_MAX_LENGTH } from "../../../lib/api-client";
import { summarizeChanges } from "./change-summary";
import type { ChangeCount } from "./change-summary";
import { Modal, ModalActions, ModalError, modalButtonStyles } from "./modal";
import { DC } from "./tokens";
import { useI18n } from "../../../context/i18n-context";
import { tNow } from "../../../lib/i18n";

interface CommitDialogProps {
  /** Bản nháp đang mở trên editor — đúng thứ sắp được ghi thành commit. */
  snapshot: DraftSnapshot;
  /** Snapshot của commit gần nhất trên branch; null = branch chưa có commit nào. */
  headSnapshot: DraftSnapshot | null;
  submitting: boolean;
  error: string | null;
  message: string;
  onMessageChange: (message: string) => void;
  onSubmit: (message: string) => void;
  onClose: () => void;
  /**
   * UC-70: có nên tự gọi AI khi hộp mở không (chỉ khi có commit trước đó
   * để so). Người gọi tự huỷ request trong khi hộp đóng (AbortSignal).
   */
  aiEnabled?: boolean;
  /** UC-70: lấy gợi ý commit message; null = bỏ qua AI (lỗi/không có khoá/trần tần suất). */
  onSuggestCommitMessage?: (signal: AbortSignal) => Promise<string | null>;
}

function countLabel(count: ChangeCount): string {
  const parts: string[] = [];
  if (count.added) parts.push(tNow("cd.added", { n: count.added }));
  if (count.removed) parts.push(tNow("cd.removed", { n: count.removed }));
  if (count.modified) parts.push(tNow("cd.modified", { n: count.modified }));
  return parts.length > 0 ? parts.join(" · ") : tNow("cd.unchanged");
}

export function CommitDialog({
  snapshot,
  headSnapshot,
  submitting,
  error,
  message,
  onMessageChange,
  onSubmit,
  onClose,
  aiEnabled = false,
  onSuggestCommitMessage,
}: CommitDialogProps) {
  const { t } = useI18n();
  const summary = headSnapshot ? summarizeChanges(headSnapshot, snapshot) : null;
  const trimmed = message.trim();
  // BR-39: 1–200 ký tự. Server vẫn validate lại; chặn ở đây chỉ để đỡ 1 vòng mạng.
  const canSubmit =
    trimmed.length > 0 &&
    message.length <= COMMIT_MESSAGE_MAX_LENGTH &&
    !submitting;

  // ── UC-70: gợi ý commit message bằng AI ─────────────────────────
  // Hộp mở lần đầu + ô trống → gọi AI một lần; có gợi ý thì điền vào kèm
  // nhãn "Gợi ý bởi AI" + nút "Tạo lại". Người dùng đã gõ gì thì KHÔNG ghi
  // đè (5.1). Lỗi / không có gợi ý / hộp đóng → im lặng, không chặn commit
  // (BR-79). Component chỉ được mount khi hộp mở (editor render điều kiện),
  // nên effect chạy đúng 1 lần = khi hộp mở; huỷ request khi unmount.
  const [aiBusy, setAiBusy] = useState(
    () => aiEnabled && !!onSuggestCommitMessage && message.trim().length === 0,
  );
  /** Gợi ý AI cuối cùng đã điền — dùng để biết nội dung hiện tại còn là của AI. */
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  // Ô nhập có nội dung người dùng tự gõ không? Dùng ref để lúc gợi ý về
  // kiểm tra được trạng thái MỚI NHẤT (state trong closure có thể cũ).
  const userTypedRef = useRef(message.trim().length > 0);

  /**
   * `refill=false` → gợi ý tự động khi hộp mở (aiBusy đã có từ state khởi
   * tạo, chỉ gọi request); `refill=true` → nút "Tạo lại", ghi đè ô nhập.
   */
  function runSuggestion(refill: boolean) {
    if (!onSuggestCommitMessage) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (refill) setAiBusy(true);
    void onSuggestCommitMessage(controller.signal)
      .then((suggestion) => {
        if (suggestion === null || controller.signal.aborted) return;
        // Người dùng đã gõ tay → không ghi đè (5.1). "Tạo lại" là hành vi
        // explicit nên ghi đè.
        if (refill || !userTypedRef.current) {
          onMessageChange(suggestion);
          setAiSuggestion(suggestion);
        }
      })
      .catch(() => {
        // Lỗi mạng/AI: bỏ qua, không hiện cảnh báo (BR-79).
      })
      .finally(() => {
        if (!controller.signal.aborted) setAiBusy(false);
      });
  }

  useEffect(() => {
    // Chỉ chạy khi hộp vừa mở (component mới mount), AI khả dụng và ô trống.
    if (!aiEnabled || !onSuggestCommitMessage) return;
    if (!userTypedRef.current) runSuggestion(false);
    // Hộp đóng (unmount) → huỷ request đang chờ.
    return () => controllerRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal title="Commit Changes" onClose={onClose} closeDisabled={submitting}>
      {/* ── Tóm tắt thay đổi ───────────────────────────────── */}
      <div style={styles.summaryBox}>
        {summary === null ? (
          <>
            <div style={styles.summaryTitle}>{t("cd.firstTitle")}</div>
            <div style={styles.summaryLine}>
              {t("cd.firstBody", { tracks: snapshot.tracks.length, notes: snapshot.notes.length })}
            </div>
          </>
        ) : (
          <>
            <div style={styles.summaryTitle}>{t("cd.changesTitle")}</div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryKey}>Note</span>
              <span style={styles.summaryValue}>{countLabel(summary.notes)}</span>
            </div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryKey}>Track</span>
              <span style={styles.summaryValue}>{countLabel(summary.tracks)}</span>
            </div>
            {summary.metaChanged && (
              <div style={styles.summaryRow}>
                <span style={styles.summaryKey}>{t("cd.timeTempo")}</span>
                <span style={styles.summaryValue}>{t("cd.hasChanges")}</span>
              </div>
            )}
            <div style={styles.summaryTotal}>
              {t("cd.total", { total: summary.total, tracks: snapshot.tracks.length, notes: snapshot.notes.length })}
            </div>
            {summary.total === 0 && (
              <div style={styles.summaryWarn}>
                {t("cd.noChanges")}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Message ────────────────────────────────────────── */}
      <div>
        <div style={styles.labelRow}>
          <label htmlFor="commit-message" style={styles.label}>
            {t("cd.message")}
          </label>
          <span
            style={{
              ...styles.counter,
              color:
                message.length > COMMIT_MESSAGE_MAX_LENGTH
                  ? DC.danger
                  : DC.textMuted,
            }}
          >
            {message.length}/{COMMIT_MESSAGE_MAX_LENGTH}
          </span>
        </div>
        <textarea
          id="commit-message"
          data-autofocus
          value={message}
          maxLength={COMMIT_MESSAGE_MAX_LENGTH}
          rows={3}
          placeholder={t("cd.placeholder")}
          aria-describedby="commit-message-hint"
          onChange={(e) => {
            // Người dùng tự gõ → gợi ý AI không được ghi đè, và nhãn
            // "Gợi ý bởi AI" không còn đúng nữa (5.1).
            userTypedRef.current = true;
            setAiSuggestion(null);
            onMessageChange(e.target.value);
          }}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter gửi nhanh; Enter thường vẫn xuống dòng.
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canSubmit) {
              onSubmit(trimmed);
            }
          }}
          style={styles.textarea}
        />
        {aiBusy ? (
          <div id="commit-message-hint" style={styles.helper}>
            {t("cd.aiBusy")}
          </div>
        ) : trimmed.length === 0 && message.length > 0 ? (
          <div id="commit-message-hint" style={styles.hint}>
            {t("cd.required")}
          </div>
        ) : (
          <div id="commit-message-hint" style={styles.helper}>
            {/* UC-70: nút AI chỉ hiện khi AI khả dụng (branch đã có commit để
                so). Ô đang chứa gợi ý của AI → nhãn + nút "Tạo lại"; người dùng
                tự gõ → chỉ còn nút xin gợi ý mới. */}
            {aiEnabled && onSuggestCommitMessage && aiSuggestion === message ? (
              <>
                {t("cd.aiLabel")}{" "}
                <button
                  type="button"
                  onClick={() => runSuggestion(true)}
                  style={styles.retryBtn}
                >
                  <RefreshCw size={12} className="mr-0.5 inline" />
                  {t("cd.aiRegenerate")}
                </button>
              </>
            ) : (
              <>
                {aiEnabled && onSuggestCommitMessage && (
                  <button
                    type="button"
                    onClick={() => runSuggestion(true)}
                    style={styles.retryBtn}
                  >
                    <RefreshCw size={12} className="mr-0.5 inline" />
                    {t("cd.aiSuggest")}
                  </button>
                )}
                {aiEnabled && onSuggestCommitMessage && " "}
                {trimmed.length === 0
                  ? t("cd.hintEmpty")
                  : t("cd.hintKeys")}
              </>
            )}
          </div>
        )}
      </div>

      {/* Lỗi hiển thị tại chỗ — nội dung đã gõ được giữ nguyên để sửa lại. */}
      {error && <ModalError message={error} />}

      <ModalActions>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          style={{
            ...modalButtonStyles.ghost,
            opacity: submitting ? 0.5 : 1,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {t("ui.cancel")}
        </button>
        <button
          type="button"
          onClick={() => onSubmit(trimmed)}
          disabled={!canSubmit}
          style={{
            ...modalButtonStyles.primary,
            opacity: canSubmit ? 1 : 0.5,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          <GitCommitHorizontal size={15} />
          {submitting ? t("cd.committing") : t("cd.create")}
        </button>
      </ModalActions>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  summaryBox: {
    background: DC.pageBg,
    border: `1px solid ${DC.border}`,
    borderRadius: 9,
    padding: 13,
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },
  summaryTitle: { fontSize: 12.5, fontWeight: 700, color: DC.text },
  summaryLine: { fontSize: 12.5, lineHeight: 1.6, color: DC.textMuted },
  summaryRow: { display: "flex", alignItems: "center", gap: 10 },
  summaryKey: {
    font: `700 11px ${DC.mono}`,
    letterSpacing: ".08em",
    color: DC.textMuted,
    width: 76,
    flexShrink: 0,
  },
  summaryValue: { font: `600 12px ${DC.mono}`, color: DC.text },
  summaryTotal: {
    fontSize: 12,
    color: DC.textMuted,
    borderTop: `1px solid ${DC.borderSoft}`,
    paddingTop: 7,
  },
  summaryWarn: { fontSize: 12, fontWeight: 600, color: DC.danger },
  labelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: { fontSize: 12.5, fontWeight: 600, color: DC.text },
  counter: { font: `500 11px ${DC.mono}` },
  textarea: {
    width: "100%",
    resize: "vertical",
    background: DC.surface,
    border: `1px solid ${DC.border}`,
    borderRadius: 8,
    padding: "9px 11px",
    fontSize: 13,
    lineHeight: 1.5,
    color: DC.text,
    fontFamily: "inherit",
  },
  hint: { marginTop: 6, fontSize: 12, color: DC.danger, fontWeight: 600 },
  helper: { marginTop: 6, fontSize: 12, color: DC.textMuted },
  retryBtn: {
    background: "none",
    border: "none",
    color: DC.accent,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    padding: 2,
    marginLeft: 4,
    borderRadius: 4,
  },
};
