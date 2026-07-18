// One-click AI optimization banner for programmatically-extracted brand
// projects. The default prompt + design-system skill bundle is attached by the
// caller so users do not have to choose extraction internals.

import { useI18n } from '../i18n';
import { Icon } from './Icon';
import styles from './BrandEnrichmentBanner.module.css';

interface Props {
  /** Run the enrichment turn with the default prompt and per-turn skill bundle. */
  onContinue: () => void;
  /** Locks the controls while the turn is being sent. */
  busy?: boolean;
}

export function BrandEnrichmentBanner({ onContinue, busy = false }: Props) {
  const { t } = useI18n();

  return (
    <div className={styles.banner} role="note" data-testid="brand-enrichment-banner">
      <div className={styles.head}>
        <span className={styles.icon} aria-hidden>
          <Icon name="sparkles" size={18} />
        </span>
        <span className={styles.copy}>
          <span className={styles.title}>{t('brandEnrichment.title')}</span>
          <span className={styles.text}>
            {t('brandEnrichment.body')}
          </span>
        </span>
      </div>

      <button
        type="button"
        className={styles.cta}
        disabled={busy}
        onClick={onContinue}
        data-testid="brand-enrichment-continue"
      >
        <Icon name="sparkles" size={13} />
        {busy ? t('brandEnrichment.busy') : t('brandEnrichment.cta')}
      </button>
    </div>
  );
}
