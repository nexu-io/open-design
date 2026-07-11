// The file-viewer slice's dependency on transport, expressed as an interface
// it owns. The slice depends on this port, never on `providers/` directly; a
// provider is bound to it in `dependencies.ts`. Tests supply a hand-written
// fake — no global `fetch` mocking, no module-path mocks.
import type { ProjectFileVersion, ProjectTemplate } from '@open-design/contracts';
import type { LiveArtifact, LiveArtifactRefreshLogEntry } from '../../types';
import type {
  DocumentPreview,
  LiveArtifactCodeVariant,
  LiveArtifactRefreshResult,
  PreviewCanvasSize,
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

/** Open a URL in a new tab (DOM-touching, so a port). */
export interface WindowOpenPort {
  openInNewTab(url: string): void;
}
