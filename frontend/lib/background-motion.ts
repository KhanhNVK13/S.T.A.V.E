export const STILL_SKY_STORAGE_KEY = "stave-still-sky";

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

let current = false;
let initialized = false;
const listeners = new Set<() => void>();

export function getStillSky(): boolean {
  if (!initialized && typeof window !== "undefined") {
    initialized = true;
    try {
      current = browserStorage()?.getItem(STILL_SKY_STORAGE_KEY) === "on";
    } catch {
      current = false;
    }
  }
  return current;
}

function persist(on: boolean): boolean {
  try {
    const storage = browserStorage();
    if (!storage) return false;
    if (on) storage.setItem(STILL_SKY_STORAGE_KEY, "on");
    else storage.removeItem(STILL_SKY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function getServerStillSky(): boolean {
  return false;
}

export function setStillSky(on: boolean): void {
  getStillSky();
  if (on === current) return;
  current = on;
  persist(on);
  listeners.forEach((listener) => listener());
}

export function subscribeStillSky(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
