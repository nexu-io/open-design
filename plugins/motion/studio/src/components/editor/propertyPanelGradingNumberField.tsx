import { useI18n } from "../../i18n/I18n";
import { useEffect, useRef, useState } from "react";
import { clampNumber } from "../../utils/studioHelpers";

export function GradingNumberField({
  label,
  ariaLabel = label,
  value,
  min,
  max,
  disabled,
  formatValue = String,
  labelClassName = "min-w-0",
  labelTextClassName = "block",
  inputClassName = "w-full",
  onBegin,
  onPreview,
  onSettle,
  onCancel,
}: {
  label: string;
  ariaLabel?: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  formatValue?: (value: number) => string;
  labelClassName?: string;
  labelTextClassName?: string;
  inputClassName?: string;
  onBegin: () => void;
  onPreview: (value: number) => void;
  onSettle: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => formatValue(value));
  const focusedRef = useRef(false);
  const cancelBlurRef = useRef(false);
  const baselineRef = useRef(value);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(formatValue(value));
  }, [formatValue, value]);

  const settle = () => {
    focusedRef.current = false;
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false;
      return;
    }
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setDraft(formatValue(value));
      if (dirtyRef.current) onCancel();
      dirtyRef.current = false;
      return;
    }
    const next = clampNumber(parsed, min, max);
    setDraft(formatValue(next));
    if (!dirtyRef.current || Object.is(next, baselineRef.current)) {
      if (dirtyRef.current) onCancel();
      dirtyRef.current = false;
      return;
    }
    onPreview(next);
    onSettle();
    dirtyRef.current = false;
  };

  return (
    <label className={labelClassName}>
      <span className={labelTextClassName}>{t(label)}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft}
        disabled={disabled}
        onFocus={() => {
          focusedRef.current = true;
          baselineRef.current = value;
          dirtyRef.current = false;
          setDraft(formatValue(value));
        }}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (next.trim() === "") return;
          const parsed = Number(next);
          if (!Number.isFinite(parsed)) return;
          const clamped = clampNumber(parsed, min, max);
          if (!Object.is(clamped, baselineRef.current) && !dirtyRef.current) {
            dirtyRef.current = true;
            onBegin();
          }
          if (dirtyRef.current) onPreview(clamped);
        }}
        onBlur={settle}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cancelBlurRef.current = true;
            focusedRef.current = false;
            setDraft(formatValue(value));
            if (dirtyRef.current) onCancel();
            dirtyRef.current = false;
            event.currentTarget.blur();
          } else if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className={`border-b border-panel-border-input/50 bg-transparent py-0.5 text-right font-mono text-[9px] text-panel-text-2 outline-hidden focus:border-panel-accent disabled:opacity-40 ${inputClassName}`}
      />
    </label>
  );
}
