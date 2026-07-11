// Presentational read-only document (pdf/doc/ppt/xlsx) preview: props in, JSX
// out. State + transport live in `useDocumentPreview`.
import { useT } from '../../../i18n';
import type { ProjectFile } from '../../../types';
import { documentMetaLabel } from '../formatters';
import { humanSize } from '../rules';
import type { DocumentPreview } from '../types';
import { FileActions } from './FileActions';

export function DocumentPreviewViewerView({
  projectId,
  file,
  loading,
  preview,
}: {
  projectId: string;
  file: ProjectFile;
  loading: boolean;
  preview: DocumentPreview | null;
}) {
  const t = useT();
  return (
    <div className="viewer document-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {documentMetaLabel(file, t)} · {humanSize(file.size)}
          </span>
        </div>
        <FileActions projectId={projectId} file={file} />
      </div>
      <div className="viewer-body">
        {loading ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : preview ? (
          <div className="document-preview">
            <h2>{preview.title}</h2>
            {preview.sections.map((section, idx) => (
              <section key={`${section.title}-${idx}`}>
                <h3>{section.title}</h3>
                {section.lines.map((line, lineIdx) => (
                  <p key={`${lineIdx}-${line}`}>{line}</p>
                ))}
              </section>
            ))}
          </div>
        ) : (
          <div className="viewer-empty">{t('fileViewer.previewUnavailable')}</div>
        )}
      </div>
    </div>
  );
}
