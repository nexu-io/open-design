import { useI18n } from "../../i18n/I18n";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { FlatRow, FlatSegmentedRow, FlatSelectRow } from "./propertyPanelFlatPrimitives";
import { KeyframeNavigation } from "./KeyframeNavigation";
import { formatPxMetricValue } from "./propertyPanelHelpers";
import { resolveValueTier } from "./propertyPanelValueTier";
import { PropertyPanel3dTransform } from "./propertyPanel3dTransform";
import type { DomEditSelection } from "./domEditingTypes";
import { usePreviewReadOnly, usePreviewReadOnlyReason } from "./previewReadOnlyContext";

type KeyframeEntry = Array<{
  percentage: number;
  tweenPercentage?: number;
  properties: Record<string, number | string>;
  ease?: string;
}> | null;

interface GeometryRowsProps {
  element: DomEditSelection;
  displayX: number;
  displayY: number;
  displayW: number;
  displayH: number;
  displayR: number;
  manualOffsetEditingDisabled: boolean;
  manualSizeEditingDisabled: boolean;
  manualRotationEditingDisabled: boolean;
  commitManualOffset: (axis: "x" | "y", value: string) => void;
  commitManualSize: (dimension: "width" | "height", value: string) => void;
  commitManualRotation: (value: string) => void;
  gsapAnimId: string | null;
  navKeyframes: KeyframeEntry;
  currentPct: number;
  seekFromKfPct: (pct: number) => void;
  animIdForProp: (prop: string) => string;
  onCommitAnimatedProperty?: (
    element: DomEditSelection,
    property: string,
    value: number,
  ) => Promise<void>;
  onRemoveKeyframe?: (animId: string, pct: number) => void;
  onConvertToKeyframes?: (animId: string) => void;
}

function KeyframeGutter({
  element,
  property,
  displayValue,
  gsapAnimId,
  navKeyframes,
  currentPct,
  seekFromKfPct,
  animIdForProp,
  onCommitAnimatedProperty,
  onRemoveKeyframe,
  onConvertToKeyframes,
}: {
  property: string;
  displayValue: number;
} & Pick<
  GeometryRowsProps,
  | "element"
  | "gsapAnimId"
  | "navKeyframes"
  | "currentPct"
  | "seekFromKfPct"
  | "animIdForProp"
  | "onCommitAnimatedProperty"
  | "onRemoveKeyframe"
  | "onConvertToKeyframes"
>) {
  const track = useTrackDesignInput();
  if (!gsapAnimId) return null;
  const hasKeyframesOnProp = Boolean(navKeyframes?.some((kf) => property in kf.properties));
  return (
    <span data-flat-kf-gutter="true" style={{ opacity: hasKeyframesOnProp ? 1 : 0.3 }}>
      <KeyframeNavigation
        property={property}
        keyframes={navKeyframes}
        currentPercentage={currentPct}
        onSeek={seekFromKfPct}
        onAddKeyframe={() => {
          if (!onCommitAnimatedProperty) return;
          track("button", `Add ${property} keyframe`);
          void onCommitAnimatedProperty(element, property, displayValue);
        }}
        onRemoveKeyframe={(pct, animationId) => {
          if (!onRemoveKeyframe) return;
          track("button", `Remove ${property} keyframe`);
          onRemoveKeyframe(animationId ?? animIdForProp(property), pct);
        }}
        onConvertToKeyframes={() => {
          if (!onConvertToKeyframes) return;
          track("button", `Convert ${property} to keyframes`);
          onConvertToKeyframes(animIdForProp(property));
        }}
      />
    </span>
  );
}

export function LayoutGeometryRows({
  element,
  displayX,
  displayY,
  displayW,
  displayH,
  displayR,
  manualOffsetEditingDisabled,
  manualSizeEditingDisabled,
  manualRotationEditingDisabled,
  commitManualOffset,
  commitManualSize,
  commitManualRotation,
  gsapAnimId,
  navKeyframes,
  currentPct,
  seekFromKfPct,
  animIdForProp,
  onCommitAnimatedProperty,
  onRemoveKeyframe,
  onConvertToKeyframes,
}: GeometryRowsProps) {
  const { t } = useI18n();
  const readOnlyPreview = usePreviewReadOnly();
  const readOnlyPreviewReason = usePreviewReadOnlyReason();
  const readOnlyTooltip = readOnlyPreview ? readOnlyPreviewReason : undefined;
  const gutterProps = {
    element,
    gsapAnimId,
    navKeyframes,
    currentPct,
    seekFromKfPct,
    animIdForProp,
    onCommitAnimatedProperty,
    onRemoveKeyframe,
    onConvertToKeyframes,
  };
  return (
    <>
      <FlatRow
        label="X"
        value={formatPxMetricValue(displayX)}
        tier={displayX === 0 ? "default" : "explicitCustom"}
        disabled={manualOffsetEditingDisabled}
        tooltip={readOnlyTooltip}
        onCommit={(next) => commitManualOffset("x", next)}
        suffix={<KeyframeGutter property="x" displayValue={displayX} {...gutterProps} />}
      />
      <FlatRow
        label="Y"
        value={formatPxMetricValue(displayY)}
        tier={displayY === 0 ? "default" : "explicitCustom"}
        disabled={manualOffsetEditingDisabled}
        tooltip={readOnlyTooltip}
        onCommit={(next) => commitManualOffset("y", next)}
        suffix={<KeyframeGutter property="y" displayValue={displayY} {...gutterProps} />}
      />
      <FlatRow
        label="W"
        value={formatPxMetricValue(displayW)}
        tier="default"
        disabled={manualSizeEditingDisabled}
        tooltip={readOnlyTooltip}
        onCommit={(next) => commitManualSize("width", next)}
        suffix={<KeyframeGutter property="width" displayValue={displayW} {...gutterProps} />}
      />
      <FlatRow
        label="H"
        value={formatPxMetricValue(displayH)}
        tier="default"
        disabled={manualSizeEditingDisabled}
        tooltip={readOnlyTooltip}
        onCommit={(next) => commitManualSize("height", next)}
        suffix={<KeyframeGutter property="height" displayValue={displayH} {...gutterProps} />}
      />
      <FlatRow
        label={t("Angle")}
        value={`${displayR}°`}
        tier="default"
        disabled={manualRotationEditingDisabled}
        tooltip={readOnlyTooltip}
        onCommit={(next) => commitManualRotation(next.replace("°", ""))}
        suffix={<KeyframeGutter property="rotation" displayValue={displayR} {...gutterProps} />}
      />
    </>
  );
}

export function LayoutZIndexRow({
  styles,
  onSetStyle,
}: {
  styles: Record<string, string>;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
}) {
  const { t } = useI18n();
  const zIndex = String(parseInt(styles["z-index"] || "auto", 10) || 0);
  return (
    <FlatRow
      label={t("Z-index")}
      value={zIndex}
      tier="default"
      onCommit={(next) => void onSetStyle("z-index", next)}
    />
  );
}

export function LayoutFlexBlock({
  styles,
  onSetStyle,
  disabled,
}: {
  styles: Record<string, string>;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const isFlex = styles.display === "flex" || styles.display === "inline-flex";
  if (!isFlex) return null;
  const direction = styles["flex-direction"] || "row";
  return (
    <div className="border-l-2 border-panel-border-input py-0.5 pl-[10px]">
      <div className="mb-[3px] text-[9px] font-semibold uppercase tracking-[0.12em] text-panel-text-5">
        {t("Flex")}</div>
      <FlatSegmentedRow
        label={t("Direction")}
        options={[
          { key: "row", node: "→ Row", label: "Row", active: direction === "row" },
          { key: "column", node: "Column", label: "Column", active: direction === "column" },
        ]}
        disabled={disabled}
        onChange={(next) => void onSetStyle("flex-direction", next)}
      />
      <FlatSelectRow
        label={t("Justify")}
        value={styles["justify-content"] || "flex-start"}
        tier={resolveValueTier(styles["justify-content"], "flex-start")}
        disabled={disabled}
        options={[
          "flex-start",
          "center",
          "space-between",
          "space-around",
          "space-evenly",
          "flex-end",
        ]}
        onChange={(next) => void onSetStyle("justify-content", next)}
      />
      <FlatSelectRow
        label={t("Align")}
        value={styles["align-items"] || "stretch"}
        tier={resolveValueTier(styles["align-items"], "stretch")}
        disabled={disabled}
        options={["stretch", "flex-start", "center", "flex-end", "baseline"]}
        onChange={(next) => void onSetStyle("align-items", next)}
      />
      <FlatRow
        label={t("Gap")}
        value={styles.gap ?? "0px"}
        tier={resolveValueTier(styles.gap, "0px")}
        disabled={disabled}
        onCommit={(next) => void onSetStyle("gap", next.endsWith("px") ? next : `${next}px`)}
      />
    </div>
  );
}

export function LayoutTransform3DBlock({
  gsapRuntimeValues,
  gsapAnimId,
  resolveAnimIdForProp,
  gsapKeyframes,
  currentPct,
  elStart,
  elDuration,
  element,
  onCommitAnimatedProperty,
  onCommitAnimatedProperties,
  onSeekToTime,
  onRemoveKeyframe,
  onConvertToKeyframes,
  onLivePreviewProps,
}: {
  gsapRuntimeValues: Record<string, number>;
  gsapAnimId: string | null;
  resolveAnimIdForProp?: (prop: string) => string | null;
  gsapKeyframes: Array<{
    percentage: number;
    properties: Record<string, number | string>;
    ease?: string;
  }> | null;
  currentPct: number;
  elStart: number;
  elDuration: number;
  element: DomEditSelection;
  onCommitAnimatedProperty?: (
    element: DomEditSelection,
    property: string,
    value: number,
  ) => Promise<void>;
  onCommitAnimatedProperties?: (
    element: DomEditSelection,
    props: Record<string, number | string>,
  ) => Promise<void>;
  onSeekToTime?: (time: number) => void;
  onRemoveKeyframe?: (animId: string, pct: number) => void;
  onConvertToKeyframes?: (animId: string, duration?: number) => void;
  onLivePreviewProps?: (element: DomEditSelection, props: Record<string, number>) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="border-t border-panel-hairline pt-2.5">
      <div className="mb-[3px] text-[9px] font-semibold uppercase tracking-[0.12em] text-panel-text-5">
        {t("3D Transform")}</div>
      <PropertyPanel3dTransform
        gsapRuntimeValues={gsapRuntimeValues}
        gsapAnimId={gsapAnimId}
        resolveAnimIdForProp={resolveAnimIdForProp}
        gsapKeyframes={gsapKeyframes}
        currentPct={currentPct}
        elStart={elStart}
        elDuration={elDuration}
        element={element}
        onCommitAnimatedProperty={onCommitAnimatedProperty}
        onCommitAnimatedProperties={onCommitAnimatedProperties}
        onSeekToTime={onSeekToTime}
        onRemoveKeyframe={onRemoveKeyframe}
        onConvertToKeyframes={onConvertToKeyframes}
        onLivePreviewProps={onLivePreviewProps}
      />
    </div>
  );
}

interface FlatLayoutSectionProps
  extends
    Omit<GeometryRowsProps, never>,
    Pick<
      Parameters<typeof LayoutTransform3DBlock>[0],
      | "gsapRuntimeValues"
      | "resolveAnimIdForProp"
      | "gsapKeyframes"
      | "elStart"
      | "elDuration"
      | "onCommitAnimatedProperties"
      | "onSeekToTime"
      | "onLivePreviewProps"
    > {
  element: DomEditSelection;
  styles: Record<string, string>;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
  disabled: boolean;
}

export function FlatLayoutSection({
  element,
  styles,
  onSetStyle,
  disabled,
  gsapRuntimeValues,
  resolveAnimIdForProp,
  gsapKeyframes,
  elStart,
  elDuration,
  onCommitAnimatedProperties,
  onSeekToTime,
  onLivePreviewProps,
  ...geometry
}: FlatLayoutSectionProps) {
  return (
    <div className="space-y-1.5">
      <LayoutGeometryRows element={element} {...geometry} />
      <LayoutZIndexRow styles={styles} onSetStyle={onSetStyle} />
      <LayoutFlexBlock styles={styles} onSetStyle={onSetStyle} disabled={disabled} />
      <LayoutTransform3DBlock
        gsapRuntimeValues={gsapRuntimeValues}
        gsapAnimId={geometry.gsapAnimId}
        resolveAnimIdForProp={resolveAnimIdForProp}
        gsapKeyframes={gsapKeyframes}
        currentPct={geometry.currentPct}
        elStart={elStart}
        elDuration={elDuration}
        element={element}
        onCommitAnimatedProperty={geometry.onCommitAnimatedProperty}
        onCommitAnimatedProperties={onCommitAnimatedProperties}
        onSeekToTime={onSeekToTime}
        onRemoveKeyframe={geometry.onRemoveKeyframe}
        onConvertToKeyframes={geometry.onConvertToKeyframes}
        onLivePreviewProps={onLivePreviewProps}
      />
    </div>
  );
}
