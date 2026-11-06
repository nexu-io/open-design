import type { resolveEditingSections } from "@hyperframes/core/editing";
import type { DomEditSelection } from "./domEditing";
import type { PropertyPanelProps } from "./propertyPanelHelpers";
import type { FlatLayoutSection } from "./propertyPanelFlatLayoutSection";

export type PropertyPanelFlatProps = Pick<
  PropertyPanelProps,
  | "projectId"
  | "projectDir"
  | "assets"
  | "previewIframeRef"
  | "onClearSelection"
  | "onUngroup"
  | "onSetStyle"
  | "onPreviewStyle"
  | "onSetAttribute"
  | "onSetAttributes"
  | "onSetAttributeLive"
  | "onSetAttributeQuiet"
  | "onApplyColorGradingScope"
  | "onSetHtmlAttribute"
  | "onSetAttributeBatch"
  | "onRemoveBackground"
  | "onSetText"
  | "onSetTextFieldStyle"
  | "onPreviewTextFieldStyle"
  | "onAddTextField"
  | "onRemoveTextField"
  | "onAskAgent"
  | "onToggleElementHidden"
  | "onAutoGroupCarveSources"
  | "onImportAssets"
  | "onAddMediaOverlay"
  | "onImportFonts"
  | "fontAssets"
  | "gsapAnimations"
  | "gsapMultipleTimelines"
  | "gsapUnsupportedTimelinePattern"
  | "onUpdateGsapProperty"
  | "onUpdateGsapMeta"
  | "onDeleteGsapAnimation"
  | "onAddGsapProperty"
  | "onRemoveGsapProperty"
  | "onUpdateGsapFromProperty"
  | "onAddGsapFromProperty"
  | "onRemoveGsapFromProperty"
  | "onAddGsapAnimation"
  | "onSetArcPath"
  | "onUpdateArcSegment"
  | "onUnroll"
  | "onUpdateKeyframeEase"
  | "onSetAllKeyframeEases"
  | "onUpdateSegmentEase"
  | "recordingState"
  | "recordingDuration"
  | "onToggleRecording"
> &
  Pick<
    Parameters<typeof FlatLayoutSection>[0],
    | "displayX"
    | "displayY"
    | "displayW"
    | "displayH"
    | "displayR"
    | "manualOffsetEditingDisabled"
    | "manualSizeEditingDisabled"
    | "manualRotationEditingDisabled"
    | "commitManualOffset"
    | "commitManualSize"
    | "commitManualRotation"
    | "gsapAnimId"
    | "navKeyframes"
    | "animIdForProp"
    | "gsapRuntimeValues"
    | "elStart"
    | "elDuration"
    | "onCommitAnimatedProperty"
    | "onCommitAnimatedProperties"
    | "onSeekToTime"
    | "onRemoveKeyframe"
    | "onConvertToKeyframes"
  > & {
    element: DomEditSelection;
    styles: Record<string, string>;
    sections: ReturnType<typeof resolveEditingSections>;
    sourceLabel: string;
    gsapBorderRadius: { tl: number; tr: number; br: number; bl: number } | null;
    showEditableSections: boolean;
    selectedElementHidden: boolean;
    selectedElementId: string | null;
    clipboardCopied: boolean;
    onCopyElementInfo: () => void;
    currentTime: number;
  };
