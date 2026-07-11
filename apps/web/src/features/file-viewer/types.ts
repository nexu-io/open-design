// UI-only types for the file-viewer slice. Pure data shapes with no React,
// transport, or DOM dependency, so slice rules and their tests can import them
// without pulling in the orchestrator (ADR 0002).
import type { Dict } from '../../i18n/types';
import type { DeployProviderId } from '@open-design/contracts';
import type { ManualEditStyles } from '../../edit-mode/types';
import type { LiveArtifact } from '../../types';

/**
 * The i18n translate function the slice's formatters accept. Structurally
 * identical to the orchestrator's own alias — duplicated by intent (ADR 0002:
 * only wire DTOs and transport adapters are shared for correctness).
 */
export type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

/** A point in preview/board coordinate space (pointer path, lasso vertex). */
export type StrokePoint = { x: number; y: number };

/** An axis-aligned rectangle in `{ x, y, width, height }` form. */
export type Rect = { x: number; y: number; width: number; height: number };

/** An axis-aligned rectangle in `{ left, top, width, height }` form. */
export type RectLTWH = { left: number; top: number; width: number; height: number };

/**
 * Loosely-typed inbound shape of a single entry in an `od:inspect-overrides`
 * message. The host does not trust the iframe payload, so every field is
 * `unknown` until `serializeInspectOverrides` re-validates it.
 */
export type InspectOverridePayload = {
  selector?: unknown;
  props?: unknown;
};

/** One host-side inspect override: the selector plus its allow-listed props. */
export type InspectOverrideEntry = {
  selector: string;
  props: Record<string, string>;
};

/** Authoritative host-side override map: elementId -> { selector, props }. */
export type InspectOverrideMap = Record<string, InspectOverrideEntry>;

/**
 * Result of walking an HTML source to strip its persisted inspect-override
 * `<style>` blocks while recording where the real `<head>` boundaries land.
 */
export type InspectSpliceScan = {
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

/** The three preview breakpoints the board/inspect canvas can emulate. */
export type PreviewViewportId = 'desktop' | 'tablet' | 'mobile';

/** Measured preview canvas box, with the current scroll offset if any. */
export type PreviewCanvasSize = { width: number; height: number; scrollLeft?: number; scrollTop?: number };

/** Inputs that shape how much of the canvas the comment side-dock reserves. */
export type CommentPreviewCanvasOptions = {
  boardMode: boolean;
  sidePanelCollapsed: boolean;
  viewport?: PreviewViewportId;
};

export type PreviewScaleOptions = {
  canvasPadding?: number;
};

/** A single viewport-switcher preset (desktop/tablet/mobile framing). */
export type PreviewViewportPreset = {
  id: PreviewViewportId;
  width: number | null;
  height: number | null;
  labelKey: keyof Dict;
  titleKey: keyof Dict;
};

/** Board-space scale + offset applied to overlays for a non-desktop viewport. */
export type PreviewOverlayTransform = { scale: number; offsetX: number; offsetY: number };

/** A selectable Cloudflare Pages DNS zone in the deploy modal's zone picker. */
export type CloudflarePagesZoneOption = {
  id: string;
  name: string;
  status?: string;
  type?: string;
};

/** One rendered link/status row in the deploy modal's result panel. */
export type DeployResultCard = {
  id: string;
  label: string;
  url: string;
  status: string;
  message?: string;
};

/** Static per-provider copy/link config for the deploy modal. */
export type DeployProviderOption = {
  id: DeployProviderId;
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

/** A recognized markdown fenced-code-block language, for the copy/highlight UI. */
export type MarkdownCodeLanguage = {
  lang: string;
  label: string;
};

/** Which edge of the hovered comment row a side-dock drag would drop onto. */
export type CommentSideDropEdge = 'before' | 'after';

/** A manual-edit inspector style save queued to flush after the debounce window. */
export type ManualEditPendingStyleSave = {
  id: string;
  styles: Partial<ManualEditStyles>;
  label: string;
  version: number;
};

/**
 * Result shape of the document-preview port, defined in-slice per ADR 0002
 * (a port's result type must not be imported from `providers/`, even as a
 * type-only import — the boundary guard is AST-level, not type-aware).
 * Structurally identical to `providers/registry`'s `ProjectFilePreview`.
 */
export type DocumentPreviewSection = {
  title: string;
  lines: string[];
};

export type DocumentPreview = {
  kind: 'pdf' | 'document' | 'presentation' | 'spreadsheet';
  title: string;
  sections: DocumentPreviewSection[];
};

/** Which pane the SVG viewer's preview/source toggle shows. */
export type SvgViewerMode = 'preview' | 'source';

/** Which pane(s) the markdown viewer's edit/split/preview toggle shows. */
export type MarkdownViewerMode = 'edit' | 'split' | 'preview';

/** The markdown editor's debounced-autosave status. */
export type MarkdownSaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Which markdown pane last drove a scroll-sync interaction. */
export type MarkdownScrollPane = 'editor' | 'preview';

/** The active board interaction mode: inspecting elements, or drawing a pod lasso. */
export type BoardTool = 'inspect' | 'pod';

/** The computed-style facets the inspect bridge reads back for a selected element. */
export type InspectStyleSnapshot = {
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

/** The nearest un-annotated descendant the user actually clicked, when the
 * inspect target had to walk up to the nearest `data-od-id` ancestor. */
export type InspectClickedDescendant = {
  label: string;
  text: string;
};

/** The element currently selected in the inspect panel. */
export type InspectTarget = {
  elementId: string;
  selector: string;
  label: string;
  text: string;
  style: InspectStyleSnapshot;
  clickedDescendant?: InspectClickedDescendant;
};

/**
 * The subset of the app's analytics context a feature hook needs to fire
 * click->result tracking. Structurally identical to `AnalyticsContextValue`
 * in `analytics/provider.tsx` (not exported there) — duplicated by intent
 * (ADR 0002: only wire DTOs and transport adapters are shared for
 * correctness).
 */
export type TemplateSaveAnalytics = {
  track: (
    event: string,
    properties: Record<string, unknown>,
    options?: { requestId?: string; insertId?: string },
  ) => void;
  newRequestId: () => string;
};

/**
 * The subset of the app's analytics context the file-version-manager hook
 * needs (only `track` — this modal never correlates a click to a later async
 * result). Duplicated rather than reusing `TemplateSaveAnalytics` by intent
 * (ADR 0002: only wire DTOs and transport adapters are shared for
 * correctness).
 */
export type FileVersionManagerAnalytics = {
  track: (
    event: string,
    properties: Record<string, unknown>,
    options?: { requestId?: string; insertId?: string },
  ) => void;
};

/**
 * The subset of the app's analytics context `useArtifactAnalytics` needs (the
 * share/export click->result funnel correlates a click to a later async
 * result, so it needs `newRequestId` too). Duplicated rather than reusing
 * `TemplateSaveAnalytics` by intent (ADR 0002: only wire DTOs and transport
 * adapters are shared for correctness).
 */
export type ArtifactTrackingAnalytics = {
  track: (
    event: string,
    properties: Record<string, unknown>,
    options?: { requestId?: string; insertId?: string },
  ) => void;
  newRequestId: () => string;
};

/**
 * The export/share loading|success|error toast `useArtifactAnalytics`'s
 * `fireShareExport` drives. The toast state itself is owned by the
 * not-yet-extracted export/download HtmlViewer cluster (its `exportToast`
 * state lives in the orchestrator until that cluster lands), so the hook
 * reaches it through an `onExportToast` deps callback instead of owning it.
 */
export type ArtifactExportToast = {
  message: string;
  tone: 'default' | 'success' | 'error' | 'loading';
};

/**
 * Result shape of the live-artifact refresh port, defined in-slice per ADR
 * 0002 (a port's result type must not be imported from `providers/`).
 * Structurally identical to `providers/registry`'s `LiveArtifactRefreshResult`.
 */
export type LiveArtifactRefreshResult = {
  artifact: LiveArtifact;
  refresh: {
    id: string;
    status: 'succeeded';
    refreshedSourceCount: number;
  };
};

/**
 * Slice-local error the live-artifact port throws on a failed refresh/update
 * call, defined in-slice per ADR 0002 rather than importing
 * `providers/registry`'s `LiveArtifactRefreshError` class directly (the
 * boundary guard is AST-level and blocks any `providers/` import outside
 * `dependencies.ts`, including one needed only for a runtime `instanceof`
 * check). `dependencies.ts` catches the provider's error and rethrows this one
 * structurally.
 */
export class LiveArtifactRefreshFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'LiveArtifactRefreshFailure';
  }
}

export type LiveArtifactRefreshEventPhase = 'started' | 'succeeded' | 'failed';

/** One session-local (non-persisted) live-artifact refresh attempt. */
export type LiveArtifactRefreshEvent = {
  id: number;
  phase: LiveArtifactRefreshEventPhase;
  at: number;
  durationMs?: number;
  refreshedSourceCount?: number;
  error?: string;
};

export type RefreshStatusTone = 'neutral' | 'running' | 'success' | 'warning' | 'error';

/** Label/tone/description for the live-artifact refresh status badge. */
export type RefreshStatusDescriptor = {
  label: string;
  tone: RefreshStatusTone;
  description: string;
};

/** Which source variant the live-artifact code panel is showing. */
export type LiveArtifactCodeVariant = 'template' | 'rendered-source';
