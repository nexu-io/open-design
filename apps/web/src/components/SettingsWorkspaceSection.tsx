import type { WorkspaceCollabContext } from '@open-design/contracts';
import { Icon } from './Icon';
import { canShowWorkspaceSettings } from '../collab/settings-access';
import { useT } from '../i18n';
import styles from './SettingsWorkspaceSection.module.css';

// Settings > Workspace region. Team management (members, billing, dashboard)
// lives in the cloud web console, not the local client — so this region is just
// a link out to that console, gated on the folded permission bit
// (`canShowWorkspaceSettings`, never a role re-derivation). It renders nothing of
// those lanes' business views. A locked workspace still shows the recovery link.

export function SettingsWorkspaceSection({
  context,
}: {
  context: WorkspaceCollabContext | null;
}) {
  const t = useT();

  // Shell-level guard: the Workspace region only exists for a team workspace whose
  // viewer may see workspace settings. Gate on the folded permission bit directly.
  if (!canShowWorkspaceSettings(context) || !context) {
    return null;
  }

  const locked = context.lifecycleState === 'locked';
  const recovery = context.billingRecovery;
  const consoleUrl = context.workspaceSettingsUrl?.trim() || null;

  return (
    <section className="settings-section" data-testid="settings-workspace-section">
      {locked ? (
        <div className={styles.locked} data-testid="settings-workspace-locked">
          <div className={styles.lockedHead}>
            <Icon name="alert-triangle" size={14} />
            {t('entry.workspaceLockedNote')}
          </div>
          {recovery?.canEnterBillingRecovery && recovery.recoveryUrl ? (
            <a
              className={styles.lockedAction}
              href={recovery.recoveryUrl}
              target="_blank"
              rel="noreferrer noopener"
              data-testid="settings-workspace-recover"
            >
              {t('entry.workspaceLockedRecover')}
            </a>
          ) : null}
        </div>
      ) : null}
      <p className="hint">{t('settings.workspaceLede')}</p>
      {consoleUrl ? (
        <a
          className={styles.entry}
          href={consoleUrl}
          target="_blank"
          rel="noreferrer noopener"
          data-testid="settings-workspace-console"
        >
          <span className={styles.entryIcon} aria-hidden>
            <Icon name="settings" size={18} />
          </span>
          <span className={styles.entryText}>
            <strong>{t('entry.navWorkspaceSettings')}</strong>
            <small>{t('settings.workspaceLede')}</small>
          </span>
          <Icon name="chevron-right" size={16} />
        </a>
      ) : null}
    </section>
  );
}
