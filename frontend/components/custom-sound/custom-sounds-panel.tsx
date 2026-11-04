"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { DraftTrack } from "@stave/shared-types";
import type { CustomSound, ResolvedCustomSound } from "../../lib/api-client";
import { pitchName } from "../../lib/midi-note-name";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { INPUT_CLASS } from "../ui/form";
import { SoundLibraryPanel } from "./sound-library-panel";
import { useI18n } from "../../context/i18n-context";

const PITCHES = Array.from({ length: 128 }, (_, i) => 127 - i);

interface CustomSoundsPanelProps {
  track: DraftTrack | null;
  defaultPitch: number;
  customSounds: Map<string, ResolvedCustomSound>;
  mappedIds?: Set<string>;
  onSetSoundMapping: (trackId: string, pitch: number, soundId: string | null) => void;
  onLibraryChange: () => void;
}

function MappingRow({
  pitch,
  resolved,
  libraryName,
  onRemove,
}: {
  pitch: number;
  resolved: ResolvedCustomSound | undefined;
  libraryName: string | undefined;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const name = resolved?.name ?? libraryName;
  const broken = resolved && !resolved.playable;
  return (
    <li className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2">
      <span className="w-12 shrink-0 font-mono text-xs font-semibold tabular-nums">{pitchName(pitch)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px]">{name ?? (resolved ? t("cs.gone") : t("cs.checking"))}</div>
        {broken && (
          <div className="flex items-center gap-1 text-xs text-warning-foreground">
            <AlertTriangle size={12} aria-hidden />
            {resolved.reason === "deleted"
              ? t("cs.deleted")
              : t("cs.unplayable")}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("cs.unassignLabel", { pitch: pitchName(pitch) })}
        title={t("cs.unassign")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-subtle hover:text-foreground"
      >
        <X size={14} />
      </button>
    </li>
  );
}

export function CustomSoundsPanel({
  track,
  defaultPitch,
  customSounds,
  mappedIds,
  onSetSoundMapping,
  onLibraryChange,
}: CustomSoundsPanelProps) {
  const { t, tx } = useI18n();
  const [pitch, setPitch] = useState(defaultPitch);
  const [libraryNames, setLibraryNames] = useState<Map<string, string>>(new Map());
  const [pendingReplace, setPendingReplace] = useState<{
    soundId: string;
    soundName: string;
    oldName: string;
  } | null>(null);

  const mappings = Object.entries(track?.soundMap ?? {})
    .map(([key, soundId]) => ({ pitch: Number(key), soundId }))
    .sort((a, b) => b.pitch - a.pitch);

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="sound-mapping-heading" className="flex flex-col gap-3">
        <h3 id="sound-mapping-heading" className="text-[13px] font-semibold">
          {track ? t("cs.titleTrack", { name: track.name }) : t("cs.title")}
        </h3>
        {!track ? (
          <p className="text-xs text-muted">{t("cs.pickTrack")}</p>
        ) : (
          <>
            <p className="text-xs text-muted">
              {t("cs.explain")}
            </p>
            <label className="flex items-center gap-2 text-xs font-semibold">
              {t("cs.notePick")}
              <select
                name="sound-pitch"
                value={pitch}
                onChange={(e) => setPitch(Number(e.target.value))}
                className={`${INPUT_CLASS} w-28`}
              >
                {PITCHES.map((p) => (
                  <option key={p} value={p}>
                    {pitchName(p)}
                    {track.soundMap?.[String(p)] ? " •" : ""}
                  </option>
                ))}
              </select>
            </label>
            {mappings.length > 0 && (
              <ul className="flex flex-col gap-2">
                {mappings.map((m) => (
                  <MappingRow
                    key={m.pitch}
                    pitch={m.pitch}
                    resolved={customSounds.get(m.soundId)}
                    libraryName={libraryNames.get(m.soundId)}
                    onRemove={() => onSetSoundMapping(track.id, m.pitch, null)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="sound-library-heading" className="flex flex-col gap-3">
        <h3 id="sound-library-heading" className="text-[13px] font-semibold">{t("cs.library")}</h3>
        <SoundLibraryPanel
          mappedIds={mappedIds}
          onLibraryChange={(library) => {
            setLibraryNames(new Map(library.items.map((s) => [s.id, s.name])));
            onLibraryChange();
          }}
          renderRowAction={
            track
              ? (sound: CustomSound) => {
                  const current = track.soundMap?.[String(pitch)] === sound.id;
                  return (
                    <Button
                      variant="secondary"
                      disabled={current}
                      onClick={() => {
                        const existingId = track.soundMap?.[String(pitch)];
                        if (existingId && existingId !== sound.id) {
                          setPendingReplace({
                            soundId: sound.id,
                            soundName: sound.name,
                            oldName:
                              customSounds.get(existingId)?.name ??
                              libraryNames.get(existingId) ??
                              t("cs.currentSound"),
                          });
                          return;
                        }
                        onSetSoundMapping(track.id, pitch, sound.id);
                      }}
                    >
                      {current ? t("cs.assigned", { pitch: pitchName(pitch) }) : t("cs.assignTo", { pitch: pitchName(pitch) })}
                    </Button>
                  );
                }
              : undefined
          }
        />
      </section>

      <ConfirmDialog
        open={!!pendingReplace && !!track}
        title={t("cs.replaceTitle", { pitch: pitchName(pitch) })}
        message={
          <>
            {tx("cs.replaceBody", { pitch: pitchName(pitch), old: <strong className="text-foreground">{pendingReplace?.oldName}</strong>, new: <strong className="text-foreground">{pendingReplace?.soundName}</strong> })}
          </>
        }
        confirmLabel={t("cs.replaceConfirm")}
        onConfirm={() => {
          if (pendingReplace && track) onSetSoundMapping(track.id, pitch, pendingReplace.soundId);
          setPendingReplace(null);
        }}
        onCancel={() => setPendingReplace(null)}
      />
    </div>
  );
}
