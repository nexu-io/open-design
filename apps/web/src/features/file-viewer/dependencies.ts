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
  uploadProjectFiles,
  writeProjectTextFile,
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
import {
  ensureMarkdownCodeBlockControls,
  highlightMarkdownCodeBlocks,
  setMarkdownCodeBlockCopiedState,
} from '../../providers/file-viewer/markdown-code-blocks';
import { measureEditorBlockOffsets } from '../../providers/file-viewer/markdown-editor-measure';
import { subscribeThemeChange } from '../../providers/file-viewer/theme-watch';
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
  MarkdownCodeBlocksPort,
  MarkdownEditorMeasurePort,
  MarkdownFilePort,
  PortalPort,
  ProjectFilesPort,
  ShareLinkClipboardPort,
  TemplateSavePort,
  ThemeWatchPort,
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

/**
 * Default binding: the real project-file-text read/write + multi-file-upload
 * transport the markdown viewer needs. `writeProjectTextFile` collapses the
 * provider's `ProjectFile | null` result to the boolean the caller actually
 * branches on; `uploadProjectFiles` narrows `ChatAttachment` to the
 * `name`/`path` fields the slice needs (port result types stay in-slice).
 */
export const markdownFilePort: MarkdownFilePort = {
  fetchProjectFileText,
  async writeProjectTextFile(projectId, name, content) {
    return (await writeProjectTextFile(projectId, name, content)) != null;
  },
  async uploadProjectFiles(projectId, files, dir) {
    const result = await uploadProjectFiles(projectId, files, dir);
    return { uploaded: result.uploaded.map(({ name, path }) => ({ name, path })) };
  },
};

/** Default binding: the real shiki-highlight + code-block-copy-button DOM adapters. */
export const markdownCodeBlocksPort: MarkdownCodeBlocksPort = {
  highlightCodeBlocks: highlightMarkdownCodeBlocks,
  ensureCodeBlockControls: ensureMarkdownCodeBlockControls,
  setCodeBlockCopiedState: setMarkdownCodeBlockCopiedState,
};

/** Default binding: the real `data-theme` MutationObserver + `matchMedia` bridge. */
export const themeWatchPort: ThemeWatchPort = {
  subscribeThemeChange,
};

/** Default binding: the real hidden-mirror textarea block-offset measurement. */
export const markdownEditorMeasurePort: MarkdownEditorMeasurePort = {
  measureEditorBlockOffsets,
};
