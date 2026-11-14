"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { applyCvd, getCvd, getServerCvd, setCvd, subscribeCvd } from "../lib/color-vision";
import { getServerStillSky, getStillSky, setStillSky, subscribeStillSky } from "../lib/background-motion";

interface Accessibility {
  colorBlindMode: boolean;
  setColorBlindMode: (on: boolean) => void;
  stillBackground: boolean;
  setStillBackground: (on: boolean) => void;
}

const AccessibilityContext = createContext<Accessibility | null>(null);

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const colorBlindMode = useSyncExternalStore(subscribeCvd, getCvd, getServerCvd);
  const stillBackground = useSyncExternalStore(subscribeStillSky, getStillSky, getServerStillSky);

  useLayoutEffect(() => {
    applyCvd(document.documentElement, colorBlindMode);
  }, [colorBlindMode]);

  const value = useMemo<Accessibility>(
    () => ({ colorBlindMode, setColorBlindMode: setCvd, stillBackground, setStillBackground: setStillSky }),
    [colorBlindMode, stillBackground],
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility(): Accessibility {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error("useAccessibility must be used within AccessibilityProvider");
  return ctx;
}
