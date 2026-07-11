// Read-only fallback viewer for files with no dedicated preview.
import { useT } from '../../../i18n';
import type { ProjectFile } from '../../../types';
import { humanSize } from '../rules';
import { FileActions } from './FileActions';

export function BinaryViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  return (
    <div className="viewer binary-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.binaryMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body">
        <div className="viewer-empty">
          {t('fileViewer.binaryNote', { size: file.size })}
        </div>
      </div>
    </div>
  );
}
