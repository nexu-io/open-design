// Composer-footer Template picker — the "template entry point" next to the
// Design system picker. The trigger shows the currently-selected project-type
// template (default "None"); clicking it opens a list menu BELOW the trigger:
// compact icon + name rows (no descriptions, at most 12 kinds — per product),
// and the selected row carries a check. Selection is sticky until another row
// is chosen.
//
// Selection is the existing `activeChipId`: picking a row calls `onPick(chip)`
// (the same handler the rail uses). Clearing the selected type was removed.
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
  // stays reachable during a pending apply so the user can still switch.
  disabled?: boolean;
  // Disables picking a *new* template while an apply is in flight (mirrors the
  // rail's per-card guard); opening + close remain available.
  pickDisabled?: boolean;
  // Localized label for a chip id (reuses HomeHero's chip copy).
  labelFor: (chipId: string) => string;
  onPick: (chip: HomeHeroChip) => void;
}

// Rendered menu width (see .home-hero__template-list) — used to clamp the
// anchor so the whole panel stays inside the viewport.
const MENU_W = 340;
const MENU_MAX_H = 286;
const MENU_GAP = 8;
const VIEWPORT_MARGIN = 16;
// One 44px row plus the list's 6px top/bottom padding. When less than this is
// available below the trigger, prefer the roomier side above it.
const MENU_MIN_USABLE_H = 56;

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
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Viewport anchor captured once at open time, clamped so the whole panel
  // stays on screen. The menu is portaled to <body> and position:fixed at
  // these coords instead of tracking the trigger: the composer around the
  // trigger reflows asynchronously (template apply, placeholder animation) and
  // sits inside transformed ancestors that would both drift an anchored menu
  // mid-gesture and degrade fixed positioning. It normally opens downward,
  // but flips above when the lower viewport cannot fit one complete row.
  const [anchor, setAnchor] = useState<
    {
      left: number;
      edge: number;
      maxHeight: number;
      placement: 'above' | 'below';
    } | null
  >(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const toggleOpen = () => {
    setOpen((v) => {
      if (v) return false;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) {
        const availableBelow = Math.max(
          0,
          window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN,
        );
        const availableAbove = Math.max(
          0,
          rect.top - MENU_GAP - VIEWPORT_MARGIN,
        );
        const placement =
          availableBelow < MENU_MIN_USABLE_H && availableAbove > availableBelow
            ? 'above'
            : 'below';
        const available = placement === 'above' ? availableAbove : availableBelow;
        setAnchor({
          left: Math.min(Math.max(rect.x, 8), Math.max(8, window.innerWidth - MENU_W - 8)),
          edge:
            placement === 'above'
              ? window.innerHeight - rect.top + MENU_GAP
              : rect.bottom + MENU_GAP,
          maxHeight: Math.min(MENU_MAX_H, available),
          placement,
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
        {/* The chevron stays on the pill in every state — clearing the type
            was removed (per product), so there is no × to give way to. */}
        <Icon name="chevron-down" size={16} aria-hidden />
      </button>
      {open ? createPortal(
        <div
          ref={menuRef}
          className="home-hero__template-list"
          role="listbox"
          aria-label={t('homeHero.templatePicker.label')}
          data-testid="home-hero-template-menu"
          style={
            anchor
              ? {
                  left: anchor.left,
                  ...(anchor.placement === 'above'
                    ? { bottom: anchor.edge }
                    : { top: anchor.edge }),
                  maxHeight: anchor.maxHeight,
                  transformOrigin:
                    anchor.placement === 'above' ? 'bottom left' : 'top left',
                }
              : undefined
          }
        >
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
