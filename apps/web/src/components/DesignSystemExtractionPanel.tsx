import { useState } from 'react';
import { Icon, type IconName } from './Icon';
import type { Dict } from '../i18n/types';
import { DESIGN_SYSTEM_NEXT_STEP_ACTIONS } from './NextStepActions';
import styles from './DesignSystemExtractionPanel.module.css';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

// "More optimizations" list. The AI-refine action is intentionally excluded — it
// is the featured "AI Optimize" CTA above, so listing it again here would
// duplicate it. The remaining design-system optimizations seed the composer with
// their prompt (same pattern as the post-message NextStepActions card), keeping
// this panel unified with the existing next-step system.
const AUDIT_ACTION = DESIGN_SYSTEM_NEXT_STEP_ACTIONS.find(
  (action) => action.id === 'design-system-audit-kit',
);

const MORE_OPTIMIZATIONS: ReadonlyArray<{ icon: IconName; title: string; prompt: string }> = [
  ...(AUDIT_ACTION ? [{ icon: AUDIT_ACTION.icon, title: AUDIT_ACTION.title, prompt: AUDIT_ACTION.prompt }] : []),
  {
    icon: 'palette',
    title: 'Tune palette & contrast',
    prompt:
      "Review and refine this design system's color palette for contrast, hierarchy, and accessibility (target WCAG AA). Update the token roles and DESIGN.md, keep the same design system id, and regenerate the kit previews. Summarize what changed.",
  },
  {
    icon: 'layout',
    title: 'Expand the component kit',
    prompt:
      "Expand this design system's component kit with on-brand buttons, inputs, cards, and navigation in both light and dark, document the usage rules in DESIGN.md, and keep the same design system id. Summarize what was added.",
  },
];

export interface DesignSystemExtractionPanelProps {
  // Human-readable source the system was extracted from (a hostname, file, or a
  // generic fallback when the source is unknown).
  sourceLabel: string;
  // The backing design system's title, shown in the agent's completion line.
  systemTitle: string;
  // True while the programmatic extraction is still running — renders the agent
  // turn in a loading state and hides the next steps until it settles.
  extracting: boolean;
  // Featured CTA: run the deeper AI extraction/optimization pass. Omitted when
  // the action is unavailable (e.g. already running enrichment).
  onAiOptimize?: () => void;
  aiOptimizeBusy?: boolean;
  // Featured CTA: spin up a new design that inherits this system.
  onCreateDesign?: () => void;
  // Seed the composer with a "more optimizations" prompt (does not auto-send).
  onPromptAction?: (prompt: string) => void;
  t: TranslateFn;
}

export function DesignSystemExtractionPanel({
  sourceLabel,
  systemTitle,
  extracting,
  onAiOptimize,
  aiOptimizeBusy = false,
  onCreateDesign,
  onPromptAction,
  t,
}: DesignSystemExtractionPanelProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className={styles.panel} data-testid="ds-extraction-panel">
      {/* Synthesized extraction turn — reads like a real conversation. */}
      <div className={styles.thread}>
        <div className={styles.userRow}>
          <p className={styles.userBubble}>
            {t('chat.dsExtractUser', { source: sourceLabel })}
          </p>
        </div>
        <div className={styles.agentRow}>
          <span
            className={`${styles.agentAvatar} ${extracting ? styles.agentAvatarBusy : ''}`}
            aria-hidden
          >
            <Icon name={extracting ? 'sparkles' : 'check'} size={14} />
          </span>
          <p className={styles.agentText}>
            {extracting ? (
              <>
                {t('chat.dsExtractRunning')}
                <span className={styles.dots} aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
              </>
            ) : (
              t('chat.dsExtractDone', { name: systemTitle })
            )}
          </p>
        </div>
      </div>

      {/* Next steps — the two former cards demoted to featured CTAs, plus a
          disclosure for further design-system optimizations. */}
      {!extracting ? (
        <div className={styles.nextSteps}>
          <span className={styles.nextStepsTitle}>{t('chat.dsNextStepsTitle')}</span>
          <div className={styles.featuredRow}>
            {onAiOptimize ? (
              <button
                type="button"
                className={`${styles.cta} ${styles.ctaPrimary}`}
                onClick={onAiOptimize}
                disabled={aiOptimizeBusy}
                data-testid="ds-next-step-ai-optimize"
              >
                <Icon name="sparkles" size={14} />
                {aiOptimizeBusy ? t('brandEnrichment.busy') : t('brandEnrichment.cta')}
              </button>
            ) : null}
            {onCreateDesign ? (
              <button
                type="button"
                className={`${styles.cta} ${styles.ctaSecondary}`}
                onClick={onCreateDesign}
                data-testid="ds-next-step-create-design"
              >
                <Icon name="plus" size={14} />
                {t('chat.createDesignFromSystemCta')}
              </button>
            ) : null}
          </div>

          {onPromptAction && MORE_OPTIMIZATIONS.length > 0 ? (
            <div className={styles.more}>
              <button
                type="button"
                className={styles.moreToggle}
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((open) => !open)}
              >
                <Icon name="sliders" size={13} />
                {t('chat.dsMoreToggle')}
                <Icon
                  name="chevron-down"
                  size={13}
                  className={`${styles.moreChevron} ${moreOpen ? styles.moreChevronOpen : ''}`}
                />
              </button>
              <div className={`accordion-collapsible ${moreOpen ? 'open' : ''}`}>
                <div className="accordion-collapsible-inner">
                  <ul className={styles.moreList}>
                    {MORE_OPTIMIZATIONS.map((action) => (
                      <li key={action.title}>
                        <button
                          type="button"
                          className={styles.moreItem}
                          onClick={() => onPromptAction(action.prompt)}
                        >
                          <span className={styles.moreItemIcon} aria-hidden>
                            <Icon name={action.icon} size={14} />
                          </span>
                          <span className={styles.moreItemTitle}>{action.title}</span>
                          <span className={styles.moreItemCta} aria-hidden>
                            ↵
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
