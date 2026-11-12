"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GitMerge, TriangleAlert } from "lucide-react";
import type { ConflictChoice, MergeConflictResult, MergeNoteConflict } from "../../lib/api-client";
import { pitchName } from "../../lib/midi-note-name";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { DialogError } from "../ui/dialog";
import { DiffDialogShell } from "./diff-dialog-shell";
import { DIFF_GLYPH, DIFF_TEXT } from "./diff-ui";
import type { DiffKind } from "./diff-ui";
import {
  conflictNoteIds,
  conflictSignature,
  forgetChoices,
  initialChoices,
  rememberChoices,
  shouldForgetChoices,
  tallyChoices,
} from "./merge-model";
import type { ConflictChoices } from "./merge-model";
import { useI18n } from "../../context/i18n-context";

export function MergeConflictDialog({
  result,
  sourceName,
  targetName,
  submitting,
  error = null,
  onCancel,
  onResolve,
}: {
  result: MergeConflictResult;
  sourceName: string;
  targetName: string;
  submitting: boolean;
  error?: string | null;
  onCancel: () => void;
  onResolve: (resolutions: { noteId: string; choice: ConflictChoice }[]) => void;
}) {
  const { t, tx } = useI18n();
  const signature = useMemo(
    () => conflictSignature(result, sourceName, targetName),
    [result, sourceName, targetName],
  );
  const [choices, setChoices] = useState<ConflictChoices>(() => initialChoices(result, signature));

  useEffect(() => {
    rememberChoices(signature, choices);
  }, [signature, choices]);

  const outcome = useRef({ resolveRequested: false, cancelled: false, error });
  useEffect(() => {
    outcome.current.error = error;
  }, [error]);
  useEffect(() => {
    const state = outcome.current;
    return () => {
      if (shouldForgetChoices(state)) forgetChoices(signature);
    };
  }, [signature]);

  function cancel() {
    outcome.current.cancelled = true;
    onCancel();
  }

  function resolve() {
    outcome.current.resolveRequested = true;
    outcome.current.cancelled = false;
    onResolve(Object.entries(choices).map(([noteId, choice]) => ({ noteId, choice })));
  }

  const bars = Object.keys(result.conflictsByBar).sort((a, b) => Number(a) - Number(b));
  const tally = tallyChoices(choices);

  function setAll(choice: ConflictChoice) {
    setChoices(Object.fromEntries(conflictNoteIds(result).map((id) => [id, choice])));
  }

  function describe(note: MergeNoteConflict["baseNote"], deleted: boolean) {
    if (deleted || !note) return t("mc.deleted");
    return t("mc.noteDesc", {
      pitch: pitchName(note.pitch),
      start: note.start,
      duration: note.duration,
      velocity: note.velocity,
    });
  }

  const header = (
    <p className="mt-1 text-xs text-muted">
      {tx("mc.lead", {
        source: <span className="font-mono text-foreground">{sourceName}</span>,
        target: <span className="font-mono text-foreground">{targetName}</span>,
      })}
    </p>
  );

  const footer = (
    <>
      {error && (
        <div className="px-4 pt-3 md:px-6">
          <DialogError message={error} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <p className="text-xs text-muted">{t("mc.default")}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={cancel} disabled={submitting}>
            {t("ui.cancel")}
          </Button>
          <Button onClick={resolve} disabled={submitting}>
            <GitMerge aria-hidden="true" className="h-3.5 w-3.5" />
            {submitting ? t("mc.merging") : t("mc.confirm")}
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <DiffDialogShell
      title={t("mc.title")}
      icon={<TriangleAlert aria-hidden="true" className="h-4 w-4 text-warning-foreground" />}
      onClose={cancel}
      closeDisabled={submitting}
      header={header}
      footer={footer}
    >
      <div className="flex flex-col gap-4 px-4 py-4 md:px-6 md:py-5">
        <dl
          aria-label={t("mergePage.statsLabel")}
          className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-4"
        >
          <Stat label={t("mergePage.statConflicts")} value={result.conflictsCount} tone="text-warning-foreground" />
          <Stat label={t("mergePage.statBars")} value={bars.length} />
          <Stat label={t("mergePage.statOurs")} value={tally.ours} />
          <Stat label={t("mergePage.statTheirs")} value={tally.theirs} />
        </dl>
        <p role="status" className="sr-only">
          {t("mergePage.liveStatus", { ours: tally.ours, theirs: tally.theirs })}
        </p>

        {bars.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted">
            {t("mergePage.noConflicts")}
          </p>
        ) : (
          <>
            <div role="group" aria-label={t("mergePage.bulkLabel")} className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setAll("PICK_TARGET")} disabled={submitting}>
                {t("mergePage.keepAllOurs")}
              </Button>
              <Button variant="secondary" onClick={() => setAll("PICK_SOURCE")} disabled={submitting}>
                {t("mergePage.takeAllTheirs")}
              </Button>
            </div>

            {bars.map((bar) => (
              <section key={bar} className="overflow-hidden rounded-card border border-border">
                <div className="flex items-center gap-2 border-b border-border bg-surface-subtle px-4 py-2">
                  <Badge variant="neutral">{t("cmp.bar", { n: bar })}</Badge>
                  <span className="text-xs text-muted">{t("mc.notes", { n: result.conflictsByBar[bar].length })}</span>
                </div>
                <div className="divide-y divide-border">
                  {result.conflictsByBar[bar].map((conflict) => {
                    const choice = choices[conflict.noteId];
                    const targetDeleted = conflict.type === "DELETE_VS_MODIFY" && !conflict.targetNote;
                    const sourceDeleted = conflict.type === "DELETE_VS_MODIFY" && !conflict.sourceNote;
                    const noteLabel = `${conflict.baseNote ? pitchName(conflict.baseNote.pitch) : t("mc.newNote")} · ${conflict.noteId.slice(0, 8)}`;

                    return (
                      <fieldset key={conflict.noteId} disabled={submitting} className="min-w-0">
                        <legend className="w-full px-4 pb-2 pt-3 font-mono text-xs text-muted">{noteLabel}</legend>
                        <div className="grid gap-2.5 px-4 pb-3 md:grid-cols-2">
                          <Option
                            name={`conflict-${conflict.noteId}`}
                            checked={choice === "PICK_TARGET"}
                            onSelect={() => setChoices((c) => ({ ...c, [conflict.noteId]: "PICK_TARGET" }))}
                            title={t("mc.keepOurs", { name: targetName })}
                            body={describe(conflict.targetNote, targetDeleted)}
                            kind={targetDeleted || !conflict.targetNote ? "remove" : "modify"}
                          />
                          <Option
                            name={`conflict-${conflict.noteId}`}
                            checked={choice === "PICK_SOURCE"}
                            onSelect={() => setChoices((c) => ({ ...c, [conflict.noteId]: "PICK_SOURCE" }))}
                            title={t("mc.takeTheirs", { name: sourceName })}
                            body={describe(conflict.sourceNote, sourceDeleted)}
                            kind={sourceDeleted || !conflict.sourceNote ? "remove" : "modify"}
                          />
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </DiffDialogShell>
  );
}

function Stat({ label, value, tone = "text-foreground" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 font-mono text-2xl font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

function Option({
  name,
  checked,
  onSelect,
  title,
  body,
  kind,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  body: string;
  kind: DiffKind;
}) {
  return (
    <label
      className={`flex min-w-0 cursor-pointer gap-2.5 rounded-md border p-3 transition-colors ${
        checked ? "border-accent bg-accent-muted" : "border-border hover:bg-surface-subtle"
      }`}
    >
      <input type="radio" name={name} className="mt-0.5 accent-accent" checked={checked} onChange={onSelect} />
      <span className="min-w-0">
        <span className="block break-words text-xs font-bold uppercase tracking-wide text-muted">{title}</span>
        <span className={`mt-0.5 block break-words font-mono text-xs ${DIFF_TEXT[kind]}`}>
          <span aria-hidden="true" data-diff-glyph={kind} className="mr-1 font-bold">
            {DIFF_GLYPH[kind]}
          </span>
          {body}
        </span>
      </span>
    </label>
  );
}
