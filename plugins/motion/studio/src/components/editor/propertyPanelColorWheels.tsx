import { useI18n } from "../../i18n/I18n";
import { useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  getHfColorGradingCapabilities,
  type HfColorGradingWheelKey,
  type NormalizedHfColorGradingWheels,
} from "@hyperframes/core/color-grading";
import { RotateCcw } from "../../icons/SystemIcons";
import { clampNumber } from "../../utils/studioHelpers";
import { GradingNumberField } from "./propertyPanelGradingNumberField";
import { useInspectorGestureDraft } from "./useInspectorGestureTransaction";

const WHEELS: ReadonlyArray<{ key: HfColorGradingWheelKey; label: string }> = [
  { key: "shadows", label: "Shadows" },
  { key: "midtones", label: "Midtones" },
  { key: "highlights", label: "Highlights" },
];
type NormalizedTonalWheel = NormalizedHfColorGradingWheels[HfColorGradingWheelKey];

const WHEEL_CONTROLS = getHfColorGradingCapabilities().wheels.controls;
const PERCENT_SCALE = 100;
const HUE_MAX = WHEEL_CONTROLS.hue.maxExclusive - 0.01;
const RESET_WHEEL: NormalizedTonalWheel = {
  hue: WHEEL_CONTROLS.hue.identity,
  amount: WHEEL_CONTROLS.amount.identity,
  level: WHEEL_CONTROLS.level.identity,
};

function wrapHue(value: number): number {
  const { min, maxExclusive } = WHEEL_CONTROLS.hue;
  const span = maxExclusive - min;
  return ((((value - min) % span) + span) % span) + min;
}

function formatNumberInput(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

const formatIntegerInput = (value: number) => formatNumberInput(value, 0);

function wheelFromPointer(
  wheel: NormalizedTonalWheel,
  clientX: number,
  clientY: number,
  rect: DOMRect,
): NormalizedTonalWheel {
  const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
  const x = (clientX - (rect.left + rect.width / 2)) / radius;
  const y = (rect.top + rect.height / 2 - clientY) / radius;
  return {
    ...wheel,
    hue: wrapHue((Math.atan2(y, x) * 180) / Math.PI),
    amount: clampNumber(Math.hypot(x, y), WHEEL_CONTROLS.amount.min, WHEEL_CONTROLS.amount.max),
  };
}

function updateWheel(
  value: NormalizedHfColorGradingWheels,
  key: HfColorGradingWheelKey,
  wheel: NormalizedTonalWheel,
): NormalizedHfColorGradingWheels {
  return { ...value, [key]: wheel };
}

function wheelFromKey(
  wheel: NormalizedTonalWheel,
  key: string,
  large: boolean,
): NormalizedTonalWheel | null {
  const hueStep = large ? 10 : 1;
  const amountStep = large ? 0.1 : 0.01;
  switch (key) {
    case "ArrowLeft":
      return { ...wheel, hue: wrapHue(wheel.hue - hueStep) };
    case "ArrowRight":
      return { ...wheel, hue: wrapHue(wheel.hue + hueStep) };
    case "ArrowDown":
      return {
        ...wheel,
        amount: clampNumber(
          wheel.amount - amountStep,
          WHEEL_CONTROLS.amount.min,
          WHEEL_CONTROLS.amount.max,
        ),
      };
    case "ArrowUp":
      return {
        ...wheel,
        amount: clampNumber(
          wheel.amount + amountStep,
          WHEEL_CONTROLS.amount.min,
          WHEEL_CONTROLS.amount.max,
        ),
      };
    case "Home":
      return { ...wheel, amount: WHEEL_CONTROLS.amount.min };
    case "End":
      return { ...wheel, amount: WHEEL_CONTROLS.amount.max };
    default:
      return null;
  }
}

function TonalWheel({
  label,
  wheel,
  disabled,
  onBegin,
  onPreview,
  onSettle,
  onCancel,
  onReset,
}: {
  label: string;
  wheel: NormalizedTonalWheel;
  disabled?: boolean;
  onBegin: () => void;
  onPreview: (wheel: NormalizedTonalWheel) => void;
  onSettle: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  const pointerIdRef = useRef<number | null>(null);
  const hueRadians = (wheel.hue * Math.PI) / 180;
  const thumbLeft = 50 + Math.cos(hueRadians) * wheel.amount * 46;
  const thumbTop = 50 - Math.sin(hueRadians) * wheel.amount * 46;

  const previewPointer = (target: HTMLDivElement, clientX: number, clientY: number) => {
    onPreview(wheelFromPointer(wheel, clientX, clientY, target.getBoundingClientRect()));
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    const next = wheelFromKey(wheel, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    onBegin();
    onPreview(next);
  };

  return (
    <div data-color-wheel={label.toLowerCase()} className="min-w-[88px] flex-1 space-y-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[10px] font-medium text-panel-text-2">{t(label)}</span>
        <button
          type="button"
          aria-label={t("Reset {label}", { label: t(label) })}
          title={t("Reset {label}", { label: t(label) })}
          disabled={disabled}
          onClick={onReset}
          className="text-panel-text-4 hover:text-panel-text-1 disabled:opacity-40"
        >
          <RotateCcw size={10} />
        </button>
      </div>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={t("{label} color", { label: t(label) })}
        aria-valuemin={WHEEL_CONTROLS.amount.min * PERCENT_SCALE}
        aria-valuemax={WHEEL_CONTROLS.amount.max * PERCENT_SCALE}
        aria-valuenow={Math.round(wheel.amount * PERCENT_SCALE)}
        aria-valuetext={`${Math.round(wheel.hue)} degrees, ${Math.round(
          wheel.amount * PERCENT_SCALE,
        )} percent`}
        aria-disabled={disabled}
        data-color-wheel-surface="true"
        onDoubleClick={onReset}
        onPointerDown={(event) => {
          if (disabled) return;
          event.preventDefault();
          onBegin();
          pointerIdRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          previewPointer(event.currentTarget, event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (disabled || pointerIdRef.current !== event.pointerId) return;
          previewPointer(event.currentTarget, event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          if (pointerIdRef.current !== event.pointerId) return;
          previewPointer(event.currentTarget, event.clientX, event.clientY);
          pointerIdRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          onSettle();
        }}
        onPointerCancel={(event) => {
          if (pointerIdRef.current !== event.pointerId) return;
          pointerIdRef.current = null;
          onCancel();
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => {
          if (
            ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
          ) {
            onSettle();
          }
        }}
        onBlur={onSettle}
        className="relative mx-auto aspect-square w-full max-w-[112px] touch-none rounded-full border border-panel-border-input outline-hidden focus:ring-1 focus:ring-panel-accent disabled:opacity-40"
        style={{
          background:
            "radial-gradient(circle, rgb(128 128 128) 0%, transparent 72%), conic-gradient(from 90deg, #f33, #f3f, #33f, #3ff, #3f3, #ff3, #f33)",
        }}
      >
        <span
          data-color-wheel-thumb="true"
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-transparent shadow-[0_0_0_1px_rgba(0,0,0,0.8)]"
          style={{ left: `${thumbLeft}%`, top: `${thumbTop}%` }}
        />
      </div>
      <input
        type="range"
        aria-label={t("{label} level", { label: t(label) })}
        min={WHEEL_CONTROLS.level.min}
        max={WHEEL_CONTROLS.level.max}
        step={0.01}
        value={wheel.level}
        disabled={disabled}
        onPointerDown={onBegin}
        onChange={(event) => onPreview({ ...wheel, level: Number(event.target.value) })}
        onPointerUp={onSettle}
        onPointerCancel={onCancel}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          } else {
            onBegin();
          }
        }}
        onKeyUp={onSettle}
        onBlur={onSettle}
        className="h-3 w-full accent-panel-accent"
      />
      <div className="grid grid-cols-3 gap-1">
        <GradingNumberField
          label={t("Hue")}
          value={wheel.hue}
          min={WHEEL_CONTROLS.hue.min}
          max={HUE_MAX}
          disabled={disabled}
          formatValue={formatIntegerInput}
          labelTextClassName="block text-[8px] uppercase text-panel-text-5"
          onBegin={onBegin}
          onPreview={(hue) => onPreview({ ...wheel, hue: wrapHue(hue) })}
          onSettle={onSettle}
          onCancel={onCancel}
        />
        <GradingNumberField
          label={t("Amount")}
          value={wheel.amount * PERCENT_SCALE}
          min={WHEEL_CONTROLS.amount.min * PERCENT_SCALE}
          max={WHEEL_CONTROLS.amount.max * PERCENT_SCALE}
          disabled={disabled}
          formatValue={formatIntegerInput}
          labelTextClassName="block text-[8px] uppercase text-panel-text-5"
          onBegin={onBegin}
          onPreview={(amount) => onPreview({ ...wheel, amount: amount / PERCENT_SCALE })}
          onSettle={onSettle}
          onCancel={onCancel}
        />
        <GradingNumberField
          label={t("Level")}
          value={wheel.level * PERCENT_SCALE}
          min={WHEEL_CONTROLS.level.min * PERCENT_SCALE}
          max={WHEEL_CONTROLS.level.max * PERCENT_SCALE}
          disabled={disabled}
          formatValue={formatIntegerInput}
          labelTextClassName="block text-[8px] uppercase text-panel-text-5"
          onBegin={onBegin}
          onPreview={(level) => onPreview({ ...wheel, level: level / PERCENT_SCALE })}
          onSettle={onSettle}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}

export function ColorWheels({
  value,
  disabled,
  onPreview,
  onCommit,
}: {
  value: NormalizedHfColorGradingWheels;
  disabled?: boolean;
  onPreview: (value: NormalizedHfColorGradingWheels) => void;
  onCommit: (value: NormalizedHfColorGradingWheels) => void;
}) {
  const { draft, setDraft, transaction } = useInspectorGestureDraft({
    sourceValue: value,
    onPreview,
    onCommit,
  });

  const previewWheel = (key: HfColorGradingWheelKey, wheel: NormalizedTonalWheel) =>
    transaction.preview(updateWheel(draft, key, wheel));
  const resetWheel = (key: HfColorGradingWheelKey) => {
    transaction.cancel();
    const next = updateWheel(draft, key, RESET_WHEEL);
    setDraft(next);
    onCommit(next);
  };

  return (
    <div
      data-color-wheels="true"
      className="grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-2"
    >
      {WHEELS.map(({ key, label }) => (
        <TonalWheel
          key={key}
          label={label}
          wheel={draft[key]}
          disabled={disabled}
          onBegin={transaction.begin}
          onPreview={(wheel) => previewWheel(key, wheel)}
          onSettle={transaction.settle}
          onCancel={transaction.cancel}
          onReset={() => resetWheel(key)}
        />
      ))}
    </div>
  );
}
