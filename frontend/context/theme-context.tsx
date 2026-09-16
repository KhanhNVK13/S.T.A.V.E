"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getMyTheme, setMyTheme } from "../lib/api-client";
import type { PresetThemeKey } from "../lib/api-client";
import { useAuth } from "./auth-context";

export const DEFAULT_PRESET: PresetThemeKey = "unleashed";

interface ThemeContextValue {
  /** Preset đã lưu trên tài khoản (nguồn sự thật). */
  savedPreset: PresetThemeKey;
  /** Preset đang hiển thị — bằng bản xem trước nếu có, ngược lại bằng bản đã lưu. */
  activePreset: PresetThemeKey;
  /** Có thay đổi chưa lưu hay không (UC-78 luồng 4.1). */
  isDirty: boolean;
  /** Xem trước ngay lập tức, KHÔNG ghi xuống server (UC-78 bước 4 + 4.1). */
  preview: (preset: PresetThemeKey) => void;
  /** Bỏ bản xem trước, quay lại preset đã lưu (UC-78 luồng 5.1). */
  cancelPreview: () => void;
  /** Lưu preset đang xem trước vào tài khoản (UC-78 bước 5-6). */
  save: () => Promise<boolean>;
  saving: boolean;
  error: string | null;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyToDocument(preset: PresetThemeKey) {
  document.documentElement.dataset.theme = preset;
}

/**
 * UC-78 — áp preset theme của tài khoản lên toàn app.
 *
 * Theme lưu THEO TÀI KHOẢN (bảng `themes` + `users.active_theme_id`), không
 * phải localStorage: SRS POST-3 yêu cầu lựa chọn theo người dùng qua mọi thiết
 * bị và phiên đăng nhập. Hệ quả chấp nhận được: lần tải trang đầu tiên hiển thị
 * preset mặc định trong lúc chờ API trả về.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [savedPreset, setSavedPreset] = useState<PresetThemeKey>(DEFAULT_PRESET);
  const [previewPreset, setPreviewPreset] = useState<PresetThemeKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadedForUser = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      loadedForUser.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- đăng xuất: phải trả theme về mặc định, không suy ra được từ render
      setSavedPreset(DEFAULT_PRESET);
      setPreviewPreset(null);
      applyToDocument(DEFAULT_PRESET);
      return;
    }

    if (loadedForUser.current === user.id) return;
    loadedForUser.current = user.id;

    void (async () => {
      try {
        const theme = await getMyTheme();
        // `type: 'custom'` là theme sinh từ ảnh (UC-79) — chưa xây dựng, nên ở
        // đây chỉ nhận preset; gặp custom thì rơi về mặc định thay vì vỡ giao diện.
        const key =
          theme?.type === "preset" && theme.presetKey
            ? (theme.presetKey as PresetThemeKey)
            : DEFAULT_PRESET;
        setSavedPreset(key);
        applyToDocument(key);
      } catch {
        // Không đọc được theme thì dùng mặc định — đây là thứ trang trí, không
        // đáng để chặn cả app.
        applyToDocument(DEFAULT_PRESET);
      }
    })();
  }, [user, authLoading]);

  const preview = useCallback((preset: PresetThemeKey) => {
    setError(null);
    setPreviewPreset(preset);
    applyToDocument(preset);
  }, []);

  const cancelPreview = useCallback(() => {
    setPreviewPreset(null);
    applyToDocument(savedPreset);
  }, [savedPreset]);

  const save = useCallback(async () => {
    if (!previewPreset) return true;
    setSaving(true);
    setError(null);
    try {
      await setMyTheme(previewPreset);
      setSavedPreset(previewPreset);
      setPreviewPreset(null);
      return true;
    } catch {
      // UC-78 ngoại lệ 6.E1: báo lỗi VÀ trả giao diện về theme đã lưu, không để
      // người dùng tưởng đã đổi xong.
      setError("Không lưu được theme. Giao diện đã được trả về lựa chọn cũ.");
      setPreviewPreset(null);
      applyToDocument(savedPreset);
      return false;
    } finally {
      setSaving(false);
    }
  }, [previewPreset, savedPreset]);

  return (
    <ThemeContext.Provider
      value={{
        savedPreset,
        activePreset: previewPreset ?? savedPreset,
        isDirty: previewPreset !== null && previewPreset !== savedPreset,
        preview,
        cancelPreview,
        save,
        saving,
        error,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
