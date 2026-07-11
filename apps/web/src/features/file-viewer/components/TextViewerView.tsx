// Presentational plain-text viewer: reload/save(disabled)/copy toolbar plus
// the gutter-numbered or plain source body. State + transport live in
// `useTextFileContent`.
import { useT } from '../../../i18n';
import { Icon } from '../../../components/Icon';
import { CodeWithLines } from './CodeWithLines';

export function TextViewerView({
  text,
  displayText,
  lineCount,
  copied,
  onReload,
  onCopy,
}: {
  text: string | null;
  displayText: string | null;
  lineCount: number;
  copied: boolean;
  onReload: () => void;
  onCopy: () => void;
}) {
  const t = useT();
  return (
    <div className="viewer text-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left" />
        <div className="viewer-toolbar-actions">
          <button
            type="button"
            className="viewer-action"
            onClick={onReload}
            title={t('fileViewer.reloadDisk')}
          >
            <Icon name="reload" size={13} />
            <span>{t('fileViewer.reload')}</span>
          </button>
          <button
            type="button"
            className="viewer-action"
            disabled
            title={t('fileViewer.saveDisabled')}
          >
            <Icon name="check" size={13} />
            <span>{t('fileViewer.save')}</span>
          </button>
          <button
            type="button"
            className="viewer-action"
            onClick={onCopy}
            title={t('fileViewer.copyTitle')}
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} />
            <span>{copied ? t('fileViewer.copied') : t('fileViewer.copy')}</span>
          </button>
        </div>
      </div>
      <div className="viewer-body">
        {text === null ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : displayText !== null && lineCount > 0 ? (
          <CodeWithLines text={displayText} />
        ) : (
          <pre className="viewer-source">{displayText}</pre>
        )}
      </div>
    </div>
  );
}
