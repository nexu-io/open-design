// The selected creation type, with a persistent trailing clear button.
// Clearing returns to the home entry cards without changing the input.
import type { HomeHeroChip } from './chips';
import { Icon } from '../Icon';
import { useT } from '../../i18n';

interface Props {
  // The create chips this pill can name (the apply-scenario ones).
  templates: HomeHeroChip[];
  activeChipId: string | null;
  /**
   * Clear the template (back to no type at all), which retires the pill and
   * brings the entry cards back. The host drops any picked sub-category with it.
   */
  onClearTemplate?: () => void;
  // Localized label for a chip id (reuses HomeHero's chip copy).
  labelFor: (chipId: string) => string;
}

export function TemplatePicker({
  templates,
  activeChipId,
  onClearTemplate,
  labelFor,
}: Props) {
  const t = useT();
  const active = templates.find((chip) => chip.id === activeChipId) ?? null;

  // Nothing picked → no pill; the home entry cards own the empty state.
  if (!active) return null;

  const canClear = Boolean(onClearTemplate);
  const clear = () => onClearTemplate?.();
  const valueLabel = labelFor(active.id);

  return (
    <div
      className="home-hero__footer-option home-hero__footer-option--select home-hero__template-option has-selection"
      data-field-name="template"
      data-testid="home-hero-template-picker"
    >
      {/* Not a button any more — there is nothing to open; the clear inside it
          is the only interactive part. A `div`, NOT a `span`: every footer
          option hides its sr-only field label with `.home-hero__footer-option >
          span`, which would clip this whole row to 1×1. */}
      <div
        className="home-hero__footer-select-trigger home-hero__template-trigger"
        data-testid="home-hero-template-trigger"
        title={t('homeHero.templatePicker.label')}
      >
        <span className="home-hero__footer-option-icon home-hero__footer-option-icon--compact" aria-hidden>
          <Icon name={active.icon} size={16} />
        </span>
        <span className="home-hero__footer-select-label">{valueLabel}</span>
        {canClear ? (
          <button
            type="button"
            className="home-hero__template-clear"
            aria-label={t('common.clear')}
            data-testid="home-hero-template-clear"
            onClick={clear}
          >
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
