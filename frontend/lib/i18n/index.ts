import { en } from "./en";
import { vi } from "./vi";
import { translate, type Lang, type Vars } from "./translate";
import { getLang } from "./store";

export type DictKey = keyof typeof en;

type PluralBase<K> = K extends `${infer B}.one` | `${infer B}.other` ? B : never;

export type TKey = DictKey | PluralBase<DictKey>;

export const DICTIONARIES: Record<Lang, Readonly<Record<string, string>>> = { en, vi };

export function tFor(lang: Lang, key: TKey, vars?: Vars): string {
  return translate(DICTIONARIES, lang, key, vars);
}

export function tNow(key: TKey, vars?: Vars): string {
  return tFor(getLang(), key, vars);
}

export { LANGS, LOCALES, type Lang, type Vars } from "./translate";
export { getLang, setLang, LANG_STORAGE_KEY } from "./store";
