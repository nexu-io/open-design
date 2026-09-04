// The composer pill that names the picked creation type.
//
// Display + clear only. Picking a type is the type row's job (`TypePillRow`,
// under the composer) — that row IS the empty state, and this pill is what the
// choice looks like once it is made. With nothing picked the pill does not
// render at all, so an untouched composer carries no type chrome.
//
// It used to open a dropdown of every kind. That went away (per product): with
// the full catalog one row below, a second copy behind a chevron was the same
// question asked twice. Swapping a type now means clearing back to the row.
//
// The pill names the TYPE and nothing else. It used to retitle itself to the
// picked sub-category, which made the composer's own row twitch — relabelling
// and resizing — every time the sub-type row below was browsed (per product:
// 切换二级目录时输入框的绿色按钮不要动). That row owns the sub-category now,
// including giving it up: clicking the lit pill toggles it back off.
//
// Clearing lives on the leading icon, which swaps to an × on hover, and gives
// up the template (the host drops the sub-category with it).
import type { HomeHeroChip } from './chips';
import { Icon } from '../Icon';
import { useT } from '../../i18n';

interface Props {
  // The create chips this pill can name (the apply-scenario ones).
  templates: HomeHeroChip[];
  activeChipId: string | null;
  /**
   * Clear the template (back to no type at all), which retires the pill and
   * brings the type row back. The host drops any picked sub-category with it.
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

  // Nothing picked → no pill. The type row under the composer owns the empty
  // state, so a composer nobody has touched carries no type chrome at all.
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
        <span
          className={
            'home-hero__footer-option-icon home-hero__footer-option-icon--compact' +
            (canClear ? ' home-hero__template-icon--clearable' : '')
          }
          aria-hidden={canClear ? undefined : true}
          role={canClear ? 'button' : undefined}
          tabIndex={canClear ? 0 : undefined}
          aria-label={canClear ? t('common.clear') : undefined}
          data-testid={canClear ? 'home-hero-template-clear' : undefined}
          onClick={canClear ? () => clear() : undefined}
          onKeyDown={
            canClear
              ? (event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  clear();
                }
              : undefined
          }
        >
          <Icon name={active.icon} size={16} className="home-hero__template-icon-glyph" />
          {canClear ? (
            /* 16 — the same box as the glyph it replaces on hover and as the
               design-system pill's clear beside it, so nothing in the row
               changes size when the pointer moves across it (per product:
               两个叉号和没有 hover 时的图标一样大). An earlier pass sized this
               22 to compensate for `close-line` inking only ~53% of its box
               against the ~83% the filled glyphs cover; product chose the
               matching box over the matching ink, so do not re-inflate it. */
            <Icon name="close" size={16} className="home-hero__template-icon-clear" />
          ) : null}
        </span>
        <span className="home-hero__footer-select-label">{valueLabel}</span>
      </div>
    </div>
  );
}
