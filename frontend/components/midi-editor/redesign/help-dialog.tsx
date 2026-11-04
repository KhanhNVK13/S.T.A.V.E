"use client";

import React from "react";
import { Modal } from "./modal";
import { DC } from "./tokens";
import { useI18n } from "../../../context/i18n-context";
import type { TKey } from "../../../lib/i18n";

const CONCEPTS: { term: TKey | "Commit"; text: TKey }[] = [
  { term: "help.draft", text: "help.draftText" },
  { term: "Commit", text: "help.commitText" },
  { term: "help.branch", text: "help.branchText" },
  { term: "help.merge", text: "help.mergeText" },
  { term: "help.restore", text: "help.restoreText" },
];

function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const mod = isMac() ? "⌘" : "Ctrl";
  const shortcuts: { keys: string[][]; action: string }[] = [
    { keys: [["Space"]], action: t("help.sc.play") },
    { keys: [["Delete"], ["Backspace"]], action: t("help.sc.delete") },
    { keys: [["Esc"]], action: t("help.sc.esc") },
    { keys: [[mod, "Z"]], action: t("help.sc.undo") },
    { keys: [[mod, "Shift", "Z"], [mod, "Y"]], action: t("help.sc.redo") },
    { keys: [[mod, "A"]], action: t("help.sc.selectAll") },
    { keys: [[mod, "C"], [mod, "X"], [mod, "V"]], action: t("help.sc.clipboard") },
    { keys: [["Shift", t("help.keyClick")]], action: t("help.sc.shiftClick") },
    { keys: [[t("help.keyRightClick")]], action: t("help.sc.rightClick") },
    { keys: [["↑"], ["↓"]], action: t("help.sc.bpm") },
    { keys: [[mod, "Enter"]], action: t("help.sc.commit") },
    { keys: [["?"]], action: t("help.sc.help") },
  ];

  return (
    <Modal title={t("help.title")} width={620} onClose={onClose}>
      <section>
        <h3 style={styles.sectionTitle}>{t("help.concepts")}</h3>
        <dl style={styles.concepts}>
          {CONCEPTS.map((c) => (
            <div key={c.term} style={styles.conceptRow}>
              <dt style={styles.term}>{c.term === "Commit" ? c.term : t(c.term)}</dt>
              <dd style={styles.def}>{t(c.text)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3 style={styles.sectionTitle}>{t("help.shortcuts")}</h3>
        <table style={styles.table}>
          <tbody>
            {shortcuts.map((s) => (
              <tr key={s.action}>
                <td style={styles.keysCell}>
                  {s.keys.map((combo, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span style={styles.or}>{t("help.or")}</span>}
                      {combo.map((k, j) => (
                        <React.Fragment key={k}>
                          {j > 0 && <span style={styles.plus}>+</span>}
                          <kbd style={styles.kbd}>{k}</kbd>
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
                </td>
                <td style={styles.actionCell}>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sectionTitle: { margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: DC.text },
  concepts: { margin: 0, display: "flex", flexDirection: "column", gap: 8 },
  conceptRow: { display: "grid", gridTemplateColumns: "92px 1fr", gap: 12 },
  term: { fontSize: 13, fontWeight: 600, color: DC.text },
  def: { margin: 0, fontSize: 13, lineHeight: 1.55, color: DC.textMuted },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  keysCell: {
    padding: "6px 12px 6px 0",
    whiteSpace: "nowrap",
    verticalAlign: "top",
    borderTop: `1px solid ${DC.border}`,
  },
  actionCell: {
    padding: "6px 0",
    color: DC.text,
    verticalAlign: "top",
    borderTop: `1px solid ${DC.border}`,
  },
  kbd: {
    display: "inline-block",
    minWidth: 22,
    padding: "1px 6px",
    border: `1px solid ${DC.border}`,
    borderBottomWidth: 2,
    borderRadius: 5,
    background: DC.pageBg,
    font: `600 12px ${DC.mono}`,
    color: DC.text,
    textAlign: "center",
  },
  plus: { margin: "0 3px", color: DC.textMuted },
  or: { margin: "0 6px", fontSize: 12, color: DC.textMuted },
};
