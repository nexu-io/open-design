import { useI18n } from "../../i18n/I18n";
/**
 * The Tone module: a multi-band EQ as one control surface over several nodes.
 *
 * Faders rather than the rack's usual horizontal sliders, because a row of them
 * around a centre detent is what an equaliser looks like to everybody who has
 * met one. Recognising the control is most of the value — an author who has
 * never opened a mixer has still used bass, middle and treble.
 */

import { useCallback, useEffect, useState } from "react";
import {
  audioEqSummary,
  HF_AUDIO_EQ_RANGE_DB,
  type HfAudioEqBand,
} from "@hyperframes/core/audio-fx-eq";
import { FX_FAMILY_TYPE, fxFamilyTint } from "./propertyPanelFxFamily.js";

export interface FxEqModuleProps {
  eqId: string;
  bands: HfAudioEqBand[];
  open: boolean;
  disabled?: boolean;
  onToggleOpen(): void;
  /** Dragging: heard immediately, not persisted. */
  onPreview(bandName: string, gain: number): void;
  /** Release: the write that persists. */
  onCommit(bandName: string, gain: number): void;
  onRemove(): void;
}

/** Fader travel as a percentage from the top, with 0 dB at the centre. */
function offsetFor(gain: number): number {
  const clamped = Math.max(-HF_AUDIO_EQ_RANGE_DB, Math.min(HF_AUDIO_EQ_RANGE_DB, gain));
  return 50 - (clamped / (HF_AUDIO_EQ_RANGE_DB * 2)) * 100;
}

const shown = (gain: number): string => {
  const v = Number(gain.toFixed(1));
  return v > 0 ? `+${v}` : String(v);
};

function Fader({
  band,
  disabled,
  onPreview,
  onCommit,
}: {
  band: HfAudioEqBand;
  disabled?: boolean;
  onPreview(gain: number): void;
  onCommit(gain: number): void;
}) {
  /**
   * Held locally for the length of the gesture.
   *
   * The module is driven by the chain, and dragging only PREVIEWS — it does
   * not write — so a purely controlled input re-renders back to the old value
   * on the first move and the fader snaps out from under the pointer. Same
   * split the rack's other controls already make.
   */
  const [local, setLocal] = useState(band.gain);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) setLocal(band.gain);
  }, [band.gain, dragging]);

  const value = dragging ? local : band.gain;
  const pct = offsetFor(value);
  const moved = Math.abs(value) >= 0.05;

  const move = (next: number) => {
    setDragging(true);
    setLocal(next);
    onPreview(next);
  };
  const settle = () => {
    if (!dragging) return;
    setDragging(false);
    onCommit(local);
  };

  // A range input rotated into a fader: it keeps keyboard control, focus and
  // the platform's own pointer handling, which a div with pointer events would
  // all have to reimplement badly.
  return (
    <div className="hf-fx-eq-band flex min-w-0 flex-1 flex-col items-center gap-1">
      <div className="relative h-[74px] w-full">
        <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-panel-border-input" />
        <span
          className="pointer-events-none absolute left-1/2 w-[3px] -translate-x-1/2 rounded-xs bg-panel-accent"
          style={
            // `value`, not `band.gain`: mid-drag across zero the fill would
            // otherwise keep pointing the way it started.
            value >= 0 ? { top: `${pct}%`, bottom: "50%" } : { top: "50%", bottom: `${100 - pct}%` }
          }
        />
        <input
          className="hf-fx-eq-fader absolute left-1/2 h-[19px] w-[74px] -translate-x-1/2 -translate-y-1/2 -rotate-90 cursor-ns-resize appearance-none bg-transparent"
          style={{ top: "50%" }}
          type="range"
          min={-HF_AUDIO_EQ_RANGE_DB}
          max={HF_AUDIO_EQ_RANGE_DB}
          step={0.5}
          value={value}
          disabled={disabled}
          aria-label={`${band.name} ${shown(value)} dB`}
          onChange={(e) => move(Number(e.target.value))}
          onPointerUp={settle}
          onKeyUp={settle}
          onBlur={settle}
        />
      </div>
      <span className="hf-fx-eq-name w-full truncate text-center font-mono text-[9px] uppercase tracking-wide text-panel-text-2">
        {band.name}
      </span>
      <span
        className={`hf-fx-eq-value font-mono text-[9px] tabular-nums ${
          moved ? "text-accent-ink" : "text-panel-text-2"
        }`}
      >
        {moved ? shown(value) : "0"}
      </span>
    </div>
  );
}

export function FxEqModule({
  eqId,
  bands,
  open,
  disabled,
  onToggleOpen,
  onPreview,
  onCommit,
  onRemove,
}: FxEqModuleProps) {
  const { t } = useI18n();
  const preview = useCallback((name: string, gain: number) => onPreview(name, gain), [onPreview]);
  const commit = useCallback((name: string, gain: number) => onCommit(name, gain), [onCommit]);

  return (
    <div
      className="hf-fx-node hf-fx-eq-module rounded-[4px] border border-l-2 border-panel-border-input"
      data-fx-node="eq"
      data-fx-family="smart"
      // Scroll anchor for a revealed EQ-band automation lane.
      data-fx-eq={eqId}
      // Smart, with the carve and the leveller: three bands the author sets by
      // ear on a control surface, not three filters they configured.
      style={{ borderLeftColor: fxFamilyTint({ type: "eq", fromEq: "eq" }) }}
    >
      <div className="hf-fx-node-head flex items-center gap-1.5 px-1.5 py-1">
        <button
          type="button"
          className={`hf-fx-node-name flex-1 text-left text-[11px] text-panel-text-0 ${FX_FAMILY_TYPE.smart}`}
          aria-expanded={open}
          onClick={onToggleOpen}
        >
          {t("Tone")}</button>
        <span className="font-mono text-[9px] text-panel-text-2">{bands.length}-band</span>
        <button
          type="button"
          className="hf-fx-remove px-1 text-[11px] text-panel-text-2 hover:text-danger-ink"
          aria-label={t("Remove Tone")}
          disabled={disabled}
          onClick={onRemove}
        >
          ×
        </button>
      </div>

      {open ? (
        <div className="hf-fx-eq-body px-2 pb-2">
          <div className="flex gap-1.5">
            {bands.map((band) => (
              <Fader
                key={band.name}
                band={band}
                disabled={disabled}
                onPreview={(g) => preview(band.name, g)}
                onCommit={(g) => commit(band.name, g)}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[8px] tracking-wide text-panel-text-2">
            <span>{t("CUT")}</span>
            <span>{t("BOOST")}</span>
          </div>
        </div>
      ) : (
        // Closed, it reads like every other module: a sentence about the sound
        // rather than a list of values.
        <p className="hf-fx-eq-summary px-2 pb-1.5 text-[11px] text-panel-text-2">
          {audioEqSummary(bands)}
        </p>
      )}
    </div>
  );
}
