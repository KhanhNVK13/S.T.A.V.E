import { CUSTOM_SOUND_QUOTA_KEY, bytesToMb, mbToBytes, validateSettingValue } from "@stave/shared-types";
import type { SettingDef, SettingErrorCode, SettingErrorParams, SettingValue } from "@stave/shared-types";
import type { TKey } from "../../../lib/i18n";

export type FieldDraft = string | boolean;

export type ParsedDraft =
  | { ok: true; value: SettingValue }
  | { ok: false; code: SettingErrorCode; params?: SettingErrorParams };

function usesMb(def: SettingDef): boolean {
  return def.key === CUSTOM_SOUND_QUOTA_KEY;
}

export function toFieldDraft(def: SettingDef, value: SettingValue): FieldDraft {
  if (typeof value === "boolean") return value;
  if (usesMb(def)) return String(Number(bytesToMb(value).toFixed(2)));
  return String(value);
}

export function parseFieldDraft(def: SettingDef, draft: FieldDraft): ParsedDraft {
  if (def.type === "boolean") {
    return typeof draft === "boolean" ? { ok: true, value: draft } : { ok: false, code: "not_boolean" };
  }
  const params: SettingErrorParams = { min: def.min, max: def.max, unit: def.unit };
  const text = typeof draft === "string" ? draft.trim() : "";
  if (!/^\d{1,12}$/.test(text)) return { ok: false, code: "not_integer", params };
  const value = usesMb(def) ? mbToBytes(Number(text)) : Number(text);
  const result = validateSettingValue(def, value);
  return result.ok ? { ok: true, value } : { ok: false, code: result.code, params: result.params };
}

export function isDirty(def: SettingDef, draft: FieldDraft, saved: SettingValue): boolean {
  if (def.type === "boolean") return draft !== saved;
  return typeof draft !== "string" || draft.trim() !== toFieldDraft(def, saved);
}

export function displayRange(def: SettingDef): { min: number; max: number } {
  const min = def.min ?? 0;
  const max = def.max ?? 0;
  return usesMb(def) ? { min: bytesToMb(min), max: bytesToMb(max) } : { min, max };
}

export function formatMb(bytes: number): string {
  return String(Math.ceil(bytesToMb(bytes) * 100) / 100);
}

export function unitLabelKey(def: SettingDef): TKey {
  if (def.unit === "bytes") return "aps.unit.mb";
  if (def.unit === "days") return "aps.unit.days";
  return "aps.unit.seconds";
}
