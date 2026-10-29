"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Open dialogs (modals, side panels, sheets) form a stack. Only the top one
 * reacts to Escape and keeps Tab inside itself, so a form opened from a
 * details panel closes first and the panel stays put.
 */
const stack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function useDialogLayer(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const id = Symbol("dialog");
    stack.push(id);
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Keep focus on a field that autofocused itself inside the dialog.
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (stack[stack.length - 1] !== id) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !ref.current) return;
      const items = focusables(ref.current);
      if (items.length === 0) {
        event.preventDefault();
        ref.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === ref.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!ref.current.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const at = stack.indexOf(id);
      if (at >= 0) stack.splice(at, 1);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, ref]);
}
