import { useId } from 'react';
import { createPortal } from 'react-dom';
import {
  Button,
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@open-design/components';
import { useT } from '../i18n';
import styles from './SignOutConfirmDialog.module.css';

interface Props {
  /** Disables both actions while the sign-out request is in flight. */
  busy?: boolean;
  email?: string | null;
  confirmDisabled?: boolean;
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
export function SignOutConfirmDialog({ busy = false, email, confirmDisabled = false, onCancel, onConfirm }: Props) {
  const t = useT();
  const titleId = useId();
  const dialog = (
    <Dialog
      className={`modal-confirm ${styles.dialog}`}
      role="alertdialog"
      onClose={() => { if (!busy) onCancel(); }}
      closeOnEscape
      ariaLabelledBy={titleId}
      data-testid="sign-out-confirm-dialog"
    >
      <DialogTitle id={titleId}>{t('signOut.confirmTitle')}</DialogTitle>
      <DialogDescription>{t('signOut.confirmMessage')}</DialogDescription>
      {email ? <div className={styles.account}><span className={styles.avatar} aria-hidden>{email.slice(0, 1).toUpperCase()}</span><span>{email}</span></div> : null}
      <DialogFooter className={styles.actions}>
        <Button
          type="button"
          onClick={onCancel}
          disabled={busy}
          data-testid="sign-out-confirm-cancel"
        >
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          className={styles.confirm}
          onClick={onConfirm}
          disabled={busy || confirmDisabled}
          data-testid="sign-out-confirm-accept"
        >
          {t('signOut.confirmAction')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
  // Portal to <body>: both hosts live inside overflow/z-index scopes (nav rail,
  // settings panels) that would clip or stack under the backdrop otherwise.
  if (typeof document === 'undefined') return dialog;
  return createPortal(dialog, document.body);
}
