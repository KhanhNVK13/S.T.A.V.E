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
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { Button } from "../ui/button";
import { Dialog, DialogActions, DialogError } from "../ui/dialog";
import { useI18n } from "../../context/i18n-context";

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
  const { t, locale } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<FileSummary | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<ErrorSource | null>(null);
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
      setFileError(t("imp.badType"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError(t("imp.tooBig"));
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseMidiBuffer(buffer);
      if (parsed.tracks.length === 0) {
        setFileError(t("imp.noNotes"));
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
      setFileError(t("imp.unreadable"));
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
        message: isFirst ? t("imp.commitFirst", { name: label }) : t("imp.commit", { name: label }),
        expectedHeadCommitId: target.head_commit_id ?? undefined,
      });
      onImported(
        isFirst
          ? t("imp.doneFirst", { name: summary.fileName })
          : t("imp.done", { name: summary.fileName }),
      );
    } catch (err) {
      if (draftReplaced && previousDraft) {
        await putDraft(projectId, previousDraft).catch(() => undefined);
      }
      setError(errorSource(err, "imp.fail"));
      setBusy(false);
    }
  }

  return (
    <Dialog title={t("imp.title")} onClose={onClose} closeDisabled={busy} className="max-w-md p-6">
      <p className="mb-4 text-[13px] text-muted">
        {t("imp.lead")}
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
        <FileUp className="h-3.5 w-3.5" /> {summary ? t("imp.chooseOther") : t("imp.choose")}
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
          <dt className="text-muted">{t("imp.tracks")}</dt>
          <dd className="font-mono tabular-nums">{summary.trackCount}</dd>
          <dt className="text-muted">{t("imp.notes")}</dt>
          <dd className="font-mono tabular-nums">{summary.noteCount.toLocaleString(locale)}</dd>
          <dt className="text-muted">Tempo</dt>
          <dd className="font-mono tabular-nums">{Math.round(summary.tempo)} BPM</dd>
          <dt className="text-muted">PPQ</dt>
          <dd className="font-mono tabular-nums">{summary.ppq}</dd>
        </dl>
      )}

      <div className="mt-4">
        <DialogError message={renderError(error)} />
      </div>
      <DialogActions>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {t("ui.cancel")}
        </Button>
        <Button onClick={() => void handleImport()} disabled={!summary || busy}>
          {busy ? t("imp.importing") : t("imp.submit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
