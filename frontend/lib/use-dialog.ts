"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const openDialogs: HTMLElement[] = [];

export function isDialogOpen(): boolean {
  return openDialogs.length > 0;
}

interface UseDialogOptions {
  open?: boolean;
  onClose: () => void;
  closeDisabled?: boolean;
}

/** Gắn ref vào khung hộp thoại (cần `tabIndex={-1}`); focus ban đầu ưu tiên `[data-autofocus]`. */
export function useDialog<T extends HTMLElement>({
  open = true,
  onClose,
  closeDisabled = false,
}: UseDialogOptions) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  });

  useEffect(() => {
    const node = ref.current;
    if (!open || !node) return;

    const previous = document.activeElement as HTMLElement | null;
    openDialogs.push(node);
    const main = document.querySelector("main");
    const previousOverflow = main?.style.overflow ?? "";
    if (main && openDialogs.length === 1) main.style.overflow = "hidden";

    const initial =
      node.querySelector<HTMLElement>("[data-autofocus]") ??
      node.querySelector<HTMLElement>(FOCUSABLE) ??
      node;
    initial.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (openDialogs[openDialogs.length - 1] !== node || !node) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!closeDisabledRef.current) onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!node.contains(active) || active === node) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      openDialogs.splice(openDialogs.indexOf(node), 1);
      if (main && openDialogs.length === 0) main.style.overflow = previousOverflow;
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open]);

  return ref;
}
