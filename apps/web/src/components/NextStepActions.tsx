import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { useAnalytics } from '../analytics/provider';
import { trackNextStepActionClick } from '../analytics/events';
import { Icon } from './Icon';
import styles from './NextStepActions.module.css';

// Recommended-direction catalogue. `id` is the stable analytics identity;
// `labelKey` resolves to both the chip label AND the text seeded into the
// composer (chips prefill rather than auto-send, so the user can edit before
// sending). These are all "keep iterating" directions — the only non-iteration
// next step (Share) lives alongside them but is rendered as its own action.
const CHIPS: { id: string; labelKey: Parameters<ReturnType<typeof useT>>[0] }[] = [
  { id: 'polish_visual', labelKey: 'nextStep.chipPolishVisual' },
  { id: 'brand', labelKey: 'nextStep.chipBrand' },
  { id: 'concise', labelKey: 'nextStep.chipConcise' },
  { id: 'second_version', labelKey: 'nextStep.chipSecondVersion' },
];

interface Props {
  // The previewable artifact this affordance is anchored to. Passed back to
  // every handler so the parent can seed the composer / open the right file.
  fileName: string;
  // Open the file's existing Share/Export menu in the preview workspace.
  onShare: (fileName: string) => void;
  // Prefill the composer with the combined recommended-chip prompt (does not
  // auto-send). Chips are multi-select: every toggle rebuilds the whole prompt
  // from the current selection, so the composer always mirrors the chosen chips.
  onChip: (fileName: string, prompt: string) => void;
}

export function NextStepActions({ fileName, onShare, onChip }: Props) {
  const t = useT();
  const analytics = useAnalytics();
  // Fire the exposure event once per mount so the acceptance funnel can divide
  // share/chip clicks by how often the affordance was actually seen.
  const exposedRef = useRef(false);
  useEffect(() => {
    if (exposedRef.current) return;
    exposedRef.current = true;
    trackNextStepActionClick(analytics.track, {
      page_name: 'chat_panel',
      area: 'next_step',
      element: 'next_step_exposed',
    });
  }, [analytics.track]);

  // Chips are a lightweight multi-select that *owns* the composer draft while in
  // use: each toggle recomputes the prompt from the full selection (kept in CHIPS
  // order, not click order) so the text stays stable and predictable.
  const [selected, setSelected] = useState<readonly string[]>([]);

  const composePrompt = useCallback(
    (ids: readonly string[]) =>
      CHIPS.filter((chip) => ids.includes(chip.id))
        .map((chip) => t(chip.labelKey))
        .join(t('nextStep.chipJoiner')),
    [t],
  );

  const toggleChip = useCallback(
    (chip: (typeof CHIPS)[number]) => {
      const next = selected.includes(chip.id)
        ? selected.filter((id) => id !== chip.id)
        : [...selected, chip.id];
      setSelected(next);
      trackNextStepActionClick(analytics.track, {
        page_name: 'chat_panel',
        area: 'next_step',
        element: 'chip',
        chip_id: chip.id,
      });
      onChip(fileName, composePrompt(next));
    },
    [analytics.track, composePrompt, fileName, onChip, selected],
  );

  const handleShare = useCallback(() => {
    trackNextStepActionClick(analytics.track, {
      page_name: 'chat_panel',
      area: 'next_step',
      element: 'share',
    });
    onShare(fileName);
  }, [analytics.track, fileName, onShare]);

  return (
    <div className={styles.root} data-testid="next-step-actions">
      <div className={styles.label}>{t('nextStep.title')}</div>
      {/* Share (a terminal "done" action) sits at the same level as the
          iteration directions; it's the only item that fires immediately
          instead of toggling into the composer, so it carries an icon + accent
          to read as an action rather than a selectable direction. */}
      <div className={styles.row}>
        <button type="button" className={styles.share} onClick={handleShare}>
          <Icon name="share" size={14} />
          <span>{t('nextStep.share')}</span>
        </button>
        {CHIPS.map((chip) => {
          const label = t(chip.labelKey);
          const isSelected = selected.includes(chip.id);
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={isSelected}
              className={isSelected ? `${styles.chip} ${styles.chipSelected}` : styles.chip}
              onClick={() => toggleChip(chip)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
