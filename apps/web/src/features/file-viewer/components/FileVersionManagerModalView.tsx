// Dumb file-version-history modal: props in, JSX out. State/effects/transport
// live in `useFileVersionManager`; this component only renders.
import { createPortal } from 'react-dom';
import type { ProjectFileVersion } from '@open-design/contracts';
import { RemixIcon } from '../../../components/RemixIcon';
import { useT } from '../../../i18n';
import type { Locale } from '../../../i18n/types';
import type { ProjectFile } from '../../../types';
import {
  fileVersionSourceClassName,
  fileVersionSourceLabel,
  previewScaleShellStyle,
  previewViewportStyle,
} from '../rules';
import { formatVersionDateTime } from '../formatters';
import type { FileVersionManagerController } from '../hooks/useFileVersionManager.hooks';
import { FileVersionViewportControls } from './FileVersionViewportControls';

export function FileVersionManagerModalView({
  file,
  locale,
  controller,
  onClose,
}: {
  file: ProjectFile;
  locale: Locale;
  controller: FileVersionManagerController;
  onClose: () => void;
}) {
  const t = useT();
  const {
    versions,
    versionCountLabel,
    showSearch,
    search,
    setSearch,
    visibleVersions,
    versionById,
    loading,
    onSelectVersion,
    onPrefetchVersion,
    selectedVersion,
    selectedDate,
    selectedRestoredFrom,
    promptWrapRef,
    promptOpen,
    promptPopoverId,
    onTogglePrompt,
    selectedPrompt,
    copied,
    onCopyPrompt,
    restoreWrapRef,
    confirmRestore,
    restorePopoverId,
    restoreDisabled,
    restoring,
    onToggleRestoreConfirm,
    onCancelRestore,
    onConfirmRestore,
    previewViewport,
    onViewportChange,
    onOpenInNewTab,
    loadingContent,
    selectedContentMatchesVersion,
    previewFrameRef,
    previewFrameSize,
    error,
    srcDoc,
    isDeckPreview,
    frameReady,
    onFrameLoad,
    portalRoot,
  } = controller;

  if (!portalRoot) return null;

  return createPortal(
    <div
      className="modal-backdrop viewer-modal-backdrop file-version-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="file-version-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('fileViewer.versions.title')}
      >
        <div className="file-version-sidebar">
          <div className="file-version-sidebar-head">
            <span className="file-version-count">{versionCountLabel}</span>
          </div>
          {showSearch ? (
            <div className="file-version-search">
              <RemixIcon name="search-line" size={14} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('common.searchEllipsis')}
                aria-label={t('common.searchEllipsis')}
              />
              {search ? (
                <button
                  type="button"
                  className="file-version-search-clear"
                  aria-label={t('common.clear')}
                  onClick={() => setSearch('')}
                >
                  <RemixIcon name="close-line" size={14} />
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="file-version-list" role="listbox" aria-label={t('fileViewer.versions.listAria')}>
            {loading ? (
              <div
                className="file-version-skeleton-list"
                role="status"
                aria-label={t('fileViewer.versions.loading')}
              >
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="file-version-skeleton-item" aria-hidden="true">
                    <div className="file-version-skeleton-row">
                      <span className="file-version-skeleton-line badge" />
                      <span className="file-version-skeleton-line time" />
                    </div>
                    <span className="file-version-skeleton-line title" />
                    <span className="file-version-skeleton-line meta" />
                  </div>
                ))}
              </div>
            ) : versions.length === 0 ? (
              <div className="file-version-empty">{t('fileViewer.versions.empty')}</div>
            ) : visibleVersions.length === 0 ? (
              <div className="file-version-empty">{t('homeHero.noResults', { query: search.trim() })}</div>
            ) : (
              visibleVersions.map((version) => {
                const selected = version.id === selectedVersion?.id;
                const itemRestoredFrom: ProjectFileVersion | null = version.restoreFromVersionId
                  ? versionById.get(version.restoreFromVersionId) ?? null
                  : null;
                const prefetch = () => onPrefetchVersion(version.id);
                return (
                  <button
                    key={version.id}
                    type="button"
                    className={`file-version-item${selected ? ' active' : ''}`}
                    role="option"
                    aria-selected={selected}
                    onClick={() => onSelectVersion(version)}
                    onMouseEnter={prefetch}
                    onFocus={prefetch}
                  >
                    <span className="file-version-item-top">
                      {version.current ? (
                        <span className="file-version-current-badge">{t('fileViewer.versions.current')}</span>
                      ) : null}
                      <span className={`file-version-source-badge ${fileVersionSourceClassName(version)}`}>
                        {fileVersionSourceLabel(version, t)}
                      </span>
                      <span className="file-version-time">
                        {formatVersionDateTime(version.createdAt, locale)}
                      </span>
                    </span>
                    <span className="file-version-item-title">
                      {version.prompt || version.label || t('fileViewer.versions.versionLabel', { version: version.version })}
                    </span>
                    <span className="file-version-item-meta">
                      {t('fileViewer.versions.versionLabel', { version: version.version })}
                      {itemRestoredFrom ? (
                        <span className="file-version-item-restored">
                          {t('fileViewer.versions.restoredFrom', { version: itemRestoredFrom.version })}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div className="file-version-main">
          <header className="file-version-head">
            <div className="file-version-meta">
              <div className="file-version-meta-row">
                {selectedVersion?.current ? (
                  <span className="file-version-current-badge">{t('fileViewer.versions.current')}</span>
                ) : null}
                {selectedVersion ? (
                  <span className={`file-version-source-badge ${fileVersionSourceClassName(selectedVersion)}`}>
                    {fileVersionSourceLabel(selectedVersion, t)}
                  </span>
                ) : null}
                <span className="file-version-selected-date">{selectedDate}</span>
                {selectedRestoredFrom ? (
                  <span className="file-version-restored-from">
                    {t('fileViewer.versions.restoredFrom', { version: selectedRestoredFrom.version })}
                  </span>
                ) : null}
                <div
                  className="file-version-prompt-popover-wrap"
                  ref={promptWrapRef}
                >
                  <button
                    type="button"
                    className={`file-version-prompt-toggle${promptOpen ? ' active' : ''}`}
                    aria-expanded={promptOpen}
                    aria-controls={promptOpen ? promptPopoverId : undefined}
                    disabled={!selectedVersion}
                    onClick={onTogglePrompt}
                  >
                    <RemixIcon name="chat-3-line" size={15} />
                    <span>{t('fileViewer.versions.promptTitle')}</span>
                    <RemixIcon name="arrow-down-s-line" size={14} />
                  </button>
                  {promptOpen ? (
                    <section
                      className="file-version-prompt-popover"
                      id={promptPopoverId}
                      role="region"
                      aria-label={t('fileViewer.versions.promptTitle')}
                    >
                      <div className="file-version-prompt-head">
                        <h3>{t('fileViewer.versions.promptTitle')}</h3>
                        <button
                          type="button"
                          className="viewer-action file-version-copy-prompt"
                          disabled={!selectedPrompt}
                          onClick={onCopyPrompt}
                        >
                          <RemixIcon name="file-copy-line" size={14} />
                          <span>{copied ? t('fileViewer.copied') : t('fileViewer.versions.copyPrompt')}</span>
                        </button>
                      </div>
                      <p>{selectedPrompt || t('fileViewer.versions.noPromptBody')}</p>
                    </section>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="file-version-actions">
              {selectedVersion && !selectedVersion.current ? (
                <div className="file-version-restore-wrap" ref={restoreWrapRef}>
                  <button
                    type="button"
                    className={`viewer-action primary file-version-restore-action${confirmRestore ? ' active' : ''}`}
                    disabled={restoreDisabled}
                    aria-haspopup="dialog"
                    aria-expanded={confirmRestore}
                    aria-controls={confirmRestore ? restorePopoverId : undefined}
                    onClick={onToggleRestoreConfirm}
                  >
                    <RemixIcon name={restoring ? 'loader-4-line' : 'git-branch-line'} size={14} />
                    <span>
                      {restoring
                        ? t('fileViewer.versions.restoring')
                        : t('fileViewer.versions.restore')}
                    </span>
                  </button>
                  {confirmRestore ? (
                    <div
                      className="file-version-restore-confirm"
                      id={restorePopoverId}
                      role="dialog"
                      aria-label={t('fileViewer.versions.restoreConfirmTitle')}
                    >
                      <h3>{t('fileViewer.versions.restoreConfirmTitle')}</h3>
                      <p>{t('fileViewer.versions.restoreHelp')}</p>
                      <div className="file-version-restore-confirm-actions">
                        <button
                          type="button"
                          className="viewer-action"
                          onClick={onCancelRestore}
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          className="viewer-action primary"
                          disabled={restoreDisabled}
                          onClick={onConfirmRestore}
                        >
                          {t('fileViewer.versions.restoreConfirmCta')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <FileVersionViewportControls
                viewport={previewViewport}
                onViewport={onViewportChange}
                t={t}
              />
              <button
                type="button"
                className="viewer-action viewer-action-icon od-tooltip"
                aria-label={t('fileViewer.versions.open')}
                title={t('fileViewer.versions.open')}
                data-tooltip={t('fileViewer.versions.open')}
                data-tooltip-placement="bottom"
                disabled={!selectedContentMatchesVersion || loadingContent}
                onClick={onOpenInNewTab}
              >
                <RemixIcon name="external-link-line" size={15} />
              </button>
              <button
                type="button"
                className="viewer-action viewer-action-icon od-tooltip"
                aria-label={t('common.close')}
                title={t('common.close')}
                data-tooltip={t('common.close')}
                data-tooltip-placement="bottom"
                onClick={onClose}
              >
                <RemixIcon name="close-line" size={16} />
              </button>
            </div>
          </header>
          <div className="file-version-preview" ref={previewFrameRef}>
            {error ? (
              <div className="viewer-empty" role="alert">{error}</div>
            ) : (
              <>
                {srcDoc ? (
                  <div
                    className={`preview-viewport preview-viewport-${previewViewport}${isDeckPreview ? ' preview-viewport-deck' : ''}`}
                    style={previewViewportStyle(previewViewport, 1, previewFrameSize, { canvasPadding: 24 })}
                  >
                    <div className="preview-frame-clip">
                      <div style={previewScaleShellStyle(previewViewport, 1)}>
                        <iframe
                          title={selectedVersion ? `${file.name} v${selectedVersion.version}` : file.name}
                          sandbox="allow-scripts allow-downloads"
                          srcDoc={srcDoc}
                          onLoad={onFrameLoad}
                        />
                      </div>
                    </div>
                  </div>
                ) : !loading && !loadingContent ? (
                  <div className="viewer-empty">{t('fileViewer.versions.previewLoading')}</div>
                ) : null}
                {loading || loadingContent || (srcDoc && !frameReady) ? (
                  <div
                    className="file-version-preview-overlay"
                    role="status"
                    aria-label={t('fileViewer.versions.previewLoading')}
                  >
                    <span className="file-version-preview-spinner" aria-hidden="true" />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    portalRoot,
  );
}
