import { useI18n, sourceMessage } from "../../i18n/I18n";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  DesignPanelInputProvider,
  useTrackDesignInput,
} from "../../contexts/DesignPanelInputContext";
import { FIELD, LABEL } from "./propertyPanelHelpers";
import { CommitField } from "./propertyPanelCommitField";

export { CommitField } from "./propertyPanelCommitField";

/* ------------------------------------------------------------------ */
/*  MetricField                                                        */
/* ------------------------------------------------------------------ */

export function MetricField({
  label,
  value,
  disabled,
  liveCommit,
  scrub,
  suffix,
  tooltip,
  onCommit,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  liveCommit?: boolean;
  scrub?: boolean;
  suffix?: string;
  tooltip?: string;
  onCommit: (nextValue: string) => void | Promise<unknown>;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const scrubRef = useRef<{ startX: number; startValue: number; pointerId: number } | null>(null);
  const commit = useCallback(
    (nextValue: string) => {
      if (nextValue !== value) track("metric", label);
      return onCommit(nextValue);
    },
    [label, onCommit, track, value],
  );

  const handleScrubPointerDown = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      if (disabled || !scrub) return;
      const parsed = parseFloat(value);
      if (!Number.isFinite(parsed)) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      scrubRef.current = { startX: e.clientX, startValue: parsed, pointerId: e.pointerId };
    },
    [disabled, scrub, value],
  );

  const handleScrubPointerMove = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      const state = scrubRef.current;
      if (!state) return;
      const delta = e.clientX - state.startX;
      commit(String(Math.round(state.startValue + delta)));
    },
    [commit],
  );

  const handleScrubPointerUp = useCallback(() => {
    scrubRef.current = null;
  }, []);

  const scrubProps =
    scrub && !disabled
      ? ({
          className:
            "shrink-0 text-[11px] font-medium text-neutral-500 cursor-ew-resize select-none",
          onPointerDown: handleScrubPointerDown,
          onPointerMove: handleScrubPointerMove,
          onPointerUp: handleScrubPointerUp,
          onPointerCancel: handleScrubPointerUp,
          onLostPointerCapture: handleScrubPointerUp,
        } as const)
      : ({ className: "shrink-0 text-[11px] font-medium text-neutral-500" } as const);

  return (
    <div className={FIELD} title={tooltip ? t(tooltip) : undefined}>
      <div className="flex min-w-0 items-center gap-3">
        <span {...scrubProps}>{t(label)}</span>
        <CommitField value={value} disabled={disabled} liveCommit={liveCommit} onCommit={commit} />
        {suffix && <span className="shrink-0 text-[10px] text-neutral-600">{suffix}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Simple field components                                            */
/* ------------------------------------------------------------------ */

export function DetailField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onCommit: (nextValue: string) => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const commit = (nextValue: string) => {
    if (nextValue !== value) track("text", label);
    onCommit(nextValue);
  };
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className={LABEL}>{t(label)}</span>
      <div className={FIELD}>
        <CommitField value={value} disabled={disabled} onCommit={commit} />
      </div>
    </label>
  );
}

export function SliderControl({
  trackName,
  value,
  min,
  max,
  step,
  displayValue,
  formatDisplayValue,
  disabled,
  onCommit,
}: {
  trackName: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  formatDisplayValue?: (nextValue: number) => string;
  disabled?: boolean;
  onCommit: (nextValue: number) => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const [draft, setDraft] = useState(value);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionChangedRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    setDraft(value);
  }, [value]);
  useEffect(
    () => () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    [],
  );

  const commitDraft = (nextDraft: number) => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    if (interactionChangedRef.current) {
      interactionChangedRef.current = false;
      track("slider", trackName);
    }
    if (nextDraft !== valueRef.current) onCommit(nextDraft);
  };
  const scheduleCommit = (nextDraft: number) => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      if (nextDraft !== valueRef.current) onCommit(nextDraft);
    }, 40);
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        aria-label={t(trackName)}
        onChange={(e) => {
          const n = Number(e.target.value);
          setDraft(n);
          interactionChangedRef.current = true;
          scheduleCommit(n);
        }}
        onMouseUp={() => commitDraft(draft)}
        onTouchEnd={() => commitDraft(draft)}
        onBlur={() => commitDraft(draft)}
        // h-6 is the 24x24 WCAG 2.2 (2.5.8) target: the visible track stays 2px
        // and the thumb 10px, only the pointer box grows.
        className="h-6 min-w-0 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-slider-runnable-track]:h-[2px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-panel-border [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[10px] [&::-webkit-slider-thumb]:h-[10px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_#0C0C0E,0_1px_3px_rgba(0,0,0,0.5)] [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb:active]:cursor-grabbing"
      />
      <div className="min-w-[44px] rounded-md bg-panel-input px-2 py-1.5 text-right text-[11px] font-medium text-panel-text-1 tabular-nums">
        {formatDisplayValue?.(draft) ?? displayValue}
      </div>
    </div>
  );
}

export function SegmentedControl({
  trackName,
  options,
  value,
  disabled,
  onChange,
}: {
  trackName: string;
  options: Array<{ label: string; value: string }>;
  value: string;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  return (
    <div
      className="grid min-w-0 gap-[2px] rounded-md bg-panel-input p-[2px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (option.value !== value) track("segmented", trackName);
            onChange(option.value);
          }}
          aria-pressed={option.value === value}
          className={`min-w-0 truncate rounded px-2 py-[5px] text-[11px] font-medium transition-colors disabled:cursor-not-allowed ${
            option.value === value
              ? "bg-panel-hover text-text-0"
              : "text-panel-text-4 hover:text-panel-text-2"
          }`}
        >
          {t(option.label)}
        </button>
      ))}
    </div>
  );
}

export function SelectField({
  label,
  value,
  disabled,
  options,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  options: string[];
  onChange: (nextValue: string) => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const renderedOptions = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <label className={`${FIELD} flex items-center gap-3`}>
      <span className="shrink-0 text-[11px] font-medium text-neutral-500">{t(label)}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => {
          track("select", label);
          onChange(e.target.value);
        }}
        className="min-w-0 w-full appearance-none bg-transparent text-[11px] font-medium text-neutral-100 outline-hidden disabled:cursor-not-allowed disabled:text-neutral-600"
      >
        {renderedOptions.map((option) => (
          <option key={option} value={option}>
            {options.includes(option) ? t(option) : option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Section({
  title,
  icon: _icon,
  children,
  accessory,
  defaultCollapsed = false,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  accessory?: ReactNode;
  defaultCollapsed?: boolean;
}) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const collapseIcon = (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="currentColor"
      className={`shrink-0 text-panel-text-5 transition-transform duration-150 ${
        collapsed ? "-rotate-90" : ""
      }`}
    >
      <path d="M2 3l3 4 3-4z" />
    </svg>
  );

  const section = slugifyPanelSectionTitle(sourceMessage(title));
  return (
    <DesignPanelInputProvider section={section}>
      <section className="min-w-0 border-t border-panel-border" data-panel-section={section}>
        <div className="flex w-full items-center gap-2 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
          >
            <h3 className="text-[12px] font-semibold text-panel-text-1">{t(title)}</h3>
            {collapseIcon}
          </button>
          {accessory && <div className="flex shrink-0 items-center">{accessory}</div>}
        </div>
        {!collapsed && <div className="px-4 pb-3">{children}</div>}
      </section>
    </DesignPanelInputProvider>
  );
}

// Stable hook for e2e/automation to locate a section without depending on the
// display copy (h3 textContent matching breaks on wording tweaks or, if this
// panel is ever localized, on translation).
function slugifyPanelSectionTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
