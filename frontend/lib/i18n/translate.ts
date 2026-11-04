export type Lang = "en" | "vi";

export const LANGS: readonly Lang[] = ["en", "vi"];

export const LOCALES: Record<Lang, string> = { en: "en-US", vi: "vi-VN" };

export type Vars = Record<string, string | number>;

type Dict = Readonly<Record<string, string>>;

export function translate(dicts: Record<Lang, Dict>, lang: Lang, key: string, vars?: Vars): string {
  let k = key;
  if (vars && typeof vars.n === "number") {
    const pk = `${key}${vars.n === 1 ? ".one" : ".other"}`;
    if (Object.prototype.hasOwnProperty.call(dicts.en, pk)) k = pk;
  }
  const own = (d: Dict) => (Object.prototype.hasOwnProperty.call(d, k) ? d[k] : undefined);
  const raw = own(dicts[lang]) ?? own(dicts.en) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (vars[name] === undefined ? m : String(vars[name])));
}
