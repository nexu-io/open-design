// Composer-footer Template picker — the "template entry point" next to the
// Design system picker. The trigger shows the currently-selected project-type
// template (default "None"); clicking it opens a list menu BELOW the trigger:
// compact icon + name rows (no descriptions, at most 12 kinds — per product),
// the selected row carries a check, and a leading Clear row resets the
// selection (back to None).
//
// Selection is the existing `activeChipId`: picking a row calls `onPick(chip)`
// (the same handler the rail uses) and the trigger's reset calls `onClear()`.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HomeHeroChip } from './chips';
import { Icon } from '../Icon';
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
  // rail's per-card guard); opening + close remain available.
  pickDisabled?: boolean;
  // Localized label for a chip id (reuses HomeHero's chip copy).
  labelFor: (chipId: string) => string;
  onPick: (chip: HomeHeroChip) => void;
  onClear: () => void;
}

// Rendered menu width (see .home-hero__template-list) — used to clamp the
// anchor so the whole panel stays inside the viewport.
const MENU_W = 340;

// Per product: the menu lists at most this many kinds (rows beyond it are
// simply not shown — the catalog stays whole for the rail/carousel).
const MAX_MENU_KINDS = 12;

export function TemplatePicker({
  templates,
  activeChipId,
  previewChipId = null,
  disabled = false,
  pickDisabled = false,
  labelFor,
  onPick,
  onClear,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Viewport anchor captured once at open time, clamped so the whole panel
  // stays on screen. The menu is portaled to <body> and position:fixed at
  // these coords instead of tracking the trigger: the composer around the
  // trigger reflows asynchronously (template apply, placeholder animation) and
  // sits inside transformed ancestors that would both drift an anchored menu
  // mid-gesture and degrade fixed positioning. It opens DOWNWARD from the
  // trigger (per product), so the anchor is a left/top pair.
  const [anchor, setAnchor] = useState<
    { left: number; top: number; maxHeight: number } | null
  >(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const toggleOpen = () => {
    setOpen((v) => {
      if (v) return false;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) {
        setAnchor({
          left: Math.min(Math.max(rect.x, 8), Math.max(8, window.innerWidth - MENU_W - 8)),
          top: rect.bottom + 8,
          // Opening downward: the panel may use at most the space between the
          // trigger and the viewport bottom.
          maxHeight: Math.max(200, window.innerHeight - rect.bottom - 24),
        });
      } else {
        setAnchor(null);
      }
      return true;
    });
  };

  const active = useMemo(
    () => templates.find((chip) => chip.id === activeChipId) ?? null,
    [templates, activeChipId],
  );

  // At most MAX_MENU_KINDS rows. A committed selection must stay visible (its
  // check is the menu's state readout), so an active chip beyond the cap takes
  // the last slot instead of silently vanishing.
  const visibleTemplates = useMemo(() => {
    const visible = templates.slice(0, MAX_MENU_KINDS);
    if (active && !visible.some((chip) => chip.id === active.id)) {
      visible[visible.length - 1] = active;
    }
    return visible;
  }, [templates, active]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(event: MouseEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
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

  // Invariant: `anchor` is a one-shot VIEWPORT point captured from the trigger
  // at open time, so the open menu is only meaningful while that point still
  // describes where the trigger is. Anything that moves the trigger under a
  // fixed-position panel — scrolling any ancestor, resizing the window —
  // invalidates it, and the panel would otherwise hang in mid-air detached
  // from its own trigger. Dismiss instead of re-anchoring: chasing the trigger
  // is exactly what the capture-once design avoids, because the composer
  // around it reflows asynchronously and lives inside transformed ancestors.
  useEffect(() => {
    if (!open) return undefined;
    const dismiss = () => setOpen(false);
    // Scroll does not bubble, so listen directly to the trigger's ancestors
    // instead of capturing every scroll through window. The portaled menu is
    // intentionally outside this chain: scrolling its own long list must not
    // dismiss it because that does not move the trigger or invalidate anchor.
    const scrollTargets: EventTarget[] = [window];
    let ancestor = wrapRef.current?.parentElement ?? null;
    while (ancestor) {
      scrollTargets.push(ancestor);
      ancestor = ancestor.parentElement;
    }
    for (const target of scrollTargets) {
      target.addEventListener('scroll', dismiss, { passive: true });
    }
    window.addEventListener('resize', dismiss);
    return () => {
      for (const target of scrollTargets) {
        target.removeEventListener('scroll', dismiss);
      }
      window.removeEventListener('resize', dismiss);
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
        onClick={toggleOpen}
      >
        {/* With a selection the pill reads as `[template icon] Wireframe`:
            the leading icon IS the selected template's own icon and the gray
            creation-type kicker drops away. */}
        <span
          className="home-hero__footer-option-icon home-hero__footer-option-icon--compact"
          aria-hidden
        >
          <Icon name={shown ? shown.icon : 'grid'} size={16} />
        </span>
        {shown ? null : (
          <span className="home-hero__template-kicker">{t('homeHero.templatePicker.label')}</span>
        )}
        {/* No "None" placeholder at rest — the gray kicker alone reads as the
            empty state; the label slot only appears once a template is set. */}
        {shown ? (
          <span
            className={`home-hero__footer-select-label${isPreviewing ? ' is-preview' : ''}`}
          >
            {valueLabel}
          </span>
        ) : null}
        {/* Once a template is chosen the dropdown chevron gives way to a
            hairline divider before the clear (×) control. */}
        {hasSelection ? null : <Icon name="chevron-down" size={16} aria-hidden />}
      </button>
      {hasSelection ? <span className="home-hero__template-divider" aria-hidden /> : null}
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
            onClear();
          }}
        >
          <Icon name="close" size={16} strokeWidth={2.2} />
        </button>
      ) : null}
      {open ? createPortal(
        <div
          ref={menuRef}
          className="home-hero__template-list"
          role="listbox"
          aria-label={t('homeHero.templatePicker.label')}
          data-testid="home-hero-template-menu"
          style={
            anchor
              ? { left: anchor.left, top: anchor.top, maxHeight: anchor.maxHeight }
              : undefined
          }
        >
          {/* Clear row first — the list counterpart of the old radial's
              center disc; checked while nothing is selected. Its testid keeps
              the historical "radial-clear" name so the existing unit/e2e
              coverage keeps driving it unchanged. */}
          <button
            type="button"
            className={`home-hero__template-list-item home-hero__template-list-item--clear${hasSelection ? '' : ' is-active'}`}
            role="option"
            aria-selected={!hasSelection}
            data-testid="home-hero-template-radial-clear"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          >
            <span className="home-hero__template-list-head">
              <span className="home-hero__template-list-icon" aria-hidden>
                <Icon name="close" size={16} />
              </span>
              <span className="home-hero__template-list-title">{t('common.clear')}</span>
              {hasSelection ? null : (
                <span className="home-hero__template-list-check" aria-hidden>
                  <Icon name="check" size={14} />
                </span>
              )}
            </span>
          </button>
          {visibleTemplates.map((chip) => {
            const isActive = chip.id === activeChipId;
            return (
              <button
                key={chip.id}
                type="button"
                className={`home-hero__template-list-item${isActive ? ' is-active' : ''}`}
                role="option"
                aria-selected={isActive}
                aria-disabled={pickDisabled || undefined}
                aria-label={labelFor(chip.id)}
                data-chip-id={chip.id}
                // Historical testid (the menu used to be a radial of wedges);
                // kept verbatim so unit/e2e template flows stay untouched.
                data-testid={`home-hero-template-wedge-${chip.id}`}
                onClick={() => {
                  if (pickDisabled) return;
                  onPick(chip);
                  setOpen(false);
                }}
              >
                <span className="home-hero__template-list-head">
                  <span className="home-hero__template-list-icon" aria-hidden>
                    <Icon name={chip.icon} size={16} />
                  </span>
                  <span className="home-hero__template-list-title">{labelFor(chip.id)}</span>
                  {isActive ? (
                    <span className="home-hero__template-list-check" aria-hidden>
                      <Icon name="check" size={14} />
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
