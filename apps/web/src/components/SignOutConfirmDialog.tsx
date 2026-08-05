import { useId } from 'react';
import { createPortal } from 'react-dom';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@open-design/components';
import { useT } from '../i18n';

interface Props {
  /** Disables both actions while the sign-out request is in flight. */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Sign-out confirmation (recvqgMWpJZqhL): every logout entry point — the
 * nav-rail account menu and the AMR account pill (Settings, chat error cards,
 * balance dialog) — must pass through this explicit confirm step so a stray
 * click can never sign the user out. Reuses the shared `modal-confirm`
 * alertdialog shape (Dialog + title/description/footer primitives) instead of
 * inventing a new popup.
 */
export function SignOutConfirmDialog({ busy = false, onCancel, onConfirm }: Props) {
  const t = useT();
  const titleId = useId();
  const dialog = (
    <Dialog
      className="modal-confirm"
      role="alertdialog"
      onClose={onCancel}
      closeOnEscape
      ariaLabelledBy={titleId}
      data-testid="sign-out-confirm-dialog"
    >
      <DialogTitle id={titleId}>{t('signOut.confirmTitle')}</DialogTitle>
      <DialogDescription>{t('signOut.confirmMessage')}</DialogDescription>
      <DialogFooter className="row">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          data-testid="sign-out-confirm-cancel"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="primary"
          onClick={onConfirm}
          disabled={busy}
          data-testid="sign-out-confirm-accept"
        >
          {t('signOut.confirmAction')}
        </button>
      </DialogFooter>
    </Dialog>
  );
  // Portal to <body>: both hosts live inside overflow/z-index scopes (nav rail,
  // settings panels) that would clip or stack under the backdrop otherwise.
  if (typeof document === 'undefined') return dialog;
  return createPortal(dialog, document.body);
}
