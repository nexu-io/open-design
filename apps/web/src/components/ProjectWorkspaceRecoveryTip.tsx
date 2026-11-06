import { RailAccountRecoveryTip } from './CloudSignInTip';
import styles from './ProjectWorkspaceRecoveryTip.module.css';

/**
 * Keep a transient Workspace authority outage visible without replacing the
 * healthy local project data plane. This deliberately reuses the rail's
 * existing recovery language and status semantics.
 */
export function ProjectWorkspaceRecoveryTip() {
  return (
    <div className={styles.root} data-testid="project-workspace-recovery-tip">
      <RailAccountRecoveryTip />
    </div>
  );
}
