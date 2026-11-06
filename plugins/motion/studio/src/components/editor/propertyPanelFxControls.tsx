import { useI18n } from "../../i18n/I18n";
/**
 * Controls for one effect, generated from its registry entry.
 *
 * Nothing here knows what a compressor is. The registry declares each
 * parameter's range, step, unit and scale, and this renders whatever it finds —
 * so adding an effect or a knob upstream needs no change in the panel, and the
 * panel cannot offer a value the renderer would reject.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Tooltip } from "../ui/Tooltip";
import type {
  HfAudioFxDef,
  HfAudioFxNumberParam,
  HfAudioFxParam,
  HfAudioFxParamValues,
} from "@hyperframes/core/audio-fx";

/**
 * Frequency and time controls span three or four decades, so a linear slider
 * spends most of its travel somewhere useless. Those declare `scale: "log"` and
 * the slider position maps exponentially instead.
 */
function toSlider(p: HfAudioFxNumberParam, value: number): number {
  if (p.scale !== "log" || p.min <= 0) return value;
  const t = (Math.log(value) - Math.log(p.min)) / (Math.log(p.max) - Math.log(p.min));
  return p.min + t * (p.max - p.min);
}

function fromSlider(p: HfAudioFxNumberParam, position: number): number {
  if (p.scale !== "log" || p.min <= 0) return position;
  const t = (position - p.min) / (p.max - p.min);
  return Math.exp(Math.log(p.min) + t * (Math.log(p.max) - Math.log(p.min)));
}

/** Enough precision to be honest without showing float noise. */
function display(p: HfAudioFxNumberParam, value: number): string {
  const decimals = p.step >= 1 ? 0 : p.step >= 0.1 ? 1 : 2;
  return value.toFixed(decimals);
}

interface ParamRowProps {
  param: HfAudioFxParam;
  value: number | string;
  /**
   * The envelope's value at the playhead, when a lane drives this parameter and
   * the playhead is over the clip. Shown in place of `value`, which by then is
   * only the seed the lane replaced.
   */
  liveValue?: number;
  /** Fires continuously while dragging — cheap, not persisted. */
  onChange(key: string, value: number | string): void;
  /** Fires once when the gesture ends — this is the write that persists. */
  onCommit?(key: string, value: number | string): void;
  disabled?: boolean;
  /**
   * A lane in the timeline drives this parameter. The control is disabled
   * because a value typed here would be overwritten by the envelope on the next
   * tick — the lane is the value now.
   */
  automated?: boolean;
  /** Add a lane for this parameter, seeded at its current value. */
  onAutomate?(key: string): void;
  /** Delete this parameter's lane, handing the value back to the control. */
  onRemoveAutomation?(key: string): void;
}

/**
 * The automation toggle for one parameter: adds a lane, or deletes the one that
 * already owns the value. Absent for parameters no envelope can drive — a
 * WaveShaper curve, a convolution impulse, or a worklet's options.
 */
export function AutomationToggle({
  paramKey,
  label,
  automated,
  onAutomate,
  onRemoveAutomation,
}: {
  paramKey: string;
  label: string;
  automated: boolean;
  onAutomate?(key: string): void;
  onRemoveAutomation?(key: string): void;
}) {
  const { t } = useI18n();
  if (!onAutomate && !onRemoveAutomation) return null;
  return (
    <Tooltip label={automated ? t("Automated") : t("Automate")}>
      <button
        type="button"
        className={`hf-fx-automate w-[16px] shrink-0 rounded-[3px] border font-mono text-[9px] leading-none ${
          automated
            ? "border-panel-accent text-accent-ink"
            : "border-panel-border-input text-panel-text-2 hover:text-panel-text-0"
        }`}
        aria-pressed={automated}
        aria-label={automated ? t("Remove {label} automation", { label: label }) : t("Automate {label}", { label: label })}
        onClick={() => (automated ? onRemoveAutomation?.(paramKey) : onAutomate?.(paramKey))}
      >
        A
      </button>
    </Tooltip>
  );
}

export function FxParamRow({
  param,
  value,
  liveValue,
  onChange,
  onCommit,
  disabled,
  automated,
  onAutomate,
  onRemoveAutomation,
}: ParamRowProps) {
  // While dragging, the slider is driven locally. Waiting for the value to come
  // back through the element attribute makes the control feel laggy and fights
  // the pointer.
  const [dragging, setDragging] = useState(false);
  const [local, setLocal] = useState(value);
  const latest = useRef(value);
  /**
   * What the gesture last asked for, held until the world agrees.
   *
   * Releasing ends the drag, but the value only comes back after the attribute is
   * written and the selection resynced — and for a carve, after the analysis it
   * kicks off. In that gap the prop still holds the pre-drag number, so dropping
   * straight back to it made the control snap to where it started and then jump to
   * where it was dropped. Keeping the gesture's own number until a NEW one arrives
   * is honest either way: it is what the audio is already doing, since the live
   * write applied on the way down.
   */
  const [pending, setPending] = useState<number | null>(null);
  /**
   * What the number field is showing while it has focus.
   *
   * The field cannot be bound to the committed value: every keystroke is
   * clamped into range and written live, and the live write does not refresh
   * the prop — so React put the old number straight back and typing `5000` into
   * a 20..20000 knob wrote 20 on the first keystroke and never got further. Held
   * as TEXT, so a half-typed "-" or "" is a state the field can be in rather
   * than a number to clamp and persist.
   */
  const [typing, setTyping] = useState<string | null>(null);
  /**
   * Did this gesture actually change anything?
   *
   * `commit()` hangs off pointerup, keyup and blur, all of which fire without
   * an edit — clicking a slider thumb without moving it, or tabbing through the
   * field. Committing then re-persisted whatever `latest` happened to hold and
   * silently reverted any change that had arrived meanwhile.
   */
  const edited = useRef(false);
  useEffect(() => {
    if (!dragging) setLocal(value);
  }, [value, dragging]);
  // Any inbound value is newer information than the gesture's guess — including a
  // value that came back different from what was asked for, or an undo.
  useEffect(() => {
    setPending(null);
  }, [value]);

  const handleNumber = useCallback(
    (raw: number) => {
      const p = param as HfAudioFxNumberParam;
      const next = Math.min(p.max, Math.max(p.min, raw));
      latest.current = next;
      edited.current = true;
      setLocal(next);
      onChange(param.key, next);
    },
    [param, onChange],
  );

  const commit = useCallback(() => {
    setDragging(false);
    // Nothing was edited, so there is nothing to persist. Without this a bare
    // focus/blur — or a click on the slider thumb that never moved — fired a
    // full persisting write: source patch, selection resync, preview reload and
    // an audio restart, for a gesture that changed no value.
    if (!edited.current) return;
    edited.current = false;
    if (typeof latest.current === "number") setPending(latest.current);
    onCommit?.(param.key, latest.current);
  }, [onCommit, param.key]);

  if (param.kind === "enum") {
    return (
      <label className="hf-fx-row flex min-h-6 items-center gap-2" title={param.hint}>
        {/* Wraps rather than truncating. These names are whole questions — "How
            big the space is" — so 86px of truncation left "How big the sp…", and
            three rows of that read as the same word four times. A title only
            answers it on hover, one row at a time; wrapping answers it for the
            whole column at rest. `wrap-break-word` so a long single token breaks
            instead of widening the column. The row keeps `title={param.hint}`:
            the name and the explanation are different questions. */}
        <span className="hf-fx-label w-[86px] shrink-0 wrap-break-word text-[10px] leading-tight text-panel-text-2">
          {param.label}
        </span>
        <select
          className="hf-fx-select min-w-0 flex-1 rounded-[3px] bg-panel-surface px-1 py-0.5 font-mono text-[10px] text-panel-text-0"
          value={String(value)}
          disabled={disabled}
          onChange={(e) => {
            // A select has no drag; the change is already the commit.
            onChange(param.key, e.target.value);
            onCommit?.(param.key, e.target.value);
          }}
        >
          {param.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  // An envelope's value at the playhead outranks the one stored in the chain,
  // because it is the one the audio is using — the stored number is only the seed
  // the lane replaced. Safe against the pointer: an automated control is locked
  // (see `locked` below), so there is no drag for this to fight.
  const shown = dragging ? local : (liveValue ?? pending ?? value);
  const numeric = typeof shown === "number" ? shown : Number(shown);
  const current = Number.isFinite(numeric) ? numeric : param.default;

  const locked = Boolean(disabled) || Boolean(automated);

  return (
    <label
      className={`hf-fx-row flex min-h-6 items-center gap-2${automated ? " hf-fx-row-automated" : ""}`}
      title={param.hint}
      data-automated={automated ? "" : undefined}
    >
      {/* See the enum row above for why the name wraps instead of truncating. */}
      <span
        className={`hf-fx-label w-[86px] shrink-0 wrap-break-word text-[10px] leading-tight ${
          automated ? "text-accent-ink" : "text-panel-text-2"
        }`}
      >
        {param.label}
      </span>
      <input
        className="hf-fx-slider h-1 min-w-0 flex-1 accent-panel-accent"
        type="range"
        min={param.min}
        max={param.max}
        step={(param.max - param.min) / 1000}
        value={toSlider(param, current)}
        disabled={locked}
        aria-label={param.label}
        onPointerDown={() => setDragging(true)}
        onChange={(e) => handleNumber(fromSlider(param, Number(e.target.value)))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <input
        className="hf-fx-number w-[54px] shrink-0 rounded-[3px] bg-panel-surface px-1 py-0.5 text-right font-mono text-[10px] text-panel-text-0"
        type="number"
        min={param.min}
        max={param.max}
        step={param.step}
        value={typing ?? display(param, current)}
        disabled={locked}
        onFocus={() => setTyping(display(param, current))}
        onChange={(e) => {
          const text = e.target.value;
          setTyping(text);
          // An empty field, a lone "-", or a trailing "." are all states on the
          // way to a number, not numbers. `Number("")` is 0, which passes
          // Number.isFinite — so clearing the field to retype used to clamp to
          // the parameter MINIMUM and write it live: 20 Hz on a cutoff, -40 dB
          // on a gain.
          if (text.trim() === "") return;
          const next = Number(text);
          if (Number.isFinite(next)) handleNumber(next);
        }}
        onBlur={() => {
          commit();
          setTyping(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
      {param.unit ? (
        <span className="hf-fx-unit w-[22px] shrink-0 font-mono text-[9px] text-panel-text-2">
          {param.unit}
        </span>
      ) : null}
      <AutomationToggle
        paramKey={param.key}
        label={param.label}
        automated={Boolean(automated)}
        onAutomate={onAutomate}
        onRemoveAutomation={onRemoveAutomation}
      />
    </label>
  );
}

interface FxParamsProps {
  def: HfAudioFxDef;
  params: HfAudioFxParamValues;
  /** What automated knobs are worth at the playhead, by parameter key. */
  liveValues?: ReadonlyMap<string, number>;
  onChange(params: HfAudioFxParamValues): void;
  onCommit?(params: HfAudioFxParamValues): void;
  disabled?: boolean;
  /** Parameter keys this effect currently has a lane for. */
  automatedKeys?: ReadonlySet<string>;
  /** Absent when the effect cannot be automated at all, or nothing can write. */
  onAutomate?(key: string): void;
  onRemoveAutomation?(key: string): void;
}

/** Every knob the effect declares, in registry order. */
export function FxParams({
  def,
  params,
  liveValues,
  onChange,
  onCommit,
  disabled,
  automatedKeys,
  onAutomate,
  onRemoveAutomation,
}: FxParamsProps) {
  const set = useCallback(
    (key: string, value: number | string) => onChange({ ...params, [key]: value }),
    [params, onChange],
  );
  const commit = useCallback(
    (key: string, value: number | string) => onCommit?.({ ...params, [key]: value }),
    [params, onCommit],
  );
  return (
    <div className="hf-fx-params space-y-0.5 border-t border-panel-border-input px-1.5 py-1.5">
      {def.params.map((p) => {
        // Only a parameter the registry marks automatable has an AudioParam
        // behind it for an envelope to write to.
        const canAutomate = p.kind === "number" && p.automatable === true;
        const automated = automatedKeys?.has(p.key) ?? false;
        return (
          <FxParamRow
            key={p.key}
            param={p}
            value={params[p.key] ?? p.default}
            liveValue={liveValues?.get(p.key)}
            onChange={set}
            onCommit={commit}
            disabled={disabled}
            automated={automated}
            onAutomate={canAutomate && !automated ? onAutomate : undefined}
            onRemoveAutomation={canAutomate && automated ? onRemoveAutomation : undefined}
          />
        );
      })}
    </div>
  );
}
