// Dumb markdown viewer: props in, JSX out. Exact markup/classNames/i18n keys
// preserved from the pre-extraction `MarkdownViewer` in
// `apps/web/src/components/FileViewer.tsx`.
import type {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
} from 'react';
import { Icon } from '../../../components/Icon';
import { RemixIcon } from '../../../components/RemixIcon';
import type { MarkdownAutoSaveStatus } from '../formatters';
import type { MarkdownViewerMode, TranslateFn } from '../types';

export function MarkdownViewerView({
  t,
  isStreaming,
  isError,
  mode,
  onSetMode,
  autoSaveStatus,
  autoSaveLabel,
  onRetrySave,
  onCopy,
  copied,
  text,
  downloadMenuOpen,
  onSetDownloadMenuOpen,
  onExportMd,
  html,
  editorRef,
  onEditorFocus,
  onEditorChange,
  onEditorScroll,
  onEditorPaste,
  onEditorDrop,
  markdownPreviewPaneRef,
  onPreviewActivate,
  onPreviewScroll,
  markdownArticleRef,
  onMarkdownBodyClick,
}: {
  t: TranslateFn;
  isStreaming: boolean;
  isError: boolean;
  mode: MarkdownViewerMode;
  onSetMode: (mode: MarkdownViewerMode) => void;
  autoSaveStatus: MarkdownAutoSaveStatus;
  autoSaveLabel: string;
  onRetrySave: () => void;
  onCopy: () => void;
  copied: boolean;
  text: string | null;
  downloadMenuOpen: boolean;
  onSetDownloadMenuOpen: (updater: boolean | ((current: boolean) => boolean)) => void;
  onExportMd: () => void;
  html: string | null;
  editorRef: MutableRefObject<HTMLTextAreaElement | null>;
  onEditorFocus: () => void;
  onEditorChange: (value: string) => void;
  onEditorScroll: () => void;
  onEditorPaste: (event: ReactClipboardEvent<HTMLTextAreaElement>) => void;
  onEditorDrop: (event: ReactDragEvent<HTMLTextAreaElement>) => void;
  markdownPreviewPaneRef: MutableRefObject<HTMLElement | null>;
  onPreviewActivate: () => void;
  onPreviewScroll: () => void;
  markdownArticleRef: MutableRefObject<HTMLElement | null>;
  onMarkdownBodyClick: (event: ReactMouseEvent<HTMLElement>) => void;
}) {
  const showEditor = mode === 'edit' || mode === 'split';
  const showPreview = mode === 'preview' || mode === 'split';

  return (
    <div className="viewer text-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          {isStreaming ? <span className="viewer-meta">{t('fileViewer.markdownStreamingMeta')}</span> : null}
          {isError ? <span className="viewer-meta">{t('fileViewer.markdownErrorMeta')}</span> : null}
          <div className="viewer-tabs markdown-mode-tabs" role="tablist" aria-label={t('fileViewer.markdownViewMode')}>
            {(['edit', 'split', 'preview'] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={mode === item}
                className={`viewer-tab ${mode === item ? 'active' : ''}`}
                onClick={() => onSetMode(item)}
              >
                {item === 'edit'
                  ? t('fileViewer.source')
                  : item === 'split'
                    ? t('fileViewer.split')
                    : t('fileViewer.preview')}
              </button>
            ))}
          </div>
        </div>
        <div className="viewer-toolbar-actions">
          {autoSaveStatus === 'error' ? (
            <button
              type="button"
              className="viewer-action markdown-autosave markdown-autosave-error"
              onClick={onRetrySave}
              title={t('fileViewer.save')}
            >
              <Icon name="alert-triangle" size={13} />
              <span>{autoSaveLabel}</span>
            </button>
          ) : (
            <span
              className={`viewer-meta markdown-autosave markdown-autosave-${autoSaveStatus}`}
            >
              {autoSaveStatus === 'saving' ? (
                <Icon name="spinner" size={13} className="icon-spin" />
              ) : autoSaveStatus === 'saved' ? (
                <Icon name="check" size={13} />
              ) : null}
              <span>{autoSaveLabel}</span>
            </span>
          )}
          <button
            type="button"
            className="viewer-action"
            onClick={onCopy}
            title={t('fileViewer.copyTitle')}
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} />
            <span>{copied ? t('fileViewer.copied') : t('fileViewer.copy')}</span>
          </button>
          {text !== null ? (
            <div className="share-menu chrome-share-menu">
              <button
                type="button"
                className="viewer-action"
                aria-haspopup="menu"
                aria-expanded={downloadMenuOpen}
                onClick={() => onSetDownloadMenuOpen((v) => !v)}
              >
                <Icon name="download" size={13} />
                <span>{t('fileViewer.download')}</span>
              </button>
              {downloadMenuOpen ? (
                <div className="share-menu-popover" role="menu">
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      onSetDownloadMenuOpen(false);
                      onExportMd();
                    }}
                  >
                    <span className="share-menu-icon"><RemixIcon name="file-line" size={15} /></span>
                    <span>{t('fileViewer.exportMd')}</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className={`viewer-body markdown-workbench markdown-workbench-${mode}`}>
        {text === null || html === null ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : (
          <>
            {showEditor ? (
              <section className="markdown-editor-pane" aria-label={t('fileViewer.markdownEditor')}>
                <textarea
                  ref={editorRef}
                  className="markdown-editor"
                  value={text}
                  aria-label={t('fileViewer.markdownEditor')}
                  placeholder={t('fileViewer.markdownEditorPlaceholder')}
                  spellCheck
                  autoFocus
                  onFocus={onEditorFocus}
                  onChange={(event) => onEditorChange(event.currentTarget.value)}
                  onScroll={onEditorScroll}
                  onPaste={onEditorPaste}
                  onDrop={onEditorDrop}
                />
              </section>
            ) : null}
            {showPreview ? (
              <div className="markdown-preview-pane-wrap">
                <section
                  ref={markdownPreviewPaneRef}
                  className="markdown-preview-pane"
                  aria-label={t('fileViewer.markdownPreview')}
                  onPointerDown={onPreviewActivate}
                  onWheel={onPreviewActivate}
                  onTouchStart={onPreviewActivate}
                  onKeyDown={onPreviewActivate}
                  onFocus={onPreviewActivate}
                  onScroll={onPreviewScroll}
                >
                  {isStreaming ? <div className="markdown-status">{t('fileViewer.markdownStreamingStatus')}</div> : null}
                  {isError ? <div className="markdown-status markdown-status-error">{t('fileViewer.markdownErrorStatus')}</div> : null}
                  {/* Safe by contract: renderMarkdownToSafeHtml escapes raw HTML and rejects unsafe link protocols. */}
                  <article
                    ref={markdownArticleRef}
                    className="markdown-rendered"
                    onClick={onMarkdownBodyClick}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </section>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
