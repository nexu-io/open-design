// UI primitives
export * from "./ui";
export { I18nProvider, useI18n, translate } from './i18n/I18n';
export type { Locale, Translate } from './i18n/I18n';

// NLE Layout
export { EditorShell } from "./components/EditorShell";
export type { EditorShellProps } from "./components/EditorShell";
export { NLEPreview } from "./components/nle/NLEPreview";
export {
  DEFAULT_SHORTCUT_SECTIONS,
  DEFAULT_STUDIO_KEYS,
  buildShortcutSections,
  getStudioKeys,
  setStudioKeys,
  studioKeyClash,
  useStudioKeys,
} from "./player/components/studioShortcuts";
export { formatCombo, matchCombo, parseCombo } from "./player/components/studioCombo";
export type { Combo } from "./player/components/studioCombo";
export type { StudioKeyAction, StudioKeys } from "./player/components/studioShortcuts";
export { ShortcutsButton } from "./player/components/ShortcutsPanel";
export { dispatchLinkShortcut } from "./hooks/linkShortcuts";
export type { LinkShortcutCallbacks } from "./hooks/linkShortcuts";
export type { ShortcutsButtonProps } from "./player/components/ShortcutsPanel";
export type { ShortcutHint, ShortcutSection } from "./player/components/studioShortcuts";
export { CompositionBreadcrumb } from "./components/nle/CompositionBreadcrumb";
export type { CompositionLevel } from "./components/nle/CompositionBreadcrumb";
export { useCompositionStack } from "./components/nle/useCompositionStack";
export { Dock } from "./components/dock/Dock";
export { useDockLayoutStore } from "./components/dock/dockLayoutStore";
export type { DockController } from "./components/dock/dockLayoutStore";
export type { PanelId } from "./components/dock/panelRegistry";

// Player (preview, timeline, playback controls)
export {
  Player,
  PlayerControls,
  Timeline,
  VideoThumbnail,
  CompositionThumbnail,
  useTimelinePlayer,
  usePlayerHandle,
  resolveIframe,
  usePlayerStore,
  liveTime,
  formatTime,
} from "./player";
export { usePreviewIframeStore } from "./player/store/previewIframeStore";
export { PREVIEW_QUALITY_LEVELS, type PreviewQuality } from "@hyperframes/core/preview-quality";
export type {
  PlaybackHealth,
  PreviewCopies,
  PreviewFacts,
  PreviewQualityChosenBy,
} from "./player/store/previewQualitySlice";
export {
  openAudioGainDialog,
  useAudioGainDialogStore,
} from "./player/components/audioGainDialogStore";
export type {
  PlayerHandle,
  PlayerHandleElement,
  PlayerHandleListener,
  PlayerHandleTimeListener,
  TimelineElement,
  TimelineTimeRange,
} from "./player";
export {
  TimelineFrame,
  TimelineLanes,
  TimelineOverlays,
  TimelinePlayhead,
  TimelineRazorGuide,
  TimelineRuler,
  TimelineEmptyStatePart,
  TimelineEditPopover,
  TimelineClipMenu,
  TimelineGapMenu,
  TimelineKeyframeMenu,
  TimelineShortcutHint,
} from "./player/components/TimelineParts";
export { TimelineProvider, useTimelineContext } from "./player/components/TimelineProvider";
export type { TimelineTheme } from "./player/components/timelineTheme";
export { TRACK_H } from "./player/components/timelineLayout";
export { currentTimelineRange, zoomTimelineToRange } from "./player/components/timelineZoomInput";
export type { TimelineTrackPadding } from "./player/components/timelineLayout";
export { displayTrackOrder } from "./player/components/useTimelineTrackDerivations";
export { fadeHandleBoxes } from "./player/components/timelineClipFadeGeometry";
export type {
  FadeEdge,
  FadeHandleBox,
  FadeHandleClipBox,
} from "./player/components/timelineClipFadeGeometry";

// Clip content thumbnails: used by a host rendering its own timeline lane.
export { AudioWaveform } from "./player/components/AudioWaveform";
export type { AudioWaveformProps } from "./player/components/AudioWaveform";
export { ImageThumbnail } from "./player/components/ImageThumbnail";
export type { ImageThumbnailProps } from "./player/components/ImageThumbnail";
export { useRenderClipContent } from "./hooks/useRenderClipContent";
export { useThumbnailStill } from "./hooks/useThumbnailStill";
export type { ThumbnailStill, UseThumbnailStillOptions } from "./hooks/useThumbnailStill";
export type { UseRenderClipContentOptions } from "./hooks/useRenderClipContent";
export type { ThumbnailPriority } from "./player/lib/thumbnailScheduler";
export type {
  TimelineClipMenuItem,
  TimelineClipRenderContext,
} from "./player/components/TimelineTypes";

// Host overlays: draw over the preview in composition coordinates (see EditorShellProps.gestureOverlay)
export { usePreviewCompositionRect } from "./components/editor/usePreviewCompositionRect";
export type { PreviewCompositionRect } from "./components/editor/usePreviewCompositionRect";
export {
  PreviewOverlayProvider,
  usePreviewOverlayContext,
} from "./components/editor/PreviewOverlayProvider";
export type {
  PreviewOverlayProviderProps,
  PreviewSnapPreferences,
} from "./components/editor/PreviewOverlayProvider";
export { PreviewGuides } from "./components/editor/PreviewGuides";
export { GridOverlay } from "./components/editor/GridOverlay";
export { SnapToolbar } from "./components/editor/SnapToolbar";
export { usePreviewGuidesStore } from "./components/editor/previewGuidesStore";

// Editor
export { SourceEditor } from "./components/editor/SourceEditor";
export { PropertyPanel } from "./components/editor/PropertyPanel";
export { FileTree } from "./components/editor/FileTree";

// App
export { StudioApp } from "./App";

// Ask-agent flow
export { AskAgentModal } from "./components/AskAgentModal";
export type { AskAgentModalProps } from "./components/AskAgentModal";
export type { AgentModalAnchorPoint } from "./utils/studioHelpers";
export {
  buildPickerAgentPrompt,
  buildPickerAgentContextPreview,
} from "./components/editor/domEditingAgentPrompt";
export type { AgentPromptElementInfo } from "./components/editor/domEditingAgentPrompt";

// Render queue
export { RenderQueue } from "./components/renders/RenderQueue";
export type { RenderQueueProps, CompositionDimensions } from "./components/renders/RenderQueue";
export { useRenderQueue } from "./components/renders/useRenderQueue";
export type { FfmpegStatus } from "./components/renders/useFfmpegStatus";
export type {
  RenderJob,
  ResolutionPreset,
  StartRenderOptions,
} from "./components/renders/useRenderQueue";
export {
  getPersistedRenderSettings,
  persistRenderSettings,
} from "./components/renders/renderSettings";
export type { PersistedRenderSettings } from "./components/renders/renderSettings";

// Hooks
export { useElementPicker } from "./hooks/useElementPicker";
export type { PickedElement } from "./hooks/useElementPicker";

// Utilities
export { resolveSourceFile, applyPatch } from "./utils/sourcePatcher";
export type { PatchOperation } from "./utils/sourcePatcher";
export { parseStyleString, mergeStyleIntoTag, findElementBlock } from "./utils/htmlEditor";

// Timeline editing: Studio's own hand-edit path, undo/redo, the
// etag-guarded writer and the conflict banner, for a host mounting the
// timeline outside EditorShell.
export { usePersistentEditHistory } from "./hooks/usePersistentEditHistory";
export type { UsePersistentEditHistoryOptions } from "./hooks/usePersistentEditHistory";
export { useTimelineEditing } from "./hooks/useTimelineEditing";
export type {
  TimelineZIndexReorderCommit,
  UseTimelineEditingOptions,
} from "./hooks/useTimelineEditingTypes";
// A host's own waitForPendingDomEditSaves must also call this, or undo/redo
// can race a write still in flight (see useTrackPendingTimelineEdit.ts).
export { flushStudioPendingEdits } from "./utils/studioPendingEdits";
export { revertNewestStudioPendingEdit } from "./utils/studioPendingEdits";
export { cancelNewestStudioWaitingPress } from "./utils/studioPendingEdits";
export type { StudioPendingEditsDrainResult } from "./utils/studioPendingEdits";
export type {
  CanEditTimelineElement,
  TimelineEditPermission,
  TimelineEditOutcome,
} from "./hooks/timelineEditPermission";
export { useEditHistoryActions } from "./hooks/useEditHistoryActions";
export type {
  EditHistoryHandle,
  UseEditHistoryActionsOptions,
} from "./hooks/useEditHistoryActions";
export { useProjectFileWriter } from "./hooks/useProjectFileWriter";
export type { UseProjectFileWriterOptions } from "./hooks/useProjectFileWriter";
// A host's writeProjectFile throws this on a 409; catch it to know when
// to show ExternalFileConflictBanner.
export { StudioFileConflictError } from "./utils/studioSaveDiagnostics";
export { ExternalFileConflictBanner } from "./components/ExternalFileConflictBanner";
export type {
  ExternalFileChangeCoordinatorHandle,
  ExternalFileChangeBlockedState,
} from "./hooks/useExternalFileChangeCoordinator";
export { TimelinePane } from "./components/nle/TimelinePane";
export type { TimelinePaneProps } from "./components/nle/TimelinePane";
export { TimelineEditProvider } from "./contexts/TimelineEditContext";
export type { TimelineEditCallbacks } from "./player/components/timelineCallbacks";
export type { BlockedTimelineEditIntent } from "./player/components/timelineEditing";
export { TimelineToolbar } from "./components/TimelineToolbar";
export type { TimelineToolbarProps } from "./components/TimelineToolbar";
export { TimelineHistoryButtons } from "./components/TimelineHistoryButtons";
export type { TimelineHistoryButtonsProps } from "./components/TimelineHistoryButtons";
export { AudioMeterStrip } from "./components/nle/AudioMeterStrip";
export type { AudioMeterStripProps } from "./components/nle/AudioMeterStrip";
export { useAudioMetersVisible } from "./utils/audioMeterVisibility";
export { useClipboard } from "./hooks/useClipboard";
export type { UseClipboardOptions } from "./hooks/useClipboard";

// DOM editing for a host outside EditorShell; the Commit hooks save without useDomEditSession.
export { useDomEditSession } from "./hooks/useDomEditSession";
export type { UseDomEditSessionParams } from "./hooks/useDomEditSession";
export { useLivePreviewIframe } from "./hooks/useLivePreviewIframe";
export { announcePreviewDocumentLoaded } from "./player/sceneSwap";
export type { PreviewPromotion } from "./player/sceneSwap";
export { usePreviewPersistence } from "./hooks/usePreviewPersistence";
export type { UsePreviewPersistenceParams } from "./hooks/usePreviewPersistence";
export { DomEditProvider, useDomEditSelectionContext } from "./contexts/DomEditContext";
export { PreviewReadOnlyProvider } from "./components/editor/previewReadOnlyContext";
export { ConnectedDomEditOverlay } from "./components/editor/ConnectedDomEditOverlay";
export { LayersPanel } from "./components/editor/LayersPanel";
export type { LayersPanelHost } from "./components/editor/LayersPanel";
export type { ConnectedDomEditOverlayProps } from "./components/editor/ConnectedDomEditOverlay";
export { useDomEditZOrder } from "./components/editor/useDomEditZOrder";
export type { DomEditZOrder } from "./components/editor/useDomEditZOrder";
export type { ZOrderAction } from "./components/editor/canvasContextMenuZOrder";
export type { DomEditCapabilities, DomEditSelection } from "./components/editor/domEditingTypes";
export { useDomStyleCommit } from "./hooks/useDomStyleCommit";
export { ColorField } from "./components/editor/propertyPanelColor";
export { GradientField } from "./components/editor/propertyPanelFill";
export type { UseDomStyleCommitOptions } from "./hooks/useDomStyleCommit";
export type { DomEditCommitDeclineReason, DomEditCommitOutcome } from "./hooks/domEditCommitRunner";
export { resolveDomEditSelection } from "./components/editor/domEditingLayers";
export { useDomGeometryCommit } from "./hooks/useDomGeometryCommit";
export type { DomGeometryCommits, UseDomGeometryCommitOptions } from "./hooks/useDomGeometryCommit";
export { DomEditOverlay } from "./components/editor/DomEditOverlay";
export type {
  DomEditGroupPathOffsetCommit,
  DomEditOverlayProps,
} from "./components/editor/DomEditOverlay";

export {
  playSeamTransitionLoop,
  type SeamTransitionFrameSource,
  type SeamTransitionLoopHandle,
  type SeamTransitionLoopOptions,
} from "@hyperframes/shader-transitions";

// Editor gestures for a host's own preview overlay: snapping and the marquee
export {
  SNAP_THRESHOLD_PX,
  snapEngagedForTravel,
  extractSnapTargets,
  buildCompositionSnapTarget,
  buildGridSnapEdges,
  resolveSnapAdjustment,
  resolveGuideLineRect,
  resolveEquidistanceGuides,
} from "./components/editor/snapEngine";
export type {
  SnapEdge,
  SnapTarget,
  SnapGuide,
  SpacingGuide,
  SnapResult,
  Rect as SnapRect,
} from "./components/editor/snapEngine";
export { collectSnapContext } from "./components/editor/snapTargetCollection";
export type { SnapContext } from "./components/editor/snapTargetCollection";
export { SnapGuideOverlay } from "./components/editor/SnapGuideOverlay";
export type { SnapGuideOverlayProps, SnapGuidesState } from "./components/editor/SnapGuideOverlay";
export { useMarqueeGestures } from "./components/editor/marqueeCommit";
export type { MarqueeGestures, MarqueeGesturesDeps } from "./components/editor/marqueeCommit";
export { MarqueeOverlay } from "./components/editor/MarqueeOverlay";
export type { MarqueeOverlayProps } from "./components/editor/MarqueeOverlay";
export type { Rect as MarqueeRect } from "./utils/marqueeGeometry";

export { buildStudioTools } from "./webmcp/useStudioAgentTools";
export type { StudioAgentToolsDeps } from "./webmcp/useStudioAgentTools";
export { collectStudioLookScene } from "./webmcp/tools/lookTools";
export type { StudioLookSnapshot } from "./webmcp/tools/lookTools";
export type { ModelContextTool } from "./webmcp/types";
export type { ToolResult } from "./webmcp/toolResult";
