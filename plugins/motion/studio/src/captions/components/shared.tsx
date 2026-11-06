import { useI18n } from "../../i18n/I18n";
import type React from "react";
import { useEffect, useRef, useState } from "react";

export const inputCls =
  "w-full bg-neutral-900 border border-neutral-800 rounded-sm px-1.5 py-0.5 text-2xs text-neutral-200 font-mono outline-hidden focus:border-studio-accent disabled:opacity-40 disabled:cursor-not-allowed";

export function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 mt-2 mb-1.5">
        <span className="text-2xs font-medium text-neutral-500 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xs text-neutral-600 w-14 text-right shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

interface NumberFieldProps {
  value: number | undefined;
  /** True when a multi-selection has differing values — shows "Mixed" until edited. */
  mixed?: boolean;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  ariaLabel: string;
  onCommit: (value: number) => void;
}

/**
 * Numeric input that only commits finite parses. Typing "-" or clearing the
 * field keeps a local draft instead of committing NaN/0 into live transforms
 * and the persisted overrides file.
 */
export function NumberField({
  value,
  mixed,
  step,
  min,
  max,
  disabled,
  ariaLabel,
  onCommit,
}: NumberFieldProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  const focusedRef = useRef(false);

  // External value changed while not editing — drop any stale draft.
  useEffect(() => {
    if (!focusedRef.current) setDraft(null);
  }, [value]);

  const display = draft !== null ? draft : mixed ? "" : String(value ?? 0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDraft(raw);
    const parsed = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(parsed)) {
      // Native min/max only constrain spinner steps — typed values bypass
      // them, so clamp before committing to the model/overrides.
      let clamped = parsed;
      if (min !== undefined) clamped = Math.max(min, clamped);
      if (max !== undefined) clamped = Math.min(max, clamped);
      onCommit(clamped);
    }
  };

  return (
    <input
      type="number"
      className={inputCls}
      value={display}
      placeholder={mixed ? t("Mixed") : undefined}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={handleChange}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        setDraft(null);
      }}
    />
  );
}
