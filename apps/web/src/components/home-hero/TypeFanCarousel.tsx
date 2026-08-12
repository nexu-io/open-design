// Fanned type carousel above the Home composer.
//
// The 12 create-scenario chips render as a hand-of-cards arc tucked behind the
// composer card's top edge (reference: fanned "Primary" cards mock). The card
// at the arc's apex is the SELECTED type; the ‹ › arrows move the selection to
// the neighbouring chip (wrapping), and clicking any visible card selects it
// directly. Selection goes through the same `onPick` used by the radial
// TemplatePicker, so plugin seeding / analytics behave identically.

import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '../Icon';
import type { HomeHeroChip } from './chips';

// Cards shown either side of the apex. ±3 keeps 7 cards on stage, matching
// the reference fan's density without pushing cards past the hero's edges.
const VISIBLE_SPAN = 2;
// Degrees between neighbouring cards. The rotation pivot sits far below the
// card (see CSS transform-origin), so a few degrees reads as a wide arc.
// 3.5° flattens the hand slightly (per product: 弧度再小一点).
const STEP_DEG = 2.5;
// Solid card backdrops — the product 卡片 palette. One per card by fan
// position (wrapping past 9) — stable across renders, so the colors never
// shuffle mid-session, while neighbouring cards read distinct.
const ART_COLORS = [
  '#5FE0AA',
  '#FFD6D6',
  '#FFDFCA',
  '#008CC2',
  '#8FA6FF',
  '#BCF2DA',
  '#DAE1FF',
  '#F5C156',
  '#FFDEFF',
] as const;
const artColor = (index: number) => ART_COLORS[index % ART_COLORS.length];

interface Props {
  chips: HomeHeroChip[];
  /** Currently selected chip id (null → nothing selected yet). */
  activeChipId: string | null;
  disabled?: boolean;
  labelFor: (chipId: string) => string;
  onPick: (chip: HomeHeroChip) => void;
  /** Content for the card's bottom-right recommendation panel — the first
   *  recommended example of the card's type (null → painting only). */
  presetPanel?: (chipId: string) => ReactNode;
}

export function TypeFanCarousel({ chips, activeChipId, disabled, labelFor, onPick, presetPanel }: Props) {
  const count = chips.length;
  const activeIndex = chips.findIndex((chip) => chip.id === activeChipId);
  // No selection yet → the fan still needs an apex to build the arc around;
  // the first chip takes the slot visually without being marked selected.
  const centerIndex = activeIndex >= 0 ? activeIndex : 0;
  // Apex of the PREVIOUS committed render, for wrap detection below. A ref
  // (not state) on purpose: reading it during render sees the old apex, and
  // the effect refreshes it after commit without an extra render.
  const prevCenterRef = useRef(centerIndex);
  useEffect(() => {
    prevCenterRef.current = centerIndex;
  });

  if (count === 0) return null;

  // Wrapping index access; count > 0 is guarded above, so the modulo result
  // always lands on a real chip.
  const chipAt = (index: number): HomeHeroChip =>
    chips[((index % count) + count) % count] as HomeHeroChip;

  const pick = (index: number) => {
    if (disabled) return;
    const chip = chipAt(index);
    if (chip.id !== activeChipId) onPick(chip);
  };

  return (
    <div className="home-hero__type-fan" data-testid="home-hero-type-fan">
      <button
        type="button"
        className="home-hero__type-fan-arrow home-hero__type-fan-arrow--prev"
        aria-label={labelFor(chipAt(centerIndex - 1).id)}
        disabled={disabled}
        onClick={() => pick(centerIndex - 1)}
        data-testid="home-hero-type-fan-prev"
      >
        <Icon name="chevron-left" size={18} />
      </button>
      <div className="home-hero__type-fan-stage" role="listbox" aria-label="type">
        {chips.map((chip, index) => {
          // Signed wrap-around distance from the apex: -count/2 .. +count/2.
          const deltaFrom = (center: number) => {
            let delta = index - center;
            if (delta > count / 2) delta -= count;
            if (delta < -count / 2) delta += count;
            return delta;
          };
          const d = deltaFrom(centerIndex);
          const hidden = Math.abs(d) > VISIBLE_SPAN;
          const isActive = chip.id === activeChipId;
          // The card at the ring's seam jumps from one hidden edge to the
          // other when the apex moves. Letting the transform TRANSITION that
          // jump sent it sweeping across the whole fan — invisible when fully
          // faded, but a visible streak whenever a rapid switch left it
          // mid-fade. Snap the seam card into place instead; it re-enters
          // through the normal edge fade on its next step.
          const wrapped = Math.abs(d - deltaFrom(prevCenterRef.current)) > count / 2;
          const panel = presetPanel?.(chip.id) ?? null;
          return (
            <button
              key={chip.id}
              type="button"
              role="option"
              aria-selected={isActive}
              aria-label={labelFor(chip.id)}
              className={`home-hero__type-fan-card${isActive ? ' is-active' : ''}${
                hidden ? ' is-hidden' : ''
              }`}
              style={{
                // Rotation only: scaling about the far-below pivot would drag
                // the outer cards a further ~70px down the arc. `--fan-lift`
                // is the hover pop (CSS owns it) — it must live INSIDE this
                // inline transform, which would otherwise override any
                // hover-rule transform outright.
                transform: `translateX(-50%) translateY(var(--fan-lift, 0px)) rotate(${d * STEP_DEG}deg)`,
                zIndex: 20 - Math.abs(d),
                ...(wrapped ? { transition: 'none' } : {}),
              }}
              tabIndex={hidden ? -1 : 0}
              disabled={disabled}
              onClick={() => pick(index)}
              data-testid={`home-hero-type-fan-card-${chip.id}`}
            >
              <span className="home-hero__type-fan-card-body">
              <span className="home-hero__type-fan-card-head">
                <Icon name={chip.icon} size={14} />
                <span className="home-hero__type-fan-card-label">{labelFor(chip.id)}</span>
              </span>
              <span
                className="home-hero__type-fan-card-art"
                style={{ background: artColor(index) }}
                aria-hidden
              >
                {panel != null ? (
                  <span className="home-hero__type-fan-card-art-panel">{panel}</span>
                ) : null}
              </span>
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="home-hero__type-fan-arrow home-hero__type-fan-arrow--next"
        aria-label={labelFor(chipAt(centerIndex + 1).id)}
        disabled={disabled}
        onClick={() => pick(centerIndex + 1)}
        data-testid="home-hero-type-fan-next"
      >
        <Icon name="chevron-right" size={18} />
      </button>
    </div>
  );
}
