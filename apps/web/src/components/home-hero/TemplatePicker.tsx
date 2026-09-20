// Selected creation type with category-switch controls.
import { useEffect, useId, useRef, useState } from 'react';
import type { HomeHeroChip } from './chips';
import { Icon } from '../Icon';
import { useT } from '../../i18n';
import styles from './TemplatePicker.module.css';

interface Props {
  // The create chips this pill can name (the apply-scenario ones).
  templates: HomeHeroChip[];
  activeChipId: string | null;
  onPick?: (chip: HomeHeroChip) => void;
  disabled?: boolean;
  // Localized label for a chip id (reuses HomeHero's chip copy).
  labelFor: (chipId: string) => string;
}

export function TemplatePicker({
  templates,
  activeChipId,
  onPick,
  disabled = false,
  labelFor,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  useEffect(() => { setOpen(false); }, [activeChipId, disabled]);
  const active = templates.find((chip) => chip.id === activeChipId) ?? null;

  const valueLabel = active ? labelFor(active.id) : t('homeHero.templatePicker.label');

  return (
    <div
      ref={rootRef}
      className={`home-hero__footer-option home-hero__footer-option--select home-hero__template-option${active ? ' has-selection' : ''} ${styles.picker}${open ? ' is-open' : ''}`}
      data-type={active?.id}
      data-field-name="template"
      data-testid="home-hero-template-picker"
    >
      <div
        className="home-hero__footer-select-trigger home-hero__template-trigger"
        data-testid="home-hero-template-trigger"
        title={t('homeHero.templatePicker.label')}
      >
        {active ? <span className="home-hero__footer-option-icon home-hero__footer-option-icon--compact" aria-hidden="true">
          <Icon name={active.icon} size={16} className="home-hero__template-icon-glyph" />
        </span> : null}
        <button type="button" ref={triggerRef} className={styles.switcher}
          aria-label={t('homeHero.templatePicker.label')} aria-haspopup="listbox"
          aria-expanded={open} aria-controls={open ? menuId : undefined} disabled={disabled}
          onClick={() => setOpen((value) => !value)}>
          <span className="home-hero__footer-select-label">{valueLabel}</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="6 6 12 12" fill="currentColor" aria-hidden="true"><path d="M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z" /></svg>
        </button>
      </div>
      {open ? <div id={menuId} role="listbox" aria-label={t('homeHero.templatePicker.label')}
        className="home-hero__footer-select-menu" data-testid="home-hero-template-menu">
        {templates.map((chip) => <button key={chip.id} type="button" role="option" data-chip={chip.id}
          aria-selected={chip.id === activeChipId}
          className={`home-hero__footer-select-item${chip.id === activeChipId ? ' is-selected' : ''}`}
          onClick={() => { setOpen(false); if (chip.id !== activeChipId) onPick?.(chip); triggerRef.current?.focus(); }}>
          <Icon name={chip.icon} size={16} />
          <span>{labelFor(chip.id)}</span>
          {chip.id === activeChipId ? <Icon name="check" size={14} /> : null}
        </button>)}
      </div> : null}
    </div>
  );
}
