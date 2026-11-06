// fallow-ignore-file unused-file
// (consumers land in the shell/sidebar PRs later in this stack)
import { useEffect, useCallback, useRef, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

interface DialogBehaviorOptions {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  /**
   * Return false to veto a close triggered by Escape/backdrop (e.g. a dirty
   * draft the user hasn't submitted). Direct onClose calls are not guarded.
   */
  canClose?: () => boolean;
}

/**
 * Shared dialog contract for the studio's custom modals: document-level
 * Escape, Tab focus trap, focus-first-control on open, focus restore on close.
 * The consumer still renders its own markup and should set role="dialog" and
 * aria-modal="true" on the container.
 */
export function useDialogBehavior({
  open,
  onClose,
  containerRef,
  canClose,
}: DialogBehaviorOptions) {
  const restoreRef = useRef<HTMLElement | null>(null);
  const canCloseRef = useRef(canClose);
  canCloseRef.current = canClose;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = useCallback(() => {
    const guard = canCloseRef.current;
    if (guard && !guard()) return;
    onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    restoreRef.current = previouslyFocused instanceof HTMLElement ? previouslyFocused : null;

    const container = containerRef.current;
    const first = container?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? container)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== "Tab") return;
      const el = containerRef.current;
      if (!el) return;
      const focusables = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !el.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !el.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      restoreRef.current?.focus();
      restoreRef.current = null;
    };
  }, [open, containerRef, requestClose]);

  return { requestClose };
}
