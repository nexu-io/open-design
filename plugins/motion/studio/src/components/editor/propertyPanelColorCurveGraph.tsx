import { useI18n } from "../../i18n/I18n";
import { useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  compileHfColorCurve,
  compileHfHueCurve,
  HF_COLOR_CURVE_MAX_POINTS,
  type HfColorCurvePoint,
  type HfColorGradingCurveKey,
  type HfColorGradingHueCurveKey,
  type HfHueCurvePoint,
  type NormalizedHfColorGradingCurves,
  type NormalizedHfColorGradingHueCurves,
} from "@hyperframes/core/color-grading";
import { clampNumber } from "../../utils/studioHelpers";

const GRAPH_SIZE = 160;
const GRAPH_PADDING = 8;
const SAMPLE_COUNT = 128;
const INPUT_EPSILON = 0.002;

type RgbTab = {
  kind: "rgb";
  key: HfColorGradingCurveKey;
  label: string;
  color: string;
  min: 0;
  max: 1;
};
type HueTab = {
  kind: "hue";
  key: HfColorGradingHueCurveKey;
  label: string;
  color: string;
  min: number;
  max: number;
};
export type CurveTab = RgbTab | HueTab;

export const TABS: readonly CurveTab[] = [
  { kind: "rgb", key: "master", label: "Master", color: "#e5e7eb", min: 0, max: 1 },
  { kind: "rgb", key: "red", label: "R", color: "#fb7185", min: 0, max: 1 },
  { kind: "rgb", key: "green", label: "G", color: "#4ade80", min: 0, max: 1 },
  { kind: "rgb", key: "blue", label: "B", color: "#60a5fa", min: 0, max: 1 },
  { kind: "hue", key: "hueVsHue", label: "Hue/Hue", color: "#f0abfc", min: -180, max: 180 },
  { kind: "hue", key: "hueVsSaturation", label: "Hue/Sat", color: "#facc15", min: -1, max: 1 },
  { kind: "hue", key: "hueVsLuma", label: "Hue/Luma", color: "#f8fafc", min: -1, max: 1 },
];

export const RGB_IDENTITY: readonly HfColorCurvePoint[] = [
  [0, 0],
  [1, 1],
];

export interface ColorCurveValues {
  curves: NormalizedHfColorGradingCurves;
  hueCurves: NormalizedHfColorGradingHueCurves;
}

function graphPoint(input: number, output: number, tab: CurveTab) {
  const inner = GRAPH_SIZE - GRAPH_PADDING * 2;
  const xRatio = tab.kind === "rgb" ? input : input / 360;
  const yRatio = (output - tab.min) / (tab.max - tab.min);
  return {
    x: GRAPH_PADDING + xRatio * inner,
    y: GRAPH_SIZE - GRAPH_PADDING - yRatio * inner,
  };
}

function valueFromPointer(clientX: number, clientY: number, rect: DOMRect, tab: CurveTab) {
  const inner = GRAPH_SIZE - GRAPH_PADDING * 2;
  const graphX = ((clientX - rect.left) / Math.max(rect.width, 1)) * GRAPH_SIZE;
  const graphY = ((clientY - rect.top) / Math.max(rect.height, 1)) * GRAPH_SIZE;
  const xRatio = clampNumber((graphX - GRAPH_PADDING) / inner, 0, 1);
  const yRatio = 1 - clampNumber((graphY - GRAPH_PADDING) / inner, 0, 1);
  return {
    input: tab.kind === "rgb" ? xRatio : Math.min(359.999, xRatio * 360),
    output: tab.min + yRatio * (tab.max - tab.min),
  };
}

function curvePath(samples: Float32Array, tab: CurveTab): string {
  return [...samples]
    .map((sample, index) => {
      const input =
        tab.kind === "rgb" ? index / (samples.length - 1) : (index / samples.length) * 360;
      const point = graphPoint(input, sample, tab);
      return `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    })
    .join(" ");
}

function samplesFor(points: readonly (HfColorCurvePoint | HfHueCurvePoint)[], tab: CurveTab) {
  if (tab.kind === "rgb") {
    return compileHfColorCurve(points as readonly HfColorCurvePoint[], SAMPLE_COUNT);
  }
  if (points.length < 3) return new Float32Array(SAMPLE_COUNT);
  return compileHfHueCurve(points as readonly HfHueCurvePoint[], tab.min, tab.max, SAMPLE_COUNT);
}

export function pointsFor(value: ColorCurveValues, tab: CurveTab) {
  return tab.kind === "rgb" ? value.curves[tab.key] : value.hueCurves[tab.key];
}

function circularHueDistance(left: number, right: number): number {
  const distance = Math.abs(left - right) % 360;
  return Math.min(distance, 360 - distance);
}

export function withPoints(
  value: ColorCurveValues,
  tab: CurveTab,
  points: readonly (HfColorCurvePoint | HfHueCurvePoint)[],
): ColorCurveValues {
  return tab.kind === "rgb"
    ? {
        ...value,
        curves: {
          ...value.curves,
          [tab.key]: points as readonly HfColorCurvePoint[],
        },
      }
    : {
        ...value,
        hueCurves: {
          ...value.hueCurves,
          [tab.key]: points as readonly HfHueCurvePoint[],
        },
      };
}

function nearestInputPointIndex(
  points: readonly (HfColorCurvePoint | HfHueCurvePoint)[],
  input: number,
  tab: CurveTab,
): number {
  const inputSpan = tab.kind === "rgb" ? 1 : 360;
  let closest = -1;
  let distance = 12 / (GRAPH_SIZE - GRAPH_PADDING * 2);
  points.forEach((point, index) => {
    const nextDistance =
      (tab.kind === "hue" ? circularHueDistance(point[0], input) : Math.abs(point[0] - input)) /
      inputSpan;
    if (nextDistance < distance) {
      closest = index;
      distance = nextDistance;
    }
  });
  return closest;
}

function nearestGraphPointIndex(
  points: readonly (HfColorCurvePoint | HfHueCurvePoint)[],
  input: number,
  output: number,
  tab: CurveTab,
): number {
  const target = graphPoint(input, output, tab);
  let closest = -1;
  let distance = 12;
  points.forEach((point, index) => {
    const candidate = graphPoint(point[0], point[1], tab);
    const xDistance =
      tab.kind === "hue"
        ? (circularHueDistance(point[0], input) / 360) * (GRAPH_SIZE - GRAPH_PADDING * 2)
        : candidate.x - target.x;
    const nextDistance = Math.hypot(xDistance, candidate.y - target.y);
    if (nextDistance < distance) {
      closest = index;
      distance = nextDistance;
    }
  });
  return closest;
}

function insertPoint(
  points: readonly (HfColorCurvePoint | HfHueCurvePoint)[],
  input: number,
  output: number,
  tab: CurveTab,
) {
  if (points.length >= HF_COLOR_CURVE_MAX_POINTS) return null;
  if (tab.kind === "hue" && points.length < 3) {
    const result: HfHueCurvePoint[] = [
      [((input + 240) % 360) as number, 0],
      [input, output],
      [((input + 120) % 360) as number, 0],
    ];
    result.sort((a, b) => a[0] - b[0]);
    return { points: result, selected: result.findIndex((point) => point[0] === input) };
  }
  const next = [...points];
  const point =
    tab.kind === "rgb"
      ? ([input, clampNumber(output, 0, 1)] as HfColorCurvePoint)
      : ([input, clampNumber(output, tab.min, tab.max)] as HfHueCurvePoint);
  next.push(point);
  next.sort((a, b) => a[0] - b[0]);
  return { points: next, selected: next.indexOf(point) };
}

function safeRgbInput(
  points: readonly (HfColorCurvePoint | HfHueCurvePoint)[],
  index: number,
  input: number,
): number {
  if (index === 0) return 0;
  if (index === points.length - 1) return 1;
  return clampNumber(
    input,
    (points[index - 1]?.[0] ?? 0) + INPUT_EPSILON,
    (points[index + 1]?.[0] ?? 1) - INPUT_EPSILON,
  );
}

function hueInputCollides(
  points: readonly (HfColorCurvePoint | HfHueCurvePoint)[],
  index: number,
  input: number,
): boolean {
  return points.some(
    (point, pointIndex) =>
      pointIndex !== index && circularHueDistance(point[0], input) < INPUT_EPSILON * 360,
  );
}

function safeHueInput(
  points: readonly (HfColorCurvePoint | HfHueCurvePoint)[],
  index: number,
  input: number,
): number {
  const initial = clampNumber(input, 0, 359.999);
  if (!hueInputCollides(points, index, initial)) return initial;
  const spacing = INPUT_EPSILON * 360;
  for (let step = 1; step <= points.length + 1; step += 1) {
    const clockwise = (initial + spacing * step) % 360;
    if (!hueInputCollides(points, index, clockwise)) return clockwise;
    const counterClockwise = (initial - spacing * step + 360) % 360;
    if (!hueInputCollides(points, index, counterClockwise)) return counterClockwise;
  }
  return initial;
}

export function movePoint(
  points: readonly (HfColorCurvePoint | HfHueCurvePoint)[],
  index: number,
  input: number,
  output: number,
  tab: CurveTab,
) {
  const next = [...points];
  const safeInput =
    tab.kind === "rgb" ? safeRgbInput(next, index, input) : safeHueInput(next, index, input);
  const moved =
    tab.kind === "rgb"
      ? ([safeInput, clampNumber(output, 0, 1)] as HfColorCurvePoint)
      : ([safeInput, clampNumber(output, tab.min, tab.max)] as HfHueCurvePoint);
  next[index] = moved;
  next.sort((a, b) => a[0] - b[0]);
  return { points: next, selected: next.indexOf(moved) };
}

const ARROW_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const;
type ArrowKey = (typeof ARROW_KEYS)[number];

function isArrowKey(key: string): key is ArrowKey {
  return ARROW_KEYS.includes(key as ArrowKey);
}

function curveOutputStep(tab: CurveTab, large: boolean): number {
  if (tab.kind === "rgb") return large ? 0.05 : 0.01;
  if (tab.key === "hueVsHue") return large ? 10 : 1;
  return large ? 0.1 : 0.01;
}

function keyboardPointPosition(
  point: HfColorCurvePoint | HfHueCurvePoint,
  key: ArrowKey,
  tab: CurveTab,
  large: boolean,
) {
  const inputStep = tab.kind === "rgb" ? (large ? 0.05 : 0.01) : large ? 10 : 1;
  const outputStep = curveOutputStep(tab, large);
  const inputDelta = key === "ArrowLeft" ? -inputStep : key === "ArrowRight" ? inputStep : 0;
  const outputDelta = key === "ArrowDown" ? -outputStep : key === "ArrowUp" ? outputStep : 0;
  return { input: point[0] + inputDelta, output: point[1] + outputDelta };
}

export function CurveGraph({
  tab,
  points,
  selectedIndex,
  disabled,
  onBegin,
  onPreview,
  onSelect,
  onDelete,
  onSettle,
  onCancel,
}: {
  tab: CurveTab;
  points: readonly (HfColorCurvePoint | HfHueCurvePoint)[];
  selectedIndex: number | null;
  disabled?: boolean;
  onBegin: () => void;
  onPreview: (
    points: readonly (HfColorCurvePoint | HfHueCurvePoint)[],
    selectedIndex: number,
  ) => void;
  onSelect: (index: number | null) => void;
  onDelete: () => void;
  onSettle: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const pointerRef = useRef<{
    pointerId: number;
    index: number;
    points: readonly (HfColorCurvePoint | HfHueCurvePoint)[];
  } | null>(null);
  const samples = useMemo(() => samplesFor(points, tab), [points, tab]);
  const path = useMemo(() => curvePath(samples, tab), [samples, tab]);
  const selectRelativePoint = (offset: number) => {
    if (points.length === 0) return;
    const current = selectedIndex ?? (offset > 0 ? -1 : 0);
    onSelect((current + offset + points.length) % points.length);
  };
  const addKeyboardPoint = () => {
    const input = tab.kind === "rgb" ? 0.5 : 180;
    const existing = nearestInputPointIndex(points, input, tab);
    if (existing >= 0) {
      onSelect(existing);
      return;
    }
    const output =
      tab.kind === "rgb"
        ? ((samples[Math.floor((samples.length - 1) / 2)] ?? input) +
            (samples[Math.ceil((samples.length - 1) / 2)] ?? input)) /
          2
        : (samples[Math.round(samples.length / 2)] ?? 0);
    const inserted = insertPoint(points, input, output, tab);
    if (!inserted) return;
    onBegin();
    onPreview(inserted.points, inserted.selected);
    onSettle();
  };
  const moveSelectedByKeyboard = (key: ArrowKey, large: boolean) => {
    if (selectedIndex === null) return false;
    const selected = points[selectedIndex];
    if (!selected) return false;
    const position = keyboardPointPosition(selected, key, tab, large);
    const moved = movePoint(points, selectedIndex, position.input, position.output, tab);
    onBegin();
    onPreview(moved.points, moved.selected);
    return true;
  };

  const previewFromPointer = (target: SVGSVGElement, clientX: number, clientY: number) => {
    const active = pointerRef.current;
    if (!active) return;
    const nextValue = valueFromPointer(clientX, clientY, target.getBoundingClientRect(), tab);
    const moved = movePoint(active.points, active.index, nextValue.input, nextValue.output, tab);
    pointerRef.current = {
      pointerId: active.pointerId,
      index: moved.selected,
      points: moved.points,
    };
    onPreview(moved.points, moved.selected);
  };
  const handleRemovalKey = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      pointerRef.current = null;
      onCancel();
      return true;
    }
    const deleteKey = event.key === "Delete" || event.key === "Backspace";
    if (deleteKey) {
      if (selectedIndex === null) return;
      event.preventDefault();
      onDelete();
      return true;
    }
    return false;
  };
  const handleAddKey = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      addKeyboardPoint();
      return true;
    }
    return false;
  };
  const handleSelectionKey = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      selectRelativePoint(event.key === "PageUp" ? -1 : 1);
      return true;
    }
    if (event.key === "Home" || event.key === "End") {
      if (points.length === 0) return true;
      event.preventDefault();
      onSelect(event.key === "Home" ? 0 : points.length - 1);
      return true;
    }
    return false;
  };
  const handleArrowKey = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (!isArrowKey(event.key) || points.length === 0) return false;
    event.preventDefault();
    if (selectedIndex === null) {
      const selectLast = event.key === "ArrowLeft" || event.key === "ArrowDown";
      onSelect(selectLast ? points.length - 1 : 0);
      return true;
    }
    moveSelectedByKeyboard(event.key, event.shiftKey);
    return true;
  };
  const handleKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (handleRemovalKey(event)) return;
    if (handleAddKey(event)) return;
    if (handleSelectionKey(event)) return;
    handleArrowKey(event);
  };

  return (
    <svg
      viewBox={`0 0 ${GRAPH_SIZE} ${GRAPH_SIZE}`}
      role="application"
      aria-label={t("{value0} curve", { value0: tab.label })}
      aria-keyshortcuts="Enter Space ArrowLeft ArrowRight ArrowUp ArrowDown PageUp PageDown Home End Delete"
      tabIndex={disabled ? -1 : 0}
      data-color-curve-graph={tab.key}
      data-color-curve-mid-sample={(samples[Math.floor(samples.length / 2)] ?? 0).toFixed(5)}
      onPointerDown={(event) => {
        if (disabled) return;
        const value = valueFromPointer(
          event.clientX,
          event.clientY,
          event.currentTarget.getBoundingClientRect(),
          tab,
        );
        let index = nearestGraphPointIndex(points, value.input, value.output, tab);
        let nextPoints = points;
        if (index < 0) {
          const inserted = insertPoint(points, value.input, value.output, tab);
          if (!inserted) return;
          nextPoints = inserted.points;
          index = inserted.selected;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerRef.current = { pointerId: event.pointerId, index, points: nextPoints };
        onBegin();
        onSelect(index);
        const moved = movePoint(nextPoints, index, value.input, value.output, tab);
        pointerRef.current.index = moved.selected;
        pointerRef.current.points = moved.points;
        onPreview(moved.points, moved.selected);
      }}
      onPointerMove={(event) => {
        if (disabled || pointerRef.current?.pointerId !== event.pointerId) return;
        previewFromPointer(event.currentTarget, event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        if (pointerRef.current?.pointerId !== event.pointerId) return;
        previewFromPointer(event.currentTarget, event.clientX, event.clientY);
        pointerRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        onSettle();
      }}
      onPointerCancel={() => {
        pointerRef.current = null;
        onCancel();
      }}
      onKeyDown={handleKeyDown}
      onKeyUp={(event) => {
        if (selectedIndex !== null && isArrowKey(event.key)) {
          onSettle();
        }
      }}
      className="mx-auto aspect-square w-full max-w-[200px] touch-none rounded-sm scheme-dark border border-panel-border-input bg-bg-0 outline-hidden focus:ring-1 focus:ring-inset focus:ring-panel-accent"
    >
      <defs>
        <linearGradient id={`hf-hue-axis-${tab.key}`}>
          <stop offset="0%" stopColor="#f33" />
          <stop offset="16.7%" stopColor="#ff3" />
          <stop offset="33.3%" stopColor="#3f3" />
          <stop offset="50%" stopColor="#3ff" />
          <stop offset="66.7%" stopColor="#33f" />
          <stop offset="83.3%" stopColor="#f3f" />
          <stop offset="100%" stopColor="#f33" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((ratio) => (
        <g key={ratio} className="stroke-text-0/10" strokeWidth="0.5">
          <line
            x1={GRAPH_PADDING}
            y1={GRAPH_PADDING + ratio * (GRAPH_SIZE - GRAPH_PADDING * 2)}
            x2={GRAPH_SIZE - GRAPH_PADDING}
            y2={GRAPH_PADDING + ratio * (GRAPH_SIZE - GRAPH_PADDING * 2)}
          />
          <line
            x1={GRAPH_PADDING + ratio * (GRAPH_SIZE - GRAPH_PADDING * 2)}
            y1={GRAPH_PADDING}
            x2={GRAPH_PADDING + ratio * (GRAPH_SIZE - GRAPH_PADDING * 2)}
            y2={GRAPH_SIZE - GRAPH_PADDING}
          />
        </g>
      ))}
      {tab.kind === "hue" && (
        <line
          x1={GRAPH_PADDING}
          y1={GRAPH_SIZE - 3}
          x2={GRAPH_SIZE - GRAPH_PADDING}
          y2={GRAPH_SIZE - 3}
          stroke={`url(#hf-hue-axis-${tab.key})`}
          strokeWidth="3"
        />
      )}
      <path
        data-color-curve-path="true"
        d={path}
        fill="none"
        stroke={tab.color}
        strokeWidth="1.5"
      />
      {points.map(([input, output], index) => {
        const point = graphPoint(input, output, tab);
        return (
          <circle
            key={`${input}-${index}`}
            data-color-curve-point={index}
            cx={point.x}
            cy={point.y}
            r={selectedIndex === index ? 3.5 : 2.5}
            fill={selectedIndex === index ? "#fff" : tab.color}
            stroke="#111"
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );
}

export function formatPointValue(value: number, tab: CurveTab, axis: "input" | "output") {
  if (tab.kind === "hue" && axis === "input") return Number(value.toFixed(1));
  if (tab.kind === "rgb") return Number(value.toFixed(3));
  return Number(value.toFixed(tab.key === "hueVsHue" ? 1 : 3));
}
