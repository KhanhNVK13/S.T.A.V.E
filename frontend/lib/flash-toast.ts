import type { ToastVariant } from "../components/ui/toast";

const FLASH_KEY = "stave_flash_toast";

export interface FlashToast {
  message: string;
  variant: ToastVariant;
}

export function setFlashToast(message: string, variant: ToastVariant = "success"): void {
  try {
    window.sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, variant }));
  } catch {}
}

export function takeFlashToast(): FlashToast | null {
  try {
    const raw = window.sessionStorage.getItem(FLASH_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(FLASH_KEY);
    const parsed = JSON.parse(raw) as Partial<FlashToast>;
    return typeof parsed.message === "string"
      ? { message: parsed.message, variant: parsed.variant ?? "success" }
      : null;
  } catch {
    return null;
  }
}
