import { useId } from 'react';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@open-design/components';

import { useT } from '../../i18n';
import type { ProjectShareReadStatus } from '../share/useProjectShareHistory';
import styles from './ProjectDeleteConfirmDialog.module.css';

/**
 * The one delete confirmation every project entry point shows (OPEND-2797):
 * the Home / 草稿 / 全部项目 cards and the rail's 最近项目 rows all open this
 * same dialog, so a stray click can never destroy a project from any of them.
 * Names the project, offers 取消 + a red 删除, closes on Esc / scrim / 取消,
 * and locks both buttons while the request is in flight so a double click
 * cannot submit twice. A failed request keeps it open and says so.
 *
 * State lives in {@link useProjectDeleteFlow}; this is only the surface.
 */
export function ProjectDeleteConfirmDialog({
  projectName,
  activeShareCount = null,
  shareReadStatus,
  pending,
  failed,
  errorMessage,
  onCancel,
  onConfirm,
}: {
  projectName: string;
  activeShareCount?: number | null;
  shareReadStatus: ProjectShareReadStatus;
  pending: boolean;
  failed: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const hasActiveShares = activeShareCount !== null && Number.isSafeInteger(activeShareCount) && activeShareCount > 0;
  return (
    <Dialog
      className={hasActiveShares ? `modal-confirm ${styles.activeShareDialog}` : 'modal-confirm'}
      role="alertdialog"
      onClose={() => {
        if (pending) return;
        onCancel();
      }}
      closeOnBackdrop={!pending}
      closeOnEscape={!pending}
      ariaLabelledBy={titleId}
      data-testid="project-delete-confirm-dialog"
    >
      <DialogTitle id={titleId}>{hasActiveShares
        ? t('designs.deleteConfirm', { name: projectName })
        : t('designs.deleteTitle')}</DialogTitle>
      <DialogDescription role={shareReadStatus === 'error' ? 'alert' : undefined}>
        {shareReadStatus === 'error' ? t('ds.actionFailed')
          : shareReadStatus !== 'ready' ? t('common.loading')
          : hasActiveShares ? t('designs.deleteActiveShares', { count: activeShareCount })
          : t('designs.deleteConfirm', { name: projectName })}
      </DialogDescription>
      {failed ? (
        <p className="recent-projects__card-menu-error" role="alert">
          {errorMessage || t('ds.actionFailed')}
        </p>
      ) : null}
      <DialogFooter className={hasActiveShares ? `row ${styles.activeShareFooter}` : 'row'}>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className={hasActiveShares ? styles.activeShareCancel : undefined}
          data-testid="project-delete-confirm-cancel"
        >
          {t('designs.renameCancel')}
        </button>
        <button
          type="button"
          className={hasActiveShares ? `primary danger ${styles.activeShareDelete}` : 'primary danger'}
          disabled={pending || shareReadStatus !== 'ready' || activeShareCount === null}
          onClick={onConfirm}
          data-testid="project-delete-confirm-accept"
        >
          {t('designs.menuDelete')}
        </button>
      </DialogFooter>
    </Dialog>
  );
}
