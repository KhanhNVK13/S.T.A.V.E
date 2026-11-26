"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { AlertCircle, Loader2, Music } from "lucide-react";
import { GM_INSTRUMENTS, type DraftNote } from "@stave/shared-types";
import type { AudioSketch } from "../../lib/api-client";
import {
  MAX_TRANSCRIBE_SEC,
  computeTranscribeRange,
  extractMidiNotesFromFrames,
  fetchAndDecodeAudio,
  resampleAudioForBasicPitch,
  runBasicPitchInference,
  type QuantizeDivision,
  type RawBasicPitchFrames,
} from "../../lib/audio-to-midi";
import { pitchName } from "../../lib/midi-note-name";
import { tNow } from "../../lib/i18n";
import { useI18n } from "../../context/i18n-context";
import { AiActionButton, AiBadge } from "../ai/ai-ui";
import { Button } from "../ui/button";
import { Dialog, DialogActions } from "../ui/dialog";
import { FieldError, INPUT_CLASS } from "../ui/form";

const DEFAULT_INSTRUMENT = "Acoustic Grand Piano";
const MAX_TRACK_NAME_LENGTH = 50;

const QUANTIZE_OPTIONS: { value: QuantizeDivision; labelKey?: "a2m.quantizeOff"; label?: string }[] = [
  { value: null, labelKey: "a2m.quantizeOff" },
  { value: 8, label: "1/8" },
  { value: 16, label: "1/16" },
  { value: 32, label: "1/32" },
];

const INSTRUMENT_GROUPS = (() => {
  const groups = new Map<string, string[]>();
  for (const inst of GM_INSTRUMENTS) {
    const list = groups.get(inst.category);
    if (list) list.push(inst.name);
    else groups.set(inst.category, [inst.name]);
  }
  return Array.from(groups.entries());
})();

export interface AudioToMidiConfirmPayload {
  name: string;
  instrument: string | null;
  notes: Omit<DraftNote, "trackId">[];
}

export interface AudioToMidiDialogProps {
  open: boolean;
  onClose: () => void;
  buffer?: AudioBuffer | null;
  trim?: { start: number; end: number };
  sketch?: AudioSketch | null;
  tempo: number;
  ppq: number;
  canAddTrack: boolean;
  maxTracks?: number;
  defaultTrackName: string;
  onConfirm: (payload: AudioToMidiConfirmPayload) => void;
}

type Phase = "preparing" | "analyzing" | "ready" | "error";

export function AudioToMidiDialog(props: AudioToMidiDialogProps) {
  if (!props.open) return null;
  const sourceKey = props.sketch
    ? `sketch:${props.sketch.id}:${props.sketch.trim_start_sec}:${props.sketch.trim_end_sec ?? ""}`
    : `buffer:${props.trim?.start ?? 0}:${props.trim?.end ?? props.buffer?.duration ?? 0}:${props.defaultTrackName}`;
  return <AudioToMidiDialogBody key={sourceKey} {...props} />;
}

function AudioToMidiDialogBody({
  onClose,
  buffer,
  trim,
  sketch,
  tempo,
  ppq,
  canAddTrack,
  maxTracks = 32,
  defaultTrackName,
  onConfirm,
}: AudioToMidiDialogProps) {
  const { t } = useI18n();
  const onsetId = useId();
  const frameId = useId();
  const nameId = useId();
  const nameErrorId = useId();
  const instrumentId = useId();

  const [phase, setPhase] = useState<Phase>("preparing");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rawFrames, setRawFrames] = useState<RawBasicPitchFrames | null>(null);
  const [analyzedSec, setAnalyzedSec] = useState(0);
  const [wasCapped, setWasCapped] = useState(false);

  const [onsetThreshold, setOnsetThreshold] = useState(0.5);
  const [frameThreshold, setFrameThreshold] = useState(0.3);
  const [quantizeDivision, setQuantizeDivision] = useState<QuantizeDivision>(16);
  const [trackName, setTrackName] = useState(() =>
    defaultTrackName.trim().slice(0, MAX_TRACK_NAME_LENGTH),
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [instrument, setInstrument] = useState<string>(DEFAULT_INSTRUMENT);
  const [attempt, setAttempt] = useState(0);

  const trimStartProp = trim?.start ?? 0;
  const trimEndProp = trim?.end;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        let sourceBuffer = buffer ?? null;
        let startSec = trimStartProp;
        let endSec = trimEndProp;

        if (!sourceBuffer) {
          if (!sketch?.playbackUrl) {
            await Promise.reject(new Error(tNow("a2m.noPlayback")));
          }
          sourceBuffer = await fetchAndDecodeAudio(sketch!.playbackUrl!);
          if (cancelled) return;
          startSec = sketch!.trim_start_sec;
          endSec = sketch!.trim_end_sec ?? sourceBuffer.duration;
        }

        const range = computeTranscribeRange(sourceBuffer.duration, startSec, endSec);
        const mono22k = await resampleAudioForBasicPitch(sourceBuffer, range.startSec, range.endSec);
        if (cancelled) return;

        setPhase("analyzing");
        setProgress(0);
        setAnalyzedSec(range.durationSec);
        setWasCapped(range.wasCapped);

        const raw = await runBasicPitchInference(mono22k, (pct) => {
          if (!cancelled) {
            setProgress(pct);
          }
        });
        if (cancelled) return;

        setRawFrames(raw);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error && err.message ? err.message : tNow("a2m.errorGeneric");
        setErrorMessage(msg);
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [buffer, trimStartProp, trimEndProp, sketch, attempt]);

  const notes = useMemo(() => {
    if (!rawFrames) return [];
    return extractMidiNotesFromFrames(rawFrames, {
      tempo,
      ppq,
      onsetThreshold,
      frameThreshold,
      quantizeDivision,
    });
  }, [rawFrames, tempo, ppq, onsetThreshold, frameThreshold, quantizeDivision]);

  const pitchRange = useMemo(() => {
    if (notes.length === 0) return null;
    let minPitch = 127;
    let maxPitch = 0;
    for (const note of notes) {
      if (note.pitch < minPitch) minPitch = note.pitch;
      if (note.pitch > maxPitch) maxPitch = note.pitch;
    }
    return minPitch === maxPitch ? pitchName(minPitch) : `${pitchName(minPitch)}–${pitchName(maxPitch)}`;
  }, [notes]);

  function handleRetry() {
    setErrorMessage(null);
    setProgress(0);
    setPhase("preparing");
    setAttempt((n) => n + 1);
  }

  function handleConfirm() {
    const trimmed = trackName.trim();
    if (!trimmed) {
      setNameError(t("a2m.trackNameRequired"));
      return;
    }
    if (notes.length === 0 || !canAddTrack) return;
    onConfirm({
      name: trimmed.slice(0, MAX_TRACK_NAME_LENGTH),
      instrument: instrument || null,
      notes,
    });
  }

  return (
    <Dialog
      open
      title={
        <span className="flex flex-wrap items-center gap-2">
          <AiBadge />
          <span>{t("a2m.dialogTitle")}</span>
        </span>
      }
      onClose={onClose}
      className="max-w-lg p-6"
    >
      <p className="mb-4 text-xs leading-relaxed text-muted">{t("a2m.localNote")}</p>

      {(phase === "preparing" || phase === "analyzing") && (
        <div className="mb-5 rounded-card border border-violet/30 bg-violet-muted/25 p-4" role="status">
          <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-foreground">
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-violet motion-reduce:animate-none" aria-hidden="true" />
              {phase === "preparing" ? t("a2m.preparing") : t("a2m.analyzing", { pct: progress })}
            </span>
            {phase === "analyzing" && (
              <span className="font-mono text-xs text-violet">{progress}%</span>
            )}
          </div>
          <div
            role="progressbar"
            aria-valuenow={phase === "preparing" ? 0 : progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-subtle"
          >
            <div
              className="h-full rounded-full bg-violet transition-[width] duration-150"
              style={{ width: `${phase === "preparing" ? 8 : Math.max(4, progress)}%` }}
            />
          </div>
          <p className="mt-2.5 text-xs text-muted">
            {t("a2m.analyzingHint", { max: MAX_TRANSCRIBE_SEC })}
          </p>
        </div>
      )}

      {phase === "error" && (
        <div role="alert" className="mb-5 rounded-card border border-danger/30 bg-danger-muted p-4">
          <div className="flex items-start gap-2.5 text-[13px] text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold">{t("a2m.errorGeneric")}</p>
              {errorMessage && errorMessage !== t("a2m.errorGeneric") && (
                <p className="text-xs text-danger/90">{errorMessage}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {phase === "ready" && (
        <div className="mb-5 space-y-4">
          {wasCapped && (
            <p
              role="status"
              className="rounded-card border border-warning/30 bg-warning-muted px-3 py-2 text-xs text-warning-foreground"
            >
              {t("a2m.cappedWarn", { max: MAX_TRANSCRIBE_SEC })}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2.5 rounded-card border border-violet/30 bg-violet-muted/20 p-3">
            <div>
              <p className="text-xs text-muted">{t("a2m.notesLabel")}</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-foreground" data-testid="a2m-note-count">
                {notes.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">{t("a2m.rangeLabel")}</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-foreground" data-testid="a2m-pitch-range">
                {pitchRange ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">{t("a2m.durationLabel")}</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-foreground" data-testid="a2m-analyzed-duration">
                {analyzedSec.toFixed(1)}s
              </p>
            </div>
          </div>

          {notes.length === 0 && (
            <p
              role="status"
              className="rounded-card border border-warning/30 bg-warning-muted px-3 py-2 text-xs text-warning-foreground"
            >
              {t("a2m.emptyNotes")}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={onsetId} className="text-xs font-semibold text-foreground">
                  {t("a2m.onsetLabel")}
                </label>
                <span className="font-mono text-xs text-violet">{onsetThreshold.toFixed(2)}</span>
              </div>
              <input
                id={onsetId}
                type="range"
                min={0.2}
                max={0.8}
                step={0.05}
                value={onsetThreshold}
                onChange={(e) => setOnsetThreshold(Number(e.target.value))}
                className="mt-1.5 w-full accent-[var(--violet)]"
              />
              <p className="mt-1 text-xs text-muted">{t("a2m.onsetHint")}</p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={frameId} className="text-xs font-semibold text-foreground">
                  {t("a2m.frameLabel")}
                </label>
                <span className="font-mono text-xs text-violet">{frameThreshold.toFixed(2)}</span>
              </div>
              <input
                id={frameId}
                type="range"
                min={0.15}
                max={0.7}
                step={0.05}
                value={frameThreshold}
                onChange={(e) => setFrameThreshold(Number(e.target.value))}
                className="mt-1.5 w-full accent-[var(--violet)]"
              />
              <p className="mt-1 text-xs text-muted">{t("a2m.frameHint")}</p>
            </div>
          </div>

          <div>
            <span className="block text-xs font-semibold text-foreground">
              {t("a2m.quantizeLabel")}
            </span>
            <div
              role="group"
              aria-label={t("a2m.quantizeLabel")}
              className="mt-1.5 inline-flex flex-wrap gap-1.5 rounded-card border border-border bg-surface-subtle p-1"
            >
              {QUANTIZE_OPTIONS.map((opt) => {
                const active = quantizeDivision === opt.value;
                const label = opt.labelKey ? t(opt.labelKey) : (opt.label ?? "");
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setQuantizeDivision(opt.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "border border-violet/45 bg-violet-muted text-violet"
                        : "border border-transparent text-muted hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={nameId} className="text-xs font-semibold text-foreground">
                {t("a2m.trackNameLabel")}
              </label>
              <input
                id={nameId}
                type="text"
                autoComplete="off"
                value={trackName}
                maxLength={MAX_TRACK_NAME_LENGTH}
                placeholder={t("a2m.trackNamePlaceholder")}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? nameErrorId : undefined}
                onChange={(e) => {
                  setTrackName(e.target.value);
                  if (nameError && e.target.value.trim()) setNameError(null);
                }}
                className={`${INPUT_CLASS} h-9`}
              />
              {nameError && <FieldError id={nameErrorId}>{nameError}</FieldError>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={instrumentId} className="text-xs font-semibold text-foreground">
                {t("a2m.instrumentLabel")}
              </label>
              <div className="relative flex items-center">
                <Music className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted" aria-hidden="true" />
                <select
                  id={instrumentId}
                  value={instrument}
                  onChange={(e) => setInstrument(e.target.value)}
                  className={`${INPUT_CLASS} h-9 w-full pl-8`}
                >
                  {INSTRUMENT_GROUPS.map(([category, names]) => (
                    <optgroup key={category} label={category}>
                      {names.map((instName) => (
                        <option key={instName} value={instName}>
                          {instName}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {!canAddTrack && (
            <p role="alert" className="text-xs font-medium text-danger">
              {t("a2m.trackLimitWarn", { n: maxTracks })}
            </p>
          )}
        </div>
      )}

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t("a2m.cancel")}
        </Button>
        {phase === "error" ? (
          <AiActionButton label={t("a2m.retry")} onClick={handleRetry} />
        ) : (
          <AiActionButton
            label={t("a2m.confirm")}
            onClick={handleConfirm}
            disabled={phase !== "ready" || notes.length === 0 || !canAddTrack}
          />
        )}
      </DialogActions>
    </Dialog>
  );
}
