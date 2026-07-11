// Wired document preview viewer: binds the fetch-on-mount hook to its
// presentational view.
import type { ProjectFile } from '../../../types';
import { useWiredDocumentPreview } from '../hooks/useDocumentPreview.hooks';
import { DocumentPreviewViewerView } from './DocumentPreviewViewerView';

export function DocumentPreviewViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const { preview, loading } = useWiredDocumentPreview(projectId, file.name, file.mtime);
  return (
    <DocumentPreviewViewerView projectId={projectId} file={file} loading={loading} preview={preview} />
  );
}
