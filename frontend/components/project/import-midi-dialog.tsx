"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import {
  createCommit,
  getDraft,
  listProjectBranches,
  putDraft,
} from "../../lib/api-client";
import { parseMidiBuffer } from "../../lib/midi-parser";
import { apiErrorMessage } from "../../lib/error-message";
import { Button } from "../ui/button";
import { Dialog, DialogActions, DialogError } from "../ui/dialog";
import { APP_LOCALE } from "../../lib/format-date";

const MAX_BYTES = 5 * 1024 * 1024;

interface FileSummary {
  fileName: string;
  buffer: ArrayBuffer;
  trackCount: number;
  noteCount: number;
  tempo: number;
  ppq: number;
}

export function ImportMidiDialog({
  projectId,
  onClose,
  onImported,
}: {
  projectId: string;
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<FileSummary | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    setSummary(null);
    setFileError(null);
    setError(null);
    if (!file) return;
    if (!/\.(mid|midi)$/i.test(file.name)) {
      setFileError("Chỉ nhận file .mid hoặc .midi.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError("File lớn hơn 5 MB nên không nhập được. Hãy chọn file nhỏ hơn.");
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseMidiBuffer(buffer);
      if (parsed.tracks.length === 0) {
        setFileError("File MIDI này không có nốt nào để nhập.");
        return;
      }
      setSummary({
        fileName: file.name,
        buffer,
        trackCount: parsed.tracks.length,
        noteCount: parsed.notes.length,
        tempo: parsed.meta.tempo,
        ppq: parsed.meta.ppq,
      });
    } catch {
      setFileError("Không đọc được file MIDI này. File có thể bị hỏng hoặc không đúng định dạng.");
    }
  }

  async function handleImport() {
    if (!summary) return;
    setBusy(true);
    setError(null);
    let previousDraft: Awaited<ReturnType<typeof getDraft>> | null = null;
    let draftReplaced = false;
    try {
      const branches = await listProjectBranches(projectId);
      const target = branches.find((b) => b.is_active) ?? branches.find((b) => b.is_default);
      if (!target) throw new Error("no-branch");
      const base = await getDraft(projectId);
      previousDraft = base;
      const merged = parseMidiBuffer(summary.buffer, base);
      await putDraft(projectId, merged);
      draftReplaced = true;
      const isFirst = !target.head_commit_id;
      const label = summary.fileName.replace(/\.(mid|midi)$/i, "").slice(0, 120);
      await createCommit({
        branch_id: target.id,
        message: isFirst ? `Nhập MIDI "${label}" (commit đầu tiên)` : `Nhập MIDI "${label}"`,
        expectedHeadCommitId: target.head_commit_id ?? undefined,
      });
      onImported(
        isFirst
          ? `Đã nhập "${summary.fileName}" thành commit đầu tiên của dự án.`
          : `Đã nhập "${summary.fileName}" và ghi thành một commit mới.`,
      );
    } catch (err) {
      if (draftReplaced && previousDraft) {
        await putDraft(projectId, previousDraft).catch(() => undefined);
      }
      setError(apiErrorMessage(err, "Không nhập được file MIDI. Chưa có commit nào được tạo."));
      setBusy(false);
    }
  }

  return (
    <Dialog title="Nhập file MIDI" onClose={onClose} closeDisabled={busy} className="max-w-md p-6">
      <p className="mb-4 text-[13px] text-muted">
        Chọn một file .mid. Nội dung được thêm vào bản nháp hiện tại và ghi thành một commit, nên bản
        nháp chưa commit của bạn (nếu có) cũng nằm trong commit này.
      </p>

      <input
        ref={inputRef}
        type="file"
        name="midiFile"
        accept=".mid,.midi,audio/midi"
        onChange={(e) => void handleFile(e)}
        className="hidden"
      />
      <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
        <FileUp className="h-3.5 w-3.5" /> {summary ? "Chọn file khác" : "Chọn file MIDI"}
      </Button>
      {fileError && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {fileError}
        </p>
      )}

      {summary && (
        <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-1.5 rounded-card border border-border bg-surface-subtle p-3 text-[13px]">
          <dt className="text-muted">File</dt>
          <dd className="truncate font-mono text-xs">{summary.fileName}</dd>
          <dt className="text-muted">Số track</dt>
          <dd className="font-mono tabular-nums">{summary.trackCount}</dd>
          <dt className="text-muted">Số nốt</dt>
          <dd className="font-mono tabular-nums">{summary.noteCount.toLocaleString(APP_LOCALE)}</dd>
          <dt className="text-muted">Tempo</dt>
          <dd className="font-mono tabular-nums">{Math.round(summary.tempo)} BPM</dd>
          <dt className="text-muted">PPQ</dt>
          <dd className="font-mono tabular-nums">{summary.ppq}</dd>
        </dl>
      )}

      <div className="mt-4">
        <DialogError message={error} />
      </div>
      <DialogActions>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Huỷ
        </Button>
        <Button onClick={() => void handleImport()} disabled={!summary || busy}>
          {busy ? "Đang nhập…" : "Nhập và commit"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
