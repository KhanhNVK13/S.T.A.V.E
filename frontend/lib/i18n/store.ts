import { LANGS, type Lang } from "./translate";

export const LANG_STORAGE_KEY = "stave-lang";

let current: Lang = "en";
let initialized = false;
const listeners = new Set<() => void>();

function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as readonly string[]).includes(v);
}

function readStored(): Lang | null {
  try {
    const v = window.localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

function persist(lang: Lang) {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {}
}

function readInitial(): Lang {
  let asked: string | null = null;
  try {
    asked = new URLSearchParams(window.location.search).get("lang");
  } catch {}
  if (isLang(asked)) {
    persist(asked);
    return asked;
  }
  return readStored() ?? "en";
}

export function getLang(): Lang {
  if (!initialized && typeof window !== "undefined") {
    initialized = true;
    current = readInitial();
  }
  return current;
}

export function getServerLang(): Lang {
  return "en";
}

export function setLang(lang: Lang) {
  getLang();
  if (lang === current) return;
  current = lang;
  persist(lang);
  listeners.forEach((l) => l());
}

export function subscribeLang(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
