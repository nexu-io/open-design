// Public API of the file-viewer slice. Consumers (the FileViewer orchestrator,
// which lives outside the slice) import ONLY from here — never from the slice's
// internal files. Barrels mark boundaries: this is the slice boundary, and
// `scripts/check-web-slice-boundaries.ts` fails any outside-in deep import that
// reaches past it (ADR 0002).

// Pure inspect-override rules: hostile-payload serialization, single-prop map
// updates, source hydration, and the idempotent <style> splicer.
export {
  serializeInspectOverrides,
  updateInspectOverride,
  parseInspectOverridesFromSource,
  applyInspectOverridesToSource,
} from './rules';

// Pure geometry + CSS-length helpers for the board/inspect overlays.
export {
  rgbToHex,
  pxToNumber,
  clamp,
  isClosedLoop,
  rectContains,
  pathIntersectsRect,
  pointInPolygon,
} from './rules';

// Pure preview viewport + scale rules.
export {
  previewViewportIcon,
  previewViewportStyle,
  commentPreviewCanvasSize,
  usesStackedCommentSideDock,
  effectivePreviewScale,
  previewOverlayTransform,
  previewScaleShellStyle,
  manualEditPreviewShellStyle,
  manualEditFloatingPanelStyle,
  manualEditHoverIconStyle,
} from './rules';

// Pure deploy + share rules.
export {
  getDeployProviderOption,
  normalizeCloudflareDomainPrefixInput,
  isValidCloudflareDomainPrefixInput,
  deployResultState,
  publicShareUrlForDeployment,
  deploymentTimestamp,
  compareDeploymentsByNewest,
  shareUrlForDeployment,
  pickLatestShareDeployment,
} from './rules';

// Pure manual-edit inspector style rules.
export {
  mergeManualEditInspectorStyles,
  manualEditInspectorStyleValue,
  normalizeManualEditInspectorColor,
  manualEditPersistedValueMatchesSavedSnapshot,
  canonicalManualEditStyleValue,
  cancelManualEditPendingStyleSnapshot,
} from './rules';

// Pure markdown source-path + code-block rules.
export {
  markdownDirectory,
  normalizeMarkdownProjectPath,
  markdownRelativeProjectPath,
  decodeHtmlAttribute,
  escapeHtmlAttribute,
  markdownCodeBlockLanguage,
  decorateMarkdownCodeBlocks,
  markdownScrollRange,
  markdownScrollRatio,
  markdownScrollTopForRatio,
  mergeMarkdownSaveOptions,
  isMarkdownImageFile,
  markdownImageAlt,
  markdownImageSourceUrl,
  rewriteMarkdownImageSources,
  markdownBaseHtml,
  humanSize,
} from './rules';
export type { MarkdownSaveOptions } from './rules';

// Pure markdown editor/preview scroll-sync rules.
export {
  extractMarkdownBlockLines,
  measurePreviewBlockOffsets,
  buildScrollAnchors,
  mapScrollPosition,
} from './rules';

// Pure HTML preview asset-path rules.
export {
  baseDirFor,
  toOwnerRelativePath,
  isBlockedPreviewAssetScheme,
  hasRelativeAssetRefs,
  resolveProjectRelativePath,
  readHtmlAttr,
  escapeHtmlAttr,
} from './rules';

// Pure file-version rules.
export {
  isHtmlVersionableFile,
  fileVersionSourceClassName,
  fileVersionSourceLabel,
  fileVersionSourceToTracking,
  fileVersionPreviewOptions,
} from './rules';

// Pure comment rules.
export {
  commentActivityAt,
  commentCreatedAt,
  commentTargetIntersectsPreview,
  commentSideDropEdgeForEvent,
  reorderPreviewCommentIds,
  appendSavedPreviewCommentOrder,
} from './rules';

// Pure pod (multi-element selection) rules.
export {
  podDisplayMembers,
  podOverlayWeights,
  roundOverlayOpacity,
  buildPodSnapshot,
  pruneContainerSelections,
  summarizeSnapshot,
  selectionHitsSnapshot,
  finiteBridgeInteger,
  normalizeAnnotationStyle,
  clampBridgeCoordinate,
} from './rules';

// Pure live-artifact key rules.
export { exportReadyNudgeKey } from './rules';

// Pure comment-pin position rule.
export { activeCommentPinStyle } from './rules';

// Pure file-URL builder (structurally identical to providers/registry's
// projectFileUrl, duplicated because it is pure with no transport/DOM).
export { fileRawUrl } from './rules';

// Pure display formatters.
export {
  formatJsonFileTextForDisplay,
  formatAbsoluteDateTime,
  formatRelativeTime,
  formatDurationMs,
  formatVersionDateTime,
  formatCommentTime,
} from './formatters';

// UI-only types the orchestrator reads back.
export type {
  InspectOverrideEntry,
  InspectOverrideMap,
  StrokePoint,
  PreviewViewportId,
  PreviewCanvasSize,
  CommentPreviewCanvasOptions,
  PreviewScaleOptions,
  PreviewViewportPreset,
  PreviewOverlayTransform,
  DeployProviderOption,
  MarkdownCodeLanguage,
  TranslateFn,
  CommentSideDropEdge,
  ManualEditPendingStyleSave,
  BoardTool,
} from './types';

// Shared constants consumed by both the slice and the orchestrator.
export {
  PREVIEW_VIEWPORT_PRESETS,
  DEPLOY_PROVIDER_OPTIONS,
  MARKDOWN_CODE_BLOCK_ATTR,
  MARKDOWN_CODE_LANGUAGE_ATTR,
  MARKDOWN_COPY_BLOCK_ATTR,
  MARKDOWN_COPY_BUTTON_CLASS,
  MARKDOWN_COPY_TOAST_CLASS,
} from './constants';

// Document-kind meta-label formatter.
export { documentMetaLabel } from './formatters';

// Dumb, read-only file-kind viewers (no local state).
export { FileActions } from './components/FileActions';
export { ImageViewer } from './components/ImageViewer';
export { SketchViewer } from './components/SketchViewer';
export { VideoViewer } from './components/VideoViewer';
export { AudioViewer } from './components/AudioViewer';
export { BinaryViewer } from './components/BinaryViewer';
export { CodeWithLines } from './components/CodeWithLines';
export { JsonPanel } from './components/JsonPanel';

// Read-only file-kind viewers with feature-local hooks (fetch-on-mount).
export { DocumentPreviewViewer } from './components/DocumentPreviewViewer';
export { SvgViewer, type SvgViewerProps } from './components/SvgViewer';
export { TextViewer } from './components/TextViewer';
export type { SvgViewerMode, DocumentPreview, DocumentPreviewSection } from './types';

// Comment overlay layer (dumb) and its per-target/pin sub-pieces.
export { CommentTargetOverlay } from './components/CommentTargetOverlay';
export { CommentPreviewOverlays } from './components/CommentPreviewOverlays';

// React component (.jsx/.tsx) viewer: wired + its module-pointer fallback.
export { ReactModulePointer } from './components/ReactModulePointer';
export { ReactComponentViewer } from './components/ReactComponentViewer';

// Board inspect-panel form (dumb, small local draft state).
export { InspectPanel } from './components/InspectPanel';
export type { InspectStyleSnapshot, InspectClickedDescendant, InspectTarget } from './types';

// Comment sidebar: collapsed rail / expanded list + drag-reorder + composer,
// and its dock shell.
export { CommentSidePanel } from './components/CommentSidePanel';
export { CommentSideDock } from './components/CommentSideDock';

// Viewport-preset controls: the toolbar dropdown (wired) and the file-version
// modal's toggle group (dumb).
export { PreviewViewportControls } from './components/PreviewViewportControls';
export { FileVersionViewportControls } from './components/FileVersionViewportControls';

// Save-as-template flow: feature-local hook owning the modal's state and the
// click->result analytics correlation. The orchestrator's portal-based modal
// JSX stays put (createPortal/document are DOM globals a slice file may not
// touch) and drives it via this hook's returned controller.
export { useWiredTemplateSave } from './hooks/useTemplateSave.hooks';
export type { TemplateSaveController, TemplateSaveDeps } from './hooks/useTemplateSave.hooks';

// Copy-share-link feedback: feature-local hook owning the copied/failed pill
// state and its auto-clear timeout.
export { useWiredShareLinkCopy } from './hooks/useShareLinkCopy.hooks';
export type { ShareLinkCopyController, ShareLinkCopyDeps } from './hooks/useShareLinkCopy.hooks';

// Deploy modal per-link copy feedback: feature-local hook owning the
// copied-link pill (keyed by url) and its auto-clear timeout.
export { useWiredDeployLinkCopy } from './hooks/useDeployLinkCopy.hooks';
export type { DeployLinkCopyController } from './hooks/useDeployLinkCopy.hooks';

// File-version-history modal: fully in-slice, including its createPortal JSX.
// The portal target (`document.body`) is reached through the injected
// `PortalPort` (see `dependencies.ts`'s `portalPort`) rather than a bare
// `document` reference, so the modal can live in the slice like any other
// dumb component instead of staying pinned to the orchestrator.
export { FileVersionManagerModal } from './components/FileVersionManagerModal';
export { useWiredPreviewCanvasSize } from './hooks/usePreviewCanvasSize.hooks';

// Live-artifact viewer: the standalone preview/code/data/refresh-history tab
// surface for a project's live artifacts. Fully self-contained — no overlap
// with the HTML file-viewer's srcDoc/postMessage bridges.
export { LiveArtifactViewer } from './components/LiveArtifactViewer';
export { LiveArtifactRefreshHistoryPanel } from './components/LiveArtifactRefreshHistoryPanel';

// Shared preview-viewport preference cache, keyed per preview surface. Used
// by both the live-artifact viewer (in-slice) and the orchestrator's
// HtmlViewer (not yet extracted) so both draw from one eviction budget.
export { getCachedPreviewViewport, setCachedPreviewViewport, previewViewportStateKey } from './viewport-cache';

// HtmlViewer's toolbar chrome: mode/zoom/version-modal/menu-open state (+ the
// zoom/more-menu/present-menu outside-click dismiss effects) and the dumb
// toolbar JSX (mode tabs, zoom control, "more" overflow menu, version-history
// entry). The present menu and deploy/share menus stay in the orchestrator's
// chrome-actions portal — not part of this toolbar's own JSX subtree.
export { useWiredViewerToolbarMenus } from './hooks/useViewerToolbarMenus.hooks';
export type { ViewerToolbarMenusController } from './hooks/useViewerToolbarMenus.hooks';
export { ViewerToolbar } from './components/ViewerToolbar';
export type { ViewerToolbarProps, ViewerToolbarSlideState } from './components/ViewerToolbar';

// Markdown viewer: edit/split/preview modes, debounced autosave, pasted/
// dropped image upload, shiki-highlighted code blocks with a per-block copy
// button, and editor<->preview scroll sync. Fully self-contained — no overlap
// with the HTML file-viewer's srcDoc/postMessage bridges.
export { MarkdownViewer } from './components/MarkdownViewer';
export type { MarkdownViewerMode, MarkdownSaveState, MarkdownScrollPane } from './types';

// HtmlViewer's analytics fire-helpers: toolbar/draw-toolbar/header/present-
// popover/comment-popover click events plus the share/export click->result
// funnel and its loading-toast ticker. A leaf dependency other, not-yet-
// extracted HtmlViewer clusters call through.
export { useWiredArtifactAnalytics } from './hooks/useArtifactAnalytics.hooks';
export type {
  ArtifactAnalyticsController,
  ArtifactAnalyticsDeps,
  ArtifactHeaderClickElement,
  ArtifactShareExportFormat,
  ArtifactToolbarClickElement,
} from './hooks/useArtifactAnalytics.hooks';
export type { ArtifactExportToast, ArtifactTrackingAnalytics } from './types';

// HtmlViewer's deploy/publish flow: provider selection, credential form
// state, the Cloudflare Pages zone picker, the deploy action + pending-link
// retry, and the social-share payload/derived-label plumbing. Entirely
// HTTP-driven, no srcDoc/postMessage surface.
export { useWiredDeployFlow } from './hooks/useDeployFlow.hooks';
export type { DeployFlowController, DeployFlowDeps } from './hooks/useDeployFlow.hooks';
export type { CloudflarePagesZoneOption, DeployResultCard } from './types';
