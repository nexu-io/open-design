import { useId, useState } from 'react';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@open-design/components';
import { useT } from '../i18n';

/** Same skip key the recent-projects grid persists its 不再提示 choice under. */
export const MOVE_CONFIRM_SKIP_KEY = 'od.projects.moveConfirmSkip';

export function moveConfirmSkipped(): boolean {
  try {
    return window.localStorage.getItem(MOVE_CONFIRM_SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 转入/移出团队空间 confirmation. The recent-projects grid always confirmed
 * this boundary crossing; the in-workspace share toggles used to move the
 * project silently. Sharing one dialog (and one 不再提示 skip key) keeps the
 * consequence copy identical no matter which surface starts the move.
 */
export function MoveToTeamConfirmDialog({
  action,
  onCancel,
  onConfirm,
}: {
  action: 'to-team' | 'to-personal';
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const [dontRemind, setDontRemind] = useState(false);
  return (
    <Dialog
      className="modal-confirm"
      backdropClassName="modal-backdrop--no-blur"
      role="alertdialog"
      onClose={onCancel}
      closeOnEscape
      ariaLabelledBy={titleId}
    >
      <DialogTitle id={titleId}>
        {action === 'to-team'
          ? t('recentProjects.moveToTeam')
          : t('recentProjects.moveOutOfTeam')}
      </DialogTitle>
      <DialogDescription>
        {action === 'to-team' ? (
          <>
            {t('recentProjects.moveToTeamDescPre')}
            <strong>{t('recentProjects.moveToTeamDescStrong')}</strong>
            {t('recentProjects.moveToTeamDescPost')}
          </>
        ) : (
          <>
            {t('recentProjects.moveToPersonalDescPre')}
            <strong>{t('recentProjects.moveToPersonalDescStrong')}</strong>
            {t('recentProjects.moveToPersonalDescPost')}
          </>
        )}
      </DialogDescription>
      <DialogFooter className="row">
        <label className="recent-projects__move-remind">
          <input
            type="checkbox"
            checked={dontRemind}
            onChange={(event) => setDontRemind(event.target.checked)}
          />
          {t('recentProjects.moveDontRemind')}
        </label>
        <button type="button" onClick={onCancel}>
          {t('designs.renameCancel')}
        </button>
        <button
          type="button"
          className={`primary${action === 'to-team' ? ' recent-projects__move-confirm' : ''}`}
          onClick={() => {
            if (dontRemind) {
              try {
                window.localStorage.setItem(MOVE_CONFIRM_SKIP_KEY, '1');
              } catch {
                // best-effort persistence
              }
            }
            onConfirm();
          }}
        >
          {action === 'to-team'
            ? t('recentProjects.confirmMoveToTeam')
            : t('recentProjects.confirmMoveToPersonal')}
        </button>
      </DialogFooter>
    </Dialog>
  );
}
