// The file-viewer slice's dependency on transport, expressed as an interface
// it owns. The slice depends on this port, never on `providers/` directly; a
// provider is bound to it in `dependencies.ts`. Tests supply a hand-written
// fake — no global `fetch` mocking, no module-path mocks.
import type { ProjectTemplate } from '@open-design/contracts';
import type { DocumentPreview } from './types';

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
}

/** Transport the "Save as template" flow needs to snapshot the project. */
export interface TemplateSavePort {
  saveTemplate(input: {
    name: string;
    description?: string;
    sourceProjectId: string;
  }): Promise<ProjectTemplate | null>;
}
