import { beforeEach, describe, expect, it } from "vitest";
import { en } from "./en";
import { vi as viDict } from "./vi";
import { tFor } from "./index";
import { translate } from "./translate";
import { getLang, setLang, LANG_STORAGE_KEY } from "./store";
import { formatRelativeTime } from "../format-date";

const dicts = {
  en: { hello: "Hello {name}", "item.one": "{n} item", "item.other": "{n} items", onlyEn: "English only" },
  vi: { hello: "Xin chào {name}", "item.one": "{n} mục", "item.other": "{n} mục" },
} as const;

describe("translate", () => {
  it("substitutes {variables} and leaves unknown ones intact", () => {
    expect(translate(dicts, "en", "hello", { name: "Khanh" })).toBe("Hello Khanh");
    expect(translate(dicts, "vi", "hello", { name: "Khanh" })).toBe("Xin chào Khanh");
    expect(translate(dicts, "en", "hello", {})).toBe("Hello {name}");
  });

  it("picks .one / .other from vars.n", () => {
    expect(translate(dicts, "en", "item", { n: 1 })).toBe("1 item");
    expect(translate(dicts, "en", "item", { n: 0 })).toBe("0 items");
    expect(translate(dicts, "en", "item", { n: 5 })).toBe("5 items");
    expect(translate(dicts, "vi", "item", { n: 1 })).toBe("1 mục");
  });

  it("falls back to English for a key missing in the active language", () => {
    expect(translate(dicts, "vi", "onlyEn")).toBe("English only");
  });

  it("returns the key itself when no dictionary has it", () => {
    expect(translate(dicts, "vi", "missing.key")).toBe("missing.key");
  });
});

describe("dictionaries", () => {
  it("English and Vietnamese share exactly the same keys", () => {
    expect(Object.keys(viDict).sort()).toEqual(Object.keys(en).sort());
  });

  it("keeps the same {placeholders} in both languages", () => {
    const names = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(names(viDict[key]), key).toBe(names(en[key]));
    }
  });

  it("has .one and .other together", () => {
    for (const key of Object.keys(en)) {
      if (key.endsWith(".one")) expect(en, key).toHaveProperty(key.replace(/\.one$/, ".other"));
    }
  });

  it("resolves typed keys per language", () => {
    expect(tFor("en", "nav.home")).toBe("Home");
    expect(tFor("vi", "nav.home")).toBe("Trang chủ");
    expect(tFor("en", "time.day", { n: 1 })).toBe("1 day ago");
    expect(tFor("vi", "time.day", { n: 3 })).toBe("3 ngày trước");
  });
});

describe("language store", () => {
  beforeEach(() => {
    setLang("en");
    window.localStorage.clear();
  });

  it("persists the chosen language to localStorage", () => {
    setLang("vi");
    expect(getLang()).toBe("vi");
    expect(window.localStorage.getItem(LANG_STORAGE_KEY)).toBe("vi");
  });

  it("formats relative time in the active language", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe("5 minutes ago");
    setLang("vi");
    expect(formatRelativeTime(fiveMinAgo)).toBe("5 phút trước");
  });
});
