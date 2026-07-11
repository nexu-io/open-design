// Presentational SVG viewer: preview/source toggle, reload, download/open.
// State + transport live in `useSvgSource`.
import { useT } from '../../../i18n';
import { Icon } from '../../../components/Icon';
import type { ProjectFile } from '../../../types';
import { fileRawUrl, humanSize } from '../rules';
import type { SvgViewerMode } from '../types';

export function SvgViewerView({
  projectId,
  file,
  mode,
  setMode,
  source,
  loadingSource,
  sourceError,
  reloadKey,
  onReload,
}: {
  projectId: string;
  file: ProjectFile;
  mode: SvgViewerMode;
  setMode: (mode: SvgViewerMode) => void;
  source: string | null;
  loadingSource: boolean;
  sourceError: boolean;
  reloadKey: number;
  onReload: () => void;
}) {
  const t = useT();
  const url = `${fileRawUrl(projectId, file.name)}?v=${Math.round(file.mtime)}&r=${reloadKey}`;

  return (
    <div className="viewer svg-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <span className="viewer-meta">
            {t('fileViewer.imageMeta', { size: humanSize(file.size) })}
          </span>
        </div>
        <div className="viewer-toolbar-actions">
          <div className="viewer-tabs">
            <button
              type="button"
              className={`viewer-tab ${mode === 'preview' ? 'active' : ''}`}
              aria-pressed={mode === 'preview'}
              onClick={() => setMode('preview')}
            >
              {t('fileViewer.preview')}
            </button>
            <button
              type="button"
              className={`viewer-tab ${mode === 'source' ? 'active' : ''}`}
              aria-pressed={mode === 'source'}
              onClick={() => setMode('source')}
            >
              {t('fileViewer.source')}
            </button>
          </div>
          <span className="viewer-divider" aria-hidden />
          <button
            type="button"
            className="viewer-action"
            onClick={onReload}
            title={t('fileViewer.reloadDisk')}
          >
            <Icon name="reload" size={13} />
            <span>{t('fileViewer.reload')}</span>
          </button>
          <a
            className="ghost-link"
            href={fileRawUrl(projectId, file.name)}
            download={file.name}
          >
            {t('fileViewer.download')}
          </a>
          <a
            className="ghost-link"
            href={fileRawUrl(projectId, file.name)}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('fileViewer.open')}
          </a>
        </div>
      </div>
      <div className={`viewer-body ${mode === 'preview' ? 'image-body' : ''}`}>
        {mode === 'preview' ? (
          <img alt={file.name} src={url} />
        ) : loadingSource ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : sourceError ? (
          <div className="viewer-empty">{t('fileViewer.previewUnavailable')}</div>
        ) : (
          <pre className="viewer-source">{source ?? ''}</pre>
        )}
      </div>
    </div>
  );
}
