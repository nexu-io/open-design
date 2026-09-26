// Selected creation type with category-switch controls.
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
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
  const [requestedChipId, setRequestedChipId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusOptionRequestedRef = useRef(false);
  const lastFocusedOptionIdRef = useRef<string | null>(null);
  const menuId = useId();
  const active = templates.find((chip) => chip.id === activeChipId) ?? null;
  const rovingChipId = templates.some((chip) => chip.id === requestedChipId)
    ? requestedChipId
    : active?.id ?? templates[0]?.id ?? null;

  const close = (restoreTriggerFocus: boolean) => {
    focusOptionRequestedRef.current = false;
    lastFocusedOptionIdRef.current = null;
    setOpen(false);
    if (restoreTriggerFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        focusOptionRequestedRef.current = false;
        lastFocusedOptionIdRef.current = null;
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        focusOptionRequestedRef.current = false;
        lastFocusedOptionIdRef.current = null;
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  // A type change or a disable closes the menu in the render that shows it, not
  // in a later effect: passive effects can run after the user has already
  // clicked the updated trigger, and would then close the menu that click just
  // opened.
  const [shownFor, setShownFor] = useState({ activeChipId, disabled });
  if (shownFor.activeChipId !== activeChipId || shownFor.disabled !== disabled) {
    setShownFor({ activeChipId, disabled });
    focusOptionRequestedRef.current = false;
    lastFocusedOptionIdRef.current = null;
    setOpen(false);
  }
  useEffect(() => {
    if (requestedChipId !== rovingChipId) setRequestedChipId(rovingChipId);
  }, [requestedChipId, rovingChipId]);
  useEffect(() => {
    const focusedOptionWasRemoved = lastFocusedOptionIdRef.current !== null
      && !templates.some((chip) => chip.id === lastFocusedOptionIdRef.current);
    if (!open || rovingChipId === null || (!focusOptionRequestedRef.current && !focusedOptionWasRemoved)) {
      return;
    }
    const timeout = window.setTimeout(() => {
      focusOptionRequestedRef.current = false;
      optionRefs.current.get(rovingChipId)?.focus();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [open, rovingChipId, templates]);

  const openFromKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (disabled) return;
    const initialChipId = active?.id
      ?? (event.key === 'ArrowDown' ? templates[0]?.id : templates[templates.length - 1]?.id)
      ?? null;
    if (open && initialChipId !== null) {
      setRequestedChipId(initialChipId);
      optionRefs.current.get(initialChipId)?.focus();
      return;
    }
    focusOptionRequestedRef.current = true;
    setRequestedChipId(initialChipId);
    setOpen(true);
  };

  const moveOptionFocus = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    chipId: string,
  ) => {
    const currentIndex = templates.findIndex((chip) => chip.id === chipId);
    if (currentIndex < 0) return;
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowDown':
        nextIndex = Math.min(currentIndex + 1, templates.length - 1);
        break;
      case 'ArrowUp':
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = templates.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextChip = templates[nextIndex];
    if (!nextChip || nextChip.id === chipId) return;
    focusOptionRequestedRef.current = true;
    setRequestedChipId(nextChip.id);
  };

  const valueLabel = active ? labelFor(active.id) : t('homeHero.templatePicker.label');

  return (
    <div
      ref={rootRef}
      className={`home-hero__footer-option home-hero__footer-option--select home-hero__template-option${active ? ' has-selection' : ''} ${styles.picker}${open ? ' is-open' : ''}`}
      data-type={active?.id}
      data-field-name="template"
      data-testid="home-hero-template-picker"
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        lastFocusedOptionIdRef.current = null;
        close(false);
      }}
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
          onKeyDown={openFromKeyboard}
          onClick={() => {
            if (open) {
              close(false);
              return;
            }
            focusOptionRequestedRef.current = false;
            setRequestedChipId(active?.id ?? templates[0]?.id ?? null);
            setOpen(true);
          }}>
          <span className="home-hero__footer-select-label">{valueLabel}</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="6 6 12 12" fill="currentColor" aria-hidden="true"><path d="M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z" /></svg>
        </button>
      </div>
      {open ? <div id={menuId} role="listbox" aria-label={t('homeHero.templatePicker.label')}
        className="home-hero__footer-select-menu" data-testid="home-hero-template-menu">
        {templates.map((chip) => <button key={chip.id} type="button" role="option" data-chip={chip.id}
          ref={(node) => {
            if (node) optionRefs.current.set(chip.id, node);
            else optionRefs.current.delete(chip.id);
          }}
          aria-selected={chip.id === activeChipId}
          tabIndex={chip.id === rovingChipId ? 0 : -1}
          className={`home-hero__footer-select-item${chip.id === activeChipId ? ' is-selected' : ''}`}
          onFocus={() => {
            lastFocusedOptionIdRef.current = chip.id;
            setRequestedChipId(chip.id);
          }}
          onKeyDown={(event) => moveOptionFocus(event, chip.id)}
          onClick={() => {
            close(true);
            if (chip.id !== activeChipId) onPick?.(chip);
          }}>
          <Icon name={chip.icon} size={16} />
          <span>{labelFor(chip.id)}</span>
          {chip.id === activeChipId ? <Icon name="check" size={14} /> : null}
        </button>)}
      </div> : null}
    </div>
  );
}
