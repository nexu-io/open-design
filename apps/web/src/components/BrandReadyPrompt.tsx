// Shown in a brand-extraction project once the extraction finalizes: a gentle,
// dismissible nudge that the design system is ready to preview in the Design
// systems tab. Clicking the CTA opens the Design systems tab (with the new
// system preselected, wired by the caller); the x dismisses without navigating.
import { useEffect, type CSSProperties } from 'react';
import { motion } from 'motion/react';

import { Icon } from './Icon';
import { useT } from '../i18n';
import { toastSlideUp } from '../motion';
import styles from './BrandReadyPrompt.module.css';

export interface BrandReadyPromptProps {
  /** Brand display name; null falls back to a generic title. */
  brandName: string | null;
  /** Left offset for the workspace panel; keeps the prompt away from composer. */
  workspaceOffsetPx?: number;
  /** Optional auto-dismiss window. Omitted by default so the prompt stays until user action. */
  ttlMs?: number;
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
  workspaceOffsetPx = 0,
  ttlMs,
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
  const dismissLabel = t('project.brandReadyDismiss');
  const refine = showRefinement && (onAiOptimize || onEditManually);
  const style = {
    '--brand-ready-left-offset': `${Math.max(0, workspaceOffsetPx)}px`,
  } as CSSProperties;

  useEffect(() => {
    if (typeof ttlMs !== 'number' || !Number.isFinite(ttlMs) || ttlMs <= 0) return undefined;
    const timer = window.setTimeout(onDismiss, ttlMs);
    return () => window.clearTimeout(timer);
  }, [onDismiss, ttlMs]);

  return (
    <motion.div
      className={styles.prompt}
      style={style}
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
        aria-label={dismissLabel}
        title={dismissLabel}
      >
        <Icon name="close" size={18} strokeWidth={2.6} />
      </button>
    </motion.div>
  );
}
