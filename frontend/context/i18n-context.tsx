"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { LOCALES, tFor, type Lang, type TKey, type Vars } from "../lib/i18n";
import { getLang, getServerLang, setLang, subscribeLang } from "../lib/i18n/store";

export interface I18n {
  lang: Lang;
  locale: string;
  setLang: (lang: Lang) => void;
  t: (key: TKey, vars?: Vars) => string;
  tx: (key: TKey, nodes: Record<string, ReactNode>, vars?: Vars) => ReactNode;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, getLang, getServerLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key: TKey, vars?: Vars) => tFor(lang, key, vars), [lang]);
  const tx = useCallback(
    (key: TKey, nodes: Record<string, ReactNode>, vars?: Vars) =>
      tFor(lang, key, vars)
        .split(/(\{\w+\})/)
        .map((part, i) => {
          const name = /^\{(\w+)\}$/.exec(part)?.[1];
          return <Fragment key={i}>{name !== undefined && name in nodes ? nodes[name] : part}</Fragment>;
        }),
    [lang],
  );
  const value = useMemo<I18n>(() => ({ lang, locale: LOCALES[lang], setLang, t, tx }), [lang, t, tx]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const FALLBACK: I18n = {
  lang: "en",
  locale: LOCALES.en,
  setLang,
  t: (key, vars) => tFor("en", key, vars),
  tx: (key, _nodes, vars) => tFor("en", key, vars),
};

export function useI18n(): I18n {
  return useContext(I18nContext) ?? FALLBACK;
}

export function useT() {
  return useI18n().t;
}
