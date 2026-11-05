export const CVD_STORAGE_KEY = "stave-cvd";
export const CVD_ATTRIBUTE = "data-cvd";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem" | "removeItem">;

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readCvd(storage: ReadableStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(CVD_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeCvd(on: boolean, storage: WritableStorage | null = browserStorage()): void {
  try {
    if (on) storage?.setItem(CVD_STORAGE_KEY, "on");
    else storage?.removeItem(CVD_STORAGE_KEY);
  } catch {}
}

export function applyCvd(root: Element, on: boolean): void {
  if (on) root.setAttribute(CVD_ATTRIBUTE, "on");
  else root.removeAttribute(CVD_ATTRIBUTE);
}

let current = false;
let initialized = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function getCvd(): boolean {
  if (!initialized && typeof window !== "undefined") {
    initialized = true;
    current = readCvd();
  }
  return current;
}

export function getServerCvd(): boolean {
  return false;
}

export function setCvd(on: boolean): void {
  getCvd();
  if (on === current) return;
  current = on;
  writeCvd(on);
  notify();
}

export function subscribeCvd(callback: () => void): () => void {
  listeners.add(callback);
  function onStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== CVD_STORAGE_KEY) return;
    const next = readCvd();
    if (next === current) return;
    current = next;
    notify();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}
