import { useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { RailAccountRecoveryTip } from './CloudSignInTip';
import styles from './ProjectWorkspaceRecoveryTip.module.css';

/**
 * Keep a transient Workspace authority outage visible without replacing the
 * healthy local project data plane. This deliberately reuses the rail's
 * existing recovery language and status semantics.
 */
export function ProjectWorkspaceRecoveryTip({
  onCreateDeviceProject,
}: {
  onCreateDeviceProject?: () => Promise<void>;
}) {
  const { t } = useI18n();
  const submitting = useRef(false);
  const [creating, setCreating] = useState(false);

  async function createDeviceProject() {
    if (!onCreateDeviceProject || submitting.current) return;
    submitting.current = true;
    setCreating(true);
    try {
      await onCreateDeviceProject();
    } finally {
      submitting.current = false;
      setCreating(false);
    }
  }

  return (
    <div className={styles.root} data-testid="project-workspace-recovery-tip">
      <RailAccountRecoveryTip />
      {onCreateDeviceProject ? (
        <button
          type="button"
          className={styles.action}
          disabled={creating}
          onClick={() => void createDeviceProject()}
        >
          {t('entry.createDeviceProject')}
        </button>
      ) : null}
    </div>
  );
}
