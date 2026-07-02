import { useI18n } from '../../i18n';
import styles from './DesignSignatureStrip.module.css';
import type { DesignSignatureDiff } from '@open-design/contracts/design-signature';

export function StripCollapsed({
  fingerprint,
  diff,
  expanded,
  onToggle,
}: {
  fingerprint: string;
  diff: DesignSignatureDiff | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const count = diff && !diff.unchanged ? diff.changes.length : 0;
  return (
    <button
      type="button"
      className={styles.collapsedRow}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span>◦ {t('designSignature.collapsedLabel')}</span>
      <span className={styles.fingerprint}>{fingerprint}</span>
      {count > 0 ? <span>· {t('designSignature.changeCount', { n: count })}</span> : null}
      <span aria-hidden style={{ marginLeft: 'auto' }}>{expanded ? '⌃' : '⌄'}</span>
    </button>
  );
}
