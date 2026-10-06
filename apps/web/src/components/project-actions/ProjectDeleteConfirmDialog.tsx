import { useId } from 'react';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@open-design/components';

import { useT } from '../../i18n';

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
  pending,
  failed,
  onCancel,
  onConfirm,
}: {
  projectName: string;
  pending: boolean;
  failed: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const titleId = useId();
  return (
    <Dialog
      className="modal-confirm"
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
      <DialogTitle id={titleId}>{t('designs.deleteTitle')}</DialogTitle>
      <DialogDescription>{t('designs.deleteConfirm', { name: projectName })}</DialogDescription>
      {failed ? (
        <p className="recent-projects__card-menu-error" role="alert">
          {t('ds.actionFailed')}
        </p>
      ) : null}
      <DialogFooter className="row">
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          data-testid="project-delete-confirm-cancel"
        >
          {t('designs.renameCancel')}
        </button>
        <button
          type="button"
          className="primary danger"
          disabled={pending}
          onClick={onConfirm}
          data-testid="project-delete-confirm-accept"
        >
          {t('designs.menuDelete')}
        </button>
      </DialogFooter>
    </Dialog>
  );
}
