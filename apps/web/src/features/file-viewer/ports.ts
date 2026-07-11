// The file-viewer slice's dependency on transport, expressed as an interface
// it owns. The slice depends on this port, never on `providers/` directly; a
// provider is bound to it in `dependencies.ts`. Tests supply a hand-written
// fake — no global `fetch` mocking, no module-path mocks.
import type {
  ChatAttachment,
  CloudflarePagesConfigHints,
  CloudflarePagesDeploySelection,
  DeployConfigResponse,
  DeployProjectFileResponse,
  DeployProviderId,
  DeploymentInfo,
  ProjectTemplate,
  ProjectFileVersion,
  SocialShareRequest,
  SocialShareResponse,
  UpdateDeployConfigRequest,
} from '@open-design/contracts';
import type { LiveArtifact, LiveArtifactRefreshLogEntry } from '../../types';
import type {
  CloudflarePagesZoneOption,
  DocumentPreview,
  LiveArtifactCodeVariant,
  LiveArtifactRefreshResult,
  PreviewCanvasSize,
  TranslateFn,
} from './types';

/** Transport the read-only document preview viewer needs. */
export interface DocumentPreviewPort {
  fetchProjectFilePreview(projectId: string, name: string): Promise<DocumentPreview | null>;
}

/** Transport the read-only text-based viewers (SVG source, plain text) need. */
export interface FileTextPort {
  fetchProjectFileText(
    projectId: string,
    name: string,
    options?: { cache?: RequestCache; cacheBustKey?: string | number },
  ): Promise<string | null>;
}

/** The text viewer's copy-to-clipboard side effect (DOM-touching, so a port). */
export interface ClipboardPort {
  copyTextToClipboard(text: string): Promise<void>;
}

/** Transport the React component viewer's sibling-HTML-entry scan needs. */
export interface ProjectFilesPort {
  fetchProjectFiles(projectId: string): Promise<Array<{ name: string }>>;
}

/** Dismiss a popover on an outside mousedown/pointerdown or Escape (DOM-touching, so a port). */
export interface DismissPort {
  subscribeOutsideDismiss(getContainer: () => HTMLElement | null, onDismiss: () => void): () => void;
  subscribeOutsidePointerDismiss(getContainer: () => HTMLElement | null, onDismiss: () => void): () => void;
  /** Pointerdown-only outside-dismiss, no Escape (caller owns its own Escape priority chain). */
  subscribeOutsidePointerDown(getContainer: () => HTMLElement | null, onDismiss: () => void): () => void;
  /** Escape-only, for a caller multiplexing Escape across several dismissible surfaces. */
  subscribeEscapeKey(onEscape: () => void): () => void;
}

/** Measure an element's box and re-measure on resize/scroll (DOM-touching, so a port). */
export interface ElementSizePort {
  observeElementSize(el: HTMLElement, onMeasure: (size: PreviewCanvasSize) => void): () => void;
}

/** Resolve the DOM node a modal should portal into (DOM-touching, so a port). */
export interface PortalPort {
  getPortalRoot(): HTMLElement | null;
}

/**
 * Transport the file-version manager needs: list a file's versions, fetch one
 * version's content, and restore a version. Result shapes are defined in-slice
 * (`types.ts`) per ADR 0002, structurally identical to
 * `providers/registry`'s `ProjectFileVersionsResponse`/`ProjectFileVersionResponse`/
 * `RestoreProjectFileVersionResponse`.
 */
export interface FileVersionsPort {
  fetchProjectFileVersions(
    projectId: string,
    name: string,
  ): Promise<{ versions: ProjectFileVersion[] } | null>;
  fetchProjectFileVersion(
    projectId: string,
    name: string,
    versionId: string,
  ): Promise<{ content: string } | null>;
  restoreProjectFileVersion(
    projectId: string,
    name: string,
    version: Pick<ProjectFileVersion, 'id'>,
  ): Promise<{
    version: ProjectFileVersion | null;
    versionWarning?: { code: string; message: string };
  } | null>;
}

/** Transport the "Save as template" flow needs to snapshot the project. */
export interface TemplateSavePort {
  saveTemplate(input: {
    name: string;
    description?: string;
    sourceProjectId: string;
  }): Promise<ProjectTemplate | null>;
}

/**
 * The share-link copy action's clipboard side effect (DOM-touching, so a
 * port). Distinct from `ClipboardPort`: this caller needs the boolean
 * success/failure result to drive the copied/failed feedback pill.
 */
export interface ShareLinkClipboardPort {
  copyToClipboard(text: string): Promise<boolean>;
}

/** Transport the live-artifact viewer needs: detail/code/refresh-history reads and the refresh action. */
export interface LiveArtifactPort {
  fetchLiveArtifact(projectId: string, artifactId: string): Promise<LiveArtifact | null>;
  fetchLiveArtifactRefreshes(projectId: string, artifactId: string): Promise<LiveArtifactRefreshLogEntry[]>;
  fetchLiveArtifactCode(
    projectId: string,
    artifactId: string,
    variant: LiveArtifactCodeVariant,
  ): Promise<string | null>;
  /** Throws a `LiveArtifactRefreshFailure` (types.ts) on failure. */
  refreshLiveArtifact(projectId: string, artifactId: string): Promise<LiveArtifactRefreshResult>;
}

/** Resolve the app chrome's file-actions portal slot (DOM-touching, so a port). */
export interface ChromeActionsHostPort {
  getChromeActionsHost(): HTMLElement | null;
}

/**
 * Open a URL in a new tab (DOM-touching, so a port). `getLocationOrigin`
 * lives here too — same "trivial `window` read/write" category — and backs
 * the deploy flow's share-URL resolution (a relative share path needs
 * `window.location.origin` to become absolute).
 */
export interface WindowOpenPort {
  openInNewTab(url: string): void;
  getLocationOrigin(): string;
}

/** Transport the markdown viewer needs: load/save the file text, upload pasted/dropped images. */
export interface MarkdownFilePort {
  fetchProjectFileText(projectId: string, name: string): Promise<string | null>;
  /** Resolves `true` on a successful write, mirroring the caller's `if (!saved) throw` truthiness check. */
  writeProjectTextFile(projectId: string, name: string, content: string): Promise<boolean>;
  uploadProjectFiles(
    projectId: string,
    files: File[],
    dir?: string,
  ): Promise<{ uploaded: Array<Pick<ChatAttachment, 'name' | 'path'>> }>;
}

/**
 * DOM-touching markdown code-block helpers (shiki highlighting via a dynamic
 * import, copy-button DOM injection, copied-state toggling) — all build/
 * mutate detached or caller-supplied elements via a bare `document`, so a
 * port per the guard.
 */
export interface MarkdownCodeBlocksPort {
  highlightCodeBlocks(html: string): Promise<string>;
  ensureCodeBlockControls(root: HTMLElement, t: TranslateFn): void;
  setCodeBlockCopiedState(block: HTMLElement, copied: boolean, t: TranslateFn): void;
}

/** Notify on OS/app theme changes (DOM `MutationObserver` + `matchMedia`, so a port). */
export interface ThemeWatchPort {
  subscribeThemeChange(onChange: () => void): () => void;
}

/**
 * Measure a markdown textarea's soft-wrapped block offsets via a hidden
 * mirror element (bare `document.createElement`/`window.getComputedStyle`,
 * so a port — distinct from `measurePreviewBlockOffsets` in `rules.ts`,
 * which only reads a caller-supplied element and needs no port).
 */
export interface MarkdownEditorMeasurePort {
  measureEditorBlockOffsets(textarea: HTMLTextAreaElement, blockLines: number[], text: string): number[] | null;
}

/**
 * Transport the deploy/publish flow needs: read existing deployments/config,
 * save provider credentials, deploy the file, poll a pending link, list
 * Cloudflare Pages zones, and build the social-share payload for a deployed
 * URL.
 */
export interface DeployTransportPort {
  fetchProjectDeployments(projectId: string): Promise<DeploymentInfo[]>;
  fetchDeployConfig(providerId?: DeployProviderId): Promise<DeployConfigResponse | null>;
  updateDeployConfig(input: UpdateDeployConfigRequest): Promise<DeployConfigResponse | null>;
  deployProjectFile(
    projectId: string,
    fileName: string,
    providerId?: DeployProviderId,
    cloudflarePages?: CloudflarePagesDeploySelection,
  ): Promise<DeployProjectFileResponse>;
  checkDeploymentLink(projectId: string, deploymentId: string): Promise<DeployProjectFileResponse>;
  fetchCloudflarePagesZones(): Promise<{
    zones: CloudflarePagesZoneOption[];
    cloudflarePages?: CloudflarePagesConfigHints;
  } | null>;
  createSocialSharePayload(input: SocialShareRequest): Promise<SocialShareResponse>;
}
