/**
 * The shared frequency ruler.
 *
 * Frequencies mean nothing to somebody who has not been taught them, and the
 * rack speaks entirely in them. `BANDS` names the ranges in the words the same
 * person would use unprompted — rumble, weight, mud, middle, presence, edge,
 * air — and every spectral module shows where it acts on this one ruler, so
 * naming them once teaches them everywhere they appear.
 *
 * Two things at once, deliberately. The bar says where this module works
 * relative to everything else, which is the spatial fact; the caption under it
 * names the range and what lives there, which is the vocabulary. A bar alone
 * would be decoration and a caption alone would not teach the shape.
 *
 * Log-spaced, because hearing is: 20–200 Hz is as much of the range to an ear as
 * 2–20 kHz, and a linear ruler would crush six of the seven bands into a corner.
 */

import { audioBandAt, BANDS } from "@hyperframes/core/audio-fx-copy";

const LOW = BANDS[0]?.from ?? 20;
const HIGH = BANDS.at(-1)?.to ?? 20000;

/** Where a frequency sits across the ruler, 0..1. */
function positionOf(hz: number): number {
  const span = Math.log10(HIGH) - Math.log10(LOW);
  const at = (Math.log10(Math.min(HIGH, Math.max(LOW, hz))) - Math.log10(LOW)) / span;
  return Math.min(1, Math.max(0, at));
}

export interface FxBandRulerProps {
  /** The range this effect can act over, from its copy. */
  band: readonly [number, number];
  /** Where it is acting right now. */
  at: number;
}

export function FxBandRuler({ band, at }: FxBandRulerProps) {
  const here = audioBandAt(at);
  if (!here) return null;
  const [from, to] = band;
  return (
    <div className="hf-fx-ruler px-1.5 pb-1" data-band={here.name}>
      <div className="hf-fx-ruler-bar relative flex h-1 w-full overflow-hidden rounded-[1px]">
        {BANDS.map((range) => {
          // Reachable at all, and where it is now: a module that can only work in
          // the bottom three bands should not look like it could move anywhere.
          const reachable = range.to > from && range.from < to;
          return (
            <span
              key={range.name}
              title={`${range.name}: ${range.says}`}
              className={
                range.name === here.name
                  ? "hf-fx-ruler-band bg-panel-accent"
                  : reachable
                    ? "hf-fx-ruler-band bg-panel-text-4/50"
                    : "hf-fx-ruler-band bg-panel-text-4/15"
              }
              style={{
                width: `${(positionOf(range.to) - positionOf(range.from)) * 100}%`,
              }}
            />
          );
        })}
      </div>
      <p className="hf-fx-ruler-label truncate pt-0.5 text-[9px] text-panel-text-2">
        <span className="hf-fx-ruler-name text-panel-text-1">{here.name}</span>: {here.says}
      </p>
    </div>
  );
}
