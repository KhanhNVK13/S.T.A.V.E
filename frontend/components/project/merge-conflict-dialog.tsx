"use client";

import { useState } from "react";
import { GitMerge, TriangleAlert } from "lucide-react";
import type { ConflictChoice, MergeConflictResult, MergeNoteConflict } from "../../lib/api-client";
import { pitchName } from "../../lib/midi-note-name";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

/**
 * UC-86 — chọn giữ bên nào cho từng nốt xung đột, gom theo ô nhịp (bar) đúng
 * như backend trả về (`conflictsByBar`) và đúng quyết định đã chốt ở CLAUDE.md
 * 4.1 ("phát hiện note-level, hiển thị gom theo bar").
 *
 * Quy ước đặt tên: `target` là nhánh ĐƯỢC merge vào (bên ta), `source` là nhánh
 * mang thay đổi tới (bên kia) — giữ nguyên thuật ngữ của backend để không dịch
 * sai khi gửi `PICK_TARGET` / `PICK_SOURCE`.
 */
export function MergeConflictDialog({
  result,
  sourceName,
  targetName,
  submitting,
  onCancel,
  onResolve,
}: {
  result: MergeConflictResult;
  sourceName: string;
  targetName: string;
  submitting: boolean;
  onCancel: () => void;
  onResolve: (resolutions: { noteId: string; choice: ConflictChoice }[]) => void;
}) {
  // Mặc định giữ bên ta (nhánh đích) — lựa chọn an toàn nhất: không có thay đổi
  // nào của nhánh đích bị mất nếu người dùng bấm xác nhận mà chưa xem kỹ.
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>(() => {
    const initial: Record<string, ConflictChoice> = {};
    for (const conflicts of Object.values(result.conflictsByBar)) {
      for (const c of conflicts) initial[c.noteId] = "PICK_TARGET";
    }
    return initial;
  });

  const bars = Object.keys(result.conflictsByBar).sort(
    (a, b) => Number(a) - Number(b),
  );

  function describe(note: MergeNoteConflict["baseNote"], deleted: boolean) {
    if (deleted || !note) return "Đã xoá nốt";
    return `${pitchName(note.pitch)} · tick ${note.start} · dài ${note.duration} · velocity ${note.velocity}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4 py-8">
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-card border border-border bg-surface">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <TriangleAlert className="h-4 w-4 text-warning" />
              Có xung đột cần xử lý trước khi hợp nhất
            </h2>
            <p className="mt-1 text-[11px] text-muted">
              Hợp nhất <span className="font-mono text-foreground">{sourceName}</span> vào{" "}
              <span className="font-mono text-foreground">{targetName}</span> — cùng một nốt bị
              sửa khác nhau ở hai nhánh. Chọn giữ bên nào cho từng nốt.
            </p>
          </div>
          <Badge variant="warning">{result.conflictsCount} xung đột</Badge>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {bars.map((bar) => (
            <section key={bar} className="border-b border-border last:border-b-0">
              <div className="flex items-center gap-2 bg-surface-subtle px-5 py-2">
                {/* Backend đã đánh số ô nhịp từ 1 (`Math.floor(start / ticksPerBar) + 1`) —
                    cộng thêm 1 ở đây từng làm mọi ô nhịp hiện lệch lên một. */}
                <Badge variant="neutral">Ô nhịp {bar}</Badge>
                <span className="text-[10px] text-muted">
                  {result.conflictsByBar[bar].length} nốt
                </span>
              </div>

              {result.conflictsByBar[bar].map((conflict) => {
                const choice = choices[conflict.noteId];
                const targetDeleted =
                  conflict.type === "DELETE_VS_MODIFY" && !conflict.targetNote;
                const sourceDeleted =
                  conflict.type === "DELETE_VS_MODIFY" && !conflict.sourceNote;

                return (
                  <div key={conflict.noteId} className="px-5 py-3">
                    <p className="mb-2 font-mono text-[11px] text-muted">
                      {conflict.baseNote ? pitchName(conflict.baseNote.pitch) : "Nốt mới"} ·{" "}
                      {conflict.noteId.slice(0, 8)}
                    </p>

                    <div className="grid gap-2.5 md:grid-cols-2">
                      <label
                        className={`flex cursor-pointer gap-2.5 rounded-md border p-3 transition-colors ${
                          choice === "PICK_TARGET"
                            ? "border-accent bg-accent-muted"
                            : "border-border hover:bg-surface-subtle"
                        }`}
                      >
                        <input
                          type="radio"
                          className="mt-0.5 accent-accent"
                          checked={choice === "PICK_TARGET"}
                          onChange={() =>
                            setChoices((c) => ({ ...c, [conflict.noteId]: "PICK_TARGET" }))
                          }
                        />
                        <span className="min-w-0">
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-muted">
                            Giữ bên ta · {targetName}
                          </span>
                          <span className="mt-0.5 block font-mono text-[11px]">
                            {describe(conflict.targetNote, targetDeleted)}
                          </span>
                        </span>
                      </label>

                      <label
                        className={`flex cursor-pointer gap-2.5 rounded-md border p-3 transition-colors ${
                          choice === "PICK_SOURCE"
                            ? "border-accent bg-accent-muted"
                            : "border-border hover:bg-surface-subtle"
                        }`}
                      >
                        <input
                          type="radio"
                          className="mt-0.5 accent-accent"
                          checked={choice === "PICK_SOURCE"}
                          onChange={() =>
                            setChoices((c) => ({ ...c, [conflict.noteId]: "PICK_SOURCE" }))
                          }
                        />
                        <span className="min-w-0">
                          <span className="block text-[10px] font-bold uppercase tracking-wide text-muted">
                            Lấy bên kia · {sourceName}
                          </span>
                          <span className="mt-0.5 block font-mono text-[11px]">
                            {describe(conflict.sourceNote, sourceDeleted)}
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-[10px] text-muted">
            Mặc định giữ bên ta cho mọi nốt — đổi từng nốt ở trên nếu muốn lấy thay đổi của nhánh
            nguồn.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={submitting}>
              Huỷ
            </Button>
            <Button
              onClick={() =>
                onResolve(
                  Object.entries(choices).map(([noteId, choice]) => ({ noteId, choice })),
                )
              }
              disabled={submitting}
            >
              <GitMerge className="h-3.5 w-3.5" />
              {submitting ? "Đang hợp nhất…" : "Xác nhận và hợp nhất"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
