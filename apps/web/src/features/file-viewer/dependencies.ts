// Composition root for the file-viewer slice: binds concrete transport
// adapters to the slice's ports. This is the ONE feature file allowed to
// import `providers/` — everything else in the slice depends on a port, so
// swapping the adapter (or a fake in tests) touches only this file.
import {
  fetchLiveArtifact,
  fetchLiveArtifactCode,
  fetchLiveArtifactRefreshes,
  fetchProjectFilePreview,
  fetchProjectFiles,
  fetchProjectFileText,
  fetchProjectFileVersion,
  fetchProjectFileVersions,
  LiveArtifactRefreshError,
  refreshLiveArtifact as refreshLiveArtifactTransport,
  restoreProjectFileVersion,
} from '../../providers/registry';
import { copyTextFileToClipboard } from '../../providers/file-viewer/clipboard';
import {
  subscribeEscapeKey,
  subscribeOutsideDismiss,
  subscribeOutsidePointerDismiss,
  subscribeOutsidePointerDown,
} from '../../providers/file-viewer/outside-dismiss';
import { observeElementSize } from '../../providers/file-viewer/element-size';
import { documentBodyPortalRoot } from '../../providers/file-viewer/portal-root';
import { resolveChromeActionsHost } from '../../providers/file-viewer/chrome-actions-host';
import { openInNewTab } from '../../providers/file-viewer/window-open';
import { saveTemplate } from '../../providers/templates';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import { LiveArtifactRefreshFailure } from './types';
import type {
  ChromeActionsHostPort,
  ClipboardPort,
  DismissPort,
  DocumentPreviewPort,
  ElementSizePort,
  FileTextPort,
  FileVersionsPort,
  LiveArtifactPort,
  PortalPort,
  ProjectFilesPort,
  ShareLinkClipboardPort,
  TemplateSavePort,
  WindowOpenPort,
} from './ports';

/** Default binding: the real `/api/projects/:id/files/:name/preview` transport. */
export const documentPreviewPort: DocumentPreviewPort = {
  fetchProjectFilePreview,
};

/** Default binding: the real project-file-text transport (raw GET + cache-bust). */
export const fileTextPort: FileTextPort = {
  fetchProjectFileText,
};

/** Default binding: the real Clipboard API + textarea-fallback adapter. */
export const clipboardPort: ClipboardPort = {
  copyTextToClipboard: copyTextFileToClipboard,
};

/** Default binding: the real project file-list transport. */
export const projectFilesPort: ProjectFilesPort = {
  fetchProjectFiles,
};

/** Default binding: the real document mousedown/pointerdown/Escape dismiss bridges. */
export const dismissPort: DismissPort = {
  subscribeOutsideDismiss,
  subscribeOutsidePointerDismiss,
  subscribeOutsidePointerDown,
  subscribeEscapeKey,
};

/** Default binding: the real ResizeObserver/scroll/resize element-measurement bridge. */
export const elementSizePort: ElementSizePort = {
  observeElementSize,
};

/** Default binding: the real project-file-version-history transport. */
export const fileVersionsPort: FileVersionsPort = {
  fetchProjectFileVersions,
  fetchProjectFileVersion,
  restoreProjectFileVersion,
};

/** Default binding: the real `document.body` portal-root bridge. */
export const portalPort: PortalPort = {
  getPortalRoot: documentBodyPortalRoot,
};

/** Default binding: the real `/api/templates` save-as-template transport. */
export const templateSavePort: TemplateSavePort = {
  saveTemplate,
};

/** Default binding: the real Clipboard API + textarea-fallback, boolean-result adapter. */
export const shareLinkClipboardPort: ShareLinkClipboardPort = {
  copyToClipboard,
};

/**
 * Default binding: the real `/api/live-artifacts` transport. `refreshLiveArtifact`
 * wraps the provider's `refreshLiveArtifact`/catches its `LiveArtifactRefreshError`
 * and rethrows the in-slice `LiveArtifactRefreshFailure` (types.ts), so callers
 * inside the slice never need to import the provider's error class to do an
 * `instanceof` check.
 */
export const liveArtifactPort: LiveArtifactPort = {
  fetchLiveArtifact,
  fetchLiveArtifactRefreshes,
  fetchLiveArtifactCode,
  async refreshLiveArtifact(projectId, artifactId) {
    try {
      return await refreshLiveArtifactTransport(projectId, artifactId);
    } catch (error) {
      if (error instanceof LiveArtifactRefreshError) {
        throw new LiveArtifactRefreshFailure(error.message, error.status, error.code);
      }
      throw error;
    }
  },
};

/** Default binding: the real app-chrome file-actions portal-slot bridge. */
export const chromeActionsHostPort: ChromeActionsHostPort = {
  getChromeActionsHost: resolveChromeActionsHost,
};

/** Default binding: the real `window.open` new-tab bridge. */
export const windowOpenPort: WindowOpenPort = {
  openInNewTab,
};
