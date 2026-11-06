import { useI18n } from "../../i18n/I18n";
import { MetricField } from "./propertyPanelPrimitives";
import {
  PERCENT_PROPS,
  PROP_CONSTRAINTS,
  PROP_LABELS,
  PROP_TOOLTIPS,
  PROP_UNITS,
  clampPropertyValue,
} from "./gsapAnimationConstants";
import { P } from "./panelTokens";

export const BOOLEAN_PROPS = new Set(["visibility"]);
const STRING_PROPS = new Set(["filter", "clipPath"]);
const FILTER_PRESETS = [
  { label: "Blur", value: "blur(4px)" },
  { label: "Bright", value: "brightness(1.5)" },
  { label: "Gray", value: "grayscale(1)" },
  { label: "None", value: "none" },
];
const CLIP_PATH_PRESETS = [
  { label: "Circle", value: "circle(50% at 50% 50%)" },
  { label: "Inset", value: "inset(10%)" },
  { label: "None", value: "none" },
];

function isPercentProp(prop: string): boolean {
  return PERCENT_PROPS.has(prop);
}

function displayValue(prop: string, val: number | string): string {
  if (isPercentProp(prop)) return String(Math.round(Math.max(0, Math.min(1, Number(val))) * 100));
  return String(val);
}

function adjustedValue(prop: string, raw: string): string {
  if (isPercentProp(prop)) return String(clampPropertyValue(prop, Number(raw) / 100));
  const num = Number(raw);
  if (!Number.isNaN(num) && PROP_CONSTRAINTS[prop]) {
    return String(clampPropertyValue(prop, num));
  }
  return raw;
}

function RemoveButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative shrink-0 rounded-sm p-1.5 text-neutral-600 transition-colors hover:bg-neutral-800 hover:text-danger-ink active:scale-[0.95]"
      title={title}
      aria-label={title}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3 3l6 6M9 3l-6 6" />
      </svg>
    </button>
  );
}

// fallow-ignore-next-line complexity
export function PropertyRow({
  prop,
  val,
  onCommit,
  onRemove,
  removeTitle,
}: {
  prop: string;
  val: number | string;
  onCommit: (adjusted: string) => void;
  onRemove: () => void;
  removeTitle: string;
}) {
  const { t } = useI18n();
  if (BOOLEAN_PROPS.has(prop)) {
    const isVisible = val === "visible" || val === 1;
    return (
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 flex items-center gap-2 px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-800">
          <span className="flex-1 text-[11px] font-medium text-neutral-500">
            {PROP_LABELS[prop] ?? prop}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isVisible}
            onClick={() => onCommit(isVisible ? "hidden" : "visible")}
            className="shrink-0 rounded-full transition-colors duration-200 relative"
            style={{ width: 28, height: 16, background: isVisible ? P.accent : P.borderInput }}
            title={isVisible ? t("Visible: click to hide") : t("Hidden: click to show")}
          >
            <span
              className="absolute top-[2px] left-0 rounded-full transition-transform duration-200"
              style={{
                width: 12,
                height: 12,
                background: isVisible ? P.white : P.textMuted,
                transform: isVisible ? "translateX(14px)" : "translateX(2px)",
              }}
            />
          </button>
        </div>
        <RemoveButton onClick={onRemove} title={removeTitle} />
      </div>
    );
  }
  if (STRING_PROPS.has(prop)) {
    const presets =
      prop === "filter" ? FILTER_PRESETS : prop === "clipPath" ? CLIP_PATH_PRESETS : [];
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1 flex items-center gap-2 px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-800">
            <span className="shrink-0 text-[11px] font-medium text-neutral-500">
              {PROP_LABELS[prop] ?? prop}
            </span>
            <input
              type="text"
              defaultValue={String(val)}
              className="flex-1 bg-transparent text-[11px] text-neutral-200 outline-hidden"
              onBlur={(e) => onCommit(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </div>
          <RemoveButton onClick={onRemove} title={removeTitle} />
        </div>
        {presets.length > 0 && (
          <div className="flex gap-1 pl-1">
            {presets.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => onCommit(p.value)}
                className="px-1.5 py-0.5 rounded-sm text-[9px] font-medium text-neutral-500 bg-neutral-800/50 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <MetricField
          label={PROP_LABELS[prop] ?? prop}
          value={displayValue(prop, val)}
          suffix={PROP_UNITS[prop]}
          tooltip={PROP_TOOLTIPS[prop]}
          scrub
          liveCommit
          onCommit={(raw) => onCommit(adjustedValue(prop, raw))}
        />
      </div>
      <RemoveButton onClick={onRemove} title={removeTitle} />
    </div>
  );
}

export function AddPropertyTrigger({
  adding,
  available,
  addLabel,
  addTitle,
  onAdd,
  onOpen,
  onClose,
  buttonClassName,
}: {
  adding: boolean;
  available: string[];
  addLabel: string;
  addTitle: string;
  onAdd: (prop: string) => void;
  onOpen: () => void;
  onClose: () => void;
  buttonClassName: string;
}) {
  const { t } = useI18n();
  if (adding && available.length > 0) {
    return (
      <select
        autoFocus
        className="min-w-0 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-100 outline-hidden"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value);
          onClose();
        }}
        onBlur={onClose}
      >
        <option value="" disabled>
          {t("Choose property…")}</option>
        {available.map((p) => (
          <option key={p} value={p}>
            {PROP_LABELS[p] ?? p}
          </option>
        ))}
      </select>
    );
  }
  if (available.length === 0) return null;
  return (
    <button type="button" onClick={onOpen} className={buttonClassName} title={addTitle}>
      {addLabel}
    </button>
  );
}

export function parseNumericOrString(raw: string): number | string {
  const num = Number(raw);
  return Number.isFinite(num) ? num : raw;
}
