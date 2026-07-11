// Dumb toolbar chrome for HtmlViewer: the reload button, preview/source mode
// tabs, version-history entry, viewport-preset + deck-nav inline controls,
// zoom control, and the "more" overflow menu (which duplicates the primary
// row's actions for narrow layouts). Props in, JSX out — every piece of state
// this reads that isn't the toolbar's own (mode/zoom/menu-open flags) is a
// pass-through prop owned by a cluster not yet extracted from HtmlViewer
// (comment/mark/edit tool activation, deck navigation, screenshot capture).
import type { MutableRefObject } from 'react';
import { Icon } from '../../../components/Icon';
import { RemixIcon } from '../../../components/RemixIcon';
import { PREVIEW_VIEWPORT_PRESETS } from '../constants';
import { previewViewportIcon } from '../rules';
import type { BoardTool, PreviewViewportId, TranslateFn } from '../types';
import { PreviewViewportControls } from './PreviewViewportControls';

export interface ViewerToolbarSlideState {
  active: number;
  count: number;
}

export interface ViewerToolbarProps {
  t: TranslateFn;

  // Toolbar-chrome state (useViewerToolbarMenus.hooks.ts).
  mode: 'preview' | 'source';
  zoom: number;
  setZoom: (zoom: number) => void;
  zoomMenuOpen: boolean;
  setZoomMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  zoomMenuRef: MutableRefObject<HTMLDivElement | null>;
  toolbarMoreOpen: boolean;
  setToolbarMoreOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  toolbarMoreRef: MutableRefObject<HTMLDivElement | null>;
  setVersionModalOpen: (value: false | 'toolbar' | 'more_menu') => void;

  // Not toolbar-chrome-owned; threaded through from HtmlViewer's still-inline
  // state/handlers (other, not-yet-extracted clusters).
  reloadHtmlPreview: () => void;
  fireArtifactToolbarClick: (
    element: 'preview' | 'source' | 'screenshot' | 'versions' | 'zoom_level_dropdown',
    entryFrom?: 'toolbar' | 'more_menu',
  ) => void;
  selectMode: (mode: 'preview' | 'source') => void;
  versioningAvailable: boolean;
  source: string | null;
  showPreviewToolbarControls: boolean;
  previewViewport: PreviewViewportId;
  setPreviewViewport: (viewport: PreviewViewportId) => void;
  showDeckNavigation: boolean;
  slideState: ViewerToolbarSlideState | null;
  postSlide: (action: 'prev' | 'next') => void;
  handleCopyScreenshot: () => void | Promise<void>;
  boardMode: boolean;
  commentCreateMode: boolean;
  boardTool: BoardTool;
  drawOverlayOpen: boolean;
  manualEditMode: boolean;
  activateCommentTool: () => void;
  activateDrawTool: () => void;
  activateManualEditTool: () => void;
  activateCommentCreateTool: () => void;
  visibleSideCommentsCount: number;
}

export function ViewerToolbar({
  t,
  mode,
  zoom,
  setZoom,
  zoomMenuOpen,
  setZoomMenuOpen,
  zoomMenuRef,
  toolbarMoreOpen,
  setToolbarMoreOpen,
  toolbarMoreRef,
  setVersionModalOpen,
  reloadHtmlPreview,
  fireArtifactToolbarClick,
  selectMode,
  versioningAvailable,
  source,
  showPreviewToolbarControls,
  previewViewport,
  setPreviewViewport,
  showDeckNavigation,
  slideState,
  postSlide,
  handleCopyScreenshot,
  boardMode,
  commentCreateMode,
  boardTool,
  drawOverlayOpen,
  manualEditMode,
  activateCommentTool,
  activateDrawTool,
  activateManualEditTool,
  activateCommentCreateTool,
  visibleSideCommentsCount,
}: ViewerToolbarProps) {
  return (
    <div className="viewer-toolbar">
      <div className="viewer-toolbar-left">
        <button
          type="button"
          className="icon-only od-tooltip"
          onClick={reloadHtmlPreview}
          title={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
          data-tooltip={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
          data-tooltip-placement="bottom"
          aria-label={`${t('fileViewer.reloadAria')} ${t('fileViewer.preview')}`}
        >
          <Icon name="reload" size={14} />
        </button>
        <div className="viewer-tabs viewer-mode-tabs" role="tablist" aria-label="View mode">
          {([
            ['preview', t('fileViewer.preview'), 'eye-line'],
            ['source', t('fileViewer.source'), 'code-line'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`viewer-tab od-tooltip ${mode === id ? 'active' : ''}`}
              aria-label={label}
              aria-selected={mode === id}
              title={label}
              data-tooltip={label}
              data-tooltip-placement="bottom"
              onClick={() => {
                fireArtifactToolbarClick(id);
                selectMode(id);
              }}
            >
              <RemixIcon name={id === 'preview' ? 'eye-line' : 'code-line'} size={14} className="viewer-tab-icon" />
              <span className="viewer-tab-label">{label}</span>
            </button>
          ))}
        </div>
        {versioningAvailable ? (
          <button
            type="button"
            className="viewer-action file-version-trigger od-tooltip"
            disabled={source === null}
            title={t('fileViewer.versions.title')}
            aria-label={t('fileViewer.versions.title')}
            data-tooltip={t('fileViewer.versions.title')}
            data-tooltip-placement="bottom"
            onClick={() => {
              fireArtifactToolbarClick('versions', 'toolbar');
              setVersionModalOpen('toolbar');
            }}
          >
            <RemixIcon name="history-line" size={14} />
            <span>{t('fileViewer.versions.entry')}</span>
          </button>
        ) : null}
        {showPreviewToolbarControls ? (
          <span className="viewer-preview-toolbar-inline">
            <span className="viewer-divider" aria-hidden />
            <PreviewViewportControls
              viewport={previewViewport}
              onViewport={setPreviewViewport}
              t={t}
            />
          </span>
        ) : null}
        {showPreviewToolbarControls && showDeckNavigation ? (
          <span
            className="deck-nav viewer-deck-nav-inline"
            role="group"
            aria-label={t('fileViewer.slideNavAria')}
          >
            <button
              type="button"
              className="icon-only od-tooltip"
              onClick={() => postSlide('prev')}
              title={t('fileViewer.previousSlide')}
              data-tooltip={t('fileViewer.previousSlide')}
              data-tooltip-placement="bottom"
              aria-label={t('fileViewer.previousSlide')}
              disabled={slideState !== null && slideState.active <= 0}
            >
              <Icon name="chevron-right" size={14} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <span className="deck-nav-counter">
              {slideState
                ? `${slideState.active + 1} / ${slideState.count}`
                : '— / —'}
            </span>
            <button
              type="button"
              className="icon-only od-tooltip"
              onClick={() => postSlide('next')}
              title={t('fileViewer.nextSlide')}
              data-tooltip={t('fileViewer.nextSlide')}
              data-tooltip-placement="bottom"
              aria-label={t('fileViewer.nextSlide')}
              disabled={
                slideState !== null &&
                slideState.active >= slideState.count - 1
              }
            >
              <Icon name="chevron-right" size={14} />
            </button>
          </span>
        ) : null}
      </div>
      <div className="viewer-toolbar-actions">
        {showPreviewToolbarControls ? (
          <div className="viewer-toolbar-inline-actions">
            {mode === 'preview' ? (
              <button
                type="button"
                className="viewer-action viewer-action-icon od-tooltip"
                data-testid="screenshot-copy-button"
                data-tooltip={t('fileViewer.screenshot')}
                data-tooltip-placement="bottom"
                title={t('fileViewer.screenshot')}
                aria-label={t('fileViewer.screenshot')}
                onClick={handleCopyScreenshot}
              >
                <RemixIcon name="screenshot-2-line" size={15} />
              </button>
            ) : null}
            <div className="artifact-tool-menu-anchor">
              <button
                type="button"
                className={`viewer-action viewer-action-icon viewer-comment-toggle od-tooltip${boardMode && !commentCreateMode && boardTool === 'inspect' ? ' active' : ''}`}
                data-testid="board-mode-toggle"
                data-tooltip={t('fileViewer.comment')}
                data-tooltip-placement="bottom"
                title={t('fileViewer.comment')}
                aria-label={t('fileViewer.comment')}
                aria-pressed={boardMode && !commentCreateMode && boardTool === 'inspect'}
                onClick={activateCommentTool}
              >
                <RemixIcon name="chat-new-line" size={15} />
              </button>
            </div>
            <button
              className={`viewer-action viewer-action-icon od-tooltip${drawOverlayOpen ? ' active' : ''}`}
              type="button"
              data-testid="draw-overlay-toggle"
              data-tooltip={t('fileViewer.mark')}
              data-tooltip-placement="bottom"
              title={t('fileViewer.mark')}
              aria-label={t('fileViewer.mark')}
              aria-pressed={drawOverlayOpen}
              onClick={activateDrawTool}
            >
              <RemixIcon name="mark-pen-line" size={15} />
            </button>
            <span className="viewer-toolbar-tool-divider" aria-hidden />
            <button
              className={`viewer-action viewer-action-icon od-tooltip${manualEditMode ? ' active' : ''}`}
              type="button"
              data-testid="manual-edit-mode-toggle"
              data-tooltip={t('fileViewer.edit')}
              data-tooltip-placement="bottom"
              title={t('fileViewer.edit')}
              aria-label={t('fileViewer.edit')}
              aria-pressed={manualEditMode}
              onClick={activateManualEditTool}
            >
              <RemixIcon name="edit-line" size={15} />
            </button>
            <span className="viewer-toolbar-tool-divider" aria-hidden />
            <button
              type="button"
              className={`viewer-action viewer-comment-count-trigger viewer-comment-toggle od-tooltip${boardMode && commentCreateMode ? ' active' : ''}`}
              data-testid="comment-panel-toggle"
              data-tooltip={t('chat.tabComments')}
              data-tooltip-placement="bottom"
              title={t('chat.tabComments')}
              aria-label={`${t('chat.tabComments')} (${visibleSideCommentsCount})`}
              aria-pressed={boardMode && commentCreateMode}
              onClick={activateCommentCreateTool}
            >
              <RemixIcon name="message-3-line" size={15} />
              <span className="viewer-comment-count" aria-hidden>{visibleSideCommentsCount}</span>
            </button>
            {source !== null && mode === 'preview' ? (
              <div className="zoom-menu viewer-toolbar-zoom" ref={zoomMenuRef}>
                <button
                  type="button"
                  className="viewer-action zoom-trigger od-tooltip"
                  aria-haspopup="menu"
                  aria-expanded={zoomMenuOpen}
                  title={t('fileViewer.resetZoom')}
                  data-tooltip={t('fileViewer.resetZoom')}
                  data-tooltip-placement="bottom"
                  onClick={() => {
                    fireArtifactToolbarClick('zoom_level_dropdown');
                    setZoomMenuOpen((v) => !v);
                  }}
                >
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{zoom}%</span>
                </button>
                {zoomMenuOpen ? (
                  <div className="zoom-menu-popover" role="menu">
                    {[50, 75, 100, 125, 150, 200].map((level) => (
                      <button
                        key={level}
                        type="button"
                        className={`zoom-menu-item${zoom === level ? ' active' : ''}`}
                        role="menuitem"
                        onClick={() => {
                          setZoom(level);
                          setZoomMenuOpen(false);
                        }}
                      >
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{level}%</span>
                        {zoom === level ? (
                          <Icon name="check" size={13} />
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="viewer-toolbar-more" ref={toolbarMoreRef}>
          <button
            type="button"
            className="viewer-action viewer-action-icon od-tooltip"
            aria-label={t('nextStep.more')}
            aria-haspopup="menu"
            aria-expanded={toolbarMoreOpen}
            data-tooltip={t('nextStep.more')}
            data-tooltip-placement="bottom"
            title={t('nextStep.more')}
            onClick={() => setToolbarMoreOpen((value) => !value)}
          >
            <RemixIcon name="more-2-line" size={16} />
          </button>
          {toolbarMoreOpen ? (
            <div className="viewer-toolbar-more-menu" role="menu">
              {([
                ['preview', t('fileViewer.preview'), 'eye-line'],
                ['source', t('fileViewer.source'), 'code-line'],
              ] as const).map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  className={`viewer-toolbar-more-item${mode === id ? ' active' : ''}`}
                  role="menuitem"
                  onClick={() => {
                    fireArtifactToolbarClick(id);
                    selectMode(id);
                    setToolbarMoreOpen(false);
                  }}
                >
                  <RemixIcon name={icon} size={15} />
                  <span>{label}</span>
                  {mode === id ? <Icon name="check" size={13} /> : null}
                </button>
              ))}
              {versioningAvailable ? (
                <button
                  type="button"
                  className="viewer-toolbar-more-item"
                  role="menuitem"
                  disabled={source === null}
                  onClick={() => {
                    fireArtifactToolbarClick('versions', 'more_menu');
                    setVersionModalOpen('more_menu');
                    setToolbarMoreOpen(false);
                  }}
                >
                  <RemixIcon name="history-line" size={15} />
                  <span>{t('fileViewer.versions.entry')}</span>
                </button>
              ) : null}
              {showPreviewToolbarControls ? (
                <>
                  <div className="viewer-toolbar-more-separator" role="separator" />
                  {PREVIEW_VIEWPORT_PRESETS.map((preset) => {
                    const selected = previewViewport === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={`viewer-toolbar-more-item${selected ? ' active' : ''}`}
                        role="menuitem"
                        title={t(preset.titleKey)}
                        onClick={() => {
                          setPreviewViewport(preset.id);
                          setToolbarMoreOpen(false);
                        }}
                      >
                        <RemixIcon name={previewViewportIcon(preset.id)} size={15} />
                        <span>{t(preset.labelKey)}</span>
                        {selected ? <Icon name="check" size={13} /> : null}
                      </button>
                    );
                  })}
                  {showDeckNavigation ? (
                    <>
                      <div className="viewer-toolbar-more-separator" role="separator" />
                      <button
                        type="button"
                        className="viewer-toolbar-more-item"
                        role="menuitem"
                        disabled={slideState !== null && slideState.active <= 0}
                        onClick={() => {
                          postSlide('prev');
                          setToolbarMoreOpen(false);
                        }}
                      >
                        <Icon name="chevron-right" size={14} style={{ transform: 'rotate(180deg)' }} />
                        <span>{t('fileViewer.previousSlide')}</span>
                      </button>
                      <button
                        type="button"
                        className="viewer-toolbar-more-item"
                        role="menuitem"
                        disabled={slideState !== null && slideState.active >= slideState.count - 1}
                        onClick={() => {
                          postSlide('next');
                          setToolbarMoreOpen(false);
                        }}
                      >
                        <Icon name="chevron-right" size={14} />
                        <span>{t('fileViewer.nextSlide')}</span>
                      </button>
                    </>
                  ) : null}
                  <div className="viewer-toolbar-more-separator" role="separator" />
                  {mode === 'preview' ? (
                    <button
                      type="button"
                      className="viewer-toolbar-more-item"
                      role="menuitem"
                      onClick={() => {
                        handleCopyScreenshot();
                        setToolbarMoreOpen(false);
                      }}
                    >
                      <RemixIcon name="screenshot-2-line" size={15} />
                      <span>{t('fileViewer.screenshot')}</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`viewer-toolbar-more-item${boardMode && !commentCreateMode && boardTool === 'inspect' ? ' active' : ''}`}
                    role="menuitem"
                    onClick={() => {
                      activateCommentTool();
                      setToolbarMoreOpen(false);
                    }}
                  >
                    <RemixIcon name="chat-new-line" size={15} />
                    <span>{t('fileViewer.comment')}</span>
                  </button>
                  <button
                    type="button"
                    className={`viewer-toolbar-more-item${drawOverlayOpen ? ' active' : ''}`}
                    role="menuitem"
                    onClick={() => {
                      activateDrawTool();
                      setToolbarMoreOpen(false);
                    }}
                  >
                    <RemixIcon name="mark-pen-line" size={15} />
                    <span>{t('fileViewer.mark')}</span>
                  </button>
                  <button
                    type="button"
                    className={`viewer-toolbar-more-item${manualEditMode ? ' active' : ''}`}
                    role="menuitem"
                    onClick={() => {
                      activateManualEditTool();
                      setToolbarMoreOpen(false);
                    }}
                  >
                    <RemixIcon name="edit-line" size={15} />
                    <span>{t('fileViewer.edit')}</span>
                  </button>
                  <button
                    type="button"
                    className={`viewer-toolbar-more-item${boardMode && commentCreateMode ? ' active' : ''}`}
                    role="menuitem"
                    onClick={() => {
                      activateCommentCreateTool();
                      setToolbarMoreOpen(false);
                    }}
                  >
                    <RemixIcon name="message-3-line" size={15} />
                    <span>{t('chat.tabComments')} ({visibleSideCommentsCount})</span>
                  </button>
                  {source !== null && mode === 'preview' ? (
                    <>
                      <div className="viewer-toolbar-more-separator" role="separator" />
                      {[50, 75, 100, 125, 150, 200].map((level) => (
                        <button
                          key={level}
                          type="button"
                          className={`viewer-toolbar-more-item${zoom === level ? ' active' : ''}`}
                          role="menuitem"
                          onClick={() => {
                            setZoom(level);
                            setToolbarMoreOpen(false);
                          }}
                        >
                          <RemixIcon name="zoom-in-line" size={15} />
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{level}%</span>
                          {zoom === level ? <Icon name="check" size={13} /> : null}
                        </button>
                      ))}
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
