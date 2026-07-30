import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Escape-to-close + a basic Tab focus trap for a modal overlay — shared by `ConfirmDialog`/
 * `PromptDialog` (accessibility hardening pass) so every dialog in the app gets the same fix from
 * one place instead of each dialog re-implementing it. Both dialogs already only mount their form
 * while `open` is true, so this hook doesn't need its own `open` guard — mounting it *is* "the
 * dialog just opened." Returns a ref to attach to the dialog's outer panel element (not the
 * fixed-inset-0 overlay wrapper — the actual bordered card that contains the real controls).
 */
export function useDialogA11y(onCancel: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onCancel(); return; }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  return panelRef;
}
