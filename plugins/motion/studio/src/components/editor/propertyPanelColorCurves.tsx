import { useI18n } from "../../i18n/I18n";
import { useState } from "react";
import type { HfColorCurvePoint, HfHueCurvePoint } from "@hyperframes/core/color-grading";
import { RotateCcw } from "../../icons/SystemIcons";
import {
  CurveGraph,
  formatPointValue,
  movePoint,
  pointsFor,
  RGB_IDENTITY,
  TABS,
  type ColorCurveValues,
  type CurveTab,
  withPoints,
} from "./propertyPanelColorCurveGraph";
import { GradingNumberField } from "./propertyPanelGradingNumberField";
import { useInspectorGestureDraft } from "./useInspectorGestureTransaction";

export type { ColorCurveValues } from "./propertyPanelColorCurveGraph";

export function ColorCurves({
  value,
  disabled,
  onPreview,
  onCommit,
}: {
  value: ColorCurveValues;
  disabled?: boolean;
  onPreview: (value: ColorCurveValues) => void;
  onCommit: (value: ColorCurveValues) => void;
}) {
  const { t } = useI18n();
  const [activeKey, setActiveKey] = useState<CurveTab["key"]>("master");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { draft, setDraft, transaction } = useInspectorGestureDraft({
    sourceValue: value,
    onPreview,
    onCommit,
  });
  const tab = TABS.find((candidate) => candidate.key === activeKey) ?? TABS[0];
  if (!tab) throw new Error("Color curve tabs are unavailable");
  const points = pointsFor(draft, tab);

  const previewPoints = (
    nextPoints: readonly (HfColorCurvePoint | HfHueCurvePoint)[],
    nextSelectedIndex: number,
  ) => {
    setSelectedIndex(nextSelectedIndex);
    transaction.preview(withPoints(draft, tab, nextPoints));
  };
  const resetActive = () => {
    transaction.cancel();
    const next = withPoints(draft, tab, tab.kind === "rgb" ? RGB_IDENTITY : []);
    setDraft(next);
    setSelectedIndex(null);
    onCommit(next);
  };
  const deleteSelected = () => {
    if (selectedIndex === null) return;
    if (tab.kind === "rgb" && (selectedIndex === 0 || selectedIndex === points.length - 1)) return;
    transaction.cancel();
    const nextPoints =
      tab.kind === "hue" && points.length <= 3
        ? []
        : points.filter((_, index) => index !== selectedIndex);
    const next = withPoints(draft, tab, nextPoints);
    setDraft(next);
    setSelectedIndex(null);
    onCommit(next);
  };
  const updateSelected = (axis: "input" | "output", rawValue: number) => {
    if (selectedIndex === null || !Number.isFinite(rawValue)) return;
    const point = points[selectedIndex];
    if (!point) return;
    const moved = movePoint(
      points,
      selectedIndex,
      axis === "input" ? rawValue : point[0],
      axis === "output" ? rawValue : point[1],
      tab,
    );
    previewPoints(moved.points, moved.selected);
  };
  const selectedPoint = selectedIndex === null ? null : points[selectedIndex];
  const endpointSelected =
    tab.kind === "rgb" &&
    selectedIndex !== null &&
    (selectedIndex === 0 || selectedIndex === points.length - 1);

  return (
    <div data-color-curves="true" className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-panel-hairline">
        {TABS.map((candidate) => (
          <button
            key={candidate.key}
            type="button"
            data-color-curve-tab={candidate.key}
            aria-pressed={candidate.key === tab.key}
            disabled={disabled}
            onClick={() => {
              transaction.cancel();
              setActiveKey(candidate.key);
              setSelectedIndex(null);
            }}
            className={`border-b-2 px-0.5 py-1 text-[9px] ${
              candidate.key === tab.key
                ? "border-panel-accent text-panel-text-1"
                : "border-transparent text-panel-text-4 hover:text-panel-text-2"
            }`}
          >
            {candidate.label}
          </button>
        ))}
      </div>
      <CurveGraph
        tab={tab}
        points={points}
        selectedIndex={selectedIndex}
        disabled={disabled}
        onBegin={transaction.begin}
        onPreview={previewPoints}
        onSelect={setSelectedIndex}
        onDelete={deleteSelected}
        onSettle={transaction.settle}
        onCancel={transaction.cancel}
      />
      <div className="flex min-h-7 items-end gap-2">
        {selectedPoint ? (
          <>
            <GradingNumberField
              label={tab.kind === "rgb" ? t("Input") : t("Hue")}
              ariaLabel={`Curve point ${tab.kind === "rgb" ? "input" : "hue"}`}
              value={formatPointValue(selectedPoint[0], tab, "input")}
              min={0}
              max={tab.kind === "rgb" ? 1 : 359.999}
              disabled={disabled || endpointSelected}
              labelClassName="min-w-0 flex-1"
              labelTextClassName="block text-[8px] uppercase text-panel-text-5"
              inputClassName="block w-full"
              onBegin={transaction.begin}
              onPreview={(next) => updateSelected("input", next)}
              onSettle={transaction.settle}
              onCancel={transaction.cancel}
            />
            <GradingNumberField
              label={t("Output")}
              ariaLabel="Curve point output"
              value={formatPointValue(selectedPoint[1], tab, "output")}
              min={tab.min}
              max={tab.max}
              disabled={disabled}
              labelClassName="min-w-0 flex-1"
              labelTextClassName="block text-[8px] uppercase text-panel-text-5"
              inputClassName="block w-full"
              onBegin={transaction.begin}
              onPreview={(next) => updateSelected("output", next)}
              onSettle={transaction.settle}
              onCancel={transaction.cancel}
            />
            <button
              type="button"
              disabled={disabled || endpointSelected}
              onClick={deleteSelected}
              className="pb-0.5 text-[9px] text-panel-text-4 hover:text-panel-text-1 disabled:opacity-30"
            >
              {t("Delete")}</button>
          </>
        ) : (
          <span className="flex-1 text-[9px] text-panel-text-5">
            {t("Click the graph or press Enter to add a point")}</span>
        )}
        <button
          type="button"
          aria-label={t("Reset {value0} curve", { value0: tab.label })}
          title={t("Reset {value0} curve", { value0: tab.label })}
          disabled={disabled}
          onClick={resetActive}
          className="pb-0.5 text-panel-text-4 hover:text-panel-text-1 disabled:opacity-40"
        >
          <RotateCcw size={11} />
        </button>
      </div>
    </div>
  );
}
