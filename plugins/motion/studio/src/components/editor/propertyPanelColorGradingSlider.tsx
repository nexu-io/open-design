import { useI18n } from "../../i18n/I18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, Settings } from "../../icons/SystemIcons";
import { LABEL } from "./propertyPanelHelpers";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";

const SLIDER_THUMB_SIZE = 10;
const SLIDER_THUMB_RADIUS = SLIDER_THUMB_SIZE / 2;

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function formatNumericInput(value: number, scale: number): string {
  const scaled = value / scale;
  return scale === 100 ? scaled.toFixed(2) : String(Math.round(scaled));
}

function parseNumericInput(value: string, scale: number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed * scale;
}

function tickPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return ((value - min) / (max - min)) * 100;
}

export function ColorGradingSliderControl({
  label,
  value,
  min,
  max,
  step,
  neutral = min,
  scale = 1,
  suffix = "",
  displayValue,
  disabled,
  onCommit,
  onReset,
  settings,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  neutral?: number;
  scale?: number;
  suffix?: string;
  displayValue: string;
  disabled?: boolean;
  onCommit: (nextValue: number) => void;
  onReset?: () => void;
  settings?: {
    active?: boolean;
    label: string;
    onClick: () => void;
  };
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const [draftState, setDraftState] = useState<{ value: number; source: number } | null>(null);
  const [inputDraft, setInputDraft] = useState<{ value: string; source: number } | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionChangedRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(
    () => () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    [],
  );

  const clampDraft = useCallback(
    (nextValue: number) => clampNumber(nextValue, min, max),
    [max, min],
  );

  const setLocalDraft = useCallback(
    (nextValue: number) => {
      const clamped = clampDraft(nextValue);
      const source = valueRef.current;
      setDraftState({ value: clamped, source });
      setInputDraft({ value: formatNumericInput(clamped, scale), source });
      return clamped;
    },
    [clampDraft, scale],
  );

  const commitDraft = useCallback(
    (nextValue: number) => {
      const clamped = setLocalDraft(nextValue);
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      if (interactionChangedRef.current) {
        interactionChangedRef.current = false;
        track("slider", label);
      }
      if (clamped !== valueRef.current) onCommit(clamped);
    },
    [label, onCommit, setLocalDraft, track],
  );

  const scheduleCommit = useCallback(
    (nextValue: number) => {
      const clamped = setLocalDraft(nextValue);
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(() => {
        if (clamped !== valueRef.current) onCommit(clamped);
      }, 40);
    },
    [onCommit, setLocalDraft],
  );

  const draft = draftState?.source === value ? draftState.value : value;
  const inputValue =
    inputDraft?.source === value ? inputDraft.value : formatNumericInput(draft, scale);

  const commitInputDraft = useCallback(() => {
    const parsed = parseNumericInput(inputValue, scale);
    if (parsed === null) {
      interactionChangedRef.current = false;
      setInputDraft(null);
      return;
    }
    commitDraft(parsed);
  }, [commitDraft, inputValue, scale]);

  const nudge = useCallback(
    (direction: -1 | 1) => {
      interactionChangedRef.current = true;
      commitDraft(draft + step * direction);
    },
    [commitDraft, draft, step],
  );

  const range = max - min;
  const valuePercent = range === 0 ? 0 : ((draft - min) / range) * 100;
  const neutralPercent = range === 0 ? 0 : ((neutral - min) / range) * 100;
  const fillLeft = Math.min(valuePercent, neutralPercent);
  const fillWidth = Math.abs(valuePercent - neutralPercent);
  const ticks = Array.from(new Set([min, neutral, max])).sort((a, b) => a - b);

  return (
    <div className="grid min-w-0 gap-0.5 rounded-md bg-panel-input/30 px-1.5 py-1">
      <div className="flex min-w-0 items-center gap-1">
        <span className={`${LABEL} min-w-0 flex-1 truncate`}>{t(label)}</span>
        {settings && (
          <button
            type="button"
            disabled={disabled}
            aria-label={settings.label}
            onClick={(event) => {
              event.stopPropagation();
              settings.onClick();
            }}
            className={`relative flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-panel-hover hover:text-panel-text-1 disabled:cursor-not-allowed disabled:opacity-40 ${
              settings.active ? "text-accent-ink" : "text-panel-text-5"
            }`}
            title={settings.label}
          >
            <Settings size={11} />
            {settings.active && (
              <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-studio-accent" />
            )}
          </button>
        )}
        {onReset && (
          <button
            type="button"
            disabled={disabled}
            aria-label={t("Reset {label}", { label: t(label) })}
            onClick={(event) => {
              event.stopPropagation();
              track("button", `Reset ${label}`);
              onReset();
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-panel-text-5 transition-colors hover:bg-panel-hover hover:text-panel-text-1 disabled:cursor-not-allowed disabled:opacity-40"
            title={t("Reset {label}", { label: t(label) })}
          >
            <RotateCcw size={11} />
          </button>
        )}
      </div>

      <div className="relative h-5 min-w-0">
        <div
          data-color-grading-slider-track="true"
          className="pointer-events-none absolute inset-y-0 z-0"
          style={{ left: SLIDER_THUMB_RADIUS, right: SLIDER_THUMB_RADIUS }}
        >
          {ticks.map((tick) => (
            <div
              key={tick}
              data-color-grading-slider-tick="true"
              className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-panel-text-3"
              style={{ left: `${tickPercent(tick, min, max)}%` }}
              title={String(tick / scale)}
            />
          ))}
          <div className="absolute left-0 right-0 top-1/2 z-10 h-0.5 -translate-y-1/2 rounded-full bg-panel-border" />
          <div
            className="absolute top-1/2 z-20 h-0.5 -translate-y-1/2 rounded-full bg-studio-accent"
            style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={draft}
          disabled={disabled}
          aria-label={t(label)}
          onChange={(event) => {
            interactionChangedRef.current = true;
            scheduleCommit(Number(event.currentTarget.value));
          }}
          onMouseUp={() => commitDraft(draft)}
          onTouchEnd={() => commitDraft(draft)}
          onBlur={() => commitDraft(draft)}
          className="hf-color-grading-range absolute left-0 right-0 top-1/2 z-30 min-w-0 w-full -translate-y-1/2"
          title={displayValue}
        />
      </div>

      <div className="flex min-w-0 items-center justify-end gap-1">
        <div className="flex shrink-0 items-center rounded-md bg-panel-input px-1.5 py-px">
          <input
            type="number"
            value={inputValue}
            min={min / scale}
            max={max / scale}
            step={step / scale}
            disabled={disabled}
            onChange={(event) => {
              interactionChangedRef.current = true;
              setInputDraft({ value: event.currentTarget.value, source: valueRef.current });
            }}
            onBlur={commitInputDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                nudge(1);
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                nudge(-1);
              }
            }}
            className="hf-color-grading-number h-4 w-[36px] bg-transparent text-right text-[10px] font-medium tabular-nums text-panel-text-1 outline-hidden disabled:cursor-not-allowed"
            title={displayValue}
          />
          {suffix && <span className="ml-0.5 text-[10px] text-panel-text-5">{suffix}</span>}
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-md bg-panel-input">
          <button
            type="button"
            disabled={disabled}
            aria-label={t("Decrease {label}", { label: t(label) })}
            onClick={() => nudge(-1)}
            className="flex h-5 w-5 items-center justify-center text-panel-text-4 transition-colors hover:bg-panel-hover hover:text-panel-text-1 disabled:cursor-not-allowed disabled:opacity-40"
            title={t("Decrease {label}", { label: t(label) })}
          >
            <Minus size={11} />
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-label={t("Increase {label}", { label: t(label) })}
            onClick={() => nudge(1)}
            className="flex h-5 w-5 items-center justify-center border-l border-panel-border text-panel-text-4 transition-colors hover:bg-panel-hover hover:text-panel-text-1 disabled:cursor-not-allowed disabled:opacity-40"
            title={t("Increase {label}", { label: t(label) })}
          >
            <Plus size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
