"use client";

import React from "react";
import { Modal } from "./modal";
import { DC } from "./tokens";

const CONCEPTS: { term: string; text: string }[] = [
  {
    term: "Bản nháp",
    text: "Bản nhạc bạn đang sửa. Tự lưu sau vài giây, nhưng chưa phải là một phiên bản.",
  },
  {
    term: "Commit",
    text: "Chụp lại bản nháp thành một phiên bản có tên, giống \"đặt tên phiên bản\" trong Google Docs. Có thể quay lại bất cứ lúc nào.",
  },
  {
    term: "Nhánh",
    text: "Một bản làm thử song song với main — ví dụ thử phối bè bass khác mà không đụng vào bản chính.",
  },
  {
    term: "Hợp nhất",
    text: "Đưa các commit của một nhánh vào main khi bạn hài lòng. Nếu cùng một nốt bị sửa khác nhau ở hai nhánh, bạn chọn giữ bên nào.",
  },
  {
    term: "Khôi phục",
    text: "Đưa bản nháp về một phiên bản cũ bằng cách tạo commit mới — lịch sử không bị xoá.",
  },
];

function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const mod = isMac() ? "⌘" : "Ctrl";
  const shortcuts: { keys: string[][]; action: string }[] = [
    { keys: [["Space"]], action: "Phát / tạm dừng" },
    { keys: [["Delete"], ["Backspace"]], action: "Xoá các nốt đang chọn" },
    { keys: [["Esc"]], action: "Bỏ chọn nốt, đóng hộp thoại" },
    { keys: [[mod, "Z"]], action: "Hoàn tác" },
    { keys: [[mod, "Shift", "Z"], [mod, "Y"]], action: "Làm lại" },
    { keys: [[mod, "A"]], action: "Chọn tất cả nốt" },
    { keys: [[mod, "C"], [mod, "V"]], action: "Sao chép / dán nốt" },
    { keys: [["Shift", "bấm"]], action: "Thêm hoặc bớt một nốt khỏi vùng chọn" },
    { keys: [["Chuột phải"]], action: "Xoá nốt dưới con trỏ" },
    { keys: [["↑"], ["↓"]], action: "Tăng / giảm BPM khi đang ở ô BPM" },
    { keys: [[mod, "Enter"]], action: "Tạo commit (trong hộp Commit)" },
    { keys: [["?"]], action: "Mở trợ giúp này" },
  ];

  return (
    <Modal title="Trợ giúp" width={620} onClose={onClose}>
      <section>
        <h3 style={styles.sectionTitle}>Khái niệm</h3>
        <dl style={styles.concepts}>
          {CONCEPTS.map((c) => (
            <div key={c.term} style={styles.conceptRow}>
              <dt style={styles.term}>{c.term}</dt>
              <dd style={styles.def}>{c.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3 style={styles.sectionTitle}>Phím tắt</h3>
        <table style={styles.table}>
          <tbody>
            {shortcuts.map((s) => (
              <tr key={s.action}>
                <td style={styles.keysCell}>
                  {s.keys.map((combo, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span style={styles.or}>hoặc</span>}
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
