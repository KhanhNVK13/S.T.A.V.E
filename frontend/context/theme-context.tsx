"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { isValidPalette, PALETTE_KEYS, type EffectiveTheme } from "@stave/shared-types";
import { getMyEffectiveTheme } from "../lib/api-billing";
import { useAuth } from "./auth-context";
import { useSessionReady } from "../lib/use-session-ready";

/** Gán 10 biến CSS custom lên <html>; truyền null để gỡ hết. */
export function applyCustomPalette(palette: Record<string, string> | null): void {
  const root = document.documentElement;
  for (const key of PALETTE_KEYS) {
    const value = palette?.[key];
    if (value) root.style.setProperty(key, value);
    else root.style.removeProperty(key);
  }
}

/** Theme này có được phép áp (custom + có quyền + palette hợp lệ)? */
export function canApplyTheme(theme: EffectiveTheme | null | undefined): boolean {
  return !!theme && theme.type === "custom" && theme.hasPaidAccess && isValidPalette(theme.palette);
}

interface ThemeContextValue {
  /** Theme lưu trong DB (BR-89: trả về cả khi hết quyền). */
  theme: EffectiveTheme | null;
  loading: boolean;
  /** Reload theme lưu sau khi vừa save. */
  refresh: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const sessionReady = useSessionReady();
  const [theme, setTheme] = useState<EffectiveTheme | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const effective = await getMyEffectiveTheme();
      setTheme(effective);
    } catch (err) {
      // Lỗi đọc theme (mất mạng / 5xx) — không áp theme custom; log để debug.
      console.warn("[theme] Could not load the effective theme", err);
      setTheme(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !sessionReady) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- đọc theme lưu khi phiên sẵn sàng
    void refresh();
  }, [user, sessionReady, refresh]);

  // Áp theme custom đã lưu (nếu đủ điều kiện) hoặc khôi phục preset mặc định.
  useEffect(() => {
    applyCustomPalette(canApplyTheme(theme) ? theme!.palette : null);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, loading, refresh }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Ngưỡng tối thiểu cho component mount ngoài provider (khung test/preview).
    return { theme: null, loading: true, refresh: async () => undefined };
  }
  return ctx;
}
