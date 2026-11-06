import type { RefObject } from "react";
import type { ArcPathSegment, GsapAnimation } from "@hyperframes/parsers/gsap-parser";
import type { DomEditSelection } from "./domEditing";
import type { ImportedFontAsset } from "./fontAssets";
import type { GsapAnimationEditCallbacks } from "./gsapAnimationCallbacks";
import type { CommitDomAttributeBatch } from "../../hooks/domEditCommitTypes";

export interface BackgroundRemovalProgress {
  status: "processing" | "complete" | "failed";
  progress: number;
  stage?: string;
  outputPath?: string;
  backgroundOutputPath?: string;
  error?: string;
  provider?: string;
}

export interface BackgroundRemovalResult {
  outputPath: string;
  backgroundOutputPath?: string;
  provider?: string;
}

export interface MediaOverlayPlacement {
  start: number;
  duration?: number;
  track?: number;
  compositionPath?: string;
}

export type AddMediaOverlayHandler = (
  blockName: string,
  placement: MediaOverlayPlacement,
) => Promise<void>;

export interface PropertyPanelProps {
  projectId: string;
  projectDir: string | null;
  assets: string[];
  element: DomEditSelection | null;
  multiSelectCount?: number;
  multiSelectedElements?: DomEditSelection[];
  onGroupSelection?: () => void;
  onHideAllSelected?: () => void;
  copiedAgentPrompt: boolean;
  onClearSelection: () => void;
  onUngroup?: () => void;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
  onPreviewStyle?: (prop: string, value: string) => void;
  onSetAttribute: (attr: string, value: string) => void | Promise<void>;
  /** Commits several data-* attributes on the SAME element in ONE atomic
   *  persist call — e.g. a pinned timing range's start+duration together, so
   *  a selection change or a partial failure mid-commit can't misdirect one
   *  of the two writes or leave them half-applied. Falls back to sequential
   *  `onSetAttribute` calls where omitted. */
  onSetAttributes?: (selection: DomEditSelection, attrs: Record<string, string>) => Promise<void>;
  onSetAttributeLive: (
    attr: string,
    value: string | null,
    onSettled?: (ok: boolean) => void,
  ) => void | Promise<void>;
  /** Persists without reloading the preview, but re-reads the selection after —
   *  for attributes the runtime applies to the live graph itself, where a reload
   *  would only interrupt playback, and where the panel still has to see the
   *  value it just wrote to compute the next edit from. */
  onSetAttributeQuiet?: (attr: string, value: string | null) => void | Promise<void>;
  onApplyColorGradingScope?: (
    scope: "source-file" | "project",
    value: string | null,
  ) => Promise<{ changedFiles: number; changedElements: number }>;
  onSetHtmlAttribute: (attr: string, value: string | null) => void | Promise<void>;
  onSetAttributeBatch: CommitDomAttributeBatch;
  onRemoveBackground?: (
    inputPath: string,
    options: {
      createBackgroundPlate?: boolean;
      quality?: "fast" | "balanced" | "best";
      onProgress?: (progress: BackgroundRemovalProgress) => void;
    },
  ) => Promise<BackgroundRemovalResult>;
  onSetManualOffset: (
    element: DomEditSelection,
    next: { x: number; y: number },
    route?: { plainTranslate: boolean },
  ) => void | Promise<void | import("../../utils/previewFeatureUsage").GeometryCommitResult>;
  onSetManualSize: (
    element: DomEditSelection,
    next: { width: number; height: number },
  ) => void | Promise<void | import("../../utils/previewFeatureUsage").GeometryCommitResult>;
  onSetManualRotation: (
    element: DomEditSelection,
    next: { angle: number },
  ) => void | Promise<void | import("../../utils/previewFeatureUsage").GeometryCommitResult>;
  onSetText: (value: string, fieldKey?: string) => void;
  onSetTextFieldStyle: (fieldKey: string, property: string, value: string) => void;
  onPreviewTextFieldStyle?: (fieldKey: string, property: string, value: string) => void;
  onAddTextField: (afterFieldKey?: string) => string | Promise<string | null> | null;
  onRemoveTextField: (fieldKey: string) => void;
  onAskAgent: () => void;
  onToggleElementHidden?: (elementKey: string, hidden: boolean) => void | Promise<void>;
  /** B6: group two or more picked voice clips, atomically, one undo entry. */
  onAutoGroupCarveSources?: (clipIds: readonly string[], groupId: string) => Promise<void>;
  onImportAssets?: (files: FileList, dir?: string) => Promise<string[]>;
  onAddMediaOverlay?: AddMediaOverlayHandler;
  fontAssets?: ImportedFontAsset[];
  onImportFonts?: (files: FileList | File[]) => Promise<ImportedFontAsset[]>;
  previewIframeRef?: RefObject<HTMLIFrameElement | null>;
  gsapAnimations?: GsapAnimation[];
  gsapMultipleTimelines?: boolean;
  gsapUnsupportedTimelinePattern?: boolean;
  onUpdateGsapProperty?: (animId: string, prop: string, value: number | string) => void;
  onUpdateGsapMeta?: (
    animId: string,
    updates: { duration?: number; ease?: string; position?: number },
  ) => void;
  onDeleteGsapAnimation?: (animId: string) => void;
  onAddGsapProperty?: (animId: string, prop: string) => void;
  onRemoveGsapProperty?: (animId: string, prop: string) => void;
  onUpdateGsapFromProperty?: (animId: string, prop: string, value: number | string) => void;
  onAddGsapFromProperty?: (animId: string, prop: string) => void;
  onRemoveGsapFromProperty?: (animId: string, prop: string) => void;
  onAddGsapAnimation?: (method: "to" | "from" | "set" | "fromTo") => void;
  onSetArcPath?: (
    animId: string,
    config: {
      enabled: boolean;
      autoRotate?: boolean | number;
      segments?: ArcPathSegment[];
    },
  ) => void;
  onUpdateArcSegment?: (
    animId: string,
    segmentIndex: number,
    update: Partial<ArcPathSegment>,
  ) => void;
  onUnroll?: (animationId: string) => void;
  onAddKeyframe?: (
    animationId: string,
    percentage: number,
    property: string,
    value: number | string,
  ) => void;
  onRemoveKeyframe?: (animationId: string, percentage: number) => void;
  onUpdateKeyframeEase?: (animationId: string, percentage: number, ease: string) => void;
  onUpdateSegmentEase?: NonNullable<GsapAnimationEditCallbacks["onUpdateSegmentEase"]>;
  onSetAllKeyframeEases?: (animationId: string, ease: string) => void;
  onConvertToKeyframes?: (animationId: string, duration?: number) => void;
  onCommitAnimatedProperty?: (
    selection: DomEditSelection,
    property: string,
    value: number | string,
  ) => Promise<void>;
  onCommitAnimatedProperties?: (
    selection: DomEditSelection,
    props: Record<string, number | string>,
  ) => Promise<void>;
  onSeekToTime?: (time: number) => void;
  recordingState?: "idle" | "recording" | "preview";
  recordingDuration?: number;
  onToggleRecording?: () => void;
}
