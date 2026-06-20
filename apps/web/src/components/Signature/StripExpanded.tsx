import { useState } from 'react';
import { useI18n } from '../../i18n';
import styles from './DesignSignatureStrip.module.css';
import type {
  ChangeDirection,
  DesignSignature,
  DesignSignatureDiff,
} from '@open-design/contracts/design-signature';

function glyph(d: ChangeDirection): string {
  return d === 'increased' ? '↑' : d === 'decreased' ? '↓' : '•';
}

function bar(score: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(score / 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

export function StripExpanded({
  signature,
  diff,
}: {
  signature: DesignSignature;
  diff: DesignSignatureDiff | null;
}) {
  const { t } = useI18n();
  const [whyOpen, setWhyOpen] = useState(false);
  const hasChanges = Boolean(diff && !diff.unchanged && diff.changes.length > 0);
  return (
    <div>
      {hasChanges ? (
        <>
          <strong>{t('designSignature.changesSince')}</strong>
          <ul className={styles.changeList}>
            {diff!.changes.map((c, i) => (
              <li key={i} className={styles.changeItem}>
                <span className={styles.dir} aria-hidden>{glyph(c.direction)}</span>
                <span>{c.summary}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <span>{t('designSignature.noPrevious')}</span>
      )}

      <button
        type="button"
        className={styles.collapsedRow}
        aria-expanded={whyOpen}
        onClick={() => setWhyOpen((v) => !v)}
        style={{ marginTop: 6 }}
      >
        ▸ {t('designSignature.whyDetail')}
      </button>
      {whyOpen ? (
        <div className={styles.whyGrid}>
          {signature.strands.map((s) => (
            <span key={s.key}>
              {s.label} <span className={styles.bar}>{bar(s.score)}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
