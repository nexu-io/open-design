import { useI18n } from "../../i18n/I18n";
/**
 * Ease editor mode primitives: the mode radio group and the preset grid.
 *
 * Split out of `EaseCurveSection.tsx` to keep it under the 600-line cap
 * (CI's file size check). Both components are presentational and stateless —
 * they take the current selection and emit a committed ease string — so they
 * carry the mode vocabulary (`EASE_MODES`, labels, per-mode defaults) with
 * them rather than importing it back from the parent.
 */

import { EASE_PRESETS } from "./easePresetLibrary";
import { MiniCurveSvg } from "./easeCurveSvg";
import { EASE_CURVES } from "./gsapAnimationConstants";

const EASE_MODES = ["curve", "spring", "wiggle"] as const;
export type EaseMode = (typeof EASE_MODES)[number];

export type Pts = [number, number, number, number];
export const DEFAULT_CURVE: Pts = EASE_CURVES["power2.out"];

export const MODE_LABELS = { curve: "Curve", spring: "Spring", wiggle: "Wiggle" } satisfies Record<
  EaseMode,
  string
>;

const DEFAULT_EASE_BY_MODE = {
  curve: `custom(M0,0 C${DEFAULT_CURVE[0]},${DEFAULT_CURVE[1]} ${DEFAULT_CURVE[2]},${DEFAULT_CURVE[3]} 1,1)`,
  spring: "spring(0.42)",
  wiggle: "wiggle(3,easeInOut,0.12)",
} satisfies Record<EaseMode, string>;

export const EasePresetGrid = function EasePresetGrid({
  kind,
  currentEase,
  onSelect,
}: {
  kind: EaseMode;
  currentEase: string;
  onSelect: (ease: string) => void;
}) {
  return (
    <div className="mb-2 grid max-h-56 grid-cols-4 gap-1 overflow-y-auto pr-0.5">
      {EASE_PRESETS.filter((preset) => preset.kind === kind).map((preset) => {
        const isActive = currentEase === preset.ease;
        return (
          <button
            key={preset.id}
            type="button"
            data-ease-preset-id={preset.id}
            role="menuitemradio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(preset.ease)}
            className={`flex flex-col items-center gap-0.5 rounded-md p-1 transition-colors ${
              isActive ? "bg-panel-accent/10 ring-1 ring-panel-accent/30" : "hover:bg-neutral-800"
            }`}
            title={preset.label}
          >
            <MiniCurveSvg ease={preset.ease} active={isActive} />
            <span
              className={`text-center text-[8px] leading-none ${
                isActive ? "text-accent-ink" : "text-neutral-500"
              }`}
            >
              {preset.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export function EaseModeToggle({
  mode,
  onCommit,
}: {
  mode: EaseMode;
  onCommit: (ease: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="mb-2 grid grid-cols-3 rounded-md bg-press p-0.5"
      role="radiogroup"
      aria-label={t("Ease editor mode")}
    >
      {EASE_MODES.map((candidateMode) => {
        const active = candidateMode === mode;
        return (
          <button
            key={candidateMode}
            type="button"
            data-ease-mode={candidateMode}
            role="radio"
            aria-checked={active}
            onClick={() => {
              if (active) return;
              onCommit(DEFAULT_EASE_BY_MODE[candidateMode]);
            }}
            className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
              active ? "bg-neutral-700 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {MODE_LABELS[candidateMode]}
          </button>
        );
      })}
    </div>
  );
}
