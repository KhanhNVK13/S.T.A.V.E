"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { DraftTrack } from "@stave/shared-types";
import type { CustomSound, ResolvedCustomSound } from "../../lib/api-client";
import { pitchName } from "../../lib/midi-note-name";
import { Button } from "../ui/button";
import { INPUT_CLASS } from "../ui/form";
import { SoundLibraryPanel } from "./sound-library-panel";

const PITCHES = Array.from({ length: 128 }, (_, i) => 127 - i);

interface CustomSoundsPanelProps {
  track: DraftTrack | null;
  defaultPitch: number;
  customSounds: Map<string, ResolvedCustomSound>;
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
  const name = resolved?.name ?? libraryName;
  const broken = resolved && !resolved.playable;
  return (
    <li className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2">
      <span className="w-12 shrink-0 font-mono text-xs font-semibold tabular-nums">{pitchName(pitch)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px]">{name ?? (resolved ? "Âm thanh không còn tồn tại" : "Đang kiểm tra…")}</div>
        {broken && (
          <div className="flex items-center gap-1 text-xs text-warning-foreground">
            <AlertTriangle size={12} aria-hidden />
            {resolved.reason === "deleted"
              ? "Đã xoá khỏi thư viện — nốt này phát bằng nhạc cụ của track"
              : "Không phát được — nốt này phát bằng nhạc cụ của track"}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Bỏ gán âm thanh cho nốt ${pitchName(pitch)}`}
        title="Bỏ gán"
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
  onSetSoundMapping,
  onLibraryChange,
}: CustomSoundsPanelProps) {
  const [pitch, setPitch] = useState(defaultPitch);
  const [libraryNames, setLibraryNames] = useState<Map<string, string>>(new Map());

  const mappings = Object.entries(track?.soundMap ?? {})
    .map(([key, soundId]) => ({ pitch: Number(key), soundId }))
    .sort((a, b) => b.pitch - a.pitch);

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="sound-mapping-heading" className="flex flex-col gap-3">
        <h3 id="sound-mapping-heading" className="text-[13px] font-semibold">
          {track ? `Âm thanh riêng của track “${track.name}”` : "Gán âm thanh cho nốt"}
        </h3>
        {!track ? (
          <p className="text-xs text-muted">Chọn một track ở panel Tracks để gán âm thanh cho từng nốt của track đó.</p>
        ) : (
          <>
            <p className="text-xs text-muted">
              Mỗi nốt được gán sẽ phát nguyên âm thanh đó (như pad trống) thay cho nhạc cụ của track. Thay đổi được lưu vào bản nháp và đi theo commit.
            </p>
            <label className="flex items-center gap-2 text-xs font-semibold">
              Nốt cần gán
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
        <h3 id="sound-library-heading" className="text-[13px] font-semibold">Thư viện của bạn</h3>
        <SoundLibraryPanel
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
                      onClick={() => onSetSoundMapping(track.id, pitch, sound.id)}
                    >
                      {current ? `Đang gán ${pitchName(pitch)}` : `Gán vào ${pitchName(pitch)}`}
                    </Button>
                  );
                }
              : undefined
          }
        />
      </section>
    </div>
  );
}
