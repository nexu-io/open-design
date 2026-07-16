// Composer-footer Template picker — the "template entry point" next to the
// Design system picker. It mirrors the create-scenario rail below the composer:
// the trigger shows the currently-selected project-type template (default
// "None"), and the dropdown offers a searchable grid of the same templates so
// users understand the row below the composer *is* the template set.
//
// Selection is the existing `activeChipId`: picking a card calls `onPick(chip)`
// (the same handler the rail uses) and Clear calls `onClear()` (back to None).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { HomeHeroChip } from './chips';
import { Icon } from '../Icon';
import { ScenarioArt } from './ScenarioArt';
import { useT } from '../../i18n';

interface Props {
  // Selectable templates, already ordered (the apply-scenario create chips).
  templates: HomeHeroChip[];
  activeChipId: string | null;
  // Hover-preview from the rail below: when set (and a known template), the
  // trigger previews that template instead of the committed value, so hovering
  // a rail card updates the pill. Cleared on rail-leave → reverts to None.
  previewChipId?: string | null;
  // Disables opening the dropdown (initial plugin load only). The dropdown
  // stays reachable during a pending apply so the user can still clear/switch.
  disabled?: boolean;
  // Disables picking a *new* template while an apply is in flight (mirrors the
  // rail's per-card guard); opening + Clear remain available.
  pickDisabled?: boolean;
  // Localized label / description for a chip id (reuses HomeHero's chip copy).
  labelFor: (chipId: string) => string;
  descriptionFor: (chipId: string) => string;
  onPick: (chip: HomeHeroChip) => void;
  onClear: () => void;
}

export function TemplatePicker({
  templates,
  activeChipId,
  previewChipId = null,
  disabled = false,
  pickDisabled = false,
  labelFor,
  descriptionFor,
  onPick,
  onClear,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const active = useMemo(
    () => templates.find((chip) => chip.id === activeChipId) ?? null,
    [templates, activeChipId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return templates;
    return templates.filter((chip) =>
      `${labelFor(chip.id)} ${descriptionFor(chip.id)}`.toLowerCase().includes(q),
    );
  }, [query, templates, labelFor, descriptionFor]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(event: MouseEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Hover-preview wins over the committed value so pointing at a rail card
  // updates the pill; falls back to the committed template, then "None".
  const previewChip = previewChipId
    ? templates.find((chip) => chip.id === previewChipId) ?? null
    : null;
  const shown = previewChip ?? active;
  const isPreviewing = Boolean(previewChip) && previewChip !== active;
  const hasSelection = Boolean(active);
  const valueLabel = shown ? labelFor(shown.id) : t('common.none');

  return (
    <div
      ref={wrapRef}
      className={`home-hero__footer-option home-hero__footer-option--select home-hero__template-option${open ? ' is-open' : ''}${hasSelection ? ' has-selection' : ''}`}
      data-field-name="template"
      data-testid="home-hero-template-picker"
    >
      <button
        type="button"
        className="home-hero__footer-select-trigger home-hero__template-trigger"
        data-testid="home-hero-template-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        title={t('homeHero.templatePicker.label')}
        onClick={() => setOpen((v) => !v)}
      >
        {shown ? (
          <span className="home-hero__template-trigger-thumb" aria-hidden>
            <ScenarioArt chipId={shown.id} fallbackIcon={shown.icon} />
          </span>
        ) : (
          <span
            className="home-hero__footer-option-icon home-hero__footer-option-icon--compact"
            aria-hidden
          >
            <Icon name="grid" size={13} />
          </span>
        )}
        <span className="home-hero__template-kicker">{t('homeHero.templatePicker.label')}</span>
        <span
          className={`home-hero__footer-select-label${isPreviewing ? ' is-preview' : ''}`}
        >
          {valueLabel}
        </span>
        <Icon name="chevron-down" size={12} aria-hidden />
      </button>
      {hasSelection ? (
        <button
          type="button"
          className="home-hero__template-reset od-tooltip"
          data-testid="home-hero-template-reset"
          aria-label={t('common.clear')}
          title={t('common.clear')}
          data-tooltip={t('common.clear')}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(false);
            setQuery('');
            onClear();
          }}
        >
          <Icon name="close" size={11} strokeWidth={2.2} />
        </button>
      ) : null}
      {open ? (
        <div
          className="home-hero__template-menu"
          role="listbox"
          aria-label={t('homeHero.templatePicker.label')}
          data-testid="home-hero-template-menu"
        >
          <div className="home-hero__template-menu-head">
            <div className="home-hero__template-search">
              <Icon name="search" size={12} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('homeHero.templatePicker.searchPlaceholder')}
                data-testid="home-hero-template-search"
              />
            </div>
            <button
              type="button"
              className="home-hero__template-clear"
              data-testid="home-hero-template-clear"
              onClick={() => {
                onClear();
                setQuery('');
                inputRef.current?.focus();
              }}
            >
              {t('common.clear')}
            </button>
          </div>
          <div className="home-hero__template-group-label">
            {t('homeHero.templatePicker.projectTypes')}
          </div>
          {filtered.length === 0 ? (
            <div className="home-hero__template-empty">{t('homeHero.footer.noMatches')}</div>
          ) : (
            <div className="home-hero__template-grid">
              {filtered.map((chip) => {
                const isActive = chip.id === activeChipId;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    className={`home-hero__template-card${isActive ? ' is-active' : ''}`}
                    role="option"
                    aria-selected={isActive}
                    disabled={pickDisabled}
                    data-chip-id={chip.id}
                    data-testid={`home-hero-template-card-${chip.id}`}
                    title={descriptionFor(chip.id) || labelFor(chip.id)}
                    onClick={() => {
                      onPick(chip);
                      setOpen(false);
                    }}
                  >
                    <span className="home-hero__template-card-art" aria-hidden>
                      <ScenarioArt chipId={chip.id} fallbackIcon={chip.icon} />
                    </span>
                    <span className="home-hero__template-card-copy">
                      <span className="home-hero__template-card-label">{labelFor(chip.id)}</span>
                      {descriptionFor(chip.id) ? (
                        <span className="home-hero__template-card-desc">
                          {descriptionFor(chip.id)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
