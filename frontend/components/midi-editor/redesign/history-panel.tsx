/**
 * redesign/history-panel.tsx
 * Panel phải "Project History" — vị trí/kích thước theo mockup
 * (STAVE.dc.html screen "editor", dòng 259–306).
 *
 * Nội dung là DỮ LIỆU THẬT từ backend Version Control:
 *   UC-43 danh sách commit theo branch (mới nhất trước)
 *   UC-44 gắn tag cho 1 commit
 *   UC-46 mở hộp thoại khôi phục 1 phiên bản
 * Cộng thêm card "Bản nháp hiện tại" (trạng thái autosave + số track/note).
 *
 * CHƯA có ở đây (đúng phạm vi đã thống nhất, làm ở phiên sau): so sánh 2 phiên
 * bản (UC-45), dropdown chọn branch / tạo branch (UC-47→52), merge (UC-51/86).
 * Branch vẫn là chip TĨNH vì project hiện chỉ thao tác trên branch mặc định.
 */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { GitBranch, GitCommitVertical, History, Tag } from "lucide-react";
import { TAG_NAME_MAX_LENGTH } from "../../../lib/api-client";
import type { CommitWithAuthor } from "../../../lib/api-client";
import { formatRelativeTime } from "../../../lib/format-date";
import { DC, DC_SIZE } from "./tokens";
import type { VersionControl } from "./use-version-control";

interface HistoryPanelProps {
  /** Tên branch đang thao tác — lấy từ branch mặc định thật của project. */
  branchName: string;
  saveStatus: "saved" | "saving" | "unsaved";
  trackCount: number;
  noteCount: number;
  vc: VersionControl;
  /** Mở hộp thoại xác nhận khôi phục (UC-46) cho commit được chọn. */
  onRequestRestore: (commit: CommitWithAuthor) => void;
}

const SAVE_LABEL: Record<HistoryPanelProps["saveStatus"], string> = {
  saved: "Đã lưu nháp",
  saving: "Đang lưu…",
  unsaved: "Có thay đổi chưa lưu",
};

const SAVE_COLOR: Record<HistoryPanelProps["saveStatus"], string> = {
  saved: DC.success,
  saving: DC.warning,
  unsaved: DC.danger,
};

function authorLabel(commit: CommitWithAuthor): string {
  return (
    commit.author.display_name ?? commit.author.username ?? "Không rõ tác giả"
  );
}

export function HistoryPanel({
  branchName,
  saveStatus,
  trackCount,
  noteCount,
  vc,
  onRequestRestore,
}: HistoryPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [taggingId, setTaggingId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  const { clearTagError } = vc;

  useEffect(() => {
    if (taggingId !== null) tagInputRef.current?.focus();
  }, [taggingId]);

  function openTagInput(commit: CommitWithAuthor) {
    clearTagError();
    setTagDraft(commit.tags[0]?.name ?? "");
    setTaggingId(commit.id);
  }

  function closeTagInput() {
    clearTagError();
    setTaggingId(null);
    setTagDraft("");
  }

  async function submitTag(commitId: string) {
    const name = tagDraft.trim();
    if (!name) return;
    const ok = await vc.tag(commitId, name);
    // Lỗi (VD trùng tên trong project — BR-44) giữ nguyên ô nhập để sửa lại.
    if (ok) closeTagInput();
  }

  return (
    <aside style={styles.root}>
      <div style={styles.header}>
        <div style={styles.title}>Project History</div>
        {/* Branch Management (UC-47+) chưa xây → chip tĩnh, không làm dropdown giả. */}
        <div style={styles.branchChip} title="Branch mặc định của project">
          <GitBranch size={15} color={DC.accent} />
          <span style={styles.branchName}>{branchName}</span>
        </div>
      </div>

      {vc.notice && <div style={styles.notice}>{vc.notice}</div>}

      {/* Dữ liệu thật: trạng thái bản nháp đang mở */}
      <div style={styles.draftSection}>
        <div style={styles.draftCard}>
          <div style={styles.draftCardHead}>
            <span style={{ ...styles.statusDot, background: SAVE_COLOR[saveStatus] }} />
            <span style={styles.draftCardTitle}>Bản nháp hiện tại</span>
          </div>
          <div style={styles.draftCardMeta}>
            {SAVE_LABEL[saveStatus]} · {trackCount} track · {noteCount} note
          </div>
        </div>
      </div>

      {/* ── Lịch sử commit (UC-43) ─────────────────────────────── */}
      <div style={styles.listWrap}>
        {vc.branchError ? (
          <div style={styles.stateBox}>
            <div style={styles.stateTitle}>Không tải được branch</div>
            <p style={styles.stateText}>{vc.branchError}</p>
          </div>
        ) : vc.branchLoading || (vc.historyLoading && vc.commits.length === 0) ? (
          <div style={styles.stateBox}>
            <p style={styles.stateText}>Đang tải lịch sử phiên bản…</p>
          </div>
        ) : vc.historyError ? (
          <div style={styles.stateBox}>
            <div style={styles.stateTitle}>Không tải được lịch sử</div>
            <p style={styles.stateText}>{vc.historyError}</p>
            <button onClick={vc.reloadHistory} style={styles.retryBtn}>
              Thử lại
            </button>
          </div>
        ) : vc.commits.length === 0 ? (
          <div style={styles.emptyWrap}>
            <div style={styles.emptyIcon}>
              <GitCommitVertical size={22} color={DC.textMuted} />
            </div>
            <div style={styles.emptyTitle}>Chưa có phiên bản nào</div>
            <p style={styles.emptyText}>
              Bấm <strong>Commit Changes</strong> ở thanh trên để ghi lại phiên
              bản đầu tiên của bản nháp này.
            </p>
          </div>
        ) : (
          <div style={styles.list}>
            {vc.commits.map((commit) => {
              const isHead = commit.id === vc.branch?.head_commit_id;
              const expanded = expandedId === commit.id;
              const tagName = commit.tags[0]?.name ?? null;

              return (
                <div
                  key={commit.id}
                  style={{
                    ...styles.commitCard,
                    borderColor: expanded ? DC.accent : DC.border,
                    background: expanded ? DC.accentSoft : DC.surface,
                  }}
                >
                  <button
                    onClick={() => setExpandedId(expanded ? null : commit.id)}
                    style={styles.commitHeadBtn}
                    title="Xem chi tiết phiên bản"
                  >
                    <div style={styles.commitTopRow}>
                      <span style={styles.commitMessage}>{commit.message}</span>
                      {isHead && <span style={styles.headBadge}>HIỆN TẠI</span>}
                    </div>
                    <div style={styles.commitMeta}>
                      <span>{authorLabel(commit)}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(commit.created_at)}</span>
                    </div>
                    {tagName && (
                      <span style={styles.tagBadge}>
                        <Tag size={11} />
                        {tagName}
                      </span>
                    )}
                  </button>

                  {expanded && (
                    <div style={styles.commitDetail}>
                      <div style={styles.detailRow}>
                        <span style={styles.detailKey}>ID</span>
                        <span style={styles.detailValue}>
                          {commit.id.slice(0, 8)}
                        </span>
                      </div>
                      <div style={styles.detailRow}>
                        <span style={styles.detailKey}>NỘI DUNG</span>
                        <span style={styles.detailValue}>
                          {commit.snapshot.tracks.length} track ·{" "}
                          {commit.snapshot.notes.length} note ·{" "}
                          {commit.snapshot.meta.tempo} BPM
                        </span>
                      </div>

                      {taggingId === commit.id ? (
                        <div style={styles.tagForm}>
                          <div style={styles.tagInputRow}>
                            <input
                              ref={tagInputRef}
                              type="text"
                              value={tagDraft}
                              maxLength={TAG_NAME_MAX_LENGTH}
                              placeholder="v1-demo"
                              onChange={(e) => setTagDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void submitTag(commit.id);
                                else if (e.key === "Escape") closeTagInput();
                              }}
                              style={styles.tagInput}
                            />
                            <span style={styles.tagCounter}>
                              {tagDraft.length}/{TAG_NAME_MAX_LENGTH}
                            </span>
                          </div>
                          {vc.tagError && (
                            <div style={styles.tagError}>{vc.tagError}</div>
                          )}
                          <div style={styles.tagActions}>
                            <button onClick={closeTagInput} style={styles.smallGhostBtn}>
                              Huỷ
                            </button>
                            <button
                              onClick={() => void submitTag(commit.id)}
                              disabled={vc.tagging || tagDraft.trim().length === 0}
                              style={{
                                ...styles.smallPrimaryBtn,
                                opacity:
                                  vc.tagging || tagDraft.trim().length === 0 ? 0.5 : 1,
                              }}
                            >
                              {vc.tagging ? "Đang lưu…" : "Lưu tag"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={styles.detailActions}>
                          <button
                            onClick={() => openTagInput(commit)}
                            style={styles.smallGhostBtn}
                            title="Đặt tên gợi nhớ cho phiên bản này (UC-44)"
                          >
                            <Tag size={12} />
                            {tagName ? "Đổi tag" : "Gắn tag"}
                          </button>
                          <button
                            onClick={() => onRequestRestore(commit)}
                            disabled={isHead}
                            style={{
                              ...styles.smallDangerBtn,
                              opacity: isHead ? 0.45 : 1,
                              cursor: isHead ? "not-allowed" : "pointer",
                            }}
                            title={
                              isHead
                                ? "Đây đang là phiên bản hiện tại của branch"
                                : "Khôi phục bản nháp về phiên bản này (UC-46)"
                            }
                          >
                            <History size={12} />
                            Khôi phục
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {vc.total > vc.commits.length && (
              <div style={styles.moreNote}>
                Đang hiện {vc.commits.length} phiên bản mới nhất trên tổng số{" "}
                {vc.total}.
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: DC_SIZE.historyPanelW,
    flexShrink: 0,
    background: DC.surface,
    borderLeft: `1px solid ${DC.border}`,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    padding: 16,
    borderBottom: `1px solid ${DC.border}`,
    flexShrink: 0,
  },
  title: { fontSize: 15, fontWeight: 700, color: DC.text, marginBottom: 12 },
  branchChip: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: DC.pageBg,
    border: `1px solid ${DC.border}`,
    borderRadius: 8,
    padding: "9px 12px",
  },
  branchName: { fontFamily: DC.mono, fontSize: 13, fontWeight: 600, color: DC.text },
  notice: {
    flexShrink: 0,
    margin: "12px 16px 0",
    background: DC.accentSoft,
    border: `1px solid ${DC.border}`,
    borderRadius: 8,
    padding: "8px 11px",
    fontSize: 12,
    fontWeight: 600,
    color: DC.accent,
    lineHeight: 1.45,
  },
  draftSection: {
    padding: "14px 16px",
    borderBottom: `1px solid ${DC.border}`,
    flexShrink: 0,
  },
  draftCard: {
    border: `1px solid ${DC.border}`,
    borderRadius: 9,
    padding: 12,
  },
  draftCardHead: { display: "flex", alignItems: "center", gap: 9 },
  statusDot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  draftCardTitle: { fontSize: 13, fontWeight: 600, color: DC.text },
  draftCardMeta: {
    color: DC.textMuted,
    fontSize: 12,
    marginTop: 7,
    paddingLeft: 18,
  },
  listWrap: { flex: 1, minHeight: 0, overflowY: "auto" },
  list: { display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px" },
  commitCard: {
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 9,
    overflow: "hidden",
  },
  commitHeadBtn: {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    padding: "10px 12px",
    cursor: "pointer",
    font: "inherit",
  },
  commitTopRow: { display: "flex", alignItems: "flex-start", gap: 8 },
  commitMessage: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: 600,
    color: DC.text,
    lineHeight: 1.45,
    wordBreak: "break-word",
  },
  headBadge: {
    flexShrink: 0,
    font: `700 9px ${DC.mono}`,
    letterSpacing: ".06em",
    color: DC.accent,
    background: DC.surface,
    border: `1px solid ${DC.accent}`,
    borderRadius: 5,
    padding: "2px 5px",
  },
  commitMeta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    fontSize: 11,
    color: DC.textMuted,
  },
  tagBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    marginTop: 7,
    font: `600 10.5px ${DC.mono}`,
    color: DC.accent,
    background: DC.accentSoft,
    borderRadius: 5,
    padding: "3px 6px",
  },
  commitDetail: {
    borderTop: `1px solid ${DC.border}`,
    background: DC.surface,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  detailRow: { display: "flex", alignItems: "baseline", gap: 8 },
  detailKey: {
    font: `700 9px ${DC.mono}`,
    letterSpacing: ".07em",
    color: DC.textMuted,
    width: 62,
    flexShrink: 0,
  },
  detailValue: { font: `500 11.5px ${DC.mono}`, color: DC.text },
  detailActions: { display: "flex", gap: 8, marginTop: 2 },
  smallGhostBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: DC.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: DC.border,
    borderRadius: 7,
    padding: "6px 9px",
    fontSize: 11.5,
    fontWeight: 600,
    color: DC.text,
    cursor: "pointer",
  },
  smallPrimaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: DC.accent,
    border: "none",
    borderRadius: 7,
    padding: "6px 10px",
    fontSize: 11.5,
    fontWeight: 600,
    color: "#fff",
    cursor: "pointer",
  },
  smallDangerBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: DC.dangerSoft,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: DC.dangerBorder,
    borderRadius: 7,
    padding: "6px 9px",
    fontSize: 11.5,
    fontWeight: 600,
    color: DC.danger,
  },
  tagForm: { display: "flex", flexDirection: "column", gap: 7 },
  tagInputRow: { display: "flex", alignItems: "center", gap: 7 },
  tagInput: {
    flex: 1,
    minWidth: 0,
    background: DC.surface,
    border: `1px solid ${DC.border}`,
    borderRadius: 7,
    padding: "6px 9px",
    font: `500 12px ${DC.mono}`,
    color: DC.text,
    outline: "none",
  },
  tagCounter: { font: `500 10px ${DC.mono}`, color: DC.textMuted, flexShrink: 0 },
  tagError: { fontSize: 11.5, fontWeight: 600, color: DC.danger, lineHeight: 1.45 },
  tagActions: { display: "flex", justifyContent: "flex-end", gap: 7 },
  stateBox: {
    padding: "18px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "flex-start",
  },
  stateTitle: { fontSize: 12.5, fontWeight: 700, color: DC.text },
  stateText: { fontSize: 12, lineHeight: 1.55, color: DC.textMuted },
  retryBtn: {
    background: DC.surface,
    border: `1px solid ${DC.border}`,
    borderRadius: 7,
    padding: "6px 11px",
    fontSize: 11.5,
    fontWeight: 600,
    color: DC.text,
    cursor: "pointer",
  },
  emptyWrap: {
    minHeight: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "24px 22px",
    textAlign: "center",
  },
  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: "50%",
    background: DC.pageBg,
    border: `1px solid ${DC.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 13, fontWeight: 700, color: DC.text },
  emptyText: { fontSize: 12, lineHeight: 1.6, color: DC.textMuted, maxWidth: 250 },
  moreNote: {
    fontSize: 11.5,
    lineHeight: 1.5,
    color: DC.textMuted,
    padding: "2px 2px 4px",
  },
};
