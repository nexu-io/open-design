import { useEffect, useId, useRef } from 'react';

interface Props {
  /** When false the dialog is unmounted entirely. */
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Visually marks the confirm button as a destructive action. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Reusable confirmation dialog used in place of the native `confirm(...)`
 * call. Native confirms in Electron leave the parent web contents
 * without restored input focus on dismiss, so any input the user clicks
 * after closing the dialog appears unfocusable until the window is
 * refocused (#1129). A React-managed modal lives inside the same
 * document and naturally restores focus to the previously-active
 * element on close.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: Props): JSX.Element | null {
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Stash the latest cancel handler in a ref so the open-effect below can
  // wire up Escape / focus-restore once per open transition without
  // re-subscribing every render when the parent passes a fresh closure.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    // Defer focus to after the modal has mounted into the DOM.
    queueMicrotask(() => confirmRef.current?.focus());

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancelRef.current();
        return;
      }
      if (event.key === 'Tab') {
        // Trap Tab inside the alertdialog. Native confirm(...) blocks all
        // background interaction; an in-app modal that lets Tab walk out
        // to the host page is a non-modal modal and lets keyboard users
        // activate unrelated controls (e.g. another project card) before
        // resolving the destructive prompt. Cycle between the two
        // buttons in both directions.
        const cancel = cancelRef.current;
        const confirm = confirmRef.current;
        if (!cancel || !confirm) return;
        event.preventDefault();
        const active = document.activeElement;
        if (event.shiftKey) {
          (active === cancel ? confirm : cancel).focus();
        } else {
          (active === confirm ? cancel : confirm).focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Returning focus to the trigger keeps Electron's native focus
      // tracking aligned with the React state, so the next click in the
      // host inputs lands cleanly.
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previous && previous.isConnected && typeof previous.focus === 'function') {
        previous.focus();
      } else {
        // Trigger was unmounted while the dialog was open — typical for
        // destructive flows where confirming removes the host element
        // (project card → its delete button) in the same React batch.
        // Focusing a detached node is a no-op and leaves Electron's
        // focus tracker stranded, which is the very regression this
        // dialog exists to prevent. Park focus on the document body so
        // the next user input has a valid focus owner to route from.
        document.body.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel} data-testid="confirm-dialog-backdrop">
      <div
        className="modal modal-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={messageId} className="hint">{message}</p>
        <div className="row">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            data-testid="confirm-dialog-cancel"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={destructive ? 'destructive' : undefined}
            onClick={onConfirm}
            data-testid="confirm-dialog-confirm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
