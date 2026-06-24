// Shown in a brand-extraction project once the extraction finalizes: a gentle,
// dismissible nudge that the design system is ready to preview in the Design
// systems tab. It never auto-dismisses — extraction runs for minutes, so a
// confirmation that vanishes on a timer would be missed exactly when the user
// looks back. Clicking the CTA opens the Design systems tab (with the new system
// preselected, wired by the caller); the × dismisses without navigating.
import { motion } from 'motion/react';

import { Icon } from './Icon';
import { useT } from '../i18n';
import { toastSlideUp } from '../motion';
import styles from './BrandReadyPrompt.module.css';

export interface BrandReadyPromptProps {
  /** Brand display name; null falls back to a generic title. */
  brandName: string | null;
  /** Focus the in-project brand-kit (design system) tab. */
  onPreview: () => void;
  /** Dismiss without navigating. */
  onDismiss: () => void;
  /** Show the "automatic extraction may miss details" refinement nudge. */
  showRefinement?: boolean;
  /** Run the deeper AI Optimize enrichment pass on the extracted system. */
  onAiOptimize?: () => void;
  /** Open the brand kit to refine it by hand. */
  onEditManually?: () => void;
}

export function BrandReadyPrompt({
  brandName,
  onPreview,
  onDismiss,
  showRefinement = false,
  onAiOptimize,
  onEditManually,
}: BrandReadyPromptProps) {
  const t = useT();
  const title = brandName
    ? t('project.brandReadyTitle', { name: brandName })
    : t('project.brandReadyTitleGeneric');
  const refine = showRefinement && (onAiOptimize || onEditManually);

  return (
    <motion.div
      className={styles.prompt}
      role="status"
      aria-live="polite"
      variants={toastSlideUp}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <span className={styles.icon} aria-hidden>
        <Icon name="check" size={16} />
      </span>
      <div className={styles.text}>
        <div className={styles.title}>{title}</div>
        <button type="button" className={styles.cta} onClick={onPreview}>
          {t('project.brandReadyCta')}
          <Icon name="chevron-right" size={14} />
        </button>
        {refine ? (
          <div className={styles.refine}>
            <span className={styles.refineHint}>{t('project.brandReadyRefineHint')}</span>
            <div className={styles.refineActions}>
              {onAiOptimize ? (
                <button type="button" className={styles.refineAction} onClick={onAiOptimize}>
                  <Icon name="sparkles" size={13} />
                  {t('project.brandReadyAiOptimize')}
                </button>
              ) : null}
              {onEditManually ? (
                <button type="button" className={styles.refineAction} onClick={onEditManually}>
                  <Icon name="edit" size={13} />
                  {t('project.brandReadyEditManually')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className={styles.dismiss}
        onClick={onDismiss}
        aria-label={t('project.brandReadyDismiss')}
      >
        <Icon name="close" size={14} />
      </button>
    </motion.div>
  );
}
