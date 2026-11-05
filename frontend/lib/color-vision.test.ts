import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CVD_ATTRIBUTE,
  CVD_STORAGE_KEY,
  applyCvd,
  getCvd,
  readCvd,
  setCvd,
  subscribeCvd,
  writeCvd,
} from "./color-vision";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("readCvd", () => {
  it("is off when nothing is stored", () => {
    expect(readCvd(memoryStorage())).toBe(false);
  });

  it("is on only for the exact value 'on'", () => {
    expect(readCvd(memoryStorage({ [CVD_STORAGE_KEY]: "on" }))).toBe(true);
    expect(readCvd(memoryStorage({ [CVD_STORAGE_KEY]: "true" }))).toBe(false);
    expect(readCvd(memoryStorage({ [CVD_STORAGE_KEY]: "" }))).toBe(false);
  });

  it("falls back to off when storage is missing or throws", () => {
    expect(readCvd(null)).toBe(false);
    expect(readCvd(throwing)).toBe(false);
  });
});

describe("writeCvd", () => {
  it("stores 'on' and removes the key when turned off", () => {
    const storage = memoryStorage();
    writeCvd(true, storage);
    expect(storage.data.get(CVD_STORAGE_KEY)).toBe("on");
    writeCvd(false, storage);
    expect(storage.data.has(CVD_STORAGE_KEY)).toBe(false);
  });

  it("does not throw when storage is missing or throws", () => {
    expect(() => writeCvd(true, null)).not.toThrow();
    expect(() => writeCvd(true, throwing)).not.toThrow();
    expect(() => writeCvd(false, throwing)).not.toThrow();
  });
});

describe("applyCvd", () => {
  it("sets and removes data-cvd and never touches data-theme", () => {
    const root = document.createElement("html");
    applyCvd(root, true);
    expect(root.getAttribute(CVD_ATTRIBUTE)).toBe("on");
    expect(root.hasAttribute("data-theme")).toBe(false);
    applyCvd(root, false);
    expect(root.hasAttribute(CVD_ATTRIBUTE)).toBe(false);
  });
});

describe("store", () => {
  afterEach(() => {
    setCvd(false);
    vi.restoreAllMocks();
  });

  it("toggles in-session and notifies subscribers even when storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const callback = vi.fn();
    const unsubscribe = subscribeCvd(callback);
    setCvd(true);
    expect(getCvd()).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
    setCvd(true);
    expect(callback).toHaveBeenCalledTimes(1);
    unsubscribe();
    setCvd(false);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("persists to localStorage and follows storage events from other tabs", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeCvd(callback);
    setCvd(true);
    expect(window.localStorage.getItem(CVD_STORAGE_KEY)).toBe("on");
    window.localStorage.removeItem(CVD_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: CVD_STORAGE_KEY }));
    expect(getCvd()).toBe(false);
    unsubscribe();
  });
});
