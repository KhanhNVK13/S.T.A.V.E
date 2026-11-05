"use client";

import { Badge } from "../ui/badge";
import { DiffBadge, DIFF_TEXT } from "../project/diff-ui";
import { pitchName } from "../../lib/midi-note-name";
import type { SnapshotDiff } from "../../lib/api-client";
import { useI18n } from "../../context/i18n-context";
import { tNow } from "../../lib/i18n";

function metaLabel(field: string): string {
  if (field === "tempo") return "Tempo";
  if (field === "timeSignature") return tNow("pr.diffTime");
  if (field === "ppq") return "PPQ";
  return field;
}

function show(value: unknown): string {
  if (Array.isArray(value)) return value.join("/");
  return value === undefined || value === null ? "—" : String(value);
}

export function PrDiffView({ diff }: { diff: SnapshotDiff }) {
  const { t } = useI18n();
  const { notes, tracks } = diff.summary;
  const bars = Object.keys(diff.changesByBar).sort((a, b) => Number(a) - Number(b));

  if (diff.areIdentical) {
    return (
      <p className="rounded-card border border-dashed border-border-strong px-4 py-8 text-center text-[13px] text-muted">
        {t("pr.diffNone")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <DiffBadge kind="add" signed={false}>{t("cmp.notesAdded", { n: notes.added })}</DiffBadge>
        <DiffBadge kind="remove" signed={false}>{t("cmp.notesRemoved", { n: notes.removed })}</DiffBadge>
        <DiffBadge kind="modify">{t("pr.dlgNotesModified", { n: notes.modified })}</DiffBadge>
        {(tracks.added > 0 || tracks.removed > 0 || tracks.modified > 0) && (
          <Badge variant="neutral">{t("cmp.tracksSummary", tracks)}</Badge>
        )}
      </div>

      {(diff.metaChanges.length > 0 ||
        diff.tracksDiff.added.length > 0 ||
        diff.tracksDiff.removed.length > 0) && (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface text-[13px]">
          {diff.metaChanges.map((change) => (
            <li key={change.field} className="px-3.5 py-2.5">
              <span className="font-semibold">{metaLabel(change.field)}:</span>{" "}
              <span className="font-mono">{show(change.old)}</span> →{" "}
              <span className="font-mono">{show(change.new)}</span>
            </li>
          ))}
          {diff.tracksDiff.added.map((track) => (
            <li key={`a-${track.id}`} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
              <DiffBadge kind="add">{t("pr.diffTrackAdded")}</DiffBadge>
              <strong>{track.name}</strong>
              <span className="text-muted">({t("cmp.noteCount", { n: diff.tracksDiff.noteCounts[track.id] ?? 0 })})</span>
            </li>
          ))}
          {diff.tracksDiff.removed.map((track) => (
            <li key={`r-${track.id}`} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
              <DiffBadge kind="remove">{t("pr.diffTrackRemoved")}</DiffBadge>
              <strong>{track.name}</strong>
              <span className="text-muted">({t("cmp.noteCount", { n: diff.tracksDiff.noteCounts[track.id] ?? 0 })})</span>
            </li>
          ))}
        </ul>
      )}

      {bars.length > 0 && (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {bars.map((bar) => {
            const change = diff.changesByBar[bar];
            return (
              <div key={bar} className="border-b border-border px-3.5 py-2.5 last:border-b-0">
                <p className="mb-1.5">
                  <Badge variant="neutral">{t("cmp.bar", { n: bar })}</Badge>
                </p>
                <ul className="flex flex-col gap-0.5 font-mono text-xs">
                  {change.added.map((note) => (
                    <li key={note.id} className={DIFF_TEXT.add}>
                      + {t("pr.diffNoteLen", { pitch: pitchName(note.pitch), start: note.start, duration: note.duration })}
                    </li>
                  ))}
                  {change.removed.map((note) => (
                    <li key={note.id} className={DIFF_TEXT.remove}>
                      − {t("pr.diffNoteLen", { pitch: pitchName(note.pitch), start: note.start, duration: note.duration })}
                    </li>
                  ))}
                  {change.modified.map(({ old, new: updated }) => (
                    <li key={updated.id} className={DIFF_TEXT.modify}>
                      ~ {t("cmp.noteDesc", { pitch: pitchName(old.pitch), start: old.start, duration: old.duration, velocity: old.velocity })}
                      {" → "}
                      {t("cmp.noteDesc", { pitch: pitchName(updated.pitch), start: updated.start, duration: updated.duration, velocity: updated.velocity })}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
