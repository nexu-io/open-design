import { useT } from '../../i18n';
import styles from './ArtifactSummaryNotice.module.css';

/** A delivered file remains useful even when its run supplied no prose. */
export function ArtifactSummaryNotice() {
  const t = useT();
  return (
    <p className={styles.notice} data-testid="chat-artifact-missing-summary">
      {t('chat.artifact.missingSummary')}
    </p>
  );
}
