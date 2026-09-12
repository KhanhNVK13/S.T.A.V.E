/**
 * redesign/ui-variant.ts
 * Lưu lựa chọn biến thể giao diện MIDI Editor theo TỪNG TRÌNH DUYỆT
 * (localStorage) — không phải setting tài khoản, không có API/migration nào.
 *
 * Dùng `useSyncExternalStore` thay vì `useState + useEffect` để:
 *   - không setState trong effect (React cảnh báo cascading render),
 *   - render phía server luôn ra "classic" nên không lệch hydration,
 *   - mọi instance đang mở cùng đọc một nguồn.
 *
 * Mọi trường hợp không đọc được (tab ẩn danh, storage bị chặn, giá trị lạ)
 * đều fallback về "classic" — đúng yêu cầu UI gốc là mặc định.
 */
export type EditorUiVariant = "classic" | "redesign";

const STORAGE_KEY = "stave:editor-ui-variant";

const listeners = new Set<() => void>();

export function subscribeUiVariant(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getUiVariant(): EditorUiVariant {
  try {
    return localStorage.getItem(STORAGE_KEY) === "redesign" ? "redesign" : "classic";
  } catch {
    return "classic";
  }
}

/** Snapshot lúc render phía server — luôn là UI gốc. */
export function getServerUiVariant(): EditorUiVariant {
  return "classic";
}

export function setUiVariant(next: EditorUiVariant): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* không lưu được thì vẫn đổi cho phiên hiện tại */
  }
  listeners.forEach((listener) => listener());
}
