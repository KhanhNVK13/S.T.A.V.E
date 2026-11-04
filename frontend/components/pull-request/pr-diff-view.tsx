"use client";

import { Badge } from "../ui/badge";
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
    return <p className="text-[13px] text-muted">{t("pr.diffNone")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="success">{t("cmp.notesAdded", { n: notes.added })}</Badge>
        <Badge variant="danger">{t("cmp.notesRemoved", { n: notes.removed })}</Badge>
        <Badge variant="warning">{t("pr.dlgNotesModified", { n: notes.modified })}</Badge>
        {(tracks.added > 0 || tracks.removed > 0 || tracks.modified > 0) && (
          <Badge variant="neutral">
            {t("cmp.tracksSummary", tracks)}
          </Badge>
        )}
      </div>

      {diff.metaChanges.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13px]">
          {diff.metaChanges.map((change) => (
            <li key={change.field}>
              <span className="font-semibold">{metaLabel(change.field)}:</span>{" "}
              <span className="font-mono">{show(change.old)}</span> →{" "}
              <span className="font-mono">{show(change.new)}</span>
            </li>
          ))}
        </ul>
      )}

      {(diff.tracksDiff.added.length > 0 || diff.tracksDiff.removed.length > 0) && (
        <ul className="flex flex-col gap-1 text-[13px]">
          {diff.tracksDiff.added.map((track) => (
            <li key={track.id}>
              {t("pr.diffTrackAdded")} <strong>{track.name}</strong> ({t("cmp.noteCount", { n: diff.tracksDiff.noteCounts[track.id] ?? 0 })})
            </li>
          ))}
          {diff.tracksDiff.removed.map((track) => (
            <li key={track.id}>
              {t("pr.diffTrackRemoved")} <strong>{track.name}</strong> ({t("cmp.noteCount", { n: diff.tracksDiff.noteCounts[track.id] ?? 0 })})
            </li>
          ))}
        </ul>
      )}

      {bars.length > 0 && (
        <div className="overflow-hidden rounded-card border border-border">
          {bars.map((bar) => {
            const change = diff.changesByBar[bar];
            return (
              <div key={bar} className="border-b border-border px-3.5 py-2.5 last:border-b-0">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{t("cmp.bar", { n: bar })}</p>
                <ul className="flex flex-col gap-0.5 font-mono text-xs">
                  {change.added.map((note) => (
                    <li key={note.id} className="text-success-foreground">
                      + {t("pr.diffNoteLen", { pitch: pitchName(note.pitch), start: note.start, duration: note.duration })}
                    </li>
                  ))}
                  {change.removed.map((note) => (
                    <li key={note.id} className="text-danger">
                      − {t("pr.diffNoteLen", { pitch: pitchName(note.pitch), start: note.start, duration: note.duration })}
                    </li>
                  ))}
                  {change.modified.map(({ old, new: updated }) => (
                    <li key={updated.id} className="text-warning-foreground">
                      ~ {pitchName(old.pitch)} tick {old.start} → {pitchName(updated.pitch)} tick {updated.start}
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
