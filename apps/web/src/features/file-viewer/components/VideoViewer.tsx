// Read-only video (<video>) viewer.
import { useT } from '../../../i18n';
import type { ProjectFile } from '../../../types';
import { fileRawUrl, humanSize } from '../rules';
import { FileActions } from './FileActions';

export function VideoViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const url = `${fileRawUrl(projectId, file.name)}?v=${Math.round(file.mtime)}`;
  return (
    <div className="viewer video-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.videoMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body video-body">
        <video src={url} controls playsInline preload="metadata" />
      </div>
    </div>
  );
}
