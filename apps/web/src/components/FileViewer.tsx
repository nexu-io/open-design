import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type CSSProperties, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Button, Input, Select } from '@open-design/components';
import { CenteredLoader } from './Loading';
import { APP_CHROME_FILE_ACTIONS_ID, APP_CHROME_FILE_ACTIONS_SELECTOR } from './AppChromeHeader';
import {
  commentSendCompleted,
  commentSendSucceeded,
  type CommentSendResult,
} from './comment-send-result';
import {
  buildSocialSharePayload,
  OPEN_DESIGN_GITHUB_REPO_URL,
  workspaceContextHasTeamIdentity,
  type CollabCloudMemberDirectoryEntry,
  type CollabMemberRole,
  type AgentInfo,
  type ProjectFileVersion,
  type SocialShareRequest,
  type SocialShareResponse,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  appendResourceQuery,
  workspaceIdentityCacheKey,
  workspaceProjectHeaders,
} from '../collab/workspace-identity';
import {
  anonymizeArtifactId,
  artifactKindToTracking,
  type ArtifactPublishResultProps,
  type TrackingFileVersionSource,
  type TrackingArtifactKind,
  type TrackingProjectKind,
  type TrackingDeployProvider,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import { exportErrorCode } from '../analytics/export-error-code';
import { deployErrorCode } from '../analytics/deploy-error-code';
import { publishErrorCode } from '../analytics/publish-error-code';
import {
  reportPreviewIframeMessage,
  subscribePreviewIframeMessages,
  trackIframeLoad,
} from '../observability/iframe-error';
import {
  trackArtifactExportResult,
  trackArtifactDeployResult,
  trackArtifactPublishResult,
  trackArtifactHeaderClick,
  trackArtifactToolbarClick,
  trackCommentPopoverClick,
  trackDrawToolbarClick,
  trackFileVersionModalClick,
  trackFileVersionModalSurfaceView,
  trackFileVersionRestoreResult,
  trackPageView,
  trackPresentPopoverClick,
  trackDeckViewerSurfaceView,
  trackDeckViewerClick,
  trackSpeakerNotesSaveResult,
  trackShareOptionPopoverClick,
} from '../analytics/events';
import { recordFirstLoopStep } from '../onboarding/first-loop';
import { MarkdownRenderer, artifactRendererRegistry } from '../artifacts/renderer-registry';
import { renderMarkdownToSafeHtml } from '../artifacts/markdown';
import {
  artifactExportOriginProps,
  matchingArtifactVersionId,
  type ArtifactExportOriginProps,
} from '../artifacts/version-origin';
import {
  buildScrollAnchors,
  extractMarkdownBlockLines,
  mapScrollPosition,
  measureEditorBlockOffsets,
  measurePreviewBlockOffsets,
} from './markdown-scroll-sync';
import { useT, useI18n } from '../i18n';
import { useDismissOnOutsideInteraction } from '../hooks/useDismissOnOutsideInteraction';
import {
  notifyTeamProjectsChanged,
  TEAM_PROJECTS_CHANGED_EVENT,
} from '../collab/useWorkspaceContext';
import {
  canPublishPublicFile,
  publicFilePublishFailureKey,
  type PublicFilePublishFailureKey,
} from '../collab/public-file-publish';
import { moveWorkspaceProject } from '../state/projects';
import { MoveToTeamConfirmDialog, moveConfirmSkipped } from './MoveToTeamConfirmDialog';
import type { Dict, Locale } from '../i18n/types';
import {
  fetchLiveArtifact,
  fetchLiveArtifactCode,
  fetchLiveArtifactRefreshes,
  checkDeploymentLink,
  CLOUDFLARE_PAGES_PROVIDER_ID,
  createSocialSharePayload,
  DEFAULT_DEPLOY_PROVIDER_ID,
  deployProjectFile,
  fetchCloudflarePagesZones,
  fetchDeployConfig,
  fetchProjectDeployments,
  fetchProjectFileVersion,
  fetchProjectFileVersions,
  fetchProjectFilePreview,
  fetchProjectPreviewBaseHref,
  fetchProjectFiles,
  fetchProjectFilePublicPublication,
  fetchProjectFileText,
  fetchProjectFileTextPreview,
  uploadProjectFiles,
  liveArtifactPreviewUrl,
  projectFileUrl,
  projectRawUrl,
  publishProjectFilePublic,
  unpublishProjectFilePublic,
  LiveArtifactRefreshError,
  refreshLiveArtifact,
  restoreProjectFileVersion,
  updateDeployConfig,
  type WebDeployConfigResponse,
  type WebCloudflarePagesDeploySelection,
  type WebDeploymentInfo,
  type WebDeployProjectFileResponse,
  type WebDeployProviderId,
  type WebUpdateDeployConfigRequest,
  writeProjectTextFile,
  writeProjectTextFileDetailed,
} from '../providers/registry';
import type { ProjectFilePreview } from '../providers/registry';
import {
  downloadImageDataUrl,
  exportAsHtml,
  exportAsJsx,
  exportAsMd,
  exportAsPdf,
  exportAsZip,
  exportProjectAsHtml,
  exportProjectAsPdf,
  exportProjectAsPptx,
  exportProjectAsZip,
  exportProjectImageDataUrl,
  exportProjectScreenshotPdf,
  exportSnapshotAsPdf,
  exportReactComponentAsHtml,
  exportReactComponentAsZip,
  captureHostIframeSnapshot,
  imageDataUrlToBlob,
  isOpenDesignHostAvailable,
  openSandboxedPreviewInNewTab,
  prepareImageExportTarget,
  planDeckImageCapture,
  requestPreviewSnapshot,
  sourceLooksLikeExportableDeck,
  type ExportProgress,
  type ImageExportFormat,
} from '../runtime/exports';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { buildReactComponentSrcdoc } from '../runtime/react-component';
import { shouldConsumeSlideNav } from '../runtime/slide-nav';
import { findHtmlEntriesReferencing } from '../runtime/jsx-module-refs';
import {
  buildLazySrcdocTransport,
  buildRedirectLoopBlockedDoc,
  buildSrcdoc,
  canActivateSrcDocTransport,
  htmlHasAuthoredBase,
  PREVIEW_REDIRECT_LOOP_MESSAGE,
} from '../runtime/srcdoc';
import { DeckThumbnailRail } from './DeckThumbnailRail';
import { parseDeckThumbnails } from '../runtime/deck-thumbnail-parser';
import {
  buildSpeakerNotesPresenterHtml,
  extractSpeakerNotesFromHtml,
  normalizeSpeakerNotes,
  PRESENTER_WINDOW_INITIAL_HEIGHT,
  PRESENTER_WINDOW_INITIAL_WIDTH,
  PRESENTER_WINDOW_MIN_HEIGHT,
  PRESENTER_WINDOW_MIN_WIDTH,
  removeSpeakerNotesFromHtml,
  upsertSpeakerNotesInHtml,
} from '../runtime/speaker-notes';
import {
  hasTweaksTemplate,
  hasUrlModeBridge,
  htmlNeedsFocusGuard,
  htmlNeedsPoweredPreview,
  htmlNeedsRedirectGuard,
  htmlNeedsSandboxShim,
  parseForceInline,
  shouldUrlLoadHtmlPreview,
  type UrlLoadDecision,
} from './file-viewer-render-mode';
import {
  collectPreviewAssetPaths,
  htmlHasRelativeProjectAssetRefs,
  htmlHasRootRelativeProjectAssetRefs,
  normalizeRootRelativeProjectAssetRefs,
  rewriteProjectAssetRefsToRawUrls,
  rewriteInlinedCssAssetRefs,
  rewriteInlinedScriptAssetRefs,
} from './file-viewer-preview-assets';
import { resolvePoweredPreviewUrl } from '../runtime/powered-preview';
import { saveTemplate } from '../state/projects';
import type {
  LiveArtifactEventItem,
  LiveArtifact,
  LiveArtifactRefreshLogEntry,
  LiveArtifactViewerTab,
  LiveArtifactWorkspaceEntry,
  ProjectFile,
} from '../types';
import { Icon } from './Icon';
import { RemixIcon } from './RemixIcon';
import { projectIsSharedWithWorkspace } from '../collab/project-shared-status';
import { HandoffButton } from './HandoffButton';
import { SocialShareGrid } from './SocialShareGrid';
import { Toast } from './Toast';
import {
  PreviewDrawOverlay,
  ANNOTATION_EVENT,
  type AnnotationEventDetail,
  type DrawToolbarElement,
} from './PreviewDrawOverlay';
import {
  buildBoardCommentAttachments,
  commentSnapshotEqual,
  commentTargetDisplayName,
  commentVisibleOnDeckSlide,
  commentsToAttachments,
  isValidCommentOverlayPosition,
  liveCommentTargetMapsEqual,
  liveSnapshotForComment,
  overlayBoundsFromSnapshot,
  planLostAnchorWriteBacks,
  provisionalNextPinNumber,
  resolveCommentAnchor,
  selectionKindLabel,
  targetFromSnapshot,
  type AnchorWriteBack,
  type PreviewCommentSnapshot,
} from '../comments';
import {
  useProjectCollabContext,
  type ProjectResourceAuthority,
} from '../collab/collab-context';
import { currentUserDirectoryEntry, useTeamMembers } from '../collab/useTeamMembers';
import { applyPodMemberRemoval } from '../lib/pod-members';
import { AnnotationHoverPopover, BoardComposerPopover } from './BoardComposerPopover';
import {
  OD_PREVIEW_KEEP_ALIVE,
  PooledIframe,
  previewIframeKeepAliveKey,
  useIframeKeepAlivePool,
} from './IframeKeepAlivePool';
import type {
  ChatCommentAttachment,
  PreviewComment,
  PreviewCommentAnchorState,
  PreviewCommentAttachment,
  PreviewCommentMember,
  PreviewCommentTarget,
} from '../types';
import { ManualEditPanel, emptyManualEditDraft, type ManualEditDraft } from './ManualEditPanel';
import {
  applyManualEditPatch,
  isManualEditFullHtmlDocument,
  readManualEditAttributes,
  readManualEditFields,
  readManualEditOuterHtml,
  readManualEditStyles,
} from '../edit-mode/source-patches';
import { MANUAL_EDIT_STYLE_PROPS, type ManualEditBridgeMessage, type ManualEditHistoryEntry, type ManualEditPatch, type ManualEditStyles, type ManualEditTarget } from '../edit-mode/types';
import { isRenderableSketchJson, SketchPreview } from './SketchPreview';
import {
  getHtmlSourceSnapshot,
  htmlSourceSnapshotRefreshKey,
  invalidateHtmlSourceSnapshotFile,
  invalidateHtmlSourceSnapshotProject,
  setHtmlSourceSnapshot,
} from './html-source-snapshot-cache';

function resolveChromeActionsHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>(APP_CHROME_FILE_ACTIONS_SELECTOR)
    ?? document.getElementById(APP_CHROME_FILE_ACTIONS_ID);
}

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;
type SlideState = { active: number; count: number };
type BoardTool = 'inspect' | 'pod';
type StrokePoint = { x: number; y: number };
export type ManualEditPendingStyleSave = {
  id: string;
  styles: Partial<ManualEditStyles>;
  label: string;
  version: number;
};
type PreviewViewportId = 'desktop' | 'tablet' | 'mobile';
type PreviewCanvasSize = { width: number; height: number; scrollLeft?: number; scrollTop?: number };
type CommentPreviewCanvasOptions = {
  boardMode: boolean;
  sidePanelCollapsed: boolean;
  viewport?: PreviewViewportId;
};
type PreviewScaleOptions = {
  canvasPadding?: number;
};
type PreviewViewportPreset = {
  id: PreviewViewportId;
  width: number | null;
  height: number | null;
  labelKey: keyof Dict;
  titleKey: keyof Dict;
};
const IMAGE_EXPORT_FORMAT_OPTIONS: Array<{
  value: ImageExportFormat;
  label: string;
  extension: string;
}> = [
  { value: 'png', label: 'PNG', extension: '.png' },
  { value: 'jpeg', label: 'JPEG', extension: '.jpg' },
  { value: 'webp', label: 'WebP', extension: '.webp' },
];
type DeployProviderOption = {
  id: WebDeployProviderId;
  labelKey: 'fileViewer.vercelProvider' | 'fileViewer.cloudflarePagesProvider';
  tokenLink: string;
  tokenLinkKey: 'fileViewer.vercelTokenGetLink' | 'fileViewer.cloudflareApiTokenGetLink';
  tokenPlaceholderKey:
    | 'fileViewer.vercelTokenPlaceholder'
    | 'fileViewer.cloudflareApiTokenPlaceholder';
  tokenReuseHintKey: 'fileViewer.vercelTokenReuseHint' | 'fileViewer.cloudflareApiTokenReuseHint';
  tokenRequiredKey: 'fileViewer.vercelTokenRequired' | 'fileViewer.cloudflareApiTokenRequired';
  tokenLabelKey:
    | 'fileViewer.vercelToken'
    | 'fileViewer.cloudflareApiToken';
  accountIdLabelKey?: 'fileViewer.cloudflareAccountId';
  accountIdHintKey?: 'fileViewer.cloudflareAccountIdHint';
};
type CloudflarePagesZoneOption = {
  id: string;
  name: string;
  status?: string;
  type?: string;
};
type DeployResultCard = {
  id: string;
  label: string;
  url: string;
  status: string;
  message?: string;
};
const MAX_BRIDGE_COORDINATE = 1_000_000;
// Powered-preview iframe attributes. `allow-same-origin` is what makes real
// Workers / Web Storage / SharedArrayBuffer possible; it is safe here because
// the powered iframe loads from the daemon's preview-only loopback host, which
// is cross-origin to the app shell and barred from normal daemon APIs. The
// `allow` list delegates the permissions a GPU/compute artifact typically
// wants, including `cross-origin-isolated` so the isolated document keeps
// SharedArrayBuffer.
const POWERED_PREVIEW_SANDBOX =
  'allow-scripts allow-same-origin allow-downloads allow-popups allow-forms allow-modals allow-pointer-lock';
const POWERED_PREVIEW_ALLOW =
  'accelerometer; autoplay; camera; cross-origin-isolated; fullscreen; gamepad; gyroscope; microphone; xr-spatial-tracking';
const PREVIEW_BRIDGE_QUERY = 'odPreviewBridge=scroll&odPreviewBridge=selection&odPreviewBridge=snapshot&odPreviewBridge=observability';
// Generic runtime UI state carried across the URL-load -> srcDoc transport
// switch. This preserves the current page of multi-page prototypes while
// leaving artifact scripts and business state inside their sandboxed frames.
const PREVIEW_RUNTIME_STATE_MAX_ELEMENTS = 3500;
const PREVIEW_RUNTIME_STATE_MAX_ROOTS = 64;
const PREVIEW_RUNTIME_STATE_MAX_ROOT_HTML = 2 * 1024 * 1024;
type PreviewRuntimeStateEntry = {
  path: number[];
  tag: string;
  id?: string;
  odId?: string;
  attrs: Record<string, string>;
  value?: string;
  checked?: boolean;
  selectedIndex?: number;
  scrollLeft?: number;
  scrollTop?: number;
};
type PreviewRuntimeStateRoot = {
  path: number[];
  tag: string;
  id?: string;
  odId?: string;
  html: string;
};
type PreviewRuntimeState = {
  version: 1;
  hash: string;
  roots?: PreviewRuntimeStateRoot[];
  htmlAttrs: Record<string, string>;
  bodyAttrs: Record<string, string>;
  entries: PreviewRuntimeStateEntry[];
};
const HTML_PASSIVE_PREVIEW_FULL_TEXT_LIMIT = 2 * 1024 * 1024;
const HTML_ROUTING_TEXT_PREVIEW_LIMIT = 96 * 1024;
const HTML_PREVIEW_ASSET_PREFLIGHT_LIMIT = 32;
type HtmlSourceLoadMode = 'full' | 'routing-preview';
type PreviewAssetWarning = { filePath: string };

function isPreviewRuntimeAttributeMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 64 && entries.every(([name, attrValue]) => (
    name.length <= 128 &&
    typeof attrValue === 'string' &&
    attrValue.length <= 20_000
  ));
}

function isPreviewRuntimeState(value: unknown): value is PreviewRuntimeState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<PreviewRuntimeState>;
  if (
    state.version !== 1 ||
    typeof state.hash !== 'string' ||
    state.hash.length > 4096 ||
    (state.roots !== undefined && (
      !Array.isArray(state.roots) ||
      state.roots.length > PREVIEW_RUNTIME_STATE_MAX_ROOTS ||
      state.roots.reduce((total, root) => total + (
        root && typeof root === 'object' && typeof root.html === 'string'
          ? root.html.length
          : PREVIEW_RUNTIME_STATE_MAX_ROOT_HTML + 1
      ), 0) > PREVIEW_RUNTIME_STATE_MAX_ROOT_HTML ||
      !state.roots.every((root) => (
        !!root &&
        typeof root === 'object' &&
        typeof root.tag === 'string' &&
        root.tag.length <= 32 &&
        Array.isArray(root.path) &&
        root.path.length <= 64 &&
        root.path.every((index) => Number.isInteger(index) && index >= 0 && index <= 100_000) &&
        (root.id === undefined || (typeof root.id === 'string' && root.id.length <= 4096)) &&
        (root.odId === undefined || (typeof root.odId === 'string' && root.odId.length <= 4096)) &&
        typeof root.html === 'string'
      ))
    )) ||
    !isPreviewRuntimeAttributeMap(state.htmlAttrs) ||
    !isPreviewRuntimeAttributeMap(state.bodyAttrs) ||
    !Array.isArray(state.entries) ||
    state.entries.length > PREVIEW_RUNTIME_STATE_MAX_ELEMENTS
  ) {
    return false;
  }
  return state.entries.every((entry) => (
    !!entry &&
    typeof entry === 'object' &&
    typeof entry.tag === 'string' &&
    entry.tag.length <= 32 &&
    Array.isArray(entry.path) &&
    entry.path.length <= 64 &&
    entry.path.every((index) => Number.isInteger(index) && index >= 0 && index <= 100_000) &&
    (entry.id === undefined || (typeof entry.id === 'string' && entry.id.length <= 4096)) &&
    (entry.odId === undefined || (typeof entry.odId === 'string' && entry.odId.length <= 4096)) &&
    isPreviewRuntimeAttributeMap(entry.attrs) &&
    (entry.value === undefined || (typeof entry.value === 'string' && entry.value.length <= 100_000)) &&
    (entry.checked === undefined || typeof entry.checked === 'boolean') &&
    (entry.selectedIndex === undefined || Number.isInteger(entry.selectedIndex)) &&
    (entry.scrollLeft === undefined || Number.isFinite(entry.scrollLeft)) &&
    (entry.scrollTop === undefined || Number.isFinite(entry.scrollTop))
  ));
}

function previewTextNeedsFullSourceForSafeInline(source: string | null): boolean {
  if (!source) return false;
  return (
    htmlNeedsSandboxShim(source) ||
    htmlNeedsFocusGuard(source) ||
    htmlNeedsRedirectGuard(source) ||
    hasTweaksTemplate(source)
  );
}

function isBlockedPreviewAssetResponse(body: unknown): boolean {
  if (typeof body === 'string') {
    return /path escapes project dir/i.test(body);
  }
  if (!body || typeof body !== 'object') return false;
  const payload = body as { error?: unknown; message?: unknown };
  const error = payload.error;
  if (typeof error === 'string') return isBlockedPreviewAssetResponse(error);
  if (error && typeof error === 'object') {
    const detail = error as { code?: unknown; message?: unknown };
    if (detail.code === 'BAD_REQUEST' && isBlockedPreviewAssetResponse(detail.message)) return true;
    return isBlockedPreviewAssetResponse(detail.message);
  }
  return isBlockedPreviewAssetResponse(payload.message);
}

async function readPreviewAssetResponseBody(resp: Response): Promise<unknown> {
  const contentType = resp.headers.get('Content-Type') ?? '';
  if (/json/i.test(contentType)) {
    try {
      return await resp.json();
    } catch {
      return '';
    }
  }
  try {
    return await resp.text();
  } catch {
    return '';
  }
}

const PREVIEW_VIEWPORT_PRESETS: PreviewViewportPreset[] = [
  {
    id: 'desktop',
    width: null,
    height: null,
    labelKey: 'fileViewer.viewportDesktop',
    titleKey: 'fileViewer.viewportDesktopTitle',
  },
  {
    id: 'tablet',
    width: 820,
    height: 1180,
    labelKey: 'fileViewer.viewportTablet',
    titleKey: 'fileViewer.viewportTabletTitle',
  },
  {
    id: 'mobile',
    width: 390,
    height: 844,
    labelKey: 'fileViewer.viewportMobile',
    titleKey: 'fileViewer.viewportMobileTitle',
  },
];

function previewViewportIcon(viewport: PreviewViewportId): string {
  if (viewport === 'tablet') return 'tablet-line';
  if (viewport === 'mobile') return 'smartphone-line';
  return 'computer-line';
}

const EXPORT_READY_NUDGE_STORAGE_PREFIX = 'open-design:export-ready-nudge:';
const COMMENT_SIDE_DOCK_WIDTH = 320;
const COMMENT_SIDE_DOCK_RAIL_WIDTH = 42;
const COMMENT_SIDE_DOCK_GAP = 12;
const COMMENT_SIDE_DOCK_PADDING = 8;
const COMMENT_SIDE_DOCK_NON_DESKTOP_PADDING = 24;
const COMMENT_SIDE_DOCK_MIN_CANVAS_WIDTH = 280;
const COMMENT_SIDE_DOCK_STACKED_PANEL_HEIGHT = 220;
const COMMENT_SIDE_DOCK_STACKED_RAIL_HEIGHT = 48;
const COMMENT_SIDE_DOCK_STACKED_HEIGHT_DEDUCTION =
  (COMMENT_SIDE_DOCK_PADDING * 2) + COMMENT_SIDE_DOCK_GAP + COMMENT_SIDE_DOCK_STACKED_PANEL_HEIGHT;
const COMMENT_SIDE_DOCK_STACKED_COLLAPSED_HEIGHT_DEDUCTION =
  (COMMENT_SIDE_DOCK_PADDING * 2) + COMMENT_SIDE_DOCK_GAP + COMMENT_SIDE_DOCK_STACKED_RAIL_HEIGHT;

// The five basic style facets the inspect panel exposes. Kept narrow on
// purpose — open-slide's design tokens panel only edits global tokens, so
// the per-element delta is small + obvious + cheap to read back from
// getComputedStyle on the iframe side.
type InspectStyleSnapshot = {
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontWeight?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  borderRadius?: string;
  textAlign?: string;
  fontFamily?: string;
  lineHeight?: string;
};

type InspectClickedDescendant = {
  label: string;
  text: string;
};

type InspectTarget = {
  elementId: string;
  selector: string;
  label: string;
  text: string;
  style: InspectStyleSnapshot;
  clickedDescendant?: InspectClickedDescendant;
};

const MAX_CACHED_SLIDE_STATES = 64;
const htmlPreviewSlideState = new Map<string, SlideState>();
const MAX_CACHED_PREVIEW_VIEWPORTS = 128;
// Grace window before the inspect hover card is torn down. Long enough to absorb
// the async iframe mouseout (od:comment-leave) that fires when the pointer slides
// onto the card or hops back onto the element under it, short enough to read as
// an immediate dismiss when the pointer really leaves.
const HOVER_CARD_DISMISS_DELAY_MS = 80;
const htmlPreviewViewportState = new Map<string, PreviewViewportId>();
// Desktop-preview zoom, keyed the same way as `htmlPreviewViewportState` above.
// HtmlViewer fully unmounts whenever the workspace tab switches away from this
// file (e.g. to the Design Files grid) and remounts when the user switches
// back — a plain `useState(100)` would reset to a fresh auto-fit pass on every
// such remount, silently overwriting a zoom the user had already landed on
// (issue rec:recvqaeMAGUdN2, seen as an unexplained snap to 85%). Caching the
// last known {zoom, zoomMode} per file lets the remount effect below restore
// it instead of defaulting, while a genuinely new file (no cache entry yet)
// still gets the normal auto-fit default.
const MAX_CACHED_PREVIEW_ZOOMS = 128;
const htmlPreviewZoomState = new Map<string, { zoom: number; zoomMode: 'auto' | 'manual' }>();
// Last measured desktop-preview content width per file, same key/cap shape as
// the zoom cache above. Seeding a remount from the last confirmed measurement
// (instead of `null`) avoids re-deriving auto-fit zoom from a cold "assume no
// overflow" guess while the fresh in-iframe measurement round-trip is still
// pending — that cold-start window was the other half of the 85% snap
// (rec:recvqaeMAGUdN2). A genuinely stale value still self-corrects once the
// real measurement message arrives (see onContentSizeMessage below) or the
// canvas-grow recovery in the auto-fit effect fires.
const MAX_CACHED_PREVIEW_CONTENT_WIDTHS = 128;
const PREVIEW_CONTENT_WIDTH_CACHE_VERSION = 2;
const SRC_DOC_ACTIVATION_RECOVERY_TIMEOUT_MS = 1500;
const SRC_DOC_READY_PROBE_TIMEOUT_MS = 1500;
let previewContentMeasurementDocumentEpochSequence = 0;
let previewContentMeasurementHostInstanceSequence = 0;
let previewTransportGenerationSequence = 0;
function nextPreviewContentMeasurementDocumentEpoch(): string {
  previewContentMeasurementDocumentEpochSequence += 1;
  return `preview-document-${previewContentMeasurementDocumentEpochSequence}`;
}
function nextPreviewContentMeasurementHostInstance(): string {
  previewContentMeasurementHostInstanceSequence += 1;
  return `preview-host-${previewContentMeasurementHostInstanceSequence}`;
}
function nextPreviewTransportGeneration(): string {
  previewTransportGenerationSequence += 1;
  return `preview-transport-${previewTransportGenerationSequence}`;
}
type PreviewContentWidthCacheEntry = {
  version: typeof PREVIEW_CONTENT_WIDTH_CACHE_VERSION;
  width: number;
  measuredClientWidth: number;
  overflow: boolean;
};
const htmlPreviewContentWidthState = new Map<string, PreviewContentWidthCacheEntry>();
const htmlPreviewDocumentEpochState = new Map<string, string>();
const MARKDOWN_CODE_BLOCK_ATTR = 'data-markdown-code-block';
const MARKDOWN_CODE_LANGUAGE_ATTR = 'data-code-language';
const MARKDOWN_COPY_BLOCK_ATTR = 'data-copy-code-block';
const MARKDOWN_COPY_BUTTON_CLASS = 'markdown-code-copy';
const MARKDOWN_COPY_TOAST_CLASS = 'markdown-code-toast';
const ABSOLUTE_MARKDOWN_IMAGE_SOURCE_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

const DEPLOY_PROVIDER_OPTIONS: DeployProviderOption[] = [
  {
    id: DEFAULT_DEPLOY_PROVIDER_ID,
    labelKey: 'fileViewer.vercelProvider',
    tokenLink: 'https://vercel.com/account/settings/tokens',
    tokenLinkKey: 'fileViewer.vercelTokenGetLink',
    tokenPlaceholderKey: 'fileViewer.vercelTokenPlaceholder',
    tokenReuseHintKey: 'fileViewer.vercelTokenReuseHint',
    tokenRequiredKey: 'fileViewer.vercelTokenRequired',
    tokenLabelKey: 'fileViewer.vercelToken',
  },
  {
    id: CLOUDFLARE_PAGES_PROVIDER_ID,
    labelKey: 'fileViewer.cloudflarePagesProvider',
    tokenLink: 'https://dash.cloudflare.com/profile/api-tokens',
    tokenLinkKey: 'fileViewer.cloudflareApiTokenGetLink',
    tokenPlaceholderKey: 'fileViewer.cloudflareApiTokenPlaceholder',
    tokenReuseHintKey: 'fileViewer.cloudflareApiTokenReuseHint',
    tokenRequiredKey: 'fileViewer.cloudflareApiTokenRequired',
    tokenLabelKey: 'fileViewer.cloudflareApiToken',
    accountIdLabelKey: 'fileViewer.cloudflareAccountId',
    accountIdHintKey: 'fileViewer.cloudflareAccountIdHint',
  },
];

function mergeManualEditInspectorStyles(
  sourceStyles: ManualEditStyles,
  previewStyles: ManualEditStyles,
): ManualEditStyles {
  return MANUAL_EDIT_STYLE_PROPS.reduce<ManualEditStyles>((acc, key) => {
    const sourceValue = sourceStyles[key]?.trim();
    const previewValue = previewStyles[key]?.trim();
    const value = sourceValue || previewValue || '';
    acc[key] = manualEditInspectorStyleValue(key, value);
    return acc;
  }, {} as ManualEditStyles);
}

function manualEditInspectorStyleValue(key: keyof ManualEditStyles, value: string): string {
  if (!value) return '';
  if (key === 'color' || key === 'backgroundColor' || key === 'borderColor') {
    return normalizeManualEditInspectorColor(value);
  }
  return value;
}

function normalizeManualEditInspectorColor(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const r = trimmed[1]!, g = trimmed[2]!, b = trimmed[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const rgba = trimmed.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!rgba) return trimmed;
  if (rgba[4] !== undefined && Number(rgba[4]) === 0) return '';
  const toHex = (raw: string) => Math.max(0, Math.min(255, Math.round(Number(raw))))
    .toString(16)
    .padStart(2, '0');
  return `#${toHex(rgba[1]!)}${toHex(rgba[2]!)}${toHex(rgba[3]!)}`;
}

function manualEditPersistedValueMatchesSavedSnapshot(
  key: keyof ManualEditStyles,
  persistedValue: string,
  savedValue: string,
): boolean {
  return canonicalManualEditStyleValue(key, persistedValue) === canonicalManualEditStyleValue(key, savedValue);
}

function canonicalManualEditStyleValue(key: keyof ManualEditStyles, value: string): string {
  const normalized = manualEditInspectorStyleValue(key, value).trim();
  if (!normalized) return '';
  return normalized.toLowerCase();
}

function getDeployProviderOption(providerId: WebDeployProviderId): DeployProviderOption {
  return DEPLOY_PROVIDER_OPTIONS.find((option) => option.id === providerId) ?? DEPLOY_PROVIDER_OPTIONS[0]!;
}

function normalizeCloudflareDomainPrefixInput(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidCloudflareDomainPrefixInput(raw: string): boolean {
  const prefix = normalizeCloudflareDomainPrefixInput(raw);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(prefix);
}

function deployResultState(status?: string): 'ready' | 'delayed' | 'protected' | 'failed' {
  if (status === 'protected') return 'protected';
  if (status === 'failed' || status === 'conflict') return 'failed';
  if (status === 'link-delayed' || status === 'pending') return 'delayed';
  return 'ready';
}

function publicShareUrlForDeployment(deployment?: WebDeploymentInfo | null): string {
  if (!deployment) return '';
  const cloudflare = deployment.cloudflarePages;
  const customDomainUrl = cloudflare?.customDomain?.status === 'ready'
    ? cloudflare.customDomain.url?.trim()
    : '';
  if (customDomainUrl) return customDomainUrl;
  const pagesDevUrl = cloudflare?.pagesDev?.status === 'ready'
    ? cloudflare.pagesDev.url?.trim()
    : '';
  if (pagesDevUrl) return pagesDevUrl;
  return deployResultState(deployment.status) === 'ready'
    ? deployment.url?.trim() || ''
    : '';
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(ta);
      if (priorFocus?.isConnected) {
        try {
          priorFocus.focus({ preventScroll: true });
        } catch {
          priorFocus.focus();
        }
      }
    }
  }
}

function decorateMarkdownCodeBlocks(html: string): string {
  let blockIndex = 0;
  return html.replace(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/g, (_match, attrs: string, content: string) => {
    const blockId = String(blockIndex++);
    const language = markdownCodeBlockLanguage(content);
    const languageAttr = language ? ` ${MARKDOWN_CODE_LANGUAGE_ATTR}="${escapeHtmlAttribute(language.label)}"` : '';
    return `<div class="markdown-code-block" ${MARKDOWN_CODE_BLOCK_ATTR}="${blockId}"${languageAttr}><pre${attrs}>${content}</pre></div>`;
  });
}

type MarkdownCodeLanguage = {
  lang: string;
  label: string;
};

function markdownCodeBlockLanguage(content: string): MarkdownCodeLanguage | null {
  const codeMatch = content.match(/<code\b([^>]*)>/);
  if (!codeMatch) return null;
  const classMatch = codeMatch[1]?.match(/\bclass=(["'])(.*?)\1/);
  const className = classMatch?.[2] ?? '';
  const languageClass = className
    .split(/\s+/)
    .map((item) => item.trim())
    .find((item) => /^(?:language|lang)-/i.test(item));
  if (!languageClass) return null;
  const raw = languageClass.replace(/^(?:language|lang)-/i, '').replace(/[^a-z0-9+#.-]/gi, '');
  if (!raw) return null;
  const aliases: Record<string, MarkdownCodeLanguage> = {
    bash: { lang: 'bash', label: 'Bash' },
    c: { lang: 'c', label: 'C' },
    cpp: { lang: 'cpp', label: 'C++' },
    css: { lang: 'css', label: 'CSS' },
    diff: { lang: 'diff', label: 'Diff' },
    dockerfile: { lang: 'dockerfile', label: 'Dockerfile' },
    go: { lang: 'go', label: 'Go' },
    graphql: { lang: 'graphql', label: 'GraphQL' },
    html: { lang: 'html', label: 'HTML' },
    java: { lang: 'java', label: 'Java' },
    js: { lang: 'javascript', label: 'JS' },
    javascript: { lang: 'javascript', label: 'JS' },
    json: { lang: 'json', label: 'JSON' },
    jsx: { lang: 'jsx', label: 'JSX' },
    markdown: { lang: 'markdown', label: 'Markdown' },
    md: { lang: 'markdown', label: 'Markdown' },
    php: { lang: 'php', label: 'PHP' },
    py: { lang: 'python', label: 'Python' },
    python: { lang: 'python', label: 'Python' },
    rb: { lang: 'ruby', label: 'Ruby' },
    ruby: { lang: 'ruby', label: 'Ruby' },
    rust: { lang: 'rust', label: 'Rust' },
    shell: { lang: 'shell', label: 'Shell' },
    sh: { lang: 'shell', label: 'Shell' },
    sql: { lang: 'sql', label: 'SQL' },
    swift: { lang: 'swift', label: 'Swift' },
    toml: { lang: 'toml', label: 'TOML' },
    ts: { lang: 'typescript', label: 'TS' },
    tsx: { lang: 'tsx', label: 'TSX' },
    typescript: { lang: 'typescript', label: 'TS' },
    xml: { lang: 'xml', label: 'XML' },
    yaml: { lang: 'yaml', label: 'YAML' },
    yml: { lang: 'yaml', label: 'YAML' },
  };
  return aliases[raw.toLowerCase()] ?? { lang: raw.toLowerCase(), label: raw.toUpperCase() };
}

async function highlightMarkdownCodeBlocks(html: string): Promise<string> {
  if (typeof document === 'undefined') return html;
  const root = document.createElement('div');
  root.innerHTML = html;
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(`[${MARKDOWN_CODE_BLOCK_ATTR}]`));
  if (blocks.length === 0) return html;
  const { highlightCode } = await import('../runtime/shiki');
  let changed = false;
  await Promise.all(blocks.map(async (block) => {
    const code = block.querySelector<HTMLElement>('pre > code');
    if (!code) return;
    const language = markdownCodeBlockLanguage(code.outerHTML);
    if (!language) return;
    const source = (code.textContent ?? '').replace(/\n$/, '');
    const highlighted = await highlightCode(source, language.lang);
    if (!highlighted) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = highlighted;
    const highlightedPre = wrapper.firstElementChild;
    if (!(highlightedPre instanceof HTMLElement)) return;
    highlightedPre.classList.add('markdown-shiki');
    highlightedPre.setAttribute('data-lang', language.label);
    code.closest('pre')?.replaceWith(highlightedPre);
    block.setAttribute(MARKDOWN_CODE_LANGUAGE_ATTR, language.label);
    changed = true;
  }));
  return changed ? root.innerHTML : html;
}

function rewriteMarkdownImageSources(
  html: string,
  projectId: string,
  markdownPath: string,
  workspaceContext?: WorkspaceCollabContext | null,
): string {
  return html.replace(/<img\b([^>]*?)\bsrc="([^"]*)"([^>]*)>/g, (match, before: string, src: string, after: string) => {
    const resolved = markdownImageSourceUrl(
      projectId,
      markdownPath,
      decodeHtmlAttribute(src),
      workspaceContext,
    );
    if (!resolved) return match;
    const attrs = `${before}${after}`;
    const loadingAttr = /\sloading=/.test(attrs) ? '' : ' loading="lazy"';
    return `<img${before}src="${escapeHtmlAttribute(resolved)}"${loadingAttr}${after}>`;
  });
}

export function markdownImageSourceUrl(
  projectId: string,
  markdownPath: string,
  src: string,
  workspaceContext?: WorkspaceCollabContext | null,
): string | null {
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (ABSOLUTE_MARKDOWN_IMAGE_SOURCE_RE.test(trimmed)) return trimmed;
  const relativePath = trimmed.startsWith('/')
    ? normalizeMarkdownProjectPath(trimmed.slice(1))
    : normalizeMarkdownProjectPath(`${markdownDirectory(markdownPath)}/${trimmed}`);
  return relativePath
    ? projectFileUrl(projectId, relativePath, workspaceContext)
    : null;
}

function markdownDirectory(path: string): string {
  const normalized = normalizeMarkdownProjectPath(path);
  const slash = normalized.lastIndexOf('/');
  return slash > 0 ? normalized.slice(0, slash) : '';
}

function normalizeMarkdownProjectPath(path: string): string {
  const parts: string[] = [];
  for (const raw of path.replace(/\\/g, '/').split('/')) {
    const part = raw.trim();
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

function markdownRelativeProjectPath(fromPath: string, targetPath: string): string {
  const fromDir = markdownDirectory(fromPath);
  const target = normalizeMarkdownProjectPath(targetPath);
  if (!fromDir) return target;
  if (target.startsWith(`${fromDir}/`)) return target.slice(fromDir.length + 1);
  const fromParts = fromDir.split('/').filter(Boolean);
  const targetParts = target.split('/').filter(Boolean);
  let common = 0;
  while (common < fromParts.length && common < targetParts.length && fromParts[common] === targetParts[common]) {
    common += 1;
  }
  const up = Array.from({ length: fromParts.length - common }, () => '..');
  const down = targetParts.slice(common);
  return [...up, ...down].join('/') || target;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setMarkdownCodeBlockCopiedState(block: HTMLElement, copied: boolean, t: TranslateFn) {
  const button = block.querySelector<HTMLButtonElement>(`.${MARKDOWN_COPY_BUTTON_CLASS}`);
  if (!button) return;
  const label = copied ? t('fileViewer.copied') : t('fileViewer.copy');
  button.textContent = label;
  button.setAttribute('aria-label', label);
  button.title = t('fileViewer.copyTitle');

  const existingToast = block.querySelector(`.${MARKDOWN_COPY_TOAST_CLASS}`);
  if (copied) {
    if (existingToast instanceof HTMLElement) {
      existingToast.textContent = t('fileViewer.copied');
      return;
    }
    const toast = document.createElement('span');
    toast.className = MARKDOWN_COPY_TOAST_CLASS;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = t('fileViewer.copied');
    button.insertAdjacentElement('afterend', toast);
    return;
  }

  existingToast?.remove();
}

function PreviewViewportControls({
  viewport,
  onViewport,
  t,
  tabIndex,
}: {
  viewport: PreviewViewportId;
  onViewport: (viewport: PreviewViewportId) => void;
  t: TranslateFn;
  tabIndex?: number;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const activePreset =
    PREVIEW_VIEWPORT_PRESETS.find((preset) => preset.id === viewport) ?? PREVIEW_VIEWPORT_PRESETS[0]!;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="viewer-viewport-switcher" ref={menuRef}>
      <button
        type="button"
        className={`viewer-action viewer-viewport-trigger${open ? '' : ' od-tooltip'}`}
        aria-label={t('fileViewer.viewportAria')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        title={t(activePreset.titleKey)}
        data-tooltip={open ? undefined : t(activePreset.titleKey)}
        data-tooltip-placement="bottom"
        tabIndex={tabIndex}
        onClick={() => setOpen((value) => !value)}
      >
        <RemixIcon
          name={previewViewportIcon(activePreset.id)}
          size={14}
          className="viewer-viewport-icon"
        />
        <span>{t(activePreset.labelKey)}</span>
        <RemixIcon name="arrow-down-s-line" size={14} />
      </button>
      {open ? (
        <div className="viewer-viewport-menu" id={listboxId} role="listbox" aria-label={t('fileViewer.viewportAria')}>
          {PREVIEW_VIEWPORT_PRESETS.map((preset) => {
            const selected = viewport === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`viewer-viewport-menu-item${selected ? ' active' : ''}`}
                role="option"
                aria-selected={selected}
                title={t(preset.titleKey)}
                onClick={() => {
                  onViewport(preset.id);
                  setOpen(false);
                }}
              >
                <span className="viewer-viewport-menu-label">
                  <RemixIcon name={previewViewportIcon(preset.id)} size={14} />
                  <span>{t(preset.labelKey)}</span>
                </span>
                {selected ? <Icon name="check" size={13} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function previewViewportStyle(
  viewport: PreviewViewportId,
  previewScale = 1,
  canvasSize?: PreviewCanvasSize,
  options?: PreviewScaleOptions,
): CSSProperties & Record<string, string | number> {
  const preset = PREVIEW_VIEWPORT_PRESETS.find((item) => item.id === viewport) ?? PREVIEW_VIEWPORT_PRESETS[0]!;
  if (!preset.width) return {};
  const effectiveScale = effectivePreviewScale(viewport, previewScale, canvasSize, options);
  return {
    '--preview-viewport-width': `${preset.width}px`,
    '--preview-viewport-height': `${preset.height}px`,
    '--preview-scale': effectiveScale,
    '--preview-user-scale': previewScale,
  };
}

export function commentPreviewCanvasSize(
  canvasSize: PreviewCanvasSize | undefined,
  options: CommentPreviewCanvasOptions,
): PreviewCanvasSize | undefined {
  if (!canvasSize || !options.boardMode) return canvasSize;
  const dockPadding = options.viewport && options.viewport !== 'desktop'
    ? COMMENT_SIDE_DOCK_NON_DESKTOP_PADDING
    : COMMENT_SIDE_DOCK_PADDING;
  const sideDockWidth = options.sidePanelCollapsed ? COMMENT_SIDE_DOCK_RAIL_WIDTH : COMMENT_SIDE_DOCK_WIDTH;
  const dockedWidth = canvasSize.width - (dockPadding * 2) - COMMENT_SIDE_DOCK_GAP - sideDockWidth;
  if (usesStackedCommentSideDock(canvasSize, options)) {
    const stackedHeightDeduction = options.sidePanelCollapsed
      ? COMMENT_SIDE_DOCK_STACKED_COLLAPSED_HEIGHT_DEDUCTION
      : COMMENT_SIDE_DOCK_STACKED_HEIGHT_DEDUCTION;
    return {
      width: Math.max(1, canvasSize.width - (COMMENT_SIDE_DOCK_PADDING * 2)),
      height: Math.max(1, canvasSize.height - stackedHeightDeduction),
    };
  }
  return {
    width: Math.max(1, dockedWidth),
    height: Math.max(1, canvasSize.height - (dockPadding * 2)),
  };
}

function usesStackedCommentSideDock(
  canvasSize: PreviewCanvasSize | undefined,
  options: CommentPreviewCanvasOptions,
) {
  if (!canvasSize || !options.boardMode) return false;
  const dockPadding = options.viewport && options.viewport !== 'desktop'
    ? COMMENT_SIDE_DOCK_NON_DESKTOP_PADDING
    : COMMENT_SIDE_DOCK_PADDING;
  const sideDockWidth = options.sidePanelCollapsed ? COMMENT_SIDE_DOCK_RAIL_WIDTH : COMMENT_SIDE_DOCK_WIDTH;
  const dockedWidth = canvasSize.width - (dockPadding * 2) - COMMENT_SIDE_DOCK_GAP - sideDockWidth;
  return dockedWidth < COMMENT_SIDE_DOCK_MIN_CANVAS_WIDTH;
}

export function effectivePreviewScale(
  viewport: PreviewViewportId,
  previewScale: number,
  canvasSize?: PreviewCanvasSize,
  options?: PreviewScaleOptions,
) {
  if (viewport === 'desktop') return previewScale;
  const preset = PREVIEW_VIEWPORT_PRESETS.find((item) => item.id === viewport);
  if (!preset?.width || !preset.height || !canvasSize?.width || !canvasSize.height) return previewScale;
  const canvasPadding = options?.canvasPadding ?? 48;
  const availableWidth = Math.max(1, canvasSize.width - canvasPadding);
  const availableHeight = Math.max(1, canvasSize.height - canvasPadding);
  const fitScale = Math.min(1, availableWidth / preset.width, availableHeight / preset.height);
  return Math.min(previewScale, fitScale);
}

export function desktopPreviewAutoFitZoomPercent(
  canvasSize: PreviewCanvasSize | undefined,
  contentWidth?: number | null,
): number {
  if (!canvasSize?.width || !Number.isFinite(canvasSize.width)) return 100;
  if (!contentWidth || !Number.isFinite(contentWidth) || contentWidth <= canvasSize.width) return 100;
  return Math.max(1, Math.min(100, (canvasSize.width / contentWidth) * 100));
}

export type PreviewContentMeasurementRequest = {
  measurementId: string;
  generation: string;
  documentEpoch: string;
  canvasWidth: number;
  previewScale: number;
};

export type PreviewContentMeasurementResponse = {
  measurementId: string;
  generation: string;
  documentEpoch: string;
  scrollWidth: number | null;
  clientWidth: number | null;
};

type PreviewContentMeasurementResolution =
  | {
    action: 'accept';
    contentWidth: number;
    measuredClientWidth: number;
    overflow: boolean;
  }
  | { action: 'preserve' }
  | { action: 'remeasure-neutral' }
  | { action: 'ignore' };

const PREVIEW_CONTENT_WIDTH_EPSILON = 1;
const PREVIEW_SCALE_EPSILON = 0.0001;

/**
 * Resolves a content-width report against the exact viewport state that asked
 * for it. At a non-neutral zoom, html/body clientWidth expands inversely with
 * the scale shell. An equal scrollWidth/clientWidth report is therefore only
 * the viewport floor, not evidence that the artifact itself is that wide.
 */
export function resolveDesktopPreviewContentMeasurement(params: {
  request: PreviewContentMeasurementRequest;
  response: PreviewContentMeasurementResponse;
  currentGeneration: string;
  latestMeasurementId: string | null;
  currentCanvasWidth: number;
  currentPreviewScale: number;
  confirmedContentWidth: number | null;
  confirmedOverflow?: boolean | null;
}): PreviewContentMeasurementResolution {
  const {
    request,
    response,
    currentGeneration,
    latestMeasurementId,
    currentCanvasWidth,
    currentPreviewScale,
    confirmedContentWidth,
    confirmedOverflow,
  } = params;
  if (
    response.measurementId !== request.measurementId ||
    response.generation !== request.generation ||
    response.documentEpoch !== request.documentEpoch ||
    request.measurementId !== latestMeasurementId ||
    request.generation !== currentGeneration ||
    Math.abs(request.canvasWidth - currentCanvasWidth) > PREVIEW_CONTENT_WIDTH_EPSILON ||
    Math.abs(request.previewScale - currentPreviewScale) > PREVIEW_SCALE_EPSILON
  ) {
    return { action: 'ignore' };
  }

  const scrollWidth = typeof response.scrollWidth === 'number' &&
    Number.isFinite(response.scrollWidth) &&
    response.scrollWidth > 0
    ? Math.ceil(response.scrollWidth)
    : null;
  const clientWidth = typeof response.clientWidth === 'number' &&
    Number.isFinite(response.clientWidth) &&
    response.clientWidth > 0
    ? Math.ceil(response.clientWidth)
    : null;
  if (scrollWidth == null || clientWidth == null) return { action: 'ignore' };

  if (
    scrollWidth > clientWidth + PREVIEW_CONTENT_WIDTH_EPSILON &&
    Math.abs(request.previewScale - 1) > PREVIEW_SCALE_EPSILON
  ) {
    return confirmedContentWidth != null && confirmedOverflow === true
      ? { action: 'preserve' }
      : { action: 'remeasure-neutral' };
  }
  if (scrollWidth > clientWidth + PREVIEW_CONTENT_WIDTH_EPSILON) {
    return {
      action: 'accept',
      contentWidth: scrollWidth,
      measuredClientWidth: clientWidth,
      overflow: true,
    };
  }
  if (Math.abs(request.previewScale - 1) <= PREVIEW_SCALE_EPSILON) {
    return {
      action: 'accept',
      contentWidth: Math.max(1, Math.ceil(request.canvasWidth)),
      measuredClientWidth: clientWidth,
      overflow: false,
    };
  }
  return confirmedContentWidth == null || confirmedOverflow !== true
    ? { action: 'remeasure-neutral' }
    : { action: 'preserve' };
}

export function previewMeasurementFrameIsUsable(params: {
  connected: boolean;
  active: boolean;
  frameRect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>;
  canvasRect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>;
}): boolean {
  const { connected, active, frameRect, canvasRect } = params;
  if (!connected || !active) return false;
  if (frameRect.width <= 1 || frameRect.height <= 1) return false;
  if (canvasRect.width <= 1 || canvasRect.height <= 1) return false;
  const horizontalOverlap = Math.min(frameRect.right, canvasRect.right) - Math.max(frameRect.left, canvasRect.left);
  const verticalOverlap = Math.min(frameRect.bottom, canvasRect.bottom) - Math.max(frameRect.top, canvasRect.top);
  return horizontalOverlap > 1 && verticalOverlap > 1;
}

/**
 * The zoom percent a desktop preview opens at. Auto mode fits wide, single-scroll
 * HTML pages whose content overflows the canvas horizontally. Decks are the
 * explicit exception: they paginate and fit one slide to the iframe viewport
 * internally, so their measured document scrollWidth spans the whole slide
 * filmstrip. Running that filmstrip width through the wide-page fit collapses the
 * zoom toward the ~1% floor (issue rec:recvq3NXctofXr), so decks keep the manual
 * zoom (100% by default) and let their in-iframe fit do the work. Non-desktop
 * viewports and manual mode always use the caller's zoom.
 */
export function resolveDesktopPreviewZoomPercent(params: {
  zoomMode: 'auto' | 'manual';
  viewport: PreviewViewportId;
  isDeck: boolean;
  manualZoomPercent: number;
  canvasSize: PreviewCanvasSize | undefined;
  contentWidth?: number | null;
}): number {
  const { zoomMode, viewport, isDeck, manualZoomPercent, canvasSize, contentWidth } = params;
  if (zoomMode !== 'auto' || viewport !== 'desktop' || isDeck) return manualZoomPercent;
  return desktopPreviewAutoFitZoomPercent(canvasSize, contentWidth);
}

export function desktopPreviewDocumentContentWidth(doc: Document | null | undefined): number | null {
  if (!doc) return null;
  const root = doc.documentElement;
  const body = doc.body;
  const widths = [
    root?.scrollWidth,
    body?.scrollWidth,
    root?.offsetWidth,
    body?.offsetWidth,
    root?.clientWidth,
    body?.clientWidth,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  return widths.length ? Math.max(...widths) : null;
}

function zoomPercentLabel(zoomPercent: number): string {
  return `${Math.round(zoomPercent)}%`;
}

type PreviewOverlayTransform = { scale: number; offsetX: number; offsetY: number };

export function previewOverlayTransform(
  viewport: PreviewViewportId,
  previewScale: number,
  canvasSize?: PreviewCanvasSize,
): PreviewOverlayTransform {
  const scale = effectivePreviewScale(viewport, previewScale, canvasSize);
  if (viewport === 'desktop') return { scale, offsetX: 0, offsetY: 0 };
  const preset = PREVIEW_VIEWPORT_PRESETS.find((item) => item.id === viewport);
  const pad = 24;
  if (!preset?.width || !preset.height) return { scale, offsetX: pad, offsetY: pad };
  const availableWidth = Math.max(1, (canvasSize?.width ?? preset.width * scale + pad * 2) - pad * 2);
  const scaledWidth = preset.width * scale;
  return {
    scale,
    offsetX: pad + Math.max(0, (availableWidth - scaledWidth) / 2),
    offsetY: pad,
  };
}

function previewScaleShellStyle(
  viewport: PreviewViewportId,
  previewScale: number,
): CSSProperties & Record<string, string | number> {
  if (viewport === 'desktop') {
    return {
      width: `${100 / previewScale}%`,
      height: `${100 / previewScale}%`,
      transform: `scale(${previewScale})`,
      transformOrigin: '0 0',
    };
  }
  return {
    width: 'var(--preview-viewport-width)',
    height: 'var(--preview-viewport-height)',
    transform: 'scale(var(--preview-scale, 1))',
    transformOrigin: '0 0',
  };
}

function manualEditPreviewShellStyle(
  viewport: PreviewViewportId,
  previewScale: number,
  frozenWidth: number | null,
): CSSProperties & Record<string, string | number> {
  if (viewport === 'desktop' && frozenWidth) {
    return {
      width: `${frozenWidth / previewScale}px`,
      height: `${100 / previewScale}%`,
      transform: `scale(${previewScale})`,
      transformOrigin: '0 0',
    };
  }
  return previewScaleShellStyle(viewport, previewScale);
}

function deploymentTimestamp(deployment: WebDeploymentInfo): number {
  const maybeDeployedAt = (deployment as WebDeploymentInfo & { deployedAt?: number | string }).deployedAt;
  const candidates = [maybeDeployedAt, deployment.updatedAt, deployment.createdAt];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === 'string') {
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function compareDeploymentsByNewest(a: WebDeploymentInfo, b: WebDeploymentInfo): number {
  return deploymentTimestamp(b) - deploymentTimestamp(a);
}

function shareUrlForDeployment(deployment: WebDeploymentInfo): string {
  const customDomain = deployment.providerId === CLOUDFLARE_PAGES_PROVIDER_ID
    ? deployment.cloudflarePages?.customDomain
    : undefined;
  if (customDomain?.status === 'ready' && customDomain.url?.trim()) {
    return customDomain.url.trim();
  }
  return deployment.url?.trim() || '';
}

function resolveShareUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (typeof window === 'undefined') return trimmed;
  return new URL(trimmed, window.location.origin).toString();
}

function pickLatestShareDeployment(
  deploymentsByProvider: Partial<Record<WebDeployProviderId, WebDeploymentInfo>>,
): WebDeploymentInfo | null {
  return Object.values(deploymentsByProvider)
    .filter((deployment): deployment is WebDeploymentInfo =>
      Boolean(deployment && shareUrlForDeployment(deployment) && deployResultState(deployment.status) !== 'failed'))
    .sort(compareDeploymentsByNewest)[0] ?? null;
}

function manualEditFloatingPanelStyle(
  target: ManualEditTarget,
  previewScale: number,
  canvasSize: PreviewCanvasSize | undefined,
): CSSProperties {
  const scale = Number.isFinite(previewScale) && previewScale > 0 ? previewScale : 1;
  const panelWidth = 320;
  const preferredPanelHeight = 380;
  const pad = 12;
  const canvasWidth = canvasSize?.width ?? 1200;
  const canvasHeight = canvasSize?.height ?? 800;
  const panelHeight = Math.min(preferredPanelHeight, Math.max(260, canvasHeight - pad * 2));
  const targetLeft = target.rect.x * scale;
  const targetTop = target.rect.y * scale;
  const targetRight = (target.rect.x + target.rect.width) * scale;
  let left = targetRight + pad;
  if (left + panelWidth > canvasWidth - pad) {
    left = Math.max(pad, targetLeft - panelWidth - pad);
  }
  const top = Math.max(
    pad,
    Math.min(targetTop, Math.max(pad, canvasHeight - panelHeight - pad)),
  );
  // Height is left to the content (auto): a short inspector (e.g. typography
  // only) should be a compact card, not a tall half-empty panel. The cap only
  // engages for long inspectors, at which point the scroll body takes over.
  return {
    left,
    top,
    width: panelWidth,
    maxHeight: panelHeight,
  };
}

// Anchors the hover "edit params" affordance to the top-right corner of the
// hovered element, just inside its bounds so moving the cursor from the
// element onto the icon does not drop the hover. Uses the same iframe→canvas
// coordinate basis as the floating inspector panel.
function manualEditHoverIconStyle(
  target: ManualEditTarget,
  previewScale: number,
  canvasSize: PreviewCanvasSize | undefined,
): CSSProperties {
  const scale = Number.isFinite(previewScale) && previewScale > 0 ? previewScale : 1;
  const iconSize = 26;
  const inset = 4;
  const canvasWidth = canvasSize?.width ?? 1200;
  const canvasHeight = canvasSize?.height ?? 800;
  const targetTop = target.rect.y * scale;
  const targetRight = (target.rect.x + target.rect.width) * scale;
  const left = Math.max(
    inset,
    Math.min(targetRight - iconSize - inset, canvasWidth - iconSize - inset),
  );
  const top = Math.max(
    inset,
    Math.min(targetTop + inset, canvasHeight - iconSize - inset),
  );
  return { left, top, width: iconSize, height: iconSize };
}

export function cancelManualEditPendingStyleSnapshot(
  pending: ManualEditPendingStyleSave | null,
  id: string,
  keys: Array<keyof ManualEditStyles>,
): ManualEditPendingStyleSave | null {
  if (!pending || pending.id !== id || keys.length === 0) return pending;
  const nextStyles = { ...pending.styles };
  for (const key of keys) delete nextStyles[key];
  if (Object.keys(nextStyles).length === 0) return null;
  return { ...pending, styles: nextStyles };
}

function usePreviewCanvasSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<PreviewCanvasSize | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({
        width: rect.width,
        height: rect.height,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      });
    };
    measure();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  return [ref, size] as const;
}

function ensureMarkdownCodeBlockControls(root: HTMLElement, t: TranslateFn) {
  for (const block of root.querySelectorAll<HTMLElement>(`[${MARKDOWN_CODE_BLOCK_ATTR}]`)) {
    let button = block.querySelector<HTMLButtonElement>(`.${MARKDOWN_COPY_BUTTON_CLASS}`);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = MARKDOWN_COPY_BUTTON_CLASS;
      const blockId = block.getAttribute(MARKDOWN_CODE_BLOCK_ATTR) ?? '';
      button.setAttribute(MARKDOWN_COPY_BLOCK_ATTR, blockId);
      block.prepend(button);
    }
    setMarkdownCodeBlockCopiedState(block, false, t);
  }
}

function setSlideStateCached(key: string, state: SlideState) {
  htmlPreviewSlideState.set(key, state);
  if (htmlPreviewSlideState.size > MAX_CACHED_SLIDE_STATES) {
    const oldest = htmlPreviewSlideState.keys().next().value;
    if (oldest != null) htmlPreviewSlideState.delete(oldest);
  }
}

function waitForIframeLoadOrTimeout(iframe: HTMLIFrameElement, timeout = 750): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      iframe.removeEventListener('load', finish);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, timeout);
    iframe.addEventListener('load', finish, { once: true });
  });
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

function temporarilyExposeIframeForSnapshot(iframe: HTMLIFrameElement): () => void {
  const previousVisibility = iframe.style.visibility;
  const previousOpacity = iframe.style.opacity;
  const previousPointerEvents = iframe.style.pointerEvents;
  iframe.style.visibility = 'visible';
  iframe.style.opacity = '0.001';
  iframe.style.pointerEvents = 'none';
  return () => {
    iframe.style.visibility = previousVisibility;
    iframe.style.opacity = previousOpacity;
    iframe.style.pointerEvents = previousPointerEvents;
  };
}

async function requestPreviewSnapshotWithRetry(
  iframe: HTMLIFrameElement,
  options?: { full?: boolean },
): Promise<Awaited<ReturnType<typeof requestPreviewSnapshot>>> {
  const timeouts = [1500, 3000, 6000];
  for (const timeout of timeouts) {
    const snapshot = await requestPreviewSnapshot(iframe, timeout, options);
    if (snapshot) return snapshot;
    await waitForAnimationFrame();
  }
  return null;
}

function previewViewportStateKey(projectId: string, file: Pick<ProjectFile, 'name' | 'path'>): string {
  return `${projectId}:${file.path || file.name}`;
}

function setPreviewViewportCached(key: string, viewport: PreviewViewportId) {
  htmlPreviewViewportState.set(key, viewport);
  if (htmlPreviewViewportState.size > MAX_CACHED_PREVIEW_VIEWPORTS) {
    const oldest = htmlPreviewViewportState.keys().next().value;
    if (oldest != null) htmlPreviewViewportState.delete(oldest);
  }
}

function setPreviewZoomCached(key: string, zoom: number, zoomMode: 'auto' | 'manual') {
  htmlPreviewZoomState.set(key, { zoom, zoomMode });
  if (htmlPreviewZoomState.size > MAX_CACHED_PREVIEW_ZOOMS) {
    const oldest = htmlPreviewZoomState.keys().next().value;
    if (oldest != null) htmlPreviewZoomState.delete(oldest);
  }
}

function setPreviewContentWidthCached(key: string, entry: Omit<PreviewContentWidthCacheEntry, 'version'> | null) {
  if (entry == null) {
    htmlPreviewContentWidthState.delete(key);
    return;
  }
  htmlPreviewContentWidthState.set(key, {
    version: PREVIEW_CONTENT_WIDTH_CACHE_VERSION,
    ...entry,
  });
  if (htmlPreviewContentWidthState.size > MAX_CACHED_PREVIEW_CONTENT_WIDTHS) {
    const oldest = htmlPreviewContentWidthState.keys().next().value;
    if (oldest != null) htmlPreviewContentWidthState.delete(oldest);
  }
}

function getPreviewContentWidthCached(key: string): PreviewContentWidthCacheEntry | null {
  const entry = htmlPreviewContentWidthState.get(key);
  return entry?.version === PREVIEW_CONTENT_WIDTH_CACHE_VERSION ? entry : null;
}

function getPreviewDocumentEpoch(key: string): string {
  const cached = htmlPreviewDocumentEpochState.get(key);
  if (cached) return cached;
  const epoch = nextPreviewContentMeasurementDocumentEpoch();
  htmlPreviewDocumentEpochState.set(key, epoch);
  if (htmlPreviewDocumentEpochState.size > MAX_CACHED_PREVIEW_CONTENT_WIDTHS) {
    const oldest = htmlPreviewDocumentEpochState.keys().next().value;
    if (oldest != null) htmlPreviewDocumentEpochState.delete(oldest);
  }
  return epoch;
}

interface Props {
  projectId: string;
  projectKind: TrackingProjectKind;
  file: ProjectFile;
  liveHtml?: string;
  filesRefreshKey?: number;
  isDeck?: boolean;
  streaming?: boolean;
  commentQueueOnSend?: boolean;
  commentSendDisabled?: boolean;
  previewComments?: PreviewComment[];
  onSavePreviewComment?: (target: PreviewCommentTarget, note: string, attachAfterSave: boolean, images?: File[], commentId?: string) => Promise<PreviewComment | null>;
  onRemovePreviewComment?: (commentId: string) => Promise<boolean>;
  /**
   * Persist a drag-reorder of the sidebar's display order (recvq5BVsolIxi
   * Phase 2): `sortKey` is the value the caller computed for `commentId`
   * (a midpoint between its new neighbors). Never touches `pinSeq` — the
   * canvas pin number stays whatever it already was.
   */
  onReorderPreviewComment?: (commentId: string, sortKey: number) => Promise<void>;
  onSendBoardCommentAttachments?: (attachments: ChatCommentAttachment[], images?: File[]) => Promise<CommentSendResult> | CommentSendResult;
  onFileSaved?: () => Promise<void> | void;
  onBrandExtractionStopRequest?: () => void;
  // Open `openName` as a tab (focusing it) and close `closeName` in one
  // atomic tab-state update. The React module pointer uses this to jump to the
  // HTML entry that renders a module and drop the dead-end module tab.
  onOpenFileReplacing?: (openName: string, closeName: string) => void;
  commentPortalId?: string;
  onCommentModeChange?: (active: boolean) => void;
  // Bumped nonce asking this viewer to open its Share/Export menu (chat-side
  // "Share" next-step action). Only HTML artifacts expose a Share menu.
  shareRequest?: { nonce: number } | null;
  // Bumped nonce asking this viewer to open its Download/Export menu (chat-side
  // "Download" next-step action).
  downloadRequest?: { nonce: number } | null;
  // Bumped nonce asking a deck preview to flip to `slideIndex` (a queued chat
  // send for this file just started processing).
  slideNavRequest?: { slideIndex: number; nonce: number } | null;
  // Read-only viewer of a team-shared project: the viewer can comment but not
  // edit, export, share, download, or send changes to Chat.
  viewerOnly?: boolean;
  projectName?: string;
  projectDir?: string | null;
  agents?: AgentInfo[];
  artifactId?: string;
  artifactKind?: TrackingArtifactKind;
  metricsConsent?: boolean;
  installationId?: string | null;
  /** False while this viewer is retained offscreen for an instant tab revisit. */
  workspaceActive?: boolean;
  /** Pin viewers that still own an in-progress edit so LRU eviction cannot drop work. */
  onRetainActivityChange?: (fileName: string, retain: boolean) => void;
  /** Register the safe manual-edit exit used to guard workspace navigation. */
  onManualEditExitHandlerChange?: (
    fileName: string,
    handler: (() => Promise<boolean>) | null,
  ) => void;
  /** Prevent a second retained viewer from entering Manual Edit. */
  manualEditEntryAllowed?: boolean;
}

function FileViewerLoadingSkeleton() {
  const t = useT();
  return (
    <div
      className="viewer-loading"
      role="status"
      aria-busy="true"
      aria-label={t('fileViewer.loading')}
    >
      <div className="viewer-loading-stage" aria-hidden="true">
        <span className="viewer-loading-card viewer-loading-card-back viewer-loading-card-back-two" />
        <span className="viewer-loading-card viewer-loading-card-back viewer-loading-card-back-one" />
        <span className="viewer-loading-card viewer-loading-card-main">
          <span className="viewer-loading-kicker" />
          <span className="viewer-loading-title" />
          <span className="viewer-loading-title viewer-loading-title-short" />
          <span className="viewer-loading-rule" />
          <span className="viewer-loading-content">
            <span className="viewer-loading-copy">
              <span className="viewer-loading-line" />
              <span className="viewer-loading-line viewer-loading-line-medium" />
              <span className="viewer-loading-line viewer-loading-line-short" />
            </span>
            <span className="viewer-loading-chart">
              <span className="viewer-loading-bar viewer-loading-bar-one" />
              <span className="viewer-loading-bar viewer-loading-bar-two" />
              <span className="viewer-loading-bar viewer-loading-bar-three" />
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

// Memoized so FileWorkspace-local state churn (tab drag hover, closing a
// NEIGHBORING tab, launcher toggles) skips this whole subtree — the live
// preview iframes below are the most expensive thing on screen. Relies on
// FileWorkspace passing identity-stable props (see the activeFile* memos
// there).
export const FileViewer = memo(function FileViewer({
  projectId,
  projectKind,
  file,
  liveHtml,
  filesRefreshKey = 0,
  isDeck,
  streaming,
  commentQueueOnSend = false,
  commentSendDisabled = false,
  previewComments = [],
  onSavePreviewComment,
  onRemovePreviewComment,
  onReorderPreviewComment,
  onSendBoardCommentAttachments,
  onFileSaved,
  onBrandExtractionStopRequest,
  onOpenFileReplacing,
  commentPortalId,
  onCommentModeChange,
  shareRequest,
  downloadRequest,
  slideNavRequest,
  viewerOnly = false,
  projectName,
  projectDir,
  agents,
  artifactId,
  artifactKind,
  metricsConsent,
  installationId,
  workspaceActive = true,
  onRetainActivityChange,
  onManualEditExitHandlerChange,
  manualEditEntryAllowed = true,
}: Props) {
  const t = useT();
  const projectCollabContext = useProjectCollabContext();
  const projectResourceAuthority = projectCollabContext.projectResourceAuthority
    ?? (projectCollabContext.workspaceContextLoading
      ? 'pending'
      : projectCollabContext.workspaceContext
        ? 'workspace'
        : 'local');
  const projectResourceReadAllowed = projectResourceAuthority === 'local'
    || (
      projectResourceAuthority === 'workspace'
      && projectCollabContext.workspaceContext !== null
    );
  const rendererMatch = artifactRendererRegistry.resolve({
    file,
    isDeckHint: Boolean(isDeck),
  });

  // studio_view artifact — fire once per (project, file) pair so the
  // activation funnel can attribute "user opened the produced artifact"
  // even when the sub-viewer below is HtmlViewer / MarkdownViewer / etc.
  // artifact_id is anonymized to satisfy the CSV's no-filename rule.
  const analytics = useAnalytics();
  const studioViewKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!workspaceActive) return;
    const key = `${projectId}::${file.name}`;
    if (studioViewKeyRef.current === key) return;
    studioViewKeyRef.current = key;
    trackPageView(analytics.track, {
      page_name: 'artifact',
    });
  }, [projectId, projectKind, file.name, file.kind, rendererMatch?.renderer.id, analytics.track, workspaceActive]);
  useEffect(() => {
    if (projectResourceReadAllowed) return;
    invalidateHtmlSourceSnapshotProject(projectId);
  }, [projectId, projectResourceReadAllowed]);

  if (!projectResourceReadAllowed) {
    if (projectResourceAuthority === 'denied') {
      return (
        <div className="viewer">
          <div className="viewer-body">
            <div className="viewer-empty">{t('fileViewer.previewUnavailable')}</div>
          </div>
        </div>
      );
    }
    return <FileViewerLoadingSkeleton />;
  }

  if (rendererMatch?.renderer.id === 'html' || rendererMatch?.renderer.id === 'deck-html') {
    return (
      <HtmlViewer
        projectId={projectId}
        projectKind={projectKind}
        file={file}
        liveHtml={liveHtml}
        filesRefreshKey={filesRefreshKey}
        isDeck={rendererMatch.renderer.id === 'deck-html'}
        streaming={Boolean(streaming)}
        commentQueueOnSend={commentQueueOnSend}
        commentSendDisabled={commentSendDisabled}
        previewComments={previewComments}
        onSavePreviewComment={onSavePreviewComment}
        onRemovePreviewComment={onRemovePreviewComment}
        onReorderPreviewComment={onReorderPreviewComment}
        onSendBoardCommentAttachments={onSendBoardCommentAttachments}
        onFileSaved={onFileSaved}
        onBrandExtractionStopRequest={onBrandExtractionStopRequest}
        onOpenFileReplacing={onOpenFileReplacing}
        commentPortalId={commentPortalId}
        onCommentModeChange={onCommentModeChange}
        shareRequest={shareRequest}
        downloadRequest={downloadRequest}
        slideNavRequest={slideNavRequest}
        viewerOnly={viewerOnly}
        projectName={projectName}
        projectDir={projectDir}
        agents={agents}
        artifactId={artifactId}
        artifactKind={artifactKind}
        metricsConsent={metricsConsent}
        installationId={installationId}
        workspaceActive={workspaceActive}
        onRetainActivityChange={onRetainActivityChange}
        onManualEditExitHandlerChange={onManualEditExitHandlerChange}
        manualEditEntryAllowed={manualEditEntryAllowed}
      />
    );
  }
  if (rendererMatch?.renderer.id === 'react-component') {
    return (
      <ReactComponentViewer
        projectId={projectId}
        projectKind={projectKind}
        file={file}
        onOpenFileReplacing={onOpenFileReplacing}
        projectName={projectName}
        projectDir={projectDir}
        agents={agents}
        artifactId={artifactId}
        artifactKind={artifactKind}
        metricsConsent={metricsConsent}
        installationId={installationId}
        viewerOnly={viewerOnly}
        workspaceActive={workspaceActive}
      />
    );
  }
  if (rendererMatch?.renderer.id === 'markdown') {
    return (
      <MarkdownViewer
        projectId={projectId}
        file={file}
        onFileSaved={onFileSaved}
        viewerOnly={viewerOnly}
      />
    );
  }
  if (rendererMatch?.renderer.id === 'svg') {
    return <SvgViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'image') {
    return <ImageViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'video') {
    return <VideoViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'audio') {
    return <AudioViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'sketch') {
    if (isRenderableSketchJson(file)) {
      return <SketchViewer projectId={projectId} file={file} />;
    }
    return <ImageViewer projectId={projectId} file={file} />;
  }
  if (file.kind === 'text' || file.kind === 'code') {
    return <TextViewer projectId={projectId} file={file} />;
  }
  if (
    file.kind === 'pdf' ||
    file.kind === 'document' ||
    file.kind === 'presentation' ||
    file.kind === 'spreadsheet'
  ) {
    return <DocumentPreviewViewer projectId={projectId} file={file} />;
  }
  return <BinaryViewer projectId={projectId} file={file} />;
});

export function LiveArtifactViewer({
  projectId,
  liveArtifact,
  liveArtifactEvents = [],
  onRefreshArtifacts,
}: {
  projectId: string;
  liveArtifact: LiveArtifactWorkspaceEntry;
  liveArtifactEvents?: LiveArtifactEventItem[];
  onRefreshArtifacts?: () => Promise<void> | void;
}) {
  const t = useT();
  const { workspaceContext } = useProjectCollabContext();
  const tabs = useMemo(() => liveArtifactViewerTabs(t), [t]);
  const [mode, setMode] = useState<LiveArtifactViewerTab>('preview');
  const [detail, setDetail] = useState<LiveArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [zoom, setZoom] = useState(100);
  const liveArtifactViewportKey = `${projectId}:live-artifact:${liveArtifact.artifactId}`;
  const [previewViewport, setPreviewViewportState] = useState<PreviewViewportId>(
    () => htmlPreviewViewportState.get(liveArtifactViewportKey) ?? 'desktop',
  );
  const setPreviewViewport = useCallback((viewport: PreviewViewportId) => {
    setPreviewViewportCached(liveArtifactViewportKey, viewport);
    setPreviewViewportState(viewport);
  }, [liveArtifactViewportKey]);
  const [previewBodyRef, previewBodySize] = usePreviewCanvasSize<HTMLDivElement>();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshSuccess, setRefreshSuccess] = useState<string | null>(null);
  const [refreshEvents, setRefreshEvents] = useState<LiveArtifactRefreshEvent[]>([]);
  const [refreshHistory, setRefreshHistory] = useState<LiveArtifactRefreshLogEntry[]>([]);
  const [presentMenuOpen, setPresentMenuOpen] = useState(false);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement | null>(null);
  const [inTabPresent, setInTabPresent] = useState(false);
  const presentWrapRef = useRef<HTMLDivElement | null>(null);
  const [chromeActionsHost, setChromeActionsHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    setChromeActionsHost(resolveChromeActionsHost());
  }, []);
  useEffect(() => {
    if (!presentMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.present-wrap')) return;
      setPresentMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresentMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [presentMenuOpen]);

  useEffect(() => {
    setRefreshError(null);
    setRefreshSuccess(null);
    setRefreshEvents([]);
  }, [projectId, liveArtifact.artifactId]);

  useEffect(() => {
    setPreviewViewportState(htmlPreviewViewportState.get(liveArtifactViewportKey) ?? 'desktop');
  }, [liveArtifactViewportKey]);

  useEffect(() => {
    if (!refreshSuccess) return;
    const timeout = window.setTimeout(() => setRefreshSuccess(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [refreshSuccess]);

  const processedLiveArtifactEventIdRef = useRef(0);

  useEffect(() => {
    const pendingEvents = liveArtifactEvents.filter((item) => item.id > processedLiveArtifactEventIdRef.current);
    if (pendingEvents.length === 0) return;
    processedLiveArtifactEventIdRef.current = pendingEvents[pendingEvents.length - 1]?.id ?? processedLiveArtifactEventIdRef.current;

    for (const { event: liveArtifactEvent } of pendingEvents) {
    if (
      (liveArtifactEvent.kind !== 'live_artifact' && liveArtifactEvent.kind !== 'live_artifact_refresh') ||
      liveArtifactEvent.projectId !== projectId ||
      liveArtifactEvent.artifactId !== liveArtifact.artifactId
    ) {
      continue;
    }

    if (liveArtifactEvent.kind === 'live_artifact') {
      setRefreshError(null);
      if (liveArtifactEvent.action === 'deleted') {
        setRefreshSuccess(`Live artifact deleted: ${liveArtifactEvent.title}`);
        continue;
      }
      setRefreshSuccess(
        liveArtifactEvent.action === 'created'
          ? `Live artifact created: ${liveArtifactEvent.title}`
          : `Live artifact updated: ${liveArtifactEvent.title}`,
      );
      void fetchLiveArtifact(projectId, liveArtifact.artifactId, workspaceContext).then((next) => {
        if (next) setDetail(next);
      });
      void fetchLiveArtifactRefreshes(
        projectId,
        liveArtifact.artifactId,
        workspaceContext,
      ).then(setRefreshHistory);
      setReloadKey((n) => n + 1);
      continue;
    }

    if (liveArtifactEvent.phase === 'started') {
      setRefreshing(true);
      setRefreshError(null);
      setRefreshSuccess(null);
      setRefreshEvents((prev) => appendRefreshEvent(prev, { phase: 'started' }));
      continue;
    }

    if (liveArtifactEvent.phase === 'failed') {
      setRefreshing(false);
      setRefreshError(liveArtifactEvent.error ?? t('liveArtifact.refresh.genericFailure'));
      setRefreshEvents((prev) =>
        appendRefreshEvent(prev, {
          phase: 'failed',
          error: liveArtifactEvent.error ?? undefined,
        }),
      );
      void fetchLiveArtifact(projectId, liveArtifact.artifactId, workspaceContext).then((next) => {
        if (next) setDetail(next);
      });
      void fetchLiveArtifactRefreshes(
        projectId,
        liveArtifact.artifactId,
        workspaceContext,
      ).then(setRefreshHistory);
      continue;
    }

    setRefreshing(false);
    setRefreshError(null);
    setRefreshEvents((prev) =>
      appendRefreshEvent(prev, {
        phase: 'succeeded',
        refreshedSourceCount: liveArtifactEvent.refreshedSourceCount ?? 0,
      }),
    );
    if ((liveArtifactEvent.refreshedSourceCount ?? 0) > 0) {
      setRefreshSuccess(t('liveArtifact.refresh.successOne'));
    } else {
      setRefreshError(t('liveArtifact.refresh.noSourceTitle'));
    }
    void fetchLiveArtifact(projectId, liveArtifact.artifactId, workspaceContext).then((next) => {
      if (next) setDetail(next);
    });
    void fetchLiveArtifactRefreshes(
      projectId,
      liveArtifact.artifactId,
      workspaceContext,
    ).then(setRefreshHistory);
    setReloadKey((n) => n + 1);
    }
  }, [liveArtifactEvents, liveArtifact.artifactId, projectId, t, workspaceContext]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    void fetchLiveArtifact(projectId, liveArtifact.artifactId, workspaceContext).then((next) => {
      if (cancelled) return;
      setDetail(next);
      setLoading(false);
    });
    void fetchLiveArtifactRefreshes(
      projectId,
      liveArtifact.artifactId,
      workspaceContext,
    ).then((next) => {
      if (!cancelled) setRefreshHistory(next);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, liveArtifact.artifactId, liveArtifact.updatedAt, workspaceContext]);

  const previewUrl = useMemo(
    () => appendResourceQuery(
      liveArtifactPreviewUrl(projectId, liveArtifact.artifactId, 'rendered', workspaceContext),
      `v=${reloadKey}`,
    ),
    [projectId, liveArtifact.artifactId, reloadKey, workspaceContext],
  );
  const previewScale = zoom / 100;

  // Instrument the live-artifact iframe so failed loads — usually a
  // missing artifact file or a stuck `od://` resolver — surface in
  // PostHog. iframe load errors don't propagate to window.error, so
  // observability/install.ts cannot catch them globally.
  useEffect(() => {
    if (mode !== 'preview') return undefined;
    const node = iframeRef.current;
    if (!node) return undefined;
    return trackIframeLoad({
      iframe: node,
      surface: 'live_artifact_preview',
      artifactId: liveArtifact.artifactId,
      projectId,
    });
  }, [mode, previewUrl, liveArtifact.artifactId, projectId]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    setRefreshSuccess(null);
    setRefreshEvents((prev) => appendRefreshEvent(prev, { phase: 'started' }));
    try {
      const result = await refreshLiveArtifact(
        projectId,
        liveArtifact.artifactId,
        workspaceContext,
      );
      setDetail(result.artifact);
      void fetchLiveArtifactRefreshes(
        projectId,
        liveArtifact.artifactId,
        workspaceContext,
      ).then(setRefreshHistory);
      setReloadKey((n) => n + 1);
      setRefreshEvents((prev) =>
        appendRefreshEvent(prev, {
          phase: 'succeeded',
          refreshedSourceCount: result.refresh.refreshedSourceCount,
        }),
      );
      if (result.refresh.refreshedSourceCount > 0) {
        setRefreshSuccess(t('liveArtifact.refresh.successOne'));
      } else {
        setRefreshError(t('liveArtifact.refresh.noSourceTitle'));
      }
      await onRefreshArtifacts?.();
    } catch (error) {
      const message = refreshErrorMessage(error, t);
      setRefreshError(message);
      setRefreshEvents((prev) => appendRefreshEvent(prev, { phase: 'failed', error: message }));
    } finally {
      setRefreshing(false);
    }
  }

  const dataPayload = detail?.document?.dataJson ?? null;
  const currentRefreshStatus = detail?.refreshStatus ?? liveArtifact.refreshStatus;
  const isRunning = refreshing || currentRefreshStatus === 'running';

  const presentInThisTab = () => {
    setPresentMenuOpen(false);
    setMode('preview');
    setInTabPresent(true);
  };
  const presentFullscreen = () => {
    setPresentMenuOpen(false);
    setMode('preview');
    const target = previewBodyRef.current ?? iframeRef.current;
    if (target?.requestFullscreen) {
      void target.requestFullscreen().catch(() => {});
    }
  };
  const presentNewTab = () => {
    setPresentMenuOpen(false);
    if (typeof window === 'undefined') return;
    window.open(
      liveArtifactPreviewUrl(projectId, liveArtifact.artifactId, 'rendered', workspaceContext),
      '_blank',
      'noopener,noreferrer',
    );
  };
  useEffect(() => {
    if (!inTabPresent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInTabPresent(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inTabPresent]);

  useEffect(() => {
    if (!zoomMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!zoomMenuRef.current) return;
      if (!zoomMenuRef.current.contains(e.target as Node)) setZoomMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [zoomMenuOpen]);

  return (
    <div className={`viewer html-viewer live-artifact-viewer${inTabPresent ? ' is-tab-present' : ''}`}>
      {((node: ReactNode) => (
        chromeActionsHost ? createPortal(node, chromeActionsHost) : node
      ))(
        <div className="present-wrap chrome-present-wrap" ref={presentWrapRef}>
          <button
            className="chrome-action chrome-action-secondary chrome-action-icon present-trigger od-tooltip"
            aria-haspopup="menu"
            aria-expanded={presentMenuOpen}
            aria-label={t('fileViewer.present')}
            data-tooltip={t('fileViewer.present')}
            data-tooltip-placement="bottom"
            title={t('fileViewer.present')}
            onClick={() => setPresentMenuOpen((v) => !v)}
          >
            <RemixIcon name="slideshow-3-line" size={15} />
          </button>
          {presentMenuOpen ? (
            <div className="present-menu" role="menu">
              <button role="menuitem" onClick={presentInThisTab}>
                <span className="present-icon"><RemixIcon name="eye-line" size={14} /></span>{' '}
                {t('fileViewer.presentInTab')}
              </button>
              <button role="menuitem" onClick={presentFullscreen}>
                <span className="present-icon"><RemixIcon name="play-line" size={14} /></span>{' '}
                {t('fileViewer.presentFullscreen')}
              </button>
              <button role="menuitem" onClick={presentNewTab}>
                <span className="present-icon"><RemixIcon name="share-forward-line" size={14} /></span>{' '}
                {t('fileViewer.presentNewTab')}
              </button>
            </div>
          ) : null}
        </div>
      )}
      {inTabPresent ? (
        <button
          type="button"
          className="present-exit-btn"
          onClick={() => setInTabPresent(false)}
          title={t('common.exitFullscreen')}
          aria-label={t('common.exitFullscreen')}
        >
          <Icon name="close" size={14} />
        </button>
      ) : null}
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
            <button
              type="button"
              className="icon-only od-tooltip"
              onClick={() => setReloadKey((n) => n + 1)}
              title={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
              data-tooltip={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
              data-tooltip-placement="bottom"
              aria-label={`${t('fileViewer.reloadAria')} ${t('fileViewer.preview')}`}
            >
            <Icon name="reload" size={14} />
          </button>
        </div>
        <div className="viewer-toolbar-actions">
          <div className="viewer-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`viewer-tab ${mode === tab.id ? 'active' : ''}`}
                onClick={() => setMode(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div
            className="viewer-preview-controls"
            data-active={mode === 'preview' ? 'true' : 'false'}
            aria-hidden={mode === 'preview' ? undefined : true}
          >
            <PreviewViewportControls
              viewport={previewViewport}
              onViewport={setPreviewViewport}
              t={t}
              tabIndex={mode === 'preview' ? 0 : -1}
            />
            <span className="viewer-divider" aria-hidden />
            <div className="zoom-menu viewer-toolbar-zoom" ref={zoomMenuRef}>
              <button
                type="button"
                className="viewer-action zoom-trigger od-tooltip"
                aria-haspopup="menu"
                aria-expanded={zoomMenuOpen}
                title={t('fileViewer.resetZoom')}
                data-tooltip={t('fileViewer.resetZoom')}
                data-tooltip-placement="bottom"
                tabIndex={mode === 'preview' ? 0 : -1}
                onClick={() => setZoomMenuOpen((v) => !v)}
              >
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{zoom}%</span>
              </button>
              {zoomMenuOpen && mode === 'preview' ? (
                <div className="zoom-menu-popover" role="menu">
                  {[50, 75, 100, 125, 150, 200].map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={`zoom-menu-item${zoom === level ? ' active' : ''}`}
                      role="menuitem"
                      onClick={() => {
                        setZoom(level);
                        setZoomMenuOpen(false);
                      }}
                    >
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{level}%</span>
                      {zoom === level ? (
                        <Icon name="check" size={13} />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <span className="viewer-divider" aria-hidden />
            <a
              className="ghost-link"
              href={liveArtifactPreviewUrl(
                projectId,
                liveArtifact.artifactId,
                'rendered',
                workspaceContext,
              )}
              target="_blank"
              rel="noreferrer noopener"
              tabIndex={mode === 'preview' ? 0 : -1}
            >
              {t('fileViewer.open')}
            </a>
          </div>
          <span className="viewer-divider" aria-hidden />
          <button
            type="button"
            className="viewer-action primary"
            data-running={isRunning ? 'true' : 'false'}
            onClick={() => void handleRefresh()}
            disabled={isRunning}
            aria-busy={isRunning}
            aria-label={isRunning ? t('liveArtifact.refresh.running') : t('liveArtifact.refresh.button')}
            title={
              isRunning
                ? t('liveArtifact.refresh.running')
                : t('liveArtifact.refresh.buttonTitle')
            }
          >
            <Icon name={isRunning ? 'spinner' : 'reload'} size={13} />
            <span>{isRunning ? t('liveArtifact.refresh.running') : t('liveArtifact.refresh.button')}</span>
          </button>
        </div>
      </div>
      <div className="viewer-body" ref={previewBodyRef}>
        {refreshError ? (
          <LiveArtifactRefreshNotice
            tone="error"
            message={refreshError}
            action={t('liveArtifact.refresh.failureAction')}
          />
        ) : refreshSuccess ? (
          <LiveArtifactRefreshNotice
            tone="success"
            message={refreshSuccess}
            action={t('liveArtifact.refresh.successAction')}
            onDismiss={() => setRefreshSuccess(null)}
            dismissLabel={t('common.close')}
          />
        ) : isRunning ? (
          <LiveArtifactRefreshNotice
            tone="running"
            message={t('liveArtifact.refresh.runningMessage')}
            action={t('liveArtifact.refresh.runningAction')}
          />
        ) : currentRefreshStatus === 'failed' ? (
          <LiveArtifactRefreshNotice
            tone="error"
            message={t('liveArtifact.refresh.previousFailure', { message: t('liveArtifact.refresh.genericFailure') })}
            action={t('liveArtifact.refresh.failureAction')}
          />
        ) : null}
        <div
          className={`live-artifact-preview-layer preview-viewport preview-viewport-${previewViewport}`}
          data-active={mode === 'preview' ? 'true' : 'false'}
          aria-hidden={mode === 'preview' ? undefined : true}
          style={previewViewportStyle(previewViewport, previewScale, previewBodySize)}
        >
          <div className="preview-frame-clip">
            <div style={previewScaleShellStyle(previewViewport, previewScale)}>
              <PreviewDrawOverlay>
                <iframe
                  ref={iframeRef}
                  data-testid="live-artifact-preview-frame"
                  title={liveArtifact.title}
                  sandbox="allow-scripts allow-popups allow-downloads"
                  src={previewUrl}
                />
              </PreviewDrawOverlay>
            </div>
          </div>
        </div>
        {mode !== 'preview' && loading ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : mode === 'code' ? (
          <LiveArtifactCodePanel
            projectId={projectId}
            artifactId={liveArtifact.artifactId}
            reloadKey={reloadKey}
          />
        ) : mode === 'data' ? (
          <JsonPanel value={dataPayload} emptyLabel={t('liveArtifact.viewer.dataEmpty')} />
        ) : (
          <LiveArtifactRefreshHistoryPanel
            liveArtifact={detail}
            fallbackRefreshStatus={liveArtifact.refreshStatus}
            fallbackLastRefreshedAt={liveArtifact.lastRefreshedAt}
            isRunning={isRunning}
            sessionEvents={refreshEvents}
            persistedEvents={refreshHistory}
          />
        )}
      </div>
    </div>
  );
}

function LiveArtifactRefreshNotice({
  tone,
  message,
  action,
  onDismiss,
  dismissLabel,
}: {
  tone: 'running' | 'success' | 'error';
  message: string;
  action: string;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  return (
    <div
      className={`live-artifact-refresh-notice ${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-label={`${message} ${action}`}
    >
      <span className="live-artifact-refresh-notice-copy">
        <strong>{message}</strong>
        <span>{action}</span>
      </span>
      {onDismiss ? (
        <button type="button" className="icon-only" onClick={onDismiss} aria-label={dismissLabel}>
          ×
        </button>
      ) : null}
    </div>
  );
}

function refreshErrorMessage(error: unknown, t: TranslateFn): string {
  if (error instanceof LiveArtifactRefreshError && error.status === 0) {
    return t('liveArtifact.refresh.networkFailure');
  }
  if (error instanceof LiveArtifactRefreshError && error.code === 'LIVE_ARTIFACT_REFRESH_UNAVAILABLE') {
    return t('liveArtifact.refresh.noSourceTitle');
  }
  if (error instanceof Error && error.message.length > 0) return error.message;
  return t('liveArtifact.refresh.genericFailure');
}

function liveArtifactViewerTabs(t: TranslateFn): Array<{ id: LiveArtifactViewerTab; label: string }> {
  return [
    { id: 'preview', label: t('liveArtifact.viewer.tabPreview') },
    { id: 'code', label: t('liveArtifact.viewer.tabCode') },
    { id: 'data', label: t('liveArtifact.viewer.tabData') },
    { id: 'refresh-history', label: t('liveArtifact.viewer.tabRefreshHistory') },
  ];
}

type LiveArtifactCodeVariant = 'template' | 'rendered-source';

function LiveArtifactCodePanel({
  projectId,
  artifactId,
  reloadKey,
}: {
  projectId: string;
  artifactId: string;
  reloadKey: number;
}) {
  const t = useT();
  const { workspaceContext } = useProjectCollabContext();
  const [variant, setVariant] = useState<LiveArtifactCodeVariant>('template');
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setCode(null);
    void fetchLiveArtifactCode(projectId, artifactId, variant, workspaceContext).then((next) => {
      if (cancelled) return;
      setCode(next);
      setFailed(next == null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [artifactId, projectId, reloadKey, variant, workspaceContext]);

  return (
    <div className="live-artifact-code-panel">
      <div className="live-artifact-code-header">
        <div className="live-artifact-code-copy">
          <strong>
            {variant === 'template'
              ? t('liveArtifact.viewer.code.templateHeading')
              : t('liveArtifact.viewer.code.renderedHeading')}
          </strong>
          <span>
            {variant === 'template'
              ? t('liveArtifact.viewer.code.templateHelp')
              : t('liveArtifact.viewer.code.renderedHelp')}
          </span>
        </div>
        <div
          className="viewer-tabs live-artifact-code-tabs"
          aria-label={t('liveArtifact.viewer.code.variantAria')}
        >
          <button
            type="button"
            className={`viewer-tab ${variant === 'template' ? 'active' : ''}`}
            onClick={() => setVariant('template')}
          >
            {t('liveArtifact.viewer.code.variantTemplate')}
          </button>
          <button
            type="button"
            className={`viewer-tab ${variant === 'rendered-source' ? 'active' : ''}`}
            onClick={() => setVariant('rendered-source')}
          >
            {t('liveArtifact.viewer.code.variantRendered')}
          </button>
        </div>
      </div>
      {loading ? (
        <div className="viewer-empty">{t('liveArtifact.viewer.code.loading')}</div>
      ) : failed ? (
        <div className="viewer-empty">{t('liveArtifact.viewer.code.unavailable')}</div>
      ) : code && code.trim().length > 0 ? (
        <pre className="viewer-source">{code}</pre>
      ) : (
        <div className="viewer-empty">{t('liveArtifact.viewer.code.empty')}</div>
      )}
    </div>
  );
}

function JsonPanel({ value, emptyLabel }: { value: unknown; emptyLabel: string }) {
  if (value == null) return <div className="viewer-empty">{emptyLabel}</div>;
  return <pre className="viewer-source">{JSON.stringify(value, null, 2)}</pre>;
}

function liveArtifactMetadataPayload(liveArtifact: LiveArtifact): unknown {
  return {
    artifact: {
      id: liveArtifact.id,
      title: liveArtifact.title,
      slug: liveArtifact.slug,
      status: liveArtifact.status,
      pinned: liveArtifact.pinned,
      preview: liveArtifact.preview,
      refreshStatus: liveArtifact.refreshStatus,
      createdAt: liveArtifact.createdAt,
      updatedAt: liveArtifact.updatedAt,
      lastRefreshedAt: liveArtifact.lastRefreshedAt,
    },
    document: liveArtifact.document
      ? {
          format: liveArtifact.document.format,
          templatePath: liveArtifact.document.templatePath,
          generatedPreviewPath: liveArtifact.document.generatedPreviewPath,
          dataPath: liveArtifact.document.dataPath,
          dataSchemaJson: liveArtifact.document.dataSchemaJson,
          sourceJson: liveArtifact.document.sourceJson,
        }
      : null,
  };
}

function liveArtifactProvenancePayload(liveArtifact: LiveArtifact): unknown {
  return {
    documentSource: liveArtifact.document?.sourceJson ?? null,
  };
}

function liveArtifactRefreshPayload(liveArtifact: LiveArtifact): unknown {
  return {
    refreshStatus: liveArtifact.refreshStatus,
    lastRefreshedAt: liveArtifact.lastRefreshedAt ?? null,
  };
}

type LiveArtifactRefreshStatus = LiveArtifact['refreshStatus'];

interface LiveArtifactRefreshEvent {
  id: number;
  phase: 'started' | 'succeeded' | 'failed';
  at: number;
  durationMs?: number;
  refreshedSourceCount?: number;
  error?: string;
}

let refreshEventSequence = 0;

function appendRefreshEvent(
  prev: LiveArtifactRefreshEvent[],
  next: Omit<LiveArtifactRefreshEvent, 'id' | 'at' | 'durationMs'>,
): LiveArtifactRefreshEvent[] {
  const at = Date.now();
  refreshEventSequence += 1;
  const event: LiveArtifactRefreshEvent = { ...next, id: refreshEventSequence, at };
  if (next.phase !== 'started') {
    // Pair with the most recent 'started' to compute duration.
    for (let i = prev.length - 1; i >= 0; i -= 1) {
      const candidate = prev[i];
      if (candidate && candidate.phase === 'started') {
        event.durationMs = Math.max(0, at - candidate.at);
        break;
      }
    }
  }
  // Cap at 25 entries to keep the panel lightweight.
  const MAX = 25;
  const combined = [...prev, event];
  return combined.length > MAX ? combined.slice(combined.length - MAX) : combined;
}

function formatAbsoluteDateTime(iso: string | number | undefined): string | null {
  if (iso === undefined || iso === null) return null;
  const date = typeof iso === 'number' ? new Date(iso) : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return date.toISOString();
  }
}

function formatRelativeTime(
  iso: string | number | undefined,
  now = Date.now(),
  locale: Locale = 'en',
  t?: TranslateFn,
): string | null {
  if (iso === undefined || iso === null) return null;
  const ms = typeof iso === 'number' ? iso : new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const deltaSec = Math.round((ms - now) / 1000);
  const abs = Math.abs(deltaSec);
  if (abs < 5) {
    // "just now" lives in the i18n dict because Intl.RelativeTimeFormat's
    // "0 seconds ago" reads awkwardly in narrow style and we want a
    // single canonical translation per locale. Fall back to the English
    // literal only when called without t (background utilities, tests).
    return t ? t('liveArtifact.refresh.justNow') : 'just now';
  }
  // Intl.RelativeTimeFormat handles tense (past / future), pluralisation,
  // and word-order per locale so the panel matches the rest of the
  // localised UI instead of mixing in English units like `5s ago`.
  // `style: 'narrow'` keeps the English output close to the historical
  // `5s ago` shape; `numeric: 'always'` forces numeric output so we
  // don't get "yesterday" / "now" mixed in unexpectedly with the
  // bucketing above.
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(locale, { style: 'narrow', numeric: 'always' });
  } catch {
    rtf = new Intl.RelativeTimeFormat('en', { style: 'narrow', numeric: 'always' });
  }
  const value = deltaSec; // negative = past, positive = future
  if (abs < 60) return rtf.format(value, 'second');
  if (abs < 3600) return rtf.format(Math.round(value / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(value / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(value / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(value / (86400 * 30)), 'month');
  return rtf.format(Math.round(value / (86400 * 365)), 'year');
}

function formatDurationMs(ms: number | undefined): string | null {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return null;
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function exportReadyNudgeKey(projectId: string, fileName: string): string {
  return `${EXPORT_READY_NUDGE_STORAGE_PREFIX}${projectId}:${fileName}`;
}

function hasSeenExportReadyNudge(projectId: string, fileName: string): boolean {
  try {
    return window.sessionStorage.getItem(exportReadyNudgeKey(projectId, fileName)) === '1';
  } catch {
    return false;
  }
}

function markExportReadyNudgeSeen(projectId: string, fileName: string) {
  try {
    window.sessionStorage.setItem(exportReadyNudgeKey(projectId, fileName), '1');
  } catch {
    // Ignore storage-denied contexts; the in-memory state still prevents loops.
  }
}

interface RefreshStatusDescriptor {
  label: string;
  tone: 'neutral' | 'running' | 'success' | 'warning' | 'error';
  description: string;
}

function describeRefreshStatus(
  status: LiveArtifactRefreshStatus,
  t: TranslateFn,
): RefreshStatusDescriptor {
  switch (status) {
    case 'running':
      return {
        label: t('liveArtifact.refresh.statusRunning'),
        tone: 'running',
        description: t('liveArtifact.refresh.statusRunningDescription'),
      };
    case 'succeeded':
      return {
        label: t('liveArtifact.refresh.statusSucceeded'),
        tone: 'success',
        description: t('liveArtifact.refresh.statusSucceededDescription'),
      };
    case 'failed':
      return {
        label: t('liveArtifact.refresh.statusFailed'),
        tone: 'error',
        description: t('liveArtifact.refresh.statusFailedDescription'),
      };
    case 'idle':
      return {
        label: t('liveArtifact.refresh.statusReady'),
        tone: 'neutral',
        description: t('liveArtifact.refresh.statusReadyDescription'),
      };
    case 'never':
    default:
      return {
        label: t('liveArtifact.refresh.statusNever'),
        tone: 'warning',
        description: t('liveArtifact.refresh.statusNeverDescription'),
      };
  }
}

function describeEventPhase(
  event: LiveArtifactRefreshEvent,
  t: TranslateFn,
): { label: string; tone: 'running' | 'success' | 'error' } {
  if (event.phase === 'started')
    return { label: t('liveArtifact.refresh.eventStarted'), tone: 'running' };
  if (event.phase === 'succeeded')
    return { label: t('liveArtifact.refresh.eventSucceeded'), tone: 'success' };
  return { label: t('liveArtifact.refresh.eventFailed'), tone: 'error' };
}

function describePersistedStatus(
  status: LiveArtifactRefreshLogEntry['status'],
  t: TranslateFn,
): string {
  switch (status) {
    case 'succeeded':
      return t('liveArtifact.refresh.persistedStatusSucceeded');
    case 'running':
      return t('liveArtifact.refresh.persistedStatusRunning');
    case 'failed':
      return t('liveArtifact.refresh.persistedStatusFailed');
    case 'cancelled':
      return t('liveArtifact.refresh.persistedStatusCancelled');
    case 'skipped':
      return t('liveArtifact.refresh.persistedStatusSkipped');
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function LiveArtifactRefreshHistoryPanel({
  liveArtifact,
  fallbackRefreshStatus,
  fallbackLastRefreshedAt,
  isRunning,
  sessionEvents,
  persistedEvents = [],
}: {
  liveArtifact: LiveArtifact | null;
  fallbackRefreshStatus: LiveArtifactRefreshStatus;
  fallbackLastRefreshedAt?: string;
  isRunning: boolean;
  sessionEvents: LiveArtifactRefreshEvent[];
  persistedEvents?: LiveArtifactRefreshLogEntry[];
}) {
  const t = useT();
  const { locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Keep relative timestamps fresh; 30s cadence is enough for "x minutes ago" feel.
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const status: LiveArtifactRefreshStatus = isRunning
    ? 'running'
    : liveArtifact?.refreshStatus ?? fallbackRefreshStatus;
  const descriptor = describeRefreshStatus(status, t);
  const lastRefreshedAt = liveArtifact?.lastRefreshedAt ?? fallbackLastRefreshedAt;
  const createdAt = liveArtifact?.createdAt;
  const updatedAt = liveArtifact?.updatedAt;
  const documentSource = liveArtifact?.document?.sourceJson ?? null;
  const reversedEvents = [...sessionEvents].reverse();
  const reversedPersistedEvents = [...persistedEvents].reverse().slice(0, 25);
  const rawDebugPayload = liveArtifact
    ? {
        refresh: liveArtifactRefreshPayload(liveArtifact),
        metadata: liveArtifactMetadataPayload(liveArtifact),
        provenance: liveArtifactProvenancePayload(liveArtifact),
      }
    : null;

  return (
    <div className="live-artifact-refresh-panel">
      <section className="live-artifact-refresh-hero">
        <div className="live-artifact-refresh-hero-main">
          <span
            className={`live-artifact-badge refresh-status tone-${descriptor.tone}`}
            data-testid="live-artifact-refresh-status-badge"
          >
            {descriptor.label}
          </span>
          <p className="live-artifact-refresh-hero-desc">{descriptor.description}</p>
        </div>
        <div className="live-artifact-refresh-hero-meta">
          <div className="live-artifact-refresh-hero-metric">
            <span className="live-artifact-refresh-label">
              {t('liveArtifact.refresh.heroLastRefreshedLabel')}
            </span>
            {lastRefreshedAt ? (
              <>
                <span className="live-artifact-refresh-value">
                  {formatRelativeTime(lastRefreshedAt, now, locale, t) ?? '—'}
                </span>
                <span
                  className="live-artifact-refresh-sub"
                  title={formatAbsoluteDateTime(lastRefreshedAt) ?? undefined}
                >
                  {formatAbsoluteDateTime(lastRefreshedAt) ?? ''}
                </span>
              </>
            ) : (
              <span className="live-artifact-refresh-value muted">
                {t('liveArtifact.refresh.heroLastRefreshedNever')}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="live-artifact-refresh-facts">
        <LiveArtifactRefreshFact
          label={t('liveArtifact.refresh.factCreated')}
          iso={createdAt}
          emptyLabel={t('liveArtifact.refresh.factUnknown')}
          now={now}
          locale={locale}
          t={t}
        />
        <LiveArtifactRefreshFact
          label={t('liveArtifact.refresh.factLastUpdated')}
          iso={updatedAt}
          emptyLabel={t('liveArtifact.refresh.factUnknown')}
          now={now}
          locale={locale}
          t={t}
        />
      </section>

      <section className="live-artifact-refresh-section">
        <header className="live-artifact-refresh-section-header">
          <h4>{t('liveArtifact.refresh.persistedTitle')}</h4>
          <span className="live-artifact-refresh-hint">
            {t('liveArtifact.refresh.persistedHint')}
          </span>
        </header>
        {reversedPersistedEvents.length === 0 ? (
          <div className="live-artifact-refresh-empty">
            {t('liveArtifact.refresh.persistedEmpty')}
          </div>
        ) : (
          <ol className="live-artifact-refresh-timeline">
            {reversedPersistedEvents.map((event) => {
              const tone = event.status === 'succeeded'
                ? 'success'
                : event.status === 'running'
                  ? 'running'
                  : event.status === 'failed' || event.status === 'cancelled'
                    ? 'error'
                    : 'running';
              const duration = formatDurationMs(event.durationMs);
              return (
                <li key={`${event.refreshId}:${event.sequence}`} className={`live-artifact-refresh-event tone-${tone}`}>
                  <span className="live-artifact-refresh-event-dot" aria-hidden />
                  <div className="live-artifact-refresh-event-body">
                    <div className="live-artifact-refresh-event-row">
                      <span className={`live-artifact-badge refresh-status tone-${tone}`}>
                        {describePersistedStatus(event.status, t)}
                      </span>
                      <strong>{event.step}</strong>
                      <span className="live-artifact-refresh-event-time">
                        {formatRelativeTime(event.startedAt, now, locale, t)
                          ?? t('liveArtifact.refresh.justNow')}
                      </span>
                    </div>
                    <div className="live-artifact-refresh-event-meta">
                      <span>{event.refreshId}</span>
                      {duration ? <span>{duration}</span> : null}
                      {event.error?.message ? <span>{event.error.message}</span> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="live-artifact-refresh-section">
        <header className="live-artifact-refresh-section-header">
          <h4>{t('liveArtifact.refresh.sessionTitle')}</h4>
          <span className="live-artifact-refresh-hint">
            {t('liveArtifact.refresh.sessionHint')}
          </span>
        </header>
        {reversedEvents.length === 0 ? (
          <div className="live-artifact-refresh-empty">
            {t('liveArtifact.refresh.timelineEmpty')}
          </div>
        ) : (
          <ol className="live-artifact-refresh-timeline">
            {reversedEvents.map((event) => {
              const phase = describeEventPhase(event, t);
              const duration = formatDurationMs(event.durationMs);
              const refreshedCount = event.refreshedSourceCount ?? 0;
              return (
                <li key={event.id} className={`live-artifact-refresh-event tone-${phase.tone}`}>
                  <span className="live-artifact-refresh-event-dot" aria-hidden />
                  <div className="live-artifact-refresh-event-body">
                    <div className="live-artifact-refresh-event-row">
                      <span
                        className={`live-artifact-badge refresh-status tone-${phase.tone}`}
                      >
                        {phase.label}
                      </span>
                      <span
                        className="live-artifact-refresh-event-time"
                        title={formatAbsoluteDateTime(event.at) ?? undefined}
                      >
                        {formatRelativeTime(event.at, now, locale, t) ?? ''}
                      </span>
                    </div>
                    <div className="live-artifact-refresh-event-detail">
                      {event.phase === 'succeeded' ? (
                        <span>
                          {t(
                            refreshedCount === 1
                              ? 'liveArtifact.refresh.sourcesUpdatedOne'
                              : 'liveArtifact.refresh.sourcesUpdatedMany',
                            { n: refreshedCount },
                          )}
                          {duration ? ` · ${duration}` : ''}
                        </span>
                      ) : event.phase === 'failed' ? (
                        <span>
                          {event.error ?? t('liveArtifact.refresh.genericFailure')}
                          {duration ? ` · ${duration}` : ''}
                        </span>
                      ) : (
                        <span>{t('liveArtifact.refresh.eventStartedDetail')}</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {documentSource ? (
        <section className="live-artifact-refresh-section">
          <header className="live-artifact-refresh-section-header">
            <h4>{t('liveArtifact.refresh.docSourceTitle')}</h4>
            <span className="live-artifact-refresh-hint">
              {t('liveArtifact.refresh.docSourceHint')}
            </span>
          </header>
          <dl className="live-artifact-refresh-kv">
            <div>
              <dt>{t('liveArtifact.refresh.docSourceType')}</dt>
              <dd>{documentSource.type}</dd>
            </div>
            {documentSource.toolName ? (
              <div>
                <dt>{t('liveArtifact.refresh.docSourceTool')}</dt>
                <dd>
                  <code>{documentSource.toolName}</code>
                </dd>
              </div>
            ) : null}
            {documentSource.connector ? (
              <div>
                <dt>{t('liveArtifact.refresh.docSourceConnector')}</dt>
                <dd>
                  {documentSource.connector.accountLabel ??
                    documentSource.connector.connectorId}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {rawDebugPayload != null ? (
        <details className="live-artifact-refresh-raw">
          <summary>{t('liveArtifact.refresh.debugSummary')}</summary>
          <p className="live-artifact-refresh-raw-note">
            {t('liveArtifact.refresh.debugNote')}
          </p>
          <pre className="viewer-source">{JSON.stringify(rawDebugPayload, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function LiveArtifactRefreshFact({
  label,
  iso,
  value,
  helper,
  emptyLabel,
  now,
  locale,
  t,
}: {
  label: string;
  iso?: string;
  value?: string;
  helper?: string;
  emptyLabel?: string;
  now?: number;
  locale?: Locale;
  t?: TranslateFn;
}) {
  const relative = iso !== undefined ? formatRelativeTime(iso, now, locale, t) : null;
  const absolute = iso !== undefined ? formatAbsoluteDateTime(iso) : null;
  const resolved = value ?? relative ?? emptyLabel ?? '—';
  const sub = helper ?? (iso !== undefined ? absolute ?? '' : '');
  return (
    <div className="live-artifact-refresh-fact">
      <span className="live-artifact-refresh-label">{label}</span>
      <span className="live-artifact-refresh-value" title={absolute ?? undefined}>
        {resolved}
      </span>
      {sub ? <span className="live-artifact-refresh-sub">{sub}</span> : null}
    </div>
  );
}

function FileActions({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const { workspaceContext } = useProjectCollabContext();
  return (
    <div className="viewer-toolbar-actions">
      <a
        className="ghost-link"
        href={projectFileUrl(projectId, file.name, workspaceContext)}
        download={file.name}
      >
        {t('fileViewer.download')}
      </a>
      <a
        className="ghost-link"
        href={projectFileUrl(projectId, file.name, workspaceContext)}
        target="_blank"
        rel="noreferrer noopener"
      >
        {t('fileViewer.open')}
      </a>
    </div>
  );
}

function formatVersionDateTime(value: number | undefined, locale: Locale): string {
  const date = new Date(Number(value) || Date.now());
  try {
    return date.toLocaleString(locale, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return date.toLocaleString();
  }
}

function isHtmlVersionableFile(file: ProjectFile): boolean {
  return file.kind === 'html' || /\.html?$/i.test(file.name);
}

function fileVersionSourceLabel(version: ProjectFileVersion, t: TranslateFn): string {
  if (version.source === 'manual') return t('fileViewer.versions.sourceManual');
  if (version.source === 'restore') return t('fileViewer.versions.sourceRestore');
  return t('fileViewer.versions.sourceAi');
}

function fileVersionSourceClassName(version: ProjectFileVersion): string {
  if (version.source === 'manual') return 'manual';
  if (version.source === 'restore') return 'restore';
  return 'ai';
}

// Any unknown/legacy source value counts as 'ai', matching the label and
// class-name fallbacks above.
function fileVersionSourceToTracking(version: ProjectFileVersion): TrackingFileVersionSource {
  if (version.source === 'manual') return 'manual';
  if (version.source === 'restore') return 'restore';
  return 'ai';
}

function sourceLooksLikeDeckPreview(source: string | null | undefined): boolean {
  if (!source) return false;
  return (
    /class\s*=\s*['"](?:[^'"]*\s)?slide(?:\s|['"])/i.test(source) ||
    sourceLooksLikeExportableDeck(source)
  );
}

export function fileVersionPreviewOptions(
  projectId: string,
  fileName: string,
  source: string | null | undefined,
  workspaceContext?: WorkspaceCollabContext | null,
) {
  return {
    deck: sourceLooksLikeDeckPreview(source),
    baseHref: projectRawUrl(projectId, baseDirFor(fileName), workspaceContext),
  };
}

function fileVersionPreviewSrcDoc(
  projectId: string,
  fileName: string,
  source: string,
  workspaceContext?: WorkspaceCollabContext | null,
) {
  return buildSrcdoc(source, {
    ...fileVersionPreviewOptions(projectId, fileName, source, workspaceContext),
    previewFocusGuard: true,
  });
}

function fileVersionExportTitle(fileName: string, version: ProjectFileVersion): string {
  const base = fileName.replace(/\.html?$/i, '') || fileName;
  return `${base}-v${version.version}`;
}

type HtmlVersionExportContext = {
  content: string;
  title: string;
  versionId?: string;
  version?: ProjectFileVersion;
};

type ExportToastState = {
  message: string;
  tone: 'default' | 'success' | 'error' | 'loading';
};

export type DeckKeyboardShortcut = 'next' | 'prev' | 'first' | 'last' | 'reset';

type DeckKeyboardShortcutEvent = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'
>;

export function deckKeyboardShortcutForEvent(event: DeckKeyboardShortcutEvent): DeckKeyboardShortcut | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return null;
  if (event.key === 'ArrowRight' || event.key === 'PageDown') return 'next';
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') return 'prev';
  if (event.key === 'Home') return 'first';
  if (event.key === 'End') return 'last';
  if (event.key.toLowerCase() === 'r') return 'reset';
  return null;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function normalizeDeckVisualSource(source: string): string {
  return source
    .replace(/\s+(?=<\/body\s*>)/gi, '')
    .trimEnd();
}

function FileVersionManagerModal({
  projectId,
  projectKind,
  file,
  currentSource,
  entryFrom,
  onExportPdf,
  onOpenImageExport,
  onExportZip,
  onExportHtml,
  exportToast,
  onExportToastDismiss,
  onClose,
  onRestored,
  viewerOnly = false,
}: {
  projectId: string;
  projectKind: TrackingProjectKind | null;
  file: ProjectFile;
  currentSource: string | null;
  entryFrom: 'toolbar' | 'more_menu';
  onExportPdf?: (context: HtmlVersionExportContext) => void;
  onOpenImageExport?: (context: HtmlVersionExportContext) => Promise<void> | void;
  onExportZip?: (context: HtmlVersionExportContext) => void;
  onExportHtml?: (context: HtmlVersionExportContext) => void;
  exportToast?: ExportToastState | null;
  onExportToastDismiss?: () => void;
  onClose: () => void;
  onRestored: (content: string, version: ProjectFileVersion) => Promise<void> | void;
  // Read-only viewer of a team-shared project can browse versions but not restore.
  viewerOnly?: boolean;
}) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const { workspaceContext } = useProjectCollabContext();
  const tRef = useRef(t);
  const [versions, setVersions] = useState<ProjectFileVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<string | null>(currentSource);
  const [selectedContentVersionId, setSelectedContentVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const restorePopoverId = useId();
  const [downloadMenuVersionId, setDownloadMenuVersionId] = useState<string | null>(null);
  const [versionExportToast, setVersionExportToast] = useState<ExportToastState | null>(null);
  const [versionImageExportVersionId, setVersionImageExportVersionId] = useState<string | null>(null);
  const [versionImageExportFormat, setVersionImageExportFormat] = useState<ImageExportFormat>('png');
  const [versionImageExportInFlight, setVersionImageExportInFlight] = useState(false);
  const versionImageExportTitleId = useId();
  const versionPreviewIframeRef = useRef<HTMLIFrameElement | null>(null);
  // Track which srcDoc the iframe has finished rendering. Deriving readiness by
  // comparing to the current srcDoc during render (rather than toggling a bool
  // in a post-paint effect) keeps the overlay up across a switch with no
  // one-frame flicker while the new document reparses.
  const [loadedSrcDoc, setLoadedSrcDoc] = useState<string | null>(null);
  // Client-side cache of fetched version HTML keyed by version id. Revisiting a
  // version is then zero-fetch (and, because the srcDoc string value is stable,
  // zero-reparse). `inFlightRef` dedupes concurrent hover-prefetch + click.
  const contentCacheRef = useRef<Map<string, string>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const trackingArtifactId = useMemo(
    () => anonymizeArtifactId({ projectId, fileName: file.name }),
    [projectId, file.name],
  );
  const trackingArtifactKind = artifactKindToTracking({ fileKind: file.kind ?? null });
  const fireModalClick = (
    element:
      | 'version_item'
      | 'open_in_new_tab'
      | 'restore'
      | 'restore_confirm'
      | 'restore_cancel',
    extra?: {
      version_source?: TrackingFileVersionSource;
      version_is_current?: boolean;
      viewport?: PreviewViewportId;
    },
  ) => {
    trackFileVersionModalClick(analytics.track, {
      page_name: 'artifact',
      area: 'file_version_modal',
      element,
      artifact_id: trackingArtifactId,
      artifact_kind: trackingArtifactKind,
      version_count: versions.length,
      ...extra,
    });
  };
  // One impression per modal open. The component unmounts on close, so a
  // fire-once ref is enough — no dependency bookkeeping needed.
  const surfaceViewFiredRef = useRef(false);
  useEffect(() => {
    if (surfaceViewFiredRef.current) return;
    surfaceViewFiredRef.current = true;
    trackFileVersionModalSurfaceView(analytics.track, {
      page_name: 'artifact',
      area: 'file_version_modal',
      entry_from: entryFrom,
      artifact_id: trackingArtifactId,
      artifact_kind: trackingArtifactKind,
    });
  }, [analytics.track, entryFrom, trackingArtifactId, trackingArtifactKind]);
  const versionById = useMemo(() => {
    const map = new Map<string, ProjectFileVersion>();
    for (const version of versions) map.set(version.id, version);
    return map;
  }, [versions]);
  const selectedVersion =
    (selectedId ? versionById.get(selectedId) : undefined) ??
    versions.find((version) => version.current) ??
    versions[0] ??
    null;
  const versionCountLabel = versions.length === 1
    ? t('fileViewer.versions.countOne')
    : t('fileViewer.versions.countMany', { count: versions.length });
  // Show the filter box only once the list is long enough to need it.
  const showSearch = versions.length > 3;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleVersions = useMemo(() => {
    if (!showSearch || !normalizedSearch) return versions;
    return versions.filter((version) => {
      const restoredFrom = version.restoreFromVersionId
        ? versionById.get(version.restoreFromVersionId)
        : null;
      const haystack = [
        `v${version.version}`,
        `version ${version.version}`,
        version.prompt ?? '',
        version.label ?? '',
        fileVersionSourceLabel(version, t),
        formatVersionDateTime(version.createdAt, locale),
        restoredFrom ? `v${restoredFrom.version}` : '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [showSearch, normalizedSearch, versions, versionById, t, locale]);
  // Decks are 16:9; the preview centers them in an aspect box rather than letting
  // the slide bottom-anchor in a taller pane. Cheap source sniff, memoized.
  const isDeckPreview = useMemo(
    () =>
      Boolean(
        selectedContent && fileVersionPreviewOptions(projectId, file.name, selectedContent).deck,
      ),
    [selectedContent, projectId, file.name],
  );
  const panelFileName = file.name.split('/').pop() || file.name;
  const selectedDate = selectedVersion ? formatVersionDateTime(selectedVersion.createdAt, locale) : file.name;
  const versionImageExportVersion = versionImageExportVersionId
    ? versionById.get(versionImageExportVersionId) ?? null
    : null;
  const visibleExportToast = versionExportToast ?? exportToast ?? null;
  const selectedContentMatchesVersion = Boolean(selectedId && selectedContentVersionId === selectedId && selectedContent);
  const restoreDisabled =
    viewerOnly || !selectedVersion || selectedVersion.current || restoring || loadingContent || !selectedContentMatchesVersion;
  const srcDoc = useMemo(() => {
    if (!selectedContent) return '';
    return fileVersionPreviewSrcDoc(projectId, file.name, selectedContent);
  }, [file.name, projectId, selectedContent]);
  const frameReady = loadedSrcDoc === srcDoc;

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Fetch a single version's HTML into the cache exactly once. Reused by the
  // selection effect and by hover/focus prefetch so a click lands on warm data.
  const primeVersionContent = useCallback((versionId: string): Promise<void> => {
    if (contentCacheRef.current.has(versionId)) return Promise.resolve();
    const pending = inFlightRef.current.get(versionId);
    if (pending) return pending;
    const request = fetchProjectFileVersion(
      projectId,
      file.name,
      versionId,
      workspaceContext,
    )
      .then((result) => {
        if (result) contentCacheRef.current.set(versionId, result.content);
      })
      .catch(() => {})
      .finally(() => {
        inFlightRef.current.delete(versionId);
      });
    inFlightRef.current.set(versionId, request);
    return request;
  }, [file.name, projectId, workspaceContext]);

  const loadVersions = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    setError(null);
    const result = await fetchProjectFileVersions(projectId, file.name, workspaceContext);
    if (!result) {
      setError(tRef.current('fileViewer.versions.loadFailed'));
      setLoading(false);
      return;
    }
    const nextVersions = [...result.versions].sort((a, b) => b.version - a.version);
    setVersions(nextVersions);
    // Seed the cache with the live document so opening the modal renders the
    // current version instantly — no round-trip for the version you're on.
    const currentVersion = nextVersions.find((version) => version.current);
    if (currentVersion && currentSource != null && !contentCacheRef.current.has(currentVersion.id)) {
      contentCacheRef.current.set(currentVersion.id, currentSource);
    }
    const nextSelected =
      (preferredId ? nextVersions.find((version) => version.id === preferredId) : null) ??
      currentVersion ??
      nextVersions[0] ??
      null;
    setSelectedId(nextSelected?.id ?? null);
    setLoading(false);
  }, [currentSource, file.name, projectId, workspaceContext]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  useEffect(() => {
    setConfirmRestore(false);
    setDownloadMenuVersionId(null);
  }, [selectedId]);

  useEffect(() => {
    if (!downloadMenuVersionId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.file-version-download-menu, .artifact-version-panel__download')) return;
      setDownloadMenuVersionId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [downloadMenuVersionId]);

  // Clicking anywhere outside dismisses the panel, like every other popover
  // on this surface — but dismissal is LAYERED: while an inner popover
  // (download menu / restore confirm) is open, the outside click belongs to
  // that layer's own dismiss handler and must not also tear down the whole
  // panel. The toolbar entry that toggles the panel is excluded so its own
  // toggle keeps working without a close/reopen race.
  useEffect(() => {
    if (confirmRestore || downloadMenuVersionId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(
          '.artifact-version-panel, .file-version-download-menu, .file-version-restore-confirm, [data-od-version-entry]',
        )
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onClose, confirmRestore, downloadMenuVersionId]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedContent(null);
      setSelectedContentVersionId(null);
      return;
    }
    // Cache hit: swap instantly with no fetch, no flash.
    const cached = contentCacheRef.current.get(selectedId);
    if (cached !== undefined) {
      setSelectedContent(cached);
      setSelectedContentVersionId(selectedId);
      setLoadingContent(false);
      setError(null);
      return;
    }
    // Cache miss: keep the previous preview mounted under the loading overlay
    // (do NOT clear selectedContent) so switching never blanks to white.
    let cancelled = false;
    setLoadingContent(true);
    setError(null);
    void primeVersionContent(selectedId).then(() => {
      if (cancelled) return;
      const next = contentCacheRef.current.get(selectedId);
      if (next === undefined) {
        setSelectedContent(null);
        setSelectedContentVersionId(null);
        setError(tRef.current('fileViewer.versions.previewFailed'));
      } else {
        setSelectedContent(next);
        setSelectedContentVersionId(selectedId);
      }
      setLoadingContent(false);
    });
    return () => {
      cancelled = true;
    };
  }, [primeVersionContent, selectedId]);

  // Safety net: if the iframe's load event is ever missed, clear the overlay
  // after a grace period so it can't get stuck over a rendered document.
  useEffect(() => {
    if (!srcDoc || loadedSrcDoc === srcDoc) return;
    const fallback = window.setTimeout(() => setLoadedSrcDoc(srcDoc), 6000);
    return () => window.clearTimeout(fallback);
  }, [srcDoc, loadedSrcDoc]);

  useEffect(() => {
    if (!isDeckPreview || !selectedContentMatchesVersion || loadingContent) return;
    const onKey = (event: KeyboardEvent) => {
      if (document.activeElement === versionPreviewIframeRef.current) return;
      if (isEditableKeyboardTarget(event.target) || isEditableKeyboardTarget(document.activeElement)) return;
      const shortcut = deckKeyboardShortcutForEvent(event);
      if (!shortcut) return;
      const win = versionPreviewIframeRef.current?.contentWindow;
      if (!win) return;
      event.preventDefault();
      win.postMessage({
        type: 'od:slide',
        action: shortcut === 'reset' ? 'first' : shortcut,
      }, '*');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDeckPreview, loadingContent, selectedContentMatchesVersion]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (versionImageExportVersionId) {
        if (!versionImageExportInFlight) setVersionImageExportVersionId(null);
        return;
      }
      if (downloadMenuVersionId) {
        setDownloadMenuVersionId(null);
        return;
      }
      if (confirmRestore) {
        setConfirmRestore(false);
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [
    onClose,
    confirmRestore,
    downloadMenuVersionId,
    versionImageExportVersionId,
    versionImageExportInFlight,
  ]);

  useEffect(() => {
    if (!confirmRestore) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.file-version-restore-confirm, .artifact-version-panel__restore')) return;
      setConfirmRestore(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [confirmRestore]);

  async function ensureVersionContent(version: ProjectFileVersion): Promise<string | null> {
    const cached = contentCacheRef.current.get(version.id);
    if (cached !== undefined) return cached;
    await primeVersionContent(version.id);
    const content = contentCacheRef.current.get(version.id);
    if (content === undefined) {
      setError(t('fileViewer.versions.previewFailed'));
      return null;
    }
    return content;
  }

  async function runVersionExport(
    version: ProjectFileVersion,
    action: (content: string, title: string) => Promise<unknown> | unknown,
  ): Promise<void> {
    setDownloadMenuVersionId(null);
    setError(null);
    setVersionExportToast({ message: t('fileViewer.exportingProgress'), tone: 'loading' });
    const content = await ensureVersionContent(version);
    if (!content) {
      setVersionExportToast({ message: t('fileViewer.exportFailed'), tone: 'error' });
      return;
    }
    try {
      contentCacheRef.current.set(version.id, content);
      setSelectedId(version.id);
      setSelectedContent(content);
      setSelectedContentVersionId(version.id);
      setLoadingContent(false);
      await waitForAnimationFrame();
      await waitForAnimationFrame();
      const result = await action(content, fileVersionExportTitle(file.name, version));
      if (result === 'cancelled') {
        setVersionExportToast(null);
        return;
      }
      setVersionExportToast({ message: t('fileViewer.exportDone'), tone: 'success' });
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('fileViewer.exportFailed');
      setVersionExportToast({ message, tone: 'error' });
    }
  }

  async function captureVersionPreviewSnapshot(options?: { full?: boolean }) {
    const iframe = versionPreviewIframeRef.current;
    if (!iframe) return null;
    await waitForIframeLoadOrTimeout(iframe, 250);
    await waitForAnimationFrame();
    await waitForAnimationFrame();
    if (options?.full) return requestPreviewSnapshotWithRetry(iframe, options);
    const hostSnapshot = await captureHostIframeSnapshot(iframe);
    if (hostSnapshot) return hostSnapshot;
    return requestPreviewSnapshotWithRetry(iframe, options);
  }

  async function runProjectVersionExport(
    version: ProjectFileVersion,
    action: (context: HtmlVersionExportContext) => Promise<unknown> | unknown,
  ): Promise<void> {
    setDownloadMenuVersionId(null);
    setError(null);
    setVersionExportToast({ message: t('fileViewer.exportingProgress'), tone: 'loading' });
    const content = await ensureVersionContent(version);
    if (!content) {
      setVersionExportToast({ message: t('fileViewer.exportFailed'), tone: 'error' });
      return;
    }
    const context: HtmlVersionExportContext = {
      content,
      title: version.current ? file.name.replace(/\.html?$/i, '') || file.name : fileVersionExportTitle(file.name, version),
      version,
      ...(version.current ? {} : { versionId: version.id }),
    };
    setVersionExportToast(null);
    await action(context);
  }

  async function exportVersionPdf(version: ProjectFileVersion) {
    if (onExportPdf) {
      await runProjectVersionExport(version, onExportPdf);
      return;
    }
    await runVersionExport(version, async (content, title) => {
      const snapshot = await captureVersionPreviewSnapshot({ full: true });
      if (!snapshot) throw new Error(t('fileViewer.exportFailed'));
      await exportSnapshotAsPdf(snapshot, title);
    });
  }

  async function exportVersionImage(version: ProjectFileVersion, format: ImageExportFormat) {
    await runVersionExport(version, async (content, title) => {
      const snapshot = await captureVersionPreviewSnapshot({ full: true });
      if (!snapshot) throw new Error(t('fileViewer.exportImageFailed'));
      const blob = await imageDataUrlToBlob(snapshot.dataUrl, format);
      if (blob.size <= 0) throw new Error(t('fileViewer.exportImageFailed'));
      const target = await prepareImageExportTarget(title, format, { useNativePicker: false });
      if (!target) return 'cancelled';
      if (target.method === 'download' && format === 'png') {
        downloadImageDataUrl(snapshot.dataUrl, target.filename);
      } else {
        await target.save(blob);
      }
    });
  }

  async function handleVersionImageExportSave() {
    if (!versionImageExportVersion || versionImageExportInFlight) return;
    setVersionImageExportInFlight(true);
    const version = versionImageExportVersion;
    const format = versionImageExportFormat;
    setVersionImageExportVersionId(null);
    try {
      await exportVersionImage(version, format);
    } finally {
      setVersionImageExportInFlight(false);
    }
  }

  function openVersionImageExport(version: ProjectFileVersion) {
    setDownloadMenuVersionId(null);
    if (onOpenImageExport) {
      void runProjectVersionExport(version, (context) => {
        onClose();
        window.requestAnimationFrame(() => {
          void onOpenImageExport(context);
        });
      });
      return;
    }
    setSelectedId(version.id);
    void primeVersionContent(version.id);
    setVersionImageExportFormat('png');
    setVersionImageExportVersionId(version.id);
  }

  function exportVersionZip(version: ProjectFileVersion) {
    if (onExportZip) {
      void runProjectVersionExport(version, onExportZip);
      return;
    }
    void runVersionExport(version, (content, title) => exportAsZip(content, title));
  }

  function exportVersionHtml(version: ProjectFileVersion) {
    if (onExportHtml) {
      void runProjectVersionExport(version, onExportHtml);
      return;
    }
    void runVersionExport(version, (content, title) => exportAsHtml(content, title));
  }

  function openVersionInNewTab() {
    if (loadingContent || !selectedContentMatchesVersion || !selectedContent || !selectedVersion) return;
    fireModalClick('open_in_new_tab', {
      version_source: fileVersionSourceToTracking(selectedVersion),
    });
    openSandboxedPreviewInNewTab(
      selectedContent,
      `${file.name} · v${selectedVersion.version}`,
      fileVersionPreviewOptions(projectId, file.name, selectedContent),
    );
  }

  async function restoreVersion() {
    if (restoreDisabled || !selectedVersion || !selectedContentMatchesVersion || !selectedContent) return;
    setRestoring(true);
    setError(null);
    let closingAfterRestore = false;
    const restoreStarted = performance.now();
    // `versions` is sorted newest-first, so the index is "how many versions
    // back from the newest" the restore target sits.
    const fireRestoreResult = (result: 'success' | 'failed', errorCode?: string) => {
      trackFileVersionRestoreResult(analytics.track, {
        page_name: 'artifact',
        area: 'file_version_modal',
        artifact_id: trackingArtifactId,
        artifact_kind: trackingArtifactKind,
        project_id: projectId,
        project_kind: projectKind,
        version_source: fileVersionSourceToTracking(selectedVersion),
        version_gap: Math.max(0, versions.findIndex((version) => version.id === selectedVersion.id)),
        version_count: versions.length,
        result,
        ...(errorCode ? { error_code: errorCode } : {}),
        restore_duration_ms: Math.round(performance.now() - restoreStarted),
      });
    };
    try {
      const result = await restoreProjectFileVersion(
        projectId,
        file.name,
        selectedVersion,
        workspaceContext,
      );
      if (!result) {
        fireRestoreResult('failed', 'restore_request_failed');
        setError(t('fileViewer.versions.restoreFailed'));
        return;
      }
      fireRestoreResult('success', result.versionWarning?.code);
      const restoredVersion = result.version ?? selectedVersion;
      await onRestored(selectedContent, restoredVersion);
      if (result.versionWarning) {
        await loadVersions(result.version?.id ?? selectedVersion.id);
        setError(result.versionWarning.message);
        return;
      }
      closingAfterRestore = true;
      onClose();
    } finally {
      if (!closingAfterRestore) setRestoring(false);
    }
  }

  return createPortal(
    <>
      <aside
        className="artifact-version-panel"
        role="dialog"
        aria-label={t('fileViewer.versions.title')}
      >
        <header className="artifact-version-panel__head">
          {/* Title first, the 历史版本·N count as a subline under it. */}
          <div>
            <strong title={panelFileName}>{panelFileName}</strong>
            <p>{`${t('fileViewer.versions.entryFull')} · ${versionCountLabel}`}</p>
          </div>
          <div className="artifact-version-panel__head-actions">
            <button
              type="button"
              className="artifact-version-panel__close"
              aria-label={t('fileViewer.versions.open')}
              title={t('fileViewer.versions.open')}
              disabled={!selectedContentMatchesVersion || loadingContent}
              onClick={openVersionInNewTab}
            >
              <RemixIcon name="external-link-line" size={15} />
            </button>
            <button
              type="button"
              className="artifact-version-panel__close"
              aria-label={t('common.close')}
              title={t('common.close')}
              onClick={onClose}
            >
              <RemixIcon name="close-line" size={17} />
            </button>
          </div>
        </header>
        <div className="artifact-version-panel__preview">
          {srcDoc ? (
            <iframe
              ref={versionPreviewIframeRef}
              title={selectedVersion ? `${file.name} v${selectedVersion.version}` : file.name}
              sandbox="allow-scripts allow-downloads"
              srcDoc={srcDoc}
              onLoad={() => setLoadedSrcDoc(srcDoc)}
            />
          ) : null}
          {selectedVersion ? (
            <div className="artifact-version-panel__preview-caption">
              <span>{`v${selectedVersion.version}`}</span>
              <strong>{selectedDate}</strong>
            </div>
          ) : null}
          {loading || loadingContent || (srcDoc && !frameReady) ? (
            <div
              className="file-version-preview-overlay"
              role="status"
              aria-label={t('fileViewer.versions.previewLoading')}
            >
              <span className="file-version-preview-spinner" aria-hidden="true" />
            </div>
          ) : null}
        </div>
        {error ? (
          <p className="artifact-version-panel__note" role="alert">{error}</p>
        ) : null}
        {showSearch ? (
          <div className="file-version-search">
            <RemixIcon name="search-line" size={14} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('common.searchEllipsis')}
              aria-label={t('common.searchEllipsis')}
            />
            {search ? (
              <button
                type="button"
                className="file-version-search-clear"
                aria-label={t('common.clear')}
                onClick={() => setSearch('')}
              >
                <RemixIcon name="close-line" size={14} />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="artifact-version-list" role="listbox" aria-label={t('fileViewer.versions.listAria')}>
          {loading ? (
            <div
              className="file-version-skeleton-list"
              role="status"
              aria-label={t('fileViewer.versions.loading')}
            >
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="file-version-skeleton-item" aria-hidden="true">
                  <div className="file-version-skeleton-row">
                    <span className="file-version-skeleton-line badge" />
                    <span className="file-version-skeleton-line time" />
                  </div>
                  <span className="file-version-skeleton-line title" />
                  <span className="file-version-skeleton-line meta" />
                </div>
              ))}
            </div>
          ) : versions.length === 0 ? (
            <div className="file-version-empty">{t('fileViewer.versions.empty')}</div>
          ) : visibleVersions.length === 0 ? (
            <div className="file-version-empty">{t('homeHero.noResults', { query: search.trim() })}</div>
          ) : (
            visibleVersions.map((version) => {
              const selected = version.id === selectedVersion?.id;
              const itemRestoredFrom = version.restoreFromVersionId
                ? versionById.get(version.restoreFromVersionId)
                : null;
              const prefetch = () => {
                void primeVersionContent(version.id);
              };
              const selectVersion = () => {
                if (!selected) {
                  fireModalClick('version_item', {
                    version_source: fileVersionSourceToTracking(version),
                    version_is_current: Boolean(version.current),
                  });
                }
                setSelectedId(version.id);
              };
              // The daemon fills an absent label with a hardcoded English
              // `Version N` (project-file-versions.ts). Rendering that as the
              // card title put an untranslated "Version 2" directly above the
              // localized "版本 2" meta line — the same fact, twice, in two
              // languages. A card only earns a bespoke title when it has
              // something the `v{n}` mark does not already say.
              const autoVersionLabel = /^v(?:ersion)?\s*\.?\s*\d+$/i.test(version.label?.trim() ?? '');
              const versionTitle =
                version.prompt?.trim()
                || (autoVersionLabel ? '' : version.label?.trim() ?? '');
              return (
                <button
                  key={version.id}
                  type="button"
                  className={`artifact-version-card${selected ? ' is-selected' : ''}${version.current ? ' is-current' : ''}`}
                  role="option"
                  aria-selected={selected}
                  onClick={selectVersion}
                  onMouseEnter={prefetch}
                  onFocus={prefetch}
                >
                  <span className="artifact-version-card__mark">{`v${version.version}`}</span>
                  <span className="artifact-version-card__body">
                    {versionTitle || version.current ? (
                      <span className="artifact-version-card__title">
                        {versionTitle ? (
                          <span className="artifact-version-card__title-text">{versionTitle}</span>
                        ) : null}
                        {version.current ? <em>{t('fileViewer.versions.current')}</em> : null}
                      </span>
                    ) : null}
                    <span className="artifact-version-card__meta">
                      <span className={`file-version-source-badge ${fileVersionSourceClassName(version)}`}>
                        {fileVersionSourceLabel(version, t)}
                      </span>
                      <span>{formatVersionDateTime(version.createdAt, locale)}</span>
                    </span>
                    {itemRestoredFrom ? (
                      <span className="artifact-version-card__summary">
                        {t('fileViewer.versions.restoredFrom', { version: itemRestoredFrom.version })}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <footer className="artifact-version-panel__foot">
          <button
            type="button"
            className={`artifact-version-panel__restore${confirmRestore ? ' active' : ''}`}
            disabled={restoreDisabled}
            title={viewerOnly ? t('fileViewer.readonlySharedNoExport') : undefined}
            aria-haspopup="dialog"
            aria-expanded={confirmRestore}
            aria-controls={confirmRestore ? restorePopoverId : undefined}
            onClick={() => {
              if (!selectedVersion) return;
              if (!confirmRestore) {
                fireModalClick('restore', {
                  version_source: fileVersionSourceToTracking(selectedVersion),
                });
              }
              setConfirmRestore((value) => !value);
            }}
          >
            <RemixIcon name={restoring ? 'loader-4-line' : 'arrow-go-back-line'} size={15} />
            {restoring ? t('fileViewer.versions.restoring') : t('fileViewer.versions.restore')}
          </button>
          <button
            type="button"
            className="artifact-version-panel__download"
            aria-haspopup="menu"
            aria-expanded={Boolean(selectedVersion) && downloadMenuVersionId === selectedVersion?.id}
            aria-label={selectedVersion
              ? `${t('fileViewer.download')} ${t('fileViewer.versions.versionLabel', { version: selectedVersion.version })}`
              : t('fileViewer.download')}
            disabled={!selectedVersion}
            onClick={() => {
              if (!selectedVersion) return;
              void primeVersionContent(selectedVersion.id);
              setDownloadMenuVersionId((current) => current === selectedVersion.id ? null : selectedVersion.id);
            }}
          >
            <RemixIcon name="download-line" size={15} />
            {t('fileViewer.download')}
          </button>
        </footer>
        {selectedVersion && confirmRestore ? (
          <div
            className="artifact-version-panel__popover file-version-restore-confirm"
            id={restorePopoverId}
            role="dialog"
            aria-label={t('fileViewer.versions.restoreConfirmTitle')}
          >
            <h3>{t('fileViewer.versions.restoreConfirmTitle')}</h3>
            <p>{t('fileViewer.versions.restoreHelp')}</p>
            <div className="file-version-restore-confirm-actions">
              <button
                type="button"
                className="viewer-action"
                onClick={() => {
                  fireModalClick('restore_cancel', {
                    version_source: fileVersionSourceToTracking(selectedVersion),
                  });
                  setConfirmRestore(false);
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="viewer-action primary"
                disabled={restoreDisabled}
                onClick={() => {
                  fireModalClick('restore_confirm', {
                    version_source: fileVersionSourceToTracking(selectedVersion),
                  });
                  setConfirmRestore(false);
                  void restoreVersion();
                }}
              >
                {t('fileViewer.versions.restoreConfirmCta')}
              </button>
            </div>
          </div>
        ) : null}
        {selectedVersion && downloadMenuVersionId === selectedVersion.id ? (
          <div
            className="artifact-version-panel__popover share-menu-popover file-version-download-menu"
            role="menu"
          >
            <button
              type="button"
              className="share-menu-item"
              role="menuitem"
              onClick={() => {
                void exportVersionPdf(selectedVersion);
              }}
            >
              <span className="share-menu-icon"><RemixIcon name="file-line" size={15} /></span>
              <span>{t('fileViewer.exportPdf')}</span>
            </button>
            <button
              type="button"
              className="share-menu-item"
              role="menuitem"
              onClick={() => {
                openVersionImageExport(selectedVersion);
              }}
            >
              <span className="share-menu-icon"><RemixIcon name="image-line" size={15} /></span>
              <span>{t('fileViewer.exportImage')}</span>
            </button>
            <button
              type="button"
              className="share-menu-item"
              role="menuitem"
              onClick={() => {
                exportVersionZip(selectedVersion);
              }}
            >
              <span className="share-menu-icon"><RemixIcon name="file-zip-line" size={15} /></span>
              <span>{t('fileViewer.exportZip')}</span>
            </button>
            {selectedVersion.current ? (
              <button
                type="button"
                className="share-menu-item"
                role="menuitem"
                onClick={() => {
                  exportVersionHtml(selectedVersion);
                }}
              >
                <span className="share-menu-icon"><RemixIcon name="file-code-line" size={15} /></span>
                <span>{t('fileViewer.exportHtml')}</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </aside>
      {versionImageExportVersion ? (
        <div className="modal-backdrop viewer-modal-backdrop image-export-backdrop file-version-export-backdrop" role="presentation">
          <div
            className="modal deploy-modal image-export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={versionImageExportTitleId}
          >
            <div className="modal-head">
              <div className="kicker">IMAGE</div>
              <h2 id={versionImageExportTitleId}>{t('fileViewer.exportImage')}</h2>
              <p className="subtitle">{t('fileViewer.exportImageModalSubtitle')}</p>
            </div>
            <div className="deploy-form image-export-form">
              <fieldset className="image-export-format-field">
                <legend>{t('fileViewer.exportImageFormatLabel')}</legend>
                <div className="image-export-format-options">
                  {IMAGE_EXPORT_FORMAT_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`image-export-format-option${versionImageExportFormat === option.value ? ' active' : ''}`}
                    >
                      <input
                        type="radio"
                        name="version-image-export-format"
                        value={option.value}
                        aria-label={option.label}
                        checked={versionImageExportFormat === option.value}
                        onChange={() => setVersionImageExportFormat(option.value)}
                      />
                      <span className="image-export-format-text">
                        <strong>{option.label}</strong>
                        <span aria-hidden="true">{option.extension}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="ghost-link button-like"
                disabled={versionImageExportInFlight}
                onClick={() => setVersionImageExportVersionId(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="viewer-action primary"
                disabled={versionImageExportInFlight}
                onClick={() => {
                  void handleVersionImageExportSave();
                }}
              >
                {versionImageExportInFlight ? t('fileViewer.exportImageSaving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {visibleExportToast ? (
        <Toast
          className="file-version-export-toast"
          message={visibleExportToast.message}
          tone={visibleExportToast.tone}
          role={visibleExportToast.tone === 'error' ? 'alert' : 'status'}
          ttlMs={visibleExportToast.tone === 'loading' ? 60000 : 2200}
          placement="top"
          onDismiss={visibleExportToast.tone === 'loading'
            ? undefined
            : () => {
                if (versionExportToast) {
                  setVersionExportToast(null);
                } else {
                  onExportToastDismiss?.();
                }
              }}
        />
      ) : null}
    </>,
    document.body,
  );
}

function formatCommentTime(ts: number, t: TranslateFn): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return t('common.justNow');
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return t('common.minutesAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('common.hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('common.daysAgo', { n: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t('common.weeksAgo', { n: weeks });
  return new Date(ts).toLocaleDateString();
}

function commentActivityAt(comment: PreviewComment): number {
  return Math.max(
    Number.isFinite(comment.updatedAt) ? comment.updatedAt : 0,
    Number.isFinite(comment.createdAt) ? comment.createdAt : 0,
  );
}

function commentCreatedAt(comment: PreviewComment): number {
  return Number.isFinite(comment.createdAt) ? comment.createdAt : commentActivityAt(comment);
}

/**
 * The sidebar's ordering key (recvq5BVsolIxi): the persisted `sortKey` when
 * present, else `createdAt` — which reproduces the same "newest first"
 * default (descending) for a comment created before this field existed, or
 * from a test fixture that doesn't set it.
 */
function commentEffectiveSortKey(comment: PreviewComment): number {
  return Number.isFinite(comment.sortKey) ? (comment.sortKey as number) : commentCreatedAt(comment);
}

function commentTargetIntersectsPreview(
  target: PreviewCommentSnapshot | null,
  scale: number,
  offset: { x: number; y: number },
  bounds?: PreviewCanvasSize,
): boolean {
  if (!target || !bounds?.width || !bounds.height) return true;
  const rect = overlayBoundsFromSnapshot(target, scale, offset);
  const margin = 8;
  return (
    rect.left + rect.width > margin &&
    rect.top + rect.height > margin &&
    rect.left < bounds.width - margin &&
    rect.top < bounds.height - margin
  );
}

// Stable avatar palette for comment authors — a member always gets the same
// swatch (hash of their id), so the same person reads consistently across cards
// and sessions. The demo's orange circle lives here as the first entry.
const COMMENT_AUTHOR_AVATAR_COLORS = [
  '#f97316',
  '#e11d48',
  '#7c3aed',
  '#2563eb',
  '#0891b2',
  '#059669',
  '#ca8a04',
  '#db2777',
  '#4f46e5',
  '#0d9488',
] as const;

function commentAuthorAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return COMMENT_AUTHOR_AVATAR_COLORS[hash % COMMENT_AUTHOR_AVATAR_COLORS.length] ?? COMMENT_AUTHOR_AVATAR_COLORS[0];
}

// First glyph of the display name (code-point aware so a CJK name shows its
// first character and an emoji is not split). Falls back to '?'.
function commentAuthorInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [first] = Array.from(trimmed);
  return (first ?? '?').toUpperCase();
}

function commentAuthorRoleLabel(role: CollabMemberRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function commentDisplayLabel(comment: PreviewComment, t: TranslateFn): string {
  if (comment.elementId.startsWith('pin-')) return t('chat.comments.pin');
  const label = String(comment.label || '').trim().toLowerCase();
  const htmlHint = String(comment.htmlHint || '').trim().toLowerCase();
  const elementId = String(comment.elementId || '').trim().toLowerCase();
  const source = `${label} ${htmlHint} ${elementId}`;
  if (/\b(?:img|picture|video|canvas|svg)\b/.test(source)) return t('chat.comments.targetImage');
  if (/\b(?:button|input|textarea|select|label)\b/.test(source)) return t('chat.comments.targetControl');
  if (/^<a\b/.test(htmlHint)) return t('chat.comments.targetLink');
  if (/\b(?:h1|h2|h3|h4|h5|h6|p|span|strong|em|small|li|dt|dd)\b/.test(source)) return t('chat.comments.targetText');
  if (/\b(?:section|main|header|footer|nav|article|aside)\b/.test(source)) return t('chat.comments.targetSection');
  if (label.endsWith('.html') || elementId.startsWith('file-comment-')) return t('chat.comments.targetPage');
  if (comment.text.trim()) return t('chat.comments.targetText');
  return t('chat.comments.targetArea');
}

export function CommentSidePanel({
  comments,
  projectId,
  selectedIds,
  activeCommentId,
  collapsed,
  onCollapsedChange,
  onDismiss,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onReorder,
  onReply,
  onSendSelected,
  onCreateComment,
  canSendComment,
  currentUser,
  sending,
  queueOnSend = false,
  sendDisabled = false,
  sendDisabledReason,
  allowSendToChat = true,
  renderCreateForm = true,
  t,
  composer,
}: {
  comments: PreviewComment[];
  projectId?: string;
  selectedIds: Set<string>;
  activeCommentId: string | null;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /** Closes the panel outright. The floating card uses this so its collapse
   *  control hides the card instead of parking a full-height rail on the
   *  right edge; the toolbar's comment button is the way back. */
  onDismiss?: () => void;
  onToggleSelect: (commentId: string) => void;
  onSelectAll: () => void;
  canSendComment?: (comment: PreviewComment) => boolean;
  /** The viewer's own directory entry, so their comments show their avatar +
   *  name even when the member roster is empty (personal workspace / cold
   *  roster window). Supplied from the workspace context the caller already
   *  holds — this panel must not fetch one. */
  currentUser?: CollabCloudMemberDirectoryEntry | null;
  onClearSelection: () => void;
  onReorder?: (orderedIds: string[], draggedId: string) => void;
  onReply: (comment: PreviewComment) => void;
  onSendSelected: () => void | Promise<void>;
  onCreateComment?: (note: string) => boolean | Promise<boolean>;
  sending: boolean;
  queueOnSend?: boolean;
  sendDisabled?: boolean;
  sendDisabledReason?: string;
  allowSendToChat?: boolean;
  renderCreateForm?: boolean;
  t: TranslateFn;
  composer?: ReactNode;
}) {
  const { workspaceContext } = useProjectCollabContext();
  const [newCommentDraft, setNewCommentDraft] = useState('');
  const [dragState, setDragState] = useState<CommentSideDragState | null>(null);
  // Collab-cloud member directory: turns a comment's authorMemberId into a
  // display name + role for the author line + avatar. The viewer's own identity
  // resolves through `currentUser` even when the directory is empty; an unknown
  // OTHER member still renders without an author line, exactly as before.
  const { resolve: resolveCommentAuthor } = useTeamMembers(currentUser);
  const sorted = comments;
  // recvq5BVsolIxi: the inline "N." prefix must match the canvas pin number
  // (comment.pinSeq) so the two surfaces always agree, even when this panel
  // displays comments in a different order than they were created (the
  // sidebar sorts by sortKey, newest first by default; pinSeq never moves).
  // A comment with no pinSeq yet (legacy row / test fixture) falls back to
  // its rank in CREATION order — independent of `comments`' own order here —
  // computed locally so this component stays self-sufficient for callers
  // that pass in an arbitrary (not FileViewer-derived) comment list.
  const creationRankById = useMemo(() => {
    const byCreation = [...comments].sort((a, b) => commentCreatedAt(a) - commentCreatedAt(b));
    return new Map(byCreation.map((comment, index) => [comment.id, index + 1]));
  }, [comments]);
  function displayCommentNumber(comment: PreviewComment, fallbackIndex: number): number {
    if (typeof comment.pinSeq === 'number') return comment.pinSeq;
    return creationRankById.get(comment.id) ?? fallbackIndex + 1;
  }
  const visibleSelectedIds = new Set(comments.filter((comment) => selectedIds.has(comment.id)).map((comment) => comment.id));
  const selectedCount = visibleSelectedIds.size;
  // Team-collab send-to-agent gate: only the author or the project owner may
  // send a comment. When no predicate is supplied (single-user), every comment
  // is sendable and the select affordances behave exactly as before. Selecting
  // is the ONLY thing a checkbox drives here (batch send-to-chat), so a comment
  // the viewer can't send gets no checkbox and "select all" ignores it.
  const canSend = canSendComment ?? (() => true);
  const sendableCount = comments.reduce((count, comment) => (canSend(comment) ? count + 1 : count), 0);
  const allSelected = sendableCount > 0 && selectedCount === sendableCount;
  const commentsLabel = t('chat.tabComments');
  const canCreateComment = Boolean(onCreateComment) && newCommentDraft.trim().length > 0 && !sending;
  const canReorder = Boolean(onReorder && sorted.length > 1);
  const collapsedRailRef = useRef<HTMLButtonElement | null>(null);
  const expandedToggleRef = useRef<HTMLButtonElement | null>(null);
  const pendingToggleFocusRef = useRef<'collapsed' | 'expanded' | null>(null);
  const panelId = useId();
  const handleDragStart = (event: ReactDragEvent<HTMLButtonElement>, comment: PreviewComment) => {
    if (!canReorder) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(COMMENT_SIDE_DRAG_MIME, comment.id);
    event.dataTransfer.setData('text/plain', comment.id);
    setDragState({ draggingId: comment.id, overId: comment.id, edge: null });
  };
  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>, targetId: string) => {
    if (!canReorder) return;
    const draggingId = dragState?.draggingId || event.dataTransfer.getData(COMMENT_SIDE_DRAG_MIME);
    if (!draggingId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (draggingId === targetId) {
      if (dragState?.overId !== targetId || dragState.edge !== null) {
        setDragState({ draggingId, overId: targetId, edge: null });
      }
      return;
    }
    const edge = commentSideDropEdgeForEvent(event);
    if (
      dragState?.draggingId !== draggingId ||
      dragState.overId !== targetId ||
      dragState.edge !== edge
    ) {
      setDragState({ draggingId, overId: targetId, edge });
    }
  };
  const handleDrop = (event: ReactDragEvent<HTMLDivElement>, targetId: string) => {
    if (!canReorder) return;
    event.preventDefault();
    const draggingId =
      dragState?.draggingId ||
      event.dataTransfer.getData(COMMENT_SIDE_DRAG_MIME) ||
      event.dataTransfer.getData('text/plain');
    if (!draggingId || draggingId === targetId) {
      setDragState(null);
      return;
    }
    const edge = dragState?.overId === targetId && dragState.edge
      ? dragState.edge
      : commentSideDropEdgeForEvent(event);
    const nextIds = reorderPreviewCommentIds(sorted, draggingId, targetId, edge);
    if (nextIds.join('\0') !== sorted.map((comment) => comment.id).join('\0')) {
      onReorder?.(nextIds, draggingId);
    }
    setDragState(null);
  };
  const submitNewComment = async () => {
    if (!onCreateComment || !newCommentDraft.trim()) return;
    const saved = await onCreateComment(newCommentDraft.trim());
    if (saved) setNewCommentDraft('');
  };

  useEffect(() => {
    const target =
      pendingToggleFocusRef.current === 'collapsed'
        ? collapsedRailRef.current
        : pendingToggleFocusRef.current === 'expanded'
          ? expandedToggleRef.current
          : null;
    if (!target) return;
    pendingToggleFocusRef.current = null;
    target.focus();
  }, [collapsed]);

  const handleCollapsedChange = (
    nextCollapsed: boolean,
    nextFocusTarget: 'collapsed' | 'expanded',
  ) => {
    pendingToggleFocusRef.current = nextFocusTarget;
    onCollapsedChange(nextCollapsed);
  };

  if (collapsed) {
    return (
      <button
        ref={collapsedRailRef}
        type="button"
        className="comment-side-rail"
        data-testid="comment-side-collapsed-rail"
        aria-label={t('preview.showSidebar', { label: commentsLabel })}
        aria-expanded={false}
        title={t('preview.showSidebar', { label: commentsLabel })}
        onClick={() => handleCollapsedChange(false, 'expanded')}
      >
        <RemixIcon name="message-3-line" size={15} />
        <span>{commentsLabel}</span>
        {comments.length > 0 ? <strong>{comments.length}</strong> : null}
      </button>
    );
  }

  return (
    <aside
      id={panelId}
      className="comment-side-panel"
      data-testid="comment-side-panel"
      aria-label={commentsLabel}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !onDismiss) return;
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
      }}
    >
      <div className="comment-side-header">
        <div className="comment-side-title">
          <RemixIcon name="message-3-line" size={15} />
          <span>{commentsLabel}</span>
        </div>
        <div className="comment-side-header-actions">
          {/* The header's right slot owns collapse; select all moved below
              the divider. */}
          <button
            ref={expandedToggleRef}
            type="button"
            className="comment-side-collapse"
            aria-label={t('preview.hideSidebar', { label: commentsLabel })}
            aria-controls={panelId}
            aria-expanded={true}
            title={t('preview.hideSidebar', { label: commentsLabel })}
            onClick={() => {
              if (onDismiss) {
                onDismiss();
                return;
              }
              handleCollapsedChange(true, 'collapsed');
            }}
          >
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      </div>
      {sendableCount > 0 ? (
        <div className="comment-side-toolbar">
          <button
            type="button"
            className="comment-side-select-all"
            disabled={allSelected}
            onClick={onSelectAll}
          >
            {t('chat.comments.selectAll')}
          </button>
        </div>
      ) : null}
      <div
        className="comment-side-list"
        onDragLeave={(event) => {
          const related = event.relatedTarget;
          if (related instanceof Node && event.currentTarget.contains(related)) return;
          setDragState(null);
        }}
      >
        {sorted.length === 0 ? (
          <div className="comment-side-empty">
            {t('chat.comments.emptySaved')}
          </div>
        ) : sorted.map((comment, index) => {
          const selected = visibleSelectedIds.has(comment.id);
          const active = comment.id === activeCommentId;
          const sendable = canSend(comment);
          const author = resolveCommentAuthor(comment.authorMemberId);
          const isDragging = dragState?.draggingId === comment.id;
          const dropClass = dragState?.overId === comment.id &&
            dragState.draggingId !== comment.id &&
            dragState.edge
            ? ` comment-side-item-drop-${dragState.edge}`
            : '';
          return (
            <div
              key={comment.id}
              className={`comment-side-item${selected ? ' selected' : ''}${active ? ' active' : ''}${isDragging ? ' dragging' : ''}${dropClass}`}
              data-testid="comment-side-item"
              data-comment-id={comment.id}
              aria-current={active ? 'true' : undefined}
              role="button"
              tabIndex={0}
              onDragOver={(event) => handleDragOver(event, comment.id)}
              onDrop={(event) => handleDrop(event, comment.id)}
              onClick={() => onReply(comment)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onReply(comment);
              }}
            >
              <div className="comment-side-item-head">
                <button
                  type="button"
                  className="comment-side-drag-handle"
                  title={t('chat.queuedReorder')}
                  aria-label={t('chat.queuedReorder')}
                  draggable={canReorder}
                  disabled={!canReorder}
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => handleDragStart(event, comment)}
                  onDragEnd={() => setDragState(null)}
                >
                  <Icon name="grip-vertical" size={13} />
                </button>
                <span className="comment-side-author">
                  {author ? (
                    <span
                      className="comment-side-avatar"
                      style={{ background: commentAuthorAvatarColor(comment.authorMemberId ?? author.memberId) }}
                      aria-hidden="true"
                    >
                      {commentAuthorInitials(author.displayName)}
                    </span>
                  ) : null}
                  <span className="comment-side-author-copy">
                    <strong>{`${displayCommentNumber(comment, index)}. ${commentDisplayLabel(comment, t)}`}</strong>
                    {author ? (
                      <small>
                        {author.displayName}
                        {' · '}
                        {commentAuthorRoleLabel(author.role)}
                      </small>
                    ) : null}
                  </span>
                </span>
                <span className="comment-side-time">{formatCommentTime(commentActivityAt(comment), t)}</span>
                {sendable ? (
                  <button
                    type="button"
                    className={`comment-side-check${selected ? ' checked' : ''}`}
                    aria-label={selected ? t('chat.comments.deselect') : t('chat.comments.select')}
                    aria-pressed={selected}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleSelect(comment.id);
                    }}
                  >
                    {selected ? <Icon name="check" size={11} /> : null}
                  </button>
                ) : null}
              </div>
              <div className="comment-side-body">{comment.note}</div>
              {projectId && comment.attachments && comment.attachments.length > 0 ? (
                <div className="comment-side-attachments">
                  {comment.attachments.map((attachment) => {
                    const url = projectRawUrl(
                      projectId,
                      attachment.path,
                      workspaceContext,
                    );
                    return (
                      <a
                        key={attachment.path}
                        className="comment-side-attachment"
                        data-testid="comment-side-attachment"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={attachment.name}
                        title={attachment.name}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <img src={url} alt={attachment.name} />
                      </a>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {selectedCount > 0 ? (
        <div className="comment-side-selectbar" data-testid="comment-side-selectbar">
          <span className="comment-side-selectcount">{t('chat.comments.nSelected', { n: selectedCount })}</span>
          <Button variant="ghost" onClick={onClearSelection}>
            {t('chat.comments.clear')}
          </Button>
          {allowSendToChat ? (
            <Button
              variant="primary"
              data-testid="comment-side-send-claude"
              disabled={sending || sendDisabled}
              title={sendDisabled ? sendDisabledReason : undefined}
              onClick={() => void onSendSelected()}
            >
              {sending
                ? t('chat.comments.sending')
                : queueOnSend
                  ? t('chat.annotationQueue')
                  : t('chat.comments.sendToChat')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {composer ? <div className="comment-side-composer">{composer}</div> : null}
      {renderCreateForm && onCreateComment ? (
        <form
          className="comment-side-new-comment composer"
          onSubmit={(event) => {
            event.preventDefault();
            void submitNewComment();
          }}
        >
          <div className="composer-shell comment-side-new-comment-shell">
            <div className="composer-input-wrap">
              <div className="composer-textarea-layer">
                <textarea
                  value={newCommentDraft}
                  placeholder={t('chat.comments.placeholder')}
                  aria-label={t('chat.comments.placeholder')}
                  onChange={(event) => setNewCommentDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault();
                      void submitNewComment();
                    }
                  }}
                />
              </div>
            </div>
            <div className="composer-row comment-side-new-comment-actions">
              <button
                type="button"
                className="icon-btn"
                title={t('chat.attachTitle')}
                aria-label={t('chat.attachAria')}
                disabled
              >
                <Icon name="attach" size={15} />
              </button>
              <span className="composer-spacer" />
              <button
                type="submit"
                className={`composer-send${sending ? ' is-sending' : ''}`}
                disabled={!canCreateComment}
              >
                <Icon name="send" size={13} />
                <span>{sending ? t('chat.comments.sending') : t('chat.send')}</span>
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </aside>
  );
}

const COMMENT_SIDE_DRAG_MIME = 'application/x-open-design-preview-comment';

type CommentSideDropEdge = 'before' | 'after';

interface CommentSideDragState {
  draggingId: string;
  overId: string | null;
  edge: CommentSideDropEdge | null;
}

function commentSideDropEdgeForEvent(event: ReactDragEvent<HTMLElement>): CommentSideDropEdge {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function reorderPreviewCommentIds(
  comments: PreviewComment[],
  draggingId: string,
  targetId: string,
  edge: CommentSideDropEdge,
): string[] {
  const ids = comments.map((comment) => comment.id);
  const from = ids.indexOf(draggingId);
  if (from < 0) return ids;
  const [draggedId] = ids.splice(from, 1);
  const targetIndex = ids.indexOf(targetId);
  if (targetIndex < 0 || !draggedId) return comments.map((comment) => comment.id);
  ids.splice(edge === 'after' ? targetIndex + 1 : targetIndex, 0, draggedId);
  return ids;
}

/**
 * The persisted sort_key to write for a drag-reorder (recvq5BVsolIxi Phase
 * 2). `orderedIds` is the FULL post-drop order (see `reorderPreviewCommentIds`
 * above); `comments` is the pre-drop list the drag started from, so every id
 * OTHER than `draggedId` still carries its true current `sortKey`/`createdAt`.
 * Only `draggedId`'s row is ever written — this returns a midpoint between
 * its NEW neighbors (or one past whichever single neighbor it has at either
 * end of the list), never a whole-list renumber.
 */
export function computeReorderedSortKey(
  comments: PreviewComment[],
  orderedIds: string[],
  draggedId: string,
): number {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const newIndex = orderedIds.indexOf(draggedId);
  const dragged = byId.get(draggedId);
  if (newIndex < 0 || !dragged) return commentEffectiveSortKey(dragged ?? comments[0]!);
  const aboveId = newIndex > 0 ? orderedIds[newIndex - 1] : undefined;
  const belowId = newIndex < orderedIds.length - 1 ? orderedIds[newIndex + 1] : undefined;
  const above = aboveId ? byId.get(aboveId) : undefined;
  const below = belowId ? byId.get(belowId) : undefined;
  if (above && below) {
    return (commentEffectiveSortKey(above) + commentEffectiveSortKey(below)) / 2;
  }
  if (above) return commentEffectiveSortKey(above) - 1;
  if (below) return commentEffectiveSortKey(below) + 1;
  return commentEffectiveSortKey(dragged);
}

function CommentSideDock({
  comments,
  projectId,
  selectedIds,
  activeCommentId,
  collapsed,
  onCollapsedChange,
  onDismiss,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onReorder,
  onReply,
  onSendSelected,
  onCreateComment,
  canSendComment,
  currentUser,
  sending,
  queueOnSend = false,
  sendDisabled = false,
  sendDisabledReason,
  allowSendToChat = true,
  renderCreateForm = true,
  t,
  composer,
}: {
  comments: PreviewComment[];
  projectId?: string;
  selectedIds: Set<string>;
  activeCommentId: string | null;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onDismiss?: () => void;
  onToggleSelect: (commentId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onReorder?: (orderedIds: string[], draggedId: string) => void;
  onReply: (comment: PreviewComment) => void;
  onSendSelected: () => void | Promise<void>;
  onCreateComment?: (note: string) => boolean | Promise<boolean>;
  /** Team-collab gate: which comments the viewer may send to the agent (author
   * OR project owner). Defaults to all-sendable when absent (single-user). */
  canSendComment?: (comment: PreviewComment) => boolean;
  /** The viewer's own directory entry — see `CommentSidePanel`. */
  currentUser?: CollabCloudMemberDirectoryEntry | null;
  sending: boolean;
  queueOnSend?: boolean;
  sendDisabled?: boolean;
  sendDisabledReason?: string;
  allowSendToChat?: boolean;
  renderCreateForm?: boolean;
  t: TranslateFn;
  composer?: ReactNode;
}) {
  return (
    <div
      className={`comment-side-dock${collapsed ? ' collapsed' : ''}`}
      data-testid="comment-side-dock"
    >
      <CommentSidePanel
        comments={comments}
        projectId={projectId}
        selectedIds={selectedIds}
        activeCommentId={activeCommentId}
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
        onDismiss={onDismiss}
        onToggleSelect={onToggleSelect}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
        onReorder={onReorder}
        onReply={onReply}
        onSendSelected={onSendSelected}
        onCreateComment={onCreateComment}
        canSendComment={canSendComment}
        currentUser={currentUser}
        sending={sending}
        queueOnSend={queueOnSend}
        sendDisabled={sendDisabled}
        sendDisabledReason={sendDisabledReason}
        allowSendToChat={allowSendToChat}
        renderCreateForm={renderCreateForm}
        t={t}
        composer={composer}
      />
    </div>
  );
}

// Maps a CSS computed value (e.g. "rgb(40, 50, 60)" or "16px") to a form
// input value. Browsers return colors as rgb()/rgba(); HTML <input type=color>
// only accepts "#rrggbb". Lengths come back as "12px" or "0px"; we strip
// units for slider binding and re-append on emit.
//
// Note: <input type=color> has no alpha channel, so an rgba() with alpha < 1
// is collapsed to its opaque RGB equivalent here. Most agent-generated HTML
// uses opaque colors, so this is a known cosmetic limitation — a
// semi-transparent source value will display in the panel as fully opaque.
function rgbToHex(value: string | undefined): string {
  if (!value) return '#000000';
  const v = value.trim();
  if (v.startsWith('#') && (v.length === 7 || v.length === 4)) {
    if (v.length === 4) {
      return '#' + [1, 2, 3].map((i) => {
        const c = v.charAt(i);
        return c + c;
      }).join('');
    }
    return v;
  }
  const m = v.match(/rgba?\(\s*([0-9.]+)[ ,]+([0-9.]+)[ ,]+([0-9.]+)/i);
  if (!m) return '#000000';
  const toHex = (n: string) => {
    const x = Math.max(0, Math.min(255, Math.round(Number(n))));
    return x.toString(16).padStart(2, '0');
  };
  return '#' + toHex(m[1] ?? '0') + toHex(m[2] ?? '0') + toHex(m[3] ?? '0');
}

// Parse a CSS length to a number. Inspect's current sliders all clamp to a
// non-negative range (padding, font-size, border-radius), so we reject
// negatives at parse time too — otherwise a `-12px` source value would be
// silently floored to 0 by the slider clamp without the regex agreeing.
// If a future control needs negative values (e.g. margin), thread an
// explicit `allowNegative` flag rather than reintroducing `-?` here.
function pxToNumber(value: string | undefined): number {
  if (!value) return 0;
  const m = value.trim().match(/^(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function InspectPanel({
  target,
  onApply,
  onResetElement,
  onSaveToSource,
  onClose,
  saving,
  savedAt,
  error,
}: {
  target: InspectTarget;
  onApply: (prop: string, value: string) => void;
  onResetElement: (elementId: string) => void;
  onSaveToSource: () => void;
  onClose: () => void;
  saving: boolean;
  savedAt: number | null;
  error: string | null;
}) {
  const t = useT();
  // Local "draft" mirror of the most recent value the user picked, so
  // sliders/colors keep responding even before the iframe echoes back the
  // computed result. Reset whenever the selected element changes.
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    setDraft({});
  }, [target.elementId]);

  const value = (prop: string, fallback: string): string =>
    draft[prop] ?? fallback;

  function setVal(prop: string, raw: string) {
    setDraft((d) => ({ ...d, [prop]: raw }));
    onApply(prop, raw);
  }

  // Padding is exposed as a single shared slider that emits the `padding`
  // shorthand; the browser fans the value out to all four sides internally.
  // When per-side control becomes useful, switch to emitting explicit
  // padding-top / padding-right / padding-bottom / padding-left props
  // (the bridge already allow-lists those long-hand names).
  const initialPadding = pxToNumber(target.style.paddingTop);
  const initialFontSize = pxToNumber(target.style.fontSize);
  const initialRadius = pxToNumber(target.style.borderRadius);

  // Color / length controls all read through `draft` first so the input
  // tracks the most recent user pick even before getComputedStyle catches
  // up. Without this the picker would snap back to the initial computed
  // snapshot on every change and feel non-editable.
  const colorHex = value('color', rgbToHex(target.style.color));
  const bgHex = value('background-color', rgbToHex(target.style.backgroundColor));
  const padding = value('padding', String(initialPadding));
  const fontSize = value('font-size', String(initialFontSize));
  const radius = value('border-radius', String(initialRadius));
  const textAlign = value('text-align', target.style.textAlign || 'left');
  const fontWeight = value('font-weight', target.style.fontWeight || '400');
  // Parse once: `pxToNumber(...) || initial...` would treat a legitimate
  // `0px` draft as missing and snap the slider back to the original
  // computed value, making it impossible to remove padding/radius from an
  // element whose initial value is nonzero. `pxToNumber` already returns
  // 0 for unparseable input, so its result is safe to consume directly
  // and zero is preserved.
  const paddingNum = pxToNumber(padding);
  const fontSizeNum = pxToNumber(fontSize);
  const radiusNum = pxToNumber(radius);

  const justSaved = savedAt && Date.now() - savedAt < 4000;

  return (
    <aside className="inspect-panel" data-testid="inspect-panel">
      <header className="inspect-panel-head">
        <div className="inspect-panel-title">
          <strong title={target.label || target.elementId}>{target.label || target.elementId}</strong>
          <code title={target.selector}>{target.elementId}</code>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label={t('inspect.close')}>
          ×
        </Button>
      </header>

      {target.clickedDescendant ? (
        <div className="inspect-ancestor-notice" data-testid="inspect-ancestor-notice">
          <div className="inspect-ancestor-notice-icon" aria-hidden>
            i
          </div>
          <div className="inspect-ancestor-notice-text">
            You clicked <strong>{target.clickedDescendant.label}</strong>
            {target.clickedDescendant.text
              ? ` ("${target.clickedDescendant.text.slice(0, 40)}${target.clickedDescendant.text.length > 40 ? '...' : ''}")`
              : ''}
            , but it has no <code>data-od-id</code> annotation. Editing{' '}
            <strong>{target.label || target.elementId}</strong> instead, the nearest annotated ancestor.
          </div>
        </div>
      ) : null}

      <section className="inspect-section">
        <div className="inspect-section-label">{t('inspect.colors')}</div>
        <div className="inspect-row">
          <label htmlFor="ip-color">{t('inspect.text')}</label>
          <Input
            id="ip-color"
            data-testid="inspect-color"
            type="color"
            value={colorHex}
            onChange={(e) => setVal('color', e.target.value)}
          />
          <Input
            type="text"
            value={colorHex}
            onChange={(e) => setVal('color', e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="inspect-row">
          <label htmlFor="ip-bg">{t('inspect.background')}</label>
          <Input
            id="ip-bg"
            data-testid="inspect-bg"
            type="color"
            value={bgHex}
            onChange={(e) => setVal('background-color', e.target.value)}
          />
          <Input
            type="text"
            value={bgHex}
            onChange={(e) => setVal('background-color', e.target.value)}
            spellCheck={false}
          />
        </div>
      </section>

      <section className="inspect-section">
        <div className="inspect-section-label">{t('inspect.typography')}</div>
        <div className="inspect-row">
          <label htmlFor="ip-fs">{t('inspect.size')}</label>
          <input
            id="ip-fs"
            data-testid="inspect-font-size"
            type="range"
            min={8}
            max={160}
            step={1}
            value={clamp(fontSizeNum, 8, 160)}
            onChange={(e) => setVal('font-size', `${e.target.value}px`)}
          />
          <span className="inspect-row-value">{Math.round(fontSizeNum)}px</span>
        </div>
        <div className="inspect-row">
          <label htmlFor="ip-fw">{t('inspect.weight')}</label>
          <Select
            id="ip-fw"
            value={fontWeight}
            onChange={(e) => setVal('font-weight', e.target.value)}
          >
            {['100', '300', '400', '500', '600', '700', '800', '900'].map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </Select>
        </div>
        <div className="inspect-row">
          <label htmlFor="ip-ta">{t('inspect.align')}</label>
          <Select
            id="ip-ta"
            value={textAlign}
            onChange={(e) => setVal('text-align', e.target.value)}
          >
            {['left', 'center', 'right', 'justify'].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </div>
      </section>

      <section className="inspect-section">
        <div className="inspect-section-label">Spacing &amp; Shape</div>
        <div className="inspect-row">
          <label htmlFor="ip-pad">{t('inspect.padding')}</label>
          <input
            id="ip-pad"
            data-testid="inspect-padding"
            type="range"
            min={0}
            max={120}
            step={1}
            value={clamp(paddingNum, 0, 120)}
            onChange={(e) => setVal('padding', `${e.target.value}px`)}
          />
          <span className="inspect-row-value">{Math.round(paddingNum)}px</span>
        </div>
        <div className="inspect-row">
          <label htmlFor="ip-rad">{t('inspect.radius')}</label>
          <input
            id="ip-rad"
            data-testid="inspect-radius"
            type="range"
            min={0}
            max={120}
            step={1}
            value={clamp(radiusNum, 0, 120)}
            onChange={(e) => setVal('border-radius', `${e.target.value}px`)}
          />
          <span className="inspect-row-value">{Math.round(radiusNum)}px</span>
        </div>
      </section>

      <footer className="inspect-panel-footer">
        <Button
          variant="ghost"
          onClick={() => {
            setDraft({});
            onResetElement(target.elementId);
          }}
        >
          {t('inspect.resetElement')}
        </Button>
        <Button
          variant="primary"
          data-testid="inspect-save"
          disabled={saving}
          onClick={onSaveToSource}
        >
          {saving ? 'Saving…' : justSaved ? 'Saved ✓' : 'Save to source'}
        </Button>
      </footer>
      {error ? <div className="inspect-panel-error">{error}</div> : null}
    </aside>
  );
}

// Inspect-mode override entry as held in the host's authoritative map and as
// it travels in od:inspect-overrides messages. The host's persisted map is
// owned and mutated only by host-driven onApply / reset actions plus the
// initial parse of the source's <style data-od-inspect-overrides> block;
// inbound iframe messages are treated as preview acknowledgements, never as
// save input. Artifact code rendered with scripts enabled can call
// window.parent.postMessage with a forged payload — ev.source still points
// at iframe.contentWindow — so any field arriving from the iframe is
// untrusted. Even the structured `overrides` field could be tampered with
// to flip allow-listed properties on elements the user never edited, which
// is why we no longer ingest it on save.
type InspectOverridePayload = {
  selector?: unknown;
  props?: unknown;
};

// Authoritative host-side override map: elementId → { selector, props }.
// Mirrors the in-iframe shape so serializeInspectOverrides can consume it.
export type InspectOverrideEntry = {
  selector: string;
  props: Record<string, string>;
};
export type InspectOverrideMap = Record<string, InspectOverrideEntry>;

// Allow-list of CSS properties the host will persist on Save. Mirrors the
// in-iframe ALLOWED_PROPS list so the host doesn't accept properties that
// the bridge itself would reject.
const HOST_ALLOWED_INSPECT_PROPS = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-family',
  'line-height',
  'text-align',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-radius',
]);

// Reject values that could break out of `prop: value` and into the
// surrounding <style> block — semicolons, braces, angle brackets, and
// newlines. Mirrors the bridge's UNSAFE_VALUE regex.
const HOST_UNSAFE_INSPECT_VALUE = /[;{}<>\n\r]/;

// Reject elementIds whose characters could break out of `[attr="..."]`
// inside a <style> block. Forbidden:
//   - `"` and `\` would close the attribute string or smuggle CSS
//     escapes the host didn't pre-process;
//   - `<` and `>` would close the surrounding <style> tag;
//   - C0/C1 controls (newline, etc.) end the CSS rule under string
//     tokenization — kept in as defense-in-depth against parser quirks.
// Everything else — including ASCII whitespace and leading digits — is
// allowed, so deck labels like `01 Cover` survive instead of being
// dropped on the way to the persisted overrides block.
const HOST_UNSAFE_INSPECT_ID = /["\\<>\u0000-\u001f\u007f]/;

// Build the inspect overrides CSS body the host will persist, from the
// structured `overrides` field of an od:inspect-overrides message. The host
// MUST NOT trust the sibling `css` string — it is attacker-controlled when
// artifact JS forges the message. The selector is re-derived from each
// elementId; only allow-listed properties with safe values survive.
//
// Exported so unit tests can exercise the validator with hostile payloads.
export function serializeInspectOverrides(overrides: unknown): string {
  if (!overrides || typeof overrides !== 'object') return '';
  const map = overrides as Record<string, unknown>;
  const lines: string[] = [];
  for (const elementId of Object.keys(map)) {
    if (!elementId || HOST_UNSAFE_INSPECT_ID.test(elementId)) continue;
    const entry = map[elementId] as InspectOverridePayload | null | undefined;
    if (!entry || typeof entry !== 'object') continue;
    const props = entry.props;
    if (!props || typeof props !== 'object') continue;
    // Trust only the *kind* of selector the bridge built, not the value
    // it carried. The bridge runs CSS.escape over the elementId, so a raw
    // equality check against `[data-screen-label="${elementId}"]` would
    // miss legitimate deck labels like `01 Cover` (whitespace, leading
    // digit) and silently downgrade them to `[data-od-id="..."]`. The
    // elementId itself was sanitized above, so embedding it verbatim into
    // the re-derived selector is safe inside an attribute value string.
    const inboundSelector = typeof entry.selector === 'string' ? entry.selector : '';
    const attr = inboundSelector.startsWith('[data-screen-label="')
      ? 'data-screen-label'
      : 'data-od-id';
    const safeSelector = `[${attr}="${elementId}"]`;
    const decls: string[] = [];
    for (const [rawName, rawValue] of Object.entries(props as Record<string, unknown>)) {
      if (typeof rawName !== 'string' || typeof rawValue !== 'string') continue;
      const name = rawName.toLowerCase();
      if (!HOST_ALLOWED_INSPECT_PROPS.has(name)) continue;
      const value = rawValue.trim();
      if (!value || HOST_UNSAFE_INSPECT_VALUE.test(value)) continue;
      decls.push(`${name}: ${value} !important`);
    }
    if (!decls.length) continue;
    lines.push(`${safeSelector} { ${decls.join('; ')} }`);
  }
  return lines.join('\n');
}

// Apply a single host-driven prop change to the authoritative override map.
// Returns a new map (or the same reference if no-op so React skips renders).
// Empty value clears the prop; clearing the last prop drops the elementId.
// Mirrors the iframe bridge's applyOverride sanitization so the host map and
// the live preview stay in lock-step under the same rules.
export function updateInspectOverride(
  map: InspectOverrideMap,
  elementId: string,
  selector: string,
  prop: string,
  value: string,
): InspectOverrideMap {
  if (!elementId || HOST_UNSAFE_INSPECT_ID.test(elementId)) return map;
  const propName = String(prop || '').toLowerCase();
  if (!HOST_ALLOWED_INSPECT_PROPS.has(propName)) return map;
  const trimmed = String(value ?? '').trim();
  if (trimmed && HOST_UNSAFE_INSPECT_VALUE.test(trimmed)) return map;
  const existing = map[elementId];
  const nextProps: Record<string, string> = { ...(existing?.props ?? {}) };
  if (!trimmed) {
    if (!(propName in nextProps)) return map;
    delete nextProps[propName];
  } else if (nextProps[propName] === trimmed && existing?.selector === selector) {
    return map;
  } else {
    nextProps[propName] = trimmed;
  }
  const nextMap: InspectOverrideMap = { ...map };
  if (Object.keys(nextProps).length === 0) {
    delete nextMap[elementId];
  } else {
    nextMap[elementId] = { selector: selector || existing?.selector || '', props: nextProps };
  }
  return nextMap;
}

// Parse any persisted <style data-od-inspect-overrides> blocks in the
// artifact source into the host's authoritative override map. The host owns
// this map and only mutates it from onApply / reset actions plus this
// initial hydration step — inbound iframe od:inspect-overrides messages are
// not ingested. Without this step, opening a file that already carries an
// override block would leave the host map empty, so a Save-to-source after
// any subsequent edit could splice a CSS body that drops every previously
// saved rule for elements the user did not touch in this session.
//
// Mirrors the iframe bridge's hydrateOverridesFromDom: same allow-list,
// same value sanitizer, same selector kinds, so what the iframe applies and
// what the host persists stay in lock-step. Pure string transform; no DOM.
//
// HTML-aware: enumerates `<style data-od-inspect-overrides>` elements via
// the same walker used by the splicer, so a `<style data-od-inspect-overrides>`
// literal living inside a `<script>`, `<style>` (e.g. CSS comment), `<textarea>`,
// `<title>`, or HTML comment is not mistaken for a real override block. Without
// that exclusion, useEffect would seed the host map from forged/quoted text and
// a later Save-to-source would persist phantom CSS the user never created.
export function parseInspectOverridesFromSource(source: string): InspectOverrideMap {
  const map: InspectOverrideMap = {};
  if (!source) return map;
  for (const body of stripInspectOverridesAndIndex(source).bodies) {
    const ruleRe = /(\[data-(?:od-id|screen-label)="([^"]*)"\])\s*\{\s*([^}]*)\}/g;
    let ruleMatch: RegExpExecArray | null;
    while ((ruleMatch = ruleRe.exec(body)) !== null) {
      const selector = ruleMatch[1] ?? '';
      const elementId = ruleMatch[2] ?? '';
      const declBody = ruleMatch[3] ?? '';
      if (!selector || !elementId || HOST_UNSAFE_INSPECT_ID.test(elementId)) continue;
      const props: Record<string, string> = {};
      for (const raw of declBody.split(';')) {
        if (!raw) continue;
        const colon = raw.indexOf(':');
        if (colon <= 0) continue;
        const name = raw.slice(0, colon).trim().toLowerCase();
        if (!HOST_ALLOWED_INSPECT_PROPS.has(name)) continue;
        const value = raw.slice(colon + 1).replace(/!important/gi, '').trim();
        if (!value || HOST_UNSAFE_INSPECT_VALUE.test(value)) continue;
        props[name] = value;
      }
      if (Object.keys(props).length) {
        map[elementId] = { selector, props };
      }
    }
  }
  return map;
}

// HTML5 raw-text and escapable-raw-text elements: the parser does not
// interpret markup inside their contents, so a literal `</head>` or
// `<style data-od-inspect-overrides>` written as text inside one of them
// must NOT be treated as a real tag. Without this exclusion, a regex-only
// splicer can match `</head>` inside an inline <script> string literal or
// a CSS comment and inject the override block into the middle of
// JavaScript/CSS instead of the actual document head, corrupting the
// artifact on Save to source.
const RAW_TEXT_INSPECT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

// Decide whether a `<style ...>` opening tag actually carries a real
// `data-od-inspect-overrides` attribute, as opposed to merely mentioning
// the marker text inside another attribute name or value. The naive
// `\bdata-od-inspect-overrides\b` test against the whole tag text is
// over-broad in two cases:
//
//   1. A longer attribute name that has the marker as a prefix, e.g.
//      `<style data-od-inspect-overrides-note="docs">`. The `-` after
//      `overrides` is a non-word character, so `\b` matches and the tag
//      gets mis-stripped on save / mis-parsed on hydration.
//   2. The marker spelled inside an attribute value, e.g.
//      `<style title="data-od-inspect-overrides">`. The whole tag text
//      contains the literal, so the regex matches even though the actual
//      attribute names are `title` only.
//
// Both shapes occur in real artifacts (notes, documentation, fixtures)
// and would either silently drop the user's CSS on save or seed phantom
// overrides into the host map even though the artifact has no real
// override block. So we walk attributes proper, lower-casing each name
// and skipping any quoted value, and report a hit only when one of those
// names is exactly `data-od-inspect-overrides` (boolean attribute or
// assigned value, both legal HTML for our marker).
function styleTagIsInspectOverrideBlock(tagText: string): boolean {
  const start = /^<style/i.exec(tagText);
  if (!start) return false;
  let i = start[0].length;
  const end = tagText.length;
  while (i < end) {
    const ch = tagText.charAt(i);
    if (ch === '>') return false;
    if (ch === '/' || /\s/.test(ch)) {
      i++;
      continue;
    }
    const nameStart = i;
    while (i < end) {
      const c = tagText.charAt(i);
      if (c === '=' || c === '/' || c === '>' || /\s/.test(c)) break;
      i++;
    }
    const name = tagText.slice(nameStart, i).toLowerCase();
    while (i < end && /\s/.test(tagText.charAt(i))) i++;
    if (i < end && tagText.charAt(i) === '=') {
      i++;
      while (i < end && /\s/.test(tagText.charAt(i))) i++;
      const quote = tagText.charAt(i);
      if (quote === '"' || quote === "'") {
        i++;
        const close = tagText.indexOf(quote, i);
        i = close < 0 ? end : close + 1;
      } else {
        while (i < end) {
          const c = tagText.charAt(i);
          if (c === '>' || /\s/.test(c)) break;
          i++;
        }
      }
    }
    if (name === 'data-od-inspect-overrides') return true;
  }
  return false;
}

// Find the start (`<` position) of the matching close tag for a raw-text
// element, scanning case-insensitively. The close tag must be followed by
// a tag-name boundary (whitespace, `/`, or `>`) so a longer name like
// `</scripted>` doesn't accidentally close a `<script>`.
function findInspectRawTextEnd(source: string, start: number, name: string): number {
  const lower = source.toLowerCase();
  const needle = '</' + name.toLowerCase();
  let p = start;
  while (p < source.length) {
    const idx = lower.indexOf(needle, p);
    if (idx < 0) return -1;
    const after = source.charAt(idx + needle.length);
    if (after === '' || after === '>' || after === '/' || /\s/.test(after)) return idx;
    p = idx + needle.length;
  }
  return -1;
}

type InspectSpliceScan = {
  out: string;
  // Position in `out` immediately after the first top-level `<head ...>`
  // open tag, or -1 if no head was found outside raw-text content.
  headOpenEnd: number;
  // Position in `out` at the first top-level `</head>` close tag, or -1.
  headCloseStart: number;
  // Raw inner-text of every real `<style data-od-inspect-overrides>` element
  // discovered during the walk, in source order. Excludes occurrences inside
  // raw-text element contents and HTML comments. Hydration parses these
  // bodies for the host map; the splicer ignores them.
  bodies: string[];
};

// Walk `source` and produce a copy with every existing
// `<style data-od-inspect-overrides>...</style>` block removed, while
// remembering where the real (non-raw-text) `<head>` boundaries land in
// the output. The walker honours HTML comment, doctype/processing
// instruction, and raw-text element boundaries so the splicer can ignore
// tag-shaped literals inside scripts/styles/textareas/titles. Pure string
// transform — no DOM dependency, safe to run during SSR/tests.
function stripInspectOverridesAndIndex(source: string): InspectSpliceScan {
  const parts: string[] = [];
  const bodies: string[] = [];
  let outLen = 0;
  let headOpenEnd = -1;
  let headCloseStart = -1;
  let i = 0;
  function emit(text: string): void {
    if (!text) return;
    parts.push(text);
    outLen += text.length;
  }
  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt < 0) {
      emit(source.slice(i));
      break;
    }
    if (lt > i) emit(source.slice(i, lt));
    i = lt;
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      const stop = end < 0 ? source.length : end + 3;
      emit(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (source.startsWith('<!', i) || source.startsWith('<?', i)) {
      const end = source.indexOf('>', i + 2);
      const stop = end < 0 ? source.length : end + 1;
      emit(source.slice(i, stop));
      i = stop;
      continue;
    }
    const tagEnd = source.indexOf('>', i + 1);
    if (tagEnd < 0) {
      emit(source.slice(i));
      break;
    }
    const tagText = source.slice(i, tagEnd + 1);
    const closeMatch = /^<\/([a-zA-Z][a-zA-Z0-9-]*)/.exec(tagText);
    if (closeMatch) {
      const name = closeMatch[1]!.toLowerCase();
      if (name === 'head' && headCloseStart < 0) headCloseStart = outLen;
      emit(tagText);
      i = tagEnd + 1;
      continue;
    }
    const openMatch = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(tagText);
    if (!openMatch) {
      emit(tagText);
      i = tagEnd + 1;
      continue;
    }
    const name = openMatch[1]!.toLowerCase();
    const isSelfClose = /\/\s*>$/.test(tagText);
    if (name === 'head' && headOpenEnd < 0) headOpenEnd = outLen + tagText.length;
    if (name === 'style' && styleTagIsInspectOverrideBlock(tagText)) {
      // Strip the entire override block. A self-closing <style /> is a
      // degenerate authoring case; treat it as nothing to skip past.
      if (isSelfClose) {
        i = tagEnd + 1;
        continue;
      }
      const closeStart = findInspectRawTextEnd(source, tagEnd + 1, 'style');
      if (closeStart < 0) {
        // Unterminated override block — drop the rest of the document
        // rather than silently reflowing later content into a dangling
        // <style>. Matches the "stop" behaviour of the previous regex.
        i = source.length;
        continue;
      }
      bodies.push(source.slice(tagEnd + 1, closeStart));
      const closeEnd = source.indexOf('>', closeStart);
      let stop = closeEnd < 0 ? source.length : closeEnd + 1;
      while (stop < source.length && /\s/.test(source.charAt(stop))) stop++;
      i = stop;
      continue;
    }
    if (!isSelfClose && RAW_TEXT_INSPECT_ELEMENTS.has(name)) {
      const closeStart = findInspectRawTextEnd(source, tagEnd + 1, name);
      if (closeStart < 0) {
        emit(source.slice(i));
        i = source.length;
        continue;
      }
      const closeEnd = source.indexOf('>', closeStart);
      const stop = closeEnd < 0 ? source.length : closeEnd + 1;
      // Copy the entire raw-text element (open tag, body, close tag) to
      // the output verbatim so its contents pass through unmodified.
      emit(source.slice(i, stop));
      i = stop;
      continue;
    }
    emit(tagText);
    i = tagEnd + 1;
  }
  return { out: parts.join(''), headOpenEnd, headCloseStart, bodies };
}

// Splice (or remove) the inspect overrides <style> block in an HTML
// document. Idempotent: calling with the same css produces the same
// document. Empty css strips the block entirely.
//
// HTML-aware: the underlying scan ignores comments and raw-text element
// contents (script / style / textarea / title), so a literal `</head>` or
// `<style data-od-inspect-overrides>` written inside an inline script or
// style block does not trick the splicer into stripping user code or
// inserting the override block in the middle of JavaScript/CSS.
//
// Exported (via the module) so a unit test can drive it without a live
// browser. Pure string transform — no DOM, no parser dependency.
export function applyInspectOverridesToSource(source: string, css: string): string {
  const trimmed = css.trim();
  const { out, headOpenEnd, headCloseStart } = stripInspectOverridesAndIndex(source);
  if (!trimmed) return out;
  const block = `<style data-od-inspect-overrides>\n${trimmed}\n</style>\n`;
  if (headCloseStart >= 0) {
    return out.slice(0, headCloseStart) + block + out.slice(headCloseStart);
  }
  if (headOpenEnd >= 0) {
    return out.slice(0, headOpenEnd) + block + out.slice(headOpenEnd);
  }
  return block + out;
}

function anchorStateLabel(state: PreviewCommentAnchorState): string {
  switch (state) {
    case 'reanchored':
      return 'based on an older version';
    case 'stale':
      return 'anchor may have moved';
    case 'lost':
      return 'anchor lost';
    default:
      return '';
  }
}

function CommentPreviewOverlays({
  comments,
  provisionalPinNumber,
  liveTargets,
  hoveredTarget,
  hoveredPodMemberId,
  activeTarget,
  activeExistingCommentId = null,
  boardTool,
  showActivePin = false,
  scale,
  offsetX,
  offsetY,
  strokePoints,
  activeSlideIndex = null,
  driftLadder = false,
  currentVersion,
  onLostAnchors,
  onOpenComment,
}: {
  comments: PreviewComment[];
  /** Next pin number for a brand-new comment. Computed by the caller over the
   *  file's comments across ALL statuses (see `provisionalNextPinNumber`) —
   *  wider than `comments`, which carries only the open ones the canvas pins. */
  provisionalPinNumber: number;
  liveTargets: Map<string, PreviewCommentSnapshot>;
  hoveredTarget: PreviewCommentSnapshot | null;
  hoveredPodMemberId: string | null;
  activeTarget: PreviewCommentSnapshot | null;
  activeExistingCommentId?: string | null;
  boardTool: BoardTool;
  showActivePin?: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
  strokePoints: StrokePoint[];
  activeSlideIndex?: number | null;
  /** Team collaboration: resolve anchors through the drift ladder (keep + badge stale/lost)
   *  instead of the exact-match silent drop. Off for single-user. */
  driftLadder?: boolean;
  /** Current content version, used by the ladder to flag reanchored (older vN). */
  currentVersion?: number;
  /** Team collaboration: persist the durable `lost` capture (last-good position) so the
   *  ghost pin survives reload. Only fires in drift-ladder mode. */
  onLostAnchors?: (writeBacks: AnchorWriteBack[]) => void;
  onOpenComment: (comment: PreviewComment, snapshot: PreviewCommentSnapshot) => void;
}) {
  const overlayOffset = useMemo(() => ({ x: offsetX, y: offsetY }), [offsetX, offsetY]);
  const visibleComments = useMemo(
    () =>
      comments
        .map((comment, globalIndex) => {
          // recvq5BVsolIxi: the server-assigned pin_seq is the source of
          // truth (stable across edits, reconciled across devices); a
          // comment that doesn't carry one yet (a legacy row from before
          // this field existed, or a test fixture) falls back to its index
          // in `comments` — which the caller passes in stable CREATION
          // order (see FileViewer's creationSortedSideComments), so the
          // fallback matches exactly what `pinSeq` would have assigned.
          const markerNumber = typeof comment.pinSeq === 'number' ? comment.pinSeq : globalIndex + 1;
          if (driftLadder) {
            // Keep stale/lost comments and carry their state so the marker can
            // badge them, instead of silently dropping a drifted anchor.
            const resolution = resolveCommentAnchor(comment, liveTargets, currentVersion);
            return { comment, markerNumber, snapshot: resolution.snapshot, anchorState: resolution.state };
          }
          return {
            comment,
            markerNumber,
            snapshot: liveSnapshotForComment(comment, liveTargets),
            anchorState: 'anchored' as PreviewCommentAnchorState,
          };
        })
        .filter(
          (item): item is {
            comment: PreviewComment;
            markerNumber: number;
            snapshot: PreviewCommentSnapshot;
            anchorState: PreviewCommentAnchorState;
          } => Boolean(item.snapshot),
        )
        .filter(({ comment }) => commentVisibleOnDeckSlide(comment, activeSlideIndex)),
    [comments, liveTargets, activeSlideIndex, driftLadder, currentVersion],
  );
  // Team collaboration durability: when a comment first drifts to `lost`, persist its
  // last-good position once so the ghost pin survives reload. The ref set keeps
  // pointermove re-renders (during pod drawing) from re-firing the same capture;
  // the server COALESCEs too, so this is belt-and-suspenders idempotency.
  const persistedLostRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!driftLadder || !onLostAnchors) return;
    const plan = planLostAnchorWriteBacks(
      visibleComments.map(({ comment, snapshot, anchorState }) => ({
        comment,
        resolution: { state: anchorState, snapshot },
      })),
    );
    const fresh = plan.filter((writeBack) => !persistedLostRef.current.has(writeBack.commentId));
    if (fresh.length === 0) return;
    for (const writeBack of fresh) persistedLostRef.current.add(writeBack.commentId);
    onLostAnchors(fresh);
  }, [driftLadder, onLostAnchors, visibleComments]);
  // `onOpenComment` is an inline arrow from the parent (new identity every
  // render), so read it through a ref to keep the saved-marker memo below from
  // busting. The closure only calls stable state setters, so a current ref read
  // is always correct.
  const onOpenCommentRef = useRef(onOpenComment);
  onOpenCommentRef.current = onOpenComment;
  // Memoize the saved-marker subtree. While the user draws a pod lasso,
  // `strokePoints` updates on every pointermove and re-renders this overlay;
  // without this, every saved marker (bounds + JSX) was rebuilt each frame.
  // Keyed only on the marker inputs (NOT strokePoints), so a steady set of
  // comments reuses the whole subtree and React skips reconciling it.
  const savedMarkers = useMemo(
    () =>
      visibleComments.map(({ comment, markerNumber, snapshot, anchorState }) => {
        const bounds = overlayBoundsFromSnapshot(snapshot, scale, overlayOffset);
        const label = commentTargetDisplayName(comment);
        const drifted = anchorState !== 'anchored';
        return (
          <div
            key={comment.id}
            className={`comment-saved-marker${drifted ? ` comment-saved-marker--${anchorState}` : ''}`}
            style={{
              left: bounds.left,
              top: bounds.top,
              width: bounds.width,
              height: bounds.height,
            }}
            data-testid={`comment-saved-marker-${comment.elementId}`}
            data-anchor-state={anchorState}
            onClick={() => onOpenCommentRef.current(comment, snapshot)}
          >
            <div className="comment-saved-outline" />
            <button
              type="button"
              className="comment-saved-pin"
              onClick={(event) => {
                event.stopPropagation();
                onOpenCommentRef.current(comment, snapshot);
              }}
              title={
                drifted
                  ? `${markerNumber}. ${label} · ${anchorStateLabel(anchorState)}`
                  : `${markerNumber}. ${label}: ${comment.note}`
              }
              aria-label={`Open comment for ${label}`}
            >
              {markerNumber}
            </button>
          </div>
        );
      }),
    [visibleComments, scale, overlayOffset],
  );
  const activeSavedIndex = activeExistingCommentId
    ? comments.findIndex((comment) => comment.id === activeExistingCommentId)
    : -1;
  const activeSavedComment = activeSavedIndex >= 0 ? comments[activeSavedIndex] : undefined;
  const activePinNumber = activeSavedComment
    ? (typeof activeSavedComment.pinSeq === 'number' ? activeSavedComment.pinSeq : activeSavedIndex + 1)
    // A brand-new, not-yet-saved comment: provisional guess at what the
    // daemon will assign on create — `MAX(pin_seq)+1` across ALL of the
    // file's comments regardless of status, never open-count+1 (pin
    // numbers are permanent; deletion or resolution retires them, so a
    // count-based guess would collide with or resurrect a taken number).
    : provisionalPinNumber;
  const targetOverlay = activeTarget ?? hoveredTarget;
  return (
    <div className="comment-overlay-layer" aria-hidden={false}>
      {savedMarkers}
      {targetOverlay ? (
        <CommentTargetOverlay
          snapshot={targetOverlay}
          scale={scale}
          offset={overlayOffset}
          selected={Boolean(activeTarget)}
          hoveredMemberId={hoveredPodMemberId}
        />
      ) : null}
      {showActivePin && activeTarget ? (
        <div
          className="comment-active-pin"
          style={activeCommentPinStyle(activeTarget, scale, overlayOffset)}
          data-testid="comment-active-pin"
          aria-hidden="true"
        >
          {activePinNumber}
        </div>
      ) : null}
      {boardTool === 'pod' && strokePoints.length > 1 ? (
        <svg className="board-pod-stroke">
          <polyline
            points={strokePoints.map((point) => `${offsetX + point.x * scale},${offsetY + point.y * scale}`).join(' ')}
          />
        </svg>
      ) : null}
    </div>
  );
}

function activeCommentPinStyle(
  target: PreviewCommentSnapshot,
  scale: number,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): CSSProperties {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const anchor = target.hoverPoint ?? {
    x: target.position.x,
    y: target.position.y,
  };
  return {
    left: Math.round(offset.x + anchor.x * safeScale),
    top: Math.round(offset.y + anchor.y * safeScale),
  };
}

export function CommentTargetOverlay({
  snapshot,
  scale,
  offset,
  selected,
  hoveredMemberId,
}: {
  snapshot: PreviewCommentSnapshot;
  scale: number;
  offset?: { x: number; y: number };
  selected: boolean;
  hoveredMemberId?: string | null;
}) {
  const overlayOffset = offset ?? { x: 0, y: 0 };
  const displayMembers = podDisplayMembers(snapshot);
  if (displayMembers.length > 0) {
    const overlayWeights = podOverlayWeights(displayMembers);
    return (
      <>
        {displayMembers.map((member, index) => {
          const bounds = overlayBoundsFromSnapshot(member, scale, overlayOffset);
          const width = Math.round(member.position.width);
          const height = Math.round(member.position.height);
          const overlayWeight = overlayWeights[index] ?? {
            backgroundOpacity: 0.24,
            outlineOpacity: 0.72,
            ringOpacity: 0.18,
          };
          const overlayStyle: CSSProperties & Record<string, string | number> = {
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
            '--comment-overlay-bg': `rgba(22, 119, 255, ${overlayWeight.backgroundOpacity})`,
            '--comment-overlay-ring': `rgba(22, 119, 255, ${overlayWeight.ringOpacity})`,
            '--comment-overlay-border': `rgba(22, 119, 255, ${overlayWeight.outlineOpacity})`,
          };
          const isHoverFocused = hoveredMemberId === member.elementId;
          return (
            <div
              key={`${member.elementId}-${index}`}
              className={`comment-target-overlay comment-target-overlay--member${selected ? ' selected' : ''}${isHoverFocused ? ' is-hover-focused' : ''}`}
              style={overlayStyle}
              data-testid="comment-target-overlay"
            >
              <span className="comment-target-overlay-label">{snapshot.elementId}</span>
            </div>
          );
        })}
      </>
    );
  }
  // Non-member fallback: single-element snapshots have no per-member chips,
  // so the hover-focus channel never reaches this branch — no is-hover-focused
  // class needed here.
  const bounds = overlayBoundsFromSnapshot(snapshot, scale, overlayOffset);
  return (
    <div
      className={`comment-target-overlay${selected ? ' selected' : ''}`}
      style={{
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      }}
      data-testid="comment-target-overlay"
    >
      <span className="comment-target-overlay-label">{snapshot.elementId}</span>
    </div>
  );
}

function podDisplayMembers(snapshot: PreviewCommentSnapshot): PreviewCommentSnapshot[] {
  if (snapshot.selectionKind !== 'pod' || !Array.isArray(snapshot.podMembers)) return [];
  const memberSnapshots = snapshot.podMembers.map((member) => ({
    filePath: snapshot.filePath,
    elementId: member.elementId,
    selector: member.selector,
    label: member.label,
    text: member.text,
    position: member.position,
    htmlHint: member.htmlHint,
    selectionKind: 'element' as const,
  }));
  const refined = pruneContainerSelections(memberSnapshots);
  return refined.length > 0 ? refined : memberSnapshots;
}

function podOverlayWeights(
  members: PreviewCommentSnapshot[],
): Array<{ backgroundOpacity: number; outlineOpacity: number; ringOpacity: number }> {
  const areas = members.map((member) =>
    Math.max(1, member.position.width * member.position.height),
  );
  const maxArea = Math.max(...areas);
  const minArea = Math.min(...areas);
  return areas.map((area) => {
    const normalized =
      maxArea === minArea ? 1 : 1 - (area - minArea) / (maxArea - minArea);
    const emphasis = Math.pow(normalized, 0.9);
    return {
      backgroundOpacity: roundOverlayOpacity(0.1 + emphasis * 0.6),
      outlineOpacity: roundOverlayOpacity(0.34 + emphasis * 0.36),
      ringOpacity: roundOverlayOpacity(0.08 + emphasis * 0.18),
    };
  });
}

function roundOverlayOpacity(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildPodSnapshot(input: {
  filePath: string;
  strokePoints: StrokePoint[];
  liveTargets: Map<string, PreviewCommentSnapshot>;
}): PreviewCommentSnapshot | null {
  if (input.strokePoints.length < 2) return null;
  const closedLoop = isClosedLoop(input.strokePoints);
  const intersected = Array.from(input.liveTargets.values()).filter((snapshot) =>
    selectionHitsSnapshot({
      points: input.strokePoints,
      snapshot,
      closedLoop,
    }),
  );
  const refined = pruneContainerSelections(intersected);
  const selected = refined.length > 0 ? refined : intersected;
  if (selected.length === 0) return null;
  const bounds = selected.reduce(
    (acc, snapshot) => {
      const rect = snapshot.position;
      return {
        left: Math.min(acc.left, rect.x),
        top: Math.min(acc.top, rect.y),
        right: Math.max(acc.right, rect.x + rect.width),
        bottom: Math.max(acc.bottom, rect.y + rect.height),
      };
    },
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  );
  const podMembers: PreviewCommentMember[] = selected.map((snapshot) => ({
    elementId: snapshot.elementId,
    selector: snapshot.selector,
    label: snapshot.label,
    text: snapshot.text,
    position: snapshot.position,
    htmlHint: snapshot.htmlHint,
    style: snapshot.style,
  }));
  const summary = selected
    .slice(0, 3)
    .map((snapshot) => summarizeSnapshot(snapshot))
    .join(' · ');
  const htmlHint = selected
    .slice(0, 4)
    .map((snapshot) => snapshot.htmlHint)
    .filter(Boolean)
    .join(' ');
  const combinedSelector = selected
    .slice(0, 8)
    .map((snapshot) => snapshot.selector)
    .filter(Boolean)
    .join(', ');
  return {
    filePath: input.filePath,
    elementId: `pod-${Date.now()}`,
    selector: combinedSelector || 'body *',
    label: summary || `Pod of ${intersected.length} items`,
    text: intersected
      .slice(0, 4)
      .map((snapshot) => snapshot.text)
      .filter(Boolean)
      .join(' · '),
    position: {
      x: Math.round(bounds.left),
      y: Math.round(bounds.top),
      width: Math.max(1, Math.round(bounds.right - bounds.left)),
      height: Math.max(1, Math.round(bounds.bottom - bounds.top)),
    },
    htmlHint: htmlHint.slice(0, 180),
    selectionKind: 'pod',
    memberCount: selected.length,
    podMembers,
  };
}

function pruneContainerSelections(
  snapshots: PreviewCommentSnapshot[],
): PreviewCommentSnapshot[] {
  if (snapshots.length < 2) return snapshots;
  return snapshots.filter((candidate) => {
    const candidateArea = Math.max(1, candidate.position.width * candidate.position.height);
    const contained = snapshots.filter(
      (other) =>
        other.elementId !== candidate.elementId &&
        rectContains(candidate.position, other.position),
    );
    if (contained.length === 0) return true;
    const union = contained.reduce(
      (acc, other) => ({
        left: Math.min(acc.left, other.position.x),
        top: Math.min(acc.top, other.position.y),
        right: Math.max(acc.right, other.position.x + other.position.width),
        bottom: Math.max(acc.bottom, other.position.y + other.position.height),
      }),
      {
        left: Number.POSITIVE_INFINITY,
        top: Number.POSITIVE_INFINITY,
        right: Number.NEGATIVE_INFINITY,
        bottom: Number.NEGATIVE_INFINITY,
      },
    );
    const unionArea = Math.max(1, (union.right - union.left) * (union.bottom - union.top));
    return !(contained.length >= 2 && candidateArea > unionArea * 2.4);
  });
}

function summarizeSnapshot(snapshot: PreviewCommentSnapshot): string {
  const text = snapshot.text.trim();
  if (text) {
    const trimmed = text.length > 28 ? `${text.slice(0, 25)}...` : text;
    return `${snapshot.label || snapshot.elementId} · ${trimmed}`;
  }
  return snapshot.label || snapshot.elementId;
}

function selectionHitsSnapshot(input: {
  points: StrokePoint[];
  snapshot: PreviewCommentSnapshot;
  closedLoop: boolean;
}): boolean {
  const bounds = {
    left: input.snapshot.position.x,
    top: input.snapshot.position.y,
    width: input.snapshot.position.width,
    height: input.snapshot.position.height,
  };
  if (pathIntersectsRect(input.points, bounds)) return true;
  if (!input.closedLoop) return false;
  const center = {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
  if (pointInPolygon(center, input.points)) return true;
  const corners = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.left + bounds.width, y: bounds.top },
    { x: bounds.left + bounds.width, y: bounds.top + bounds.height },
    { x: bounds.left, y: bounds.top + bounds.height },
  ];
  return corners.some((corner) => pointInPolygon(corner, input.points));
}

function isClosedLoop(points: StrokePoint[]): boolean {
  if (points.length < 4) return false;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return Math.hypot(first.x - last.x, first.y - last.y) <= 28;
}

function rectContains(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

function pathIntersectsRect(
  points: StrokePoint[],
  rect: { left: number; top: number; width: number; height: number },
): boolean {
  if (points.length === 0) return false;
  const x1 = rect.left;
  const y1 = rect.top;
  const x2 = rect.left + rect.width;
  const y2 = rect.top + rect.height;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) {
      return true;
    }
    const next = points[index + 1];
    if (!next) continue;
    if (
      lineIntersectsLine(point, next, { x: x1, y: y1 }, { x: x2, y: y1 }) ||
      lineIntersectsLine(point, next, { x: x2, y: y1 }, { x: x2, y: y2 }) ||
      lineIntersectsLine(point, next, { x: x2, y: y2 }, { x: x1, y: y2 }) ||
      lineIntersectsLine(point, next, { x: x1, y: y2 }, { x: x1, y: y1 })
    ) {
      return true;
    }
  }
  return false;
}

function pointInPolygon(point: StrokePoint, polygon: StrokePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x <
        ((pj.x - pi.x) * (point.y - pi.y)) / ((pj.y - pi.y) || Number.EPSILON) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function lineIntersectsLine(a1: StrokePoint, a2: StrokePoint, b1: StrokePoint, b2: StrokePoint): boolean {
  const denominator =
    (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (denominator === 0) return false;
  const ua =
    ((b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x)) / denominator;
  const ub =
    ((a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x)) / denominator;
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

function finiteBridgeInteger(value: unknown): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return clampBridgeCoordinate(value);
}

function normalizeAnnotationStyle(input: unknown): PreviewCommentSnapshot['style'] {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as Record<string, unknown>;
  const style: NonNullable<PreviewCommentSnapshot['style']> = {};
  for (const key of ANNOTATION_STYLE_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed) style[key] = trimmed.slice(0, 120);
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

const ANNOTATION_STYLE_KEYS = [
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
  'fontFamily',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderRadius',
] as const;

function clampBridgeCoordinate(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-MAX_BRIDGE_COORDINATE, Math.min(MAX_BRIDGE_COORDINATE, Math.round(numeric)));
}

// Shown instead of the React runtime when a .jsx/.tsx is a module loaded by a
// sibling HTML entry (issue #2744): such a file has no standalone component to
// render, so point the user at the page(s) that do. Clicking an entry opens
// (or focuses) that page and closes the now-useless module tab.
function ReactModulePointer({
  entries,
  onOpenEntry,
}: {
  entries: string[];
  onOpenEntry?: (name: string) => void;
}) {
  const t = useT();
  return (
    <div className="viewer-module-pointer" role="note">
      <Icon name="info" size={20} />
      <h2 className="viewer-module-pointer__title">{t('fileViewer.jsxModuleTitle')}</h2>
      <p className="viewer-module-pointer__body">{t('fileViewer.jsxModuleBody')}</p>
      <p className="viewer-module-pointer__cta">{t('fileViewer.jsxModuleCta')}</p>
      <ul className="viewer-module-pointer__entries">
        {entries.map((name) => (
          <li key={name}>
            <button
              type="button"
              className="viewer-module-pointer__link"
              onClick={() => onOpenEntry?.(name)}
              disabled={!onOpenEntry}
            >
              <Icon name="external-link" size={14} />
              <span>{name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReactComponentViewer({
  projectId,
  projectKind,
  file,
  onOpenFileReplacing,
  projectName,
  projectDir,
  agents,
  artifactId,
  artifactKind: handoffArtifactKind,
  metricsConsent = false,
  installationId,
  viewerOnly = false,
  workspaceActive = true,
}: {
  projectId: string;
  projectKind: TrackingProjectKind;
  file: ProjectFile;
  onOpenFileReplacing?: (openName: string, closeName: string) => void;
  projectName?: string;
  projectDir?: string | null;
  agents?: AgentInfo[];
  artifactId?: string;
  artifactKind?: TrackingArtifactKind;
  metricsConsent?: boolean;
  installationId?: string | null;
  viewerOnly?: boolean;
  workspaceActive?: boolean;
}) {
  const t = useT();
  const analytics = useAnalytics();
  // `FileWorkspace` keeps a non-active viewer mounted, so an in-flight publish
  // can settle after the user has switched away. The ref carries the LIVE value
  // into those continuations; the captured prop would still read the
  // render-time `true`.
  const workspaceActiveRef = useRef(workspaceActive);
  workspaceActiveRef.current = workspaceActive;
  const { workspaceContext } = useProjectCollabContext();
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [source, setSource] = useState<string | null>(null);
  const [srcDoc, setSrcDoc] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [unifiedActionTab, setUnifiedActionTab] = useState<'share' | 'export'>('share');
  const [shareAccess, setShareAccess] = useState<'private' | 'workspace'>('private');
  const [shareAccessMenuOpen, setShareAccessMenuOpen] = useState(false);
  const [shareAccessConfirm, setShareAccessConfirm] = useState<'private' | 'workspace' | null>(null);
  const [shareAccessBusy, setShareAccessBusy] = useState(false);
  const [publishedFileUrl, setPublishedFileUrl] = useState('');
  const [publishedFileSlug, setPublishedFileSlug] = useState('');
  const [publishingPublicFile, setPublishingPublicFile] = useState(false);
  const [publishLinkFeedback, setPublishLinkFeedback] = useState<'copied' | 'failed' | null>(null);
  // Why a publish/unpublish attempt failed, as a message key. `publishLinkFeedback`
  // only renders inside the already-published branch, so a failed FIRST publish
  // used to leave no trace on screen at all — the button simply returned to idle.
  const [publishFailureKey, setPublishFailureKey] = useState<PublicFilePublishFailureKey | null>(null);
  const filePublished = publishedFileUrl.length > 0;
  // Public links need a signed-in workspace (any type); see canPublishPublicFile.
  const canPublishPublic = canPublishPublicFile(workspaceContext);
  const publicFileRequestSeqRef = useRef(0);
  const publicFileIdentityRef = useRef({ projectId, fileName: file.name });
  const shareRef = useRef<HTMLDivElement | null>(null);
  // HTML entries that load this file as a Babel module. `null` = still
  // checking; `[]` = standalone artifact; non-empty = a module of a
  // multi-file React prototype, which has no standalone preview. Issue #2744.
  const [moduleEntries, setModuleEntries] = useState<string[] | null>(null);
  const isModule = (moduleEntries?.length ?? 0) > 0;
  const viewerOnlyDisabledTitle = t('fileViewer.readonlySharedNoExport');

  useEffect(() => {
    setSource(null);
    let cancelled = false;
    void fetchProjectFileText(projectId, file.name, { workspaceContext }).then((text) => {
      if (!cancelled) setSource(text ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, reloadKey, workspaceContext]);

  // Detect whether this .jsx/.tsx is a module loaded by a sibling HTML entry.
  // Runs before any srcdoc is built so a module never flashes the raw
  // "No React component export found" error from the React runtime.
  useEffect(() => {
    setModuleEntries(null);
    let cancelled = false;
    void (async () => {
      try {
        const files = await fetchProjectFiles(projectId, { workspaceContext });
        const htmlNames = files
          .filter((entry) => /\.html?$/i.test(entry.name))
          .map((entry) => entry.name);
        const htmlSources = new Map<string, string>();
        await Promise.all(
          htmlNames.map(async (name) => {
            const text = await fetchProjectFileText(projectId, name, {
              workspaceContext,
            }).catch(() => null);
            if (text != null) htmlSources.set(name, text);
          }),
        );
        if (cancelled) return;
        setModuleEntries(findHtmlEntriesReferencing(file.name, htmlSources));
      } catch {
        if (!cancelled) setModuleEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, reloadKey, workspaceContext]);

  useEffect(() => {
    if (!shareMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!shareRef.current) return;
      if (!shareRef.current.contains(e.target as Node)) setShareMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [shareMenuOpen]);

  // Mirror the selected share access level onto the document body so shell-level
  // chrome can react to it (matches the demo's `data-artifact-share-access`).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.artifactShareAccess = shareAccess;
    return () => {
      delete document.body.dataset.artifactShareAccess;
    };
  }, [shareAccess]);

  useEffect(() => {
    let cancelled = false;
    const refreshShareAccess = () => void projectIsSharedWithWorkspace(projectId, workspaceContext).then((shared) => {
      if (!cancelled) setShareAccess(shared ? 'workspace' : 'private');
    });
    refreshShareAccess();
    window.addEventListener(TEAM_PROJECTS_CHANGED_EVENT, refreshShareAccess);
    return () => {
      cancelled = true;
      window.removeEventListener(TEAM_PROJECTS_CHANGED_EVENT, refreshShareAccess);
    };
  }, [projectId, shareMenuOpen, workspaceContext]);

  // Collapse the nested workspace-access listbox whenever the share popover
  // itself closes, so it never re-opens mid-flight.
  useEffect(() => {
    if (!shareMenuOpen) setShareAccessMenuOpen(false);
  }, [shareMenuOpen]);

  useEffect(() => {
    if (!viewerOnly) return;
    setShareMenuOpen(false);
    setShareAccessMenuOpen(false);
  }, [viewerOnly]);

  useEffect(() => {
    publicFileIdentityRef.current = { projectId, fileName: file.name };
    const requestSeq = ++publicFileRequestSeqRef.current;
    let cancelled = false;
    setPublishedFileUrl('');
    setPublishedFileSlug('');
    setPublishingPublicFile(false);
    setPublishLinkFeedback(null);
    setPublishFailureKey(null);
    // Off-team the read can only 409; don't spend a request per file open on it.
    if (!canPublishPublic) return;
    // A readonly viewer's publish surface is disabled outright, and the daemon
    // answers its probe with a slow fixed 403 (2.1 s in the packaged trace) —
    // skip it from the already-resolved capability state instead of asking and
    // failing (Batch A §4.4). `viewerOnly` fails closed while ownership is
    // still unknown, and this effect re-runs when it flips writable.
    if (viewerOnly) return;
    void fetchProjectFilePublicPublication(projectId, file.name, workspaceContext)
      .then((publication) => {
        const current = publicFileIdentityRef.current;
        if (
          cancelled ||
          publicFileRequestSeqRef.current !== requestSeq ||
          current.projectId !== projectId ||
          current.fileName !== file.name
        ) {
          return;
        }
        setPublishedFileUrl(publication?.url ?? '');
        setPublishedFileSlug(publication?.slug ?? '');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `canPublishPublic` is a dependency, not just a guard: the workspace context
    // loads asynchronously, so a team member's first render looks off-team. Without
    // it the hydrate would be skipped for good and an already-published file would
    // render as unpublished.
  }, [projectId, file.name, canPublishPublic, viewerOnly]);

  // Shared identity fields for the publish-flow events (ReactComponentViewer copy).
  // `artifactKindToTracking` only recognises HTML through the renderer id — a React
  // component's `file.kind` is `code`, which would degrade to `unknown` — and this
  // viewer is reached only through the `react-component` renderer match, so its
  // renderer identity is a constant.
  function publishTrackingIdentity() {
    return {
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({
        rendererId: 'react-component',
        fileKind: file.kind ?? null,
      }),
      project_id: projectId,
      project_kind: projectKind,
    } as const;
  }

  // Retained (inert) viewers must never report analytics — same rule the
  // HtmlViewer copy of this flow follows. Only the tracking is gated; the
  // publish/unpublish calls themselves stay unconditional.
  const firePublishFlowClick = (element: 'publish_file' | 'copy_publish_link') => {
    if (!workspaceActive) return;
    trackShareOptionPopoverClick(analytics.track, {
      page_name: 'artifact',
      area: 'share_option_popover',
      element,
      ...publishTrackingIdentity(),
    });
  };

  const firePublishResult = (
    outcome: Pick<
      ArtifactPublishResultProps,
      'action' | 'result' | 'error_code' | 'publish_duration_ms'
    >,
  ) => {
    // Read the live ref, not the captured prop: a request can start while this
    // viewer is active and settle after the user switches tabs.
    if (!workspaceActiveRef.current) return;
    trackArtifactPublishResult(analytics.track, {
      page_name: 'artifact',
      area: 'share_option_popover',
      ...outcome,
      ...publishTrackingIdentity(),
    });
  };

  async function publishCurrentFilePublic() {
    if (viewerOnly || publishingPublicFile) return;
    const requestProjectId = projectId;
    const requestFileName = file.name;
    const requestSeq = ++publicFileRequestSeqRef.current;
    firePublishFlowClick('publish_file');
    const publishStarted = performance.now();
    setPublishingPublicFile(true);
    setPublishLinkFeedback(null);
    setPublishFailureKey(null);
    try {
      const response = await publishProjectFilePublic(requestProjectId, requestFileName, workspaceContext);
      firePublishResult({
        action: 'publish',
        result: 'success',
        publish_duration_ms: Math.round(performance.now() - publishStarted),
      });
      const current = publicFileIdentityRef.current;
      if (
        publicFileRequestSeqRef.current !== requestSeq ||
        current.projectId !== requestProjectId ||
        current.fileName !== requestFileName
      ) {
        return;
      }
      setPublishedFileUrl(response.url);
      setPublishedFileSlug(response.slug);
    } catch (error) {
      console.warn('[FileViewer] failed to publish public file', error);
      firePublishResult({
        action: 'publish',
        result: 'failed',
        error_code: publishErrorCode(error),
        publish_duration_ms: Math.round(performance.now() - publishStarted),
      });
      if (publicFileRequestSeqRef.current === requestSeq) {
        setPublishLinkFeedback('failed');
        setPublishFailureKey(publicFilePublishFailureKey(error));
      }
    } finally {
      if (publicFileRequestSeqRef.current === requestSeq) setPublishingPublicFile(false);
    }
  }

  async function unpublishCurrentFilePublic() {
    if (!publishedFileSlug || publishingPublicFile) return;
    const requestProjectId = projectId;
    const requestFileName = file.name;
    const requestSlug = publishedFileSlug;
    const requestSeq = ++publicFileRequestSeqRef.current;
    const unpublishStarted = performance.now();
    setPublishingPublicFile(true);
    setPublishLinkFeedback(null);
    setPublishFailureKey(null);
    try {
      await unpublishProjectFilePublic(requestProjectId, requestFileName, requestSlug, workspaceContext);
      firePublishResult({
        action: 'unpublish',
        result: 'success',
        publish_duration_ms: Math.round(performance.now() - unpublishStarted),
      });
      const current = publicFileIdentityRef.current;
      if (
        publicFileRequestSeqRef.current !== requestSeq ||
        current.projectId !== requestProjectId ||
        current.fileName !== requestFileName
      ) {
        return;
      }
      setPublishedFileUrl('');
      setPublishedFileSlug('');
    } catch (error) {
      console.warn('[FileViewer] failed to unpublish public file', error);
      firePublishResult({
        action: 'unpublish',
        result: 'failed',
        error_code: publishErrorCode(error),
        publish_duration_ms: Math.round(performance.now() - unpublishStarted),
      });
      if (publicFileRequestSeqRef.current === requestSeq) {
        setPublishLinkFeedback('failed');
        setPublishFailureKey(publicFilePublishFailureKey(error));
      }
    } finally {
      if (publicFileRequestSeqRef.current === requestSeq) setPublishingPublicFile(false);
    }
  }

  async function copyPublishedFileLink() {
    firePublishFlowClick('copy_publish_link');
    let ok = false;
    try {
      if (publishedFileUrl && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(publishedFileUrl);
        ok = true;
      }
    } catch {
      ok = false;
    }
    const feedback = ok ? 'copied' : 'failed';
    setPublishLinkFeedback(feedback);
    window.setTimeout(() => {
      setPublishLinkFeedback((current) => (current === feedback ? null : current));
    }, 1800);
  }

  // Crossing the team-space boundary routes through the shared 转入/移出
  // 团队空间 confirmation (same dialog + 不再提示 skip key as the project
  // grid) instead of silently moving the project.
  function setWorkspaceShareAccess(nextAccess: 'private' | 'workspace') {
    setShareAccessMenuOpen(false);
    if (nextAccess === shareAccess || shareAccessBusy || viewerOnly) return;
    if (moveConfirmSkipped()) {
      void commitWorkspaceShareAccess(nextAccess);
      return;
    }
    setShareAccessConfirm(nextAccess);
  }

  async function commitWorkspaceShareAccess(nextAccess: 'private' | 'workspace') {
    setShareAccessBusy(true);
    try {
      await moveWorkspaceProject({
        projectId,
        visibility: nextAccess === 'workspace' ? 'team' : 'personal',
        workspaceContext,
      });
      setShareAccess(nextAccess);
      notifyTeamProjectsChanged();
    } catch (error) {
      console.warn('[FileViewer] failed to update workspace project sharing', error);
    } finally {
      setShareAccessBusy(false);
    }
  }

  const exportTitle = file.name.replace(/\.(jsx|tsx)$/i, '') || file.name;
  const sourceExtension = file.name.toLowerCase().endsWith('.tsx') ? '.tsx' : '.jsx';

  useEffect(() => {
    if (source === null || moduleEntries === null || isModule) {
      // No source yet, still checking module status, or this file is a module
      // with no standalone preview — never build the React runtime srcdoc.
      setSrcDoc('');
      return;
    }

    let cancelled = false;
    const buildSrcDoc = () => {
      const nextSrcDoc = buildReactComponentSrcdoc(source, { title: exportTitle });
      if (!cancelled) setSrcDoc(nextSrcDoc);
    };

    if (source.length > 100_000) {
      setSrcDoc('');
      const timeout = window.setTimeout(buildSrcDoc, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
      };
    }

    buildSrcDoc();
    return () => {
      cancelled = true;
    };
  }, [source, exportTitle, moduleEntries, isModule]);

  return (
    <div className="viewer react-component-viewer">
      {shareAccessConfirm ? (
        <MoveToTeamConfirmDialog
          action={shareAccessConfirm === 'workspace' ? 'to-team' : 'to-personal'}
          onCancel={() => setShareAccessConfirm(null)}
          onConfirm={() => {
            const next = shareAccessConfirm;
            setShareAccessConfirm(null);
            if (next) void commitWorkspaceShareAccess(next);
          }}
        />
      ) : null}
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <button
            type="button"
            className="icon-only od-tooltip"
            onClick={() => setReloadKey((n) => n + 1)}
            title={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
            data-tooltip={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
            data-tooltip-placement="bottom"
            aria-label={`${t('fileViewer.reloadAria')} ${t('fileViewer.preview')}`}
          >
            <Icon name="reload" size={14} />
          </button>
          <span className="viewer-meta">
            {t('fileViewer.reactMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <div className="viewer-toolbar-actions">
          <div className="viewer-tabs">
            <button
              type="button"
              className={`viewer-tab ${mode === 'preview' ? 'active' : ''}`}
              onClick={() => setMode('preview')}
            >
              {t('fileViewer.preview')}
            </button>
            <button
              type="button"
              className={`viewer-tab ${mode === 'source' ? 'active' : ''}`}
              onClick={() => setMode('source')}
            >
              {t('fileViewer.source')}
            </button>
          </div>
          {source !== null ? (
            <>
              <span className="viewer-divider" aria-hidden />
              <div className="share-menu chrome-share-menu chrome-share-menu--unified" ref={shareRef}>
                {/* Share and Export are separate toolbar intents again (the
                    0.18.0 unified tabs buried Export one level deep); they
                    still share one popover shell so switching keeps the menu
                    anchored in place. Export leads — it is the far more used
                    of the two (see the chrome header copy). */}
                {(['export', 'share'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    // Export leads and Share is the quieter neighbour — the same
                    // hierarchy the Html chrome gets from `chrome-action-dark` on
                    // Export only. One shared class here would give both intents
                    // the accent fill and flatten that distinction.
                    className={
                      tab === 'export'
                        ? 'viewer-action primary viewer-action-export od-tooltip'
                        : 'viewer-action od-tooltip'
                    }
                    aria-haspopup="menu"
                    aria-expanded={shareMenuOpen && unifiedActionTab === tab}
                    disabled={viewerOnly}
                    title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                    data-tooltip={
                      viewerOnly
                        ? viewerOnlyDisabledTitle
                        : tab === 'share'
                          ? t('fileViewer.unifiedShareTab')
                          : t('fileViewer.unifiedExportTab')
                    }
                    data-tooltip-placement="bottom"
                    onClick={() => {
                      setShareMenuOpen((v) => !(v && unifiedActionTab === tab));
                      setUnifiedActionTab(tab);
                    }}
                  >
                    <span className="export-action-spacer" aria-hidden />
                    <span>
                      {tab === 'share'
                        ? t('fileViewer.unifiedShareTab')
                        : t('fileViewer.unifiedExportTab')}
                    </span>
                    <RemixIcon name="arrow-down-s-line" size={14} />
                  </button>
                ))}
                {shareMenuOpen ? (
                  <div className="share-menu-popover chrome-unified-popover" role="menu">
                    {unifiedActionTab === 'share' ? (
                      <div className="chrome-unified-panel chrome-unified-panel--share">
                        {/* Sharing a project INTO a workspace needs a team on the other
                            end — a personal workspace has none, so `setWorkspaceShareAccess`
                            (moveWorkspaceProject → visibility: 'team') always fails there
                            (recvq5bM78HWCE: card rendered, click showed a failure toast).
                            `workspaceContextHasTeamIdentity` is the same predicate the
                            daemon's `teamShareRefusalFor` enforces server-side — this must
                            not be the wider `workspaceContextHasWorkspaceIdentity` gate the
                            public single-file publish card below uses; that one is
                            deliberately workspace-agnostic. */}
                        {workspaceContextHasTeamIdentity(workspaceContext) ? (
                        <>
                        {/* Access control gets the same section-label + row treatment as the
                            publish / deploy / save tiers below; its explanation moves into the
                            trailing "?" instead of a card sub-line. */}
                        <div className="share-menu-section-label share-menu-section-label--help" role="presentation">
                          <span>{t('fileViewer.workspaceShareTitle')}</span>
                          <button
                            type="button"
                            className="share-menu-help od-tooltip"
                            data-testid="workspace-access-help"
                            aria-label={shareAccess === 'private'
                              ? t('fileViewer.workspaceSharePrivateDescription')
                              : t('fileViewer.workspaceShareWorkspaceDescription')}
                            data-tooltip={shareAccess === 'private'
                              ? t('fileViewer.workspaceSharePrivateDescription')
                              : t('fileViewer.workspaceShareWorkspaceDescription')}
                            data-tooltip-placement="bottom"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <RemixIcon name="question-line" size={14} />
                          </button>
                        </div>
                        <div className="chrome-access-select">
                            <button
                              type="button"
                              className="chrome-access-trigger"
                              aria-haspopup="listbox"
                              aria-expanded={shareAccessMenuOpen}
                              disabled={shareAccessBusy || viewerOnly}
                              onClick={() => setShareAccessMenuOpen((v) => !v)}
                            >
                              <span className="share-menu-icon">
                                {/* recvqaVLC3MNaQ: switching access showed nothing but a
                                    disabled button — a spinner reads as "in progress"
                                    where a bare disabled state reads as broken/unresponsive. */}
                                <RemixIcon
                                  name={
                                    shareAccessBusy
                                      ? 'loader-4-line'
                                      : shareAccess === 'private'
                                        ? 'lock-line'
                                        : 'team-line'
                                  }
                                  size={16}
                                  className={shareAccessBusy ? 'icon-spin' : undefined}
                                />
                              </span>
                              <span>
                                {shareAccess === 'private'
                                  ? t('fileViewer.workspaceAccessPrivate')
                                  : t('fileViewer.workspaceAccessMembers')}
                              </span>
                              <RemixIcon name="arrow-down-s-line" size={16} />
                            </button>
                            {shareAccessMenuOpen ? (
                              <div className="chrome-access-options" role="listbox">
                                {([
                                  ['private', 'lock-line', t('fileViewer.workspaceAccessPrivate')],
                                  ['workspace', 'team-line', t('fileViewer.workspaceAccessMembers')],
                                ] as const).map(([value, icon, label]) => (
                                  <button
                                    key={value}
                                    type="button"
                                    role="option"
                                    aria-selected={shareAccess === value}
                                    className={shareAccess === value ? 'is-active' : undefined}
                                    disabled={shareAccessBusy || viewerOnly}
                                    onClick={() => void setWorkspaceShareAccess(value)}
                                  >
                                    <span className="share-menu-icon"><RemixIcon name={icon} size={16} /></span>
                                    <span>{label}</span>
                                    {shareAccess === value ? <RemixIcon name="check-line" size={15} /> : null}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </>
                        ) : null}
                        {/* Menu row like the tiers below — same structure as
                            the HtmlViewer copy. */}
                        {canPublishPublic ? (
                        <>
                        {/* The "?" lives on the section label, not inside the publish
                            menuitem — see the HtmlViewer copy for why. */}
                        <div className="share-menu-section-label share-menu-section-label--help" role="presentation">
                          <span>{t('fileViewer.shareMenuPublishViaOd')}</span>
                          <button
                            type="button"
                            className="share-menu-help od-tooltip"
                            data-testid="publish-help"
                            aria-label={t('fileViewer.publishSingleFileDescription')}
                            data-tooltip={t('fileViewer.publishSingleFileDescription')}
                            data-tooltip-placement="bottom"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <RemixIcon name="question-line" size={14} />
                          </button>
                        </div>
                        {filePublished ? (
                          <div className="chrome-publish-plain">
                            <div className="chrome-publish-url" title={publishedFileUrl}>
                                {publishedFileUrl}
                              </div>
                              <div className="chrome-publish-actions">
                                <button
                                  type="button"
                                  className="chrome-publish-button"
                                  onClick={() => {
                                    void copyPublishedFileLink();
                                  }}
                                >
                                  <RemixIcon name="file-copy-line" size={14} />
                                  {publishLinkFeedback === 'copied'
                                    ? t('fileViewer.copied')
                                    : publishLinkFeedback === 'failed'
                                      ? t('useEverywhere.copyFailed')
                                      : t('fileViewer.copyShareLink')}
                                </button>
                                <button
                                  type="button"
                                  className="chrome-publish-button chrome-publish-button--ghost"
                                  disabled={publishingPublicFile}
                                  onClick={() => {
                                    void unpublishCurrentFilePublic();
                                  }}
                                >
                                  {t('fileViewer.unpublishFile')}
                                </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="share-menu-item"
                            role="menuitem"
                            disabled={viewerOnly || publishingPublicFile}
                            aria-busy={publishingPublicFile}
                            title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                            onClick={() => {
                              void publishCurrentFilePublic();
                            }}
                          >
                            <span className="share-menu-icon">
                              <RemixIcon
                                name={publishingPublicFile ? 'loader-4-line' : 'upload-cloud-2-line'}
                                size={15}
                                className={publishingPublicFile ? 'icon-spin' : undefined}
                              />
                            </span>
                            <span>{publishingPublicFile ? t('fileViewer.publishingFile') : t('fileViewer.publishSingleFileTitle')}</span>
                          </button>
                        ) }
                        {publishFailureKey ? (
                          <p className="chrome-publish-error" role="status">
                            {t(publishFailureKey)}
                          </p>
                        ) : null}
                        </>
                        ) : null}
                      </div>
                    ) : null}
                    {unifiedActionTab === 'export' ? (
                      <div className="chrome-unified-panel">
                        <button
                          type="button"
                          className="share-menu-item"
                          role="menuitem"
                          disabled={viewerOnly}
                          title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                          onClick={() => {
                            if (viewerOnly) return;
                            setShareMenuOpen(false);
                            exportAsJsx(source, exportTitle, sourceExtension);
                          }}
                        >
                          <span className="share-menu-icon"><RemixIcon name="file-code-line" size={15} /></span>
                          <span>{t('fileViewer.exportJsx')}</span>
                        </button>
                        <button
                          type="button"
                          className="share-menu-item"
                          role="menuitem"
                          disabled={viewerOnly}
                          title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                          onClick={() => {
                            if (viewerOnly) return;
                            setShareMenuOpen(false);
                            exportReactComponentAsHtml(source, exportTitle);
                          }}
                        >
                          <span className="share-menu-icon"><RemixIcon name="file-line" size={15} /></span>
                          <span>{t('fileViewer.exportReactHtml')}</span>
                        </button>
                        <div className="share-menu-divider" />
                        <button
                          type="button"
                          className="share-menu-item"
                          role="menuitem"
                          disabled={viewerOnly}
                          title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                          onClick={() => {
                            if (viewerOnly) return;
                            setShareMenuOpen(false);
                            exportReactComponentAsZip(source, exportTitle, sourceExtension);
                          }}
                        >
                          <span className="share-menu-icon"><RemixIcon name="file-zip-line" size={15} /></span>
                          <span>{t('fileViewer.exportZip')}</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {viewerOnly ? null : (
                <HandoffButton
                  projectId={projectId}
                  projectName={projectName}
                  projectDir={projectDir}
                  agents={agents}
                  artifactId={artifactId}
                  artifactKind={handoffArtifactKind}
                  metricsConsent={metricsConsent}
                  installationId={installationId}
                />
              )}
            </>
          ) : null}
        </div>
      </div>
      <div className="viewer-body">
        {isModule && mode === 'preview' ? (
          // Module of a multi-file prototype: no standalone preview, so the
          // Preview tab shows a pointer to the HTML entry. The Source tab still
          // renders the raw code below. Issue #2744.
          <ReactModulePointer
            entries={moduleEntries ?? []}
            onOpenEntry={(htmlName) => onOpenFileReplacing?.(htmlName, file.name)}
          />
        ) : source === null || (mode === 'preview' && !srcDoc) ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : mode === 'preview' ? (
          <PreviewDrawOverlay>
            <iframe
              data-testid="react-component-preview-frame"
              title={file.name}
              sandbox="allow-scripts allow-downloads"
              srcDoc={srcDoc}
              style={{ width: '100%', height: '100%', border: 0 }}
            />
          </PreviewDrawOverlay>
        ) : (
          <CodeWithLines text={source} />
        )}
      </div>
    </div>
  );
}

function BinaryViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  return (
    <div className="viewer binary-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.binaryMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body">
        <div className="viewer-empty">
          {t('fileViewer.binaryNote', { size: file.size })}
        </div>
      </div>
    </div>
  );
}

function DocumentPreviewViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const { workspaceContext } = useProjectCollabContext();
  const [preview, setPreview] = useState<ProjectFilePreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    void fetchProjectFilePreview(projectId, file.name, workspaceContext).then((next) => {
      if (!cancelled) {
        setPreview(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, workspaceContext]);

  return (
    <div className="viewer document-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {documentMetaLabel(file, t)} · {humanSize(file.size)}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body">
        {loading ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : preview ? (
          <div className="document-preview">
            <h2>{preview.title}</h2>
            {preview.sections.map((section, idx) => (
              <section key={`${section.title}-${idx}`}>
                <h3>{section.title}</h3>
                {section.lines.map((line, lineIdx) => (
                  <p key={`${lineIdx}-${line}`}>{line}</p>
                ))}
              </section>
            ))}
          </div>
        ) : (
          <div className="viewer-empty">{t('fileViewer.previewUnavailable')}</div>
        )}
      </div>
    </div>
  );
}

export function fileViewerSourceAuthorizationScopeKey(
  workspaceContextLoading: boolean,
  workspaceContext: WorkspaceCollabContext | null,
  projectResourceAuthority?: ProjectResourceAuthority,
): string | null {
  const authority = projectResourceAuthority
    ?? (workspaceContextLoading ? 'pending' : workspaceContext ? 'workspace' : 'local');
  if (authority === 'local') return 'local';
  if (authority === 'workspace' && workspaceContext) {
    return `workspace:${workspaceIdentityCacheKey(workspaceContext)}`;
  }
  return null;
}

/**
 * A srcdoc document whose `load` completed while the browser tab was hidden
 * has never experienced a real layout pass: Chrome keeps the hidden iframe's
 * child viewport at 0x0, so a fixed-canvas deck's one-shot fit resolves to
 * `transform: scale(0)`, and the in-frame recovery loop (`chaseFirstLayout`
 * in runtime/srcdoc.ts) is exhausted by background-timer throttling before
 * the user returns — leaving the main stage permanently white (issue #6583).
 * Such a document must be given a fresh srcdoc parse on the first return to
 * a visible document. Scoped to decks, which always render through the
 * srcdoc transport and carry the one-shot fit; other srcdoc artifacts
 * re-layout on their own.
 */
function srcDocLoadRequiresFreshParseOnReturnToVisible(state: {
  loadedWhileDocumentHidden: boolean;
  srcDocIsActiveTransport: boolean;
  isDeck: boolean;
}): boolean {
  return state.loadedWhileDocumentHidden && state.srcDocIsActiveTransport && state.isDeck;
}

function HtmlViewer({
  projectId,
  projectKind,
  file: requestedFile,
  liveHtml,
  filesRefreshKey: requestedFilesRefreshKey = 0,
  isDeck,
  streaming,
  commentQueueOnSend = false,
  commentSendDisabled = false,
  previewComments = [],
  onSavePreviewComment,
  onRemovePreviewComment,
  onReorderPreviewComment,
  onSendBoardCommentAttachments,
  onFileSaved,
  onBrandExtractionStopRequest,
  onOpenFileReplacing,
  commentPortalId,
  onCommentModeChange,
  shareRequest,
  downloadRequest,
  slideNavRequest,
  viewerOnly = false,
  projectName,
  projectDir,
  agents,
  artifactId,
  artifactKind: handoffArtifactKind,
  metricsConsent = false,
  installationId,
  workspaceActive = true,
  onRetainActivityChange,
  onManualEditExitHandlerChange,
  manualEditEntryAllowed = true,
}: {
  projectId: string;
  projectKind: TrackingProjectKind;
  file: ProjectFile;
  liveHtml?: string;
  filesRefreshKey?: number;
  isDeck: boolean;
  streaming: boolean;
  commentQueueOnSend?: boolean;
  commentSendDisabled?: boolean;
  previewComments?: PreviewComment[];
  onSavePreviewComment?: (target: PreviewCommentTarget, note: string, attachAfterSave: boolean, images?: File[], commentId?: string) => Promise<PreviewComment | null>;
  onRemovePreviewComment?: (commentId: string) => Promise<boolean>;
  onReorderPreviewComment?: (commentId: string, sortKey: number) => Promise<void>;
  onSendBoardCommentAttachments?: (attachments: ChatCommentAttachment[], images?: File[]) => Promise<CommentSendResult> | CommentSendResult;
  onFileSaved?: () => Promise<void> | void;
  onBrandExtractionStopRequest?: () => void;
  onOpenFileReplacing?: (openName: string, closeName: string) => void;
  commentPortalId?: string;
  onCommentModeChange?: (active: boolean) => void;
  shareRequest?: { nonce: number } | null;
  downloadRequest?: { nonce: number } | null;
  slideNavRequest?: { slideIndex: number; nonce: number } | null;
  // Read-only viewer of a team-shared project: comment-only, no edit/export.
  viewerOnly?: boolean;
  projectName?: string;
  projectDir?: string | null;
  agents?: AgentInfo[];
  artifactId?: string;
  artifactKind?: TrackingArtifactKind;
  metricsConsent?: boolean;
  installationId?: string | null;
  workspaceActive?: boolean;
  onRetainActivityChange?: (fileName: string, retain: boolean) => void;
  onManualEditExitHandlerChange?: (
    fileName: string,
    handler: (() => Promise<boolean>) | null,
  ) => void;
  manualEditEntryAllowed?: boolean;
}) {
  const { locale, t } = useI18n();
  const iframeKeepAlivePool = useIframeKeepAlivePool();
  // Keep the entire file revision coherent with the retained viewer's active
  // state. A watcher commonly advances mtime and filesRefreshKey together;
  // reading live mtime while freezing only the token still changes iframe src
  // in the background. Hidden viewers record the latest revision and promote
  // it once, synchronously, when they become active again.
  const pendingFileRef = useRef(requestedFile);
  const consumedFileRef = useRef(requestedFile);
  pendingFileRef.current = requestedFile;
  if (workspaceActive) consumedFileRef.current = pendingFileRef.current;
  const file = consumedFileRef.current;
  const {
    workspaceContext: observedWorkspaceContext,
    workspaceContextLoading,
    projectResourceAuthority,
  } = useProjectCollabContext();
  const observedSourceAuthorizationScopeKey = fileViewerSourceAuthorizationScopeKey(
    workspaceContextLoading,
    observedWorkspaceContext,
    projectResourceAuthority,
  );
  // Project context providers may re-materialize an equivalent object while
  // ambient focus/presence settles. Requests are scoped by the fields encoded
  // in this key, so preserve the existing object until that wire identity
  // actually changes. Otherwise every provider refresh retriggers raw/file-list
  // effects and reloads a byte-identical preview.
  const stableWorkspaceContextRef = useRef<{
    key: string | null;
    value: WorkspaceCollabContext | null;
  }>({
    key: observedSourceAuthorizationScopeKey,
    value: observedSourceAuthorizationScopeKey?.startsWith('workspace:')
      ? observedWorkspaceContext
      : null,
  });
  // ProjectView turns transient scope loading into `workspace` only when an
  // exact persisted-project/caller witness remains valid. Pending and denied
  // states deliberately replace a prior key with null, clearing old content.
  if (stableWorkspaceContextRef.current.key !== observedSourceAuthorizationScopeKey) {
    stableWorkspaceContextRef.current = {
      key: observedSourceAuthorizationScopeKey,
      value: observedSourceAuthorizationScopeKey?.startsWith('workspace:')
        ? observedWorkspaceContext
        : null,
    };
  }
  const workspaceContext = stableWorkspaceContextRef.current.value;
  const sourceAuthorizationScopeKey = stableWorkspaceContextRef.current.key;
  const projectResourceReadBlocked =
    sourceAuthorizationScopeKey === null;
  // A retained viewer must not consume global file-watch pulses while hidden.
  // Remember only the latest token and apply it synchronously on activation so
  // a long-hidden tab performs one refresh, never one request per missed pulse.
  const pendingFilesRefreshKeyRef = useRef(requestedFilesRefreshKey);
  const consumedFilesRefreshKeyRef = useRef(requestedFilesRefreshKey);
  const appliedFilesRefreshKeyRef = useRef(requestedFilesRefreshKey);
  const resumedFilesRefreshRef = useRef<{
    projectId: string;
    fileName: string;
    refreshKey: number;
  } | null>(null);
  const previousWorkspaceActiveRef = useRef(workspaceActive);
  const previousFileRevisionRef = useRef({
    projectId,
    fileName: file.name,
    mtime: file.mtime,
    size: file.size,
  });
  const workspaceActiveRef = useRef(workspaceActive);
  workspaceActiveRef.current = workspaceActive;
  pendingFilesRefreshKeyRef.current = requestedFilesRefreshKey;
  if (workspaceActive) {
    consumedFilesRefreshKeyRef.current = pendingFilesRefreshKeyRef.current;
    const previousFileRevision = previousFileRevisionRef.current;
    const sameFile = previousFileRevision.projectId === projectId
      && previousFileRevision.fileName === file.name;
    const fileRevisionChanged = sameFile && (
      previousFileRevision.mtime !== file.mtime
      || previousFileRevision.size !== file.size
    );
    // FileWorkspace freezes an inactive viewer's ProjectFile snapshot. When it
    // reactivates with a newer mtime, the normal base URL/source refresh already
    // loads that latest revision. The same is true when ProjectView atomically
    // commits a refreshed metadata snapshot and its generation key. In either
    // case, encode the generation in the declarative URL and skip a second
    // delayed refresh.
    if (
      appliedFilesRefreshKeyRef.current !== pendingFilesRefreshKeyRef.current
      && sameFile
      && (!previousWorkspaceActiveRef.current || fileRevisionChanged)
    ) {
      resumedFilesRefreshRef.current = {
        projectId,
        fileName: file.name,
        refreshKey: pendingFilesRefreshKeyRef.current,
      };
      appliedFilesRefreshKeyRef.current = pendingFilesRefreshKeyRef.current;
    }
    previousFileRevisionRef.current = {
      projectId,
      fileName: file.name,
      mtime: file.mtime,
      size: file.size,
    };
  }
  previousWorkspaceActiveRef.current = workspaceActive;
  const filesRefreshKey = consumedFilesRefreshKeyRef.current;
  const activeFilesRefreshPending = workspaceActive
    && filesRefreshKey !== 0
    && appliedFilesRefreshKeyRef.current !== filesRefreshKey;
  const analytics = useAnalytics();
  // Team collaboration: resolve comment anchors through the drift ladder when
  // the viewer is a team member of a shared project. Off (exact-match, single
  // user) otherwise. From the ProjectView-provided collab context — no props to
  // thread, no second collab client.
  const collab = useProjectCollabContext();
  // Latest per-slide capture progress for the programmatic exporters, read by
  // the loading-toast ticker in fireShareExport to render elapsed time + ETA.
  const exportProgressRef = useRef<{ done: number; total: number } | null>(null);
  const unknownExportOrigin = (
    status: ArtifactExportOriginProps['artifact_origin_status'] = 'missing_version',
  ): ArtifactExportOriginProps => ({
    entry_surface: 'open_design_ui',
    artifact_origin_status: status,
    origin_entry_surface: 'unknown',
  });
  const resolveArtifactExportOrigin = async (
    context?: HtmlVersionExportContext | null,
  ): Promise<ArtifactExportOriginProps> => {
    const content = context?.content ?? sourceRef.current;
    if (content == null) return unknownExportOrigin();
    let version = context?.version ?? null;
    if (!version) {
      const result = await fetchProjectFileVersions(projectId, file.name);
      version = result?.versions.find((candidate) => candidate.current) ?? null;
    }
    return artifactExportOriginProps(content, version);
  };
  const resolveManualEditParentVersionId = async (
    content: string,
  ): Promise<string | undefined> => {
    try {
      const result = await fetchProjectFileVersions(projectId, file.name);
      const currentVersion = result?.versions?.find((candidate) => candidate.current) ?? null;
      return matchingArtifactVersionId(content, currentVersion);
    } catch {
      // Provenance is fail-closed: inability to prove the parent must not
      // block a user edit, but it also must not inherit an origin.
      return undefined;
    }
  };
  // Shared helper for the share menu: emit studio_click share_option on
  // entry and artifact_export_result on resolution. Sync exports report
  // success immediately after the call returns; async exports get .then
  // / .catch. The same request_id threads both events so PostHog can
  // stitch click → result via $insert_id correlation.
  const fireShareExport = (
    format:
      | 'pdf'
      | 'pptx'
      | 'zip'
      | 'html'
      | 'image'
      | 'markdown'
      | 'template'
      | 'share_link'
      | 'share_page',
    fn: () => Promise<unknown> | unknown,
    context?: HtmlVersionExportContext | null,
  ) => {
    if (!workspaceActive) return;
    const requestId = analytics.newRequestId();
    const artifactId = anonymizeArtifactId({ projectId, fileName: file.name });
    const artifactKind = artifactKindToTracking({ fileKind: file.kind ?? null });
    const trackingFormat = format;
    trackShareOptionPopoverClick(
      analytics.track,
      {
        page_name: 'artifact',
        area: 'share_option_popover',
        artifact_id: artifactId,
        artifact_kind: artifactKind,
        element: trackingFormat,
        project_id: projectId,
        project_kind: projectKind,
      },
      { requestId },
    );
    const started = performance.now();
    const originPromise = resolveArtifactExportOrigin(context)
      .catch(() => unknownExportOrigin());
    const finish = async (result: 'success' | 'failed' | 'cancelled', errorCode?: string) => {
      const originProps = await originPromise;
      trackArtifactExportResult(
        analytics.track,
        {
          page_name: 'artifact',
          area: 'share_option_popover',
          artifact_id: artifactId,
          artifact_kind: artifactKind,
          project_id: projectId,
          project_kind: projectKind,
          export_format: trackingFormat,
          result,
          ...originProps,
          ...(errorCode ? { error_code: errorCode } : {}),
          export_duration_ms: Math.round(performance.now() - started),
        },
        { requestId },
      );
      // Onboarding first-loop 交付 step (spec §8.3): only a SUCCESSFUL export
      // closes the loop. Project-scoped — a no-op unless the project was
      // started from the Home recommendation.
      if (result === 'success') recordFirstLoopStep(analytics.track, 'delivered', projectId);
    };
    const toastFormats = new Set(['pdf', 'pptx', 'zip', 'html', 'image', 'markdown']);
    // Programmatic exports compute in-browser and can take a while (one render
    // per deck slide), so the loading toast ticks every second with elapsed time
    // and — once at least one slide is captured — a live ETA derived from the
    // average time per completed slide. onExportProgress (passed into the export
    // call by the menu item) feeds slide progress into exportProgressRef.
    exportProgressRef.current = null;
    const startedAt = performance.now();
    let ticker: ReturnType<typeof setInterval> | null = null;
    const renderLoadingToast = () => {
      if (!toastFormats.has(format)) return;
      const elapsedS = Math.max(0, Math.round((performance.now() - startedAt) / 1000));
      const p = exportProgressRef.current;
      let message: string;
      if (p && p.total > 1 && p.done > 0) {
        const remainingS = Math.max(
          1,
          Math.round(((performance.now() - startedAt) / p.done) * (p.total - p.done) / 1000),
        );
        message = t('fileViewer.exportSlideEta', { current: p.done, total: p.total, seconds: remainingS });
      } else if (p && p.total > 1) {
        message = t('fileViewer.exportSlideProgress', { current: p.done, total: p.total });
      } else {
        message = elapsedS > 0
          ? t('fileViewer.exportingElapsed', { seconds: elapsedS })
          : t('fileViewer.exportingProgress');
      }
      setExportToast({ message, tone: 'loading' });
    };
    const stopTicker = () => {
      if (ticker != null) {
        clearInterval(ticker);
        ticker = null;
      }
    };
    if (toastFormats.has(format)) {
      renderLoadingToast();
      ticker = setInterval(renderLoadingToast, 1000);
    }
    const failToast = (err?: unknown) => {
      stopTicker();
      const message = err instanceof Error && err.message ? err.message : t('fileViewer.exportFailed');
      if (toastFormats.has(format)) setExportToast({ message, tone: 'error' });
    };
    try {
      const out = fn();
      if (out && typeof (out as Promise<unknown>).then === 'function') {
        (out as Promise<unknown>).then(
          (result) => {
            stopTicker();
            if (result === 'cancelled') {
              void finish('cancelled');
              if (toastFormats.has(format)) setExportToast(null);
              return;
            }
            void finish('success');
            if (toastFormats.has(format)) setExportToast({ message: t('fileViewer.exportDone'), tone: 'success' });
          },
          (err) => {
            void finish('failed', exportErrorCode(err));
            failToast(err);
          },
        );
      } else {
        stopTicker();
        if (out === 'cancelled') {
          void finish('cancelled');
          if (toastFormats.has(format)) setExportToast(null);
          return;
        }
        void finish('success');
        if (toastFormats.has(format)) setExportToast({ message: t('fileViewer.exportDone'), tone: 'success' });
      }
    } catch (err) {
      void finish('failed', exportErrorCode(err));
      failToast(err);
    }
  };
  // Feeds per-slide capture progress into the ref the loading-toast ticker reads
  // (apps/web/src/runtime/exports.ts drives this for the PDF exporter).
  const onExportProgress: ExportProgress = (done, total) => {
    exportProgressRef.current = { done, total };
  };
  // P0 helpers — keep the artifact_id + artifact_kind derivation in one place
  // so each per-button onClick stays a one-liner. We compute lazily inside the
  // closure because `file.kind` / `file.name` can change as the user navigates
  // tabs without remounting HtmlViewer.
  const fireArtifactToolbarClick = (
    element:
      | 'reload'
      | 'preview'
      | 'source'
      | 'screenshot'
      | 'edit_screenshot'
      | 'tweaks'
      | 'mark'
      | 'comment'
      | 'pods'
      | 'inspect'
      | 'edit'
      | 'zoom_out'
      | 'zoom_level_dropdown'
      | 'zoom_in'
      | 'versions',
    entryFrom?: 'toolbar' | 'more_menu',
  ) => {
    if (!workspaceActive) return;
    trackArtifactToolbarClick(analytics.track, {
      page_name: 'artifact',
      area: 'artifact_toolbar',
      element,
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
      ...(entryFrom ? { entry_from: entryFrom } : {}),
    });
  };
  const fireDrawToolbarClick = (
    element: DrawToolbarElement,
    submitAction?: 'draft' | 'queue' | 'send',
  ) => {
    if (!workspaceActive) return;
    trackDrawToolbarClick(analytics.track, {
      page_name: 'artifact',
      area: 'draw_toolbar',
      element,
      ...(submitAction ? { submit_action: submitAction } : {}),
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
    });
  };
  const fireArtifactHeaderClick = (
    element:
      | 'back'
      | 'edit'
      | 'present_dropdown'
      | 'download_dropdown'
      | 'share_dropdown'
      | 'settings',
  ) => {
    if (!workspaceActive) return;
    trackArtifactHeaderClick(analytics.track, {
      page_name: 'artifact',
      area: 'artifact_header',
      element,
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
    });
  };
  const firePresentPopoverClick = (
    element: 'in_this_tab' | 'fullscreen' | 'new_tab',
  ) => {
    if (!workspaceActive) return;
    trackPresentPopoverClick(analytics.track, {
      page_name: 'artifact',
      area: 'present_popover',
      element,
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
    });
  };
  const fireDeckViewerClick = (
    element:
      | 'slide_prev'
      | 'slide_next'
      | 'slide_reset'
      | 'thumbnail_select'
      | 'thumbnail_rail_toggle'
      | 'speaker_notes_edit',
    extra?: {
      action?: 'expand' | 'collapse';
      slide_index?: number;
      slide_count?: number;
    },
  ) => {
    if (!workspaceActive) return;
    trackDeckViewerClick(analytics.track, {
      page_name: 'artifact',
      area: 'deck_viewer',
      element,
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
      ...(extra?.action ? { action: extra.action } : {}),
      ...(typeof extra?.slide_index === 'number'
        ? { slide_index: extra.slide_index }
        : {}),
      ...(typeof extra?.slide_count === 'number'
        ? { slide_count: extra.slide_count }
        : {}),
    });
  };
  const fireCommentPopoverClick = (
    element: 'save_comment' | 'send_to_chat' | 'add_note',
  ) => {
    if (!workspaceActive) return;
    trackCommentPopoverClick(analytics.track, {
      page_name: 'artifact',
      area: 'comment_popover',
      element,
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
    });
  };
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const sourceSnapshotRefreshKey = htmlSourceSnapshotRefreshKey(file, filesRefreshKey);
  const [initialSourceSnapshot] = useState(() => (
    liveHtml === undefined && sourceAuthorizationScopeKey
      ? getHtmlSourceSnapshot(
          sourceAuthorizationScopeKey,
          projectId,
          file.name,
          sourceSnapshotRefreshKey,
        )
      : null
  ));
  const initialSource = liveHtml ?? initialSourceSnapshot?.source ?? null;
  const [source, setSource] = useState<string | null>(initialSource);
  const [routingSource, setRoutingSource] = useState<string | null>(initialSource);
  const srcDocPreviewBaseIdentity =
    `${sourceAuthorizationScopeKey ?? 'pending'}\0${projectId}\0${file.name}`;
  const currentSourceIdentity =
    `${srcDocPreviewBaseIdentity}\0${liveHtml === undefined ? 'raw' : 'live'}`;
  const [routingSourceIdentity, setRoutingSourceIdentity] = useState<string | null>(
    initialSource !== null ? currentSourceIdentity : null,
  );
  const [scopedSrcDocPreviewBase, setScopedSrcDocPreviewBase] = useState<{
    identity: string;
    href: string;
  } | null>(null);
  const effectiveScopedSrcDocPreviewBase =
    scopedSrcDocPreviewBase?.identity === srcDocPreviewBaseIdentity
      ? scopedSrcDocPreviewBase.href
      : null;
  const [serverPoweredPreviewRequired, setServerPoweredPreviewRequired] = useState(false);
  const [previewAssetWarning, setPreviewAssetWarning] = useState<PreviewAssetWarning | null>(null);
  const [inlinedSource, setInlinedSource] = useState<string | null>(null);
  const fileViewportKey = previewViewportStateKey(projectId, file);
  // Content width is valid only for this exact file revision/authorization
  // snapshot. Viewport and manual zoom preferences intentionally persist
  // across revisions, but an intrinsic-width witness must not.
  const previewContentWidthCacheBaseKey =
    `${fileViewportKey}:${sourceSnapshotRefreshKey}:${sourceAuthorizationScopeKey ?? ''}`;
  // Lazily seed from the cache (not a hardcoded 100/'auto') so a remount that
  // lands back on a file the user already zoomed doesn't flash the wrong
  // value for a frame before the reset effect below corrects it.
  const [zoom, setZoom] = useState<number>(
    () => htmlPreviewZoomState.get(fileViewportKey)?.zoom ?? 100,
  );
  const [zoomMode, setZoomMode] = useState<'auto' | 'manual'>(
    () => htmlPreviewZoomState.get(fileViewportKey)?.zoomMode ?? 'auto',
  );
  const [previewViewport, setPreviewViewportState] = useState<PreviewViewportId>(
    () => htmlPreviewViewportState.get(fileViewportKey) ?? 'desktop',
  );
  const setPreviewViewport = useCallback((viewport: PreviewViewportId) => {
    setPreviewViewportCached(fileViewportKey, viewport);
    setPreviewViewportState(viewport);
  }, [fileViewportKey]);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement | null>(null);
  const [presentMenuOpen, setPresentMenuOpen] = useState(false);
  // Single open-state for the unified chrome share/export/send popover; the
  // active tab is `unifiedActionTab`. External share/download requests below just
  // preselect the tab and open this one popover.
  const [deployMenuOpen, setDeployMenuOpen] = useState(false);
  const [unifiedActionTab, setUnifiedActionTab] = useState<'share' | 'export'>('share');
  const [shareAccess, setShareAccess] = useState<'private' | 'workspace'>('private');
  const [shareAccessMenuOpen, setShareAccessMenuOpen] = useState(false);
  const [shareAccessConfirm, setShareAccessConfirm] = useState<'private' | 'workspace' | null>(null);
  const [shareAccessBusy, setShareAccessBusy] = useState(false);
  const [publishedFileUrl, setPublishedFileUrl] = useState('');
  const [publishedFileSlug, setPublishedFileSlug] = useState('');
  const [publishingPublicFile, setPublishingPublicFile] = useState(false);
  const [publishLinkFeedback, setPublishLinkFeedback] = useState<'copied' | 'failed' | null>(null);
  // Why a publish/unpublish attempt failed, as a message key. `publishLinkFeedback`
  // only renders inside the already-published branch, so a failed FIRST publish
  // used to leave no trace on screen at all — the button simply returned to idle.
  const [publishFailureKey, setPublishFailureKey] = useState<PublicFilePublishFailureKey | null>(null);
  const filePublished = publishedFileUrl.length > 0;
  // Public links need a signed-in workspace (any type); see canPublishPublicFile.
  const canPublishPublic = canPublishPublicFile(workspaceContext);
  const publicFileRequestSeqRef = useRef(0);
  const publicFileIdentityRef = useRef({ projectId, fileName: file.name });
  // False when closed; otherwise records which entry opened the modal so the
  // surface_view impression can carry entry_from.
  const [toolbarMoreOpen, setToolbarMoreOpen] = useState(false);
  const toolbarMoreRef = useRef<HTMLDivElement | null>(null);
  const toolbarMoreTriggerRef = useRef<HTMLButtonElement | null>(null);
  useDismissOnOutsideInteraction(toolbarMoreOpen, toolbarMoreRef, () => setToolbarMoreOpen(false));
  const [versionModalOpen, setVersionModalOpen] = useState<false | 'toolbar' | 'more_menu'>(false);
  const [exportReadyNudge, setExportReadyNudge] = useState(false);
  const exportReadyNudgeSeenRef = useRef<Set<string>>(new Set());
  // Template save UX. We surface a transient "Saved" pill in the share
  // menu so the user gets feedback without a noisy toast layer.
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateNote, setTemplateNote] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  useEffect(() => {
    setPreviewViewportState(htmlPreviewViewportState.get(fileViewportKey) ?? 'desktop');
    // Restore this file's last zoom instead of hard-resetting to 100/auto —
    // this effect also fires on every HtmlViewer remount (e.g. switching to
    // the Design Files tab and back), not just on a genuine file change, and
    // a hardcoded reset was clobbering a zoom the user had already landed on
    // (rec:recvqaeMAGUdN2). A file with no cache entry yet (first open) still
    // falls back to the normal auto-fit default.
    const cachedZoom = htmlPreviewZoomState.get(fileViewportKey);
    setZoom(cachedZoom?.zoom ?? 100);
    setZoomMode(cachedZoom?.zoomMode ?? 'auto');
  }, [fileViewportKey]);
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateSaveError, setTemplateSaveError] = useState<string | null>(null);
  const [deployment, setDeployment] = useState<WebDeploymentInfo | null>(null);
  const [deploymentsByProvider, setDeploymentsByProvider] = useState<Partial<Record<WebDeployProviderId, WebDeploymentInfo>>>({});
  const deploymentsLoadSeqRef = useRef(0);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deployModalIntent, setDeployModalIntent] = useState<'deploy' | 'social-share'>('deploy');
  const closeDeployModal = useCallback(() => {
    setDeployModalOpen(false);
    setDeployModalIntent('deploy');
  }, []);
  const [deployConfig, setDeployConfig] = useState<WebDeployConfigResponse | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployPhase, setDeployPhase] = useState<'idle' | 'deploying' | 'preparing-link'>('idle');
  const [savingDeployConfig, setSavingDeployConfig] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<WebDeployProjectFileResponse | null>(null);
  const [copiedDeployLink, setCopiedDeployLink] = useState<string | null>(null);
  const [deployProviderId, setDeployProviderId] = useState<WebDeployProviderId>(DEFAULT_DEPLOY_PROVIDER_ID);
  const [deployTarget, setDeployTarget] = useState<'preview' | 'production'>('production');
  const [projectSocialShare, setProjectSocialShare] = useState<SocialShareResponse | null>(null);
  const [deployToken, setDeployToken] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teamSlug, setTeamSlug] = useState('');
  const [cloudflareAccountId, setCloudflareAccountId] = useState('');
  const [cloudflareZones, setCloudflareZones] = useState<CloudflarePagesZoneOption[]>([]);
  const [cloudflareZonesLoading, setCloudflareZonesLoading] = useState(false);
  const [cloudflareZonesError, setCloudflareZonesError] = useState<string | null>(null);
  const [cloudflareZoneId, setCloudflareZoneId] = useState('');
  const [cloudflareDomainPrefix, setCloudflareDomainPrefix] = useState('');
  const deployProviderLoadSeqRef = useRef(0);
  const deployTokenInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!workspaceActive || !deployModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeDeployModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeDeployModal, deployModalOpen, workspaceActive]);
  // Mirror the selected share access level onto the document body so shell-level
  // chrome can react to it (matches the demo's `data-artifact-share-access`).
  useEffect(() => {
    if (!workspaceActive || typeof document === 'undefined') return;
    document.body.dataset.artifactShareAccess = shareAccess;
    return () => {
      delete document.body.dataset.artifactShareAccess;
    };
  }, [shareAccess, workspaceActive]);

  useEffect(() => {
    if (!workspaceActive) return;
    let cancelled = false;
    const refreshShareAccess = () => void projectIsSharedWithWorkspace(projectId, workspaceContext).then((shared) => {
      if (!cancelled) setShareAccess(shared ? 'workspace' : 'private');
    });
    refreshShareAccess();
    window.addEventListener(TEAM_PROJECTS_CHANGED_EVENT, refreshShareAccess);
    return () => {
      cancelled = true;
      window.removeEventListener(TEAM_PROJECTS_CHANGED_EVENT, refreshShareAccess);
    };
  }, [projectId, deployMenuOpen, workspaceActive, workspaceContext]);

  // Collapse the nested workspace-access listbox whenever the unified share
  // popover itself closes, so it never re-opens mid-flight.
  useEffect(() => {
    if (!deployMenuOpen) setShareAccessMenuOpen(false);
  }, [deployMenuOpen]);

  useEffect(() => {
    publicFileIdentityRef.current = { projectId, fileName: file.name };
    const requestSeq = ++publicFileRequestSeqRef.current;
    let cancelled = false;
    setPublishedFileUrl('');
    setPublishedFileSlug('');
    setPublishingPublicFile(false);
    setPublishLinkFeedback(null);
    setPublishFailureKey(null);
    if (!workspaceActive) return;
    // Off-team the read can only 409; don't spend a request per file open on it.
    if (!canPublishPublic) return;
    // A readonly viewer's publish surface is disabled outright, and the daemon
    // answers its probe with a slow fixed 403 (2.1 s in the packaged trace) —
    // skip it from the already-resolved capability state instead of asking and
    // failing (Batch A §4.4). `viewerOnly` fails closed while ownership is
    // still unknown, and this effect re-runs when it flips writable.
    if (viewerOnly) return;
    void fetchProjectFilePublicPublication(projectId, file.name, workspaceContext)
      .then((publication) => {
        const current = publicFileIdentityRef.current;
        if (
          cancelled ||
          publicFileRequestSeqRef.current !== requestSeq ||
          current.projectId !== projectId ||
          current.fileName !== file.name
        ) {
          return;
        }
        setPublishedFileUrl(publication?.url ?? '');
        setPublishedFileSlug(publication?.slug ?? '');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `canPublishPublic` is a dependency, not just a guard: the workspace context
    // loads asynchronously, so a team member's first render looks off-team. Without
    // it the hydrate would be skipped for good and an already-published file would
    // render as unpublished.
  }, [
    projectId,
    file.name,
    canPublishPublic,
    viewerOnly,
    workspaceActive,
    sourceAuthorizationScopeKey,
  ]);

  // Shared identity fields for the publish-flow events (HtmlViewer copy).
  // `artifactKindToTracking` only recognises HTML through the renderer id — an HTML
  // artifact's `file.kind` is `html`, which would degrade to `unknown` — and this
  // viewer is reached only through the `html` / `deck-html` renderer matches, which
  // is exactly what the `isDeck` prop is derived from.
  function publishTrackingIdentity() {
    return {
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({
        rendererId: isDeck ? 'deck-html' : 'html',
        fileKind: file.kind ?? null,
      }),
      project_id: projectId,
      project_kind: projectKind,
    } as const;
  }

  // Background (inert) HtmlViewer instances must never report analytics, same
  // as every other emission site in this component. Only the tracking is
  // gated — the publish/unpublish calls themselves stay unconditional.
  const firePublishFlowClick = (element: 'publish_file' | 'copy_publish_link') => {
    if (!workspaceActive) return;
    trackShareOptionPopoverClick(analytics.track, {
      page_name: 'artifact',
      area: 'share_option_popover',
      element,
      ...publishTrackingIdentity(),
    });
  };

  const firePublishResult = (
    outcome: Pick<
      ArtifactPublishResultProps,
      'action' | 'result' | 'error_code' | 'publish_duration_ms'
    >,
  ) => {
    // Read the live ref, not the captured prop: a publish/unpublish request can
    // start while this viewer is active and settle after the user switches tabs,
    // and the in-flight continuation still holds the render-time `true`.
    if (!workspaceActiveRef.current) return;
    trackArtifactPublishResult(analytics.track, {
      page_name: 'artifact',
      area: 'share_option_popover',
      ...outcome,
      ...publishTrackingIdentity(),
    });
  };

  async function publishCurrentFilePublic() {
    if (viewerOnly || publishingPublicFile) return;
    const requestProjectId = projectId;
    const requestFileName = file.name;
    const requestSeq = ++publicFileRequestSeqRef.current;
    firePublishFlowClick('publish_file');
    const publishStarted = performance.now();
    setPublishingPublicFile(true);
    setPublishLinkFeedback(null);
    setPublishFailureKey(null);
    try {
      const response = await publishProjectFilePublic(requestProjectId, requestFileName, workspaceContext);
      firePublishResult({
        action: 'publish',
        result: 'success',
        publish_duration_ms: Math.round(performance.now() - publishStarted),
      });
      const current = publicFileIdentityRef.current;
      if (
        publicFileRequestSeqRef.current !== requestSeq ||
        current.projectId !== requestProjectId ||
        current.fileName !== requestFileName
      ) {
        return;
      }
      setPublishedFileUrl(response.url);
      setPublishedFileSlug(response.slug);
    } catch (error) {
      console.warn('[FileViewer] failed to publish public file', error);
      firePublishResult({
        action: 'publish',
        result: 'failed',
        error_code: publishErrorCode(error),
        publish_duration_ms: Math.round(performance.now() - publishStarted),
      });
      if (publicFileRequestSeqRef.current === requestSeq) {
        setPublishLinkFeedback('failed');
        setPublishFailureKey(publicFilePublishFailureKey(error));
      }
    } finally {
      if (publicFileRequestSeqRef.current === requestSeq) setPublishingPublicFile(false);
    }
  }

  async function unpublishCurrentFilePublic() {
    if (!publishedFileSlug || publishingPublicFile) return;
    const requestProjectId = projectId;
    const requestFileName = file.name;
    const requestSlug = publishedFileSlug;
    const requestSeq = ++publicFileRequestSeqRef.current;
    const unpublishStarted = performance.now();
    setPublishingPublicFile(true);
    setPublishLinkFeedback(null);
    setPublishFailureKey(null);
    try {
      await unpublishProjectFilePublic(requestProjectId, requestFileName, requestSlug, workspaceContext);
      firePublishResult({
        action: 'unpublish',
        result: 'success',
        publish_duration_ms: Math.round(performance.now() - unpublishStarted),
      });
      const current = publicFileIdentityRef.current;
      if (
        publicFileRequestSeqRef.current !== requestSeq ||
        current.projectId !== requestProjectId ||
        current.fileName !== requestFileName
      ) {
        return;
      }
      setPublishedFileUrl('');
      setPublishedFileSlug('');
    } catch (error) {
      console.warn('[FileViewer] failed to unpublish public file', error);
      firePublishResult({
        action: 'unpublish',
        result: 'failed',
        error_code: publishErrorCode(error),
        publish_duration_ms: Math.round(performance.now() - unpublishStarted),
      });
      if (publicFileRequestSeqRef.current === requestSeq) {
        setPublishLinkFeedback('failed');
        setPublishFailureKey(publicFilePublishFailureKey(error));
      }
    } finally {
      if (publicFileRequestSeqRef.current === requestSeq) setPublishingPublicFile(false);
    }
  }

  async function copyPublishedFileLink() {
    firePublishFlowClick('copy_publish_link');
    let ok = false;
    try {
      if (publishedFileUrl && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(publishedFileUrl);
        ok = true;
      }
    } catch {
      ok = false;
    }
    const feedback = ok ? 'copied' : 'failed';
    setPublishLinkFeedback(feedback);
    window.setTimeout(() => {
      setPublishLinkFeedback((current) => (current === feedback ? null : current));
    }, 1800);
  }
  // Same shared 转入/移出团队空间 confirmation as the project grid — see the
  // ReactComponentViewer copy above for the rationale.
  function setWorkspaceShareAccess(nextAccess: 'private' | 'workspace') {
    setShareAccessMenuOpen(false);
    if (nextAccess === shareAccess || shareAccessBusy || viewerOnly) return;
    if (moveConfirmSkipped()) {
      void commitWorkspaceShareAccess(nextAccess);
      return;
    }
    setShareAccessConfirm(nextAccess);
  }

  async function commitWorkspaceShareAccess(nextAccess: 'private' | 'workspace') {
    setShareAccessBusy(true);
    try {
      await moveWorkspaceProject({
        projectId,
        visibility: nextAccess === 'workspace' ? 'team' : 'personal',
        workspaceContext,
      });
      setShareAccess(nextAccess);
      notifyTeamProjectsChanged();
      setShareGuideToast(
        nextAccess === 'workspace'
          ? t('fileViewer.workspaceShareSuccess')
          : t('fileViewer.workspaceUnshareSuccess'),
      );
    } catch (error) {
      console.warn('[FileViewer] failed to update workspace project sharing', error);
      setShareGuideToast(
        nextAccess === 'workspace'
          ? t('fileViewer.workspaceShareFailed')
          : t('fileViewer.workspaceUnshareFailed'),
      );
    } finally {
      setShareAccessBusy(false);
    }
  }
  const [inTabPresent, setInTabPresent] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const nextPreviewContentWidthCacheKey = `${previewContentWidthCacheBaseKey}:${reloadKey}`;
  // Set to true permanently once `source` has been populated for the first
  // time. After the first load, we never show the "loading" skeleton again —
  // even if a reload temporarily clears `source` to null (issue #4650).
  const sourceEverLoadedRef = useRef(source !== null);
  // Files whose source has been shown at least once (projectId + name). A
  // revisit skips the loading skeleton entirely — the fetch still runs, but
  // the pane doesn't flash a skeleton for content the user has already seen.
  const sourceLoadedFileKey =
    `${sourceAuthorizationScopeKey ?? 'pending'}\u0000${projectId}\u0000${file.name}`;
  const sourceLoadedKeysRef = useRef<Set<string>>(
    new Set(source !== null ? [sourceLoadedFileKey] : []),
  );
  // URL-load previews that have painted at least once (keep-alive key). The
  // loading skeleton above only waits for `source` (the file TEXT fetch); in
  // URL-load mode the iframe then issues its OWN network navigation, which can
  // sit queued behind heavy same-origin traffic (e.g. drafts-grid cover
  // iframes still streaming in) — leaving a bare white pane with no feedback.
  // Until that first load event lands, keep a loader over the transport stack.
  const urlPreviewLoadedKeysRef = useRef<Set<string>>(new Set());
  const [urlPreviewFirstLoadPending, setUrlPreviewFirstLoadPending] = useState(false);
  const [boardMode, setBoardMode] = useState(false);
  const [commentPanelOpen, setCommentPanelOpen] = useState(false);
  const commentPanelToggleRef = useRef<HTMLButtonElement | null>(null);
  const commentPanelReturnFocusRef = useRef<HTMLElement | null>(null);
  const pendingCommentPanelFocusRef = useRef<HTMLElement | null>(null);
  const [commentCreateMode, setCommentCreateMode] = useState(false);
  const [boardTool, setBoardTool] = useState<BoardTool>('inspect');
  const [inspectMode, setInspectMode] = useState(false);
  const [agentToolsOpen, setAgentToolsOpen] = useState(false);
  const [drawOverlayOpen, setDrawOverlayOpen] = useState(false);
  // for hint managing hint box state
  const [openHintBox, setOpenHintBox] = useState(true);
  const [manualEditMode, setManualEditModeRaw] = useState(false);
  useEffect(() => {
    onRetainActivityChange?.(file.name, manualEditMode);
    return () => onRetainActivityChange?.(file.name, false);
  }, [file.name, manualEditMode, onRetainActivityChange]);
  const [manualEditSrcDocActive, setManualEditSrcDocActive] = useState(false);
  const [manualEditFrozenSource, setManualEditFrozenSource] = useState<string | null>(null);
  // Source snapshot frozen while a non-edit annotation pass (Mark/Draw,
  // Comment, Inspect) is open. The file-watcher live-reload (chokidar →
  // filesRefresh → preview refresh) would otherwise re-render the iframe
  // mid-annotation whenever the agent rewrites the file — wiping in-progress
  // strokes, the picked element, scroll, and focus. We hold the snapshot
  // captured at mode entry and release it on exit, so the latest content
  // flushes in exactly once when the user is done. Manual Edit keeps its own
  // freeze (manualEditFrozenSource) because it also streams live style
  // patches over postMessage. NOTE: this intentionally pauses the
  // comment-mode agent-edit live refresh added with the §5162 cache-bust —
  // the user reported that mid-comment refresh as disruptive; eventual
  // consistency is preserved by the flush on close.
  const [annotationFrozenSource, setAnnotationFrozenSource] = useState<string | null>(null);
  const [manualEditViewportWidth, setManualEditViewportWidth] = useState<number | null>(null);
  const [commentPortalHost, setCommentPortalHost] = useState<HTMLElement | null>(null);
  const [previewBodyRef, previewBodySize] = usePreviewCanvasSize<HTMLDivElement>();
  const [commentComposerHost, setCommentComposerHost] = useState<HTMLDivElement | null>(null);
  const [commentPreviewCanvasNode, setCommentPreviewCanvasNode] = useState<HTMLDivElement | null>(null);
  // Seed from the cache instead of a cold `null` — see htmlPreviewContentWidthState
  // above. A stale seed still self-corrects once a fresh measurement lands.
  const previewMeasurementInteractionActive =
    drawOverlayOpen || boardMode || inspectMode || manualEditMode;
  const frozenPreviewContentWidthCacheKeyRef = useRef({
    fileViewportKey,
    key: nextPreviewContentWidthCacheKey,
  });
  if (
    !previewMeasurementInteractionActive ||
    frozenPreviewContentWidthCacheKeyRef.current.fileViewportKey !== fileViewportKey
  ) {
    frozenPreviewContentWidthCacheKeyRef.current = {
      fileViewportKey,
      key: nextPreviewContentWidthCacheKey,
    };
  }
  const previewContentWidthCacheKey =
    frozenPreviewContentWidthCacheKeyRef.current.key;
  const initialPreviewContentWidthEntry = getPreviewContentWidthCached(previewContentWidthCacheKey);
  const [desktopPreviewContentWidthEntry, setDesktopPreviewContentWidthRaw] =
    useState<PreviewContentWidthCacheEntry | null>(
      initialPreviewContentWidthEntry,
    );
  const desktopPreviewContentWidth = desktopPreviewContentWidthEntry?.width ?? null;
  const desktopPreviewContentWidthEntryRef = useRef<PreviewContentWidthCacheEntry | null>(
    desktopPreviewContentWidthEntry,
  );
  const setDesktopPreviewContentWidth = useCallback((
    entry: Omit<PreviewContentWidthCacheEntry, 'version'> | null,
  ) => {
    const cachedEntry: PreviewContentWidthCacheEntry | null = entry == null
      ? null
      : { version: PREVIEW_CONTENT_WIDTH_CACHE_VERSION, ...entry };
    desktopPreviewContentWidthEntryRef.current = cachedEntry;
    setPreviewContentWidthCached(previewContentWidthCacheKey, entry);
    setDesktopPreviewContentWidthRaw((current) => (
      current?.width === cachedEntry?.width &&
      current?.measuredClientWidth === cachedEntry?.measuredClientWidth &&
      current?.overflow === cachedEntry?.overflow
        ? current
        : cachedEntry
    ));
  }, [previewContentWidthCacheKey]);
  // Last canvas width the desktop auto-fit effect measured against (see the
  // effect below, rec:recvq6WoJUvRXl) — lets that effect tell "canvas grew"
  // apart from "canvas shrank" without re-deriving it from React state.
  const lastAutoFitCanvasWidthRef = useRef<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const urlPreviewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const srcDocPreviewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewContentMeasurementSequenceRef = useRef(0);
  const previewContentMeasurementGenerationSequenceRef = useRef(0);
  const previewContentMeasurementHostInstanceRef = useRef<string | null>(null);
  if (previewContentMeasurementHostInstanceRef.current == null) {
    previewContentMeasurementHostInstanceRef.current =
      nextPreviewContentMeasurementHostInstance();
  }
  const previewContentMeasurementGenerationRef = useRef(
    `${previewContentMeasurementHostInstanceRef.current}:generation-0`,
  );
  const previewContentMeasurementRevisionRef = useRef(
    `${previewContentWidthCacheKey}:${reloadKey}`,
  );
  const previewContentMeasurementDocumentEpoch =
    getPreviewDocumentEpoch(previewContentWidthCacheKey);
  const previewContentMeasurementReadyRef = useRef<{
    frame: HTMLIFrameElement;
    generation: string;
  } | null>(null);
  const previewContentMeasurementExpectedDocumentEpochRef = useRef(
    previewContentMeasurementDocumentEpoch,
  );
  const previewContentMeasurementCurrentDocumentEpochRef = useRef(
    previewContentMeasurementDocumentEpoch,
  );
  previewContentMeasurementCurrentDocumentEpochRef.current =
    previewContentMeasurementDocumentEpoch;
  const latestPreviewContentMeasurementRef = useRef<{
    request: PreviewContentMeasurementRequest;
    source: Window;
  } | null>(null);
  const previewContentMeasurementContextRef = useRef({
    canvasWidth: 0,
    previewScale: 1,
    eligible: false,
  });
  const desktopPreviewContentWidthRef = useRef(desktopPreviewContentWidth);
  desktopPreviewContentWidthRef.current = desktopPreviewContentWidth;
  const previewContentMeasurementRevision = `${previewContentWidthCacheKey}:${reloadKey}`;
  if (previewContentMeasurementRevisionRef.current !== previewContentMeasurementRevision) {
    previewContentMeasurementRevisionRef.current = previewContentMeasurementRevision;
    previewContentMeasurementGenerationSequenceRef.current += 1;
    previewContentMeasurementGenerationRef.current =
      `${previewContentMeasurementHostInstanceRef.current}:generation-${previewContentMeasurementGenerationSequenceRef.current}`;
    previewContentMeasurementReadyRef.current = null;
    latestPreviewContentMeasurementRef.current = null;
  }
  const previewRuntimeStateRef = useRef<PreviewRuntimeState | null>(null);
  const previewRuntimeStateRequestSequenceRef = useRef(0);
  const manualEditActivationPendingRef = useRef(false);
  const previewFileIdentityRef = useRef(`${projectId}\u0000${file.name}`);
  previewFileIdentityRef.current = `${projectId}\u0000${file.name}`;
  const activatedSrcDocTransportHtmlRef = useRef<string | null>(null);
  // Latched by the srcDoc onLoad handler when a load completes in a hidden
  // browser tab; consumed (one-shot) by the visibilitychange recovery effect.
  // See srcDocLoadRequiresFreshParseOnReturnToVisible.
  const srcDocLoadedWhileDocumentHiddenRef = useRef(false);
  // Tracks the iframe DOM node whose dedupe ref was last reset by the
  // srcDoc onLoad handler. We reset the dedupe exactly once per freshly
  // mounted iframe (the first load is the shell HTML), and skip every
  // subsequent load on the same node (those are our own
  // document.open/write/close inside the shell). See onLoad below for
  // the infinite-loop story (issue #2361).
  const srcDocFrameDedupeResetForRef = useRef<HTMLIFrameElement | null>(null);
  const isActivePreviewIframeSource = useCallback((source: MessageEventSource | null) => {
    return workspaceActive && !!source && source === iframeRef.current?.contentWindow;
  }, [workspaceActive]);
  const isOurPreviewIframeSource = useCallback((source: MessageEventSource | null) => {
    if (!workspaceActive || !source) return false;
    return (
      source === iframeRef.current?.contentWindow ||
      source === urlPreviewIframeRef.current?.contentWindow ||
      source === srcDocPreviewIframeRef.current?.contentWindow
    );
  }, [workspaceActive]);
  const isRetainedPreviewIframeSource = useCallback((source: MessageEventSource | null) => {
    if (!source) return false;
    return (
      source === iframeRef.current?.contentWindow ||
      source === urlPreviewIframeRef.current?.contentWindow ||
      source === srcDocPreviewIframeRef.current?.contentWindow
    );
  }, []);
  const capturePreviewRuntimeState = useCallback((target: HTMLIFrameElement | null) => {
    if (!workspaceActive) return Promise.resolve<PreviewRuntimeState | null>(null);
    const source = target?.contentWindow;
    if (!source) return Promise.resolve<PreviewRuntimeState | null>(null);
    previewRuntimeStateRequestSequenceRef.current += 1;
    const id = `runtime-state-${Date.now()}-${previewRuntimeStateRequestSequenceRef.current}`;
    return new Promise<PreviewRuntimeState | null>((resolve) => {
      let settled = false;
      let retryTimer: number | null = null;
      const finish = (state: PreviewRuntimeState | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (retryTimer != null) window.clearInterval(retryTimer);
        window.removeEventListener('message', onMessage);
        resolve(state);
      };
      const onMessage = (event: MessageEvent) => {
        if (event.source !== source) return;
        const data = event.data as { type?: unknown; id?: unknown; state?: unknown } | null;
        if (
          data?.type !== 'od:preview-runtime-state-captured' ||
          data.id !== id
        ) {
          return;
        }
        finish(isPreviewRuntimeState(data.state) ? data.state : null);
      };
      const timeout = window.setTimeout(() => finish(null), 500);
      window.addEventListener('message', onMessage);
      const requestCapture = () => {
        source.postMessage({ type: 'od:preview-runtime-state-capture', id }, '*');
      };
      requestCapture();
      // The URL document can paint and accept interaction just before its
      // injected bridge installs the message listener. Retrying the same
      // request id makes that short bootstrap window lossless without
      // extending the existing 500 ms handoff budget.
      retryTimer = window.setInterval(requestCapture, 50);
    });
  }, [workspaceActive]);
  const postAndConsumePreviewRuntimeState = useCallback((target: HTMLIFrameElement | null) => {
    if (!workspaceActive) return false;
    const runtimeState = previewRuntimeStateRef.current;
    const win = target?.contentWindow;
    if (
      !runtimeState ||
      !win ||
      target !== srcDocPreviewIframeRef.current ||
      target !== iframeRef.current
    ) {
      return false;
    }
    // This snapshot only bridges the first URL -> srcDoc handoff. Consume it
    // before posting so later srcDoc reloads cannot overwrite newer source
    // attributes or runtime navigation with stale transition state.
    previewRuntimeStateRef.current = null;
    win.postMessage({ type: 'od:preview-runtime-state-restore', state: runtimeState }, '*');
    return true;
  }, [workspaceActive]);
  const setCommentComposerHostRef = useCallback((node: HTMLDivElement | null) => {
    setCommentComposerHost((current) => (current === node ? current : node));
  }, []);
  const setCommentPreviewCanvasRef = useCallback((node: HTMLDivElement | null) => {
    setCommentPreviewCanvasNode((current) => (current === node ? current : node));
  }, []);
  const requestDesktopPreviewContentMeasure = useCallback((target: HTMLIFrameElement | null = iframeRef.current) => {
    if (!workspaceActive) return;
    const source = target?.contentWindow;
    if (!target || !source || target !== iframeRef.current) return;
    if (
      previewContentMeasurementExpectedDocumentEpochRef.current !==
      previewContentMeasurementCurrentDocumentEpochRef.current
    ) {
      return;
    }
    const ready = previewContentMeasurementReadyRef.current;
    if (
      !ready ||
      ready.frame !== target ||
      ready.generation !== previewContentMeasurementGenerationRef.current
    ) {
      return;
    }
    const canvas = commentPreviewCanvasNode;
    if (!previewMeasurementFrameIsUsable({
      connected: target.isConnected,
      active: target.dataset.odActive === 'true',
      frameRect: target.getBoundingClientRect(),
      canvasRect: canvas?.getBoundingClientRect() ?? target.getBoundingClientRect(),
    })) {
      return;
    }
    const {
      canvasWidth,
      previewScale: requestedPreviewScale,
      eligible,
    } = previewContentMeasurementContextRef.current;
    if (!eligible || !Number.isFinite(canvasWidth) || canvasWidth <= 0) return;
    const measurementId =
      `${previewContentMeasurementHostInstanceRef.current}:measurement-${++previewContentMeasurementSequenceRef.current}`;
    const request: PreviewContentMeasurementRequest = {
      measurementId,
      generation: previewContentMeasurementGenerationRef.current,
      documentEpoch: previewContentMeasurementExpectedDocumentEpochRef.current,
      canvasWidth,
      previewScale: requestedPreviewScale,
    };
    latestPreviewContentMeasurementRef.current = { request, source };
    source.postMessage({
      type: 'od:preview-content-size-request',
      ...request,
    }, '*');
  }, [commentPreviewCanvasNode, workspaceActive]);
  const beginDesktopPreviewContentMeasurementGeneration = useCallback((
    target: HTMLIFrameElement | null,
  ) => {
    if (!workspaceActive) return;
    if (!target || target !== iframeRef.current || target.dataset.odActive !== 'true') return;
    previewContentMeasurementGenerationSequenceRef.current += 1;
    previewContentMeasurementGenerationRef.current =
      `${previewContentMeasurementHostInstanceRef.current}:generation-${previewContentMeasurementGenerationSequenceRef.current}`;
    latestPreviewContentMeasurementRef.current = null;
    previewContentMeasurementReadyRef.current = {
      frame: target,
      generation: previewContentMeasurementGenerationRef.current,
    };
  }, [previewContentWidthCacheKey, reloadKey, workspaceActive]);
  const scheduleDesktopPreviewContentMeasure = useCallback((target: HTMLIFrameElement | null = iframeRef.current) => {
    requestDesktopPreviewContentMeasure(target);
    window.requestAnimationFrame(() => {
      requestDesktopPreviewContentMeasure(target);
      window.setTimeout(() => requestDesktopPreviewContentMeasure(target), 80);
      window.setTimeout(() => requestDesktopPreviewContentMeasure(target), 260);
    });
  }, [requestDesktopPreviewContentMeasure]);
  useEffect(() => {
    if (!workspaceActive || !onBrandExtractionStopRequest) return;
    const requestStop = onBrandExtractionStopRequest;
    function onMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      const data = ev.data;
      if (!data || typeof data !== 'object' || (data as { type?: unknown }).type !== 'od:brand-extraction-stop-request') {
        return;
      }
      requestStop();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isOurPreviewIframeSource, onBrandExtractionStopRequest, workspaceActive]);
  const previewScrollRestoreRef = useRef<{
    hostLeft: number;
    hostTop: number;
    frameLeft: number;
    frameTop: number;
    canvasLeft: number;
    canvasTop: number;
    expiresAt: number;
  } | null>(null);
  const previewScrollPositionRef = useRef({
    frameLeft: 0,
    frameTop: 0,
    canvasLeft: 0,
    canvasTop: 0,
  });
  const previewScrollRequestAtRef = useRef(0);
  const dcViewportRef = useRef({
    x: 0,
    y: 0,
    scale: 1,
  });
  const dcViewportRestoreAtRef = useRef(0);
  const setManualEditMode = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setManualEditModeRaw((prev) => {
      const value = typeof next === 'function' ? (next as (p: boolean) => boolean)(prev) : next;
      if (value !== prev && !value) {
        setManualEditViewportWidth(null);
      }
      return value;
    });
  }, []);
  useEffect(() => {
    setManualEditSrcDocActive(false);
    setManualEditFrozenSource(null);
    previewRuntimeStateRef.current = null;
  }, [fileViewportKey, projectId, file.name]);
  useEffect(() => {
    // Restore this file's last measured content width instead of forcing
    // `null` — this effect also fires on every HtmlViewer remount (tab-away
    // and back), not only on a genuine file change, and clearing here would
    // throw away the seed above and reopen the cold-start auto-fit window
    // (rec:recvqaeMAGUdN2). A different file's key simply has no entry yet,
    // so this still defaults to null for a genuinely new file.
    const cachedEntry = getPreviewContentWidthCached(previewContentWidthCacheKey);
    setDesktopPreviewContentWidth(cachedEntry == null
      ? null
      : {
        width: cachedEntry.width,
        measuredClientWidth: cachedEntry.measuredClientWidth,
        overflow: cachedEntry.overflow,
      });
  }, [previewContentWidthCacheKey, setDesktopPreviewContentWidth]);
  useEffect(() => {
    onCommentModeChange?.(commentPanelOpen);
  }, [commentPanelOpen, onCommentModeChange]);
  useEffect(() => () => {
    onCommentModeChange?.(false);
  }, [onCommentModeChange]);
  useLayoutEffect(() => {
    if (!commentPanelOpen || !commentPortalId) {
      setCommentPortalHost(null);
      return;
    }
    let cancelled = false;
    let raf = 0;
    const findHost = () => {
      if (cancelled) return;
      const host = document.getElementById(commentPortalId);
      setCommentPortalHost(host);
      if (!host) raf = window.requestAnimationFrame(findHost);
    };
    findHost();
    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
      setCommentPortalHost(null);
    };
  }, [commentPanelOpen, commentPortalId]);
  useLayoutEffect(() => {
    if (commentPanelOpen) return;
    const target = pendingCommentPanelFocusRef.current;
    if (!target) return;
    pendingCommentPanelFocusRef.current = null;
    const fallback = commentPanelToggleRef.current ?? toolbarMoreTriggerRef.current;
    const next = target.isConnected ? target : fallback;
    next?.focus();
  }, [commentPanelOpen]);
  const capturePreviewScrollPosition = useCallback(() => {
    const host = previewBodyRef.current;
    let frameLeft = 0;
    let frameTop = 0;
    let canvasLeft = 0;
    let canvasTop = 0;
    try {
      const frameDocument = iframeRef.current?.contentWindow?.document;
      const frameScroll = frameDocument?.scrollingElement;
      const canvasScroll = frameDocument?.querySelector<HTMLElement>('.design-canvas');
      frameLeft = frameScroll?.scrollLeft ?? 0;
      frameTop = frameScroll?.scrollTop ?? 0;
      canvasLeft = canvasScroll?.scrollLeft ?? 0;
      canvasTop = canvasScroll?.scrollTop ?? 0;
    } catch {
      frameLeft = 0;
      frameTop = 0;
      canvasLeft = 0;
      canvasTop = 0;
    }
    previewScrollRestoreRef.current = {
      hostLeft: host?.scrollLeft ?? 0,
      hostTop: host?.scrollTop ?? 0,
      frameLeft: frameLeft || previewScrollPositionRef.current.frameLeft,
      frameTop: frameTop || previewScrollPositionRef.current.frameTop,
      canvasLeft: canvasLeft || previewScrollPositionRef.current.canvasLeft,
      canvasTop: canvasTop || previewScrollPositionRef.current.canvasTop,
      expiresAt: Date.now() + 5000,
    };
  }, []);
  const restorePreviewScrollPosition = useCallback(() => {
    const snapshot = previewScrollRestoreRef.current;
    if (!snapshot) return;
    if (Date.now() > snapshot.expiresAt) {
      previewScrollRestoreRef.current = null;
      return;
    }
    const apply = () => {
      const previewBody = previewBodyRef.current;
      if (typeof previewBody?.scrollTo === 'function') {
        previewBody.scrollTo(snapshot.hostLeft, snapshot.hostTop);
      }
      try {
        const frameDocument = iframeRef.current?.contentWindow?.document;
        frameDocument?.scrollingElement?.scrollTo(snapshot.frameLeft, snapshot.frameTop);
        frameDocument?.querySelector<HTMLElement>('.design-canvas')?.scrollTo(snapshot.canvasLeft, snapshot.canvasTop);
        iframeRef.current?.contentWindow?.postMessage({
          type: 'od:preview-scroll-restore',
          frameLeft: snapshot.frameLeft,
          frameTop: snapshot.frameTop,
          canvasLeft: snapshot.canvasLeft,
          canvasTop: snapshot.canvasTop,
        }, '*');
      } catch {}
    };
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        apply();
        window.setTimeout(apply, 80);
        window.setTimeout(() => {
          if (previewScrollRestoreRef.current === snapshot) {
            apply();
          }
        }, 260);
      });
    });
  }, []);
  const [manualEditTargets, setManualEditTargets] = useState<ManualEditTarget[]>([]);
  const [selectedManualEditTarget, setSelectedManualEditTarget] = useState<ManualEditTarget | null>(null);
  const [manualEditHoverTarget, setManualEditHoverTarget] = useState<ManualEditTarget | null>(null);
  const [manualEditPageStylesOpen, setManualEditPageStylesOpen] = useState(false);
  const [manualEditPanelPosition, setManualEditPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const [manualEditDraftDirty, setManualEditDraftDirty] = useState(false);
  const selectedManualEditTargetIdRef = useRef<string | null>(null);
  const manualEditSelectionDraftRef = useRef<{ id: string; draft: ManualEditDraft } | null>(null);
  // Tracks the iframe's in-flight inline text edit. `finishManualEditTextSession`
  // posts the explicit finish and resolves only after the iframe acks AND the
  // resulting commit has been applied, so exit/dismiss/cancel never tear down
  // mid-round-trip and drop the final edit (the #3647 exit-path regression).
  const manualEditTextSessionIdRef = useRef<string | null>(null);
  const manualEditTextSessionStartSequenceRef = useRef<number | null>(null);
  const manualEditTextFinishRef = useRef<((acknowledged?: boolean, sessionId?: string) => void) | null>(null);
  const manualEditTextCommitInFlightRef = useRef<Promise<unknown> | null>(null);
  const manualEditTextCommitSequenceRef = useRef(0);
  const manualEditTextFailedSessionIdsRef = useRef<Set<string>>(new Set());
  const manualEditTextLatestCommitRef = useRef<{
    promise: Promise<unknown>;
    result: boolean | null;
    sequence: number;
    sessionId: string;
  } | null>(null);
  const [manualEditDraft, setManualEditDraft] = useState<ManualEditDraft>(() => emptyManualEditDraft());
  const [manualEditHistory, setManualEditHistory] = useState<ManualEditHistoryEntry[]>([]);
  const [manualEditUndone, setManualEditUndone] = useState<ManualEditHistoryEntry[]>([]);
  const [manualEditError, setManualEditError] = useState<string | null>(null);
  const [manualEditSaving, setManualEditSaving] = useState(false);
  const manualEditSavingRef = useRef(false);
  const manualEditPendingStyleRef = useRef<ManualEditPendingStyleSave | null>(null);
  const manualEditStyleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualEditPreviewVersionRef = useRef(0);
  const sourceRef = useRef<string | null>(source);
  // Holds the last-good source snapshot taken just before reloadHtmlPreview
  // clears source to null on the srcDoc path.  The fetch effect restores this
  // value if fetchProjectFileText returns null (non-2xx / transient network
  // error), so the iframe never goes blank on a failed reload attempt.
  //
  // The snapshot is keyed by projectId + fileName so that:
  //   (a) a rapid second Reload click — which sees source===null from the
  //       first click's setSource(null) — does not overwrite the ref with null
  //       and destroy the fallback (double-click race, PR #4652 review);
  //   (b) switching to a different file while a reload fetch is in flight
  //       does not restore the previous file's HTML into the new preview
  //       (file-switch contamination race, PR #4652 review).
  const prevSourceBeforeReloadRef = useRef<{
    source: string;
    projectId: string;
    fileName: string;
  } | null>(null);
  // Holds the most recently fetched non-null source for routing-predicate
  // stability.  Content-derived predicates (needsSandboxShim, needsFocusGuard,
  // looksLikeDeck) fall back to this ref when source is null (i.e. during the
  // reload window between setSource(null) and the fetch resolving), so
  // urlLoadDecision stays stable and the srcDoc iframe does not briefly flip
  // to URL-load (Codex P2, issue #4650).  Cleared on file/project switch so
  // a new file never inherits the previous file's routing predicates.
  const lastGoodSourceForRoutingRef = useRef<string | null>(null);
  const sourceFileKeyRef = useRef<string | null>(
    source !== null ? currentSourceIdentity : null,
  );
  const renderedSourceAuthorizationScopeKeyRef = useRef(sourceAuthorizationScopeKey);
  if (renderedSourceAuthorizationScopeKeyRef.current !== sourceAuthorizationScopeKey) {
    renderedSourceAuthorizationScopeKeyRef.current = sourceAuthorizationScopeKey;
    // A real Workspace/member authority change is not a passive refresh. Fail
    // closed before this render commits so no frame can briefly expose source,
    // publication, deployment, or edit state proven under the prior scope.
    setSource(null);
    setRoutingSource(null);
    setRoutingSourceIdentity(null);
    setServerPoweredPreviewRequired(false);
    sourceRef.current = null;
    sourceFileKeyRef.current = null;
    sourceEverLoadedRef.current = false;
    lastGoodSourceForRoutingRef.current = null;
    prevSourceBeforeReloadRef.current = null;
    publicFileRequestSeqRef.current += 1;
    setPublishedFileUrl('');
    setPublishedFileSlug('');
    setPublishingPublicFile(false);
    setPublishLinkFeedback(null);
    setPublishFailureKey(null);
    setDeployment(null);
    setDeploymentsByProvider({});
    setDeployResult(null);
    setDeployError(null);
    setCopiedDeployLink(null);
    setDeployPhase('idle');
    setManualEditModeRaw(false);
    manualEditPendingStyleRef.current = null;
    manualEditTextSessionIdRef.current = null;
    manualEditTextSessionStartSequenceRef.current = null;
    manualEditTextFinishRef.current = null;
    manualEditTextCommitInFlightRef.current = null;
    manualEditTextFailedSessionIdsRef.current.clear();
    manualEditTextLatestCommitRef.current = null;
  }
  const templateNameId = useId();
  const templateDescriptionId = useId();
  const imageExportTitleId = useId();
  const pptxExportTitleId = useId();
  // Opt back into the legacy inline-asset srcDoc path via `?forceInline=1`
  // on the host page. Lets users escape-hatch around the URL-load default
  // for non-deck HTML that depends on the in-iframe localStorage shim.
  const forceInline = useMemo(
    () => (typeof window === 'undefined' ? false : parseForceInline(window.location.search)),
    [],
  );
  const [activeCommentTarget, setActiveCommentTarget] = useState<PreviewCommentSnapshot | null>(null);
  const [hoveredCommentTarget, setHoveredCommentTarget] = useState<PreviewCommentSnapshot | null>(null);
  // True while the pointer is physically over the floating hover card. The card
  // sits on top of the preview iframe, so reaching it makes the iframe fire a
  // mouseout -> od:comment-leave. We ignore that leave while pinned so the card
  // (and its selectable values) stays put instead of unmounting and flickering.
  // The pointer cannot be over the iframe and the host card at once, so a fresh
  // od:comment-hover never races this; only the card's own leave clears it.
  const hoverCardPinnedRef = useRef(false);
  // Tearing the card down is always deferred by a beat rather than done
  // synchronously. The iframe's mouseout (od:comment-leave) arrives async via
  // postMessage; the card's own mouseenter and the next od:comment-hover are the
  // signals that the pointer actually landed on the card or back on the element
  // it overlaps. Deferring lets those cancel the dismiss before it lands.
  // Synchronous teardown raced ahead of them: the card flickered on the way in
  // and vanished the moment you moved off it back onto the element it described.
  const hoverCardDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHoverCardDismiss = useCallback(() => {
    if (hoverCardDismissTimerRef.current !== null) {
      clearTimeout(hoverCardDismissTimerRef.current);
      hoverCardDismissTimerRef.current = null;
    }
  }, []);
  const scheduleHoverCardDismiss = useCallback(() => {
    if (hoverCardDismissTimerRef.current !== null) clearTimeout(hoverCardDismissTimerRef.current);
    hoverCardDismissTimerRef.current = setTimeout(() => {
      hoverCardDismissTimerRef.current = null;
      // hoverCardPinnedRef tracks "pointer is physically over the card". If it
      // got (re-)pinned while we waited, this now-stale dismiss must not fire.
      if (!hoverCardPinnedRef.current) setHoveredCommentTarget(null);
    }, HOVER_CARD_DISMISS_DELAY_MS);
  }, []);
  const [hoveredPodMemberId, setHoveredPodMemberId] = useState<string | null>(null);
  // If the card unmounts for any other reason while the pointer is still over
  // it (its onMouseLeave never fires), drop the pin so later leaves dismiss
  // normally instead of being swallowed forever.
  useEffect(() => {
    if (!hoveredCommentTarget) hoverCardPinnedRef.current = false;
  }, [hoveredCommentTarget]);
  // Don't let a pending dismiss outlive the component.
  useEffect(() => cancelHoverCardDismiss, [cancelHoverCardDismiss]);
  const [activePreviewCommentId, setActivePreviewCommentId] = useState<string | null>(null);
  const [liveCommentTargets, setLiveCommentTargets] = useState<Map<string, PreviewCommentSnapshot>>(() => new Map());
  const liveCommentTargetsRef = useRef(liveCommentTargets);
  const [commentDraft, setCommentDraft] = useState('');
  // Inspect mode shares the iframe selection bridge with comment mode but
  // routes the picked element to a side panel that mutates per-element CSS
  // overrides via postMessage. The host owns the authoritative override map:
  // it is hydrated from the artifact's persisted <style> block on load and
  // mutated only by host-driven onApply / reset actions. Save-to-source
  // serializes that host map directly — iframe od:inspect-overrides messages
  // are preview acknowledgements and never feed save input, so artifact JS
  // forging a postMessage cannot tamper with what gets persisted.
  const [activeInspectTarget, setActiveInspectTarget] = useState<InspectTarget | null>(null);
  const [inspectOverrides, setInspectOverrides] = useState<InspectOverrideMap>(() =>
    typeof source === 'string' ? parseInspectOverridesFromSource(source) : {},
  );
  // Track which `source` value the host map was last hydrated from so the
  // setState-during-render hydration below only fires when the artifact
  // text actually changes (file switch, save round-trip, live edits). The
  // ref is initialised to `source` so the matching useState initialiser
  // above counts as the first hydration.
  const inspectHydratedSourceRef = useRef<string | null | undefined>(source);
  const [savingInspect, setSavingInspect] = useState(false);
  const [inspectSavedAt, setInspectSavedAt] = useState<number | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [queuedBoardNotes, setQueuedBoardNotes] = useState<string[]>([]);
  // Images attached to an element comment ("评论此元素"). Kept as raw Files
  // (uploaded on send) with object-URL thumbnails for preview/remove, mirroring
  // the markup overlay's image tray.
  const [boardImages, setBoardImages] = useState<File[]>([]);
  const [activeCommentExistingAttachments, setActiveCommentExistingAttachments] =
    useState<PreviewCommentAttachment[]>([]);
  const [boardImagePreviews, setBoardImagePreviews] = useState<{ file: File; url: string }[]>([]);
  const [boardPreviewIndex, setBoardPreviewIndex] = useState<number | null>(null);
  const [sendingBoardBatch, setSendingBoardBatch] = useState(false);
  useEffect(() => {
    const next = boardImages.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setBoardImagePreviews(next);
    return () => {
      next.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [boardImages]);
  const [commentSavedToast, setCommentSavedToast] = useState<string | null>(null);
  const [templateSavedToast, setTemplateSavedToast] = useState<string | null>(null);
  const [deploySavedToast, setDeploySavedToast] = useState<{ message: string; details: string } | null>(null);
  const [deployActionToast, setDeployActionToast] = useState<string | null>(null);
  const [versionRestoredToast, setVersionRestoredToast] = useState<{ id: number; message: string } | null>(null);
  const versionRestoredToastIdRef = useRef(0);
  const [imageExportModalOpen, setImageExportModalOpen] = useState(false);
  const [imageExportContext, setImageExportContext] = useState<HtmlVersionExportContext | null>(null);
  const [imageExportFormat, setImageExportFormat] = useState<ImageExportFormat>('png');
  const [imageExportError, setImageExportError] = useState<string | null>(null);
  const [pptxExportModalOpen, setPptxExportModalOpen] = useState(false);
  const [pptxExportMode, setPptxExportMode] = useState<'editable' | 'screenshot'>('editable');
  const imageExportSnapshotDataUrlRef = useRef<string | null>(null);
  // Threads the share-popover click → artifact_export_result(image) pair, the
  // same correlation other export formats get via fireShareExport. The image
  // export is a separate modal flow, so it owns its own request id / start.
  const imageExportRequestIdRef = useRef<string | null>(null);
  const imageExportStartedRef = useRef(0);
  const imageExportOriginPromiseRef = useRef<Promise<ArtifactExportOriginProps> | null>(null);
  // Guards against double-emitting the image export result: each modal
  // session (reset in openImageExportModal) resolves to exactly one
  // success / failed / cancelled, no matter which exit path runs.
  const imageExportResolvedRef = useRef(false);
  // Same click→result correlation for Save as template, which now reports the
  // export result only after the template is actually saved (not on open).
  const templateExportRequestIdRef = useRef<string | null>(null);
  const templateExportStartedRef = useRef(0);
  const templateExportOriginPromiseRef = useRef<Promise<ArtifactExportOriginProps> | null>(null);
  // Same one-terminal-result guard as image export: a template session
  // (reset in openSaveAsTemplateModal) emits exactly one success/failed/
  // cancelled, whether it ends in a save or a modal dismiss.
  const templateExportResolvedRef = useRef(false);
  const screenshotInFlightRef = useRef(false);
  const imageExportInFlightRef = useRef(false);
  // "Screenshot to chat" uploads the captured PNG into the project's own file
  // tree (registry.ts: uploadProjectFiles lands it flat in the project root).
  // The daemon's chokidar watcher sees that add like any other file change and
  // pushes `file-changed`, which — via the live-reload effect below — force-
  // reloads THIS SAME preview iframe a moment later even though the artifact
  // itself never changed. Users saw that as a visible flash/jitter on every
  // screenshot (issue: "「截图」也会有抖动"). Arm this timestamp right before
  // the screenshot's annotation event goes out so the live-reload effect can
  // recognize the incoming refresh as self-inflicted and skip the reload.
  // 5s comfortably covers the upload round-trip + chokidar + SSE + the
  // effect's own 180ms debounce (measured ~1.4s locally).
  const suppressLiveReloadUntilRef = useRef(0);
  const [exportToast, setExportToast] = useState<ExportToastState | null>(null);
  const [shareLinkFeedback, setShareLinkFeedback] = useState<'copied' | 'failed' | null>(null);
  const [shareGuideToast, setShareGuideToast] = useState<string | null>(null);
  const [selectedSideCommentIds, setSelectedSideCommentIds] = useState<Set<string>>(() => new Set());
  const [commentSidePanelCollapsed, setCommentSidePanelCollapsed] = useState(false);
  const [strokePoints, setStrokePoints] = useState<StrokePoint[]>([]);
  const previewStateKey = `${projectId}:${file.name}`;
  // A configured portal is an overlay contract from the first render, even
  // before the host DOM node has been resolved. Treating that lookup window as
  // a local dock briefly shrinks the preview and shifts centered desktop or
  // mobile content left before the floating card appears.
  const localCommentSideDockActive = commentPanelOpen && !commentPortalId;
  const boardPreviewCanvasSize = commentPreviewCanvasSize(previewBodySize, {
    boardMode: localCommentSideDockActive,
    sidePanelCollapsed: commentSidePanelCollapsed,
    viewport: previewViewport,
  });
  const boardSideDockStacked = usesStackedCommentSideDock(previewBodySize, {
    boardMode: localCommentSideDockActive,
    sidePanelCollapsed: commentSidePanelCollapsed,
    viewport: previewViewport,
  });
  useEffect(() => {
    if (
      previewViewport !== 'desktop' ||
      zoomMode !== 'auto' ||
      previewMeasurementInteractionActive
    ) {
      return;
    }
    const nextWidth = boardPreviewCanvasSize?.width;
    const previousWidth = lastAutoFitCanvasWidthRef.current;
    if (typeof nextWidth === 'number' && Number.isFinite(nextWidth)) {
      // Growing the canvas (e.g. collapsing the chat rail, per rec:recvq6WoJUvRXl)
      // can otherwise get stuck at the OLD, narrower-canvas zoom forever: the
      // in-iframe measurement bridge (srcdoc.ts injectPreviewContentSizeBridge)
      // reads document.documentElement/body scrollWidth/clientWidth, all of
      // which are bounded below by the iframe's OWN current rendered viewport
      // width (html/body fill at least 100% of the viewport by default). That
      // viewport width is itself `canvasWidth / previewScale` from the
      // PREVIOUS auto-fit pass, so once the previous scale already implies a
      // viewport wide enough to contain the real content, the measurement
      // just reports that residual viewport size right back — self-confirming
      // the stale scale even after the canvas grows and could fit a larger,
      // more useful zoom. Dropping the cached content width forces a fresh
      // measurement this pass at zoom=100% (viewport := canvasWidth exactly),
      // which cannot be contaminated by a previous scale. Only doing this on
      // GROW avoids an extra flash-to-100% on every manual drag-resize tick
      // when the canvas shrinks — that direction already self-corrects,
      // because the previous scale's implied viewport dips below the
      // content's real width and the measurement naturally reports the
      // content's true, uncontaminated extent.
      if (previousWidth !== null && nextWidth > previousWidth) {
        setDesktopPreviewContentWidth(null);
      }
      lastAutoFitCanvasWidthRef.current = nextWidth;
    }
    scheduleDesktopPreviewContentMeasure();
  }, [
    boardPreviewCanvasSize?.width,
    boardPreviewCanvasSize?.height,
    previewMeasurementInteractionActive,
    previewViewport,
    scheduleDesktopPreviewContentMeasure,
    zoomMode,
  ]);

  function deploymentMapForCurrentFile(items: WebDeploymentInfo[]) {
    const next: Partial<Record<WebDeployProviderId, WebDeploymentInfo>> = {};
    for (const option of DEPLOY_PROVIDER_OPTIONS) {
      const deploymentForProvider = items
        .filter((item) => item.fileName === file.name && item.providerId === option.id && item.url?.trim())
        .sort(compareDeploymentsByNewest)[0];
      if (deploymentForProvider) next[option.id] = deploymentForProvider;
    }
    return next;
  }

  function syncDeployFormFromConfig(
    providerId: WebDeployProviderId,
    config: WebDeployConfigResponse | null,
  ) {
    const matchingConfig = config?.providerId === providerId ? config : null;
    setDeployProviderId(providerId);
    setDeployConfig(matchingConfig);
    setDeployToken(matchingConfig?.tokenMask || '');
    setTeamId(matchingConfig?.teamId || '');
    setTeamSlug(matchingConfig?.teamSlug || '');
    setCloudflareAccountId(matchingConfig?.accountId || '');
    setCloudflareZoneId(matchingConfig?.cloudflarePages?.lastZoneId || '');
    setCloudflareDomainPrefix(matchingConfig?.cloudflarePages?.lastDomainPrefix || '');
    // The daemon's GET /api/deploy/config response currently hardcodes `target: 'preview'`
    // as a placeholder (apps/daemon/src/deploy.ts publicDeployConfig /
    // publicCloudflarePagesConfig) rather than persisting a real user preference, so it must
    // not be used to seed the deploy-target selector's default. Default to 'production' to
    // match the daemon's documented default for an omitted target on POST deploy, and to match
    // pre-regression behavior.
    setDeployTarget('production');
  }

  function cloudflareConfigHintsFromForm() {
    const zone = cloudflareZones.find((item) => item.id === cloudflareZoneId);
    const hints = {
      ...(cloudflareZoneId.trim() ? { lastZoneId: cloudflareZoneId.trim() } : {}),
      ...((zone?.name || deployConfig?.cloudflarePages?.lastZoneName)
        ? { lastZoneName: zone?.name || deployConfig?.cloudflarePages?.lastZoneName }
        : {}),
      ...(cloudflareDomainPrefix.trim()
        ? { lastDomainPrefix: normalizeCloudflareDomainPrefixInput(cloudflareDomainPrefix) }
        : {}),
    };
    return Object.keys(hints).length > 0 ? hints : undefined;
  }

  function buildDeployConfigRequest(providerId: WebDeployProviderId): WebUpdateDeployConfigRequest {
    const token = deployToken.trim();
    if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID) {
      return {
        providerId,
        token,
        accountId: cloudflareAccountId.trim(),
        cloudflarePages: cloudflareConfigHintsFromForm(),
      };
    }
    return {
      providerId,
      token,
      teamId: teamId.trim(),
      teamSlug: teamSlug.trim(),
    };
  }

  async function loadDeployProvider(
    providerId: WebDeployProviderId,
    options?: { fallbackToExisting?: boolean },
  ) {
    const requestSeq = ++deployProviderLoadSeqRef.current;
    setDeployProviderId(providerId);
    const deployments = await fetchProjectDeployments(projectId, workspaceContext);
    const nextDeploymentsByProvider = deploymentMapForCurrentFile(deployments);
    const exactDeployment = nextDeploymentsByProvider[providerId] ?? null;
    const fallbackDeployment = options?.fallbackToExisting
      ? Object.values(nextDeploymentsByProvider)[0] ?? null
      : null;
    const currentDeployment = exactDeployment ?? fallbackDeployment;
    // Use the explicit providerId for config/form so a fallback deployment from
    // another provider only fills the existing-URL display, never the form/credentials.
    const config = await fetchDeployConfig(providerId);
    if (requestSeq !== deployProviderLoadSeqRef.current) {
      return { config: null, currentDeployment: null };
    }
    syncDeployFormFromConfig(providerId, config);
    setDeploymentsByProvider(nextDeploymentsByProvider);
    setDeployment(currentDeployment ?? null);
    setDeployResult(currentDeployment ?? null);
    if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID && config?.configured) {
      void loadCloudflareZones(config, { requestSeq });
    }
    return { config, currentDeployment };
  }

  async function loadCloudflareZones(
    config: WebDeployConfigResponse | null = deployConfig,
    options?: { requestSeq?: number },
  ) {
    if (!config?.configured || config.providerId !== CLOUDFLARE_PAGES_PROVIDER_ID) return;
    const requestSeq = options?.requestSeq ?? deployProviderLoadSeqRef.current;
    setCloudflareZonesLoading(true);
    setCloudflareZonesError(null);
    try {
      const response = await fetchCloudflarePagesZones();
      if (requestSeq !== deployProviderLoadSeqRef.current) return;
      const zones = response?.zones ?? [];
      setCloudflareZones(zones);
      const hintedZoneId = response?.cloudflarePages?.lastZoneId || config.cloudflarePages?.lastZoneId || '';
      const nextZoneId = hintedZoneId && zones.some((zone) => zone.id === hintedZoneId)
        ? hintedZoneId
        : zones[0]?.id || '';
      setCloudflareZoneId(nextZoneId);
      const hintedPrefix = response?.cloudflarePages?.lastDomainPrefix || config.cloudflarePages?.lastDomainPrefix || '';
      if (hintedPrefix) setCloudflareDomainPrefix(hintedPrefix);
    } catch (err) {
      if (requestSeq !== deployProviderLoadSeqRef.current) return;
      setCloudflareZones([]);
      setCloudflareZonesError(err instanceof Error ? err.message : t('fileViewer.cloudflareZonesLoadFailed'));
    } finally {
      if (requestSeq === deployProviderLoadSeqRef.current) setCloudflareZonesLoading(false);
    }
  }

  // Slide deck nav state: the iframe posts the active index + total count
  // back to the host every time a slide settles. Host renders prev/next
  // controls in the toolbar and reflects the count beside them.
  const [slideState, setSlideState] = useState<SlideState | null>(
    () => htmlPreviewSlideState.get(previewStateKey) ?? null,
  );
  const presenterWindowRef = useRef<Window | null>(null);
  const presentOverlayRef = useRef<HTMLDivElement | null>(null);
  const presentFullscreenRequestedRef = useRef(false);
  const [presentFullscreenPending, setPresentFullscreenPending] = useState(false);
  // Brief "Press Esc to exit" hint shown in the main window whenever a
  // presentation (fullscreen stage + presenter popup) starts.
  const [presentEscHint, setPresentEscHint] = useState(false);
  const [deckThumbnailsCollapsed, setDeckThumbnailsCollapsed] = useState(false);
  const [speakerNotesEditMode, setSpeakerNotesEditMode] = useState(false);
  const [speakerNotesDraft, setSpeakerNotesDraft] = useState('');
  const [speakerNotesSaving, setSpeakerNotesSaving] = useState(false);
  const [speakerNotesStatus, setSpeakerNotesStatus] = useState<'saved' | 'error' | null>(null);
  const speakerNotesTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const boardPreviewScaleOptions = localCommentSideDockActive ? { canvasPadding: 0 } : undefined;
  const shareRef = useRef<HTMLDivElement | null>(null);
  const [chromeActionsHost, setChromeActionsHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!workspaceActive || typeof document === 'undefined') {
      setChromeActionsHost(null);
      return;
    }
    setChromeActionsHost(resolveChromeActionsHost());
  }, [workspaceActive]);

  useEffect(() => {
    if (workspaceActive) return;
    setZoomMenuOpen(false);
    setPresentMenuOpen(false);
    setDeployMenuOpen(false);
    setShareAccessMenuOpen(false);
    setShareAccessConfirm(null);
    setToolbarMoreOpen(false);
    setVersionModalOpen(false);
    setExportReadyNudge(false);
    setTemplateModalOpen(false);
    setDeployModalOpen(false);
    setInTabPresent(false);
    setPresentFullscreenPending(false);
    setPresentEscHint(false);
    presentFullscreenRequestedRef.current = false;
    setBoardMode(false);
    setCommentPanelOpen(false);
    setCommentCreateMode(false);
    setInspectMode(false);
    setAgentToolsOpen(false);
    setDrawOverlayOpen(false);
    // Manual Edit is the one transient surface we intentionally preserve.
    // The retained iframe still owns any live inline-text session and pending
    // style draft; tearing it down here silently discards work. The inactive
    // wrapper is inert and every host bridge is gated by workspaceActive, so
    // the session remains paused until the user returns to this tab.
    setActiveCommentTarget(null);
    setHoveredCommentTarget(null);
    setActiveInspectTarget(null);
    setBoardPreviewIndex(null);
    setImageExportModalOpen(false);
    setPptxExportModalOpen(false);
    setExportToast(null);
    setCommentSavedToast(null);
    setTemplateSavedToast(null);
    setDeploySavedToast(null);
    setDeployActionToast(null);
    setVersionRestoredToast(null);
    setShareGuideToast(null);
    const popup = presenterWindowRef.current;
    if (popup && !popup.closed) {
      try { popup.close(); } catch { /* already gone */ }
    }
    presenterWindowRef.current = null;
  }, [workspaceActive]);

  useEffect(() => {
    liveCommentTargetsRef.current = liveCommentTargets;
  }, [liveCommentTargets]);

  const shouldDeferPassivePreviewSource =
    liveHtml === undefined &&
    file.size > HTML_PASSIVE_PREVIEW_FULL_TEXT_LIMIT &&
    mode === 'preview' &&
    !manualEditMode &&
    !manualEditSrcDocActive &&
    !boardMode &&
    !inspectMode &&
    !drawOverlayOpen &&
    !isDeck;

  useEffect(() => {
    if (!workspaceActive) return;
    // Never turn a pending or denied bound-project authority into a legal
    // local/headerless read. The authorization key changes when an exact
    // Workspace witness resolves, which reruns this effect with scoped URL and
    // headers. Only an explicit daemon `unbound` result receives the local key.
    if (projectResourceReadBlocked) return;
    const sourceFileKey = currentSourceIdentity;
    if (liveHtml !== undefined) {
      sourceFileKeyRef.current = sourceFileKey;
      sourceEverLoadedRef.current = true;
      sourceLoadedKeysRef.current.add(sourceLoadedFileKey);
      setSource(liveHtml);
      setRoutingSource(liveHtml);
      setRoutingSourceIdentity(sourceFileKey);
      setServerPoweredPreviewRequired(false);
      sourceRef.current = liveHtml;
      return;
    }
    const fileChanged = sourceFileKeyRef.current !== sourceFileKey;
    sourceFileKeyRef.current = sourceFileKey;
    const cachedSnapshot = sourceAuthorizationScopeKey
      ? getHtmlSourceSnapshot(
          sourceAuthorizationScopeKey,
          projectId,
          file.name,
          sourceSnapshotRefreshKey,
        )
      : null;
    if (fileChanged) {
      const cachedSource = cachedSnapshot?.source ?? null;
      setSource(cachedSource);
      setRoutingSource(cachedSource);
      setRoutingSourceIdentity(cachedSource === null ? null : sourceFileKey);
      setServerPoweredPreviewRequired(false);
      sourceRef.current = cachedSource;
      if (cachedSource !== null) {
        sourceEverLoadedRef.current = true;
        sourceLoadedKeysRef.current.add(sourceLoadedFileKey);
        lastGoodSourceForRoutingRef.current = cachedSource;
      }
      // Note: prevSourceBeforeReloadRef is cleared by the [projectId,
      // file.name] reset effect that runs on file/project switch.  The
      // identity check in the null-restore branch below is defense-in-depth
      // for races where an in-flight async callback fires after the file
      // switches but before the effect has run.
    }
    let cancelled = false;
    // A snapshot with the exact authorization and content-version identity is
    // authoritative until the file event path invalidates it or the file
    // metadata / Workspace identity changes. Re-reading the same bytes on
    // every ordinary viewer remount made Design Files ↔ preview round-trips
    // perform one uncached raw request apiece.
    if (cachedSnapshot !== null) {
      return () => {
        cancelled = true;
      };
    }
    if (
      shouldDeferPassivePreviewSource &&
      sourceRef.current !== null &&
      !previewTextNeedsFullSourceForSafeInline(sourceRef.current)
    ) {
      setRoutingSource(sourceRef.current);
      setRoutingSourceIdentity(sourceFileKey);
      sourceEverLoadedRef.current = true;
      sourceLoadedKeysRef.current.add(sourceLoadedFileKey);
      return () => {
        cancelled = true;
      };
    }
    // Cache-bust the fetch on every mtime / reload / files-refresh bump.
    // Without this, an agent edit during Comment mode (srcDoc path) gets
    // stale HTML from the browser HTTP cache — the source state ends up
    // identical to the previous value, srcDoc is byte-equal to the last
    // activated HTML, canActivateSrcDocTransport bails on the dedupe
    // check, and the preview only refreshes when Comment closes and the
    // url-load iframe takes over with its own ?v=mtime cache-bust.
    const cacheBustKey = `${file.mtime}-${reloadKey}-${filesRefreshKey}`;
    const loadText = shouldDeferPassivePreviewSource
      ? fetchProjectFileTextPreview(projectId, file.name, {
          limit: HTML_ROUTING_TEXT_PREVIEW_LIMIT,
          cacheBustKey,
          workspaceContext,
        }).then(async (preview) => {
          const previewText = preview?.text ?? null;
          if (previewTextNeedsFullSourceForSafeInline(previewText)) {
            const fullText = await fetchProjectFileText(projectId, file.name, {
              cache: 'no-store',
              cacheBustKey,
              workspaceContext,
            });
            if (fullText !== null) {
              return {
                text: fullText,
                poweredPreviewRequired: preview?.poweredPreview.required === true,
                sourceLoadMode: 'full' as HtmlSourceLoadMode,
              };
            }
          }
          return {
            text: previewText,
            poweredPreviewRequired: preview?.poweredPreview.required === true,
            sourceLoadMode: 'routing-preview' as HtmlSourceLoadMode,
          };
        })
      : fetchProjectFileText(projectId, file.name, {
          cache: 'no-store',
          cacheBustKey,
          workspaceContext,
        }).then((text) => ({
        text,
        poweredPreviewRequired: false,
        sourceLoadMode: 'full' as HtmlSourceLoadMode,
      }));
    void loadText.then(({ text, poweredPreviewRequired, sourceLoadMode }) => {
      if (cancelled) return;
      setServerPoweredPreviewRequired(poweredPreviewRequired);
      // Chokidar emits agent rewrites as unlink+add+change bursts; a
      // transient null mid-burst would blank source → srcDoc empty →
      // shell stays on prior frame. Keep the last good text instead.
      if (text == null) {
        if (shouldDeferPassivePreviewSource) {
          sourceEverLoadedRef.current = true;
      sourceLoadedKeysRef.current.add(sourceLoadedFileKey);
          setRoutingSource('');
          setRoutingSourceIdentity(sourceFileKey);
          setServerPoweredPreviewRequired(false);
          return;
        }
        // A srcDoc Reload may have cleared source to null just before this
        // fetch resolved.  If the fetch failed (non-2xx, network error),
        // restore the pre-reload source so the iframe doesn't go blank.
        // prevSourceBeforeReloadRef is null on a normal file-change fetch,
        // so this branch is a no-op outside of the Reload failure case.
        //
        // Guard: only restore if the snapshot was taken for the current
        // file.  A file-switch clears the ref (see fileChanged block above),
        // but we double-check the identity here to prevent cross-file
        // contamination in case the ref was not yet cleared by the time this
        // async callback fires (file-switch race, PR #4652 review).
        const snap = prevSourceBeforeReloadRef.current;
        if (
          snap != null &&
          snap.projectId === projectId &&
          snap.fileName === file.name
        ) {
          setSource(snap.source);
          setRoutingSource(snap.source);
          setRoutingSourceIdentity(sourceFileKey);
          sourceRef.current = snap.source;
          prevSourceBeforeReloadRef.current = null;
        } else if (snap != null) {
          // Identity mismatch: the snapshot belongs to a different file or
          // project. Clear it now so it cannot leak forward and be consumed by
          // a later normal failed load on the original file (PR #4652
          // third-pass review, Codex P2 finding).
          prevSourceBeforeReloadRef.current = null;
        }
        return;
      }
      prevSourceBeforeReloadRef.current = null;
      sourceEverLoadedRef.current = true;
      sourceLoadedKeysRef.current.add(sourceLoadedFileKey);
      lastGoodSourceForRoutingRef.current = text;
      setRoutingSource(text);
      setRoutingSourceIdentity(sourceFileKey);
      if (sourceLoadMode === 'routing-preview') {
        sourceRef.current = null;
      } else {
        if (sourceAuthorizationScopeKey) {
          setHtmlSourceSnapshot({
            authorizationScopeKey: sourceAuthorizationScopeKey,
            projectId,
            fileName: file.name,
            refreshKey: sourceSnapshotRefreshKey,
            source: text,
          });
        }
        setSource(text);
        sourceRef.current = text;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    file.name,
    file.mtime,
    liveHtml,
    reloadKey,
    filesRefreshKey,
    sourceSnapshotRefreshKey,
    sourceAuthorizationScopeKey,
    currentSourceIdentity,
    shouldDeferPassivePreviewSource,
    workspaceActive,
    projectResourceReadBlocked,
  ]);

  useEffect(() => {
    if (!workspaceActive) return;
    const requestSeq = ++deploymentsLoadSeqRef.current;
    let cancelled = false;
    setDeployResult(null);
    setDeployError(null);
    setCopiedDeployLink(null);
    setDeployPhase('idle');
    void fetchProjectDeployments(projectId, workspaceContext).then((items) => {
      if (cancelled || deploymentsLoadSeqRef.current !== requestSeq) return;
      const nextDeploymentsByProvider = deploymentMapForCurrentFile(items);
      const current = nextDeploymentsByProvider[deployProviderId] ?? null;
      setDeploymentsByProvider(nextDeploymentsByProvider);
      setDeployment(current ?? null);
      setDeployResult(current ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, deployProviderId, workspaceActive, workspaceContext]);

  // A retained HtmlViewer stays mounted while the user visits Design Files and
  // comes back, so its initial deployment snapshot can legitimately be older
  // than the Share/Export popover. Refresh on demand when that popover opens;
  // the shared sequence fence prevents an older identity-load response from
  // overwriting this newer snapshot.
  useEffect(() => {
    if (!deployMenuOpen) return;
    const requestSeq = ++deploymentsLoadSeqRef.current;
    let cancelled = false;
    void fetchProjectDeployments(projectId, workspaceContext).then((items) => {
      if (cancelled || deploymentsLoadSeqRef.current !== requestSeq) return;
      const nextDeploymentsByProvider = deploymentMapForCurrentFile(items);
      const current = nextDeploymentsByProvider[deployProviderId] ?? null;
      setDeploymentsByProvider(nextDeploymentsByProvider);
      setDeployment(current ?? null);
      setDeployResult(current ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [deployMenuOpen, projectId, file.name, deployProviderId, workspaceContext]);

  const routingHtmlSource = source ?? routingSource ?? lastGoodSourceForRoutingRef.current;
  const passiveLargeHtmlPreview = shouldDeferPassivePreviewSource && source === null;
  // Detect deck-shaped HTML even when the project's skill didn't declare
  // `mode: deck`. Freeform projects often produce a deck because the user
  // asked for one in plain prose; without this, prev/next and Present
  // never surface and the deck becomes a static, unnavigable preview.
  const looksLikeDeck = useMemo(() => {
    const s = routingHtmlSource;
    return sourceLooksLikeDeckPreview(s);
  }, [routingHtmlSource]);
  const effectiveDeck = isDeck || (!passiveLargeHtmlPreview && looksLikeDeck);
  const previewZoomPercent = resolveDesktopPreviewZoomPercent({
    zoomMode,
    viewport: previewViewport,
    isDeck: effectiveDeck,
    manualZoomPercent: zoom,
    canvasSize: boardPreviewCanvasSize,
    contentWidth: desktopPreviewContentWidthEntry?.overflow
      ? desktopPreviewContentWidth
      : null,
  });
  const previewScale = previewZoomPercent / 100;
  previewContentMeasurementContextRef.current = {
    canvasWidth: boardPreviewCanvasSize?.width ?? 0,
    previewScale,
    eligible: mode === 'preview' &&
      previewViewport === 'desktop' &&
      zoomMode === 'auto' &&
      !effectiveDeck &&
      !manualEditMode &&
      !boardMode &&
      !drawOverlayOpen &&
      !inspectMode &&
      annotationFrozenSource == null,
  };
  if (!previewContentMeasurementContextRef.current.eligible) {
    latestPreviewContentMeasurementRef.current = null;
  }
  useEffect(() => {
    if (previewViewport !== 'desktop' || zoomMode !== 'auto') return;
    scheduleDesktopPreviewContentMeasure();
  }, [
    previewScale,
    previewViewport,
    scheduleDesktopPreviewContentMeasure,
    zoomMode,
  ]);
  const previewZoomText = zoomPercentLabel(previewZoomPercent);
  const zoomLevelActive = (level: number) => Math.abs(previewZoomPercent - level) < 0.001;
  const overlayPreviewScale = effectivePreviewScale(
    previewViewport,
    previewScale,
    boardPreviewCanvasSize,
    boardPreviewScaleOptions,
  );
  const overlayPreviewTransform: PreviewOverlayTransform = {
    scale: overlayPreviewScale,
    offsetX: 0,
    offsetY: 0,
  };
  const showDeckNavigation = effectiveDeck && (slideState === null || slideState.count > 0);
  const activeDeckSlideIndex =
    slideState?.active ??
    htmlPreviewSlideState.get(previewStateKey)?.active ??
    0;
  const deckSlideCount =
    slideState?.count ??
    htmlPreviewSlideState.get(previewStateKey)?.count ??
    0;
  const speakerNotes = useMemo(
    () => extractSpeakerNotesFromHtml(source, deckSlideCount),
    [source, deckSlideCount],
  );
  const showSpeakerNotesPanel = source !== null && effectiveDeck && mode === 'preview';
  const activeSpeakerNote = speakerNotes[activeDeckSlideIndex] ?? '';
  const deckSlideTotal = Math.max(deckSlideCount, speakerNotes.length, showDeckNavigation ? 1 : 0);
  // Fire the deck_viewer surface_view once per opened artifact, the first time
  // its HTML is recognized as a slide deck and the slide chrome mounts. This is
  // the entry/denominator for the deck experience funnel. Keyed by
  // project+file so navigating between decks re-arms it.
  const deckSurfaceSeenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!effectiveDeck || source === null) return;
    const key = `${projectId}::${file.name}`;
    if (deckSurfaceSeenRef.current === key) return;
    deckSurfaceSeenRef.current = key;
    trackDeckViewerSurfaceView(analytics.track, {
      page_name: 'artifact',
      area: 'deck_viewer',
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
      slide_count: deckSlideTotal,
    });
    // deckSlideTotal intentionally omitted from deps: we snapshot it at first
    // recognition and don't want later count updates to refire the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveDeck, source, projectId, file.name, file.kind]);
  useEffect(() => {
    setSpeakerNotesDraft(activeSpeakerNote);
    setSpeakerNotesEditMode(false);
    setSpeakerNotesStatus(null);
  }, [activeSpeakerNote, activeDeckSlideIndex, projectId, file.name]);
  // The "saved" confirmation is transient feedback, not persistent state —
  // let it fade so the panel returns to its resting look.
  useEffect(() => {
    if (speakerNotesStatus !== 'saved') return;
    const id = window.setTimeout(() => setSpeakerNotesStatus(null), 4200);
    return () => window.clearTimeout(id);
  }, [speakerNotesStatus]);
  useEffect(() => {
    if (!speakerNotesEditMode) return;
    const id = window.requestAnimationFrame(() => {
      const textarea = speakerNotesTextareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      try {
        textarea.setSelectionRange(end, end);
      } catch {
        // Some browser/input combinations can reject selection changes; focus
        // is still the important fallback.
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [speakerNotesEditMode, activeDeckSlideIndex]);
  // Extra deck signal for export planning. Runtime-managed decks (`<deck-stage>` /
  // `data-screen-label`) need deck capture even when they have no plain
  // `class="slide"` marker. Plain `.slide` is intentionally excluded here:
  // ordinary pages use it for carousels/testimonials and must export as full
  // pages.
  const structuredDeckExportSignal = sourceLooksLikeExportableDeck(source);
  const deckVisualSource = useMemo(() => {
    if (!effectiveDeck || source == null) return source;
    return normalizeDeckVisualSource(removeSpeakerNotesFromHtml(source));
  }, [effectiveDeck, source]);
  const relativeProjectAssetRefs = useMemo(
    () => source != null && htmlHasRelativeProjectAssetRefs(source, file.name, null),
    [source, file.name],
  );
  // Browser-owned iframe subresource requests cannot attach Workspace headers,
  // and URL resolution does not inherit the query string from the document's
  // scoped raw URL. Hold the Team preview until every confirmed relative asset
  // has been rewritten to its own scoped raw URL; otherwise the first srcDoc
  // paint can leak an unscoped font/image request before the async rewrite
  // finishes.
  const scopedRelativeAssetRefs = workspaceContext != null && relativeProjectAssetRefs;
  const livePreviewSource = scopedRelativeAssetRefs && inlinedSource === null
    ? null
    : (inlinedSource ?? deckVisualSource);
  const assetInliningSource = effectiveDeck ? deckVisualSource : source;
  // Annotation modes that should hold the preview still while open. Manual
  // Edit is handled by its own freeze just below; these are the non-edit
  // passes (Mark/Draw, Comment, Inspect) that also must not be yanked out
  // from under the user by a background file change.
  const annotationFreezeActive = drawOverlayOpen || boardMode || inspectMode;
  // Freeze the iframe input on the snapshot taken at Edit-mode entry. Any
  // source rewrite during edit (1.5s debounced set-style patches) stays
  // invisible to the iframe — live updates flow through od-edit-preview-style
  // postMessage instead, so the canvas never has to reload.
  useEffect(() => {
    if (manualEditMode && manualEditFrozenSource === null && livePreviewSource != null) {
      setManualEditFrozenSource(livePreviewSource);
    }
  }, [manualEditMode, manualEditFrozenSource, livePreviewSource]);
  // Capture / release the annotation snapshot at mode entry / exit, and keep
  // it following SETTLED content versions while the mode stays open.
  //
  // Two different "background changes" hit this freeze and they need opposite
  // handling:
  //   - Streaming repaints (`liveHtml` defined — an agent run rewriting the
  //     artifact chunk by chunk) must stay invisible until mode exit; that
  //     anti-thrash hold is the snapshot's original purpose.
  //   - A settled on-disk version (raw lane, `liveHtml === undefined`) — e.g.
  //     the daemon auto-pull landing an owner's published update into a
  //     team-shared mirror — must atomically REPLACE the snapshot. Comment
  //     mode is a read-only member's resting interaction state, so "deferred
  //     until mode exit" degrades to "never": the slide rail (unfrozen
  //     `deckVisualSource`) repaints with the new version while the canvas
  //     pins the stale bytes indefinitely. The srcDoc transport already knows
  //     how to remount cleanly when srcDoc changes under Comment mode (see
  //     the boardMode branch in canActivateSrcDocTransport), so one snapshot
  //     swap per settled version is a clean atomic repaint — old content
  //     stays up until the new bytes have fully arrived.
  //
  // Cleared on exit so `previewSource` falls back to the latest live source
  // and any still-deferred streaming update lands in one clean render.
  useEffect(() => {
    if (annotationFreezeActive) {
      if (annotationFrozenSource === null && livePreviewSource != null) {
        setAnnotationFrozenSource(livePreviewSource);
      } else if (
        annotationFrozenSource !== null &&
        liveHtml === undefined &&
        livePreviewSource != null &&
        livePreviewSource !== annotationFrozenSource
      ) {
        setAnnotationFrozenSource(livePreviewSource);
      }
    } else if (annotationFrozenSource !== null) {
      setAnnotationFrozenSource(null);
    }
  }, [annotationFreezeActive, annotationFrozenSource, livePreviewSource, liveHtml]);
  const previewSource = (manualEditMode && manualEditFrozenSource !== null)
    ? manualEditFrozenSource
    : (annotationFreezeActive && annotationFrozenSource !== null)
      ? annotationFrozenSource
      : livePreviewSource;
  const manualEditPageStylesEnabled = typeof source === 'string' && isManualEditFullHtmlDocument(source);
  const urlModeBridge = hasUrlModeBridge(routingHtmlSource);
  const manualEditRequiresSrcDoc = manualEditMode || manualEditSrcDocActive;
  // When we URL-load the iframe directly, skip every in-host inlining /
  // srcDoc-rebuilding step. The browser does the asset resolution itself,
  // which is the whole point of the URL-load path.
  // Auto-fall back to the srcDoc path when the artifact will crash under
  // the URL-load iframe's bare `sandbox="allow-scripts"` — Babel-standalone
  // React prototypes and any HTML that reads Web Storage at mount throw
  // SecurityError without `allow-same-origin`. The srcDoc path runs
  // `injectSandboxShim` before any user script, so those artifacts render.
  // Memoized on `source` so HtmlViewer's frequent re-renders (board/inspect/
  // edit mode toggles, slide nav) don't re-scan the HTML each time.
  const needsSandboxShim = useMemo(() => {
    if (passiveLargeHtmlPreview) return false;
    const s = routingHtmlSource;
    return s != null && htmlNeedsSandboxShim(s);
  }, [passiveLargeHtmlPreview, routingHtmlSource]);
  const needsFocusGuard = useMemo(() => {
    if (passiveLargeHtmlPreview) return false;
    const s = routingHtmlSource;
    return s != null && htmlNeedsFocusGuard(s);
  }, [passiveLargeHtmlPreview, routingHtmlSource]);
  // A self-redirecting artifact must render through srcDoc so buildSrcdoc's
  // redirect-loop guard is present; on the raw URL-load path the iframe reloads
  // itself forever and freezes the workspace (nexu-io/open-design#710).
  const needsRedirectGuard = useMemo(() => {
    if (passiveLargeHtmlPreview) return false;
    const s = routingHtmlSource;
    return s != null && htmlNeedsRedirectGuard(s);
  }, [passiveLargeHtmlPreview, routingHtmlSource]);
  // Set by the injected guard's `od:redirect-loop-blocked` postMessage. The
  // browser makes `window.location` unforgeable, so a runaway reload can only be
  // stopped host-side — parking the srcDoc iframe on static content below. File-
  // scoped: reset whenever the file, project, or reload key changes.
  const [redirectLoopBlocked, setRedirectLoopBlocked] = useState(false);
  // Project file paths, for confirming root-relative asset refs
  // (`/reference-assets/main.css`) against real files instead of guessing
  // from path shape. `null` while the list is in flight — the detection memo
  // below then runs in conservative candidate mode so a clone artifact never
  // flashes through the (unstyled) URL-load path before the list lands.
  const [projectFilePathSet, setProjectFilePathSet] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    // Do not include workspaceActive itself in this effect's dependencies:
    // every retained viewer is first mounted while active. A same-token
    // inactive -> active transition must reuse the loaded path snapshot,
    // while a file-watch token accumulated during inactivity changes
    // filesRefreshKey and therefore still runs this effect on activation.
    if (!workspaceActiveRef.current) return;
    // This viewer's pending file-list read must die with the viewer. Without
    // an AbortSignal, `fetchProjectFiles` PINS the shared single-flight entry
    // (`sharedCancellableGet`): a read that stalls (a request queued behind
    // saturated connections neither resolves nor rejects — every failure path
    // resolves `[]`) then survives unmount forever, and every later viewer
    // mount for the same project + workspace identity silently rejoins the
    // same dead promise. For a workspace-scoped deck that hold keeps
    // `previewSource` at null, i.e. a bare white stage on every return to the
    // project. Aborting on cleanup lets a fresh mount issue a fresh read.
    const controller = new AbortController();
    setProjectFilePathSet(null);
    void fetchProjectFiles(projectId, { workspaceContext, signal: controller.signal })
      .then((files) => {
        if (!controller.signal.aborted) {
          setProjectFilePathSet(new Set(files.map((entry) => entry.name)));
        }
      })
      .catch(() => {
        // Keep the conservative `null` state: a failed read is not proof that
        // the project has no root-relative assets.
      });
    return () => {
      controller.abort();
    };
  }, [projectId, file.mtime, filesRefreshKey, reloadKey, workspaceContext]);
  const projectRootAssetRefs = useMemo(
    () => source != null && htmlHasRootRelativeProjectAssetRefs(source, projectFilePathSet),
    [source, projectFilePathSet],
  );
  useEffect(() => {
    if (!workspaceActive) return;
    setPreviewAssetWarning(null);
    if (mode !== 'preview' || effectiveDeck) return;
    const s = routingHtmlSource;
    if (!s) return;
    const assetPaths = collectPreviewAssetPaths(s, file.name, projectFilePathSet)
      .filter((assetPath) => assetPath !== file.name)
      .slice(0, HTML_PREVIEW_ASSET_PREFLIGHT_LIMIT);
    if (assetPaths.length === 0) return;

    let cancelled = false;
    const cacheBust = `${Math.round(file.mtime)}-${reloadKey}-${filesRefreshKey}`;
    void (async () => {
      for (const assetPath of assetPaths) {
        if (cancelled) return;
        try {
          const resp = await fetch(
            appendResourceQuery(
              projectRawUrl(projectId, assetPath, workspaceContext),
              `previewAssetCheck=${encodeURIComponent(cacheBust)}`,
            ),
            workspaceContext
              ? { headers: workspaceProjectHeaders(workspaceContext) }
              : undefined,
          );
          if (cancelled) return;
          if (resp.ok || resp.status === 404) continue;
          const body = await readPreviewAssetResponseBody(resp);
          if (cancelled) return;
          if (isBlockedPreviewAssetResponse(body)) {
            if (!cancelled) setPreviewAssetWarning({ filePath: assetPath });
            return;
          }
        } catch {
          // Network/daemon reachability errors are already represented by the
          // normal preview loading path. This preflight is only for clear raw
          // route security blocks hidden inside iframe subresource loads.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    effectiveDeck,
    file.mtime,
    file.name,
    filesRefreshKey,
    mode,
    projectFilePathSet,
    projectId,
    reloadKey,
    routingHtmlSource,
    workspaceActive,
    workspaceContext,
  ]);
  // A real WebGL/Worker/WASM/SharedArrayBuffer artifact needs the "powered
  // preview" path — a cross-origin-isolated iframe with allow-same-origin —
  // which the opaque preview sandbox cannot provide (issue #724). Powered mode
  // supersedes the shim/focus-guard srcDoc fallbacks below: those exist only to
  // work around the opaque origin (localStorage SecurityError, focus theft),
  // and powered mode fixes the root cause with a REAL same-origin document, so
  // routing such an artifact to srcDoc would strip exactly the capabilities it
  // needs. The interactive-bridge srcDoc modes (deck/inspect/edit/palette/
  // tweaks/comment) still win — they require host-injected bridges powered mode
  // can't carry.
  const needsPowered = useMemo(() => {
    if (serverPoweredPreviewRequired) return true;
    const s = routingHtmlSource;
    return s != null && htmlNeedsPoweredPreview(s);
  }, [routingHtmlSource, serverPoweredPreviewRequired]);
  const [urlSelectionBridgeReady, setUrlSelectionBridgeReady] = useState(false);
  const urlLoadDecision: UrlLoadDecision = {
    mode,
    isDeck: effectiveDeck,
    commentMode: boardMode,
    urlCommentBridge: urlSelectionBridgeReady,
    urlSnapshotBridge: urlSelectionBridgeReady,
    editMode: manualEditMode,
    urlModeBridge,
    inspectMode,
    drawMode: drawOverlayOpen,
    forceInline: (forceInline || needsSandboxShim) && !needsPowered,
    needsFocusGuard: needsFocusGuard && !needsPowered,
    needsRedirectGuard: needsRedirectGuard && !needsPowered,
    projectRootAssetRefs: projectRootAssetRefs || scopedRelativeAssetRefs,
  };
  const useUrlLoadPreview = shouldUrlLoadHtmlPreview(urlLoadDecision) && !manualEditRequiresSrcDoc;
  // Wait for source discovery before minting. A committed file switch can
  // still carry the previous file's state until the source-loading effect
  // clears/replaces it, so only inspect bytes witnessed for this identity.
  const authoredSrcDocBase = useMemo(
    () => (
      routingSourceIdentity !== currentSourceIdentity || routingHtmlSource == null
        ? null
        : htmlHasAuthoredBase(routingHtmlSource)
    ),
    [currentSourceIdentity, routingHtmlSource, routingSourceIdentity],
  );
  useEffect(() => {
    if (
      useUrlLoadPreview
      || authoredSrcDocBase !== false
      || effectiveScopedSrcDocPreviewBase
      || !workspaceActive
      || projectResourceReadBlocked
      || !workspaceContext
    ) return;
    let cancelled = false;
    const identity = srcDocPreviewBaseIdentity;
    void fetchProjectPreviewBaseHref(projectId, file.name, workspaceContext).then((href) => {
      if (cancelled || !href) return;
      setScopedSrcDocPreviewBase({ identity, href });
    });
    return () => {
      cancelled = true;
    };
  }, [
    authoredSrcDocBase,
    effectiveScopedSrcDocPreviewBase,
    file.name,
    projectId,
    projectResourceReadBlocked,
    srcDocPreviewBaseIdentity,
    useUrlLoadPreview,
    workspaceActive,
    workspaceContext,
  ]);
  const basePreviewSrcUrl = useMemo(
    () => appendResourceQuery(
      projectRawUrl(projectId, file.name, workspaceContext),
      `v=${Math.round(file.mtime)}&r=${reloadKey}&${PREVIEW_BRIDGE_QUERY}`,
    ),
    [projectId, file.name, file.mtime, reloadKey, workspaceContext],
  );
  const [previewSrcUrl, setPreviewSrcUrl] = useState(basePreviewSrcUrl);
  // Hold the iframe URL still (it carries file.mtime) while the user is mid
  // annotation/edit, mirroring the source freeze above. Otherwise a
  // background file change bumps mtime → basePreviewSrcUrl → a URL-load
  // reload right under an active mark/comment/edit/inspect. Captured once at
  // mode entry via a ref and released on exit, so the deferred reload lands
  // exactly once when the user is done.
  const interactivePreviewModeActive = annotationFreezeActive || manualEditMode;
  const frozenPreviewMeasurementDocumentEpochRef = useRef(
    previewContentMeasurementDocumentEpoch,
  );
  if (!interactivePreviewModeActive) {
    frozenPreviewMeasurementDocumentEpochRef.current =
      previewContentMeasurementDocumentEpoch;
  }
  const transportPreviewMeasurementDocumentEpoch =
    frozenPreviewMeasurementDocumentEpochRef.current;
  previewContentMeasurementExpectedDocumentEpochRef.current =
    transportPreviewMeasurementDocumentEpoch;
  const frozenPreviewSrcUrlRef = useRef<string | null>(null);
  if (interactivePreviewModeActive) {
    if (frozenPreviewSrcUrlRef.current === null) {
      frozenPreviewSrcUrlRef.current = basePreviewSrcUrl;
    }
  } else {
    frozenPreviewSrcUrlRef.current = null;
  }
  const effectiveBasePreviewSrcUrl = frozenPreviewSrcUrlRef.current ?? basePreviewSrcUrl;
  const resumedFilesRefresh = resumedFilesRefreshRef.current;
  const resumedPreviewSrcUrl = resumedFilesRefresh
    && resumedFilesRefresh.projectId === projectId
    && resumedFilesRefresh.fileName === file.name
    && resumedFilesRefresh.refreshKey === filesRefreshKey
    ? appendResourceQuery(effectiveBasePreviewSrcUrl, `fr=${filesRefreshKey}`)
    : null;
  // Switching to a different file/project while an annotation tool is still
  // open must NOT keep the viewer pinned to the previous artifact. The
  // per-file annotation data is already reset on file.name change, but the
  // freeze snapshots and the mode flags would otherwise survive — leaving the
  // frozen source/URL stuck on the old file until the user manually closes the
  // tool (and clearing the freeze alone would just re-freeze the old source
  // before the new file's fetch lands). Close the per-file tools and drop both
  // freezes on a file/project switch so the new artifact renders live, the way
  // manualEditFrozenSource is reset just above.
  useEffect(() => {
    frozenPreviewSrcUrlRef.current = null;
    setAnnotationFrozenSource(null);
    setDrawOverlayOpen(false);
    setBoardMode(false);
    setInspectMode(false);
    setSrcDocMaterialized(false);
    // Closing boardMode alone is not enough: the comment dock renders off
    // `commentPanelOpen` and a panel save reuses `activeCommentTarget` /
    // `activePreviewCommentId`, both file-scoped. Left open across a file swap
    // the dock stays visible and the next save would post back to the previous
    // file/element. Fully tear the comment tool down here. (The composer data —
    // activeCommentTarget, drafts, queued notes — is cleared by the file.name
    // reset effect below; these are the UI-open flags it doesn't touch.)
    setCommentPanelOpen(false);
    setCommentCreateMode(false);
    setActivePreviewCommentId(null);
    // Re-arm the loading skeleton ONLY for files this pane has never shown:
    // a brand-new file's slow fetch must show the indicator, not a blank
    // iframe (codex P2 finding, issue #4650) — but revisiting a file the
    // pane already rendered skips the skeleton instead of flashing it on
    // every tab switch (per-file memory in sourceLoadedKeysRef).
    //
    // The snapshot ref (prevSourceBeforeReloadRef) is the restore branch only —
    // it must NOT gate this sentinel. Keeping the guard caused a new file's
    // preview to bypass the loading skeleton entirely and mount an empty srcDoc
    // iframe when a reload snapshot was non-null at switch time (PR #4652
    // third-pass review, PerishCode finding).
    sourceEverLoadedRef.current = sourceLoadedKeysRef.current.has(sourceLoadedFileKey);
    lastGoodSourceForRoutingRef.current = null;
    prevSourceBeforeReloadRef.current = null;
  }, [projectId, file.name, sourceLoadedFileKey]);
  const activePreviewSrcUrl = resumedPreviewSrcUrl ?? (activeFilesRefreshPending
    ? previewSrcUrl
    : (
        previewSrcUrl === effectiveBasePreviewSrcUrl
        || previewSrcUrl.startsWith(`${effectiveBasePreviewSrcUrl}&`)
      )
      ? previewSrcUrl
      : effectiveBasePreviewSrcUrl);
  const previewSrcCarriesCurrentRefresh = filesRefreshKey !== 0
    && new RegExp(`[?&]fr=${filesRefreshKey}(?:&|$)`).test(previewSrcUrl);
  useEffect(() => {
    if (activeFilesRefreshPending || previewSrcCarriesCurrentRefresh) return;
    setPreviewSrcUrl(effectiveBasePreviewSrcUrl);
    setUrlSelectionBridgeReady(false);
  }, [activeFilesRefreshPending, effectiveBasePreviewSrcUrl, previewSrcCarriesCurrentRefresh]);
  const previewObservabilitySeenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    previewObservabilitySeenRef.current = new Set();
  }, [projectId, file.name, reloadKey]);
  useEffect(() => {
    if (mode !== 'preview') return undefined;
    return subscribePreviewIframeMessages(({ source: messageSource, data }) => {
      if (!workspaceActiveRef.current) return;
      const activeFrame = useUrlLoadPreview
        ? urlPreviewIframeRef.current
        : srcDocPreviewIframeRef.current;
      if (!activeFrame || messageSource !== activeFrame.contentWindow) return;
      reportPreviewIframeMessage(data, {
        surface: 'artifact_preview',
        renderMode: useUrlLoadPreview ? 'url_load' : 'srcdoc',
        artifactId: anonymizeArtifactId({ projectId, fileName: file.name }),
        artifactKind: handoffArtifactKind ?? artifactKindToTracking({ fileKind: file.kind ?? null }),
        projectId,
      }, previewObservabilitySeenRef.current);
    });
  }, [file.kind, file.name, handoffArtifactKind, mode, projectId, useUrlLoadPreview]);
  useEffect(() => {
    const activeFrame = useUrlLoadPreview
      ? urlPreviewIframeRef.current
      : srcDocPreviewIframeRef.current;
    iframeRef.current = activeFrame;
    if (
      activeFrame?.dataset.odLoadedPreviewEpoch === transportPreviewMeasurementDocumentEpoch
    ) {
      beginDesktopPreviewContentMeasurementGeneration(activeFrame);
      scheduleDesktopPreviewContentMeasure(activeFrame);
    }
  }, [
    beginDesktopPreviewContentMeasurementGeneration,
    transportPreviewMeasurementDocumentEpoch,
    scheduleDesktopPreviewContentMeasure,
    useUrlLoadPreview,
  ]);
  // Clear a redirect-loop park whenever the artifact changes or the user hits
  // reload (reloadKey bump): the previewed content is fresh, so give it a clean
  // run rather than staying pinned on the "loop detected" placeholder.
  useEffect(() => {
    setRedirectLoopBlocked(false);
  }, [projectId, file.name, reloadKey]);
  // The injected redirect guard posts `od:redirect-loop-blocked` when a preview
  // reloads itself past its hop budget. Only trust our own two preview frames,
  // then park the srcDoc iframe on static content so the loop cannot continue.
  useEffect(() => {
    if (!workspaceActive) return;
    function onMessage(ev: MessageEvent) {
      const fromPreview =
        ev.source === srcDocPreviewIframeRef.current?.contentWindow ||
        ev.source === urlPreviewIframeRef.current?.contentWindow;
      if (!fromPreview) return;
      const data = ev.data as { type?: string } | null;
      if (data?.type !== PREVIEW_REDIRECT_LOOP_MESSAGE) return;
      setRedirectLoopBlocked(true);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [workspaceActive]);

  // Resolve the cross-origin powered-preview URL for artifacts that need it.
  // `resolved:false` means the (cached) daemon isolation probe is still in
  // flight — the URL iframe stays parked at about:blank until it settles so a
  // large artifact is never loaded twice (once opaque, once powered). A null
  // `url` after resolution means powered mode is unavailable (e.g. no
  // cross-origin loopback base); the viewer then falls back to the normal
  // opaque URL-load path, which still runs WebGL/blob-Workers/WASM.
  const [powered, setPowered] = useState<{ resolved: boolean; url: string | null }>({
    resolved: false,
    url: null,
  });
  useEffect(() => {
    if (!workspaceActive) return;
    if (!(needsPowered && useUrlLoadPreview)) {
      setPowered({ resolved: false, url: null });
      return;
    }
    let cancelled = false;
    setPowered({ resolved: false, url: null });
    void resolvePoweredPreviewUrl(projectId, file.name).then((base) => {
      if (cancelled) return;
      setPowered({
        resolved: true,
        url: base ? `${base}?v=${Math.round(file.mtime)}&r=${reloadKey}&${PREVIEW_BRIDGE_QUERY}` : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    needsPowered,
    useUrlLoadPreview,
    projectId,
    file.name,
    file.mtime,
    reloadKey,
    workspaceActive,
  ]);
  const usePoweredPreview = needsPowered && useUrlLoadPreview && powered.url != null;
  const poweredResolving = needsPowered && useUrlLoadPreview && !powered.resolved;
  const [poweredPreviewSrcOverride, setPoweredPreviewSrcOverride] = useState<{
    projectId: string;
    fileName: string;
    mtime: number;
    size: number;
    refreshKey: number;
    reloadKey: number;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!workspaceActive) return;
    if (filesRefreshKey === 0) return;
    if (appliedFilesRefreshKeyRef.current === filesRefreshKey) return;
    // Defer the file-watcher live-reload while annotating; the effect re-runs
    // when the mode closes (interactivePreviewModeActive flips) and applies
    // the now-current URL in one pass.
    if (interactivePreviewModeActive) return;
    // Skip a refresh this viewer caused itself (screenshot-to-chat's own
    // upload landing in the project folder) — see suppressLiveReloadUntilRef
    // above. Reloading the live preview for a file-changed echo of our own
    // unrelated attachment upload is exactly the flash users reported.
    if (Date.now() < suppressLiveReloadUntilRef.current) return;
    if (needsPowered && useUrlLoadPreview && !powered.resolved) return;
    const refreshBasePreviewSrcUrl = usePoweredPreview && powered.url
      ? powered.url
      : effectiveBasePreviewSrcUrl;
    const refreshPreviewSrcUrl = appendResourceQuery(
      refreshBasePreviewSrcUrl,
      `odPreviewEpoch=${encodeURIComponent(transportPreviewMeasurementDocumentEpoch)}`,
    );
    const nextSrc = appendResourceQuery(refreshPreviewSrcUrl, `fr=${filesRefreshKey}`);
    const timeout = window.setTimeout(() => {
      appliedFilesRefreshKeyRef.current = filesRefreshKey;
      if (usePoweredPreview) {
        setPoweredPreviewSrcOverride({
          projectId,
          fileName: file.name,
          mtime: file.mtime,
          size: file.size,
          refreshKey: filesRefreshKey,
          reloadKey,
          url: nextSrc,
        });
      } else {
        // The final URL transport layer appends the document epoch. Keep the
        // base state epoch-free so React does not emit duplicate query keys.
        setPreviewSrcUrl(appendResourceQuery(refreshBasePreviewSrcUrl, `fr=${filesRefreshKey}`));
      }
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [
    effectiveBasePreviewSrcUrl,
    filesRefreshKey,
    useUrlLoadPreview,
    interactivePreviewModeActive,
    needsPowered,
    powered.resolved,
    powered.url,
    projectId,
    file.name,
    file.mtime,
    file.size,
    reloadKey,
    transportPreviewMeasurementDocumentEpoch,
    usePoweredPreview,
    workspaceActive,
  ]);

  useEffect(() => {
    setInlinedSource(null);
    if (useUrlLoadPreview) return;
    if (!assetInliningSource) return;
    // Root-relative project asset refs need the confirmed file list before
    // they can be normalized; wait for it rather than inlining a half-fixed
    // document (the effect re-runs when the set lands).
    if ((projectRootAssetRefs || scopedRelativeAssetRefs) && projectFilePathSet === null) return;
    if (!relativeProjectAssetRefs && !projectRootAssetRefs) return;
    let cancelled = false;
    void inlineRelativeAssets(
      assetInliningSource,
      projectId,
      file.name,
      projectFilePathSet,
      workspaceContext,
    ).then((next) => {
      if (!cancelled) setInlinedSource(next);
    });
    return () => {
      cancelled = true;
    };
  }, [
    assetInliningSource,
    projectId,
    file.name,
    reloadKey,
    useUrlLoadPreview,
    projectRootAssetRefs,
    relativeProjectAssetRefs,
    scopedRelativeAssetRefs,
    projectFilePathSet,
    workspaceContext,
  ]);

  const srcDocBaseHref = effectiveScopedSrcDocPreviewBase
    ?? projectRawUrl(projectId, baseDirFor(file.name), workspaceContext);
  const srcDocTransportGeneration = useMemo(
    () => nextPreviewTransportGeneration(),
    [
      previewSource,
      effectiveDeck,
      projectId,
      file.name,
      reloadKey,
      transportPreviewMeasurementDocumentEpoch,
      workspaceContext,
      srcDocBaseHref,
    ],
  );
  const srcDoc = useMemo(
    () => (previewSource ? buildSrcdoc(previewSource, {
      deck: effectiveDeck,
      baseHref: srcDocBaseHref,
      initialSlideIndex: htmlPreviewSlideState.get(previewStateKey)?.active ?? 0,
      hideDeckChrome: effectiveDeck,
      selectionBridge: true,
      // Always inject the manual-edit bridge into the PREVIEW srcDoc (not the
      // export path), so the document is byte-identical across preview /
      // comment / draw / edit. The bridge boots dormant (`enabled=false`) and
      // only acts on the host's `od-edit-mode {enabled:true}` postMessage
      // (sent by syncBridgeModes), with all its handlers gated on `enabled`
      // and its styles scoped to `html[data-od-edit-mode]`. Gating injection on
      // edit mode instead changed the srcdoc string on entering Edit, which
      // re-parses the whole document — the "reload from scratch on switch" the
      // user hit. Mirrors the always-on tweaks bridge rationale above.
      editBridge: true,
      paletteBridge: false,
      previewFocusGuard: true,
      previewObservability: true,
      // Embed the reload counter so the srcdoc string differs across reloads
      // even when the fetched HTML bytes are identical (issue #4650).
      reloadKey,
      previewMeasurementEpoch: transportPreviewMeasurementDocumentEpoch,
      transportActivationGeneration: srcDocTransportGeneration,
    }) : ''),
    [
      previewSource,
      effectiveDeck,
      projectId,
      file.name,
      previewStateKey,
      reloadKey,
      transportPreviewMeasurementDocumentEpoch,
      srcDocTransportGeneration,
      srcDocBaseHref,
    ],
  );
  const expectedSrcDocTransportGenerationRef = useRef(srcDocTransportGeneration);
  expectedSrcDocTransportGenerationRef.current = srcDocTransportGeneration;
  const readySrcDocTransportRef = useRef<{
    frame: HTMLIFrameElement;
    generation: string;
  } | null>(null);
  // Eager readiness keeps the existing bridge features responsive. Navigation
  // recovery uses the separately challenged witness below because Chromium can
  // abort about:srcdoc after the head bridge has already announced itself.
  const verifiedSrcDocTransportRef = useRef<{
    frame: HTMLIFrameElement;
    generation: string;
  } | null>(null);
  const srcDocTransportProbeSequenceRef = useRef(0);
  const pendingSrcDocTransportProbeRef = useRef<{
    frame: HTMLIFrameElement;
    generation: string;
    probeId: string;
    recoverOnFailure: boolean;
  } | null>(null);
  const replayPreviewBridgeModes = useCallback((target: HTMLIFrameElement | null) => {
    if (!workspaceActive) return;
    const win = target?.contentWindow;
    if (!win) return;
    const verified = verifiedSrcDocTransportRef.current;
    if (
      target === srcDocPreviewIframeRef.current
      && verified?.frame === target
      && verified.generation === expectedSrcDocTransportGenerationRef.current
    ) {
      postAndConsumePreviewRuntimeState(target);
    }
    win.postMessage({
      type: 'od:comment-mode',
      enabled: boardMode,
      mode: boardTool,
    }, '*');
    win.postMessage({ type: 'od-edit-mode', enabled: manualEditMode }, '*');
    win.postMessage({
      type: 'od-edit-selected-target',
      id: manualEditMode ? selectedManualEditTarget?.id ?? null : null,
    }, '*');
    win.postMessage({ type: 'od:inspect-mode', enabled: inspectMode }, '*');
  }, [
    boardMode,
    boardTool,
    inspectMode,
    manualEditMode,
    postAndConsumePreviewRuntimeState,
    selectedManualEditTarget?.id,
    workspaceActive,
  ]);
  // Only materialized while the in-tab presentation overlay is up — building
  // it eagerly would re-run buildSrcdoc on every source edit for a document
  // nobody is presenting.
  const presentationSrcDoc = useMemo(
    () => (deckVisualSource && inTabPresent ? buildSrcdoc(deckVisualSource, {
      deck: effectiveDeck,
      baseHref: srcDocBaseHref,
      initialSlideIndex: htmlPreviewSlideState.get(previewStateKey)?.active ?? 0,
      hideDeckChrome: effectiveDeck,
      deckClickNavigation: effectiveDeck,
      previewFocusGuard: true,
    }) : ''),
    [
      deckVisualSource,
      inTabPresent,
      effectiveDeck,
      projectId,
      file.name,
      previewStateKey,
      srcDocBaseHref,
    ],
  );
  // Per-slide thumbnail documents are built lazily by DeckThumbnailRail, one
  // slide at a time and only for thumbnails near the rail viewport. This
  // callback's identity is the rail's srcdoc cache key: a new deck source
  // mints a new builder and only the mounted thumbnails rebuild.
  // `freezeMotion` settles deck animations at their final frame so N
  // miniature documents don't keep the compositor rasterizing forever.
  const buildDeckThumbnailSrcDoc = useCallback(
    (index: number) => buildSrcdoc(deckVisualSource ?? '', {
      deck: true,
      baseHref: srcDocBaseHref,
      initialSlideIndex: index,
      hideDeckChrome: true,
      previewFocusGuard: true,
      freezeMotion: true,
    }),
    [deckVisualSource, srcDocBaseHref],
  );
  // Parse the deck once per source into per-slide shadow-root render data. When
  // renderable, DeckThumbnailRail mounts a single cloned slide per thumbnail
  // instead of a full-deck iframe — no scripts, no deck bridge, no N documents
  // saturating the main thread on entry. Decks we can't statically render
  // (external CSS, viewport-sized slides, no inline styles) keep the iframe
  // fallback via `parsedDeck = null`.
  const parsedDeckThumbnails = useMemo(() => {
    if (!effectiveDeck || !deckVisualSource) return null;
    const parsed = parseDeckThumbnails(
      deckVisualSource,
      srcDocBaseHref,
    );
    return parsed.renderable ? parsed : null;
  }, [effectiveDeck, deckVisualSource, srcDocBaseHref]);
  // Stable thunk so HtmlViewer's frequent re-renders (slide state, streaming
  // edits) never invalidate the memoized rail; the ref always calls the
  // freshest goToSlide closure.
  const goToSlideRef = useRef<(index: number) => void>(() => {});
  useEffect(() => {
    goToSlideRef.current = goToSlide;
  });
  const handleDeckThumbnailSelect = useCallback((index: number) => {
    goToSlideRef.current(index);
  }, []);
  const lazySrcDocTransport = useMemo(() => buildLazySrcdocTransport(), []);
  const [srcDocTransportResetKey, setSrcDocTransportResetKey] = useState(0);
  const [srcDocShellReady, setSrcDocShellReady] = useState(false);
  const srcDocRecoveryAttemptedGenerationRef = useRef<string | null>(null);
  const [srcDocRecoveryGeneration, setSrcDocRecoveryGeneration] = useState<string | null>(null);
  const recoverUnacknowledgedSrcDocTransport = useCallback((generation: string) => {
    if (
      !workspaceActiveRef.current
      || expectedSrcDocTransportGenerationRef.current !== generation
    ) {
      return;
    }
    const frame = srcDocPreviewIframeRef.current;
    const verified = verifiedSrcDocTransportRef.current;
    if (frame && verified?.frame === frame && verified.generation === generation) return;
    if (srcDocRecoveryAttemptedGenerationRef.current === generation) return;
    srcDocRecoveryAttemptedGenerationRef.current = generation;
    pendingSrcDocTransportProbeRef.current = null;
    verifiedSrcDocTransportRef.current = null;
    readySrcDocTransportRef.current = null;
    activatedSrcDocTransportHtmlRef.current = null;
    setSrcDocShellReady(false);
    setSrcDocRecoveryGeneration(generation);
    setSrcDocTransportResetKey((key) => key + 1);
  }, []);
  const probeSrcDocTransport = useCallback((
    generation: string,
    recoverOnFailure: boolean,
  ) => {
    if (
      !workspaceActiveRef.current
      || expectedSrcDocTransportGenerationRef.current !== generation
    ) {
      return;
    }
    const frame = srcDocPreviewIframeRef.current;
    if (!frame) return;
    const pending = pendingSrcDocTransportProbeRef.current;
    const pendingRecoveryProbeMatches = (
      pending?.frame === frame
      && pending.generation === generation
      && pending.recoverOnFailure
    );
    // Recovery probes can be shared by the timer and onLoad paths. A passive
    // prewarm probe may target the lazy shell, so the real srcDoc must replace it.
    if (pendingRecoveryProbeMatches) return;
    srcDocTransportProbeSequenceRef.current += 1;
    const probeId = `${generation}:probe-${srcDocTransportProbeSequenceRef.current}`;
    pendingSrcDocTransportProbeRef.current = {
      frame,
      generation,
      probeId,
      recoverOnFailure,
    };
    // An eager acknowledgement from the injected head bridge is provisional:
    // Chromium can still abort the about:srcdoc navigation after it was sent.
    // Only this exact challenge response proves the current browsing context is
    // alive after the navigation had a chance to commit.
    verifiedSrcDocTransportRef.current = null;
    frame.contentWindow?.postMessage({
      type: 'od:srcdoc-transport-ready-probe',
      generation,
      probeId,
    }, '*');
    window.setTimeout(() => {
      const pending = pendingSrcDocTransportProbeRef.current;
      if (
        !pending
        || pending.frame !== frame
        || pending.generation !== generation
        || pending.probeId !== probeId
      ) {
        return;
      }
      pendingSrcDocTransportProbeRef.current = null;
      if (pending.recoverOnFailure) recoverUnacknowledgedSrcDocTransport(generation);
    }, SRC_DOC_READY_PROBE_TIMEOUT_MS);
  }, [recoverUnacknowledgedSrcDocTransport]);
  // Sticky once the srcDoc iframe has materialized the real artifact for the
  // first time (i.e. the first entry into Mark/Edit/Comment/Inspect). Until
  // then the srcDoc iframe stays on the lazy shell — so passive preview never
  // runs a hidden second copy of the artifact (no double mount, and no white:
  // we only materialize while the iframe is VISIBLE, where scroll/reveal
  // animations fire correctly). Once materialized it stays real even back in
  // URL-load mode (hidden), so every later mode toggle is an instant
  // visibility swap with no re-load. Reset on file/project change.
  const [srcDocMaterialized, setSrcDocMaterialized] = useState(false);
  const wasUrlLoadPreviewRef = useRef(useUrlLoadPreview);
  // Segregate the pooled-iframe cache by powered-ness: a powered frame carries
  // a different origin + sandbox, so reusing a plain frame's DOM node for it
  // (or vice-versa) would leave a stale sandbox attribute on a live iframe.
  const urlPreviewKeepAliveKey =
    `${previewIframeKeepAliveKey(projectId, file.name)}`
    + `:scope:${encodeURIComponent(sourceAuthorizationScopeKey ?? 'pending')}`
    + (usePoweredPreview ? ':powered' : '');
  const previousUrlPreviewKeepAliveKeyRef = useRef(urlPreviewKeepAliveKey);
  useEffect(() => {
    const previousKey = previousUrlPreviewKeepAliveKeyRef.current;
    previousUrlPreviewKeepAliveKeyRef.current = urlPreviewKeepAliveKey;
    if (previousKey !== urlPreviewKeepAliveKey) iframeKeepAlivePool.evict(previousKey);
  }, [iframeKeepAlivePool, urlPreviewKeepAliveKey]);
  // Reset the shell-ready latch whenever the srcDoc iframe re-mounts. The
  // next shell will post `od:srcdoc-transport-ready` (or fire onLoad) and
  // flip this back to true. See #2253.
  useEffect(() => {
    setSrcDocShellReady(false);
  }, [srcDocTransportResetKey]);
  // Listen for the shell's ready handshake. Gating activation on this is
  // what fixes the #2253 race: opening Tweaks right after a key-driven
  // re-mount used to post `activate` before the shell's listener was
  // installed, dropping the message and stranding the iframe on the empty
  // 536-byte body.
  useEffect(() => {
    if (!workspaceActive) return;
    function onMessage(ev: MessageEvent) {
      if (ev.source !== srcDocPreviewIframeRef.current?.contentWindow) return;
      const data = ev.data as { type?: string } | null;
      if (data?.type !== 'od:srcdoc-transport-ready') return;
      setSrcDocShellReady(true);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [workspaceActive]);
  // A frame `load` only proves that some document finished loading. It cannot
  // distinguish the lazy shell from the real artifact written into that shell,
  // and a prewarmed real artifact may have loaded before Edit is activated.
  // Trust only the artifact bridge's exact generation acknowledgement.
  useEffect(() => {
    if (!workspaceActive) return;
    function onMessage(ev: MessageEvent) {
      const frame = srcDocPreviewIframeRef.current;
      if (ev.source !== frame?.contentWindow) return;
      const data = ev.data as {
        type?: unknown;
        generation?: unknown;
        probeId?: unknown;
      } | null;
      const pending = pendingSrcDocTransportProbeRef.current;
      if (
        data?.type !== 'od:srcdoc-transport-activated'
        || typeof data.generation !== 'string'
        || data.generation !== expectedSrcDocTransportGenerationRef.current
      ) {
        return;
      }
      readySrcDocTransportRef.current = { frame, generation: data.generation };
      if (
        typeof data.probeId === 'string'
        && pending
        && pending.frame === frame
        && pending.generation === data.generation
        && pending.probeId === data.probeId
      ) {
        pendingSrcDocTransportProbeRef.current = null;
        verifiedSrcDocTransportRef.current = { frame, generation: data.generation };
      }
      if (frame === iframeRef.current) replayPreviewBridgeModes(frame);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [replayPreviewBridgeModes, workspaceActive]);
  // React can commit a fresh `srcdoc` attribute while Chromium aborts the
  // corresponding about:srcdoc navigation. The injected head bridge may run
  // and announce eagerly before that abort, so a plain generation ACK is not a
  // committed-document witness. Challenge the current browsing context after
  // the navigation had time to settle and require the exact probe token back;
  // otherwise retry through the small lazy shell automatically. Chromium can
  // commit that shell even when it aborts a large direct srcDoc navigation,
  // after which the existing ready handshake safely document.write's the
  // latest HTML. One fallback per generation avoids a loop when an authored
  // document is fundamentally unable to execute scripts.
  useEffect(() => {
    if (!workspaceActive || mode !== 'preview' || useUrlLoadPreview || !srcDoc) return;
    const generation = srcDocTransportGeneration;
    if (srcDocRecoveryAttemptedGenerationRef.current === generation) return;
    const timeout = window.setTimeout(() => {
      const frame = srcDocPreviewIframeRef.current;
      const verified = verifiedSrcDocTransportRef.current;
      if (frame && verified?.frame === frame && verified.generation === generation) return;
      probeSrcDocTransport(generation, true);
    }, SRC_DOC_ACTIVATION_RECOVERY_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [
    mode,
    probeSrcDocTransport,
    srcDoc,
    srcDocTransportGeneration,
    useUrlLoadPreview,
    workspaceActive,
  ]);
  useEffect(() => {
    if (!workspaceActive) return;
    function onMessage(ev: MessageEvent) {
      const frame = urlPreviewIframeRef.current;
      if (ev.source !== frame?.contentWindow) return;
      if (frame.getAttribute('src') === 'about:blank') return;
      const data = ev.data as { type?: string; href?: string } | null;
      if (data?.type !== 'od:url-selection-bridge-ready') return;
      // The latch must describe the currently committed document's bridge, so
      // the ready must carry and match the document href.
      if (typeof data.href !== 'string' || data.href.length === 0) return;
      let matches: boolean;
      try {
        matches = new URL(data.href, window.location.href).href
          === new URL(frame.getAttribute('src') ?? '', window.location.href).href;
      } catch {
        return;
      }
      if (!matches) return;
      setUrlSelectionBridgeReady(true);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [workspaceActive]);
  // Lazy transport preloads an empty shell only while URL-load is the active
  // transport. Once srcdoc becomes active (sandbox shim, Draw, Screenshot,
  // Tweaks, etc.), mount the real artifact HTML directly so we do not depend on
  // a postMessage activation that can race (#2253) and strand the iframe blank
  // (#2361, #2791).
  const captureModeActive = drawOverlayOpen;
  // Once `srcDocMaterialized` is set (after the first mode entry), keep the
  // srcDoc iframe on the real artifact even when hidden behind URL-load, so
  // re-entering a mode is an instant visibility swap rather than a re-mount +
  // re-load. Direct-mount path (no #2361/#2791 postMessage race).
  const useLazySrcDocTransport =
    srcDocRecoveryGeneration === srcDocTransportGeneration
    || (!manualEditRequiresSrcDoc && !captureModeActive && useUrlLoadPreview && !srcDocMaterialized);
  // Park on a static "loop detected" document once the guard reports a runaway
  // redirect. A self-redirecting artifact is forced onto the srcDoc iframe by
  // `needsRedirectGuard`, so swapping this content is the reliable stop — the
  // placeholder carries no redirect, so the frame settles the moment it loads.
  const redirectLoopBlockedDoc = useMemo(() => buildRedirectLoopBlockedDoc(), []);
  const srcDocTransportContent = redirectLoopBlocked
    ? redirectLoopBlockedDoc
    : useLazySrcDocTransport
      ? lazySrcDocTransport
      : srcDoc;
  // Materialize the srcDoc iframe the first time it actually becomes the active
  // (visible) transport — i.e. the first Mark/Edit/Comment/Inspect entry. We do
  // NOT pre-render it while hidden/idle: that ran a second live copy during
  // passive preview (double mount) and rendered scroll/reveal-animated content
  // while invisible, which left it stuck blank (the white-on-enter bug). Doing
  // it on first visible entry means the one materialization paints correctly,
  // and the sticky flag keeps it warm for every subsequent toggle.
  useEffect(() => {
    if (!useUrlLoadPreview && !srcDocMaterialized) setSrcDocMaterialized(true);
  }, [useUrlLoadPreview, srcDocMaterialized]);
  // When the srcDoc switch is driven ONLY by Draw/annotation mode — an
  // artifact that would otherwise URL-load — keep the URL-load iframe warm
  // instead of parking it at about:blank. Draw is a quick "mark → screenshot →
  // close" round-trip; parking forces a full artifact re-fetch the moment the
  // overlay closes, which users see as a jarring black → loading → reload right
  // after every screenshot. Sticky srcDoc modes (inspect / edit / palette /
  // tweaks / comment / deck / focus-guard / sandbox-shim) keep parking, so two
  // live copies never linger beyond the brief annotation pass.
  const srcDocForcedOnlyByDraw =
    drawOverlayOpen &&
    !manualEditRequiresSrcDoc &&
    shouldUrlLoadHtmlPreview({ ...urlLoadDecision, drawMode: false });
  const urlTransportSrc = projectResourceReadBlocked
    ? 'about:blank'
    : useUrlLoadPreview || srcDocForcedOnlyByDraw
      ? activePreviewSrcUrl
      : 'about:blank';
  const activePoweredPreviewSrcOverride = poweredPreviewSrcOverride
    && poweredPreviewSrcOverride.projectId === projectId
    && poweredPreviewSrcOverride.fileName === file.name
    && poweredPreviewSrcOverride.mtime === file.mtime
    && poweredPreviewSrcOverride.size === file.size
    && poweredPreviewSrcOverride.refreshKey === filesRefreshKey
    && poweredPreviewSrcOverride.reloadKey === reloadKey
    ? poweredPreviewSrcOverride.url
    : null;
  // Powered preview: swap the URL-load iframe to the cross-origin isolated
  // daemon origin + `allow-same-origin` so Workers/Storage/WASM/SAB work.
  // While the isolation probe resolves, park at about:blank instead of loading
  // the opaque URL, so a large artifact isn't fetched twice.
  const urlFrameBaseSrc = usePoweredPreview
    ? (powered.url as string)
    : poweredResolving
      ? 'about:blank'
      : urlTransportSrc;
  const computedUrlFrameSrc = urlFrameBaseSrc === 'about:blank'
    ? urlFrameBaseSrc
    : appendResourceQuery(
        urlFrameBaseSrc,
        `odPreviewEpoch=${encodeURIComponent(transportPreviewMeasurementDocumentEpoch)}`,
      );
  const lastRenderedUrlFrameSrcRef = useRef(computedUrlFrameSrc);
  const urlFrameSrc = activeFilesRefreshPending
    ? lastRenderedUrlFrameSrcRef.current
    : activePoweredPreviewSrcOverride ?? computedUrlFrameSrc;
  lastRenderedUrlFrameSrcRef.current = urlFrameSrc;
  const urlFrameSandbox = usePoweredPreview
    ? POWERED_PREVIEW_SANDBOX
    : 'allow-scripts allow-downloads';
  const urlFrameAllow = usePoweredPreview ? POWERED_PREVIEW_ALLOW : undefined;
  // Arm the first-load overlay only for URL-load previews this pane has never
  // painted (per keep-alive key, so tab revisits and pooled re-attaches skip
  // it). about:blank parks (powered probe, srcDoc-active) never arm.
  useEffect(() => {
    if (!useUrlLoadPreview || urlFrameSrc === 'about:blank') {
      setUrlPreviewFirstLoadPending(false);
      return;
    }
    setUrlPreviewFirstLoadPending(!urlPreviewLoadedKeysRef.current.has(urlPreviewKeepAliveKey));
  }, [useUrlLoadPreview, urlFrameSrc, urlPreviewKeepAliveKey]);
  const activateSrcDocTransport = useCallback((target: HTMLIFrameElement | null = srcDocPreviewIframeRef.current) => {
    if (!canActivateSrcDocTransport({
      srcDoc,
      useUrlLoadPreview,
      useLazySrcDocTransport,
      shellReady: srcDocShellReady,
      activatedHtml: activatedSrcDocTransportHtmlRef.current,
    })) return false;
    // A SECOND activation while Comment mode is on would document.open +
    // write over the iframe's existing document. The window-level message
    // listener survives, but iframe.onLoad does NOT refire for
    // document.write, so host-side re-init (slide nav sync, scroll
    // restore, bridge replay) is silently skipped — the visible page can
    // drift out of sync with the host's tracked state (e.g. the page
    // indicator shows 3 while the iframe rendered page 4 of the freshly
    // edited deck). Force a fresh shell mount under Comment so onLoad
    // fires and the full re-init pipeline runs against the new HTML.
    //
    // Skip the remount path in Manual Edit, where the postMessage
    // activate carries the patched HTML and host-side scroll/slide
    // state intentionally stays put across the patch.
    if (boardMode && activatedSrcDocTransportHtmlRef.current !== null) {
      activatedSrcDocTransportHtmlRef.current = null;
      setSrcDocTransportResetKey((key) => key + 1);
      return true;
    }
    const win = target?.contentWindow;
    if (!win) return false;
    win.postMessage({
      type: 'od:srcdoc-transport-activate',
      html: srcDoc,
      generation: srcDocTransportGeneration,
    }, '*');
    activatedSrcDocTransportHtmlRef.current = srcDoc;
    return true;
  }, [srcDoc, srcDocTransportGeneration, useLazySrcDocTransport, useUrlLoadPreview, srcDocShellReady, boardMode]);
  const activateLoadedSrcDocTransport = useCallback((target: HTMLIFrameElement | null = srcDocPreviewIframeRef.current) => {
    if (!canActivateSrcDocTransport({
      srcDoc,
      useUrlLoadPreview,
      useLazySrcDocTransport,
      shellReady: true,
      activatedHtml: activatedSrcDocTransportHtmlRef.current,
    })) return false;
    const win = target?.contentWindow;
    if (!win) return false;
    win.postMessage({
      type: 'od:srcdoc-transport-activate',
      html: srcDoc,
      generation: srcDocTransportGeneration,
    }, '*');
    activatedSrcDocTransportHtmlRef.current = srcDoc;
    return true;
  }, [srcDoc, srcDocTransportGeneration, useLazySrcDocTransport, useUrlLoadPreview]);
  const activateSrcDocSnapshotTransport = useCallback((target: HTMLIFrameElement | null = srcDocPreviewIframeRef.current) => {
    if (!srcDoc) return false;
    const win = target?.contentWindow;
    if (!win) return false;
    win.postMessage({
      type: 'od:srcdoc-transport-activate',
      html: srcDoc,
      generation: srcDocTransportGeneration,
    }, '*');
    return true;
  }, [srcDoc, srcDocTransportGeneration]);
  function verifyLoadedSrcDocTransport(target: HTMLIFrameElement | null) {
    if (!target || target !== srcDocPreviewIframeRef.current) return;
    const generation = srcDocTransportGeneration;
    probeSrcDocTransport(generation, !useUrlLoadPreview && Boolean(srcDoc));
  }
  useEffect(() => {
    if (useUrlLoadPreview) {
      activatedSrcDocTransportHtmlRef.current = null;
      // Remounting the srcDoc iframe on a render-mode flip resets it to a fresh
      // lazy shell — needed ONLY for the lazy postMessage-activation path
      // (#2253 shell-ready handshake). When the srcDoc iframe is direct-mounted
      // (prewarmed, or an annotation mode), its content lives in the srcdoc
      // attribute, so a remount would just throw away the warm render and force
      // a reload. That is exactly the thrash users saw toggling Comment
      // (URL-load) ↔ Mark (srcDoc): each flip remounted and reloaded. Keep the
      // iframe alive in the direct-mount case so the toggle is a pure
      // visibility swap.
      if (!wasUrlLoadPreviewRef.current && useLazySrcDocTransport) {
        setSrcDocTransportResetKey((key) => key + 1);
      }
      wasUrlLoadPreviewRef.current = true;
      return;
    }
    if (wasUrlLoadPreviewRef.current && useLazySrcDocTransport) {
      setSrcDocTransportResetKey((key) => key + 1);
      activatedSrcDocTransportHtmlRef.current = null;
    }
    wasUrlLoadPreviewRef.current = false;
    activateSrcDocTransport();
  }, [activateSrcDocTransport, useUrlLoadPreview, useLazySrcDocTransport]);
  // Recovery for a deck that parsed into the srcdoc iframe while the browser
  // tab was hidden: on the first return to a visible document, remount the
  // iframe for a fresh srcdoc parse (the mechanism Comment re-activation
  // already relies on) and clear the latch so visibility round-trips after a
  // healthy load never remount. Only the active viewer owns recovery —
  // retained viewers keep their #6519 activation contract untouched.
  useEffect(() => {
    if (!workspaceActive || typeof document === 'undefined') return;
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      if (!srcDocLoadRequiresFreshParseOnReturnToVisible({
        loadedWhileDocumentHidden: srcDocLoadedWhileDocumentHiddenRef.current,
        srcDocIsActiveTransport: !useUrlLoadPreview,
        isDeck: effectiveDeck,
      })) return;
      srcDocLoadedWhileDocumentHiddenRef.current = false;
      activatedSrcDocTransportHtmlRef.current = null;
      setSrcDocTransportResetKey((key) => key + 1);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Run one check immediately: this effect only listens while the viewer is
    // ACTIVE, so when the hidden-tab load happened in a retained viewer and
    // the browser returned to visible before the user clicked back into the
    // project, the visibilitychange event fired with no listener armed and
    // will not replay. The latch would dangle (0x0-parsed deck, permanently
    // white) exactly on the "switch back to the project tab" flow. The
    // handler's own guards (visible + latch + srcdoc active + deck) make this
    // a one-shot no-op everywhere else.
    onVisibilityChange();
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [workspaceActive, useUrlLoadPreview, effectiveDeck]);

  useEffect(() => {
    if (!workspaceActive) return;
    restorePreviewScrollPosition();
  }, [boardMode, drawOverlayOpen, manualEditMode, srcDoc, restorePreviewScrollPosition, workspaceActive]);

  useEffect(() => {
    if (!workspaceActive) return;
    function onMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      if (!isActivePreviewIframeSource(ev.source)) return;
      const data = ev.data as {
        type?: string;
        frameLeft?: number;
        frameTop?: number;
        canvasLeft?: number;
        canvasTop?: number;
      } | null;
      if (!data || data.type !== 'od:preview-scroll') return;
      if (previewScrollRestoreRef.current && Number(data.canvasLeft || 0) === 0 && Number(data.canvasTop || 0) === 0) return;
      if (
        previewScrollPositionRef.current.canvasLeft !== 0 ||
        previewScrollPositionRef.current.canvasTop !== 0
      ) {
        const isInitialZeroReport = Number(data.canvasLeft || 0) === 0 && Number(data.canvasTop || 0) === 0;
        if (isInitialZeroReport && Date.now() - previewScrollRequestAtRef.current < 1200) return;
      }
      previewScrollPositionRef.current = {
        frameLeft: Number(data.frameLeft || 0),
        frameTop: Number(data.frameTop || 0),
        canvasLeft: Number(data.canvasLeft || 0),
        canvasTop: Number(data.canvasTop || 0),
      };
    }
    function onRestoreRequest(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      if (!isActivePreviewIframeSource(ev.source)) return;
      const data = ev.data as { type?: string } | null;
      if (!data || data.type !== 'od:preview-scroll-request') return;
      previewScrollRequestAtRef.current = Date.now();
      const snapshot = previewScrollRestoreRef.current;
      const scroll = snapshot ?? {
        frameLeft: previewScrollPositionRef.current.frameLeft,
        frameTop: previewScrollPositionRef.current.frameTop,
        canvasLeft: previewScrollPositionRef.current.canvasLeft,
        canvasTop: previewScrollPositionRef.current.canvasTop,
      };
      iframeRef.current?.contentWindow?.postMessage({
        type: 'od:preview-scroll-restore',
        frameLeft: scroll.frameLeft,
        frameTop: scroll.frameTop,
        canvasLeft: scroll.canvasLeft,
        canvasTop: scroll.canvasTop,
      }, '*');
    }
    function onDcViewportMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      if (!isActivePreviewIframeSource(ev.source)) return;
      const data = ev.data as {
        type?: string;
        x?: number;
        y?: number;
        scale?: number;
      } | null;
      if (!data || !data.type) return;
      if (data.type === '__dc_viewport') {
        const x = Number(data.x || 0);
        const y = Number(data.y || 0);
        const scale = Number(data.scale || 1);
        const hasExistingPosition = dcViewportRef.current.x !== 0 || dcViewportRef.current.y !== 0;
        const isInitialZeroReport = x === 0 && y === 0 && scale === 1;
        if (hasExistingPosition && isInitialZeroReport && Date.now() - dcViewportRestoreAtRef.current < 1500) return;
        dcViewportRef.current = {
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
          scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
        };
        return;
      }
      if (data.type === '__dc_viewport_request') {
        dcViewportRestoreAtRef.current = Date.now();
        iframeRef.current?.contentWindow?.postMessage({
          type: '__dc_set_viewport',
          ...dcViewportRef.current,
        }, '*');
      }
    }
    function onContentSizeMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      if (!isActivePreviewIframeSource(ev.source)) return;
      const data = ev.data as ({
        type?: string;
      } & Partial<PreviewContentMeasurementResponse>) | null;
      if (!data || data.type !== 'od:preview-content-size') return;
      const latest = latestPreviewContentMeasurementRef.current;
      const frame = iframeRef.current;
      if (
        !previewContentMeasurementContextRef.current.eligible ||
        previewContentMeasurementExpectedDocumentEpochRef.current !==
          previewContentMeasurementCurrentDocumentEpochRef.current ||
        !latest ||
        latest.source !== ev.source ||
        !frame ||
        !previewMeasurementFrameIsUsable({
          connected: frame.isConnected,
          active: frame.dataset.odActive === 'true',
          frameRect: frame.getBoundingClientRect(),
          canvasRect: commentPreviewCanvasNode?.getBoundingClientRect() ?? frame.getBoundingClientRect(),
        })
      ) {
        return;
      }
      const response: PreviewContentMeasurementResponse = {
        measurementId: typeof data.measurementId === 'string' ? data.measurementId : '',
        generation: typeof data.generation === 'string' ? data.generation : '',
        documentEpoch: typeof data.documentEpoch === 'string' ? data.documentEpoch : '',
        scrollWidth: typeof data.scrollWidth === 'number' ? data.scrollWidth : null,
        clientWidth: typeof data.clientWidth === 'number' ? data.clientWidth : null,
      };
      const resolution = resolveDesktopPreviewContentMeasurement({
        request: latest.request,
        response,
        currentGeneration: previewContentMeasurementGenerationRef.current,
        latestMeasurementId: latest.request.measurementId,
        currentCanvasWidth: previewContentMeasurementContextRef.current.canvasWidth,
        currentPreviewScale: previewContentMeasurementContextRef.current.previewScale,
        confirmedContentWidth: desktopPreviewContentWidthRef.current,
        confirmedOverflow: desktopPreviewContentWidthEntryRef.current?.overflow ?? null,
      });
      if (resolution.action === 'accept') {
        setDesktopPreviewContentWidth({
          width: resolution.contentWidth,
          measuredClientWidth: resolution.measuredClientWidth,
          overflow: resolution.overflow,
        });
      } else if (resolution.action === 'remeasure-neutral') {
        setDesktopPreviewContentWidth(null);
      }
    }
    window.addEventListener('message', onMessage);
    window.addEventListener('message', onRestoreRequest);
    window.addEventListener('message', onDcViewportMessage);
    window.addEventListener('message', onContentSizeMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('message', onRestoreRequest);
      window.removeEventListener('message', onDcViewportMessage);
      window.removeEventListener('message', onContentSizeMessage);
    };
  }, [
    commentPreviewCanvasNode,
    isActivePreviewIframeSource,
    isOurPreviewIframeSource,
    setDesktopPreviewContentWidth,
    workspaceActive,
  ]);

  useEffect(() => {
    if (!workspaceActive) return;
    function onMessage(ev: MessageEvent) {
      if (!isActivePreviewIframeSource(ev.source)) return;
      const data = ev.data as { type?: unknown; fileName?: unknown } | null;
      if (
        data?.type !== 'od:preview-open-file' ||
        typeof data.fileName !== 'string' ||
        data.fileName.length > 4096 ||
        !/\.html?$/i.test(data.fileName) ||
        data.fileName.split('/').some((part) => !part || part === '.' || part === '..')
      ) {
        return;
      }
      onOpenFileReplacing?.(data.fileName, file.name);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [file.name, isActivePreviewIframeSource, onOpenFileReplacing, workspaceActive]);

  useEffect(() => {
    if (!workspaceActive) return;
    if (!effectiveDeck) {
      setSlideState(null);
      return;
    }
    setSlideState(htmlPreviewSlideState.get(previewStateKey) ?? null);
    function onMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      if (!isActivePreviewIframeSource(ev.source)) return;
      const data = ev?.data as
        | { type?: string; active?: number; count?: number }
        | null;
      if (!data || data.type !== 'od:slide-state') return;
      if (typeof data.active !== 'number' || typeof data.count !== 'number') return;
      const next = { active: data.active, count: data.count };
      setSlideStateCached(previewStateKey, next);
      setSlideState(next);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [effectiveDeck, isActivePreviewIframeSource, isOurPreviewIframeSource, previewStateKey, workspaceActive]);

  useEffect(() => {
    if (!workspaceActive) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({
      type: 'od:comment-mode',
      enabled: boardMode,
      mode: boardTool,
    }, '*');
  }, [boardMode, boardTool, srcDoc, useUrlLoadPreview, workspaceActive]);

  useEffect(() => {
    if (!workspaceActive) return;
    const target = iframeRef.current;
    const win = target?.contentWindow;
    if (!win) return;
    const verified = verifiedSrcDocTransportRef.current;
    if (
      target === srcDocPreviewIframeRef.current
      && verified?.frame === target
      && verified.generation === expectedSrcDocTransportGenerationRef.current
    ) {
      postAndConsumePreviewRuntimeState(target);
    }
    win.postMessage({ type: 'od-edit-mode', enabled: manualEditMode }, '*');
    postSelectedManualEditTargetToIframe(manualEditMode ? selectedManualEditTarget?.id ?? null : null);
  }, [
    manualEditMode,
    selectedManualEditTarget?.id,
    srcDoc,
    useUrlLoadPreview,
    postAndConsumePreviewRuntimeState,
    workspaceActive,
  ]);

  const previewStyleToIframe = useCallback((id: string, styles: Partial<ManualEditStyles>, version: number) => {
    if (!workspaceActive) return false;
    const win = iframeRef.current?.contentWindow;
    if (!win) return false;
    win.postMessage({ type: 'od-edit-preview-style', id, styles, version }, '*');
    return true;
  }, [workspaceActive]);

  function postSelectedManualEditTargetToIframe(id: string | null, target: HTMLIFrameElement | null = iframeRef.current) {
    if (!workspaceActive) return;
    const win = target?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od-edit-selected-target', id }, '*');
  }

  function syncBridgeModes(target: HTMLIFrameElement | null = iframeRef.current) {
    replayPreviewBridgeModes(target);
  }

  useEffect(() => {
    if (!workspaceActive) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:inspect-mode', enabled: inspectMode }, '*');
  }, [inspectMode, srcDoc, useUrlLoadPreview, workspaceActive]);

  // Mirror the bridge's `od:comment-targets` broadcast into
  // `liveCommentTargets` whenever EITHER Inspect or Comments mode is
  // active. The boardMode-only useEffect below still handles its
  // own comment-specific events (hover / click target / pod), but
  // the targets list itself is mode-agnostic — it's just "which
  // elements on the page carry data-od-id / data-screen-label".
  // Without this listener Inspect mode never learns the artifact's
  // annotation count, and the empty-state hint added for #890 would
  // misfire (always firing in Inspect mode, even on annotated
  // artifacts) because the comment-mode listener short-circuits on
  // `!boardMode`. Issue #890.
  useEffect(() => {
    if (!workspaceActive) return;
    if (!inspectMode && !boardMode) {
      setLiveCommentTargets((current) => (current.size > 0 ? new Map() : current));
      return;
    }
    function onMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      const data = ev.data as
        | {
            type?: string;
            targets?: Array<Partial<PreviewCommentSnapshot>>;
          }
        | null;
      if (data?.type !== 'od:comment-targets' || !Array.isArray(data.targets)) return;
      const next = new Map<string, PreviewCommentSnapshot>();
      data.targets.forEach((item) => {
        const elementId = String(item?.elementId || '');
        if (!elementId) return;
        const position = {
          x: clampBridgeCoordinate(item?.position?.x),
          y: clampBridgeCoordinate(item?.position?.y),
          width: clampBridgeCoordinate(item?.position?.width),
          height: clampBridgeCoordinate(item?.position?.height),
        };
        if (!isValidCommentOverlayPosition(position)) return;
        next.set(elementId, {
          filePath: file.name,
          elementId,
          selector: String(item?.selector || ''),
          label: String(item?.label || ''),
          text: String(item?.text || ''),
          position,
          htmlHint: String(item?.htmlHint || ''),
          style: normalizeAnnotationStyle(item?.style),
          selectionKind: 'element',
          memberCount: undefined,
          ...(typeof item?.slideIndex === 'number' ? { slideIndex: item.slideIndex } : {}),
        });
      });
      setLiveCommentTargets((current) => (
        liveCommentTargetMapsEqual(current, next) ? current : next
      ));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [inspectMode, boardMode, file.name, isOurPreviewIframeSource, workspaceActive]);

  useEffect(() => {
    setActiveCommentTarget(null);
    setHoveredCommentTarget(null);
    setLiveCommentTargets(new Map());
    setCommentDraft('');
    setActiveCommentExistingAttachments([]);
    setActiveInspectTarget(null);
    setInspectOverrides({});
    setInspectSavedAt(null);
    setInspectError(null);
    setQueuedBoardNotes([]);
    setStrokePoints([]);
    setManualEditFrozenSource(null);
    setManualEditViewportWidth(null);
    setManualEditTargets([]);
    setSelectedManualEditTarget(null);
    setManualEditPanelPosition(null);
    selectedManualEditTargetIdRef.current = null;
    setManualEditDraft(emptyManualEditDraft());
    setManualEditDraftDirty(false);
    setManualEditHistory([]);
    setManualEditUndone([]);
    setManualEditError(null);
    manualEditPendingStyleRef.current = null;
    clearManualEditStyleTimer();
  }, [file.name]);

  // Selecting a new file or turning inspect/comment-inspect off resets the panel target.
  useEffect(() => {
    if (!inspectMode && !(boardMode && boardTool === 'inspect')) {
      setActiveInspectTarget(null);
      setInspectError(null);
    }
  }, [inspectMode, boardMode, boardTool]);

  // Hydrate the host-authoritative override map from the artifact source
  // synchronously, *before* React commits a render that carries a new
  // `srcDoc` to the iframe. A `useEffect([source])` would commit the new
  // source first and only re-render with the parsed map afterwards — if
  // the iframe finishes loading the new srcDoc in that window, its
  // `onLoad` handler captures the previous file's empty/stale map in its
  // closure and posts that map back over the bridge's freshly DOM-hydrated
  // overrides, leaving the preview without saved inspect styles until the
  // next reload or mode toggle. Setting state during render is React's
  // documented escape hatch for "store a value derived from props"
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes):
  // the in-flight render is discarded and React re-renders with the
  // updated state before commit, so the new `srcDoc` and the new
  // `inspectOverrides` always commit together. After hydration the map
  // only mutates from host-driven onApply / reset callbacks below, so
  // artifact JS forging an od:inspect-overrides message cannot tamper
  // with what saveInspectToSource will persist.
  if (inspectHydratedSourceRef.current !== source) {
    inspectHydratedSourceRef.current = source;
    setInspectOverrides(typeof source === 'string' ? parseInspectOverridesFromSource(source) : {});
  }

  useEffect(() => {
    sourceRef.current = source;
    if (source == null) return;
    setManualEditDraft((current) => (
      current.fullSource === source ? current : { ...current, fullSource: source }
    ));
  }, [source]);

  useEffect(() => {
    selectedManualEditTargetIdRef.current = selectedManualEditTarget?.id ?? null;
  }, [selectedManualEditTarget?.id]);

  useEffect(() => {
    if (!workspaceActive || !boardMode) {
      setCommentCreateMode(false);
      setActiveCommentTarget((current) => (current ? null : current));
      setHoveredCommentTarget((current) => (current ? null : current));
      setActivePreviewCommentId((current) => (current ? null : current));
      setLiveCommentTargets((current) => (current.size > 0 ? new Map() : current));
      setQueuedBoardNotes((current) => (current.length > 0 ? [] : current));
      setStrokePoints((current) => (current.length > 0 ? [] : current));
      return;
    }
    const snapshotFromData = (data: Partial<PreviewCommentSnapshot>): PreviewCommentSnapshot => ({
      filePath: file.name,
      elementId: String(data.elementId || ''),
      selector: String(data.selector || ''),
      label: String(data.label || ''),
      text: String(data.text || ''),
      position: {
        x: clampBridgeCoordinate(data.position?.x),
        y: clampBridgeCoordinate(data.position?.y),
        width: clampBridgeCoordinate(data.position?.width),
        height: clampBridgeCoordinate(data.position?.height),
      },
      hoverPoint: data.hoverPoint
        ? {
            x: clampBridgeCoordinate(data.hoverPoint.x),
            y: clampBridgeCoordinate(data.hoverPoint.y),
          }
        : undefined,
      htmlHint: String(data.htmlHint || ''),
      style: normalizeAnnotationStyle(data.style),
      selectionKind: data.selectionKind === 'pod' ? 'pod' : 'element',
      memberCount: finiteBridgeInteger(data.memberCount),
      podMembers: Array.isArray(data.podMembers) ? data.podMembers : undefined,
      ...(typeof data.slideIndex === 'number' ? { slideIndex: data.slideIndex } : {}),
    });
    function onMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      const data = ev.data as (Partial<PreviewCommentSnapshot> & {
        type?: string;
        targets?: Array<Partial<PreviewCommentSnapshot>>;
        points?: StrokePoint[];
      }) | null;
      if (!data?.type) return;
      if (data.type === 'od:comment-targets' && Array.isArray(data.targets)) {
        const next = new Map<string, PreviewCommentSnapshot>();
        data.targets.forEach((item) => {
          const snapshot = snapshotFromData(item);
          if (!snapshot.elementId || !isValidCommentOverlayPosition(snapshot.position)) return;
          next.set(snapshot.elementId, snapshot);
        });
        setLiveCommentTargets((current) => (
          liveCommentTargetMapsEqual(current, next) ? current : next
        ));
        setActiveCommentTarget((current) => {
          if (!current) return null;
          if (current.selectionKind === 'pod') return current;
          const updated = next.get(current.elementId);
          if (!updated || !isValidCommentOverlayPosition(updated.position)) return null;
          return commentSnapshotEqual(current, updated) ? current : updated;
        });
        setHoveredCommentTarget((current) => {
          if (!current) return null;
          if (current.selectionKind === 'pod') return current;
          const updated = next.get(current.elementId);
          if (!updated || !isValidCommentOverlayPosition(updated.position)) return null;
          return commentSnapshotEqual(current, updated) ? current : updated;
        });
        return;
      }
      if (data.type === 'od:comment-active-target-update') {
        const snapshot = snapshotFromData(data);
        if (!snapshot.elementId || !isValidCommentOverlayPosition(snapshot.position)) return;
        // Fires on every pointermove while a target is active — skip the Map
        // clone and the active/hovered state writes when nothing changed, so a
        // steady hover doesn't re-render the whole overlay each frame.
        setLiveCommentTargets((current) => {
          const existing = current.get(snapshot.elementId);
          if (existing && commentSnapshotEqual(existing, snapshot)) return current;
          return new Map(current).set(snapshot.elementId, snapshot);
        });
        setActiveCommentTarget((current) =>
          current && current.elementId === snapshot.elementId && !commentSnapshotEqual(current, snapshot)
            ? snapshot
            : current,
        );
        setHoveredCommentTarget((current) =>
          current && current.elementId === snapshot.elementId && !commentSnapshotEqual(current, snapshot)
            ? snapshot
            : current,
        );
        return;
      }
      if (data.type === 'od:comment-leave') {
        // Already firmly on the card — nothing to dismiss.
        if (hoverCardPinnedRef.current) return;
        // The pointer left the element. It may be sliding onto the floating card
        // (which overlaps the iframe) or hopping toward an adjacent element —
        // both should keep the card up. Defer the dismiss so the card's
        // mouseenter or the next comment-hover can cancel it; only a leave with
        // nothing following actually tears the card down.
        scheduleHoverCardDismiss();
        return;
      }
      if (data.type === 'od:comment-hover') {
        const snapshot = snapshotFromData(data);
        if (!snapshot.elementId || !isValidCommentOverlayPosition(snapshot.position)) return;
        // Pointer landed on an element — cancel any deferred dismiss so moving
        // from the card back onto the element it describes keeps the card.
        cancelHoverCardDismiss();
        // Hover repeats the same snapshot per pointermove frame — keep the
        // existing state object (and skip the Map clone) when it is unchanged.
        setHoveredCommentTarget((current) =>
          current && current.elementId === snapshot.elementId && commentSnapshotEqual(current, snapshot)
            ? current
            : snapshot,
        );
        setLiveCommentTargets((current) => {
          const existing = current.get(snapshot.elementId);
          if (existing && commentSnapshotEqual(existing, snapshot)) return current;
          return new Map(current).set(snapshot.elementId, snapshot);
        });
        return;
      }
      if (data.type === 'od:comment-target') {
        const snapshot = snapshotFromData(data);
        if (!snapshot.elementId || !isValidCommentOverlayPosition(snapshot.position)) return;
        const shouldOpenComposer = boardMode || commentCreateMode;
        cancelHoverCardDismiss();
        setActiveCommentTarget((current) => (shouldOpenComposer ? snapshot : current));
        setHoveredCommentTarget(snapshot);
        setLiveCommentTargets((current) => {
          const existing = current.get(snapshot.elementId);
          if (existing && commentSnapshotEqual(existing, snapshot)) return current;
          return new Map(current).set(snapshot.elementId, snapshot);
        });
        if (shouldOpenComposer) {
          setActivePreviewCommentId(null);
          setCommentDraft('');
          setQueuedBoardNotes([]);
          setActiveCommentExistingAttachments([]);
        }
        return;
      }
      if (data.type === 'od:pod-clear') {
        setStrokePoints([]);
        return;
      }
      if (data.type === 'od:pod-stroke' && Array.isArray(data.points)) {
        setStrokePoints(
          data.points.map((point) => ({
            x: clampBridgeCoordinate(point.x),
            y: clampBridgeCoordinate(point.y),
          })),
        );
        return;
      }
      if (data.type === 'od:pod-select' && Array.isArray(data.points)) {
        const points = data.points.map((point) => ({
          x: clampBridgeCoordinate(point.x),
          y: clampBridgeCoordinate(point.y),
        }));
        setStrokePoints(points);
        const nextTarget = buildPodSnapshot({
          filePath: file.name,
          strokePoints: points,
          liveTargets: liveCommentTargetsRef.current,
        });
        if (!nextTarget) {
          setStrokePoints([]);
          return;
        }
        setActiveCommentTarget(nextTarget);
        setHoveredCommentTarget(nextTarget);
        setActivePreviewCommentId(null);
        setQueuedBoardNotes([]);
        setCommentDraft('');
        setActiveCommentExistingAttachments([]);
        setStrokePoints([]);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [activeCommentTarget, boardMode, boardTool, cancelHoverCardDismiss, commentPortalHost, file.name, isOurPreviewIframeSource, previewComments, scheduleHoverCardDismiss, workspaceActive]);

  useEffect(() => {
    if (!workspaceActive || !boardMode || !activeCommentTarget || activeCommentTarget.selectionKind === 'pod') return;
    iframeRef.current?.contentWindow?.postMessage({
      type: 'od:comment-active-target',
      elementId: activeCommentTarget.elementId,
      selector: activeCommentTarget.selector,
    }, '*');
  }, [activeCommentTarget?.elementId, activeCommentTarget?.selector, activeCommentTarget?.selectionKind, boardMode, workspaceActive]);

  useEffect(() => {
    if (!manualEditMode) {
      setManualEditTargets([]);
      setSelectedManualEditTarget(null);
      setManualEditHoverTarget(null);
      setManualEditPageStylesOpen(false);
      setManualEditPanelPosition(null);
      setManualEditDraftDirty(false);
      selectedManualEditTargetIdRef.current = null;
      manualEditSelectionDraftRef.current = null;
      manualEditTextSessionIdRef.current = null;
      manualEditTextSessionStartSequenceRef.current = null;
      manualEditTextFinishRef.current = null;
      manualEditTextCommitInFlightRef.current = null;
      manualEditTextFailedSessionIdsRef.current.clear();
      manualEditTextLatestCommitRef.current = null;
      setManualEditError(null);
      manualEditPendingStyleRef.current = null;
      if (manualEditStyleTimerRef.current) {
        clearTimeout(manualEditStyleTimerRef.current);
        manualEditStyleTimerRef.current = null;
      }
      return;
    }
    function onMessage(ev: MessageEvent) {
      if (!isRetainedPreviewIframeSource(ev.source)) return;
      const data = ev.data as ManualEditBridgeMessage | null;
      if (!data?.type) return;
      // A direct/automatic tab transition may make the viewer inactive before
      // its inline edit acknowledges the safe-exit request. Keep only those
      // commit/settlement messages live offscreen; ignore fresh interactions.
      if (
        !workspaceActive
        && data.type !== 'od-edit-text-commit'
        && data.type !== 'od-edit-text-session'
      ) return;
      if (data.type === 'od-edit-targets' && Array.isArray(data.targets)) {
        setManualEditTargets(data.targets);
        // Target broadcasts can be briefly empty while the iframe/save path is
        // settling; keep the user's inspector selection unless a fresh copy is
        // available to update its metadata.
        setSelectedManualEditTarget((current) =>
          current ? data.targets.find((target) => target.id === current.id) ?? current : current,
        );
        const selectedId = selectedManualEditTargetIdRef.current;
        if (selectedId) setTimeout(() => postSelectedManualEditTargetToIframe(selectedId), 0);
        return;
      }
      if (data.type === 'od-edit-select') {
        setManualEditHoverTarget(null);
        void selectManualEditTarget(data.target);
        return;
      }
      if (data.type === 'od-edit-hover') {
        // While an inline text edit is live, hovering must not surface or switch
        // any affordance — that instability is the other half of #3646.
        if (manualEditTextSessionIdRef.current) return;
        // Hover only surfaces a lightweight "edit params" affordance; it must
        // NOT switch the pinned inspector. The panel changes only when the
        // user clicks that affordance (or a container/image body), so moving
        // the cursor across the canvas never yanks the panel away mid-edit.
        setManualEditHoverTarget(
          data.target.id === selectedManualEditTargetIdRef.current ? null : data.target,
        );
        return;
      }
      if (data.type === 'od-edit-background') {
        // Clicking empty canvas deselects and opens the compact page-styles
        // card — only meaningful for full HTML documents.
        setManualEditHoverTarget(null);
        if (typeof source === 'string' && isManualEditFullHtmlDocument(source)) {
          void clearManualEditTargetSelection();
          setManualEditPageStylesOpen(true);
        }
        return;
      }
      if (data.type === 'od-edit-text-commit') {
        // Keep the apply promise reachable so any teardown (host- or
        // iframe-initiated) can await it and honor a failed save before tearing
        // down. It self-clears once resolved, keyed to identity so a newer
        // commit is never clobbered.
        const sessionId = String(data.id);
        const sequence = manualEditTextCommitSequenceRef.current + 1;
        manualEditTextCommitSequenceRef.current = sequence;
        const commit = applyManualEdit({
          id: sessionId,
          kind: 'set-text',
          value: String(data.value),
        }, 'Edit text');
        manualEditTextCommitInFlightRef.current = commit;
        const record: NonNullable<typeof manualEditTextLatestCommitRef.current> = {
          promise: commit,
          result: null,
          sequence,
          sessionId,
        };
        manualEditTextLatestCommitRef.current = record;
        void (async () => {
          try {
            record.result = (await commit) !== false;
          } catch {
            record.result = false;
          }
          if (record.result) {
            manualEditTextFailedSessionIdsRef.current.delete(sessionId);
          } else {
            manualEditTextFailedSessionIdsRef.current.add(sessionId);
          }
          if (manualEditTextCommitInFlightRef.current === commit) {
            manualEditTextCommitInFlightRef.current = null;
          }
        })();
        return;
      }
      if (data.type === 'od-edit-text-session') {
        const sessionId = String(data.id || '');
        if (data.active) {
          manualEditTextSessionIdRef.current = sessionId;
          manualEditTextSessionStartSequenceRef.current = manualEditTextCommitSequenceRef.current;
          return;
        }
        if (manualEditTextSessionIdRef.current === sessionId) {
          manualEditTextSessionIdRef.current = null;
          manualEditTextSessionStartSequenceRef.current = null;
        }
        const pending = manualEditTextFinishRef.current;
        if (pending) {
          // settle() awaits the in-flight commit before resolving the caller's
          // teardown, so the final edit is never dropped.
          pending(true, sessionId);
        }
        // Iframe-driven finishes (Enter / clicking another target) leave the
        // commit promise in place; it self-clears on resolution, and any later
        // teardown still awaits it via settlePendingManualEditCommit so a failed
        // save is never silently torn down.
        return;
      }
      if (data.type === 'od-edit-drag-commit') {
        // Free drag-to-reposition dropped: route the new translate() through
        // the same pending-style pipeline the inspector uses, so the panel's
        // Save persists it alongside every other edit in this session.
        const id = String(data.id || '');
        if (!id) return;
        const transform = String(data.transform || '');
        const dragStyles: Partial<ManualEditStyles> = { transform };
        if (typeof data.display === 'string' && data.display) dragStyles.display = data.display;
        void handleManualEditStyleChange(id, dragStyles, 'Move element');
        if (selectedManualEditTargetIdRef.current === id) {
          setManualEditDraft((current) => ({ ...current, styles: { ...current.styles, ...dragStyles } }));
          setManualEditDraftDirty(true);
        }
        return;
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isRetainedPreviewIframeSource, manualEditMode, source, workspaceActive]);

  function nextManualEditPreviewVersion(): number {
    manualEditPreviewVersionRef.current += 1;
    return manualEditPreviewVersionRef.current;
  }

  function inspectorManualEditStyles(target: ManualEditTarget, baseSource: string): ManualEditStyles {
    const inlineStyles = readManualEditStyles(baseSource, target.id);
    return mergeManualEditInspectorStyles(inlineStyles, target.styles);
  }

  function reconcileManualEditStyleSave(
    id: string,
    savedStyles: Partial<ManualEditStyles>,
    savedSource: string,
  ) {
    if (id !== '__body__' && !readManualEditOuterHtml(savedSource, id)) {
      setManualEditError('The selected target no longer exists in the saved source. Refreshing the preview.');
      setSelectedManualEditTarget(null);
      setManualEditFrozenSource(null);
      setReloadKey((key) => key + 1);
      return;
    }
    const sourceStyles = readManualEditStyles(savedSource, id);
    const supersededStyles = manualEditPendingStyleRef.current?.id === id
      ? manualEditPendingStyleRef.current.styles
      : {};
    const repairStyles: Partial<ManualEditStyles> = {};
    for (const key of Object.keys(savedStyles) as Array<keyof ManualEditStyles>) {
      if (Object.prototype.hasOwnProperty.call(supersededStyles, key)) continue;
      const sourceValue = manualEditInspectorStyleValue(key, sourceStyles[key] ?? '');
      const savedValue = savedStyles[key] ?? '';
      if (manualEditPersistedValueMatchesSavedSnapshot(key, sourceValue, savedValue)) continue;
      repairStyles[key] = sourceValue;
    }
    if (Object.keys(repairStyles).length === 0) return;
    previewStyleToIframe(id, repairStyles, nextManualEditPreviewVersion());
    setManualEditDraft((current) => ({
      ...current,
      styles: { ...current.styles, ...repairStyles },
    }));
    setManualEditError('Saved styles differed from the active preview. Reconciled the selected target from source.');
  }

  function clearManualEditStyleTimer() {
    if (!manualEditStyleTimerRef.current) return;
    clearTimeout(manualEditStyleTimerRef.current);
    manualEditStyleTimerRef.current = null;
  }

  function cancelManualEditPendingStyles(id: string, keys: Array<keyof ManualEditStyles>) {
    const nextPending = cancelManualEditPendingStyleSnapshot(manualEditPendingStyleRef.current, id, keys);
    if (!nextPending) {
      manualEditPendingStyleRef.current = null;
      clearManualEditStyleTimer();
      return;
    }
    manualEditPendingStyleRef.current = nextPending;
  }

  async function handleManualEditStyleChange(id: string, styles: Partial<ManualEditStyles>, label: string) {
    const version = nextManualEditPreviewVersion();
    const currentPending = manualEditPendingStyleRef.current;
    const pendingStyles = currentPending?.id === id
      ? { ...currentPending.styles, ...styles }
      : styles;
    const pending: ManualEditPendingStyleSave = { id, styles: pendingStyles, label, version };
    manualEditPendingStyleRef.current = pending;
    setManualEditError(null);
    previewStyleToIframe(id, styles, version);
  }

  async function flushManualEditStyleSave(): Promise<boolean> {
    const pending = manualEditPendingStyleRef.current;
    if (!pending) return true;
    if (manualEditSavingRef.current) return false;
    const ok = await applyManualEdit(
      { id: pending.id, kind: 'set-style', styles: pending.styles },
      pending.label,
    );
    // Keep the exact failed snapshot for retry. If another style change landed
    // while this save was in flight, it has already replaced/extended the ref
    // and must likewise remain pending.
    if (ok && manualEditPendingStyleRef.current === pending) {
      manualEditPendingStyleRef.current = null;
    }
    return ok;
  }

  function cancelManualEditStyleDraft() {
    const pending = manualEditPendingStyleRef.current;
    if (!pending) return;
    clearManualEditStyleTimer();
    manualEditPendingStyleRef.current = null;
    const base = sourceRef.current ?? '';
    const target = pending.id === '__body__'
      ? null
      : selectedManualEditTarget?.id === pending.id
        ? selectedManualEditTarget
        : manualEditTargets.find((item) => item.id === pending.id) ?? null;
    const sourceStyles = target
      ? inspectorManualEditStyles(target, base)
      : readManualEditStyles(base, pending.id);
    const resetStyles = MANUAL_EDIT_STYLE_PROPS.reduce<Partial<ManualEditStyles>>((acc, key) => {
      acc[key] = sourceStyles[key] ?? '';
      return acc;
    }, {});
    previewStyleToIframe(pending.id, resetStyles, nextManualEditPreviewVersion());
    if (!target || target.id === selectedManualEditTarget?.id) {
      setManualEditDraft((current) => ({
        ...current,
        styles: target ? sourceStyles : current.styles,
        fullSource: base,
      }));
    }
    setManualEditError(null);
  }

  // Ends the iframe's inline text edit and resolves only once it acks (and any
  // resulting commit has been applied). Callers that tear down edit state must
  // await this so the final edit is never dropped — the #3647 exit-path bug.
  // A timeout backstops a detached iframe so teardown can never hang.
  // Resolves to whether the session ended cleanly: true when there was nothing
  // to commit or the commit succeeded, false when the pending text commit
  // failed (applyManualEdit returned false / threw). Callers that tear down
  // edit state must honor a false result — keep edit mode open and preserve the
  // error so a failed save never looks like a successful one (#4291 review).
  function finishManualEditTextSession(commit: boolean): Promise<boolean> {
    const win = iframeRef.current?.contentWindow;
    const sessionId = manualEditTextSessionIdRef.current;
    if (!sessionId) return Promise.resolve(true);
    if (!win) return Promise.resolve(false);
    const sessionStartSequence = manualEditTextSessionStartSequenceRef.current
      ?? manualEditTextCommitSequenceRef.current;
    const commitSequenceAtFinish = manualEditTextCommitSequenceRef.current;
    const commitAtFinish = manualEditTextLatestCommitRef.current;
    const sameSessionCommitAtFinish = commitAtFinish?.sessionId === sessionId
      && commitAtFinish.sequence > sessionStartSequence
      ? commitAtFinish
      : null;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const settle = (acknowledged = false, acknowledgedSessionId?: string) => {
        if (acknowledged && acknowledgedSessionId !== sessionId) return;
        if (settled) return;
        settled = true;
        if (timer) { clearTimeout(timer); timer = null; }
        if (manualEditTextFinishRef.current === settle) manualEditTextFinishRef.current = null;
        // Wait out the in-flight commit before resolving, so the final edit is
        // persisted before teardown even if the timeout backstop won the race
        // against the iframe's ack. The commit clears its own ref on resolution.
        const latestCommit = manualEditTextLatestCommitRef.current;
        const currentSessionCommit = latestCommit
          && latestCommit.sequence > commitSequenceAtFinish
          && latestCommit.sessionId === sessionId
          ? latestCommit
          : null;
        const relevantCommit = currentSessionCommit ?? sameSessionCommitAtFinish;
        void (async () => {
          let committed = acknowledged;
          try {
            // applyManualEdit resolves false when the save fails (or the source
            // changed externally); surface that so callers can abort teardown.
            if (relevantCommit) {
              committed = relevantCommit.result
                ?? (await relevantCommit.promise) !== false;
              relevantCommit.result = committed;
              if (committed) {
                manualEditTextFailedSessionIdsRef.current.delete(relevantCommit.sessionId);
              } else {
                manualEditTextFailedSessionIdsRef.current.add(relevantCommit.sessionId);
              }
            }
          } catch {
            committed = false;
          }
          // A timeout by itself does not prove that the iframe ended the
          // editing session. Keep the session live so every later teardown
          // attempt remains fail-closed until the iframe acks or a matching
          // commit provides a terminal witness. Clearing it on a bare timeout
          // lets a second navigation destroy the iframe and lose its DOM edit.
          if ((acknowledged || relevantCommit)
            && manualEditTextSessionIdRef.current === sessionId) {
            manualEditTextSessionIdRef.current = null;
            manualEditTextSessionStartSequenceRef.current = null;
          }
          resolve(committed);
        })();
      };
      manualEditTextFinishRef.current = settle;
      win.postMessage({ type: 'od-edit-text-finish', commit }, '*');
      // Backstop a detached iframe so teardown can never hang; the ack path
      // clears this timer when it wins.
      timer = setTimeout(() => settle(false), 1500);
    });
  }

  // Settles whatever inline text edit is still pending before teardown and
  // reports whether it committed cleanly: the live session if one is active,
  // otherwise an in-flight commit left by an iframe-driven finish (Enter /
  // click-another-target). Returns false on a failed commit so callers keep
  // edit mode open with the error rather than tearing down through it (#4291).
  async function settlePendingManualEditCommit(commitActiveSession = true): Promise<boolean> {
    if (manualEditTextSessionIdRef.current) {
      return finishManualEditTextSession(commitActiveSession);
    }
    const latestCommit = manualEditTextLatestCommitRef.current;
    if (latestCommit && latestCommit.result == null) {
      try {
        latestCommit.result = (await latestCommit.promise) !== false;
      } catch {
        latestCommit.result = false;
      }
      if (latestCommit.result) {
        manualEditTextFailedSessionIdsRef.current.delete(latestCommit.sessionId);
      } else {
        manualEditTextFailedSessionIdsRef.current.add(latestCommit.sessionId);
      }
    }
    return manualEditTextFailedSessionIdsRef.current.size === 0;
  }

  async function exitManualEditModeAfterFlush(): Promise<boolean> {
    // A failed text commit must keep edit mode open with its error visible,
    // rather than tearing down (which would clear the error) and looking saved.
    if (!(await settlePendingManualEditCommit())) {
      return false;
    }
    // Finishing the currently active session may succeed while another text
    // session still has an unpersisted Enter commit. Only a successful retry
    // for that same session consumes its failure witness.
    if (manualEditTextFailedSessionIdsRef.current.size > 0) return false;
    const ok = await flushManualEditStyleSave();
    if (!ok) return false;
    setManualEditPanelPosition(null);
    setManualEditMode(false);
    return true;
  }

  const exitManualEditModeAfterFlushRef = useRef(exitManualEditModeAfterFlush);
  exitManualEditModeAfterFlushRef.current = exitManualEditModeAfterFlush;
  const manualEditSafeExitInFlightRef = useRef<Promise<boolean> | null>(null);
  const requestManualEditSafeExitRef = useRef<() => Promise<boolean>>(async () => true);
  requestManualEditSafeExitRef.current = () => {
    if (manualEditSafeExitInFlightRef.current) return manualEditSafeExitInFlightRef.current;
    const pending = exitManualEditModeAfterFlushRef.current().finally(() => {
      if (manualEditSafeExitInFlightRef.current === pending) {
        manualEditSafeExitInFlightRef.current = null;
      }
    });
    manualEditSafeExitInFlightRef.current = pending;
    return pending;
  };
  useEffect(() => {
    if (!manualEditMode) {
      onManualEditExitHandlerChange?.(file.name, null);
      return;
    }
    const handler = () => requestManualEditSafeExitRef.current();
    onManualEditExitHandlerChange?.(file.name, handler);
    return () => onManualEditExitHandlerChange?.(file.name, null);
  }, [file.name, manualEditMode, onManualEditExitHandlerChange]);
  useEffect(() => {
    if (workspaceActive || !manualEditMode) return;
    void requestManualEditSafeExitRef.current();
  }, [manualEditMode, workspaceActive]);

  // Clears the hover affordance and re-arms the iframe's per-element hover
  // dedupe so re-entering the same element re-announces it. Called from the
  // workspace's own mouseleave (host-side), NOT the iframe's mouseleave — the
  // affordance overlays the iframe, so reacting to the iframe leaving would
  // yank it out from under the cursor and strobe on/off.
  function clearManualEditHover() {
    setManualEditHoverTarget(null);
    const win = iframeRef.current?.contentWindow;
    if (win) win.postMessage({ type: 'od-edit-hover-reset' }, '*');
  }

  async function selectManualEditTarget(target: ManualEditTarget) {
    setManualEditPageStylesOpen(false);
    if (manualEditPendingStyleRef.current?.id !== target.id) cancelManualEditStyleDraft();
    const base = sourceRef.current ?? '';
    const nextDraft = manualEditDraftForTarget(target, base);
    selectedManualEditTargetIdRef.current = target.id;
    manualEditSelectionDraftRef.current = { id: target.id, draft: nextDraft };
    setSelectedManualEditTarget(target);
    setManualEditDraft(nextDraft);
    setManualEditDraftDirty(false);
    setManualEditError(null);
  }

  function manualEditDraftForTarget(target: ManualEditTarget, base: string): ManualEditDraft {
    const fields = readManualEditFields(base, target.id);
    return {
      text: fields.text ?? target.fields.text ?? target.text,
      href: fields.href ?? target.fields.href ?? '',
      src: fields.src ?? target.fields.src ?? '',
      alt: fields.alt ?? target.fields.alt ?? '',
      styles: inspectorManualEditStyles(target, base),
      attributesText: JSON.stringify(readManualEditAttributes(base, target.id), null, 2),
      outerHtml: readManualEditOuterHtml(base, target.id) || target.outerHtml,
      fullSource: base,
    };
  }

  async function clearManualEditTargetSelection() {
    // If an inline edit is still live (e.g. clearing the selection from the
    // panel mid-edit), commit it first so it is not lost. Keep the selection
    // and the error if that commit fails.
    if (!(await settlePendingManualEditCommit())) {
      return;
    }
    cancelManualEditStyleDraft();
    selectedManualEditTargetIdRef.current = null;
    manualEditSelectionDraftRef.current = null;
    manualEditTextSessionIdRef.current = null;
    manualEditTextSessionStartSequenceRef.current = null;
    setSelectedManualEditTarget(null);
    setManualEditPanelPosition(null);
    setManualEditDraft(emptyManualEditDraft(sourceRef.current ?? ''));
    setManualEditDraftDirty(false);
    setManualEditError(null);
  }

  // The inspector is scoped to one element (or the page). Closing it should
  // only collapse the panel and keep the user in edit mode — exiting edit is
  // the toolbar toggle's job. Dismiss flushes any in-flight tweak first so
  // nothing is lost; cancel reverts the in-flight unsaved tweak instead.
  async function dismissManualEditPanel() {
    // Closing the panel must not swallow a failed text commit: keep it open
    // with the error if the pending edit could not be saved.
    if (!(await settlePendingManualEditCommit())) {
      return;
    }
    const ok = await flushManualEditStyleSave();
    if (!ok) return;
    if (selectedManualEditTarget) void clearManualEditTargetSelection();
    else setManualEditPageStylesOpen(false);
  }

  function manualEditContentPatchForDraft(
    target: ManualEditTarget,
    draft: ManualEditDraft,
    base: string,
  ): { patch: ManualEditPatch; label: string } | null {
    const fields = readManualEditFields(base, target.id);
    if (target.kind === 'text' || target.kind === 'token') {
      const currentText = fields.text ?? target.fields.text ?? target.text;
      if (draft.text !== currentText) {
        return { patch: { id: target.id, kind: 'set-text', value: draft.text }, label: t('manualEdit.applyContent') };
      }
      return null;
    }
    if (target.kind === 'link') {
      const currentText = fields.text ?? target.fields.text ?? target.text;
      const currentHref = fields.href ?? target.fields.href ?? '';
      if (draft.text !== currentText || draft.href !== currentHref) {
        return { patch: { id: target.id, kind: 'set-link', text: draft.text, href: draft.href }, label: t('manualEdit.applyContent') };
      }
      return null;
    }
    if (target.kind === 'image') {
      const currentSrc = fields.src ?? target.fields.src ?? '';
      const currentAlt = fields.alt ?? target.fields.alt ?? '';
      if (draft.src !== currentSrc || draft.alt !== currentAlt) {
        return { patch: { id: target.id, kind: 'set-image', src: draft.src, alt: draft.alt }, label: t('manualEdit.applyContent') };
      }
      return null;
    }
    const currentOuterHtml = readManualEditOuterHtml(base, target.id) || target.outerHtml;
    if (draft.outerHtml !== currentOuterHtml) {
      return { patch: { id: target.id, kind: 'set-outer-html', html: draft.outerHtml }, label: t('manualEdit.applyHtml') };
    }
    return null;
  }

  async function saveManualEditPanelDraft() {
    const selectedTarget = selectedManualEditTarget;
    const contentPatchBeforeText = selectedTarget
      ? manualEditContentPatchForDraft(selectedTarget, manualEditDraft, sourceRef.current ?? '')
      : null;
    const panelContentChanged = contentPatchBeforeText !== null;
    const textCommitSequenceBeforeSave = manualEditTextCommitSequenceRef.current;
    const hadTextCommitInFlight = Boolean(manualEditTextCommitInFlightRef.current);
    if (!(await settlePendingManualEditCommit(!panelContentChanged))) return;
    const inlineTextCommitted =
      hadTextCommitInFlight ||
      manualEditTextCommitSequenceRef.current !== textCommitSequenceBeforeSave;
    if (selectedTarget && (panelContentChanged || !inlineTextCommitted)) {
      const base = sourceRef.current ?? '';
      const contentPatch = manualEditContentPatchForDraft(selectedTarget, manualEditDraft, base);
      if (contentPatch && !(await applyManualEdit(contentPatch.patch, contentPatch.label))) return;
    }
    const ok = await flushManualEditStyleSave();
    if (!ok) return;
    if (selectedManualEditTarget) void clearManualEditTargetSelection();
    else setManualEditPageStylesOpen(false);
  }

  async function resetManualEditPanelDraft() {
    if (manualEditTextSessionIdRef.current) await finishManualEditTextSession(false);
    cancelManualEditStyleDraft();
    if (!selectedManualEditTarget) {
      setManualEditDraft(emptyManualEditDraft(sourceRef.current ?? ''));
      setManualEditError(null);
      return;
    }
    const snapshot = manualEditSelectionDraftRef.current?.id === selectedManualEditTarget.id
      ? manualEditSelectionDraftRef.current.draft
      : manualEditDraftForTarget(selectedManualEditTarget, sourceRef.current ?? '');
    const base = sourceRef.current ?? '';
    const currentOuterHtml = readManualEditOuterHtml(base, selectedManualEditTarget.id);
    if (snapshot.outerHtml && currentOuterHtml && snapshot.outerHtml !== currentOuterHtml) {
      const ok = await applyManualEdit(
        { id: selectedManualEditTarget.id, kind: 'set-outer-html', html: snapshot.outerHtml },
        'Reset element',
      );
      if (!ok) return;
    }
    const refreshedBase = sourceRef.current ?? base;
    setManualEditDraft({
      ...snapshot,
      fullSource: refreshedBase,
      styles: inspectorManualEditStyles(selectedManualEditTarget, refreshedBase),
    });
    setManualEditDraftDirty(false);
    setManualEditError(null);
    postSelectedManualEditTargetToIframe(selectedManualEditTarget.id);
  }

  async function cancelManualEditPanel() {
    if (manualEditTextSessionIdRef.current) await finishManualEditTextSession(false);
    if (selectedManualEditTarget) {
      void clearManualEditTargetSelection();
    } else {
      cancelManualEditStyleDraft();
      setManualEditPageStylesOpen(false);
    }
  }

  async function applyManualEdit(patch: ManualEditPatch, label: string): Promise<boolean> {
    if (manualEditSavingRef.current) return false;
    if (sourceRef.current == null) return false;
    manualEditSavingRef.current = true;
    setManualEditSaving(true);
    setManualEditError(null);
    try {
      const baseSource = sourceRef.current;
      const result = applyManualEditPatch(baseSource, patch);
      if (!result.ok) {
        setManualEditError(result.error ?? 'Could not apply edit.');
        return false;
      }
      if (!(await confirmManualEditHistorySource(
        baseSource,
        'The file changed outside manual edit mode. Refreshing before applying manual edits.',
      ))) return false;
      const parentVersionId = await resolveManualEditParentVersionId(baseSource);
      const saved = await writeProjectTextFileDetailed(projectId, file.name, result.source, {
        artifactManifest: file.artifactManifest,
        versionSource: 'manual',
        versionLabel: label,
        ...(parentVersionId ? { parentVersionId } : {}),
      }, workspaceContext);
      if (!saved.ok) {
        const status = 'status' in saved ? saved.status : undefined;
        const code = 'code' in saved ? saved.code : undefined;
        const message = 'message' in saved ? saved.message : 'Unknown save error';
        setManualEditError(
          `Could not save the edited file${status ? ` (${status}${code ? ` ${code}` : ''})` : ''}: ${message}`,
        );
        return false;
      }
      const entry: ManualEditHistoryEntry = {
        id: `${Date.now()}-${manualEditHistory.length}`,
        label,
        patch,
        beforeSource: baseSource,
        afterSource: result.source,
        createdAt: Date.now(),
      };
      // A committed content patch rewrites manualEditFrozenSource below, which
      // rebuilds the preview srcDoc and reloads the iframe from the top.
      // Snapshot the scroll position first so the post-reload restore path
      // (the srcDoc effect + the bridge's od:preview-scroll-request round
      // trip) puts the user back where they were. The edit-entry snapshot has
      // usually expired by save time, and without a fresh one the new
      // document's initial 0/0 scroll report clobbers the last-known
      // position (#92). set-style patches stream live via postMessage and
      // never reload, so they don't need (or take) a snapshot.
      if (patch.kind !== 'set-style') {
        capturePreviewScrollPosition();
      }
      setSource(result.source);
      sourceRef.current = result.source;
      setInlinedSource(null);
      if (patch.kind !== 'set-style') {
        setManualEditFrozenSource(result.source);
      }
      setManualEditHistory((current) => [entry, ...current]);
      setManualEditUndone([]);
      setManualEditDraft((current) => ({ ...current, fullSource: result.source }));
      if (patch.kind === 'set-text') {
        setSelectedManualEditTarget((current) => current?.id === patch.id
          ? { ...current, text: patch.value, fields: { ...current.fields, text: patch.value } }
          : current);
        setManualEditDraft((current) => ({ ...current, text: patch.value, fullSource: result.source }));
      } else if (patch.kind === 'set-link') {
        setSelectedManualEditTarget((current) => current?.id === patch.id
          ? { ...current, text: patch.text, fields: { ...current.fields, text: patch.text, href: patch.href } }
          : current);
        setManualEditDraft((current) => ({ ...current, text: patch.text, href: patch.href, fullSource: result.source }));
      } else if (patch.kind === 'set-image') {
        setSelectedManualEditTarget((current) => current?.id === patch.id
          ? { ...current, fields: { ...current.fields, src: patch.src, alt: patch.alt } }
          : current);
        setManualEditDraft((current) => ({ ...current, src: patch.src, alt: patch.alt, fullSource: result.source }));
      } else if (patch.kind === 'remove-element') {
        if (manualEditPendingStyleRef.current?.id === patch.id) {
          manualEditPendingStyleRef.current = null;
          clearManualEditStyleTimer();
        }
        selectedManualEditTargetIdRef.current = null;
        manualEditSelectionDraftRef.current = null;
        setSelectedManualEditTarget(null);
        setManualEditTargets((current) => current.filter((target) => target.id !== patch.id));
        setManualEditDraft(emptyManualEditDraft(result.source));
        setManualEditDraftDirty(false);
        postSelectedManualEditTargetToIframe(null);
      } else {
        setManualEditDraft((current) => ({ ...current, fullSource: result.source }));
      }
      if (
        patch.kind !== 'remove-element' &&
        patch.kind !== 'set-token' &&
        patch.kind !== 'set-full-source' &&
        selectedManualEditTargetIdRef.current === patch.id
      ) {
        setManualEditDraftDirty(true);
      }
      if (patch.kind === 'set-style') {
        reconcileManualEditStyleSave(patch.id, patch.styles, result.source);
      }
      setManualEditError(null);
      await onFileSaved?.();
      return true;
    } finally {
      manualEditSavingRef.current = false;
      setManualEditSaving(false);
    }
  }

  async function confirmManualEditHistorySource(expectedSource: string, message: string): Promise<boolean> {
    const persisted = await fetchProjectFileText(projectId, file.name, {
      cache: 'no-store',
      cacheBustKey: Date.now(),
      workspaceContext,
    });
    if (persisted == null || persisted === expectedSource) return true;
    setSource(persisted);
    sourceRef.current = persisted;
    setInlinedSource(null);
    setManualEditHistory([]);
    setManualEditUndone([]);
    manualEditPendingStyleRef.current = null;
    setManualEditDraft((current) => ({ ...current, fullSource: persisted }));
    setManualEditError(message);
    return false;
  }

  function describeManualEditSaveFailure(
    prefix: string,
    saved: Exclude<Awaited<ReturnType<typeof writeProjectTextFileDetailed>>, { ok: true }>,
  ): string {
    const status = saved.status ? ` (${saved.status}${saved.code ? ` ${saved.code}` : ''})` : '';
    return `${prefix}${status}: ${saved.message}`;
  }

  async function undoManualEdit() {
    if (manualEditSavingRef.current) return;
    const [latest, ...rest] = manualEditHistory;
    if (!latest) return;
    manualEditSavingRef.current = true;
    setManualEditSaving(true);
    try {
      if (!(await confirmManualEditHistorySource(
        latest.afterSource,
        'The file changed outside manual edit mode. History was cleared to avoid overwriting newer content.',
      ))) return;
      const parentVersionId = await resolveManualEditParentVersionId(latest.afterSource);
      const saved = await writeProjectTextFileDetailed(projectId, file.name, latest.beforeSource, {
        artifactManifest: file.artifactManifest,
        versionSource: 'manual',
        versionLabel: `Undo ${latest.label}`,
        ...(parentVersionId ? { parentVersionId } : {}),
      }, workspaceContext);
      if (!saved.ok) {
        setManualEditError(describeManualEditSaveFailure('Could not save the undo result', saved));
        return;
      }
      // Same srcDoc rebuild as a committed patch — keep the scroll position
      // across the reload (#92).
      capturePreviewScrollPosition();
      setSource(latest.beforeSource);
      sourceRef.current = latest.beforeSource;
      setInlinedSource(null);
      setManualEditFrozenSource(latest.beforeSource);
      setManualEditHistory(rest);
      setManualEditUndone((current) => [latest, ...current]);
      setManualEditDraft((current) => ({ ...current, fullSource: latest.beforeSource }));
      await onFileSaved?.();
    } finally {
      manualEditSavingRef.current = false;
      setManualEditSaving(false);
    }
  }

  async function redoManualEdit() {
    if (manualEditSavingRef.current) return;
    const [latest, ...rest] = manualEditUndone;
    if (!latest) return;
    manualEditSavingRef.current = true;
    setManualEditSaving(true);
    try {
      if (!(await confirmManualEditHistorySource(
        latest.beforeSource,
        'The file changed outside manual edit mode. History was cleared to avoid overwriting newer content.',
      ))) return;
      const parentVersionId = await resolveManualEditParentVersionId(latest.beforeSource);
      const saved = await writeProjectTextFileDetailed(projectId, file.name, latest.afterSource, {
        artifactManifest: file.artifactManifest,
        versionSource: 'manual',
        versionLabel: `Redo ${latest.label}`,
        ...(parentVersionId ? { parentVersionId } : {}),
      }, workspaceContext);
      if (!saved.ok) {
        setManualEditError(describeManualEditSaveFailure('Could not save the redo result', saved));
        return;
      }
      // Same srcDoc rebuild as a committed patch — keep the scroll position
      // across the reload (#92).
      capturePreviewScrollPosition();
      setSource(latest.afterSource);
      sourceRef.current = latest.afterSource;
      setInlinedSource(null);
      setManualEditFrozenSource(latest.afterSource);
      setManualEditUndone(rest);
      setManualEditHistory((current) => [latest, ...current]);
      setManualEditDraft((current) => ({ ...current, fullSource: latest.afterSource }));
      await onFileSaved?.();
    } finally {
      manualEditSavingRef.current = false;
      setManualEditSaving(false);
    }
  }

  // Inspect-mode picker: same `od:comment-target` payload, different sink.
  // The bridge tags the message with a computed-style snapshot so the panel
  // can show real starting values for color / typography / spacing / radius.
  useEffect(() => {
    if (!workspaceActive || !inspectMode) return;
    function onMessage(ev: MessageEvent) {
      if (!isOurPreviewIframeSource(ev.source)) return;
      const data = ev.data as
        | {
            type?: string;
            elementId?: string;
            selector?: string;
            label?: string;
            text?: string;
            style?: InspectStyleSnapshot;
            clickedDescendant?: Partial<InspectClickedDescendant>;
          }
        | null;
      if (!data || data.type !== 'od:comment-target') return;
      if (!data.elementId || !data.selector) return;
      const clickedDescendant =
        data.clickedDescendant && typeof data.clickedDescendant === 'object'
          ? {
              label: String(data.clickedDescendant.label || ''),
              text: String(data.clickedDescendant.text || ''),
            }
          : null;
      setActiveInspectTarget({
        elementId: String(data.elementId),
        selector: String(data.selector),
        label: String(data.label || ''),
        text: String(data.text || ''),
        style: data.style && typeof data.style === 'object' ? data.style : {},
        ...(clickedDescendant ? { clickedDescendant } : {}),
      });
      setInspectError(null);
      setInspectSavedAt(null);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [inspectMode, isOurPreviewIframeSource, workspaceActive]);

  function postSlide(action: 'next' | 'prev' | 'first' | 'last' | 'go', index?: number) {
    // Track prev/next here so every entry point (top toolbar, floating nav,
    // more-menu, keyboard) reports a single deck_viewer slide move. Tracked on
    // intent, before the iframe-readiness guard below.
    if (action === 'prev' || action === 'next') {
      fireDeckViewerClick(action === 'prev' ? 'slide_prev' : 'slide_next', {
        slide_index: activeDeckSlideIndex,
        slide_count: deckSlideTotal,
      });
    }
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({
      type: 'od:slide',
      action,
      ...(action === 'go' && typeof index === 'number' ? { index } : {}),
    }, '*');
  }

  function goToSlide(index: number) {
    if (!Number.isFinite(index) || index < 0) return;
    const target = Math.floor(index);
    const count = Math.max(deckSlideCount, target + 1);
    setSlideStateCached(previewStateKey, { active: target, count });
    setSlideState({ active: target, count });
    postSlide('go', target);
  }

  function syncCachedSlideStateToIframe(target: HTMLIFrameElement | null = iframeRef.current) {
    const active = htmlPreviewSlideState.get(previewStateKey)?.active;
    const win = target?.contentWindow;
    if (!win || typeof active !== 'number') return;
    win.postMessage({ type: 'od:slide', action: 'go', index: active }, '*');
  }

  function fireSpeakerNotesSaveResult(
    editSurface: 'preview' | 'presenter',
    result: 'success' | 'failed',
    hasContent: boolean,
    errorCode?: string,
  ) {
    trackSpeakerNotesSaveResult(analytics.track, {
      page_name: 'artifact',
      area: 'deck_viewer',
      edit_surface: editSurface,
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
      slide_count: deckSlideTotal,
      has_content: hasContent,
      result,
      ...(errorCode ? { error_code: errorCode } : {}),
    });
  }

  async function saveSpeakerNotes(
    nextNotes: readonly string[],
    options?: { editSurface?: 'preview' | 'presenter' },
  ) {
    const editSurface = options?.editSurface ?? 'preview';
    const currentSource = sourceRef.current ?? source;
    if (!currentSource) return false;
    const normalized = normalizeSpeakerNotes(nextNotes, Math.max(deckSlideCount, nextNotes.length));
    const nextSource = upsertSpeakerNotesInHtml(currentSource, normalized);
    // "has content" = the note for the slide being edited is non-empty, so we
    // can separate real authoring from clearing a note.
    const hasContent = (normalized[activeDeckSlideIndex] ?? '').trim().length > 0;
    setSpeakerNotesSaving(true);
    setSpeakerNotesStatus(null);
    try {
      const saved = await writeProjectTextFile(projectId, file.name, nextSource, {
        artifactManifest: file.artifactManifest,
      }, workspaceContext);
      if (!saved) throw new Error('speaker_notes_save_failed');
      setSource(nextSource);
      sourceRef.current = nextSource;
      setInlinedSource(null);
      setSpeakerNotesStatus('saved');
      await onFileSaved?.();
      fireSpeakerNotesSaveResult(editSurface, 'success', hasContent);
      return true;
    } catch (err) {
      console.error('[speaker-notes] save failed:', err);
      setSpeakerNotesStatus('error');
      fireSpeakerNotesSaveResult(
        editSurface,
        'failed',
        hasContent,
        err instanceof Error ? err.message : 'speaker_notes_save_failed',
      );
      return false;
    } finally {
      setSpeakerNotesSaving(false);
    }
  }

  async function saveActiveSpeakerNote(options?: { close?: boolean }) {
    const next = normalizeSpeakerNotes(speakerNotes, Math.max(deckSlideCount, activeDeckSlideIndex + 1));
    while (next.length <= activeDeckSlideIndex) next.push('');
    next[activeDeckSlideIndex] = speakerNotesDraft;
    const ok = await saveSpeakerNotes(next, { editSurface: 'preview' });
    if (ok && options?.close !== false) setSpeakerNotesEditMode(false);
    return ok;
  }

  function beginSpeakerNotesEdit() {
    fireDeckViewerClick('speaker_notes_edit', {
      slide_index: activeDeckSlideIndex,
      slide_count: deckSlideTotal,
    });
    setSpeakerNotesEditMode(true);
    setSpeakerNotesDraft(activeSpeakerNote);
    setSpeakerNotesStatus(null);
  }

  function openPresenterWindow() {
    if (!deckVisualSource || typeof window === 'undefined') return;
    const count = Math.max(deckSlideCount, speakerNotes.length, 1);
    const presenterPreviewHtmlBySlide = Array.from({ length: count }, (_, index) => buildSrcdoc(deckVisualSource, {
      deck: true,
      baseHref: srcDocBaseHref,
      initialSlideIndex: index,
      hideDeckChrome: true,
      previewFocusGuard: true,
    }));
    const popupFeatures = [
      'popup',
      `width=${PRESENTER_WINDOW_INITIAL_WIDTH}`,
      `height=${PRESENTER_WINDOW_INITIAL_HEIGHT}`,
      `minWidth=${PRESENTER_WINDOW_MIN_WIDTH}`,
      `minHeight=${PRESENTER_WINDOW_MIN_HEIGHT}`,
    ].join(',');
    const popup = window.open('', `od-presenter-${projectId}-${file.name}`, popupFeatures);
    if (!popup) return;
    presenterWindowRef.current = popup;
    const html = buildSpeakerNotesPresenterHtml({
      previewHtml: presenterPreviewHtmlBySlide[0] ?? '',
      previewHtmlBySlide: presenterPreviewHtmlBySlide,
      title: exportTitle,
      projectId,
      fileName: file.name,
      notes: speakerNotes,
      initialSlideIndex: activeDeckSlideIndex,
      slideCount: count,
      labels: {
        title: t('fileViewer.speakerNotes'),
        edit: t('fileViewer.speakerNotesEdit'),
        save: t('fileViewer.speakerNotesSave'),
        pause: t('fileViewer.presenterPause'),
        resume: t('fileViewer.presenterResume'),
        reset: t('fileViewer.presenterReset'),
        previous: t('fileViewer.presenterPrevious'),
        next: t('fileViewer.presenterNext'),
        empty: t('fileViewer.speakerNotesEmpty'),
        slide: t('fileViewer.speakerNotesSlide'),
      },
    });
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
  }

  function postInspectSet(elementId: string, selector: string, prop: string, value: string) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      { type: 'od:inspect-set', elementId, selector, prop, value },
      '*',
    );
  }

  function postInspectReset(elementId?: string) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:inspect-reset', elementId }, '*');
  }

  // Replay the host's authoritative override map into the freshly loaded
  // iframe. The bridge inside the iframe only sees rules persisted in the
  // artifact source via its own hydrateOverridesFromDom() — any unsaved
  // edit lives on the host side until Save-to-source. Without this replay,
  // toggling Inspect off/on, switching to Comment mode, or any other
  // srcdoc rebuild reloads the iframe from previewSource without the
  // unsaved style block, so the preview drops the live edits while
  // saveInspectToSource() can still persist them later from the stale
  // host map. The bridge re-validates each entry under its own allow-list,
  // so a parent that posted a hostile replay can only land overrides the
  // bridge would also have accepted via od:inspect-set.
  //
  // The render-time hydration above keeps `inspectOverrides` aligned with
  // the current `source` whenever React commits, but the iframe `onLoad`
  // callback fires from a separate event-loop turn after the new srcDoc
  // is parsed; if it ever races a stale closure (e.g. an interleaved
  // remount), reading React state would post the previous file's map over
  // the bridge's DOM-hydrated one and silently strip the persisted styles
  // from preview. Re-derive synchronously from `source` whenever the
  // hydration ref disagrees so onLoad never sends a stale snapshot.
  function replayInspectOverridesToIframe(target: HTMLIFrameElement | null = iframeRef.current) {
    const win = target?.contentWindow;
    if (!win) return;
    const overrides = inspectHydratedSourceRef.current === source
      ? inspectOverrides
      : (typeof source === 'string' ? parseInspectOverridesFromSource(source) : {});
    win.postMessage({ type: 'od:inspect-replay', overrides }, '*');
  }

  // Persist accumulated inspect overrides into the artifact source: replace
  // (or insert) a single <style data-od-inspect-overrides> block in <head>.
  // The CSS body is serialized from the host's own override map, hydrated
  // from source on load and updated only by host-driven onApply / reset
  // callbacks. We deliberately do NOT round-trip through the iframe at save
  // time: artifact JS rendered inside the preview shares the same
  // contentWindow as the bridge and could forge an od:inspect-overrides
  // reply that flips allow-listed properties on elements the user never
  // touched. POSTing to /api/projects/:id/files upserts the file via
  // writeProjectFile (multipart-or-JSON; we use JSON).
  async function saveInspectToSource() {
    if (!source) return;
    setSavingInspect(true);
    setInspectError(null);
    try {
      const css = serializeInspectOverrides(inspectOverrides).trim();
      const next = applyInspectOverridesToSource(source, css);
      const saved = await writeProjectTextFileDetailed(projectId, file.name, next, {
        versionSource: 'manual',
        versionLabel: t('fileViewer.edit'),
      }, workspaceContext);
      if (!saved.ok) {
        throw new Error(saved.message || `Save failed (${saved.status ?? ''})`);
      }
      setSource(next);
      setInspectSavedAt(Date.now());
      setReloadKey((k) => k + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setInspectError(msg);
      // The error banner inside the inspect panel is easy to miss when the
      // user is focused on the iframe preview — surface failures in the
      // console as well so quota/network errors aren't silently lost.
      console.error('[inspect] saveToSource failed:', err);
    } finally {
      setSavingInspect(false);
    }
  }

  // Keyboard nav on the host, so the user can press ←/→ even when focus
  // is on the chat composer or any other host control.
  useEffect(() => {
    if (!workspaceActive || !effectiveDeck || mode !== 'preview') return;
    function onKey(e: KeyboardEvent) {
      if (document.activeElement === iframeRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      const shortcut = deckKeyboardShortcutForEvent(e);
      if (shortcut === 'next') {
        e.preventDefault();
        postSlide('next');
      } else if (shortcut === 'prev') {
        e.preventDefault();
        postSlide('prev');
      } else if (shortcut === 'first') {
        e.preventDefault();
        postSlide('first');
      } else if (shortcut === 'last') {
        e.preventDefault();
        postSlide('last');
      } else if (shortcut === 'reset') {
        e.preventDefault();
        fireDeckViewerClick('slide_reset', {
          slide_index: activeDeckSlideIndex,
          slide_count: deckSlideTotal,
        });
        goToSlide(0);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [effectiveDeck, mode, workspaceActive]);

  useEffect(() => {
    if (!workspaceActive) return;
    function onPresenterMessage(ev: MessageEvent) {
      if (!presenterWindowRef.current || ev.source !== presenterWindowRef.current) return;
      const data = ev.data as
        | {
            type?: string;
            projectId?: string;
            fileName?: string;
            index?: number;
            notes?: string[];
          }
        | null;
      if (!data || data.projectId !== projectId || data.fileName !== file.name) return;
      if (data.type === 'od:presenter-slide-go' && typeof data.index === 'number') {
        goToSlide(data.index);
        return;
      }
      // Esc inside the presenter popup tears the whole presentation down (popup
      // window + fullscreen overlay), matching Esc pressed in the main window.
      if (data.type === 'od:presenter-close') {
        closeInTabPresentation();
        return;
      }
      if (data.type === 'od:presenter-notes-save' && Array.isArray(data.notes)) {
        void saveSpeakerNotes(data.notes, { editSurface: 'presenter' });
      }
    }
    window.addEventListener('message', onPresenterMessage);
    return () => window.removeEventListener('message', onPresenterMessage);
  }, [projectId, file.name, deckSlideCount, previewStateKey, speakerNotes, source, workspaceActive]);

  useEffect(() => {
    if (!workspaceActive) return;
    const popup = presenterWindowRef.current;
    if (!popup || popup.closed) return;
    popup.postMessage({
      type: 'od:presenter-slide-state',
      projectId,
      fileName: file.name,
      active: activeDeckSlideIndex,
      count: Math.max(deckSlideCount, speakerNotes.length, 1),
      notes: speakerNotes,
    }, '*');
  }, [activeDeckSlideIndex, deckSlideCount, speakerNotes, projectId, file.name, workspaceActive]);

  // Keep the fullscreen present overlay in lockstep with the active slide. The
  // overlay is a SEPARATE iframe from the background preview, so host-side
  // navigation (arrow keys, thumbnail clicks, or a move driven from the
  // presenter popup) has to be forwarded to it explicitly — otherwise the big
  // presented slide stays frozen while the counter and popup move on. The
  // overlay opens on the right slide via buildSrcdoc's initialSlideIndex, so
  // this only drives subsequent moves.
  useEffect(() => {
    if (!workspaceActive || !inTabPresent || !effectiveDeck) return;
    const frame = presentOverlayRef.current?.querySelector('iframe');
    frame?.contentWindow?.postMessage(
      { type: 'od:slide', action: 'go', index: activeDeckSlideIndex },
      '*',
    );
  }, [inTabPresent, effectiveDeck, activeDeckSlideIndex, workspaceActive]);

  // The reverse direction: the fullscreen overlay is its own iframe and drives
  // its own slide when clicked (deckClickNavigation), so adopt the moves it
  // reports as the host's active slide. That makes the counter, thumbnail rail
  // and presenter popup all follow a slide advanced from the big stage. The
  // main slide-state listener only trusts the ACTIVE preview iframe (the
  // background one), so the overlay needs its own source-matched listener; the
  // lockstep effect above re-posts the adopted index back as a no-op, so there
  // is no feedback loop.
  useEffect(() => {
    if (!workspaceActive || !inTabPresent || !effectiveDeck) return;
    function onOverlaySlideState(ev: MessageEvent) {
      const frame = presentOverlayRef.current?.querySelector('iframe');
      if (!frame || ev.source !== frame.contentWindow) return;
      const data = ev.data as { type?: string; active?: number; count?: number } | null;
      if (!data || data.type !== 'od:slide-state') return;
      if (typeof data.active !== 'number' || typeof data.count !== 'number') return;
      const next = { active: data.active, count: data.count };
      setSlideStateCached(previewStateKey, next);
      setSlideState(next);
    }
    window.addEventListener('message', onOverlaySlideState);
    return () => window.removeEventListener('message', onOverlaySlideState);
  }, [inTabPresent, effectiveDeck, previewStateKey, workspaceActive]);

  // The Esc hint is a momentary confirmation, not a persistent chrome: fade it
  // out a few seconds after the presentation starts. (closeInTabPresentation
  // also clears it immediately when the user leaves.)
  useEffect(() => {
    if (!workspaceActive || !presentEscHint) return;
    const id = window.setTimeout(() => setPresentEscHint(false), 3600);
    return () => window.clearTimeout(id);
  }, [presentEscHint, workspaceActive]);

  useEffect(() => {
    if (!workspaceActive || !presentMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.present-wrap')) return;
      setPresentMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresentMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [presentMenuOpen, workspaceActive]);

  useEffect(() => {
    if (!workspaceActive || !zoomMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!zoomMenuRef.current) return;
      if (!zoomMenuRef.current.contains(e.target as Node)) setZoomMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [workspaceActive, zoomMenuOpen]);

  useEffect(() => {
    if (!workspaceActive || !agentToolsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.artifact-tool-menu-anchor')) return;
      closeArtifactToolMenus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeArtifactToolMenus();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [agentToolsOpen, workspaceActive]);

  useEffect(() => {
    if (!workspaceActive || !deployMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!shareRef.current) return;
      if (shareRef.current.contains(e.target as Node)) return;
      setDeployMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setDeployMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [deployMenuOpen, workspaceActive]);

  useEffect(() => {
    if (!workspaceActive || !inTabPresent) return;
    const bodyStyle = document.body.style;
    const previousChromeHeight = bodyStyle.getPropertyValue('--workspace-tabs-chrome-height');
    const updateChromeHeight = () => {
      const chrome = document.querySelector<HTMLElement>('.workspace-tabs-chrome.app-chrome-header');
      const height = chrome?.getBoundingClientRect().height ?? 0;
      if (height > 0) {
        bodyStyle.setProperty('--workspace-tabs-chrome-height', `${Math.round(height)}px`);
      } else {
        bodyStyle.removeProperty('--workspace-tabs-chrome-height');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeInTabPresentation();
    };
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: string } | null;
      if (!data || data.type !== 'od:present-escape') return;
      const frame = presentOverlayRef.current?.querySelector('iframe');
      if (frame?.contentWindow && ev.source !== frame.contentWindow) return;
      closeInTabPresentation();
    };
    const onFullscreenChange = () => {
      if (presentFullscreenRequestedRef.current && !document.fullscreenElement) {
        closeInTabPresentation();
      }
    };
    updateChromeHeight();
    document.addEventListener('keydown', onKey);
    window.addEventListener('message', onMessage);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('resize', updateChromeHeight);
    const chrome = document.querySelector<HTMLElement>('.workspace-tabs-chrome.app-chrome-header');
    const observer = chrome && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateChromeHeight) : null;
    if (observer && chrome) observer.observe(chrome);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('message', onMessage);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('resize', updateChromeHeight);
      observer?.disconnect();
      if (previousChromeHeight) {
        bodyStyle.setProperty('--workspace-tabs-chrome-height', previousChromeHeight);
      } else {
        bodyStyle.removeProperty('--workspace-tabs-chrome-height');
      }
    };
  }, [inTabPresent, workspaceActive]);

  useEffect(() => {
    if (!workspaceActive || !inTabPresent || !presentFullscreenPending) return;
    const overlay = presentOverlayRef.current;
    if (!overlay || typeof overlay.requestFullscreen !== 'function') {
      setPresentFullscreenPending(false);
      return;
    }
    let cancelled = false;
    overlay.requestFullscreen()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setPresentFullscreenPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inTabPresent, presentFullscreenPending, workspaceActive]);

  function closeInTabPresentation() {
    setInTabPresent(false);
    setPresentFullscreenPending(false);
    presentFullscreenRequestedRef.current = false;
    setPresentEscHint(false);
    // Tear the presenter popup down together with the fullscreen stage so one
    // Esc dismisses the whole "presenting" state, not just the main window.
    const popup = presenterWindowRef.current;
    if (popup && !popup.closed) {
      try { popup.close(); } catch { /* already gone */ }
    }
    presenterWindowRef.current = null;
    if (typeof document !== 'undefined' && document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      document.exitFullscreen().catch(() => undefined);
    }
  }

  function openInNewTab() {
    if (!source) return;
    openSandboxedPreviewInNewTab(source, exportTitle, {
      deck: effectiveDeck,
      baseHref: srcDocBaseHref,
      initialSlideIndex: htmlPreviewSlideState.get(previewStateKey)?.active ?? 0,
      hideDeckChrome: effectiveDeck,
      deckClickNavigation: effectiveDeck,
    });
  }

  // Snapshot this project as a reusable template. The daemon snapshots
  // EVERY html/text/code file in the project (not just the file open in
  // the viewer), so the template captures the whole design, not a single
  // page. Surfaced here in the Download menu because templates are saved
  // from the same artifact output surface as files.
  function openSaveAsTemplateModal() {
    setDeployMenuOpen(false);
    // Start the template click→result correlation; the result fires later from
    // handleSaveAsTemplate once the save actually resolves.
    const requestId = analytics.newRequestId();
    templateExportRequestIdRef.current = requestId;
    templateExportStartedRef.current = performance.now();
    templateExportOriginPromiseRef.current = resolveArtifactExportOrigin()
      .catch(() => unknownExportOrigin());
    templateExportResolvedRef.current = false;
    trackShareOptionPopoverClick(
      analytics.track,
      {
        page_name: 'artifact',
        area: 'share_option_popover',
        artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
        artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
        element: 'template',
        project_id: projectId,
        project_kind: projectKind,
      },
      { requestId },
    );
    const defaultName =
      file.name.replace(/\.html?$/i, '') || t('fileViewer.templateNameDefault');
    setTemplateName(defaultName);
    setTemplateDescription('');
    setTemplateSaveError(null);
    setTemplateModalOpen(true);
  }

  // Component-scoped so both the save flow and the modal Cancel button emit
  // the one terminal result for a template export session.
  const fireTemplateExportResult = (
    result: 'success' | 'failed' | 'cancelled',
    errorCode?: string,
  ) => {
    if (templateExportResolvedRef.current) return;
    templateExportResolvedRef.current = true;
    const requestId = templateExportRequestIdRef.current ?? analytics.newRequestId();
    const started = templateExportStartedRef.current || performance.now();
    const originPromise = templateExportOriginPromiseRef.current
      ?? resolveArtifactExportOrigin().catch(() => unknownExportOrigin());
    void originPromise.then((originProps) => {
      trackArtifactExportResult(
        analytics.track,
        {
          page_name: 'artifact',
          area: 'share_option_popover',
          artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
          artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
          export_format: 'template',
          result,
          ...originProps,
          ...(errorCode ? { error_code: errorCode } : {}),
          export_duration_ms: Math.round(performance.now() - started),
          project_id: projectId,
          project_kind: projectKind,
        },
        { requestId },
      );
    });
    // Onboarding first-loop 交付 step (spec §8.3): only a SUCCESSFUL template
    // export closes the loop. Project-scoped no-op unless started from Home.
    if (result === 'success') recordFirstLoopStep(analytics.track, 'delivered', projectId);
  };

  async function handleSaveAsTemplate() {
    const name = templateName.trim();
    if (!name) return;
    setSavingTemplate(true);
    setTemplateNote(null);
    setTemplateSaveError(null);
    let savedName: string | null = null;
    // Default to failed; flips to success only when the save resolves. The
    // finally block reports exactly one artifact_export_result(template),
    // covering the !tpl branch and any thrown error too.
    let templateOutcome: 'success' | 'failed' = 'failed';
    let templateErrorCode: string | undefined = 'UNKNOWN';
    try {
      const tpl = await saveTemplate({
        name,
        description: templateDescription.trim() || undefined,
        sourceProjectId: projectId,
      });
      if (!tpl) {
        setTemplateSaveError(t('fileViewer.savedTemplateFail'));
        templateErrorCode = 'SAVE_FAILED';
        return;
      }
      savedName = tpl.name;
      setTemplateModalOpen(false);
      setTemplateName('');
      setTemplateDescription('');
      setTemplateNote(t('fileViewer.savedTemplate', { name: tpl.name }));
      // Show success toast
      setTemplateSavedToast(t('fileViewer.savedTemplate', { name: tpl.name }));
      templateOutcome = 'success';
      templateErrorCode = undefined;
    } finally {
      setSavingTemplate(false);
      fireTemplateExportResult(templateOutcome, templateErrorCode);
      if (savedName) {
        // Auto-clear the note so the menu doesn't keep stale state next open.
        setTimeout(() => setTemplateNote(null), 4000);
      }
    }
  }

  async function openDeployModal(
    nextProviderId: WebDeployProviderId = deployProviderId,
    intent: 'deploy' | 'social-share' = 'deploy',
  ) {
    setDeployMenuOpen(false);
    setDeployModalOpen(true);
    setDeployModalIntent(intent);
    setDeployError(null);
    setDeployActionToast(null);
    setCopiedDeployLink(null);
    setDeployPhase('idle');
    await loadDeployProvider(nextProviderId, { fallbackToExisting: true });
  }

  async function changeDeployProvider(nextProviderId: WebDeployProviderId) {
    if (nextProviderId === deployProviderId) return;
    setDeployError(null);
    setDeployPhase('idle');
    await loadDeployProvider(nextProviderId);
  }

  async function saveDeployConfig() {
    setSavingDeployConfig(true);
    setDeployError(null);
    setDeployActionToast(null);
    try {
      if (deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID) {
        if (!deployToken.trim()) {
          setDeployActionToast(t('fileViewer.cloudflareApiTokenRequired'));
          deployTokenInputRef.current?.focus();
          return null;
        }
        if (!cloudflareAccountId.trim()) {
          throw new Error(t('fileViewer.cloudflareAccountIdRequired'));
        }
      }
      const config = await updateDeployConfig(buildDeployConfigRequest(deployProviderId));
      if (!config || config.providerId !== deployProviderId) {
        throw new Error(t('fileViewer.deployProviderConfigSaveFailed', { provider: deployProviderLabel }));
      }
      syncDeployFormFromConfig(deployProviderId, config);
      if (deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID) {
        await loadCloudflareZones(config);
      }
      return config;
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : t('fileViewer.deployProviderConfigSaveFailed', { provider: deployProviderLabel }));
      return null;
    } finally {
      setSavingDeployConfig(false);
    }
  }

  function buildCloudflarePagesDeploySelection(): WebCloudflarePagesDeploySelection | undefined {
    if (deployProviderId !== CLOUDFLARE_PAGES_PROVIDER_ID) return undefined;
    const prefix = normalizeCloudflareDomainPrefixInput(cloudflareDomainPrefix);
    if (!prefix) return undefined;
    if (!isValidCloudflareDomainPrefixInput(prefix)) {
      throw new Error(t('fileViewer.cloudflareDomainPrefixInvalid'));
    }
    const zone = cloudflareZones.find((item) => item.id === cloudflareZoneId);
    if (!zone) {
      throw new Error(t('fileViewer.cloudflareZoneRequired'));
    }
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      domainPrefix: prefix,
    };
  }

  async function deployToSelectedProvider() {
    setDeploying(true);
    setDeployPhase('deploying');
    setDeployError(null);
    setDeployActionToast(null);
    setCopiedDeployLink(null);
    // Real-deploy analytics: report success only after the provider actually
    // accepts the publish, failed on any hard error / missing config. This is
    // distinct from the share-popover "opened" signal (artifact_export_result).
    const deployStarted = performance.now();
    const providerForTracking: TrackingDeployProvider =
      deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? 'cloudflare_pages' : 'vercel';
    const firstConfigure = !deployConfig?.configured;
    let savedNewToken = false;
    const fireDeployResult = (
      result: 'success' | 'failed' | 'cancelled',
      errorCode?: string,
    ) => {
      trackArtifactDeployResult(analytics.track, {
        page_name: 'artifact',
        area: 'deploy_modal',
        artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
        artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
        provider: providerForTracking,
        result,
        saved_new_token: savedNewToken,
        first_configure: firstConfigure,
        ...(errorCode ? { error_code: errorCode } : {}),
        deploy_duration_ms: Math.round(performance.now() - deployStarted),
        project_id: projectId,
        project_kind: projectKind,
      });
    };
    try {
      const cloudflarePagesSelection = buildCloudflarePagesDeploySelection();
      const typedToken = deployToken.trim();
      const hasNewToken = typedToken && typedToken !== deployConfig?.tokenMask;
      savedNewToken = Boolean(hasNewToken);
      const cloudflareHints = cloudflareConfigHintsFromForm();
      const cloudflareHintsChanged = deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID && Boolean(
        cloudflareHints?.lastZoneId !== deployConfig?.cloudflarePages?.lastZoneId ||
        cloudflareHints?.lastZoneName !== deployConfig?.cloudflarePages?.lastZoneName ||
        cloudflareHints?.lastDomainPrefix !== deployConfig?.cloudflarePages?.lastDomainPrefix,
      );
      const needsConfigSave =
        hasNewToken ||
        teamId.trim() !== (deployConfig?.teamId || '') ||
        teamSlug.trim() !== (deployConfig?.teamSlug || '') ||
        cloudflareAccountId.trim() !== (deployConfig?.accountId || '') ||
        cloudflareHintsChanged ||
        !deployConfig?.configured;
      if (needsConfigSave) {
        const nextConfig = await saveDeployConfig();
        if (!nextConfig) {
          // saveDeployConfig bailed (missing/invalid token, e.g. user clicked
          // Deploy without entering a key) — count as a failed deploy attempt.
          fireDeployResult('failed', 'CONFIG_REQUIRED');
          return;
        }
        if (!nextConfig?.configured) {
          const option = getDeployProviderOption(deployProviderId);
          throw new Error(t(option.tokenRequiredKey, { provider: t(option.labelKey) }));
        }
      }
      setDeployPhase('preparing-link');
      const next = await deployProjectFile(
        projectId,
        file.name,
        deployProviderId,
        cloudflarePagesSelection,
        deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? deployTarget : undefined,
        workspaceContext,
      );
      setDeploymentsByProvider((current) => ({
        ...current,
        [next.providerId]: next,
      }));
      setDeployment(next);
      setDeployResult(next);
      if (deployResultState(next.status) !== 'failed') {
        fireDeployResult('success');
        setDeploySavedToast({
          message: t('fileViewer.deploySuccessToast'),
          details: t('fileViewer.deploySuccessToastDetails', {
            provider: deployProviderLabel,
            url: next.url,
          }),
        });
      } else {
        fireDeployResult('failed', `STATUS_${next.status ?? 'UNKNOWN'}`);
      }
    } catch (err) {
      const option = getDeployProviderOption(deployProviderId);
      const message = err instanceof Error
        ? err.message
        : t('fileViewer.deployProviderFailed', { provider: t(option.labelKey) });
      const tokenRequired =
        message === t(option.tokenRequiredKey, { provider: t(option.labelKey) });
      if (tokenRequired) {
        setDeployActionToast(message);
        deployTokenInputRef.current?.focus();
      } else {
        setDeployError(message);
      }
      fireDeployResult(
        'failed',
        tokenRequired ? 'CONFIG_REQUIRED' : deployErrorCode(err),
      );
    } finally {
      setDeploying(false);
      setDeployPhase('idle');
    }
  }

  async function retryDeploymentLink() {
    const current = deployResult || deployment;
    if (!current?.id) return;
    setDeployError(null);
    setDeployPhase('preparing-link');
    try {
      const next = await checkDeploymentLink(projectId, current.id, workspaceContext);
      setDeploymentsByProvider((items) => ({
        ...items,
        [next.providerId]: next,
      }));
      setDeployment(next);
      setDeployResult(next);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : t('fileViewer.deployFailed'));
    } finally {
      setDeployPhase('idle');
    }
  }

  async function copyDeployLink(url: string) {
    const safeUrl = url.trim();
    if (!safeUrl) return;
    try {
      await navigator.clipboard.writeText(safeUrl);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = safeUrl;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedDeployLink(safeUrl);
    window.setTimeout(() => {
      setCopiedDeployLink((current) => (current === safeUrl ? null : current));
    }, 1800);
  }

  async function copyShareLink(url: string) {
    const safeUrl = url.trim();
    if (!safeUrl) {
      setShareLinkFeedback('failed');
      setExportToast({ message: t('useEverywhere.copyFailed'), tone: 'error' });
      return false;
    }
    const ok = await copyToClipboard(safeUrl);
    const feedback = ok ? 'copied' : 'failed';
    setShareLinkFeedback(feedback);
    if (!ok) setExportToast({ message: t('useEverywhere.copyFailed'), tone: 'error' });
    window.setTimeout(() => {
      setShareLinkFeedback((current) => (current === feedback ? null : current));
    }, 1800);
    return ok;
  }

  function presentInThisTab() {
    setPresentMenuOpen(false);
    presentFullscreenRequestedRef.current = false;
    setMode('preview');
    if (effectiveDeck) openPresenterWindow();
    setInTabPresent(true);
    setPresentEscHint(true);
  }

  function presentFullscreen() {
    setPresentMenuOpen(false);
    if (effectiveDeck) openPresenterWindow();
    setMode('preview');
    presentFullscreenRequestedRef.current = true;
    setPresentFullscreenPending(true);
    setInTabPresent(true);
    setPresentEscHint(true);
  }

  function presentNewTab() {
    setPresentMenuOpen(false);
    openInNewTab();
  }

  function reloadHtmlPreview() {
    fireArtifactToolbarClick('reload');
    if (sourceAuthorizationScopeKey) {
      invalidateHtmlSourceSnapshotFile(
        sourceAuthorizationScopeKey,
        projectId,
        file.name,
      );
    }
    capturePreviewScrollPosition();
    imageExportSnapshotDataUrlRef.current = null;
    setInlinedSource(null);
    setReloadKey((key) => key + 1);
    if (!useUrlLoadPreview) {
      // Capture the current source so the fetch effect can restore it if
      // fetchProjectFileText returns null (non-2xx / transient network error).
      // Without this, a failed reload leaves source null and the iframe blank
      // because the existing keep-last-good guard in the fetch effect has
      // nothing to fall back to (PR #4652).
      //
      // Only overwrite the ref when source is non-null: if a rapid second
      // Reload click fires while source is already null (cleared by the first
      // click), we must NOT overwrite the ref — doing so would discard the
      // genuine last-good snapshot that the first click stored, and the
      // restore path would have nothing to fall back to (double-click race,
      // PR #4652 review).  The snapshot is keyed with the current file
      // identity so the restore guard can reject stale cross-file snapshots.
      if (source !== null) {
        prevSourceBeforeReloadRef.current = {
          source,
          projectId,
          fileName: file.name,
        };
      }
      // Clear source synchronously so previewSource becomes null and the
      // srcDoc memo recomputes to '' before the async re-fetch resolves.
      // Without this, the remounted iframe carries stale srcdoc content
      // until the fetch completes (issue #4650).
      //
      // Skip the synchronous clear when Manual Edit is active
      // (manualEditFrozenSource !== null).  Nulling source here also nulls
      // sourceRef.current (via the [source] useEffect at ~line 5962), which
      // causes applyManualEdit to hit its null guard and silently drop the
      // save before the reload fetch resolves (PR #4652 Codex P2 / issue #4650).
      // The reload still re-fetches via the reloadKey increment above; source
      // stays at the last-good frozen value until the fetch resolves, so
      // applyManualEdit continues to work throughout the reload window.
      if (!manualEditFrozenSource) {
        setSource(null);
      }
      // Clear the annotation-freeze snapshot so previewSource is not pinned
      // to the stale V1 content while annotationFreezeActive is true.  The
      // annotation-freeze useEffect (deps: annotationFreezeActive,
      // annotationFrozenSource, livePreviewSource) re-captures from
      // livePreviewSource on the next render once the fresh `source` lands,
      // so the frozen source updates to the new V2 content automatically
      // (PR #4652 / issue #4650 mrcfps review).
      setAnnotationFrozenSource(null);
      activatedSrcDocTransportHtmlRef.current = null;
      setSrcDocShellReady(false);
      setSrcDocTransportResetKey((key) => key + 1);
    }
  }

  async function handleVersionRestored(content: string) {
    setSource(content);
    sourceRef.current = content;
    setInlinedSource(null);
    setReloadKey((key) => key + 1);
    await onFileSaved?.();
    setVersionRestoredToast({
      id: (versionRestoredToastIdRef.current += 1),
      message: t('fileViewer.versions.restoreSuccess'),
    });
  }

  function selectMode(nextMode: 'preview' | 'source') {
    // Read-only viewer of a team-shared project can preview but not inspect source.
    if (viewerOnly && nextMode === 'source') return;
    if (nextMode === 'source') setDrawOverlayOpen(false);
    setMode(nextMode);
  }

  function activateBoard(nextTool?: BoardTool) {
    setMode('preview');
    setBoardMode(true);
    if (nextTool) setBoardTool(nextTool);
  }

  function activateBoardPicker(nextTool: BoardTool) {
    clearBoardComposer();
    fireArtifactToolbarClick(nextTool === 'pod' ? 'pods' : 'comment');
    setCommentPanelOpen(false);
    setCommentCreateMode(false);
    activateBoard(nextTool);
    setAgentToolsOpen(false);
  }

  function clearBoardComposer() {
    setActiveCommentTarget(null);
    setHoveredCommentTarget(null);
    setHoveredPodMemberId(null);
    setActivePreviewCommentId(null);
    setCommentDraft('');
    setQueuedBoardNotes([]);
    setBoardImages([]);
    setActiveCommentExistingAttachments([]);
    setBoardPreviewIndex(null);
    setStrokePoints([]);
  }

  function addBoardImages(files: File[]) {
    const imgs = files.filter((file) => file.type.startsWith('image/'));
    if (imgs.length > 0) setBoardImages((current) => [...current, ...imgs]);
  }

  function removeBoardImage(index: number) {
    setBoardImages((current) => current.filter((_, i) => i !== index));
    setBoardPreviewIndex(null);
  }

  function closeArtifactToolMenus() {
    setAgentToolsOpen(false);
  }

  function activateDrawTool() {
    if (viewerOnly) return; // read-only viewer: mark (annotate) is an edit action
    fireArtifactToolbarClick('mark');
    const next = !drawOverlayOpen;
    if (!next) {
      setDrawOverlayOpen(false);
      setAgentToolsOpen(false);
      return;
    }
    capturePreviewScrollPosition();
    const activateDraw = () => {
      setCommentPanelOpen(false);
      setCommentCreateMode(false);
      setBoardMode(false);
      clearBoardComposer();
      setInspectMode(false);
      setMode('preview');
      setDrawOverlayOpen(true);
      closeArtifactToolMenus();
    };
    if (manualEditMode) {
      void exitManualEditModeAfterFlush().then((ok) => {
        if (ok) activateDraw();
      });
      return;
    }
    activateDraw();
  }

  function activateCommentTool() {
    fireArtifactToolbarClick('comment');
    capturePreviewScrollPosition();
    if (boardMode && !commentCreateMode && boardTool === 'inspect') {
      setBoardMode(false);
      setCommentCreateMode(false);
      clearBoardComposer();
      setAgentToolsOpen(false);
      return;
    }
    const activateComment = () => {
      setCommentPanelOpen(false);
      setCommentCreateMode(false);
      clearBoardComposer();
      setInspectMode(false);
      setDrawOverlayOpen(false);
      setMode('preview');
      activateBoard('inspect');
      closeArtifactToolMenus();
    };
    if (manualEditMode) {
      void exitManualEditModeAfterFlush().then((ok) => {
        if (ok) activateComment();
      });
      return;
    }
    activateComment();
  }

  function activateCommentCreateTool(returnFocusTarget?: HTMLElement | null) {
    if (returnFocusTarget) commentPanelReturnFocusRef.current = returnFocusTarget;
    fireArtifactToolbarClick('comment');
    capturePreviewScrollPosition();
    if (boardMode && commentCreateMode) {
      setBoardMode(false);
      setCommentCreateMode(false);
      setCommentPanelOpen(false);
      clearBoardComposer();
      closeArtifactToolMenus();
      return;
    }
    const activateCommentCreate = () => {
      setCommentPanelOpen(true);
      setCommentSidePanelCollapsed(false);
      setCommentCreateMode(true);
      if (!activeCommentTarget) clearBoardComposer();
      setInspectMode(false);
      setDrawOverlayOpen(false);
      setMode('preview');
      activateBoard('inspect');
      closeArtifactToolMenus();
    };
    if (manualEditMode) {
      void exitManualEditModeAfterFlush().then((ok) => {
        if (ok) activateCommentCreate();
      });
      return;
    }
    activateCommentCreate();
  }

  function dismissFloatingCommentPanel() {
    pendingCommentPanelFocusRef.current =
      commentPanelReturnFocusRef.current
      ?? commentPanelToggleRef.current
      ?? toolbarMoreTriggerRef.current;
    setCommentPanelOpen(false);
    // Dismissing the panel must not close an active composer popover. The
    // panel may have been opened from that popover's View all comments action,
    // so tearing down board mode here would interrupt composition.
    if (activeCommentTarget) return;
    setCommentCreateMode(false);
    setBoardMode(false);
    clearBoardComposer();
  }

  function activateManualEditTool() {
    if (viewerOnly || (!manualEditMode && !manualEditEntryAllowed)) return;
    fireArtifactToolbarClick('edit');
    capturePreviewScrollPosition();
    if (!manualEditMode) {
      if (manualEditActivationPendingRef.current) return;
      const enterManualEditMode = () => {
        setCommentPanelOpen(false);
        setCommentCreateMode(false);
        setBoardMode(false);
        clearBoardComposer();
        setInspectMode(false);
        setDrawOverlayOpen(false);
        setMode('preview');
        setManualEditViewportWidth(previewBodyRef.current?.clientWidth ?? null);
        setManualEditSrcDocActive(true);
        setManualEditMode(true);
        closeArtifactToolMenus();
      };
      if (!useUrlLoadPreview) {
        // A snapshot is only valid for the URL-load -> srcDoc handoff that
        // captured it. Once srcDoc is already the active transport it owns the
        // newest in-frame navigation state; retaining a missed/late snapshot
        // lets syncBridgeModes replay an older page when Edit is toggled again.
        previewRuntimeStateRef.current = null;
        enterManualEditMode();
        return;
      }
      const activationFileIdentity = previewFileIdentityRef.current;
      manualEditActivationPendingRef.current = true;
      void capturePreviewRuntimeState(urlPreviewIframeRef.current)
        .then((state) => {
          if (previewFileIdentityRef.current !== activationFileIdentity) return;
          if (state) previewRuntimeStateRef.current = state;
          enterManualEditMode();
        })
        .finally(() => {
          manualEditActivationPendingRef.current = false;
        });
      return;
    }
    closeArtifactToolMenus();
    void exitManualEditModeAfterFlush();
  }

  function queueCurrentDraft() {
    const note = commentDraft.trim();
    if (!note) return;
    setQueuedBoardNotes((current) => [...current, note]);
    setCommentDraft('');
  }

  function currentActiveComposerComment(): PreviewComment | null {
    if (!activePreviewCommentId) return null;
    return previewComments.find((comment) => (
      comment.id === activePreviewCommentId &&
      comment.filePath === file.name &&
      comment.status === 'open'
    )) ?? null;
  }

  function currentActiveComposerAttachments(): PreviewCommentAttachment[] {
    return currentActiveComposerComment()?.attachments ?? activeCommentExistingAttachments;
  }

  function withDeckSlideIndex(target: PreviewCommentTarget): PreviewCommentTarget {
    if (!effectiveDeck || typeof slideState?.active !== 'number') return target;
    if (typeof target.slideIndex === 'number') return target;
    return { ...target, slideIndex: slideState.active };
  }

  async function sendBoardBatch() {
    if (!activeCommentTarget || !onSendBoardCommentAttachments) return;
    const existingComment = currentActiveComposerComment();
    const sendingUnchangedSavedComment = Boolean(
      existingComment
      && queuedBoardNotes.length === 0
      && boardImages.length === 0
      && commentDraft.trim() === existingComment.note.trim(),
    );
    if (existingComment && sendingUnchangedSavedComment) {
      setSendingBoardBatch(true);
      try {
        const result = await onSendBoardCommentAttachments(
          commentsToAttachments([existingComment]),
        );
        if (!commentSendCompleted(result, existingComment.id)) return;
        if (!onRemovePreviewComment) return;
        const removed = await onRemovePreviewComment(existingComment.id);
        if (!removed) return;
        clearBoardComposer();
      } finally {
        setSendingBoardBatch(false);
      }
      return;
    }
    const nextNotes = [...queuedBoardNotes];
    if (commentDraft.trim()) nextNotes.push(commentDraft.trim());
    if (nextNotes.length === 0 && boardImages.length === 0) return;
    setSendingBoardBatch(true);
    try {
      const existingAttachments = currentActiveComposerAttachments();
      const attachments = buildBoardCommentAttachments({
        target: withDeckSlideIndex(targetFromSnapshot(activeCommentTarget)),
        notes: nextNotes,
        includeImageOnly: boardImages.length > 0,
        imageAttachmentCount: boardImages.length,
      }).map((attachment) => (
        existingAttachments.length > 0
          ? { ...attachment, imageAttachments: existingAttachments }
          : attachment
      ));
      const result = await onSendBoardCommentAttachments(
        attachments,
        boardImages,
      );
      const completedIds = new Set(result.commentIds);
      const pending = attachments.filter(
        (attachment) => !completedIds.has(attachment.id),
      );
      if (pending.length === 0 && commentSendSucceeded(result)) {
        clearBoardComposer();
        return;
      }
      if (completedIds.size === 0) return;
      setQueuedBoardNotes(pending.map((attachment) => attachment.comment));
      setCommentDraft('');
      setBoardImages([]);
    } finally {
      setSendingBoardBatch(false);
    }
  }

  async function savePersistentComment() {
    if (!activeCommentTarget || !onSavePreviewComment) return;
    // Allow saving when there is text OR an attached image (image-only notes).
    if (!commentDraft.trim() && boardImages.length === 0 && currentActiveComposerAttachments().length === 0) return;
    const isFreePin = activeCommentTarget.elementId.startsWith('pin-');
    setSendingBoardBatch(true);
    try {
      const target = withDeckSlideIndex(targetFromSnapshot(activeCommentTarget));
      const saved = await onSavePreviewComment(
        target,
        commentDraft.trim(),
        false,
        boardImages,
        activeComposerComment?.id,
      );
      if (saved) {
        clearBoardComposer();
        setActiveCommentExistingAttachments(saved.attachments ?? []);
        setBoardMode(true);
        setCommentCreateMode(true);
        setActivePreviewCommentId(saved.id);
        setCommentSavedToast(isFreePin ? t('chat.comments.pinSavedToast') : t('chat.comments.savedToast'));
      }
    } finally {
      setSendingBoardBatch(false);
    }
  }

  async function savePanelComment(note: string) {
    if (!onSavePreviewComment) return false;
    const cleanNote = note.trim();
    if (!cleanNote) return false;
    const idSeed = Date.now().toString(36);
    const target: PreviewCommentTarget = activeCommentTarget
      ? targetFromSnapshot(activeCommentTarget)
      : {
          filePath: file.name,
          elementId: `file-comment-${idSeed}-${Math.floor(Math.random() * 1e6).toString(36)}`,
          selector: 'html',
          label: file.name,
          text: '',
          position: { x: 0, y: 0, width: 0, height: 0 },
          htmlHint: '',
          selectionKind: 'element',
        };
    setSendingBoardBatch(true);
    try {
      const saved = await onSavePreviewComment(target, cleanNote, false);
      if (saved) {
        setCommentSavedToast(t('chat.comments.savedToast'));
        if (activeCommentTarget) clearBoardComposer();
      }
      return Boolean(saved);
    } finally {
      setSendingBoardBatch(false);
    }
  }

  const showPresent = source !== null;
  const exportTitle = file.name.replace(/\.html?$/i, '') || file.name;
  const artifactKind = file.artifactManifest?.kind ?? file.artifactKind ?? null;
  const rendererId = file.artifactManifest?.renderer ?? null;
  const isDeckArtifact =
    isDeck ||
    projectKind === 'slide_deck' ||
    artifactKind === 'deck' ||
    rendererId === 'deck-html' ||
    file.kind === 'presentation';
  const deckExportSignal = isDeckArtifact || structuredDeckExportSignal;
  const isMarkdownArtifact =
    artifactKind === 'markdown-document' ||
    rendererId === 'markdown' ||
    file.kind === 'text' && /\.mdx?$/i.test(file.name);
  const isShareableArtifact =
    file.kind === 'html' ||
    isDeckArtifact ||
    artifactKind === 'html' ||
    rendererId === 'html';
  // "raw" = the artifact is share/download-eligible IGNORING viewerOnly, so the
  // unified chrome action still renders (disabled) for read-only members instead
  // of vanishing. `canShare`/`canDownload` keep the `&& !viewerOnly` gate that
  // guards the actual export/publish handlers.
  const rawCanShare = source !== null && isShareableArtifact;
  const rawCanDownload = source !== null && (isShareableArtifact || isMarkdownArtifact);
  const canShare = rawCanShare && !viewerOnly;
  const canDownload = rawCanDownload && !viewerOnly;
  // PPTX export is slide-based, so show it only for explicit decks plus
  // structured deck runtimes. Do not key this off plain `.slide`: ordinary
  // parallax/long pages may use that class but must remain page-mode exports.
  const showPptxExport = canShare && deckExportSignal;
  const canPptx = showPptxExport && !streaming;
  const showMarkdownExport = source !== null && isMarkdownArtifact && !viewerOnly;
  const showImageExport = canShare;
  // Read-only viewer of a team-shared project: comment-only copy for the
  // disabled edit/export controls and the comment composer's send-to-chat path.
  const viewerOnlyDisabledTitle = t('fileViewer.readonlySharedNoExport');

  // If viewerOnly flips on while an edit surface / export menu is open, close it
  // so the read-only viewer never lands in an editing mode it can't act on.
  useEffect(() => {
    if (!viewerOnly) return;
    setDrawOverlayOpen(false);
    setInspectMode(false);
    setVersionModalOpen(false);
    if (mode === 'source') setMode('preview');
    if (manualEditMode) {
      void exitManualEditModeAfterFlush();
    }
  }, [viewerOnly, mode, manualEditMode]);

  const deckExportSignalForContext = useCallback((context?: HtmlVersionExportContext | null): boolean => {
    if (!context?.versionId) return deckExportSignal;
    return isDeckArtifact || sourceLooksLikeExportableDeck(context.content);
  }, [deckExportSignal, isDeckArtifact]);

  async function exportHtmlPdf(context?: HtmlVersionExportContext | null) {
    const pdfTitle = context?.title ?? exportTitle;
    const pdfSource = context?.content ?? source ?? '';
    const pdfDeck = deckExportSignalForContext(context);
    if (isOpenDesignHostAvailable()) {
      const res = await exportProjectScreenshotPdf({
        projectId,
        fileName: file.name,
        title: pdfTitle,
        workspaceContext,
        // Broader deck signal than the viewer's nav so runtime-managed decks
        // (<deck-stage>) paginate per slide; the vector fallback below uses
        // the SAME signal, so an artifact exports identically with or without
        // a desktop host (no per-host divergence).
        deck: pdfDeck,
        ...(context?.versionId ? { versionId: context.versionId } : {}),
      });
      if (res.ok) return;
      // A SEMANTIC failure (bad deck routing, unreadable renderer output,
      // renderer 502, ...) must surface, not silently downgrade to the vector
      // PDF, which can reintroduce the fidelity bugs the screenshot path
      // exists to avoid. Only a genuinely unavailable renderer falls through.
      if (!('unavailable' in res)) throw new Error(res.error);
    }
    await exportProjectAsPdf({
      deck: pdfDeck,
      fallbackPdf: () => exportAsPdf(pdfSource, pdfTitle, { deck: pdfDeck, onProgress: onExportProgress }),
      filePath: file.name,
      projectId,
      title: pdfTitle,
      workspaceContext,
      ...(context?.versionId ? { versionId: context.versionId } : {}),
    });
  }

  function triggerPdfExport(context?: HtmlVersionExportContext) {
    fireShareExport('pdf', () => exportHtmlPdf(context), context);
  }

  function triggerZipExport(context?: HtmlVersionExportContext) {
    fireShareExport('zip', () => exportProjectAsZip({
      projectId,
      filePath: file.name,
      fallbackHtml: context?.content ?? source ?? '',
      fallbackTitle: context?.title ?? exportTitle,
      workspaceContext,
      ...(context?.versionId ? { versionId: context.versionId } : {}),
    }), context);
  }

  function triggerHtmlExport(context?: HtmlVersionExportContext) {
    fireShareExport('html', () => exportProjectAsHtml({
      projectId,
      filePath: file.name,
      fallbackTitle: context?.title ?? exportTitle,
      workspaceContext,
      ...(context?.versionId ? { versionId: context.versionId } : {}),
    }), context);
  }

  useEffect(() => {
    const nudgeKey = `${projectId}\n${file.name}`;
    if (!canShare || exportReadyNudgeSeenRef.current.has(nudgeKey)) return;
    exportReadyNudgeSeenRef.current.add(nudgeKey);
    if (hasSeenExportReadyNudge(projectId, file.name)) return;
    markExportReadyNudgeSeen(projectId, file.name);
    setExportReadyNudge(true);
    const timeout = window.setTimeout(() => setExportReadyNudge(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [canShare, file.name, projectId]);

  // Chat-side "Share" next-step action: when a new share request arrives, open
  // the share menu (the toolbar's "Share" button → deploy menu, which holds the
  // share-link items AND the "publish online" providers). This is the right
  // surface for "share" — publishing is the prerequisite for a shareable link,
  // and that publish step lives here; the download menu is export-to-disk, a
  // different intent. The artifact source may still be loading when the request
  // lands (the file was just auto-opened), so we defer until `canShare` flips
  // true and only consume each nonce once.
  const consumedShareNonceRef = useRef<number | null>(null);
  useEffect(() => {
    const nonce = shareRequest?.nonce;
    if (nonce == null) return;
    if (consumedShareNonceRef.current === nonce) return;
    if (!canShare) return;
    consumedShareNonceRef.current = nonce;
    setExportReadyNudge(false);
    markExportReadyNudgeSeen(projectId, file.name);
    setUnifiedActionTab('share');
    setDeployMenuOpen(true);
  }, [shareRequest?.nonce, canShare, projectId, file.name]);

  // Parallel to shareRequest, but opens the Download / Export menu instead — the
  // assistant "next step" card's Download row routes here so it surfaces the same
  // PDF / image / zip / standalone-HTML / template options the toolbar exposes.
  const consumedDownloadNonceRef = useRef<number | null>(null);
  useEffect(() => {
    const nonce = downloadRequest?.nonce;
    if (nonce == null) return;
    if (consumedDownloadNonceRef.current === nonce) return;
    if (!canDownload) return;
    consumedDownloadNonceRef.current = nonce;
    setExportReadyNudge(false);
    markExportReadyNudgeSeen(projectId, file.name);
    setUnifiedActionTab('export');
    setDeployMenuOpen(true);
  }, [downloadRequest?.nonce, canDownload, projectId, file.name]);

  // A queued chat send for this deck just started: flip the preview to the
  // slide its marked element lives on. We write the cached slide state first so
  // a freshly-mounted iframe (the tab may have just been activated) restores to
  // the target on load via syncCachedSlideStateToIframe(), then post directly
  // to cover the already-loaded iframe. The consume-once guard lives in
  // `shouldConsumeSlideNav` (keyed by file outside this component) so it holds
  // across remounts — switching away from and back to the deck must not replay
  // the stale request and yank the preview off wherever the user navigated.
  useEffect(() => {
    const nonce = slideNavRequest?.nonce;
    if (nonce == null) return;
    if (!effectiveDeck) return;
    const requested = slideNavRequest?.slideIndex;
    if (typeof requested !== 'number' || !Number.isFinite(requested) || requested < 0) return;
    if (!shouldConsumeSlideNav(previewStateKey, nonce)) return;
    const target = Math.floor(requested);
    const cachedCount = htmlPreviewSlideState.get(previewStateKey)?.count;
    const count = slideState?.count ?? cachedCount ?? target + 1;
    setSlideStateCached(previewStateKey, { active: target, count });
    setSlideState({ active: target, count });
    syncCachedSlideStateToIframe();
  }, [slideNavRequest?.nonce, slideNavRequest?.slideIndex, effectiveDeck, previewStateKey, slideState?.count]);

  // Share and Download are separate toolbar intents, but they share the same
  // popover shell so switching between them keeps the menu anchored in place.
  const openUnifiedActionMenu = (
    tab: 'share' | 'export',
    sourceLabel: 'share_dropdown' | 'download_dropdown',
  ) => {
    fireArtifactHeaderClick(sourceLabel);
    setExportReadyNudge(false);
    markExportReadyNudgeSeen(projectId, file.name);
    setDeployMenuOpen((v) => {
      const nextTab = tab === 'share' && !rawCanShare ? 'export' : tab;
      setUnifiedActionTab(nextTab);
      return !(v && unifiedActionTab === nextTab);
    });
  };
  const openShareMenu = () => openUnifiedActionMenu('share', 'share_dropdown');
  const openDownloadMenu = () => openUnifiedActionMenu('export', 'download_dropdown');
  const captureExportImageSnapshot = useCallback(async (
    options?: { wholeDeck?: boolean; context?: HtmlVersionExportContext | null },
  ) => {
    const exportContext = options?.context ?? null;
    const imageDeckSignal = deckExportSignalForContext(exportContext);
    // The host compositor grabs on-screen pixels, so any transient hover chrome
    // over the preview leaks into the capture. The screenshot control's own
    // tooltip is already dismissed by TooltipLayer's pointerdown/click listener,
    // but that setState(null) has not repainted yet when capture starts. Wait
    // two frames so the dismissal commits first — mirrors the double-rAF guard
    // in the browser screenshot flow (DesignBrowserPanel).
    await waitForAnimationFrame();
    await waitForAnimationFrame();
    // Prefer the daemon's off-screen render (desktop only): isolated from the
    // preview pane and, rendering the artifact alone in a hidden window, it can
    // never capture Open Design's own UI. Page exports use the selected preview
    // preset; desktop pages and decks retain the renderer defaults. `wholeDeck`
    // (Export as image) stitches every slide
    // top-to-bottom into one long image — matching the slide count the viewer
    // reports; otherwise (Copy screenshot, Mark/Draw capture) it grabs the
    // CURRENT slide, mirroring what's on screen. An ordinary page is its
    // full-page capture either way.
    if (isOpenDesignHostAvailable() && projectId && file.name) {
      // Deck-vs-page uses the same signal as PDF export — broader than the viewer's nav
      // signal — so runtime-managed decks (`<deck-stage>` / `data-screen-label`,
      // no literal `.slide`) export as a deck instead of a single page-mode shot
      // of slide 1. The vector-PDF fallback below uses the SAME signal, so an
      // artifact exports identically with or without a desktop host.
      const wholeDeck = options?.wholeDeck === true;
      // For a CURRENT-slide capture we need the active slide index, which only
      // exists when the viewer tracks it. Runtime-managed decks have no
      // active-slide bridge (slideState===null); for those the off-screen path
      // would always grab slide 0, so plan to skip it and fall through to the
      // visible host snapshot (= the slide on screen). Whole-deck / pages /
      // tracked `.slide` decks still render off-screen.
      const trackedActive = slideState?.active ?? htmlPreviewSlideState.get(previewStateKey)?.active ?? null;
      const plan = planDeckImageCapture({ deck: imageDeckSignal, wholeDeck, trackedActive });
      if (plan.useOffscreen) {
        const exportViewport = !imageDeckSignal && previewViewport !== 'desktop'
          ? PREVIEW_VIEWPORT_PRESETS.find((preset) => preset.id === previewViewport)
          : null;
        const rendered = await exportProjectImageDataUrl({
          projectId,
          fileName: file.name,
          deck: imageDeckSignal,
          workspaceContext,
          ...(plan.index != null ? { index: plan.index } : {}),
          ...(exportViewport?.width != null ? { width: exportViewport.width } : {}),
          ...(exportViewport?.height != null ? { height: exportViewport.height } : {}),
          ...(exportContext?.versionId ? { versionId: exportContext.versionId } : {}),
        });
        if (rendered.ok) return rendered.snapshot;
        // A semantic failure (e.g. "page is too tall — export as PDF") must surface,
        // NOT silently downgrade to a partial visible-viewport screenshot. Only when
        // the off-screen renderer is genuinely unavailable do we fall through.
        if ('error' in rendered) throw new Error(rendered.error);
      }
    }

    if (exportContext?.versionId) return null;

    // Fallback: desktop compositor screenshot of the visible preview region.
    // Returns real rendered pixels and is never tainted, unlike the in-iframe
    // SVG-foreignObject bridge. Used on pure web (no host) or if the render
    // above is unavailable. Works for both srcDoc and URL-load previews.
    const visibleIframe = iframeRef.current ?? srcDocPreviewIframeRef.current;
    const hostSnapshot = await captureHostIframeSnapshot(visibleIframe);
    if (hostSnapshot) return hostSnapshot;

    if (!useUrlLoadPreview) {
      const activeIframe = srcDocPreviewIframeRef.current ?? iframeRef.current;
      if (!activeIframe) return null;
      await waitForIframeLoadOrTimeout(activeIframe, 250);
      await waitForAnimationFrame();
      return requestPreviewSnapshotWithRetry(activeIframe);
    }

    const urlIframe = iframeRef.current ?? urlPreviewIframeRef.current;
    if (urlIframe) {
      await waitForIframeLoadOrTimeout(urlIframe, 250);
      await waitForAnimationFrame();
      const urlSnapshot = await requestPreviewSnapshotWithRetry(urlIframe);
      if (urlSnapshot) return urlSnapshot;
    }

    const srcDocIframe = srcDocPreviewIframeRef.current;
    if (!srcDocIframe) {
      const activeIframe = iframeRef.current;
      if (!activeIframe) return null;
      return requestPreviewSnapshotWithRetry(activeIframe);
    }

    if (useLazySrcDocTransport && !srcDocShellReady) {
      await waitForIframeLoadOrTimeout(srcDocIframe, 500);
    }
    if (useLazySrcDocTransport && activateSrcDocSnapshotTransport(srcDocIframe)) {
      await waitForIframeLoadOrTimeout(srcDocIframe);
    }
    const restoreVisibility = temporarilyExposeIframeForSnapshot(srcDocIframe);
    try {
      await waitForAnimationFrame();
      return requestPreviewSnapshotWithRetry(srcDocIframe);
    } finally {
      restoreVisibility();
    }
  }, [
    activateSrcDocSnapshotTransport,
    srcDocShellReady,
    useLazySrcDocTransport,
    useUrlLoadPreview,
    deckExportSignalForContext,
    slideState?.active,
    previewStateKey,
    previewViewport,
    projectId,
    file.name,
  ]);

  // NOTE: the clipboard-capture handler that used to live here was removed with
  // the export menu's 截图 row — that row was its only caller. Screenshot-to-chat
  // below is the viewer's capture affordance.

  // Screenshot → chat. Captures the current preview and stages it into the chat
  // composer as a draft attachment; it never auto-sends, so the user still owns
  // the prompt that goes with the shot. This is the toolbar's primary capture
  // affordance because "put this on screen in front of the agent" is the job
  // users actually come here to do — a clipboard copy leaves them to find a
  // paste target themselves.
  const handleScreenshotToChat = useCallback(async () => {
    fireArtifactToolbarClick('edit_screenshot');
    if (screenshotInFlightRef.current) return;
    screenshotInFlightRef.current = true;
    try {
      const snap = await captureExportImageSnapshot();
      if (!snap) {
        setExportToast({ message: t('fileViewer.screenshotPreviewLoading'), tone: 'error' });
        return;
      }
      const blob = await fetch(snap.dataUrl).then((response) => response.blob());
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const shot = new File([blob], `screenshot-${ts}.png`, { type: 'image/png' });
      const detail: AnnotationEventDetail = {
        file: shot,
        note: '',
        action: 'draft',
        filePath: file.name,
        ack: (result) => {
          if (!result.ok) {
            setExportToast({ message: t('fileViewer.screenshotCaptureFailed'), tone: 'error' });
          }
        },
      };
      // The composer is about to upload `shot` into this project's file tree,
      // which the chokidar watcher reports as an ordinary file change. Arm the
      // self-inflicted-refresh guard now, before that upload even starts, so
      // the live-reload effect ignores the `file-changed` echo instead of
      // force-reloading this same preview out from under the user.
      suppressLiveReloadUntilRef.current = Date.now() + 5000;
      window.dispatchEvent(new CustomEvent(ANNOTATION_EVENT, { detail }));
    } catch (err) {
      console.warn('[handleScreenshotToChat] failed:', err);
      const message = err instanceof Error && err.message ? err.message : t('fileViewer.screenshotCaptureFailed');
      setExportToast({ message, tone: 'error' });
    } finally {
      screenshotInFlightRef.current = false;
    }
  }, [captureExportImageSnapshot, file.name, t]);

  const openImageExportModal = async (context?: HtmlVersionExportContext) => {
    // Don't reopen while an export is still running: reopening resets the shared
    // request/result bookkeeping refs, which would mis-attribute or drop the
    // in-flight export's analytics result.
    if (imageExportInFlightRef.current) return;
    flushSync(() => {
      setDeployMenuOpen(false);
    });
    // Start the image export's own click→result correlation (separate modal
    // flow, so it can't ride fireShareExport).
    const requestId = analytics.newRequestId();
    imageExportRequestIdRef.current = requestId;
    imageExportStartedRef.current = performance.now();
    imageExportOriginPromiseRef.current = resolveArtifactExportOrigin(context)
      .catch(() => unknownExportOrigin());
    imageExportResolvedRef.current = false;
    trackShareOptionPopoverClick(
      analytics.track,
      {
        page_name: 'artifact',
        area: 'share_option_popover',
        artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
        artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
        element: 'image',
        project_id: projectId,
        project_kind: projectKind,
      },
      { requestId },
    );
    setImageExportError(null);
    imageExportSnapshotDataUrlRef.current = null;
    setImageExportContext(context ?? null);
    // Just open the modal. Rendering happens on Save, after the user picks a
    // format — not eagerly on open.
    setImageExportModalOpen(true);
  };

  const changeImageExportFormat = (format: ImageExportFormat) => {
    setImageExportFormat(format);
  };

  // Component-scoped so both the save flow and the modal Cancel button can
  // emit the one terminal result for an image export session.
  const fireImageExportResult = (
    result: 'success' | 'failed' | 'cancelled',
    errorCode?: string,
  ) => {
    if (imageExportResolvedRef.current) return;
    imageExportResolvedRef.current = true;
    const requestId = imageExportRequestIdRef.current ?? analytics.newRequestId();
    const started = imageExportStartedRef.current || performance.now();
    const originPromise = imageExportOriginPromiseRef.current
      ?? resolveArtifactExportOrigin().catch(() => unknownExportOrigin());
    void originPromise.then((originProps) => {
      trackArtifactExportResult(
        analytics.track,
        {
          page_name: 'artifact',
          area: 'share_option_popover',
          artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
          artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
          export_format: 'image',
          result,
          ...originProps,
          ...(errorCode ? { error_code: errorCode } : {}),
          export_duration_ms: Math.round(performance.now() - started),
          project_id: projectId,
          project_kind: projectKind,
        },
        { requestId },
      );
    });
    // Onboarding first-loop 交付 step (spec §8.3): only a SUCCESSFUL image
    // export closes the loop. Project-scoped no-op unless started from Home.
    if (result === 'success') recordFirstLoopStep(analytics.track, 'delivered', projectId);
  };

  async function handleImageExportSave() {
    // Single-shot guard: closing the modal is async, so a fast double-click /
    // Enter-repeat on Save could otherwise enqueue two concurrent exports
    // (duplicate captures, downloads, and result bookkeeping) before the first
    // re-render removes the button.
    if (imageExportInFlightRef.current) return;
    imageExportInFlightRef.current = true;
    // Unify with the PPTX/PDF flow: close the modal and surface progress through
    // the same portaled, viewport-centered export toast instead of an in-modal
    // spinner + a separate (non-portaled, off-center) saved toast.
    setImageExportError(null);
    setImageExportModalOpen(false);
    setExportToast({ message: t('fileViewer.exportStarted'), tone: 'loading' });
    // Let the modal unmount before capturing so the web-only host-compositor
    // snapshot can't catch the overlay (the desktop off-screen renderer ignores
    // it either way).
    await waitForAnimationFrame();
    await waitForAnimationFrame();
    try {
      const context = imageExportContext;
      const targetTitle = context?.title ?? exportTitle;
      let dataUrl = imageExportSnapshotDataUrlRef.current;
      if (!dataUrl) {
        // Export as image of a deck = the whole deck stitched into one long
        // image (every slide), matching the count the viewer reports. Copy
        // screenshot keeps the current slide.
        const snap = await captureExportImageSnapshot({ wholeDeck: true, context });
        if (!snap) {
          setExportToast({ message: t('fileViewer.exportImageFailed'), tone: 'error' });
          fireImageExportResult('failed', 'CAPTURE_FAILED');
          return;
        }
        dataUrl = snap.dataUrl;
        imageExportSnapshotDataUrlRef.current = dataUrl;
      }
      const blob = await imageDataUrlToBlob(dataUrl, imageExportFormat);
      if (blob.size <= 0) {
        setExportToast({ message: t('fileViewer.exportImageFailed'), tone: 'error' });
        fireImageExportResult('failed', 'EMPTY_IMAGE');
        return;
      }
      const target = await prepareImageExportTarget(targetTitle, imageExportFormat, { useNativePicker: false });
      if (!target) {
        // User dismissed the save picker — clear the loading toast.
        setExportToast(null);
        fireImageExportResult('cancelled');
        return;
      }
      if (target.method === 'download' && imageExportFormat === 'png' && dataUrl) {
        downloadImageDataUrl(dataUrl, target.filename);
      } else {
        await target.save(blob);
      }
      fireImageExportResult('success');
      setExportToast({
        message:
          target.method === 'picker'
            ? t('fileViewer.exportImageSaved')
            : t('fileViewer.exportImageDownloadStarted'),
        tone: 'success',
      });
    } catch (err) {
      console.warn('[exportAsImage] failed to save snapshot:', err);
      const message = err instanceof Error && err.message ? err.message : t('fileViewer.exportImageFailed');
      setExportToast({ message, tone: 'error' });
      fireImageExportResult('failed', exportErrorCode(err));
    } finally {
      imageExportInFlightRef.current = false;
    }
  }
  // Stable creation-order list (recvq5BVsolIxi): NOT the sidebar's visual
  // order any more (see `visibleSideComments` below) — kept purely so the
  // canvas pin numbering (CommentPreviewOverlays, activePinNumber) has a
  // stable fallback index for a comment that has no server-assigned
  // `pinSeq` yet (a legacy row, or a test fixture), independent of whatever
  // order the sidebar happens to display things in.
  const creationSortedSideComments = useMemo(
    () => previewComments
      .filter((comment) => comment.filePath === file.name && comment.status === 'open')
      .sort((a, b) => commentCreatedAt(a) - commentCreatedAt(b)),
    [file.name, previewComments],
  );
  // Provisional number for the next (not-yet-saved) pin. Computed over the
  // file's comments across ALL statuses — a resolved/attached/failed comment
  // keeps its pin_seq row in the daemon DB, so its number stays retired even
  // though the canvas renders no marker for it (see provisionalNextPinNumber).
  const nextProvisionalPinNumber = useMemo(
    () => provisionalNextPinNumber(
      previewComments
        .filter((comment) => comment.filePath === file.name)
        .sort((a, b) => commentCreatedAt(a) - commentCreatedAt(b)),
    ),
    [file.name, previewComments],
  );
  // Sidebar display order: descending by `sortKey` (a fresh comment gets the
  // largest sortKey, so it shows first by default — "newest at the front").
  // A legacy/un-migrated row without a sortKey falls back to its createdAt,
  // which reproduces the exact same "newest first" default. Persisted
  // server-side (see the `/reorder` route) instead of living only in React
  // state, so a drag survives a refresh/tab-switch/device-switch.
  const visibleSideComments = useMemo(
    () =>
      [...creationSortedSideComments].sort(
        (a, b) => commentEffectiveSortKey(b) - commentEffectiveSortKey(a),
      ),
    [creationSortedSideComments],
  );
  const activeSideCommentId = activePreviewCommentId;
  const activeCommentTargetVisible = commentTargetIntersectsPreview(
    activeCommentTarget,
    overlayPreviewScale,
    { x: overlayPreviewTransform.offsetX, y: overlayPreviewTransform.offsetY },
    previewBodySize,
  );
  useEffect(() => {
    if (!boardMode || !activePreviewCommentId) return;
    const stillOpen = visibleSideComments.some((comment) => comment.id === activePreviewCommentId);
    if (!stillOpen) clearBoardComposer();
  }, [activePreviewCommentId, boardMode, visibleSideComments]);
  useEffect(() => {
    if (!effectiveDeck || slideState == null || !boardMode) return;
    if (!activePreviewCommentId) return;
    const activeComment = visibleSideComments.find((comment) => comment.id === activePreviewCommentId);
    if (activeComment && !commentVisibleOnDeckSlide(activeComment, slideState.active)) {
      clearBoardComposer();
    }
  }, [activePreviewCommentId, boardMode, effectiveDeck, slideState?.active, visibleSideComments]);
  const activeDeployment = deployResult || deployment;
  const activeDeployedUrl = activeDeployment?.url?.trim() || '';
  const activeDeploymentDelayed = activeDeployment?.status === 'link-delayed';
  const activeDeploymentProtected = activeDeployment?.status === 'protected';
  const activeCloudflarePages = activeDeployment?.providerId === CLOUDFLARE_PAGES_PROVIDER_ID
    ? activeDeployment.cloudflarePages
    : undefined;
  const activeCloudflareCustomDomain = activeCloudflarePages?.customDomain;
  const deployProvider = getDeployProviderOption(deployProviderId);
  const deployProviderLabel = t(deployProvider.labelKey);
  const selectedCloudflareZone = cloudflareZones.find((zone) => zone.id === cloudflareZoneId) ?? null;
  const normalizedCloudflarePrefix = normalizeCloudflareDomainPrefixInput(cloudflareDomainPrefix);
  const cloudflareHostnamePreview =
    selectedCloudflareZone && normalizedCloudflarePrefix
      ? `${normalizedCloudflarePrefix}.${selectedCloudflareZone.name}`
      : '';
  const deployResultCards: DeployResultCard[] = activeCloudflarePages
    ? (() => {
        const cards: DeployResultCard[] = [];
        const pagesDevUrl = activeCloudflarePages.pagesDev?.url || activeDeployedUrl;
        if (pagesDevUrl) {
          cards.push({
            id: 'pages-dev',
            label: t('fileViewer.cloudflarePagesDevLinkLabel'),
            url: pagesDevUrl,
            status: activeCloudflarePages.pagesDev?.status || activeDeployment?.status || 'link-delayed',
            message: activeCloudflarePages.pagesDev?.statusMessage,
          });
        }
        if (activeCloudflareCustomDomain?.url) {
          cards.push({
            id: 'custom-domain',
            label: t('fileViewer.cloudflareCustomDomainLinkLabel'),
            url: activeCloudflareCustomDomain.url,
            status: activeCloudflareCustomDomain.status,
            message:
              activeCloudflareCustomDomain.errorMessage ||
              activeCloudflareCustomDomain.statusMessage,
          });
        }
        return cards;
      })()
    : activeDeployedUrl
      ? [{
          id: 'default',
          label: activeDeploymentProtected
            ? t('fileViewer.deployLinkProtectedLabel')
            : activeDeploymentDelayed
              ? t('fileViewer.deployLinkPreparingLabel')
              : t('fileViewer.deployResultLabel'),
          url: activeDeployedUrl,
          status: activeDeployment?.status || 'ready',
          message: activeDeploymentProtected
            ? t('fileViewer.deployLinkProtected')
            : activeDeploymentDelayed
              ? t('fileViewer.deployLinkDelayed')
              : activeDeployment?.statusMessage,
        }]
      : [];
  const deployActionLabelFor = (providerId: WebDeployProviderId) => {
    const option = getDeployProviderOption(providerId);
    const label = t(option.labelKey);
    const hasActiveDeploymentForProvider = Boolean(deploymentsByProvider[providerId]?.url?.trim());
    return hasActiveDeploymentForProvider
      ? t('fileViewer.redeployToProvider', { provider: label })
      : t('fileViewer.deployToProvider', { provider: label });
  };
  const deployedEntries = DEPLOY_PROVIDER_OPTIONS
    .map((option) => deploymentsByProvider[option.id])
    .filter((item): item is WebDeploymentInfo => Boolean(item?.url?.trim()));
  const shareableDeploymentUrl =
    DEPLOY_PROVIDER_OPTIONS.map((option) => deploymentsByProvider[option.id])
      .map((item) => publicShareUrlForDeployment(item))
      .find(Boolean) ?? '';
  // A link is a link: the published-file URL unlocks social sharing exactly
  // like a ready deployment does, so a blocked/protected deployment never
  // gates sharing when a clean publish link exists.
  const socialShareBlockedDeployment =
    shareableDeploymentUrl || publishedFileUrl
      ? null
      : deployedEntries.find((item) => deployResultState(item.status) === 'protected' && !publicShareUrlForDeployment(item)) ??
        deployedEntries.find((item) => !publicShareUrlForDeployment(item)) ??
        null;
  const socialShareBlockedState = socialShareBlockedDeployment
    ? deployResultState(socialShareBlockedDeployment.status)
    : null;
  const socialShareDisplayUrl =
    shareableDeploymentUrl || publishedFileUrl || socialShareBlockedDeployment?.url?.trim() || activeDeployedUrl;
  const socialShareUnavailableMessage =
    socialShareBlockedState === 'protected'
      ? t('fileViewer.deployLinkProtected')
      : socialShareBlockedState === 'delayed'
        ? t('fileViewer.deployLinkDelayed')
        : t('socialShare.deployFirst');
  const projectSocialShareRequest = useMemo<SocialShareRequest | null>(() => {
    if (!socialShareDisplayUrl) return null;
    const title = t('socialShare.projectTitle', { title: exportTitle });
    const text = t('socialShare.projectText', {
      title: exportTitle,
      repo: OPEN_DESIGN_GITHUB_REPO_URL,
    });
    return {
      kind: 'project-html',
      locale,
      url: socialShareDisplayUrl,
      title,
      text,
      copyText: t('socialShare.projectCopyText', {
        title: exportTitle,
        url: socialShareDisplayUrl,
        repo: OPEN_DESIGN_GITHUB_REPO_URL,
      }),
    };
  }, [exportTitle, locale, socialShareDisplayUrl, t]);
  const projectSocialShareFallback = useMemo(
    () => (projectSocialShareRequest ? buildSocialSharePayload(projectSocialShareRequest) : null),
    [projectSocialShareRequest],
  );
  // Gate the async payload load on a stable *content* key, not the memo's
  // object identity. The request object can take a fresh identity on renders
  // where its inputs are value-equal (e.g. while deployment polling re-sets
  // state with a new map reference), and keying the effect on that identity
  // made `setProjectSocialShare` re-fire every render — an infinite render
  // loop once a deployment URL is available (#regression: ready-deploy share).
  const projectSocialShareKey = projectSocialShareRequest
    ? JSON.stringify(projectSocialShareRequest)
    : '';
  useEffect(() => {
    setProjectSocialShare(null);
    if (!projectSocialShareRequest) return;
    let cancelled = false;
    void createSocialSharePayload(projectSocialShareRequest)
      .then((payload) => {
        if (!cancelled) setProjectSocialShare(payload);
      })
      .catch(() => {
        if (!cancelled) setProjectSocialShare(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSocialShareKey]);
  const activeProjectSocialShare = projectSocialShare ?? projectSocialShareFallback;
  const deployActionIconFor = (providerId: WebDeployProviderId) => {
    if (providerId === 'cloudflare-pages') return 'pages-line';
    return 'upload-cloud-line';
  };
  const latestShareDeployment = useMemo(
    () => pickLatestShareDeployment(deploymentsByProvider),
    [deploymentsByProvider],
  );
  const latestDeployedShareUrl = latestShareDeployment
    ? shareUrlForDeployment(latestShareDeployment)
    : '';
  const latestShareState = latestShareDeployment
    ? deployResultState(latestShareDeployment.status)
    : null;
  const sharePageUrl = useMemo(
    () => resolveShareUrl(latestDeployedShareUrl),
    [latestDeployedShareUrl],
  );
  const canCopyShareLink = !streaming && Boolean(sharePageUrl);
  const canOpenSharePage = !streaming && Boolean(sharePageUrl) && latestShareState !== 'delayed';
  const shareLinkStatusHint =
    streaming
      ? t('fileViewer.shareAfterGenerationComplete')
      : latestShareState === 'delayed'
      ? t('fileViewer.deployLinkDelayed')
      : latestShareState === 'protected'
        ? t('fileViewer.deployLinkProtected')
        : '';
  const shareUnavailableHint = streaming
    ? t('fileViewer.shareAfterGenerationComplete')
    : t('fileViewer.shareLinkRequiresDeploy');
  const copyShareLinkLabel =
    shareLinkFeedback === 'copied'
      ? t('fileViewer.copied')
      : shareLinkFeedback === 'failed'
        ? t('useEverywhere.copyFailed')
        : t('fileViewer.copyShareLink');
  const shareMenuLabel = t('fileViewer.shareLabel');
  const deployMenuLabel = t('fileViewer.deployModalTitle') || 'Deploy';
  const isSocialShareDeployModal = deployModalIntent === 'social-share';
  const deployModalKicker = isSocialShareDeployModal
    ? t('socialShare.projectSection')
    : deployProviderLabel;
  const deployModalTitle = isSocialShareDeployModal
    ? t('socialShare.publishPageTitle')
    : t('fileViewer.deployToProvider', { provider: deployProviderLabel });
  const deployModalSubtitle = isSocialShareDeployModal
    ? t('socialShare.publishPageSubtitle')
    : t('fileViewer.deployModalSubtitle');
  const deployButtonLabel =
    deployPhase === 'deploying'
      ? t('fileViewer.deployingToProvider', { provider: deployProviderLabel })
      : deployPhase === 'preparing-link'
        ? t('fileViewer.preparingPublicLink')
        : isSocialShareDeployModal
          ? t('socialShare.publishPageTitle')
          : deployMenuLabel;
  const copyDeployLabel = (url: string) =>
    copiedDeployLink === url.trim()
      ? t('fileViewer.copied')
      : t('fileViewer.copyDeployLink');
  const statusLabelFor = (state: ReturnType<typeof deployResultState>) => {
    if (state === 'ready') return t('fileViewer.deployLinkReady');
    if (state === 'protected') return t('fileViewer.deployLinkProtectedLabel');
    if (state === 'failed') return t('fileViewer.deployLinkFailed');
    return t('fileViewer.deployLinkPreparingLabel');
  };
  const initialPreviewLoading = source === null && !sourceEverLoadedRef.current;
  const sourceModeLoading = mode === 'source' && source === null;
  const boardAvailable = mode === 'preview' && source !== null;
  const showPreviewToolbarControls = mode === 'preview';
  // Independent of the rail's lazy per-slide documents so a collapsed rail
  // (which unmounts DeckThumbnailRail entirely) still renders its toggle.
  const showDeckThumbnailRail = effectiveDeck && source !== null && deckSlideTotal > 0 && !manualEditMode;
  const showDeckFloatingNav = effectiveDeck && deckSlideTotal > 0 && !manualEditMode && !inTabPresent;
  const deckNavTotal = Math.max(deckSlideTotal, activeDeckSlideIndex + 1, 1);
  const versioningAvailable = isHtmlVersionableFile(file);
  const commentPreviewLayoutClass = [
    'comment-preview-layer',
    localCommentSideDockActive ? 'comment-preview-layer-with-side-dock' : '',
    localCommentSideDockActive && commentSidePanelCollapsed ? 'comment-preview-layer-dock-collapsed' : '',
    boardSideDockStacked ? 'comment-preview-layer-side-dock-stacked' : '',
    showDeckThumbnailRail ? 'comment-preview-layer-with-deck-rail' : '',
    showDeckThumbnailRail && deckThumbnailsCollapsed ? 'comment-preview-layer-deck-rail-collapsed' : '',
  ].filter(Boolean).join(' ');
  // Edit mode opens clean: the inspector only appears once the user pins an
  // element (click its hover affordance / a container) or opens page styles by
  // clicking the empty canvas. No more full-height panel popping on toggle.
  const manualEditPageCardActive =
    manualEditMode && !selectedManualEditTarget && manualEditPageStylesOpen;
  const manualEditPanelActive =
    manualEditMode && (!!selectedManualEditTarget || manualEditPageCardActive);
  const manualEditResetAvailable = selectedManualEditTarget ? manualEditDraftDirty : false;
  const manualEditPanel = manualEditPanelActive ? (
    <ManualEditPanel
      targets={manualEditTargets}
      selectedTarget={selectedManualEditTarget}
      draft={manualEditDraft}
      history={manualEditHistory}
      error={manualEditError}
      canUndo={manualEditHistory.length > 0}
      canRedo={manualEditUndone.length > 0}
      busy={manualEditSaving}
      resetAvailable={manualEditResetAvailable}
      pageStylesEnabled={manualEditPageStylesEnabled}
      onSelectTarget={(target) => {
        void selectManualEditTarget(target);
      }}
      onDraftChange={(draft) => {
        setManualEditDraft(draft);
        setManualEditDraftDirty(Boolean(selectedManualEditTarget));
      }}
      onStyleChange={(id, styles, label) => {
        void handleManualEditStyleChange(id, styles, label);
      }}
      onInvalidStyle={cancelManualEditPendingStyles}
      onApplyPatch={(patch, label) => {
        void applyManualEdit(patch, label);
      }}
      onError={setManualEditError}
      onClearSelection={() => {
        void clearManualEditTargetSelection();
      }}
      onExit={() => {
        void dismissManualEditPanel();
      }}
      onCancelDraft={() => {
        void cancelManualEditPanel();
      }}
      onSaveDraft={() => {
        void saveManualEditPanelDraft();
      }}
      onResetDraft={() => {
        void resetManualEditPanelDraft();
      }}
      onUndo={() => {
        void undoManualEdit();
      }}
      onRedo={() => {
        void redoManualEdit();
      }}
      floatingClassName={manualEditPageCardActive ? 'manual-edit-page-card' : undefined}
      floatingStyle={selectedManualEditTarget
        ? {
            ...manualEditFloatingPanelStyle(
              selectedManualEditTarget,
              overlayPreviewScale,
              previewBodySize,
            ),
            ...(manualEditPanelPosition ?? {}),
          }
        : { top: 12, right: 12, width: 320 }}
      onFloatingPositionChange={selectedManualEditTarget ? setManualEditPanelPosition : undefined}
      onPickImage={async (pickedFile) => {
        const result = await uploadProjectFiles(projectId, [pickedFile], undefined, workspaceContext);
        const uploaded = result.uploaded[0];
        if (!uploaded?.path) {
          setManualEditError(result.error ?? t('manualEdit.uploadImageFailed'));
          return null;
        }
        setManualEditError(null);
        return toOwnerRelativePath(file.name, uploaded.path);
      }}
    />
  ) : null;
  const manualEditHoverAffordance =
    manualEditMode &&
    manualEditHoverTarget &&
    manualEditHoverTarget.id !== selectedManualEditTarget?.id ? (
      <button
        type="button"
        className="manual-edit-hover-action"
        data-testid="manual-edit-hover-open"
        aria-label={t('manualEdit.editParams')}
        title={t('manualEdit.editParams')}
        style={manualEditHoverIconStyle(
          manualEditHoverTarget,
          overlayPreviewScale,
          previewBodySize,
        )}
        onClick={() => {
          const target = manualEditHoverTarget;
          setManualEditHoverTarget(null);
          void selectManualEditTarget(target);
        }}
      >
        <Icon name="sliders" size={15} />
      </button>
    ) : null;
  const activeComposerComment = activePreviewCommentId
    ? visibleSideComments.find((comment) => comment.id === activePreviewCommentId) ?? null
    : null;
  const activeComposerAttachments =
    activeComposerComment?.attachments ?? activeCommentExistingAttachments;
  // Team-collab permission model for a comment's action buttons (庆雨,
  // 2026-07-09). `myMemberId` is the viewer's presence identity — the same
  // `workspaceMemberId` the B lane stamps on `authorMemberId`; null off-team.
  // `iAmProjectOwner` is the collab-resolved project owner (the single writer),
  // failing closed until the status poll confirms it. A comment with no author
  // (a brand-new one in the create flow, or any off-team / legacy row) is the
  // current user's to act on, so it reads as "mine". Only the author may EDIT
  // their own note; the author OR the project owner may delete it or send it to
  // the agent. The B lane enforces the same rules server-side.
  const myMemberId = collab.member?.memberId ?? null;
  const iAmProjectOwner = collab.isOwner;
  const commentAuthoredByMe = (comment: PreviewComment | null | undefined): boolean => {
    // No persisted comment means this is the create flow: the draft belongs
    // to the current viewer, including a read-only member/admin annotating
    // someone else's shared project.
    if (!comment) return true;
    const authorId = comment?.authorMemberId ?? null;
    // A legacy shared comment without an author is deliberately owner-only.
    // Treating it as "mine" for every member made the client advertise a
    // destructive action the daemon must reject. Personal/unshared comments
    // retain their historical single-user behavior.
    if (authorId == null) return !collab.enabled || iAmProjectOwner;
    return authorId === myMemberId;
  };
  const canSendCommentToAgent = (comment: PreviewComment | null | undefined): boolean =>
    commentAuthoredByMe(comment) || iAmProjectOwner;
  const canEditActiveComment = commentAuthoredByMe(activeComposerComment);
  const canDeleteActiveComment = canEditActiveComment || iAmProjectOwner;
  const canSendActiveComment = canEditActiveComment || iAmProjectOwner;
  // The viewer's own author identity for the comment cards. Derived from the
  // workspace context this component ALREADY reads (see `workspaceContext`
  // above) — no extra request. Deliberately NOT `collab.member`, which is null
  // on a personal workspace and on an unshared project, i.e. exactly the cases
  // where a comment lost its avatar and name.
  const commentAuthorSelf = useMemo(
    () => currentUserDirectoryEntry(
      projectResourceReadBlocked ? null : workspaceContext,
    ),
    [workspaceContext, projectResourceReadBlocked],
  );
  const commentComposerPortalMetrics = (() => {
    if (!commentComposerHost || !commentPreviewCanvasNode) return null;
    const hostRect = commentComposerHost.getBoundingClientRect();
    const canvasRect = commentPreviewCanvasNode.getBoundingClientRect();
    if (hostRect.width <= 0 || hostRect.height <= 0) return null;
    return {
      host: commentComposerHost,
      bounds: {
        width: hostRect.width,
        height: hostRect.height,
        scrollLeft: commentComposerHost.scrollLeft,
        scrollTop: commentComposerHost.scrollTop,
      },
      offset: {
        x: canvasRect.left - hostRect.left + commentComposerHost.scrollLeft + overlayPreviewTransform.offsetX,
        y: canvasRect.top - hostRect.top + commentComposerHost.scrollTop + overlayPreviewTransform.offsetY,
      },
    };
  })();
  const commentComposerNode = boardMode && activeCommentTarget && activeCommentTargetVisible ? (
    <BoardComposerPopover
      target={activeCommentTarget}
      existing={activeComposerComment}
      canEditComment={canEditActiveComment}
      canDeleteComment={canDeleteActiveComment}
      canSendToAgent={canSendActiveComment}
      draft={commentDraft}
      notes={queuedBoardNotes}
      onDraft={setCommentDraft}
      onAddDraft={queueCurrentDraft}
      onRemoveQueuedNote={(index) =>
        setQueuedBoardNotes((current) => current.filter((_, currentIndex) => currentIndex !== index))
      }
      onClose={clearBoardComposer}
      onSaveComment={() => { fireCommentPopoverClick('save_comment'); return savePersistentComment(); }}
      onSendBatch={() => { fireCommentPopoverClick('send_to_chat'); return sendBoardBatch(); }}
      images={boardImagePreviews}
      existingImages={
        activeComposerAttachments.map((attachment) => ({
          url: projectRawUrl(projectId, attachment.path, workspaceContext),
          name: attachment.name,
        }))
      }
      onAttachImages={addBoardImages}
      onRemoveImage={removeBoardImage}
      onPreviewImage={setBoardPreviewIndex}
      onRemoveMember={(elementId) => {
        setActiveCommentTarget((current) => {
          const { next, shouldClose } = applyPodMemberRemoval(current, elementId);
          if (shouldClose) clearBoardComposer();
          return next;
        });
        setHoveredPodMemberId((current) => (current === elementId ? null : current));
      }}
      onHoverMember={setHoveredPodMemberId}
      onViewAllComments={(returnFocusTarget) => {
        commentPanelReturnFocusRef.current = returnFocusTarget ?? null;
        setCommentPanelOpen(true);
        setCommentSidePanelCollapsed(false);
      }}
      onDeleteComment={onRemovePreviewComment ? async (commentId) => {
        const removed = await onRemovePreviewComment(commentId);
        if (!removed) return;
        clearBoardComposer();
        setSelectedSideCommentIds((current) => {
          if (!current.has(commentId)) return current;
          const next = new Set(current);
          next.delete(commentId);
          return next;
        });
        setActivePreviewCommentId((current) => (current === commentId ? null : current));
      } : undefined}
      sending={sendingBoardBatch}
      queueOnSend={commentQueueOnSend}
      sendDisabled={commentSendDisabled || viewerOnly}
      sendDisabledReason={viewerOnly ? viewerOnlyDisabledTitle : undefined}
      allowSendToChat={!viewerOnly}
      t={t}
      scale={overlayPreviewScale}
      offset={
        commentComposerPortalMetrics?.offset ?? {
          x: overlayPreviewTransform.offsetX,
          y: overlayPreviewTransform.offsetY,
        }
      }
      bounds={commentComposerPortalMetrics?.bounds ?? previewBodySize}
      docked={false}
      commenting
    />
  ) : null;
  const commentComposer = workspaceActive && commentComposerNode && commentComposerPortalMetrics
    ? createPortal(commentComposerNode, commentComposerPortalMetrics.host)
    : workspaceActive ? commentComposerNode : null;
  const boardPreviewImage =
    boardPreviewIndex !== null ? boardImagePreviews[boardPreviewIndex] ?? null : null;
  const boardImagePreviewModal = workspaceActive && boardPreviewImage
    ? createPortal(
        <div
          className="staged-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={boardPreviewImage.file.name}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setBoardPreviewIndex(null);
          }}
        >
          <div className="staged-preview-card">
            <div className="staged-preview-head">
              <span title={boardPreviewImage.file.name}>{boardPreviewImage.file.name}</span>
              <button
                type="button"
                className="icon-only od-tooltip"
                onClick={() => setBoardPreviewIndex(null)}
                aria-label={t('common.close')}
                title={t('common.close')}
                data-tooltip={t('common.close')}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <img src={boardPreviewImage.url} alt={boardPreviewImage.file.name} />
          </div>
        </div>,
        document.body,
      )
    : null;
  const commentSidePanel = workspaceActive && commentPanelOpen ? (
    <CommentSideDock
      comments={visibleSideComments}
      projectId={projectId}
      selectedIds={selectedSideCommentIds}
      activeCommentId={activeSideCommentId}
      // The panel used to be pinned open whenever it was portaled (it docked
      // into a full-height column, where a collapsed rail made no sense). It
      // now always floats as a card, so its collapse control has to actually
      // collapse — forcing `false` here made every click a no-op.
      collapsed={commentSidePanelCollapsed}
      onCollapsedChange={setCommentSidePanelCollapsed}
      // On a floating card, collapse closes the card and mirrors the toolbar
      // toggle's OFF branch so one click reopens it. Closing only the panel
      // would leave create/board mode on and consume that next click. The local
      // dock keeps its collapse-to-rail behaviour.
      onDismiss={commentPortalHost ? dismissFloatingCommentPanel : undefined}
      onToggleSelect={(commentId) => {
        setSelectedSideCommentIds((current) => {
          const next = new Set(current);
          if (next.has(commentId)) next.delete(commentId);
          else next.add(commentId);
          return next;
        });
      }}
      onSelectAll={() =>
        setSelectedSideCommentIds(
          new Set(
            visibleSideComments
              .filter((comment) => canSendCommentToAgent(comment))
              .map((comment) => comment.id),
          ),
        )
      }
      onClearSelection={() => setSelectedSideCommentIds(new Set())}
      onReorder={(orderedIds, draggedId) => {
        const sortKey = computeReorderedSortKey(visibleSideComments, orderedIds, draggedId);
        void onReorderPreviewComment?.(draggedId, sortKey);
      }}
      onReply={(comment) => {
        // Reply == edit on a flat-thread model: prefill the
        // popover with the existing note so the user sees and
        // mutates the current text. Save runs through the
        // same upsert path; matching project/conv/file/element
        // updates note in place rather than creating a new row.
        const snapshot = liveSnapshotForComment(comment, liveCommentTargets) ?? {
          filePath: comment.filePath,
          elementId: comment.elementId,
          selector: comment.selector,
          label: comment.label,
          text: comment.text,
          position: comment.position,
          htmlHint: comment.htmlHint,
          style: comment.style,
          selectionKind: comment.selectionKind ?? 'element',
          memberCount: comment.memberCount,
          podMembers: comment.podMembers,
          ...(typeof comment.slideIndex === 'number' ? { slideIndex: comment.slideIndex } : {}),
        };
        setActiveCommentTarget(snapshot);
        setHoveredCommentTarget(snapshot);
        setActivePreviewCommentId(comment.id);
        setCommentDraft(comment.note);
        setQueuedBoardNotes([]);
        setActiveCommentExistingAttachments(comment.attachments ?? []);
        setBoardMode(true);
        setCommentCreateMode(true);
        setCommentPanelOpen(true);
        setCommentSidePanelCollapsed(false);
      }}
      onSendSelected={async () => {
        if (!onSendBoardCommentAttachments) return;
        const selected = visibleSideComments.filter(
          (comment) => (
            selectedSideCommentIds.has(comment.id)
            && canSendCommentToAgent(comment)
          ),
        );
        if (selected.length === 0) return;
        fireCommentPopoverClick('send_to_chat');
        setSendingBoardBatch(true);
        try {
          const result = await onSendBoardCommentAttachments(
            commentsToAttachments(selected),
          );
          const completedIds = new Set(result.commentIds);
          if (completedIds.size === 0 || !onRemovePreviewComment) return;
          const removedIds = new Set<string>();
          const removals = await Promise.all(
            selected
              .filter((comment) => completedIds.has(comment.id))
              .map(async (comment) => ({
                id: comment.id,
                removed: await onRemovePreviewComment(comment.id),
              })),
          );
          for (const removal of removals) {
            if (removal.removed) removedIds.add(removal.id);
          }
          setSelectedSideCommentIds((current) => {
            const next = new Set(current);
            for (const id of removedIds) next.delete(id);
            return next;
          });
          setActivePreviewCommentId((current) => (
            current && removedIds.has(current) ? null : current
          ));
        } finally {
          setSendingBoardBatch(false);
        }
      }}
      onCreateComment={savePanelComment}
      canSendComment={canSendCommentToAgent}
      currentUser={commentAuthorSelf}
      sending={sendingBoardBatch}
      queueOnSend={commentQueueOnSend}
      sendDisabled={commentSendDisabled || viewerOnly}
      sendDisabledReason={viewerOnly ? viewerOnlyDisabledTitle : undefined}
      allowSendToChat={!viewerOnly}
      renderCreateForm={!commentPortalHost}
      t={t}
      composer={null}
    />
  ) : null;
  const speakerNotesFeedback = speakerNotesStatus === 'saved'
      ? { className: 'saved', label: t('fileViewer.speakerNotesSaved') }
      : speakerNotesStatus === 'error'
        ? { className: 'error', label: t('fileViewer.speakerNotesSaveFailed') }
        : null;
  const speakerNotesPanel = showSpeakerNotesPanel ? (
    <section className="speaker-notes-panel" data-testid="speaker-notes-panel" aria-label={t('fileViewer.speakerNotes')}>
      <div className="speaker-notes-panel-head">
        <div className="speaker-notes-panel-title">
          <span>{t('fileViewer.speakerNotes')}</span>
          <span className="speaker-notes-panel-meta">
            {t('fileViewer.speakerNotesSlide', {
              current: activeDeckSlideIndex + 1,
              total: Math.max(deckSlideCount, speakerNotes.length, 1),
            })}
          </span>
        </div>
        {speakerNotesFeedback ? (
          <span
            className={`speaker-notes-status speaker-notes-header-status ${speakerNotesFeedback.className}`}
            aria-live="polite"
          >
            {speakerNotesFeedback.label}
          </span>
        ) : null}
      </div>
      {speakerNotesEditMode ? (
        <div className="speaker-notes-editor">
          <textarea
            ref={speakerNotesTextareaRef}
            value={speakerNotesDraft}
            onChange={(event) => setSpeakerNotesDraft(event.currentTarget.value)}
            onBlur={() => {
              void saveActiveSpeakerNote();
            }}
            placeholder={t('fileViewer.speakerNotesPlaceholder')}
            rows={4}
          />
        </div>
      ) : (
        <div
          className="speaker-notes-preview"
          role="textbox"
          tabIndex={0}
          aria-readonly="true"
          onClick={beginSpeakerNotesEdit}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            beginSpeakerNotesEdit();
          }}
        >
          {activeSpeakerNote.trim() ? (
            activeSpeakerNote
          ) : (
            <span className="speaker-notes-empty">{t('fileViewer.speakerNotesEmpty')}</span>
          )}
        </div>
      )}
    </section>
  ) : null;

  return (
    <div className={`viewer html-viewer${inTabPresent ? ' is-tab-present' : ''}${viewerOnly ? ' html-viewer--viewer-only' : ''}`}>
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          {showDeckThumbnailRail ? (
            <button
              type="button"
              className="icon-only deck-thumbnail-toolbar-toggle od-tooltip"
              aria-expanded={!deckThumbnailsCollapsed}
              aria-label={deckThumbnailsCollapsed ? t('designFiles.expandGroup') : t('designFiles.collapseGroup')}
              title={deckThumbnailsCollapsed ? t('designFiles.expandGroup') : t('designFiles.collapseGroup')}
              data-tooltip={deckThumbnailsCollapsed ? t('designFiles.expandGroup') : t('designFiles.collapseGroup')}
              data-tooltip-placement="bottom"
              onClick={() => {
                fireDeckViewerClick('thumbnail_rail_toggle', {
                  action: deckThumbnailsCollapsed ? 'expand' : 'collapse',
                  slide_index: activeDeckSlideIndex,
                  slide_count: deckSlideTotal,
                });
                setDeckThumbnailsCollapsed((value) => !value);
              }}
            >
              <Icon name="panel-left" size={15} />
            </button>
          ) : null}
          <button
            type="button"
            className="icon-only od-tooltip"
            onClick={reloadHtmlPreview}
            title={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
            data-tooltip={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
            data-tooltip-placement="bottom"
            aria-label={`${t('fileViewer.reloadAria')} ${t('fileViewer.preview')}`}
          >
            <Icon name="reload" size={14} />
          </button>
          {/* Two-segment pill tablist: both destinations stay visible and the
              active one is legible at a glance. A single toggle that flips its
              own label reads as "what am I looking at now?" and forces the user
              to click to find out. */}
          <div className="viewer-tabs viewer-mode-tabs" role="tablist" aria-label="View mode">
            {([
              ['preview', t('fileViewer.preview'), 'eye-line'],
              ['source', t('fileViewer.source'), 'code-s-slash-line'],
            ] as const).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={`viewer-tab ${mode === id ? 'active' : ''}`}
                aria-selected={mode === id}
                disabled={viewerOnly && id === 'source'}
                title={viewerOnly && id === 'source' ? viewerOnlyDisabledTitle : undefined}
                onClick={() => {
                  fireArtifactToolbarClick(id);
                  selectMode(id);
                }}
              >
                <RemixIcon name={icon} size={14} className="viewer-tab-icon" />
                <span className="viewer-tab-label">{label}</span>
              </button>
            ))}
          </div>
          {showPreviewToolbarControls ? (
            <span className="viewer-preview-toolbar-inline">
              <PreviewViewportControls
                viewport={previewViewport}
                onViewport={setPreviewViewport}
                t={t}
              />
            </span>
          ) : null}
          {showPreviewToolbarControls && showDeckNavigation && !showDeckFloatingNav ? (
            <span
              className="deck-nav viewer-deck-nav-inline"
              role="group"
              aria-label={t('fileViewer.slideNavAria')}
            >
              <button
                type="button"
                className="icon-only od-tooltip"
                onClick={() => postSlide('prev')}
                title={t('fileViewer.previousSlide')}
                data-tooltip={t('fileViewer.previousSlide')}
                data-tooltip-placement="bottom"
                aria-label={t('fileViewer.previousSlide')}
                disabled={slideState !== null && slideState.active <= 0}
              >
                <Icon name="chevron-right" size={14} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <span className="deck-nav-counter">
                {slideState
                  ? `${slideState.active + 1} / ${slideState.count}`
                  : '— / —'}
              </span>
              <button
                type="button"
                className="icon-only od-tooltip"
                onClick={() => postSlide('next')}
                title={t('fileViewer.nextSlide')}
                data-tooltip={t('fileViewer.nextSlide')}
                data-tooltip-placement="bottom"
                aria-label={t('fileViewer.nextSlide')}
                disabled={
                  slideState !== null &&
                  slideState.active >= slideState.count - 1
                }
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </span>
          ) : null}
        </div>
        <div className="viewer-toolbar-actions">
          {showPreviewToolbarControls ? (
            <div className="viewer-toolbar-inline-actions">
              {mode === 'preview' ? (
                <button
                  type="button"
                  className="viewer-action viewer-action-icon od-tooltip"
                  data-testid="edit-screenshot-to-chat-button"
                  data-tooltip={viewerOnly ? viewerOnlyDisabledTitle : t('fileViewer.editScreenshotToChat')}
                  data-tooltip-placement="bottom"
                  title={viewerOnly ? viewerOnlyDisabledTitle : t('fileViewer.editScreenshotToChat')}
                  aria-label={t('fileViewer.editScreenshotToChat')}
                  disabled={viewerOnly}
                  onClick={() => void handleScreenshotToChat()}
                >
                  <RemixIcon name="camera-line" size={15} />
                </button>
              ) : null}
              <div className="artifact-tool-menu-anchor">
                <button
                  type="button"
                  className={`viewer-action viewer-action-icon viewer-comment-toggle od-tooltip${boardMode && !commentCreateMode && boardTool === 'inspect' ? ' active' : ''}`}
                  data-testid="board-mode-toggle"
                  data-tooltip={t('fileViewer.comment')}
                  data-tooltip-placement="bottom"
                  title={t('fileViewer.comment')}
                  aria-label={t('fileViewer.comment')}
                  aria-pressed={boardMode && !commentCreateMode && boardTool === 'inspect'}
                  onClick={activateCommentTool}
                >
                  <RemixIcon name="chat-new-line" size={15} />
                </button>
              </div>
              <button
                className={`viewer-action viewer-action-icon od-tooltip${drawOverlayOpen ? ' active' : ''}`}
                type="button"
                data-testid="draw-overlay-toggle"
                data-tooltip={viewerOnly ? viewerOnlyDisabledTitle : t('fileViewer.mark')}
                data-tooltip-placement="bottom"
                disabled={viewerOnly}
                title={viewerOnly ? viewerOnlyDisabledTitle : t('fileViewer.mark')}
                aria-label={t('fileViewer.mark')}
                aria-pressed={drawOverlayOpen}
                onClick={activateDrawTool}
              >
                <RemixIcon name="mark-pen-line" size={15} />
              </button>
              <span className="viewer-toolbar-tool-divider" aria-hidden />
              <button
                className={`viewer-action viewer-action-icon od-tooltip${manualEditMode ? ' active' : ''}`}
                type="button"
                data-testid="manual-edit-mode-toggle"
                data-tooltip={viewerOnly ? viewerOnlyDisabledTitle : t('fileViewer.edit')}
                data-tooltip-placement="bottom"
                disabled={viewerOnly || (!manualEditMode && !manualEditEntryAllowed)}
                title={viewerOnly ? viewerOnlyDisabledTitle : t('fileViewer.edit')}
                aria-label={t('fileViewer.edit')}
                aria-pressed={manualEditMode}
                onClick={activateManualEditTool}
              >
                <RemixIcon name="edit-line" size={15} />
              </button>
              <span className="viewer-toolbar-tool-divider" aria-hidden />
              <button
                ref={commentPanelToggleRef}
                type="button"
                className={`viewer-action viewer-comment-count-trigger viewer-comment-toggle od-tooltip${boardMode && commentCreateMode ? ' active' : ''}`}
                data-testid="comment-panel-toggle"
                data-tooltip={t('chat.tabComments')}
                data-tooltip-placement="bottom"
                title={t('chat.tabComments')}
                aria-label={`${t('chat.tabComments')} (${visibleSideComments.length})`}
                aria-pressed={boardMode && commentCreateMode}
                onClick={(event) => activateCommentCreateTool(event.currentTarget)}
              >
                <RemixIcon name="message-3-line" size={15} />
                <span className="viewer-comment-count" aria-hidden>{visibleSideComments.length}</span>
              </button>
              {source !== null && mode === 'preview' ? (
                <div className="zoom-menu viewer-toolbar-zoom" ref={zoomMenuRef}>
                  <button
                    type="button"
                    className="viewer-action zoom-trigger od-tooltip"
                    aria-haspopup="menu"
                    aria-expanded={zoomMenuOpen}
                    title={t('fileViewer.resetZoom')}
                    data-tooltip={t('fileViewer.resetZoom')}
                    data-tooltip-placement="bottom"
                    onClick={() => {
                      fireArtifactToolbarClick('zoom_level_dropdown');
                      setZoomMenuOpen((v) => !v);
                    }}
                  >
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{previewZoomText}</span>
                  </button>
                  {zoomMenuOpen ? (
                    <div className="zoom-menu-popover" role="menu">
                      {[50, 75, 100, 125, 150, 200].map((level) => (
                        <button
                          key={level}
                          type="button"
                          className={`zoom-menu-item${zoomLevelActive(level) ? ' active' : ''}`}
                          role="menuitem"
                          onClick={() => {
                            setPreviewZoomCached(fileViewportKey, level, 'manual');
                            setZoomMode('manual');
                            setZoom(level);
                            setZoomMenuOpen(false);
                          }}
                        >
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{level}%</span>
                          {zoomLevelActive(level) ? (
                            <Icon name="check" size={13} />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="viewer-toolbar-more" ref={toolbarMoreRef}>
            <button
              ref={toolbarMoreTriggerRef}
              type="button"
              className="viewer-action viewer-action-icon od-tooltip"
              aria-label={t('nextStep.more')}
              aria-haspopup="menu"
              aria-expanded={toolbarMoreOpen}
              data-tooltip={t('nextStep.more')}
              data-tooltip-placement="bottom"
              title={t('nextStep.more')}
              onClick={() => setToolbarMoreOpen((value) => !value)}
            >
              <RemixIcon name="more-2-line" size={16} />
            </button>
            {toolbarMoreOpen ? (
              <div className="viewer-toolbar-more-menu" role="menu">
                {versioningAvailable ? (
                  <button
                    type="button"
                    data-od-version-entry="true"
                    className="viewer-toolbar-more-item"
                    role="menuitem"
                    disabled={source === null}
                    onClick={() => {
                      fireArtifactToolbarClick('versions', 'more_menu');
                      setVersionModalOpen('more_menu');
                      setToolbarMoreOpen(false);
                    }}
                  >
                    <RemixIcon name="history-line" size={15} />
                    <span>{t('fileViewer.versions.entry')}</span>
                  </button>
                ) : null}
                {showPreviewToolbarControls ? (
                  <>
                    <div className="viewer-toolbar-more-separator" role="separator" />
                    {PREVIEW_VIEWPORT_PRESETS.map((preset) => {
                      const selected = previewViewport === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={`viewer-toolbar-more-item${selected ? ' active' : ''}`}
                          role="menuitem"
                          title={t(preset.titleKey)}
                          onClick={() => {
                            setPreviewViewport(preset.id);
                            setToolbarMoreOpen(false);
                          }}
                        >
                          <RemixIcon name={previewViewportIcon(preset.id)} size={15} />
                          <span>{t(preset.labelKey)}</span>
                          {selected ? <Icon name="check" size={13} /> : null}
                        </button>
                      );
                    })}
                    {showDeckNavigation ? (
                      <>
                        <div className="viewer-toolbar-more-separator" role="separator" />
                        <button
                          type="button"
                          className="viewer-toolbar-more-item"
                          role="menuitem"
                          disabled={slideState !== null && slideState.active <= 0}
                          onClick={() => {
                            postSlide('prev');
                            setToolbarMoreOpen(false);
                          }}
                        >
                          <Icon name="chevron-right" size={14} style={{ transform: 'rotate(180deg)' }} />
                          <span>{t('fileViewer.previousSlide')}</span>
                        </button>
                        <button
                          type="button"
                          className="viewer-toolbar-more-item"
                          role="menuitem"
                          disabled={slideState !== null && slideState.active >= slideState.count - 1}
                          onClick={() => {
                            postSlide('next');
                            setToolbarMoreOpen(false);
                          }}
                        >
                          <Icon name="chevron-right" size={14} />
                          <span>{t('fileViewer.nextSlide')}</span>
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className={`viewer-toolbar-more-item${boardMode && !commentCreateMode && boardTool === 'inspect' ? ' active' : ''}`}
                      role="menuitem"
                      onClick={() => {
                        activateCommentTool();
                        setToolbarMoreOpen(false);
                      }}
                    >
                      <RemixIcon name="chat-new-line" size={15} />
                      <span>{t('fileViewer.comment')}</span>
                    </button>
                    <button
                      type="button"
                      className={`viewer-toolbar-more-item${drawOverlayOpen ? ' active' : ''}`}
                      role="menuitem"
                      onClick={() => {
                        activateDrawTool();
                        setToolbarMoreOpen(false);
                      }}
                    >
                      <RemixIcon name="mark-pen-line" size={15} />
                      <span>{t('fileViewer.mark')}</span>
                    </button>
                    <button
                      type="button"
                      className={`viewer-toolbar-more-item${manualEditMode ? ' active' : ''}`}
                      role="menuitem"
                      disabled={viewerOnly || (!manualEditMode && !manualEditEntryAllowed)}
                      onClick={() => {
                        activateManualEditTool();
                        setToolbarMoreOpen(false);
                      }}
                    >
                      <RemixIcon name="edit-line" size={15} />
                      <span>{t('fileViewer.edit')}</span>
                    </button>
                    <button
                      type="button"
                      className={`viewer-toolbar-more-item${boardMode && commentCreateMode ? ' active' : ''}`}
                      role="menuitem"
                      onClick={() => {
                        activateCommentCreateTool(toolbarMoreTriggerRef.current);
                        setToolbarMoreOpen(false);
                      }}
                    >
                      <RemixIcon name="message-3-line" size={15} />
                      <span>{t('chat.tabComments')} ({visibleSideComments.length})</span>
                    </button>
                    {source !== null && mode === 'preview' ? (
                      <>
                        <div className="viewer-toolbar-more-separator" role="separator" />
                        {[50, 75, 100, 125, 150, 200].map((level) => (
                          <button
                            key={level}
                            type="button"
                            className={`viewer-toolbar-more-item${zoomLevelActive(level) ? ' active' : ''}`}
                            role="menuitem"
                            onClick={() => {
                              setPreviewZoomCached(fileViewportKey, level, 'manual');
                              setZoomMode('manual');
                              setZoom(level);
                              setToolbarMoreOpen(false);
                            }}
                          >
                            <RemixIcon name="zoom-in-line" size={15} />
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{level}%</span>
                            {zoomLevelActive(level) ? <Icon name="check" size={13} /> : null}
                          </button>
                        ))}
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {workspaceActive ? ((filePrimaryActions: ReactNode) => (
        chromeActionsHost ? createPortal(filePrimaryActions, chromeActionsHost) : filePrimaryActions
      ))(<>
          {showPresent ? (
            <div className="present-wrap chrome-present-wrap">
              <button
                className="chrome-action chrome-action-secondary chrome-action-icon present-trigger od-tooltip"
                aria-haspopup="menu"
                aria-expanded={presentMenuOpen}
                aria-label={t('fileViewer.present')}
                data-tooltip={t('fileViewer.present')}
                data-tooltip-placement="bottom"
                title={t('fileViewer.present')}
                onClick={() => {
                  fireArtifactHeaderClick('present_dropdown');
                  setPresentMenuOpen((v) => !v);
                }}
              >
                <RemixIcon name="slideshow-3-line" size={15} />
              </button>
              {presentMenuOpen ? (
                <div className="present-menu" role="menu">
                  <button role="menuitem" onClick={() => { firePresentPopoverClick('in_this_tab'); presentInThisTab(); }}>
                    <span className="present-icon"><RemixIcon name="eye-line" size={14} /></span>{' '}
                    <span className="present-menu-copy">
                      <span>{t('fileViewer.presentInTab')}</span>
                      {effectiveDeck ? <small>{t('fileViewer.presentInTabDeckHint')}</small> : null}
                    </span>
                  </button>
                  <button role="menuitem" onClick={() => { firePresentPopoverClick('fullscreen'); presentFullscreen(); }}>
                    <span className="present-icon"><RemixIcon name="play-line" size={14} /></span>{' '}
                    {t('fileViewer.presentFullscreen')}
                  </button>
                  <button role="menuitem" onClick={() => { firePresentPopoverClick('new_tab'); presentNewTab(); }}>
                    <span className="present-icon"><RemixIcon name="share-forward-line" size={14} /></span>{' '}
                    {t('fileViewer.presentNewTab')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {versioningAvailable && (rawCanShare || rawCanDownload) ? (
            <button
              type="button"
              data-od-version-entry="true"
              className={`chrome-action chrome-action-secondary chrome-action-icon od-tooltip${versionModalOpen ? ' is-active' : ''}`}
              // Same disabled contract as the Share button directly below:
              // `viewerOnly` + `viewerOnlyDisabledTitle`. A readonly shared
              // project has no history to show a member in the first place —
              // `.file-versions` is excluded from member mirrors, so the
              // owner's real history never arrives — so an openable entry only
              // ever led to an empty panel. This supersedes recvq56vFjQKfT,
              // which had un-gated the entry on the reasoning that browsing
              // history is a read action.
              disabled={source === null || viewerOnly}
              aria-label={t('fileViewer.versions.entry')}
              aria-expanded={Boolean(versionModalOpen)}
              data-tooltip={viewerOnly ? viewerOnlyDisabledTitle : t('fileViewer.versions.entryFull')}
              data-tooltip-placement="bottom"
              title={viewerOnly ? viewerOnlyDisabledTitle : t('fileViewer.versions.entryFull')}
              onClick={() => {
                // The version history is a floating panel now, not a modal, so
                // the toolbar icon is a toggle: a second click dismisses it.
                if (versionModalOpen) {
                  setVersionModalOpen(false);
                  return;
                }
                fireArtifactToolbarClick('versions', 'toolbar');
                setVersionModalOpen('toolbar');
              }}
            >
              <RemixIcon name="history-line" size={15} />
            </button>
          ) : null}
          {rawCanShare || rawCanDownload ? (
            <div className="chrome-file-action-menus">
              {/* Outside-click dismissal is scoped to the Share/Export pair —
                  the handoff split button next door must count as "outside" so
                  opening it closes this popover (and vice versa via the
                  handoff button's own dismiss listener). */}
              <div className="share-menu chrome-share-menu chrome-share-menu--unified" ref={shareRef}>
                {/* Share and Export are separate header intents again (the
                    0.18.0 unified tabs buried Export one level deep and export
                    reach halved); they still share one popover shell so
                    switching between them keeps the menu anchored in place.
                    Export leads and carries the dark (primary) treatment —
                    it is the far more used of the two (30-day: ~14k users
                    exported successfully vs ~0.6k who attempted a deploy). */}
                {rawCanDownload ? (
                  <button
                    type="button"
                    className={
                      'chrome-action chrome-action-secondary chrome-action-with-label chrome-action-text-only chrome-action-unified chrome-action-dark' +
                      (exportReadyNudge ? ' export-ready-nudge' : '')
                    }
                    aria-haspopup="menu"
                    aria-expanded={deployMenuOpen && unifiedActionTab === 'export'}
                    aria-label={t('fileViewer.unifiedExportTab')}
                    disabled={viewerOnly}
                    title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                    onClick={openDownloadMenu}
                  >
                    <RemixIcon name="download-line" size={15} />
                    <span>{t('fileViewer.unifiedExportTab')}</span>
                  </button>
                ) : null}
                {rawCanShare ? (
                  <button
                    type="button"
                    className="chrome-action chrome-action-secondary chrome-action-with-label chrome-action-text-only chrome-action-unified"
                    aria-haspopup="menu"
                    aria-expanded={deployMenuOpen && unifiedActionTab === 'share'}
                    aria-label={shareMenuLabel}
                    disabled={viewerOnly}
                    title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                    onClick={openShareMenu}
                  >
                    <RemixIcon name="share-forward-line" size={15} />
                    <span>{shareMenuLabel}</span>
                  </button>
                ) : null}
                {deployMenuOpen && (rawCanShare || rawCanDownload) ? (
                  <div className="share-menu-popover chrome-unified-popover" role="menu">
                    {unifiedActionTab === 'share' && rawCanShare ? (
                      <div className="chrome-unified-panel chrome-unified-panel--share">
                      {/* Team-only, same as ReactComponentViewer's copy of this card above —
                          see the comment there (recvq5bM78HWCE). */}
                      {workspaceContextHasTeamIdentity(workspaceContext) ? (
                      <>
                      {/* Access control gets the same section-label + row treatment as the
                          publish / deploy / save tiers below; its explanation moves into the
                          trailing "?" instead of a card sub-line. */}
                      <div className="share-menu-section-label share-menu-section-label--help" role="presentation">
                        <span>{t('fileViewer.workspaceShareTitle')}</span>
                        <button
                          type="button"
                          className="share-menu-help od-tooltip"
                          data-testid="workspace-access-help"
                          aria-label={shareAccess === 'private'
                            ? t('fileViewer.workspaceSharePrivateDescription')
                            : t('fileViewer.workspaceShareWorkspaceDescription')}
                          data-tooltip={shareAccess === 'private'
                            ? t('fileViewer.workspaceSharePrivateDescription')
                            : t('fileViewer.workspaceShareWorkspaceDescription')}
                          data-tooltip-placement="bottom"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <RemixIcon name="question-line" size={14} />
                        </button>
                      </div>
                      <div className="chrome-access-select">
                          <button
                            type="button"
                            className="chrome-access-trigger"
                            aria-haspopup="listbox"
                            aria-expanded={shareAccessMenuOpen}
                            disabled={shareAccessBusy || viewerOnly}
                            onClick={() => setShareAccessMenuOpen((v) => !v)}
                          >
                            <span className="share-menu-icon">
                              {/* recvqaVLC3MNaQ: same spinner-over-disabled fix as the
                                  ReactComponentViewer copy of this card above. */}
                              <RemixIcon
                                name={
                                  shareAccessBusy
                                    ? 'loader-4-line'
                                    : shareAccess === 'private'
                                      ? 'lock-line'
                                      : 'team-line'
                                }
                                size={16}
                                className={shareAccessBusy ? 'icon-spin' : undefined}
                              />
                            </span>
                            <span>
                              {shareAccess === 'private'
                                ? t('fileViewer.workspaceAccessPrivate')
                                : t('fileViewer.workspaceAccessMembers')}
                            </span>
                            <RemixIcon name="arrow-down-s-line" size={16} />
                          </button>
                          {shareAccessMenuOpen ? (
                            <div className="chrome-access-options" role="listbox">
                              {([
                                ['private', 'lock-line', t('fileViewer.workspaceAccessPrivate')],
                                ['workspace', 'team-line', t('fileViewer.workspaceAccessMembers')],
                              ] as const).map(([value, icon, label]) => (
                                <button
                                  key={value}
                                  type="button"
                                  role="option"
                                  aria-selected={shareAccess === value}
                                  className={shareAccess === value ? 'is-active' : undefined}
                                  disabled={shareAccessBusy || viewerOnly}
                                  onClick={() => void setWorkspaceShareAccess(value)}
                                >
                                  <span className="share-menu-icon"><RemixIcon name={icon} size={16} /></span>
                                  <span>{label}</span>
                                  {shareAccess === value ? <RemixIcon name="check-line" size={15} /> : null}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </>
                      ) : null}
                      {/* Publishing is a menu row like every other action in
                          this panel (deploy, save-as-template): same section
                          label, same icon + label row, with a trailing "?"
                          whose tooltip explains reach and the single-file
                          limitation. The published state swaps the row for the
                          link block (content, not an action). */}
                      {canPublishPublic ? (
                      <>
                      {/* The "?" lives on the section label, not inside the publish
                          menuitem: activating it is a help-discovery gesture, and
                          nesting it in the row would make that gesture publish a
                          public link (no hover-only path exists on touch). Same
                          structure as the workspace-access help above. */}
                      <div className="share-menu-section-label share-menu-section-label--help" role="presentation">
                        <span>{t('fileViewer.shareMenuPublishViaOd')}</span>
                        <button
                          type="button"
                          className="share-menu-help od-tooltip"
                          data-testid="publish-help"
                          aria-label={t('fileViewer.publishSingleFileDescription')}
                          data-tooltip={t('fileViewer.publishSingleFileDescription')}
                          data-tooltip-placement="bottom"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <RemixIcon name="question-line" size={14} />
                        </button>
                      </div>
                      {filePublished ? (
                        <div className="chrome-publish-plain">
                          <div className="chrome-publish-url" title={publishedFileUrl}>
                              {publishedFileUrl}
                            </div>
                            <div className="chrome-publish-actions">
                              <button
                                type="button"
                                className="chrome-publish-button"
                                onClick={() => {
                                  void copyPublishedFileLink();
                                }}
                              >
                                <RemixIcon name="file-copy-line" size={14} />
                                {publishLinkFeedback === 'copied'
                                  ? t('fileViewer.copied')
                                  : publishLinkFeedback === 'failed'
                                    ? t('useEverywhere.copyFailed')
                                    : t('fileViewer.copyShareLink')}
                              </button>
                              <button
                                type="button"
                                className="chrome-publish-button chrome-publish-button--ghost"
                                disabled={publishingPublicFile}
                                onClick={() => {
                                  void unpublishCurrentFilePublic();
                                }}
                              >
                                {t('fileViewer.unpublishFile')}
                              </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="share-menu-item"
                          role="menuitem"
                          disabled={viewerOnly || publishingPublicFile}
                          aria-busy={publishingPublicFile}
                          title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                          onClick={() => {
                            void publishCurrentFilePublic();
                          }}
                        >
                          <span className="share-menu-icon">
                            <RemixIcon
                              name={publishingPublicFile ? 'loader-4-line' : 'upload-cloud-2-line'}
                              size={15}
                              className={publishingPublicFile ? 'icon-spin' : undefined}
                            />
                          </span>
                          <span>{publishingPublicFile ? t('fileViewer.publishingFile') : t('fileViewer.publishSingleFileTitle')}</span>
                        </button>
                      ) }
                      {publishFailureKey ? (
                        <p className="chrome-publish-error" role="status">
                          {t(publishFailureKey)}
                        </p>
                      ) : null}
                      </>
                      ) : null}
                      {/* The share panel is organized by intent, not by
                          backend: the publish card above is the hero "get a
                          link" path; social icons appear only once ANY link
                          exists (published or deployed); Vercel/Cloudflare are
                          the secondary "more ways to publish" tier; save-as-
                          template keeps its spot at the bottom. */}
                      {/* Icons only for a CLEAN link (published file or a
                          deployment whose share page is live) — a protected or
                          still-preparing deployment must not hand out a URL
                          that recipients cannot open. */}
                      {activeProjectSocialShare && (shareableDeploymentUrl || publishedFileUrl) ? (
                        <>
                          <div className="share-menu-section-label" role="presentation">
                            {t('socialShare.projectSection')}
                          </div>
                          <SocialShareGrid share={activeProjectSocialShare} />
                        </>
                      ) : null}
                      <div className="share-menu-divider" />
                      <div className="share-menu-section-label" role="presentation">
                        {t('fileViewer.shareMenuPublishOnline')}
                      </div>
                      {DEPLOY_PROVIDER_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className="share-menu-item"
                          role="menuitem"
                          disabled={streaming || viewerOnly}
                          title={
                            viewerOnly
                              ? viewerOnlyDisabledTitle
                              : streaming
                                ? t('fileViewer.shareAfterGenerationComplete')
                                : undefined
                          }
                          onClick={() => {
                            void openDeployModal(option.id);
                          }}
                        >
                          <span className="share-menu-icon"><RemixIcon name={deployActionIconFor(option.id)} size={15} /></span>
                          <span>{deployActionLabelFor(option.id)}</span>
                        </button>
                      ))}
                      {sharePageUrl ? (
                        <>
                          <button
                            type="button"
                            className="share-menu-item"
                            role="menuitem"
                            disabled={!canCopyShareLink || viewerOnly}
                            title={
                              viewerOnly
                                ? viewerOnlyDisabledTitle
                                : canCopyShareLink
                                  ? undefined
                                  : shareUnavailableHint
                            }
                            onClick={() => {
                              void copyShareLink(sharePageUrl);
                            }}
                          >
                            <span className="share-menu-icon"><RemixIcon name="file-copy-line" size={15} /></span>
                            <span>{copyShareLinkLabel}</span>
                          </button>
                          <button
                            type="button"
                            className="share-menu-item"
                            role="menuitem"
                            disabled={!canOpenSharePage || viewerOnly}
                            title={
                              viewerOnly
                                ? viewerOnlyDisabledTitle
                                : canOpenSharePage
                                  ? undefined
                                  : shareLinkStatusHint || shareUnavailableHint
                            }
                            onClick={() => {
                              if (!canOpenSharePage) return;
                              window.open(sharePageUrl, '_blank', 'noopener');
                            }}
                          >
                            <span className="share-menu-icon"><RemixIcon name="external-link-line" size={15} /></span>
                            <span>{t('fileViewer.openSharePage')}</span>
                          </button>
                        </>
                      ) : null}
                      {sharePageUrl && (shareLinkStatusHint || shareUnavailableHint) ? (
                        <div className="share-menu-section-label" role="presentation">
                          {shareLinkStatusHint || shareUnavailableHint}
                        </div>
                      ) : null}
                      <div className="share-menu-divider" />
                      <div className="share-menu-section-label" role="presentation">
                        {t('fileViewer.shareMenuSave')}
                      </div>
                      <button
                        type="button"
                        className="share-menu-item"
                        role="menuitem"
                        disabled={savingTemplate || viewerOnly}
                        title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                        onClick={() => {
                          openSaveAsTemplateModal();
                        }}
                      >
                        <span className="share-menu-icon"><RemixIcon name="file-copy-line" size={15} /></span>
                        <span>
                          {savingTemplate
                            ? t('fileViewer.savingTemplate')
                            : templateNote
                              ? templateNote
                              : t('fileViewer.saveAsTemplate')}
                        </span>
                      </button>
                      </div>
                    ) : null}
                    {unifiedActionTab === 'export' && rawCanDownload ? (
                      <div className="chrome-unified-panel">
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    disabled={viewerOnly}
                    title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                    onClick={() => {
                      setDeployMenuOpen(false);
                      // Pixel-perfect screenshot PDF (matches the preview, same
                      // renderer as image/PPTX). Chosen over Chromium's vector
                      // printToPDF because that path drops CJK glyphs in the
                      // packaged runtime (no embedded fonts) — unacceptable for a
                      // Chinese-first product. Falls back to the vector/browser
                      // print path on web or on failure.
                      fireShareExport('pdf', async () => {
                        if (isOpenDesignHostAvailable()) {
                          const res = await exportProjectScreenshotPdf({
                            projectId,
                            fileName: file.name,
                            title: exportTitle,
                            workspaceContext,
                            // Broader deck signal than the viewer's nav so
                            // runtime-managed decks (<deck-stage>) paginate per
                            // slide; the vector fallback below uses the SAME
                            // signal, so an artifact exports identically with or
                            // without a desktop host (no per-host divergence).
                            deck: deckExportSignal,
                          });
                          if (res.ok) return;
                          // A SEMANTIC failure (bad deck routing, unreadable
                          // renderer output, renderer 502, …) must surface — NOT
                          // silently downgrade to the vector PDF, which can
                          // reintroduce the CJK-glyph / fidelity bugs the
                          // screenshot path exists to avoid. Only a genuinely
                          // unavailable renderer (no host / 501 / transport)
                          // falls through to the vector path below.
                          if (!('unavailable' in res)) throw new Error(res.error);
                        }
                        await exportProjectAsPdf({
                          deck: deckExportSignal,
                          fallbackPdf: () => exportAsPdf(source ?? '', exportTitle, { deck: deckExportSignal, onProgress: onExportProgress }),
                          filePath: file.name,
                          projectId,
                          title: exportTitle,
                          workspaceContext,
                        });
                      });
                    }}
                  >
                    <span className="share-menu-icon"><RemixIcon name="file-line" size={15} /></span>
                    <span>{t('fileViewer.exportPdf')}</span>
                  </button>
                  {showPptxExport ? (
                    <button
                      type="button"
                      className="share-menu-item"
                      role="menuitem"
                      disabled={!canPptx}
                      title={
                        streaming
                          ? t('fileViewer.exportPptxBusy')
                          : t('fileViewer.exportPptxHint')
                      }
                      onClick={() => {
                        setDeployMenuOpen(false);
                        setPptxExportMode('editable');
                        setPptxExportModalOpen(true);
                      }}
                    >
                      <span className="share-menu-icon"><RemixIcon name="file-ppt-line" size={15} /></span>
                      <span>{t('fileViewer.exportPptx')}</span>
                    </button>
                  ) : null}
                  {showImageExport ? (
                    <button
                      type="button"
                      className="share-menu-item"
                      role="menuitem"
                      onClick={() => {
                        void openImageExportModal();
                      }}
                    >
                      <span className="share-menu-icon"><RemixIcon name="image-line" size={15} /></span>
                      <span>{t('fileViewer.exportImage')}</span>
                    </button>
                  ) : null}
                  {/* NOTE: no clipboard-capture ("截图") row here. Export is the
                      "produce a file/link out of this artifact" menu; a capture
                      that only lands on the clipboard is a different job and the
                      toolbar's screenshot-to-chat already leads with it. */}
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    disabled={viewerOnly}
                    title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                    onClick={() => {
                      setDeployMenuOpen(false);
                      fireShareExport('zip', () => exportProjectAsZip({
                        projectId,
                        filePath: file.name,
                        fallbackHtml: source ?? '',
                        fallbackTitle: exportTitle,
                        workspaceContext,
                      }));
                    }}
                  >
                    <span className="share-menu-icon"><RemixIcon name="file-zip-line" size={15} /></span>
                    <span>{t('fileViewer.exportZip')}</span>
                  </button>
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    disabled={viewerOnly}
                    title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                    onClick={() => {
                      setDeployMenuOpen(false);
                      fireShareExport('html', () => exportProjectAsHtml({
                        projectId,
                        filePath: file.name,
                        fallbackTitle: exportTitle,
                        workspaceContext,
                      }));
                    }}
                  >
                    <span className="share-menu-icon"><RemixIcon name="file-code-line" size={15} /></span>
                    <span>{t('fileViewer.exportHtml')}</span>
                  </button>
                  {showMarkdownExport ? (
                    <button
                      type="button"
                      className="share-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setDeployMenuOpen(false);
                        fireShareExport('markdown', () => exportAsMd(source ?? '', exportTitle));
                      }}
                    >
                      <span className="share-menu-icon"><RemixIcon name="file-line" size={15} /></span>
                      <span>{t('fileViewer.exportMd')}</span>
                    </button>
                  ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {viewerOnly ? null : (
                <HandoffButton
                  projectId={projectId}
                  projectName={projectName}
                  projectDir={projectDir}
                  agents={agents}
                  artifactId={artifactId}
                  artifactKind={handoffArtifactKind}
                  metricsConsent={metricsConsent}
                  installationId={installationId}
                />
              )}
            </div>
          ) : null}
      </>) : null}
      <div className="viewer-body" ref={previewBodyRef}>
        {initialPreviewLoading || sourceModeLoading ? (
          initialPreviewLoading ? (
            <FileViewerLoadingSkeleton />
          ) : (
            <div className="viewer-empty">{t('fileViewer.loading')}</div>
          )
        ) : mode === 'preview' ? (
          <div
            className={`${manualEditMode ? 'manual-edit-workspace' : commentPreviewLayoutClass} preview-viewport preview-viewport-${previewViewport}${drawOverlayOpen ? ' preview-draw-active' : ''}`}
            data-testid={manualEditMode ? undefined : 'comment-preview-layout'}
            ref={manualEditMode ? undefined : setCommentComposerHostRef}
            style={previewViewportStyle(previewViewport, previewScale, boardPreviewCanvasSize, boardPreviewScaleOptions)}
            onMouseLeave={manualEditMode ? clearManualEditHover : undefined}
          >
            {manualEditPanel}
            {manualEditHoverAffordance}
            {showDeckThumbnailRail && !deckThumbnailsCollapsed ? (
              <DeckThumbnailRail
                count={deckSlideTotal}
                activeIndex={activeDeckSlideIndex}
                labelTotal={deckNavTotal}
                buildThumbSrcDoc={buildDeckThumbnailSrcDoc}
                parsedDeck={parsedDeckThumbnails}
                onSelect={(index) => {
                  fireDeckViewerClick('thumbnail_select', {
                    slide_index: index,
                    slide_count: deckSlideTotal,
                  });
                  handleDeckThumbnailSelect(index);
                }}
              />
            ) : null}
            <div
              className={manualEditMode ? 'manual-edit-canvas' : 'comment-preview-canvas'}
              data-testid={manualEditMode ? undefined : 'comment-preview-canvas'}
              ref={manualEditMode ? undefined : setCommentPreviewCanvasRef}
            >
              <div className={manualEditMode ? undefined : 'comment-frame-clip'} style={manualEditMode ? { height: '100%' } : undefined}>
                <div
                  style={
                    manualEditMode
                      ? manualEditPreviewShellStyle(previewViewport, previewScale, manualEditViewportWidth)
                      : previewScaleShellStyle(previewViewport, previewScale)
                  }
                >
                  <PreviewDrawOverlay
                    active={drawOverlayOpen}
                    onActiveChange={setDrawOverlayOpen}
                    captureViewport
                    captureSnapshot={captureExportImageSnapshot}
                    captureTarget={null}
                    filePath={file.name}
                    sendDisabled={streaming}
                    sendDisabledReason={t('chat.annotationSendDisabledReason')}
                    onToolbarClick={fireDrawToolbarClick}
                    toolbarHost={manualEditMode ? null : commentComposerHost}
                  >
                    <div className="artifact-preview-transport-stack">
                      {OD_PREVIEW_KEEP_ALIVE ? (
                        <PooledIframe
                          ref={urlPreviewIframeRef}
                          cacheKey={urlPreviewKeepAliveKey}
                          data-testid={workspaceActive
                            ? (useUrlLoadPreview ? 'artifact-preview-frame' : 'artifact-preview-frame-url-load')
                            : `artifact-preview-frame-retained-${file.name}`}
                          data-od-render-mode="url-load"
                          data-od-active={workspaceActive && useUrlLoadPreview ? 'true' : 'false'}
                          aria-hidden={workspaceActive && useUrlLoadPreview ? undefined : true}
                          tabIndex={workspaceActive && useUrlLoadPreview ? 0 : -1}
                          title={file.name}
                          data-od-powered={usePoweredPreview ? 'true' : undefined}
                          sandbox={urlFrameSandbox}
                          allow={urlFrameAllow}
                          src={urlFrameSrc}
                          onLoad={() => {
                            const frame = urlPreviewIframeRef.current;
                            if (useUrlLoadPreview) iframeRef.current = frame;
                            if (frame) frame.dataset.odLoadedSrc = frame.getAttribute('src') ?? '';
                            if (frame) {
                              frame.dataset.odLoadedPreviewEpoch =
                                new URL(frame.getAttribute('src') ?? '', window.location.href)
                                  .searchParams.get('odPreviewEpoch') ?? '';
                            }
                            if (useUrlLoadPreview) beginDesktopPreviewContentMeasurementGeneration(frame);
                            // First real paint of this artifact URL — drop the
                            // first-load overlay. about:blank parks don't count.
                            if ((frame?.getAttribute('src') ?? 'about:blank') !== 'about:blank') {
                              urlPreviewLoadedKeysRef.current.add(urlPreviewKeepAliveKey);
                              setUrlPreviewFirstLoadPending(false);
                            }
                            setUrlSelectionBridgeReady(false);
                            dcViewportRestoreAtRef.current = Date.now();
                            frame?.contentWindow?.postMessage({
                              type: '__dc_set_viewport',
                              ...dcViewportRef.current,
                            }, '*');
                            frame?.contentWindow?.postMessage({ type: 'od:url-selection-bridge-probe' }, '*');
                            syncBridgeModes(frame);
                            if (useUrlLoadPreview) restorePreviewScrollPosition();
                            if (useUrlLoadPreview) scheduleDesktopPreviewContentMeasure(frame);
                          }}
                        />
                      ) : (
                        <iframe
                          ref={urlPreviewIframeRef}
                          data-testid={workspaceActive
                            ? (useUrlLoadPreview ? 'artifact-preview-frame' : 'artifact-preview-frame-url-load')
                            : `artifact-preview-frame-retained-${file.name}`}
                          data-od-render-mode="url-load"
                          data-od-active={workspaceActive && useUrlLoadPreview ? 'true' : 'false'}
                          aria-hidden={workspaceActive && useUrlLoadPreview ? undefined : true}
                          tabIndex={workspaceActive && useUrlLoadPreview ? 0 : -1}
                          title={file.name}
                          data-od-powered={usePoweredPreview ? 'true' : undefined}
                          sandbox={urlFrameSandbox}
                          allow={urlFrameAllow}
                          src={urlFrameSrc}
                          onLoad={() => {
                            const frame = urlPreviewIframeRef.current;
                            if (useUrlLoadPreview) iframeRef.current = frame;
                            if (frame) frame.dataset.odLoadedSrc = frame.getAttribute('src') ?? '';
                            if (frame) {
                              frame.dataset.odLoadedPreviewEpoch =
                                new URL(frame.getAttribute('src') ?? '', window.location.href)
                                  .searchParams.get('odPreviewEpoch') ?? '';
                            }
                            if (useUrlLoadPreview) beginDesktopPreviewContentMeasurementGeneration(frame);
                            // First real paint of this artifact URL — drop the
                            // first-load overlay. about:blank parks don't count.
                            if ((frame?.getAttribute('src') ?? 'about:blank') !== 'about:blank') {
                              urlPreviewLoadedKeysRef.current.add(urlPreviewKeepAliveKey);
                              setUrlPreviewFirstLoadPending(false);
                            }
                            setUrlSelectionBridgeReady(false);
                            dcViewportRestoreAtRef.current = Date.now();
                            frame?.contentWindow?.postMessage({
                              type: '__dc_set_viewport',
                              ...dcViewportRef.current,
                            }, '*');
                            frame?.contentWindow?.postMessage({ type: 'od:url-selection-bridge-probe' }, '*');
                            syncBridgeModes(frame);
                            if (useUrlLoadPreview) restorePreviewScrollPosition();
                            if (useUrlLoadPreview) scheduleDesktopPreviewContentMeasure(frame);
                          }}
                        />
                      )}
                      <iframe
                        key={srcDocTransportResetKey}
                        ref={srcDocPreviewIframeRef}
                        data-testid={workspaceActive
                          ? (useUrlLoadPreview ? 'artifact-preview-frame-srcdoc' : 'artifact-preview-frame')
                          : `artifact-preview-frame-srcdoc-retained-${file.name}`}
                        data-od-render-mode="srcdoc"
                        data-od-active={workspaceActive && !useUrlLoadPreview ? 'true' : 'false'}
                        aria-hidden={workspaceActive && !useUrlLoadPreview ? undefined : true}
                        tabIndex={workspaceActive && !useUrlLoadPreview ? 0 : -1}
                        title={file.name}
                        sandbox="allow-scripts allow-downloads"
                        srcDoc={srcDocTransportContent}
                        onLoad={() => {
                          const frame = srcDocPreviewIframeRef.current;
                          // Record whether this load ever saw a real layout
                          // pass — a load completing in a hidden browser tab
                          // did not, and decks then need a fresh parse on
                          // return to visible (#6583). See
                          // srcDocLoadRequiresFreshParseOnReturnToVisible.
                          srcDocLoadedWhileDocumentHiddenRef.current =
                            document.visibilityState === 'hidden';
                          if (!useUrlLoadPreview) iframeRef.current = frame;
                          if (frame) {
                            frame.dataset.odLoadedPreviewEpoch =
                              transportPreviewMeasurementDocumentEpoch;
                          }
                          if (!useUrlLoadPreview) beginDesktopPreviewContentMeasurementGeneration(frame);
                          // Reset the activation dedupe exactly ONCE per
                          // freshly mounted iframe DOM node, never on the
                          // subsequent load events that the same node
                          // emits during normal srcDoc rendering.
                          //
                          // The iframe's load event fires twice for one
                          // successful activation: once when the lazy
                          // transport shell HTML loads, and again when
                          // our own document.open/write/close inside the
                          // shell finishes. PR #2699 reset the dedupe on
                          // every load so that switching
                          // preview -> source -> preview (which remounts
                          // this iframe as a fresh DOM node) would
                          // re-activate the new shell. But resetting on
                          // every load also re-activated on the SECOND
                          // load of a non-remounted frame, which
                          // re-triggered document.open/write/close, which
                          // re-fired the load event, ad infinitum. The
                          // dedupe ref oscillated between null and the
                          // current srcDoc thousands of times per render
                          // and each iteration restarted every CSS
                          // animation from its `from` keyframe. Designs
                          // using `animation-fill-mode: both` with
                          // `from { opacity: 0 }` stayed at opacity 0
                          // forever and the preview read as blank.
                          // That is issue #2361.
                          //
                          // Tracking the last frame we reset for lets us
                          // keep PR #2699's "remount after Source toggle"
                          // fix while breaking the loop on plain renders.
                          if (frame && srcDocFrameDedupeResetForRef.current !== frame) {
                            srcDocFrameDedupeResetForRef.current = frame;
                            activatedSrcDocTransportHtmlRef.current = null;
                          }
                          if (useLazySrcDocTransport) setSrcDocShellReady(true);
                          activateLoadedSrcDocTransport(frame);
                          verifyLoadedSrcDocTransport(frame);
                          dcViewportRestoreAtRef.current = Date.now();
                          frame?.contentWindow?.postMessage({
                            type: '__dc_set_viewport',
                            ...dcViewportRef.current,
                          }, '*');
                          replayInspectOverridesToIframe(frame);
                          syncBridgeModes(frame);
                          syncCachedSlideStateToIframe(frame);
                          if (!useUrlLoadPreview) restorePreviewScrollPosition();
                          if (!useUrlLoadPreview) scheduleDesktopPreviewContentMeasure(frame);
                        }}
                      />
                      {useUrlLoadPreview && urlPreviewFirstLoadPending ? (
                        // First-ever URL-load of this artifact: the iframe's own
                        // navigation may still be queued behind heavy same-origin
                        // traffic (drafts/all-projects cover iframes) — without
                        // this cover the pane reads as a dead white screen.
                        <div
                          className="artifact-preview-first-load"
                          role="status"
                          aria-busy="true"
                          aria-label={t('fileViewer.loading')}
                          data-testid="artifact-preview-first-load"
                        >
                          <CenteredLoader label={t('fileViewer.loading')} />
                        </div>
                      ) : null}
                      {!useUrlLoadPreview && !srcDocTransportContent && previewSource === null ? (
                        // srcDoc-path twin of the cover above: while the
                        // preview content is still PENDING — the scoped-asset
                        // rewrite waiting on the project file list (deck on a
                        // workspace-scoped project), or a Reload's synchronous
                        // clear before its re-fetch lands — the active iframe
                        // is a blank document and the pane reads as a dead
                        // white screen without this cover. Both hold states
                        // are exactly `previewSource === null`; a loaded
                        // zero-byte file is `previewSource === ''` (empty
                        // srcDoc with nothing in flight), so keying on srcDoc
                        // emptiness alone would pin this loader forever over
                        // a legitimately empty document.
                        <div
                          className="artifact-preview-first-load"
                          role="status"
                          aria-busy="true"
                          aria-label={t('fileViewer.loading')}
                          data-testid="artifact-preview-first-load"
                        >
                          <CenteredLoader label={t('fileViewer.loading')} />
                        </div>
                      ) : null}
                    </div>
                  </PreviewDrawOverlay>
                  {previewAssetWarning ? (
                    <div className="preview-asset-warning" role="alert" data-testid="preview-asset-warning">
                      <strong>{t('fileViewer.previewAssetBlockedTitle')}</strong>
                      <span>
                        {t('fileViewer.previewAssetBlockedDetail', { filePath: previewAssetWarning.filePath })}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
              {boardMode ? (
                <CommentPreviewOverlays
                  comments={commentCreateMode ? creationSortedSideComments : []}
                  provisionalPinNumber={nextProvisionalPinNumber}
                  driftLadder={collab.enabled}
                  currentVersion={collab.publishedVersion ?? undefined}
                  {...(collab.onLostAnchors ? { onLostAnchors: collab.onLostAnchors } : {})}
                  liveTargets={liveCommentTargets}
                  hoveredTarget={hoveredCommentTarget}
                  hoveredPodMemberId={hoveredPodMemberId}
                  activeTarget={activeCommentTarget}
                  activeExistingCommentId={activeComposerComment?.id ?? null}
                  boardTool={boardTool}
                  showActivePin={commentCreateMode}
                  scale={overlayPreviewScale}
                  offsetX={overlayPreviewTransform.offsetX}
                  offsetY={overlayPreviewTransform.offsetY}
                  strokePoints={strokePoints}
                  activeSlideIndex={effectiveDeck ? slideState?.active ?? null : null}
                  onOpenComment={(comment, snapshot) => {
                    setCommentPanelOpen(true);
                    setCommentSidePanelCollapsed(false);
                    setCommentCreateMode(true);
                    setBoardMode(true);
                    setActiveCommentTarget(snapshot);
                    setHoveredCommentTarget(snapshot);
                    setActivePreviewCommentId(comment.id);
                    setCommentDraft(comment.note);
                    setQueuedBoardNotes([]);
                    setActiveCommentExistingAttachments(comment.attachments ?? []);
                  }}
                />
              ) : null}
              {/* Portaled to <body> so the screenshot/export toast escapes the
                  preview pane's transform + overflow:hidden. */}
              {workspaceActive && exportToast && !versionModalOpen
                ? createPortal(
                    <Toast
                      message={exportToast.message}
                      tone={exportToast.tone}
                      role={exportToast.tone === 'error' ? 'alert' : 'status'}
                      ttlMs={exportToast.tone === 'loading' ? 60000 : 2200}
                      placement="top"
                      onDismiss={exportToast.tone === 'loading' ? undefined : () => setExportToast(null)}
                    />,
                    document.body,
                  )
                : null}
              {workspaceActive && commentSavedToast ? (
                <div className="comment-toast-anchor">
                  <Toast
                    message={commentSavedToast}
                    ttlMs={2200}
                    onDismiss={() => setCommentSavedToast(null)}
                  />
                </div>
              ) : null}
              {workspaceActive && templateSavedToast ? (
                <div className="comment-toast-anchor">
                  <Toast
                    message={templateSavedToast}
                    ttlMs={2200}
                    onDismiss={() => setTemplateSavedToast(null)}
                  />
                </div>
              ) : null}
              {showDeckFloatingNav ? (
                <div className="deck-floating-nav" aria-label="Deck navigation">
                  <button
                    type="button"
                    className="deck-floating-button od-tooltip"
                    aria-label={t('fileViewer.previousSlide')}
                    title={t('fileViewer.previousSlide')}
                    data-tooltip={t('fileViewer.previousSlide')}
                    data-tooltip-placement="top"
                    disabled={activeDeckSlideIndex <= 0}
                    onClick={() => postSlide('prev')}
                  >
                    <Icon name="chevron-left" size={14} />
                  </button>
                  <span className="deck-floating-count" aria-live="polite">
                    <strong>{activeDeckSlideIndex + 1}</strong>
                    <span>/</span>
                    <span>{deckNavTotal}</span>
                  </span>
                  <button
                    type="button"
                    className="deck-floating-button od-tooltip"
                    aria-label={t('fileViewer.nextSlide')}
                    title={t('fileViewer.nextSlide')}
                    data-tooltip={t('fileViewer.nextSlide')}
                    data-tooltip-placement="top"
                    disabled={activeDeckSlideIndex >= deckNavTotal - 1}
                    onClick={() => postSlide('next')}
                  >
                    <Icon name="chevron-right" size={14} />
                  </button>
                  <span className="deck-floating-divider" aria-hidden="true" />
                  <button
                    type="button"
                    className="deck-floating-reset"
                    onClick={() => {
                      fireDeckViewerClick('slide_reset', {
                        slide_index: activeDeckSlideIndex,
                        slide_count: deckSlideTotal,
                      });
                      goToSlide(0);
                    }}
                    disabled={activeDeckSlideIndex <= 0}
                  >
                    {t('fileViewer.presenterReset')}
                    <kbd>R</kbd>
                  </button>
                </div>
              ) : null}
              {commentComposer}
              {boardMode && !commentCreateMode && hoveredCommentTarget && (!activeCommentTarget || commentPortalHost) ? (
                <AnnotationHoverPopover
                  target={hoveredCommentTarget}
                  scale={overlayPreviewScale}
                  bounds={previewBodySize}
                  offset={{ x: overlayPreviewTransform.offsetX, y: overlayPreviewTransform.offsetY }}
                  onMouseEnter={() => {
                    hoverCardPinnedRef.current = true;
                    cancelHoverCardDismiss();
                  }}
                  onMouseLeave={() => {
                    hoverCardPinnedRef.current = false;
                    scheduleHoverCardDismiss();
                  }}
                />
              ) : null}
              {/*
                Hint banner for Inspect / Picker modes. The bridge in
                `apps/web/src/runtime/srcdoc.ts` posts `od:comment-targets`
                with every element annotated with `data-od-id` /
                `data-screen-label`, so `liveCommentTargets.size` is the
                authoritative annotation count for the current artifact.

                Two states:
                - "has targets": the existing copy ("Click any element with
                  `data-od-id` to tune its style.") for users who just don't
                  see the crosshair cursor.
                - "no targets" (issue #890): a freeform-generated artifact
                  (e.g. PRD → HTML through a Claude-Code-compatible CLI
                  without a skill) ships zero `data-od-id` annotations. The
                  bridge's click handler walks up to <html>, finds nothing,
                  and bails — clicks no-op silently. The static copy made
                  this look broken; the empty-state copy explains what's
                  missing and how to fix it. Mirrored across Inspect and
                  element-pick annotation mode because the failure surface is identical.
              */}
              {inspectMode
                && openHintBox
                && !activeInspectTarget
                && !activeCommentTarget ? (
                <div
                  className="inspect-empty-hint-container"
                  data-testid="inspect-empty-hint-container"
                >
                  {liveCommentTargets.size === 0 ? (
                    <div
                      className="inspect-empty-hint"
                      data-testid="inspect-empty-hint-no-targets"
                    >
                      {inspectMode
                        ? t('chat.inspect.noEditableTargets')
                        : t('chat.inspect.noCommentTargets')}
                    </div>
                  ) : (
                    <div
                      className="inspect-empty-hint"
                      data-testid="inspect-empty-hint"
                    >
                      {inspectMode ? t('chat.inspect.editHint') : t('chat.inspect.commentHint')}
                    </div>
                  )}
                  <button
                    type="button"
                    title="Close Inspect Hint"
                    aria-label="Close Inspect Hint"
                    onClick={() => setOpenHintBox(false)}
                    className="orbit-artifact-ghost"
                  >
                    <Icon className="" name="close" size={12} />
                  </button>
                </div>
              ) : null}
            </div>
            {boardImagePreviewModal}
            {commentPortalHost && commentSidePanel
              ? createPortal(commentSidePanel, commentPortalHost)
              : commentPortalId
                ? null
                : commentSidePanel}
            {inspectMode && activeInspectTarget ? (
              <InspectPanel
                target={activeInspectTarget}
                onApply={(prop, value) => {
                  const target = activeInspectTarget;
                  setInspectOverrides((current) =>
                    updateInspectOverride(current, target.elementId, target.selector, prop, value),
                  );
                  postInspectSet(target.elementId, target.selector, prop, value);
                }}
                onResetElement={(elementId) => {
                  setInspectOverrides((current) => {
                    if (!(elementId in current)) return current;
                    const next = { ...current };
                    delete next[elementId];
                    return next;
                  });
                  postInspectReset(elementId);
                  setActiveInspectTarget((current) => current && current.elementId === elementId
                    ? current
                    : current);
                }}
                onSaveToSource={() => {
                  void saveInspectToSource();
                }}
                onClose={() => {
                  setActiveInspectTarget(null);
                  if (boardMode && boardTool === 'inspect') {
                    setActiveCommentTarget(null);
                    setHoveredCommentTarget(null);
                  }
                }}
                saving={savingInspect}
                savedAt={inspectSavedAt}
                error={inspectError}
              />
            ) : null}
          </div>
        ) : (
          <pre className="viewer-source">{source}</pre>
        )}
      </div>
      {speakerNotesPanel}
      {workspaceActive && inTabPresent && source && typeof document !== 'undefined' ? createPortal(
        <div
          ref={presentOverlayRef}
          className="present-overlay"
          role="dialog"
          aria-label={t('fileViewer.present')}
        >
          {effectiveDeck || !useUrlLoadPreview ? (
            <iframe
              title="present"
              sandbox="allow-scripts allow-downloads"
              data-od-render-mode="srcdoc"
              srcDoc={effectiveDeck ? presentationSrcDoc : srcDoc}
            />
          ) : (
            <iframe
              title="present"
              sandbox="allow-scripts allow-downloads"
              data-od-render-mode="url-load"
              src={activePreviewSrcUrl}
            />
          )}
          {/* Lives INSIDE the overlay (not a body-portaled toast) so it stays
              visible when the overlay is the fullscreen element — a sibling
              toast would be clipped out of the fullscreen render. */}
          {presentEscHint ? (
            <div className="present-esc-hint" role="status">
              {t('fileViewer.presentEscHint')}
            </div>
          ) : null}
        </div>,
        document.body,
      ) : null}
      {/* No `!viewerOnly` here: the modal already fails closed on the one
          write action it hosts — `restoreDisabled` includes `viewerOnly` —
          so re-blocking the whole panel only stopped a read-only viewer from
          BROWSING versions (recvq56vFjQKfT). */}
      {workspaceActive && versionModalOpen && versioningAvailable && typeof document !== 'undefined' ? (
        <FileVersionManagerModal
          projectId={projectId}
          projectKind={projectKind}
          file={file}
          currentSource={source}
          entryFrom={versionModalOpen}
          onExportPdf={triggerPdfExport}
          onOpenImageExport={openImageExportModal}
          onExportZip={triggerZipExport}
          onExportHtml={triggerHtmlExport}
          exportToast={exportToast}
          onExportToastDismiss={() => setExportToast(null)}
          onClose={() => setVersionModalOpen(false)}
          onRestored={handleVersionRestored}
          viewerOnly={viewerOnly}
        />
      ) : null}
      {workspaceActive && pptxExportModalOpen && typeof document !== 'undefined' ? createPortal(
        <div className="modal-backdrop viewer-modal-backdrop image-export-backdrop" role="presentation">
          <div
            className="modal deploy-modal image-export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={pptxExportTitleId}
          >
            <div className="modal-head">
              <div className="kicker">PPTX</div>
              <h2 id={pptxExportTitleId}>{t('fileViewer.exportPptx')}</h2>
              <p className="subtitle">{t('fileViewer.exportPptxModalSubtitle')}</p>
            </div>
            <div className="deploy-form image-export-form">
              <fieldset className="image-export-format-field">
                <legend>{t('fileViewer.exportImageFormatLabel')}</legend>
                <div className="pptx-export-mode-options">
                  {([
                    {
                      value: 'editable' as const,
                      title: t('fileViewer.exportPptxEditable'),
                      hint: t('fileViewer.exportPptxEditableHint'),
                      recommended: true,
                    },
                    {
                      value: 'screenshot' as const,
                      title: t('fileViewer.exportPptxScreenshot'),
                      hint: t('fileViewer.exportPptxScreenshotHint'),
                      recommended: false,
                    },
                  ]).map((opt) => (
                    <label
                      key={opt.value}
                      className={`pptx-export-mode-option${pptxExportMode === opt.value ? ' active' : ''}`}
                    >
                      <input
                        type="radio"
                        name="pptx-export-mode"
                        value={opt.value}
                        checked={pptxExportMode === opt.value}
                        onChange={() => setPptxExportMode(opt.value)}
                      />
                      <span className="pptx-export-mode-head">
                        <span className="pptx-export-mode-title">{opt.title}</span>
                        {opt.recommended ? (
                          <span className="pptx-export-mode-badge">{t('fileViewer.exportPptxRecommended')}</span>
                        ) : null}
                      </span>
                      <span className="pptx-export-mode-desc">{opt.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="ghost-link button-like"
                onClick={() => setPptxExportModalOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="viewer-action primary"
                disabled={!canPptx}
                onClick={() => {
                  const editable = pptxExportMode === 'editable';
                  setPptxExportModalOpen(false);
                  fireShareExport('pptx', async () => {
                    const res = await exportProjectAsPptx({
                      projectId,
                      fileName: file.name,
                      title: exportTitle,
                      deck: true,
                      editable,
                      workspaceContext,
                    });
                    if (!res.ok) throw new Error('error' in res ? res.error : t('fileViewer.exportPptxNa'));
                  });
                }}
              >
                {t('fileViewer.exportPptxConfirm')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      {workspaceActive && imageExportModalOpen && typeof document !== 'undefined' ? createPortal(
        <div
          className="modal-backdrop viewer-modal-backdrop image-export-backdrop"
          role="presentation"
        >
          <div
            className="modal deploy-modal image-export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={imageExportTitleId}
          >
            <div className="modal-head">
              <div className="kicker">IMAGE</div>
              <h2 id={imageExportTitleId}>{t('fileViewer.exportImage')}</h2>
              <p className="subtitle">{t('fileViewer.exportImageModalSubtitle')}</p>
            </div>
            <div className="deploy-form image-export-form">
              <fieldset className="image-export-format-field">
                <legend>{t('fileViewer.exportImageFormatLabel')}</legend>
                <div className="image-export-format-options">
                  {IMAGE_EXPORT_FORMAT_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`image-export-format-option${imageExportFormat === option.value ? ' active' : ''}`}
                    >
                      <input
                        type="radio"
                        name="image-export-format"
                        value={option.value}
                        aria-label={option.label}
                        checked={imageExportFormat === option.value}
                        onChange={() => changeImageExportFormat(option.value)}
                      />
                      <span className="image-export-format-text">
                        <strong>{option.label}</strong>
                        <span aria-hidden="true">{option.extension}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {imageExportError ? (
                <p className="deploy-error" role="alert">{imageExportError}</p>
              ) : null}
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="ghost-link button-like"
                onClick={() => {
                  // User dismissed the image export modal without saving —
                  // close the ui_click(image)→result funnel as cancelled.
                  fireImageExportResult('cancelled', 'MODAL_DISMISSED');
                  setImageExportModalOpen(false);
                  setImageExportError(null);
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="viewer-action primary"
                onClick={() => {
                  void handleImageExportSave();
                }}
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      {workspaceActive && templateModalOpen && typeof document !== 'undefined' ? createPortal(
        <div className="modal-backdrop viewer-modal-backdrop" role="presentation">
          <div className="modal deploy-modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div className="kicker">TEMPLATE</div>
              <h2>{t('fileViewer.saveAsTemplate')}</h2>
              <p className="subtitle">{t('fileViewer.templateDescPrompt')}</p>
            </div>
            <div className="deploy-form">
              <label className="field" htmlFor={templateNameId}>
                <span className="field-label">{t('fileViewer.templateNamePrompt')}</span>
                <input
                  id={templateNameId}
                  type="text"
                  value={templateName}
                  placeholder={t('fileViewer.templateNameDefault')}
                  autoFocus
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </label>
              <label className="field" htmlFor={templateDescriptionId}>
                <span className="field-label">{t('fileViewer.templateDescPrompt')}</span>
                <textarea
                  id={templateDescriptionId}
                  rows={3}
                  value={templateDescription}
                  placeholder={t('fileViewer.optional')}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                />
              </label>
              {templateSaveError ? <p className="deploy-error">{templateSaveError}</p> : null}
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="ghost-link button-like"
                disabled={savingTemplate}
                onClick={() => {
                  // Dismissed without saving — close the ui_click(template)→
                  // result funnel as cancelled.
                  fireTemplateExportResult('cancelled', 'MODAL_DISMISSED');
                  setTemplateModalOpen(false);
                  setTemplateSaveError(null);
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="viewer-action primary"
                disabled={savingTemplate || !templateName.trim()}
                onClick={() => {
                  void handleSaveAsTemplate();
                }}
              >
                {savingTemplate ? t('fileViewer.savingTemplate') : t('common.save')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      {workspaceActive && deployModalOpen && typeof document !== 'undefined' ? createPortal(
        <div
          className="modal-backdrop viewer-modal-backdrop deploy-flow-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDeployModal();
          }}
        >
          <div className="modal deploy-modal deploy-flow-modal" role="dialog" aria-modal="true">
            <div className="deploy-flow-modal__scroll">
              <div className="modal-head">
                <div className="kicker">{deployModalKicker}</div>
                <h2>{deployModalTitle}</h2>
                <p className="subtitle">{deployModalSubtitle}</p>
              </div>
              <div className="deploy-form">
                <div className={`deploy-social-share${activeProjectSocialShare ? '' : ' is-locked'}${socialShareBlockedState ? ` is-${socialShareBlockedState}` : ''}`}>
                  <div className="deploy-social-share__head">
                    <div className="deploy-social-share__label">
                      {t('socialShare.projectSection')}
                    </div>
                    {socialShareDisplayUrl ? (
                      <a
                        className="deploy-social-share__url"
                        href={socialShareDisplayUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {socialShareDisplayUrl}
                      </a>
                    ) : null}
                  </div>
                  {!activeProjectSocialShare || socialShareBlockedState ? (
                    <p className="hint">{socialShareUnavailableMessage}</p>
                  ) : null}
                  {activeProjectSocialShare ? (
                    <SocialShareGrid
                      share={activeProjectSocialShare}
                      onAfterShare={closeDeployModal}
                    />
                  ) : null}
                  {socialShareBlockedDeployment?.url ? (
                    <div className="deploy-social-share__actions">
                      <button
                        type="button"
                        className="viewer-action"
                        onClick={() => {
                          void copyDeployLink(socialShareBlockedDeployment.url);
                        }}
                      >
                        <Icon name="copy" size={14} />
                        <span>{copyDeployLabel(socialShareBlockedDeployment.url)}</span>
                      </button>
                      {activeDeployment?.id === socialShareBlockedDeployment.id ? (
                        <button
                          type="button"
                          className="viewer-action"
                          disabled={deployPhase === 'preparing-link'}
                          onClick={() => {
                            void retryDeploymentLink();
                          }}
                        >
                          {deployPhase === 'preparing-link'
                            ? t('fileViewer.preparingPublicLink')
                            : t('fileViewer.retryLink')}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              <label className="deploy-provider-field">
                <span className="deploy-field-title">{t('fileViewer.deployProviderLabel')}</span>
                <select
                  value={deployProviderId}
                  onChange={(e) => {
                    void changeDeployProvider(e.target.value as WebDeployProviderId);
                  }}
                >
                  {DEPLOY_PROVIDER_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
              {deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? (
                <label className="deploy-target-field">
                  <span className="deploy-field-title">{t('fileViewer.deployTargetLabel')}</span>
                  <select
                    value={deployTarget}
                    onChange={(e) => {
                      setDeployTarget(e.target.value as 'preview' | 'production');
                    }}
                  >
                    <option value="preview">{t('fileViewer.deployTargetPreview')}</option>
                    <option value="production">{t('fileViewer.deployTargetProduction')}</option>
                  </select>
                </label>
              ) : null}
              <div className="field-label-row deploy-token-label-row">
                <label htmlFor="deploy-token" className="deploy-field-title required">{t(deployProvider.tokenLabelKey)}</label>
                <a
                  href={deployProvider.tokenLink}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {t(deployProvider.tokenLinkKey)}
                </a>
              </div>
              <div className="deploy-token-input-row">
                <input
                  ref={deployTokenInputRef}
                  id="deploy-token"
                  type="password"
                  value={deployToken}
                  placeholder={t(deployProvider.tokenPlaceholderKey, { provider: deployProviderLabel })}
                  onChange={(e) => setDeployToken(e.target.value)}
                />
                <button
                  type="button"
                  className="ghost-link button-like"
                  disabled={savingDeployConfig}
                  onClick={() => {
                    void saveDeployConfig();
                  }}
                >
                  {savingDeployConfig ? t('fileViewer.savingConfig') : t('fileViewer.save')}
                </button>
              </div>
              {deployConfig?.configured || deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? (
                <div className="deploy-token-hints">
                  {deployConfig?.configured ? (
                    <p className="hint">{t(deployProvider.tokenReuseHintKey, { provider: deployProviderLabel })}</p>
                  ) : null}
                  {deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? (
                    <p className="hint">{t('fileViewer.cloudflareApiTokenScopeHint')}</p>
                  ) : null}
                </div>
              ) : null}
              {deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? (
                <>
                  <div className="deploy-field-grid single-field">
                    <label>
                      <span className="deploy-field-title required">{t('fileViewer.cloudflareAccountId')}</span>
                      <input
                        value={cloudflareAccountId}
                        onChange={(e) => setCloudflareAccountId(e.target.value)}
                      />
                      <span className="field-hint">{t('fileViewer.cloudflareAccountIdHint')}</span>
                    </label>
                  </div>
                  <div className="deploy-field-grid cloudflare-domain-grid">
                    <label>
                      <span className="deploy-field-title">{t('fileViewer.cloudflareDomainPrefixLabel')}</span>
                      <input
                        value={cloudflareDomainPrefix}
                        placeholder={t('fileViewer.cloudflareDomainPrefixPlaceholder')}
                        onChange={(e) => setCloudflareDomainPrefix(e.target.value)}
                      />
                    </label>
                    <div className="deploy-field-control">
                      <span className="deploy-field-title-row">
                        <label className="deploy-field-title" htmlFor="cloudflare-zone-select">
                          {t('fileViewer.cloudflareZoneLabel')}
                        </label>
                        <button
                          type="button"
                          className="ghost-link deploy-field-inline-action"
                          disabled={cloudflareZonesLoading || !deployConfig?.configured}
                          onClick={() => {
                            void loadCloudflareZones();
                          }}
                        >
                          <RemixIcon name="refresh-line" size={13} />
                          {cloudflareZonesLoading ? t('fileViewer.cloudflareZonesLoading') : t('fileViewer.cloudflareZonesRefresh')}
                        </button>
                      </span>
                      <select
                        id="cloudflare-zone-select"
                        value={cloudflareZoneId}
                        disabled={cloudflareZonesLoading || (!deployConfig?.configured && !cloudflareZones.length)}
                        onChange={(e) => setCloudflareZoneId(e.target.value)}
                      >
                        {cloudflareZones.length === 0 ? (
                          <option value="">{t('fileViewer.cloudflareZonePlaceholder')}</option>
                        ) : null}
                        {cloudflareZones.map((zone) => (
                          <option key={zone.id} value={zone.id}>
                            {zone.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {cloudflareZonesError ? (
                    <p className="deploy-error">{cloudflareZonesError}</p>
                  ) : cloudflareZonesLoading ? (
                    <p className="hint">{t('fileViewer.cloudflareZonesLoading')}</p>
                  ) : deployConfig?.configured && cloudflareZones.length === 0 ? (
                    <p className="hint">{t('fileViewer.cloudflareZonesEmpty')}</p>
                  ) : null}
                  {cloudflareDomainPrefix.trim() && !isValidCloudflareDomainPrefixInput(cloudflareDomainPrefix) ? (
                    <p className="deploy-error">{t('fileViewer.cloudflareDomainPrefixInvalid')}</p>
                  ) : cloudflareHostnamePreview ? (
                    <p className="hint">
                      {t('fileViewer.cloudflareHostnamePreview', { hostname: cloudflareHostnamePreview })}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="deploy-field-grid">
                  <label>
                    <span className="deploy-field-title">{t('fileViewer.vercelTeamId')}</span>
                    <input
                      value={teamId}
                      placeholder={t('fileViewer.optional')}
                      onChange={(e) => setTeamId(e.target.value)}
                    />
                  </label>
                  <label>
                    <span className="deploy-field-title">{t('fileViewer.vercelTeamSlug')}</span>
                    <input
                      value={teamSlug}
                      placeholder={t('fileViewer.optional')}
                      onChange={(e) => setTeamSlug(e.target.value)}
                    />
                  </label>
                </div>
              )}
              {deployError ? <p className="deploy-error">{deployError}</p> : null}
              {!deployError
                && deployPhase === 'idle'
                && deployResultCards.length > 0
                && deployResultState(activeDeployment?.status) === 'ready' ? (
                <p className="hint" role="status">
                  {t('fileViewer.deployLinkReady')} · {t('fileViewer.deployResultLabel')}
                </p>
              ) : null}
              {deployResultCards.length > 0 ? (
                <div className={`deploy-result-block ${deployResultState(activeDeployment?.status)}`}>
                  <div className="deploy-result-summary">
                    <div className="deploy-result-summary-head">
                      <div className="deploy-result-label">{t('fileViewer.deployResultLabel')}</div>
                      <div className={`deploy-result-badge ${deployResultState(activeDeployment?.status)}`}>
                        {statusLabelFor(deployResultState(activeDeployment?.status))}
                      </div>
                    </div>
                    {activeDeployment?.statusMessage ? (
                      <p className="deploy-result-message">{activeDeployment.statusMessage}</p>
                    ) : null}
                    <div className="deploy-result-links">
                      {deployResultCards.map((card) => {
                        const state = deployResultState(card.status);
                        const canRetry = state === 'delayed' || state === 'protected';
                        const isDisabled = state === 'protected' || state === 'failed';
                        return (
                          <div key={card.id} className={`deploy-result-link ${state}`}>
                            <div className="deploy-result-link-main">
                              <div className="deploy-result-link-head">
                                <span className="deploy-result-link-label">{card.label}</span>
                                <span className={`deploy-result-link-state ${state}`}>{statusLabelFor(state)}</span>
                              </div>
                              {card.message ? (
                                <p className="deploy-result-link-message">{card.message}</p>
                              ) : null}
                              <a
                                className="deploy-result-url"
                                href={card.url}
                                target="_blank"
                                rel="noreferrer noopener"
                              >
                                {card.url}
                              </a>
                            </div>
                            <div className="deploy-result-actions">
                              {canRetry ? (
                                <button
                                  type="button"
                                  className="viewer-action"
                                  disabled={deployPhase === 'preparing-link'}
                                  onClick={() => {
                                    void retryDeploymentLink();
                                  }}
                                >
                                  {deployPhase === 'preparing-link'
                                    ? t('fileViewer.preparingPublicLink')
                                    : t('fileViewer.retryLink')}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="viewer-action"
                                onClick={() => {
                                  void copyDeployLink(card.url);
                                }}
                              >
                                <Icon name="copy" size={14} />
                                <span>{copyDeployLabel(card.url)}</span>
                              </button>
                              <a
                                className={`ghost-link ${isDisabled ? 'disabled' : ''}`}
                                href={isDisabled ? undefined : card.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                aria-disabled={isDisabled}
                              >
                                <Icon name="upload" size={14} />
                                {t('fileViewer.open')}
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
              </div>
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="ghost-link button-like"
                onClick={closeDeployModal}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="viewer-action primary"
                disabled={deploying || savingDeployConfig || deployPhase !== 'idle'}
                onClick={() => {
                  void deployToSelectedProvider();
                }}
              >
                {deployButtonLabel}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      {workspaceActive && deploySavedToast && typeof document !== 'undefined' ? createPortal(
        <Toast
          message={deploySavedToast.message}
          details={deploySavedToast.details}
          tone="success"
          placement="top"
          ttlMs={3600}
          onDismiss={() => setDeploySavedToast(null)}
        />,
        document.body,
      ) : null}
      {workspaceActive && deployActionToast && typeof document !== 'undefined' ? createPortal(
        <Toast
          message={deployActionToast}
          placement="top"
          ttlMs={2400}
          role="alert"
          onDismiss={() => setDeployActionToast(null)}
        />,
        document.body,
      ) : null}
      {workspaceActive && shareAccessConfirm ? (
        <MoveToTeamConfirmDialog
          action={shareAccessConfirm === 'workspace' ? 'to-team' : 'to-personal'}
          onCancel={() => setShareAccessConfirm(null)}
          onConfirm={() => {
            const next = shareAccessConfirm;
            setShareAccessConfirm(null);
            if (next) void commitWorkspaceShareAccess(next);
          }}
        />
      ) : null}
      {workspaceActive && versionRestoredToast && typeof document !== 'undefined' ? createPortal(
        <Toast
          key={versionRestoredToast.id}
          message={versionRestoredToast.message}
          tone="success"
          placement="top"
          ttlMs={2400}
          onDismiss={() => setVersionRestoredToast(null)}
        />,
        document.body,
      ) : null}
      {workspaceActive && shareGuideToast && typeof document !== 'undefined' ? createPortal(
        <Toast
          message={shareGuideToast}
          placement="top"
          ttlMs={2200}
          onDismiss={() => setShareGuideToast(null)}
        />,
        document.body,
      ) : null}
    </div>
  );
}

function baseDirFor(fileName: string): string {
  const idx = fileName.lastIndexOf('/');
  return idx >= 0 ? fileName.slice(0, idx + 1) : '';
}

function toOwnerRelativePath(ownerFileName: string, targetPath: string): string {
  const normalize = (value: string) => decodeURIComponent(value).replace(/^\/+/, '');
  const squash = (parts: string[]) => {
    const out: string[] = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (out.length > 0) out.pop();
        continue;
      }
      out.push(part);
    }
    return out;
  };
  const ownerDirPath = normalize(baseDirFor(ownerFileName));
  const targetFilePath = normalize(targetPath);
  const ownerParts = squash(ownerDirPath.split('/'));
  const targetParts = squash(targetFilePath.split('/'));

  let common = 0;
  while (
    common < ownerParts.length &&
    common < targetParts.length &&
    ownerParts[common] === targetParts[common]
  ) {
    common += 1;
  }

  const up = new Array(ownerParts.length - common).fill('..');
  const down = targetParts.slice(common);
  const rel = [...up, ...down].join('/');
  return rel || '.';
}

function isBlockedPreviewAssetScheme(assetRef: string): boolean {
  const clean = assetRef.replace(/[\s\u0000-\u001F\u007F-\u009F]/g, '');
  return /^(?:javascript|data):/i.test(clean);
}

async function inlineRelativeAssets(
  html: string,
  projectId: string,
  fileName: string,
  projectFilePaths: ReadonlySet<string> | null = null,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<string> {
  const toRawUrl = (projectPath: string) =>
    projectRawUrl(projectId, projectPath, workspaceContext);
  // Root-relative project asset refs (confirmed against the real file list)
  // become owner-relative first, so the stylesheet/script inlining below and
  // the srcDoc <base href> rebasing treat them like any other relative ref.
  const normalized = projectFilePaths
    ? normalizeRootRelativeProjectAssetRefs(html, fileName, projectFilePaths)
    : html;

  const replacements: Array<Promise<{ from: string; to: string } | null>> = [];
  const links = normalized.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of links) {
    const rel = readHtmlAttr(tag, 'rel');
    const href = readHtmlAttr(tag, 'href');
    if (!rel || !/\bstylesheet\b/i.test(rel) || !href) continue;
    replacements.push(
      fetchProjectRelativeText(projectId, fileName, href, workspaceContext).then((asset) =>
        asset == null
          ? null
          : {
              from: tag,
              to:
                `<style data-od-inline-asset="${escapeHtmlAttr(href)}">\n` +
                `${rewriteInlinedCssAssetRefs(asset.text, asset.filePath, projectFilePaths, toRawUrl)
                  .replace(/<\/style/gi, '<\\/style')}\n</style>`,
            },
      ),
    );
  }

  const scripts = normalized.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/gi) ?? [];
  for (const tag of scripts) {
    const src = readHtmlAttr(tag, 'src');
    if (!src) continue;
    replacements.push(
      fetchProjectRelativeText(projectId, fileName, src, workspaceContext).then((asset) => {
        if (asset == null) return null;
        const js = projectFilePaths
          ? rewriteInlinedScriptAssetRefs(asset.text, asset.filePath, projectFilePaths, toRawUrl)
          : asset.text;
        const open = tag.match(/^<script\b[^>]*>/i)?.[0] ?? '<script>';
        const attrs = open
          .replace(/^<script/i, '')
          .replace(/>$/i, '')
          .replace(/\ssrc\s*=\s*(['"])[\s\S]*?\1/i, '');
        return {
          from: tag,
          to: `<script${attrs}>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`,
        };
      }),
    );
  }

  const resolved = (await Promise.all(replacements)).filter(
    (item): item is { from: string; to: string } => item !== null,
  );
  const inlined = resolved.reduce(
    (next, { from, to }) => next.replace(from, () => to),
    normalized,
  );
  return workspaceContext && projectFilePaths
    ? rewriteProjectAssetRefsToRawUrls(inlined, fileName, projectFilePaths, toRawUrl)
    : inlined;
}

async function fetchProjectRelativeText(
  projectId: string,
  ownerFileName: string,
  assetRef: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<{ filePath: string; text: string } | null> {
  const filePath = resolveProjectRelativePath(ownerFileName, assetRef);
  if (!filePath) return null;
  try {
    const resp = await fetch(
      projectRawUrl(projectId, filePath, workspaceContext),
      workspaceContext
        ? { headers: workspaceProjectHeaders(workspaceContext) }
        : undefined,
    );
    if (!resp.ok) return null;
    return { filePath, text: await resp.text() };
  } catch {
    return null;
  }
}

function resolveProjectRelativePath(ownerFileName: string, assetRef: string): string | null {
  if (isBlockedPreviewAssetScheme(assetRef)) return null;
  if (/^(?:https?:|data:|blob:|mailto:|tel:|#|\/)/i.test(assetRef)) return null;
  try {
    const url = new URL(assetRef, `https://od.local/${baseDirFor(ownerFileName)}`);
    if (url.origin !== 'https://od.local') return null;
    const decodedPath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const parts = decodedPath.split(/[/\\]/);
    if (parts.some((part) => part === '..' || part.trim() === '..')) return null;
    return decodedPath;
  } catch {
    return null;
  }
}

function readHtmlAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function ImageViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const { workspaceContext } = useProjectCollabContext();
  const url = appendResourceQuery(
    projectFileUrl(projectId, file.name, workspaceContext),
    `v=${Math.round(file.mtime)}`,
  );
  return (
    <div className="viewer image-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {file.kind === 'sketch'
              ? t('fileViewer.sketchMeta', { size: humanSize(file.size) })
              : t('fileViewer.imageMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <div className="viewer-toolbar-actions">
          <a
            className="ghost-link"
            href={projectFileUrl(projectId, file.name, workspaceContext)}
            download={file.name}
          >
            {t('fileViewer.download')}
          </a>
          <a
            className="ghost-link"
            href={projectFileUrl(projectId, file.name, workspaceContext)}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('fileViewer.open')}
          </a>
        </div>
      </div>
      <div className="viewer-body image-body">
        <img alt={file.name} src={url} />
      </div>
    </div>
  );
}

function SketchViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const { workspaceContext } = useProjectCollabContext();
  return (
    <div className="viewer image-viewer sketch-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.sketchMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body image-body">
        <SketchPreview
          projectId={projectId}
          file={file}
          className="viewer-sketch-preview"
          workspaceContext={workspaceContext}
        />
      </div>
    </div>
  );
}

function VideoViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const { workspaceContext } = useProjectCollabContext();
  const url = appendResourceQuery(
    projectFileUrl(projectId, file.name, workspaceContext),
    `v=${Math.round(file.mtime)}`,
  );
  return (
    <div className="viewer video-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.videoMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body video-body">
        <video src={url} controls playsInline preload="metadata" />
      </div>
    </div>
  );
}

function AudioViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const { workspaceContext } = useProjectCollabContext();
  const url = appendResourceQuery(
    projectFileUrl(projectId, file.name, workspaceContext),
    `v=${Math.round(file.mtime)}`,
  );
  return (
    <div className="viewer audio-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.audioMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body audio-body">
        <div className="audio-card">
          <Icon name="mic" size={28} />
          <div className="audio-card-name">{file.name}</div>
          <audio src={url} controls preload="metadata" />
        </div>
      </div>
    </div>
  );
}

type SvgViewerMode = 'preview' | 'source';

interface SvgViewerProps {
  projectId: string;
  file: ProjectFile;
  initialMode?: SvgViewerMode;
  initialSource?: string | null | undefined;
}

export function SvgViewer({
  projectId,
  file,
  initialMode = 'preview',
  initialSource,
}: SvgViewerProps) {
  const t = useT();
  const { workspaceContext } = useProjectCollabContext();
  const [mode, setMode] = useState<SvgViewerMode>(initialMode);
  const [source, setSource] = useState<string | null>(initialSource ?? null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const url = appendResourceQuery(
    projectFileUrl(projectId, file.name, workspaceContext),
    `v=${Math.round(file.mtime)}&r=${reloadKey}`,
  );

  useEffect(() => {
    if (mode !== 'source') return;
    if (initialSource !== undefined && reloadKey === 0) return;
    let cancelled = false;
    setLoadingSource(true);
    setSourceError(false);
    void fetchProjectFileText(projectId, file.name, {
      cache: 'no-store',
      cacheBustKey: `${Math.round(file.mtime)}-${reloadKey}`,
      workspaceContext,
    }).then((next) => {
      if (cancelled) return;
      if (next === null) {
        setSource('');
        setSourceError(true);
      } else {
        setSource(next);
      }
      setLoadingSource(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    file.name,
    file.mtime,
    initialSource,
    mode,
    reloadKey,
    workspaceContext,
  ]);

  return (
    <div className="viewer svg-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.imageMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <div className="viewer-toolbar-actions">
          <div className="viewer-tabs">
            <button
              type="button"
              className={`viewer-tab ${mode === 'preview' ? 'active' : ''}`}
              aria-pressed={mode === 'preview'}
              onClick={() => setMode('preview')}
            >
              {t('fileViewer.preview')}
            </button>
            <button
              type="button"
              className={`viewer-tab ${mode === 'source' ? 'active' : ''}`}
              aria-pressed={mode === 'source'}
              onClick={() => setMode('source')}
            >
              {t('fileViewer.source')}
            </button>
          </div>
          <span className="viewer-divider" aria-hidden />
          <button
            type="button"
            className="viewer-action"
            onClick={() => setReloadKey((n) => n + 1)}
            title={t('fileViewer.reloadDisk')}
          >
            <Icon name="reload" size={13} />
            <span>{t('fileViewer.reload')}</span>
          </button>
          <a
            className="ghost-link"
            href={projectFileUrl(projectId, file.name, workspaceContext)}
            download={file.name}
          >
            {t('fileViewer.download')}
          </a>
          <a
            className="ghost-link"
            href={projectFileUrl(projectId, file.name, workspaceContext)}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('fileViewer.open')}
          </a>
        </div>
      </div>
      <div className={`viewer-body ${mode === 'preview' ? 'image-body' : ''}`}>
        {mode === 'preview' ? (
          <img alt={file.name} src={url} />
        ) : loadingSource ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : sourceError ? (
          <div className="viewer-empty">{t('fileViewer.previewUnavailable')}</div>
        ) : (
          <pre className="viewer-source">{source ?? ''}</pre>
        )}
      </div>
    </div>
  );
}

// Read-only fallback viewer for `text` / `code` files (JSON tokens, configs,
// source dumps). It renders the file body through `CodeWithLines` / `<pre>` and
// owns no editable buffer, so there is no state in which a save could ever
// apply. Its toolbar therefore exposes only reload + copy: a Save control here
// would be permanently unreachable, not merely idle. Viewers that DO own an
// editable buffer (MarkdownViewer's autosave, HtmlViewer's manual-edit save)
// keep their save affordance even while it is momentarily disabled, because
// there the disabled state is transient rather than structural.
function TextViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const { workspaceContext } = useProjectCollabContext();
  const [text, setText] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setText(null);
    let cancelled = false;
    void fetchProjectFileText(projectId, file.name, { workspaceContext }).then((t) => {
      if (!cancelled) setText(t ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, reloadKey, workspaceContext]);

  async function copy() {
    if (text == null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // best-effort fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  const displayText = useMemo(
    () => (text == null ? null : formatJsonFileTextForDisplay(file, text)),
    [file.name, file.mime, text],
  );
  const lineCount = displayText ? displayText.split('\n').length : 0;

  return (
    <div className="viewer text-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left" />
        <div className="viewer-toolbar-actions">
          <button
            type="button"
            className="viewer-action"
            onClick={() => setReloadKey((n) => n + 1)}
            title={t('fileViewer.reloadDisk')}
          >
            <Icon name="reload" size={13} />
            <span>{t('fileViewer.reload')}</span>
          </button>
          <button
            type="button"
            className="viewer-action"
            onClick={() => void copy()}
            title={t('fileViewer.copyTitle')}
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} />
            <span>{copied ? t('fileViewer.copied') : t('fileViewer.copy')}</span>
          </button>
        </div>
      </div>
      <div className="viewer-body">
        {text === null ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : displayText !== null && lineCount > 0 ? (
          <CodeWithLines text={displayText} />
        ) : (
          <pre className="viewer-source">{displayText}</pre>
        )}
      </div>
    </div>
  );
}

function formatJsonFileTextForDisplay(file: ProjectFile, text: string): string {
  if (!isJsonFile(file)) return text;
  try {
    if (hasPrecisionSensitiveJsonNumberText(text)) return text;
    const parsed = JSON.parse(text) as unknown;
    if (hasUnsafeJsonNumber(parsed)) return text;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

function hasPrecisionSensitiveJsonNumberText(text: string): boolean {
  let inString = false;
  let escaped = false;
  const numberTokenPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  for (let i = 0; i < text.length;) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      i += 1;
      continue;
    }

    numberTokenPattern.lastIndex = i;
    const match = numberTokenPattern.exec(text);
    if (!match) {
      i += 1;
      continue;
    }

    const token = match[0];
    if (isSignedNegativeZeroJsonNumberToken(token)) return true;
    if (/[.eE]/.test(token) && isPrecisionSensitiveJsonNumberToken(token)) return true;
    i = numberTokenPattern.lastIndex;
  }
  return false;
}

function isSignedNegativeZeroJsonNumberToken(token: string): boolean {
  return /^-0(?:\.0+)?(?:[eE][+-]?\d+)?$/.test(token);
}

function isPrecisionSensitiveJsonNumberToken(token: string): boolean {
  const parsed = Number(token);
  if (!Number.isFinite(parsed)) return true;
  const rendered = JSON.stringify(parsed);
  if (!rendered) return true;
  const originalValue = parseJsonNumberTokenAsDecimal(token);
  const renderedValue = parseJsonNumberTokenAsDecimal(rendered);
  return (
    !originalValue ||
    !renderedValue ||
    originalValue.coefficient !== renderedValue.coefficient ||
    originalValue.exponent !== renderedValue.exponent
  );
}

function parseJsonNumberTokenAsDecimal(token: string): { coefficient: bigint; exponent: number } | null {
  const match = /^(-)?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) return null;
  const [, sign, integerPart, fractionPart = '', exponentPart = '0'] = match;
  const coefficient = BigInt(`${sign ?? ''}${integerPart}${fractionPart}`);
  const exponent = Number(exponentPart) - fractionPart.length;
  return normalizeDecimalParts(coefficient, exponent);
}

function normalizeDecimalParts(coefficient: bigint, exponent: number): { coefficient: bigint; exponent: number } {
  if (coefficient === 0n) return { coefficient: 0n, exponent: 0 };
  let normalizedCoefficient = coefficient;
  let normalizedExponent = exponent;
  while (normalizedCoefficient % 10n === 0n) {
    normalizedCoefficient /= 10n;
    normalizedExponent += 1;
  }
  return { coefficient: normalizedCoefficient, exponent: normalizedExponent };
}

function hasUnsafeJsonNumber(value: unknown): boolean {
  if (typeof value === 'number') {
    return !Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value));
  }
  if (Array.isArray(value)) return value.some(hasUnsafeJsonNumber);
  if (value && typeof value === 'object') return Object.values(value).some(hasUnsafeJsonNumber);
  return false;
}

function isJsonFile(file: ProjectFile): boolean {
  return file.name.toLowerCase().endsWith('.json') || file.mime.toLowerCase().startsWith('application/json');
}

type MarkdownViewerMode = 'edit' | 'split' | 'preview';
type MarkdownSaveState = 'idle' | 'saving' | 'saved' | 'error';
type MarkdownScrollPane = 'editor' | 'preview';
type MarkdownSaveOptions = {
  refreshFiles?: boolean;
  showSaving?: boolean;
};

function markdownScrollRange(element: HTMLElement): number {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

function markdownScrollRatio(element: HTMLElement): number {
  const range = markdownScrollRange(element);
  return range > 0 ? element.scrollTop / range : 0;
}

function markdownScrollTopForRatio(element: HTMLElement, ratio: number): number {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return markdownScrollRange(element) * clamped;
}

function mergeMarkdownSaveOptions(a: MarkdownSaveOptions, b: MarkdownSaveOptions): MarkdownSaveOptions {
  return {
    refreshFiles: a.refreshFiles !== false || b.refreshFiles !== false,
    showSaving: a.showSaving !== false || b.showSaving !== false,
  };
}

function MarkdownViewer({
  projectId,
  file,
  onFileSaved,
  viewerOnly = false,
}: {
  projectId: string;
  file: ProjectFile;
  onFileSaved?: () => Promise<void> | void;
  viewerOnly?: boolean;
}) {
  const { t, locale } = useI18n();
  const { workspaceContext } = useProjectCollabContext();
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement | null>(null);
  useDismissOnOutsideInteraction(downloadMenuOpen, downloadMenuRef, () => setDownloadMenuOpen(false));
  const [mode, setMode] = useState<MarkdownViewerMode>(viewerOnly ? 'preview' : 'split');
  const [saveState, setSaveState] = useState<MarkdownSaveState>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<{ source: string; html: string; themeRevision: number } | null>(null);
  const [highlightThemeRevision, setHighlightThemeRevision] = useState(0);
  const [, bumpSavedRevision] = useState(0);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const markdownPreviewPaneRef = useRef<HTMLElement | null>(null);
  const markdownArticleRef = useRef<HTMLElement | null>(null);
  const copyBlockTimerRef = useRef<number | null>(null);
  const copiedMarkdownBlockRef = useRef<HTMLElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const scrollSyncFrameRef = useRef<number | null>(null);
  const programmaticScrollClearFrameRef = useRef<number | null>(null);
  const pendingScrollSyncRef = useRef<{ sourcePane: MarkdownScrollPane; targetPane: MarkdownScrollPane } | null>(null);
  const programmaticScrollRef = useRef<{ pane: MarkdownScrollPane; top: number } | null>(null);
  const activeMarkdownScrollPaneRef = useRef<MarkdownScrollPane>('editor');
  const editorBlockOffsetsRef = useRef<{ width: number; offsets: number[] } | null>(null);
  const previousModeRef = useRef<MarkdownViewerMode>(viewerOnly ? 'preview' : 'split');
  const saveInFlightRef = useRef(false);
  const pendingSaveAfterFlightRef = useRef<MarkdownSaveOptions | null>(null);
  const textRef = useRef('');
  const lastSavedTextRef = useRef<string | null>(null);
  const loadedFileKeyRef = useRef<string | null>(null);
  const markdownFileKey = `${projectId}::${file.name}`;
  const status = file.artifactManifest?.status ?? 'complete';
  const isStreaming = status === 'streaming';
  const isError = status === 'error';
  const exportTitle = file.name.replace(/\.mdx?$/i, '') || file.name;
  const viewerOnlyDisabledTitle = t('fileViewer.readonlySharedNoExport');

  useEffect(() => {
    if (!viewerOnly) return;
    setMode('preview');
    setDownloadMenuOpen(false);
  }, [viewerOnly]);

  useEffect(() => {
    const sameLoadedFile = loadedFileKeyRef.current === markdownFileKey;
    if (
      sameLoadedFile &&
      lastSavedTextRef.current !== null &&
      textRef.current !== lastSavedTextRef.current
    ) {
      return undefined;
    }
    if (!sameLoadedFile) setText(null);
    copiedMarkdownBlockRef.current = null;
    if (copyBlockTimerRef.current) {
      window.clearTimeout(copyBlockTimerRef.current);
      copyBlockTimerRef.current = null;
    }
    let cancelled = false;
    void fetchProjectFileText(projectId, file.name, { workspaceContext }).then((next) => {
      if (cancelled) return;
      if (
        loadedFileKeyRef.current === markdownFileKey &&
        lastSavedTextRef.current !== null &&
        textRef.current !== lastSavedTextRef.current
      ) {
        return;
      }
      const loaded = next ?? '';
      if (
        sameLoadedFile &&
        lastSavedTextRef.current !== null &&
        textRef.current === lastSavedTextRef.current &&
        loaded === lastSavedTextRef.current
      ) {
        loadedFileKeyRef.current = markdownFileKey;
        pendingSaveAfterFlightRef.current = null;
        setSaveState((current) => current === 'saved' ? current : 'idle');
        return;
      }
      textRef.current = loaded;
      lastSavedTextRef.current = loaded;
      loadedFileKeyRef.current = markdownFileKey;
      pendingSaveAfterFlightRef.current = null;
      setSaveState('idle');
      setText(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, markdownFileKey]);

  useEffect(() => {
    return () => {
      copiedMarkdownBlockRef.current = null;
      if (copyBlockTimerRef.current) {
        window.clearTimeout(copyBlockTimerRef.current);
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (scrollSyncFrameRef.current) {
        window.cancelAnimationFrame(scrollSyncFrameRef.current);
        scrollSyncFrameRef.current = null;
      }
      if (programmaticScrollClearFrameRef.current) {
        window.cancelAnimationFrame(programmaticScrollClearFrameRef.current);
        programmaticScrollClearFrameRef.current = null;
      }
      pendingScrollSyncRef.current = null;
      programmaticScrollRef.current = null;
      activeMarkdownScrollPaneRef.current = 'editor';
    };
  }, []);

  const saveMarkdownText = useCallback(
    (value: string, options: MarkdownSaveOptions = {}) => {
      if (viewerOnly) return;
      const run = async (nextValue: string, saveOptions: MarkdownSaveOptions): Promise<void> => {
        if (lastSavedTextRef.current === nextValue) {
          const showSaving = saveOptions.showSaving !== false;
          if (textRef.current === nextValue) setSaveState(showSaving ? 'saved' : 'idle');
          if (saveOptions.refreshFiles !== false && onFileSaved) {
            void Promise.resolve(onFileSaved()).catch(() => undefined);
          }
          return;
        }
        if (saveInFlightRef.current) {
          pendingSaveAfterFlightRef.current = pendingSaveAfterFlightRef.current
            ? mergeMarkdownSaveOptions(pendingSaveAfterFlightRef.current, saveOptions)
            : saveOptions;
          return;
        }
        saveInFlightRef.current = true;
        const showSaving = saveOptions.showSaving !== false;
        if (showSaving) setSaveState('saving');
        try {
          const saved = await writeProjectTextFile(projectId, file.name, nextValue, undefined, workspaceContext);
          if (!saved) throw new Error('write failed');
          lastSavedTextRef.current = nextValue;
          bumpSavedRevision((n) => n + 1);
          setSavedAt(Date.now());
          if (textRef.current === nextValue) setSaveState(showSaving ? 'saved' : 'idle');
          if (saveOptions.refreshFiles !== false && onFileSaved) {
            void Promise.resolve(onFileSaved()).catch(() => undefined);
          }
        } catch {
          if (textRef.current === nextValue) setSaveState('error');
        } finally {
          saveInFlightRef.current = false;
          const pending = pendingSaveAfterFlightRef.current;
          if (pending) {
            pendingSaveAfterFlightRef.current = null;
            const latest = textRef.current;
            if (latest !== lastSavedTextRef.current) {
              void run(latest, pending);
            } else {
              const showPendingSaving = pending.showSaving !== false;
              if (textRef.current === latest) setSaveState(showPendingSaving ? 'saved' : 'idle');
              if (pending.refreshFiles !== false && onFileSaved) {
                void Promise.resolve(onFileSaved()).catch(() => undefined);
              }
            }
          }
        }
      };
      void run(value, options);
    },
    [file.name, onFileSaved, projectId, viewerOnly],
  );

  const flushPendingMarkdownSave = useCallback(() => {
    if (viewerOnly) return;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const latest = textRef.current;
    if (lastSavedTextRef.current !== null && latest !== lastSavedTextRef.current) {
      saveMarkdownText(latest, { refreshFiles: false, showSaving: false });
    }
  }, [saveMarkdownText, viewerOnly]);

  useEffect(() => {
    return () => {
      flushPendingMarkdownSave();
    };
  }, [flushPendingMarkdownSave]);

  useEffect(() => {
    if (text === null) return undefined;
    textRef.current = text;
    if (viewerOnly) return undefined;
    if (text === lastSavedTextRef.current) return undefined;
    setSaveState((current) => current === 'saved' ? 'idle' : current);
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      saveMarkdownText(textRef.current, { refreshFiles: false, showSaving: false });
    }, 700);
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [saveMarkdownText, text, viewerOnly]);

  useEffect(() => {
    const root = document.documentElement;
    const bump = () => setHighlightThemeRevision((revision) => revision + 1);
    const observer = new MutationObserver(bump);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener('change', bump);
    return () => {
      observer.disconnect();
      media?.removeEventListener('change', bump);
    };
  }, []);

  async function copy() {
    if (text == null) return;
    const didCopy = await copyTextToClipboard(text);
    if (didCopy) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  const insertTextAtSelection = useCallback((insert: string) => {
    setText((current) => {
      if (viewerOnly) return current;
      if (current === null) return current;
      const editor = editorRef.current;
      if (!editor) return `${current}${insert}`;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const next = `${current.slice(0, start)}${insert}${current.slice(end)}`;
      window.requestAnimationFrame(() => {
        const nextCursor = start + insert.length;
        editor.focus();
        editor.setSelectionRange(nextCursor, nextCursor);
      });
      return next;
    });
  }, [viewerOnly]);

  const insertImageFiles = useCallback(
    async (files: File[]): Promise<boolean> => {
      if (viewerOnly) return false;
      const images = files.filter((item) => isMarkdownImageFile(item));
      if (images.length === 0) return false;
      const targetDir = markdownDirectory(file.name);
      const result = await uploadProjectFiles(projectId, images, targetDir, workspaceContext);
      if (result.uploaded.length > 0) {
        await onFileSaved?.();
        const snippet = result.uploaded
          .map((item) => {
            const alt = markdownImageAlt(item.name);
            const path = markdownRelativeProjectPath(file.name, item.path);
            return `![${alt}](${path})`;
          })
          .join('\n');
        insertTextAtSelection(`\n${snippet}\n`);
      }
      return true;
    },
    [file.name, insertTextAtSelection, onFileSaved, projectId, viewerOnly],
  );

  function handleEditorPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    if (viewerOnly) return;
    const files = Array.from(event.clipboardData.files ?? []);
    if (!files.some(isMarkdownImageFile)) return;
    event.preventDefault();
    void insertImageFiles(files);
  }

  function handleEditorDrop(event: ReactDragEvent<HTMLTextAreaElement>) {
    if (viewerOnly) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    if (!files.some(isMarkdownImageFile)) return;
    event.preventDefault();
    void insertImageFiles(files);
  }

  // The markdown doc auto-saves on a debounce, so the toolbar shows a passive
  // status (when it last auto-saved) instead of a manual Save button that is
  // disabled almost all the time. Typing stays quiet: the indicator keeps the
  // last auto-saved time and only refreshes once the debounced save lands, so
  // there is no per-keystroke "Saving…" flicker. `saving` is reserved for an
  // explicit, foreground write (the error-retry path).
  const autoSaveStatus: 'error' | 'saving' | 'saved' | 'idle' =
    saveState === 'error'
      ? 'error'
      : saveState === 'saving'
        ? 'saving'
        : savedAt != null
          ? 'saved'
          : 'idle';
  const autoSaveTime =
    savedAt != null
      ? new Date(savedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      : null;
  const autoSaveLabel =
    autoSaveStatus === 'error'
      ? t('fileViewer.markdownSaveFailed')
      : autoSaveStatus === 'saving'
        ? t('fileViewer.markdownSaving')
        : autoSaveStatus === 'saved' && autoSaveTime
          ? t('fileViewer.markdownAutoSaved', { time: autoSaveTime })
          : t('fileViewer.markdownAutoSaveHint');
  const showEditor = mode === 'edit' || mode === 'split';
  const showPreview = mode === 'preview' || mode === 'split';

  const baseHtml = useMemo(() => {
    if (text === null) return null;
    const renderPartial = MarkdownRenderer.renderPartial ?? renderMarkdownToSafeHtml;
    return rewriteMarkdownImageSources(
      decorateMarkdownCodeBlocks(renderPartial(text)),
      projectId,
      file.name,
      workspaceContext,
    );
  }, [file.name, projectId, text, workspaceContext]);
  const html = highlightedHtml?.source === baseHtml && highlightedHtml.themeRevision === highlightThemeRevision
    ? highlightedHtml.html
    : baseHtml;
  const markdownBlockLines = useMemo(() => extractMarkdownBlockLines(text ?? ''), [text]);

  // The cached editor block offsets become stale whenever the source text
  // changes (line positions move) — drop them so the next sync remeasures.
  useEffect(() => {
    editorBlockOffsetsRef.current = null;
  }, [text]);

  useEffect(() => {
    if (!baseHtml) {
      setHighlightedHtml(null);
      return undefined;
    }
    let cancelled = false;
    highlightMarkdownCodeBlocks(baseHtml).then((nextHtml) => {
      if (cancelled) return;
      setHighlightedHtml(nextHtml === baseHtml ? null : { source: baseHtml, html: nextHtml, themeRevision: highlightThemeRevision });
    }).catch(() => {
      if (!cancelled) setHighlightedHtml(null);
    });
    return () => {
      cancelled = true;
    };
  }, [baseHtml, highlightThemeRevision]);

  const clearProgrammaticScrollSoon = useCallback(() => {
    if (programmaticScrollClearFrameRef.current) {
      window.cancelAnimationFrame(programmaticScrollClearFrameRef.current);
    }
    programmaticScrollClearFrameRef.current = window.requestAnimationFrame(() => {
      programmaticScrollClearFrameRef.current = window.requestAnimationFrame(() => {
        programmaticScrollRef.current = null;
        programmaticScrollClearFrameRef.current = null;
      });
    });
  }, []);

  const getEditorBlockOffsets = useCallback((): number[] | null => {
    const editor = editorRef.current;
    if (!editor || markdownBlockLines.length === 0) return null;
    const width = editor.clientWidth;
    const cached = editorBlockOffsetsRef.current;
    if (cached && cached.width === width && cached.offsets.length === markdownBlockLines.length) {
      return cached.offsets;
    }
    const offsets = measureEditorBlockOffsets(editor, markdownBlockLines, textRef.current);
    if (!offsets) return null;
    editorBlockOffsetsRef.current = { width, offsets };
    return offsets;
  }, [markdownBlockLines]);

  // Align the panes by matching each top-level markdown block's source line to
  // its rendered element, then interpolating scroll position between those
  // anchors. Falls back to proportional (ratio) sync when block anchors are
  // unavailable (e.g. raw-HTML blocks change the rendered child count).
  const computeMarkdownSyncTarget = useCallback(
    (sourcePane: MarkdownScrollPane, source: HTMLElement, target: HTMLElement): number => {
      const previewPane = markdownPreviewPaneRef.current;
      if (markdownBlockLines.length > 0 && previewPane) {
        const editorOffsets = getEditorBlockOffsets();
        const previewOffsets = editorOffsets
          ? measurePreviewBlockOffsets(previewPane, markdownBlockLines.length)
          : null;
        if (editorOffsets && previewOffsets) {
          const isEditorSource = sourcePane === 'editor';
          const sourceOffsets = isEditorSource ? editorOffsets : previewOffsets;
          const targetOffsets = isEditorSource ? previewOffsets : editorOffsets;
          const sourceAnchors = buildScrollAnchors(sourceOffsets, source.scrollHeight);
          const targetAnchors = buildScrollAnchors(targetOffsets, target.scrollHeight);
          const mapped = mapScrollPosition(source.scrollTop, sourceAnchors, targetAnchors);
          return Math.max(0, Math.min(markdownScrollRange(target), mapped));
        }
      }
      return markdownScrollTopForRatio(target, markdownScrollRatio(source));
    },
    [getEditorBlockOffsets, markdownBlockLines],
  );

  const applyMarkdownScrollSync = useCallback(
    (sourcePane: MarkdownScrollPane, targetPane: MarkdownScrollPane) => {
      const source = sourcePane === 'editor' ? editorRef.current : markdownPreviewPaneRef.current;
      const target = targetPane === 'editor' ? editorRef.current : markdownPreviewPaneRef.current;
      if (mode !== 'split' || !source || !target) return;
      const targetTop = computeMarkdownSyncTarget(sourcePane, source, target);
      if (Math.abs(target.scrollTop - targetTop) < 1) return;
      programmaticScrollRef.current = { pane: targetPane, top: targetTop };
      target.scrollTop = targetTop;
      clearProgrammaticScrollSoon();
    },
    [clearProgrammaticScrollSoon, computeMarkdownSyncTarget, mode],
  );

  const scheduleMarkdownScrollSync = useCallback(
    (sourcePane: MarkdownScrollPane, targetPane: MarkdownScrollPane) => {
      if (mode !== 'split') {
        pendingScrollSyncRef.current = null;
        return;
      }
      pendingScrollSyncRef.current = { sourcePane, targetPane };
      if (scrollSyncFrameRef.current !== null) return;
      scrollSyncFrameRef.current = window.requestAnimationFrame(() => {
        scrollSyncFrameRef.current = null;
        const pending = pendingScrollSyncRef.current;
        pendingScrollSyncRef.current = null;
        if (!pending) return;
        applyMarkdownScrollSync(pending.sourcePane, pending.targetPane);
      });
    },
    [applyMarkdownScrollSync, mode],
  );

  const shouldIgnoreMarkdownScroll = useCallback((pane: MarkdownScrollPane, element: HTMLElement): boolean => {
    const programmatic = programmaticScrollRef.current;
    if (programmatic?.pane !== pane) return false;
    if (Math.abs(element.scrollTop - programmatic.top) > 1 && activeMarkdownScrollPaneRef.current === pane) {
      return false;
    }
    programmaticScrollRef.current = null;
    return true;
  }, []);

  const handleMarkdownEditorScroll = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || shouldIgnoreMarkdownScroll('editor', editor)) return;
    activeMarkdownScrollPaneRef.current = 'editor';
    scheduleMarkdownScrollSync('editor', 'preview');
  }, [scheduleMarkdownScrollSync, shouldIgnoreMarkdownScroll]);

  const handleMarkdownPreviewScroll = useCallback(() => {
    const previewPane = markdownPreviewPaneRef.current;
    if (!previewPane || shouldIgnoreMarkdownScroll('preview', previewPane)) return;
    if (activeMarkdownScrollPaneRef.current !== 'preview') return;
    scheduleMarkdownScrollSync('preview', 'editor');
  }, [scheduleMarkdownScrollSync, shouldIgnoreMarkdownScroll]);

  const activateMarkdownScrollPane = useCallback((pane: MarkdownScrollPane) => {
    activeMarkdownScrollPaneRef.current = pane;
  }, []);

  useEffect(() => {
    const article = markdownArticleRef.current;
    if (!article) return;
    ensureMarkdownCodeBlockControls(article, t);
    if (copiedMarkdownBlockRef.current?.isConnected) {
      setMarkdownCodeBlockCopiedState(copiedMarkdownBlockRef.current, true, t);
    }
  }, [html, t]);

  useEffect(() => {
    if (mode !== 'split') {
      if (scrollSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncFrameRef.current);
        scrollSyncFrameRef.current = null;
      }
      if (programmaticScrollClearFrameRef.current !== null) {
        window.cancelAnimationFrame(programmaticScrollClearFrameRef.current);
        programmaticScrollClearFrameRef.current = null;
      }
      pendingScrollSyncRef.current = null;
      programmaticScrollRef.current = null;
      activeMarkdownScrollPaneRef.current = 'editor';
      previousModeRef.current = mode;
      return;
    }
    const sourcePane = activeMarkdownScrollPaneRef.current ?? (previousModeRef.current === 'preview' ? 'preview' : 'editor');
    const targetPane = sourcePane === 'preview' ? 'editor' : 'preview';
    scheduleMarkdownScrollSync(sourcePane, targetPane);
    previousModeRef.current = mode;
  }, [html, mode, scheduleMarkdownScrollSync]);

  async function handleMarkdownBodyClick(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>(`button[${MARKDOWN_COPY_BLOCK_ATTR}]`);
    if (!button) return;
    const block = button.closest('.markdown-code-block');
    if (!(block instanceof HTMLElement)) return;
    const pre = block.querySelector('pre');
    if (!pre) return;
    const didCopy = await copyTextToClipboard((pre.textContent ?? '').replace(/\n$/, ''));
    if (!didCopy) return;
    if (copiedMarkdownBlockRef.current && copiedMarkdownBlockRef.current !== block) {
      setMarkdownCodeBlockCopiedState(copiedMarkdownBlockRef.current, false, t);
    }
    copiedMarkdownBlockRef.current = block;
    setMarkdownCodeBlockCopiedState(block, true, t);
    if (copyBlockTimerRef.current) {
      window.clearTimeout(copyBlockTimerRef.current);
    }
    copyBlockTimerRef.current = window.setTimeout(() => {
      if (copiedMarkdownBlockRef.current) {
        setMarkdownCodeBlockCopiedState(copiedMarkdownBlockRef.current, false, t);
      }
      copiedMarkdownBlockRef.current = null;
      copyBlockTimerRef.current = null;
    }, 1800);
  }

  return (
    <div className="viewer text-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          {isStreaming ? <span className="viewer-meta">{t('fileViewer.markdownStreamingMeta')}</span> : null}
          {isError ? <span className="viewer-meta">{t('fileViewer.markdownErrorMeta')}</span> : null}
          <div className="viewer-tabs markdown-mode-tabs" role="tablist" aria-label={t('fileViewer.markdownViewMode')}>
            {(['edit', 'split', 'preview'] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={mode === item}
                className={`viewer-tab ${mode === item ? 'active' : ''}`}
                disabled={viewerOnly && item !== 'preview'}
                title={viewerOnly && item !== 'preview' ? viewerOnlyDisabledTitle : undefined}
                onClick={() => setMode(item)}
              >
                {item === 'edit'
                  ? t('fileViewer.source')
                  : item === 'split'
                    ? t('fileViewer.split')
                    : t('fileViewer.preview')}
              </button>
            ))}
          </div>
        </div>
        <div className="viewer-toolbar-actions">
          {viewerOnly ? (
            <span className="viewer-meta markdown-autosave markdown-autosave-idle">
              {viewerOnlyDisabledTitle}
            </span>
          ) : autoSaveStatus === 'error' ? (
            <button
              type="button"
              className="viewer-action markdown-autosave markdown-autosave-error"
              onClick={() => {
                if (text !== null) saveMarkdownText(text);
              }}
              title={t('fileViewer.save')}
            >
              <Icon name="alert-triangle" size={13} />
              <span>{autoSaveLabel}</span>
            </button>
          ) : (
            <span
              className={`viewer-meta markdown-autosave markdown-autosave-${autoSaveStatus}`}
            >
              {autoSaveStatus === 'saving' ? (
                <Icon name="spinner" size={13} className="icon-spin" />
              ) : autoSaveStatus === 'saved' ? (
                <Icon name="check" size={13} />
              ) : null}
              <span>{autoSaveLabel}</span>
            </span>
          )}
          <button
            type="button"
            className="viewer-action"
            onClick={() => void copy()}
            title={t('fileViewer.copyTitle')}
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} />
            <span>{copied ? t('fileViewer.copied') : t('fileViewer.copy')}</span>
          </button>
          {text !== null ? (
            <div className="share-menu chrome-share-menu" ref={downloadMenuRef}>
              <button
                type="button"
                className="viewer-action"
                aria-haspopup="menu"
                aria-expanded={downloadMenuOpen}
                disabled={viewerOnly}
                title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                onClick={() => setDownloadMenuOpen((v) => !v)}
              >
                <Icon name="download" size={13} />
                <span>{t('fileViewer.download')}</span>
              </button>
              {downloadMenuOpen ? (
                <div className="share-menu-popover" role="menu">
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    disabled={viewerOnly}
                    title={viewerOnly ? viewerOnlyDisabledTitle : undefined}
                    onClick={() => {
                      if (viewerOnly) return;
                      setDownloadMenuOpen(false);
                      exportAsMd(text, exportTitle);
                    }}
                  >
                    <span className="share-menu-icon"><RemixIcon name="file-line" size={15} /></span>
                    <span>{t('fileViewer.exportMd')}</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className={`viewer-body markdown-workbench markdown-workbench-${mode}`}>
        {text === null || html === null ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : (
          <>
            {showEditor ? (
              <section className="markdown-editor-pane" aria-label={t('fileViewer.markdownEditor')}>
                <textarea
                  ref={editorRef}
                  className="markdown-editor"
                  value={text}
                  aria-label={t('fileViewer.markdownEditor')}
                  placeholder={t('fileViewer.markdownEditorPlaceholder')}
                  spellCheck
                  autoFocus
                  onFocus={() => activateMarkdownScrollPane('editor')}
                  onChange={(event) => {
                    activateMarkdownScrollPane('editor');
                    setText(event.currentTarget.value);
                  }}
                  onScroll={handleMarkdownEditorScroll}
                  onPaste={handleEditorPaste}
                  onDrop={handleEditorDrop}
                />
              </section>
            ) : null}
            {showPreview ? (
              <div className="markdown-preview-pane-wrap">
                <section
                  ref={markdownPreviewPaneRef}
                  className="markdown-preview-pane"
                  aria-label={t('fileViewer.markdownPreview')}
                  onPointerDown={() => activateMarkdownScrollPane('preview')}
                  onWheel={() => activateMarkdownScrollPane('preview')}
                  onTouchStart={() => activateMarkdownScrollPane('preview')}
                  onKeyDown={() => activateMarkdownScrollPane('preview')}
                  onFocus={() => activateMarkdownScrollPane('preview')}
                  onScroll={handleMarkdownPreviewScroll}
                >
                  {isStreaming ? <div className="markdown-status">{t('fileViewer.markdownStreamingStatus')}</div> : null}
                  {isError ? <div className="markdown-status markdown-status-error">{t('fileViewer.markdownErrorStatus')}</div> : null}
                  {/* Safe by contract: renderMarkdownToSafeHtml escapes raw HTML and rejects unsafe link protocols. */}
                  <article
                    ref={markdownArticleRef}
                    className="markdown-rendered"
                    onClick={(event) => void handleMarkdownBodyClick(event)}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </section>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function isMarkdownImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
}

function markdownImageAlt(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'image';
}

function CodeWithLines({ text }: { text: string }) {
  const lines = text.split('\n');
  // Trailing newline produces a phantom empty line — keep gutter aligned.
  const gutter = lines.map((_, i) => `${i + 1}`).join('\n');
  return (
    <pre className="code-viewer">
      <code className="gutter" aria-hidden>
        {gutter}
      </code>
      <code className="lines">{text}</code>
    </pre>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function documentMetaLabel(file: ProjectFile, t: TranslateFn): string {
  if (file.kind === 'pdf') return t('fileViewer.pdfMeta');
  if (file.kind === 'document') return t('fileViewer.documentMeta');
  if (file.kind === 'presentation') return t('fileViewer.presentationMeta');
  if (file.kind === 'spreadsheet') return t('fileViewer.spreadsheetMeta');
  return t('fileViewer.binaryMeta', { size: humanSize(file.size) });
}
