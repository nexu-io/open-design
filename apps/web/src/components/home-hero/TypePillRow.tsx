// Capsule type row — the pill replacement for the fanned type carousel
// (per product: all 10 top-level creation types use capsules). ONE line exactly as wide as the
// composer card below it, EVERY gap identical (8px): the pills that fit
// render inline, then the All button, and the remaining ordered suffix folds
// into the 全部 popover. Fit is computed against an invisible
// probe row that always lays out the full set at natural size, so showing /
// hiding pills can never feed back into its own measurement. Selection
// state stays with the caller via `onPick`.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HomeHeroChip } from './chips';
import { Icon } from '../Icon';
import { useT } from '../../i18n';

// Hard cap matching the fixed Home information architecture.
const MAX_PILLS = 10;

// Must match .home-hero__type-pills-wrap's CSS gap.
const PILL_GAP = 8;

interface Props {
  chips: HomeHeroChip[];
  /** Currently selected chip id (null → nothing selected yet). */
  activeChipId: string | null;
  disabled?: boolean;
  labelFor: (chipId: string) => string;
  onPick: (chip: HomeHeroChip) => void;
}

export function TypePillRow({ chips, activeChipId, disabled, labelFor, onPick }: Props) {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const probeRef = useRef<HTMLDivElement | null>(null);
  const tailRef = useRef<HTMLDivElement | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const flowing = chips.slice(0, MAX_PILLS);
  const measurementSignature = [
    ...flowing.map((chip) => `${chip.id}:${labelFor(chip.id)}`),
    `more:${t('common.all')}`,
  ].join('\0');
  // How many flowing pills render inline; the rest go to the 全部 popover.
  const [fitCount, setFitCount] = useState(flowing.length);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const probe = probeRef.current;
    const tail = tailRef.current;
    if (!wrap || !probe || !tail) return undefined;
    const measure = () => {
      // jsdom (unit tests) lays out nothing — keep every pill "fitting"
      // there rather than collapsing the row to zero.
      if (wrap.clientWidth === 0) {
        setFitCount(flowing.length);
        return;
      }
      // The tail (pinned pills + 全部 trigger) is part of the visible row, so
      // its width — including its own leading gap — is reserved up front.
      const available = wrap.clientWidth - tail.offsetWidth - PILL_GAP;
      let used = 0;
      let count = 0;
      for (const el of probe.children) {
        const width = (el as HTMLElement).offsetWidth;
        const next = used + (count > 0 ? PILL_GAP : 0) + width;
        if (next > available) break;
        used = next;
        count += 1;
      }
      setFitCount((prev) => (prev === count ? prev : count));
    };
    measure();
    // jsdom has no ResizeObserver; the initial measure above still ran.
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    observer.observe(tail);
    for (const child of probe.children) observer.observe(child);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowing.length, measurementSignature]);

  // Dismiss the popover on outside press / Escape.
  useEffect(() => {
    if (!moreOpen) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setMoreOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  if (flowing.length === 0) return null;

  const inlineChips = flowing.slice(0, fitCount);
  const hiddenChips = flowing.slice(fitCount);

  const pillButton = (chip: HomeHeroChip, inPopover: boolean) => {
    const isActive = chip.id === activeChipId;
    return (
      <button
        key={chip.id}
        type="button"
        role="option"
        aria-selected={isActive}
        className={`home-hero__type-pill${isActive ? ' is-active' : ''}`}
        disabled={disabled}
        data-testid={`home-hero-type-pill-${chip.id}${inPopover ? '-more' : ''}`}
        onClick={() => {
          setMoreOpen(false);
          if (chip.id !== activeChipId) onPick(chip);
        }}
      >
        <Icon name={chip.icon} size={14} />
        <span>{labelFor(chip.id)}</span>
      </button>
    );
  };

  return (
    <div
      className="home-hero__type-pills-wrap"
      ref={wrapRef}
      role="listbox"
      aria-label="type"
      data-testid="home-hero-type-pills"
    >
      {inlineChips.map((chip) => pillButton(chip, false))}
      {/* Tail: the 全部 trigger is one measured unit so the fit computation
          reserves its width. The trigger is ALWAYS mounted —
          geometry that came and went with the overflow set would oscillate
          the measurement at boundary widths. */}
      <div className="home-hero__type-pills-tail" ref={tailRef}>
        <div className="home-hero__type-pills-more">
          <button
            type="button"
            className={`home-hero__type-pill home-hero__type-pills-more-btn${moreOpen ? ' is-open' : ''}`}
            aria-haspopup="true"
            aria-expanded={moreOpen}
            disabled={disabled}
            data-testid="home-hero-type-pills-more"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <span>{t('common.all')}</span>
            <Icon name="chevron-down" size={14} />
          </button>
          {moreOpen ? (
            <div
              className="home-hero__type-pills-popover"
              role="listbox"
              aria-label={t('common.all')}
              data-testid="home-hero-type-pills-popover"
            >
              {(hiddenChips.length > 0 ? hiddenChips : flowing).map((chip) =>
                pillButton(chip, true),
              )}
            </div>
          ) : null}
        </div>
      </div>
      {/* Invisible probe: the FULL flowing set at natural size, used only to
          measure pill widths — never interactive, never painted. */}
      <div className="home-hero__type-pills-probe" ref={probeRef} aria-hidden>
        {flowing.map((chip) => (
          <span key={chip.id} className="home-hero__type-pill">
            <Icon name={chip.icon} size={14} />
            <span>{labelFor(chip.id)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
