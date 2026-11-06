import { useI18n } from "../../i18n/I18n";
import { RotateCcw } from "../../icons/SystemIcons";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import {
  VALUE_TIER_LABEL_CLASS,
  VALUE_TIER_VALUE_CLASS,
  type PropertyValueTier,
} from "./propertyPanelValueTier";

/* ------------------------------------------------------------------ */
/*  FlatSelectRow — label/value row backed by a native <select>        */
/* ------------------------------------------------------------------ */

export function FlatSelectRow({
  label,
  ariaLabel,
  value,
  options,
  tier,
  disabled,
  onChange,
  onReset,
}: {
  label: string;
  /** Accessible name when a caller renders the visible label OUTSIDE this
   *  row (label="" to avoid a duplicate) — e.g. Grade's "Preset" row, which
   *  shows its own label span and would otherwise leave the <select>
   *  unnamed. Falls back to `label` when omitted. */
  ariaLabel?: string;
  value: string;
  options: Array<string | { value: string; label: string }>;
  tier: PropertyValueTier;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
  onReset?: () => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const trackName = ariaLabel || label;
  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
  // A valid authored value outside the preset list (e.g. a `mix-blend-mode`
  // or `object-position` this row doesn't offer as a preset) must not be
  // silently misrepresented as the first option — the native <select> falls
  // back to selectedIndex 0 when `value` matches no <option>, and reselecting
  // that visible-but-wrong preset overwrites the real persisted value. Prepend
  // the current value so it's always representable, matching legacy
  // `SelectField`'s same guard.
  const renderedOptions =
    value && !normalizedOptions.some((option) => option.value === value)
      ? [{ value, label: value }, ...normalizedOptions]
      : normalizedOptions;
  return (
    <div className="group flex min-h-[30px] items-center justify-between">
      <span className={`text-[11px] ${VALUE_TIER_LABEL_CLASS[tier]}`}>{t(label)}</span>
      <span className="flex items-center gap-2">
        <label
          className={`flex items-center gap-1.5 border-b pb-px ${
            tier === "explicitCustom"
              ? "border-panel-accent/30 group-hover:border-panel-accent/70"
              : "border-panel-border-input/50 group-hover:border-panel-border-input"
          }`}
        >
          <select
            value={value}
            disabled={disabled}
            aria-label={t(ariaLabel || label) || undefined}
            onChange={(e) => {
              track("select", trackName);
              onChange(e.target.value);
            }}
            className={`appearance-none bg-transparent text-right font-mono text-[11px] outline-hidden disabled:cursor-not-allowed ${VALUE_TIER_VALUE_CLASS[tier]}`}
          >
            {renderedOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {normalizedOptions.includes(option) ? t(option.label) : option.label}
              </option>
            ))}
          </select>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="currentColor"
            className="shrink-0 text-panel-text-5"
          >
            <path d="M2 3l3 4 3-4z" />
          </svg>
        </label>
        {tier === "explicitCustom" && onReset && (
          <button
            type="button"
            data-flat-select-reset="true"
            title={t("Remove and fall back to default")}
            disabled={disabled}
            onClick={() => {
              track("button", `Reset ${trackName}`);
              onReset();
            }}
            className="shrink-0 text-panel-text-3 opacity-0 transition-opacity hover:text-panel-text-1 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={11} />
          </button>
        )}
      </span>
    </div>
  );
}
