// Composition root for the file-viewer slice: binds concrete transport
// adapters to the slice's ports. This is the ONE feature file allowed to
// import `providers/` — everything else in the slice depends on a port, so
// swapping the adapter (or a fake in tests) touches only this file.
import {
  fetchProjectFilePreview,
  fetchProjectFiles,
  fetchProjectFileText,
} from '../../providers/registry';
import { copyTextFileToClipboard } from '../../providers/file-viewer/clipboard';
import { subscribeOutsideDismiss, subscribeOutsidePointerDismiss } from '../../providers/file-viewer/outside-dismiss';
import { saveTemplate } from '../../providers/templates';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import type {
  ClipboardPort,
  DismissPort,
  DocumentPreviewPort,
  FileTextPort,
  ProjectFilesPort,
  ShareLinkClipboardPort,
  TemplateSavePort,
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
};

/** Default binding: the real `/api/templates` save-as-template transport. */
export const templateSavePort: TemplateSavePort = {
  saveTemplate,
};

/** Default binding: the real Clipboard API + textarea-fallback, boolean-result adapter. */
export const shareLinkClipboardPort: ShareLinkClipboardPort = {
  copyToClipboard,
};
