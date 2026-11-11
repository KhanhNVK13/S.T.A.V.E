"use client";

import { useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  THEME_PRESET_KEYS,
  THEME_PRESET_PALETTES,
  type ThemePresetKey,
} from "@stave/shared-types";
import { useI18n } from "../../context/i18n-context";
import { useTheme } from "../../context/theme-context";
import { activateSavedCustomTheme, setMyPresetTheme } from "../../lib/api-billing";
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import type { TKey } from "../../lib/i18n";
import { nextRadioIndex } from "../../lib/radio-group-nav";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";

const DEFAULT_SWATCH = {
  background: "oklch(0.14 0.022 275)",
  surface: "oklch(0.19 0.03 275)",
  metal: "oklch(0.82 0.07 82)",
};

const PRESET_LABELS: Record<ThemePresetKey, TKey> = {
  space: "tp.space",
  moss: "tp.moss",
  claret: "tp.claret",
  unleashed: "tp.unleashed",
  tide: "tp.tide",
};

function swatchOf(key: ThemePresetKey) {
  if (key === "space") return DEFAULT_SWATCH;
  const palette = THEME_PRESET_PALETTES[key];
  return {
    background: palette["--background"],
    surface: palette["--surface"],
    metal: palette["--metal"],
  };
}

export function ThemePresets() {
  const { t } = useI18n();
  const { theme, loading, refresh } = useTheme();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pending, setPending] = useState<ThemePresetKey | null>(null);
  const [error, setError] = useState<ErrorSource | null>(null);
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const usingCustom = theme?.type === "custom";
  const customApplied = usingCustom && theme.hasPaidAccess;
  const selected: ThemePresetKey | null = !theme || usingCustom
    ? null
    : THEME_PRESET_KEYS.find((key) => key === theme.presetKey) ?? "space";
  const canReuseSaved = !!theme?.hasSavedCustom && theme.hasPaidAccess && theme.type !== "custom";

  async function choose(key: ThemePresetKey) {
    setBusyKey(key);
    setError(null);
    try {
      await setMyPresetTheme(key);
      await refresh();
      setPending(null);
    } catch (err) {
      setError(errorSource(err, "tp.saveFail"));
    } finally {
      setBusyKey(null);
    }
  }

  async function reuseSaved() {
    setBusyKey("saved");
    setError(null);
    try {
      await activateSavedCustomTheme();
      await refresh();
    } catch (err) {
      setError(errorSource(err, "tp.reuseFail"));
    } finally {
      setBusyKey(null);
    }
  }

  const tabStopIndex = Math.max(0, selected ? THEME_PRESET_KEYS.indexOf(selected) : 0);
  const radioBusy = loading || busyKey !== null;

  function onRadioKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextRadioIndex(index, e.key, THEME_PRESET_KEYS.length);
    if (next === null) return;
    e.preventDefault();
    radioRefs.current[next]?.focus();
    onPick(THEME_PRESET_KEYS[next]);
  }

  function onPick(key: ThemePresetKey) {
    if (key === selected || busyKey || loading) return;
    if (customApplied) setPending(key);
    else void choose(key);
  }

  return (
    <div className="space-y-3" data-testid="theme-presets">
      <h3 className="text-sm font-semibold">{t("tp.title")}</h3>
      <p className="text-xs text-muted">{t("tp.lead")}</p>

      <div role="radiogroup" aria-label={t("tp.title")} className="flex flex-wrap gap-3">
        {THEME_PRESET_KEYS.map((key, index) => {
          const swatch = swatchOf(key);
          const active = key === selected;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              ref={(node) => {
                radioRefs.current[index] = node;
              }}
              tabIndex={index === tabStopIndex ? 0 : -1}
              aria-disabled={radioBusy}
              onKeyDown={(e) => onRadioKeyDown(e, index)}
              onClick={() => onPick(key)}
              data-testid={`theme-preset-${key}`}
              className={`flex w-24 flex-col items-center gap-2 rounded-card border p-2 text-xs transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-60 ${
                active ? "border-accent bg-accent-muted/40" : "border-border hover:border-border-strong"
              }`}
            >
              <span
                aria-hidden="true"
                className="relative flex h-10 w-full items-end justify-end overflow-hidden rounded border border-border-strong p-1"
                style={{ background: swatch.background }}
              >
                <span className="absolute inset-x-0 bottom-0 h-3" style={{ background: swatch.surface }} />
                <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: swatch.metal }} />
              </span>
              <span className="flex items-center gap-1 font-medium text-foreground">
                {busyKey === key ? (
                  <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                ) : (
                  active && <Check aria-hidden="true" className="h-3 w-3 text-accent" />
                )}
                {t(PRESET_LABELS[key])}
              </span>
            </button>
          );
        })}
      </div>

      {canReuseSaved && (
        <Button type="button" variant="secondary" onClick={() => void reuseSaved()} disabled={busyKey !== null}>
          {busyKey === "saved" && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
          {t("tp.reuseSaved")}
        </Button>
      )}

      {error && !pending && (
        <p role="alert" className="text-xs text-danger">
          {renderError(error)}
        </p>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={t("tp.replaceTitle")}
        message={t("tp.replaceBody")}
        confirmLabel={t("tp.replaceConfirm")}
        loading={busyKey !== null}
        error={pending ? renderError(error) : null}
        onConfirm={() => pending && void choose(pending)}
        onCancel={() => {
          setPending(null);
          setError(null);
        }}
      />
    </div>
  );
}
