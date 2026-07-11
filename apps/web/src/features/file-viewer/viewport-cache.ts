// In-memory (module-singleton) cache mapping a preview surface's key to its
// last-selected viewport preset, so switching tabs/files preserves the user's
// choice without persisting anything to disk. A plain JS Map is not DOM/
// transport, so it may live in the slice; capped LRU-by-insertion eviction
// keeps memory bounded across a long session. Shared by every preview surface
// (HtmlViewer's file preview and LiveArtifactViewer alike) so they draw from
// one eviction budget, exactly as the single pre-extraction module-level Map
// did.
import type { ProjectFile } from '../../types';
import type { PreviewViewportId } from './types';

const MAX_CACHED_PREVIEW_VIEWPORTS = 128;
const previewViewportState = new Map<string, PreviewViewportId>();

export function previewViewportStateKey(projectId: string, file: Pick<ProjectFile, 'name' | 'path'>): string {
  return `${projectId}:${file.path || file.name}`;
}

export function getCachedPreviewViewport(key: string): PreviewViewportId | undefined {
  return previewViewportState.get(key);
}

export function setCachedPreviewViewport(key: string, viewport: PreviewViewportId): void {
  previewViewportState.set(key, viewport);
  if (previewViewportState.size > MAX_CACHED_PREVIEW_VIEWPORTS) {
    const oldest = previewViewportState.keys().next().value;
    if (oldest != null) previewViewportState.delete(oldest);
  }
}
