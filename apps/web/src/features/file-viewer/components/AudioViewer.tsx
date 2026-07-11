// Read-only audio (<audio>) viewer.
import { useT } from '../../../i18n';
import { Icon } from '../../../components/Icon';
import type { ProjectFile } from '../../../types';
import { fileRawUrl, humanSize } from '../rules';
import { FileActions } from './FileActions';

export function AudioViewer({
  projectId,
  file,
}: {
  projectId: string;
  file: ProjectFile;
}) {
  const t = useT();
  const url = `${fileRawUrl(projectId, file.name)}?v=${Math.round(file.mtime)}`;
  return (
    <div className="viewer audio-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.audioMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body audio-body">
        <div className="audio-card">
          <Icon name="mic" size={28} />
          <div className="audio-card-name">{file.name}</div>
          <audio src={url} controls preload="metadata" />
        </div>
      </div>
    </div>
  );
}
