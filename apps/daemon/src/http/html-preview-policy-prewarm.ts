import { HtmlPreviewPolicyIndex } from './html-preview-policy-index.js';
import { PreviewDocumentSnapshotStore } from './preview-document-snapshot.js';

export interface HtmlPreviewPolicyFileIdentity {
  filePath: string;
  mime?: string;
}

export function previewSnapshotPolicyCacheKey(filePath: string): string {
  // Request-local immutable snapshots for the same logical file share exact
  // version policy without treating a mutable authored path as a snapshot.
  return `snapshot\0${filePath}`;
}

export async function prewarmHtmlPreviewPolicyFile(
  index: HtmlPreviewPolicyIndex,
  fileName: string,
  file: HtmlPreviewPolicyFileIdentity,
  previewDocumentSnapshotStore: PreviewDocumentSnapshotStore,
): Promise<void> {
  const isHtml = file.mime
    ? /^text\/html(?:;|$)/i.test(file.mime)
    : /\.html?$/i.test(fileName);
  if (!isHtml) return;

  const snapshot = await previewDocumentSnapshotStore.captureFile(file.filePath);
  try {
    await index.get({
      filePath: snapshot.filePath,
      cacheKey: previewSnapshotPolicyCacheKey(file.filePath),
      documentVersion: snapshot.documentVersion,
    });
  } finally {
    await snapshot.release();
  }
}
