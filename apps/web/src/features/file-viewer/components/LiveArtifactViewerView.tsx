// Dumb presentational view for the live-artifact viewer: props in, JSX out.
// State/handlers live in useLiveArtifactViewer.hooks.ts.
import { createPortal } from 'react-dom';
import type { MutableRefObject, ReactNode } from 'react';
import type { LiveArtifact, LiveArtifactRefreshLogEntry, LiveArtifactWorkspaceEntry } from '../../../types';
import { Icon } from '../../../components/Icon';
import { RemixIcon } from '../../../components/RemixIcon';
import { PreviewDrawOverlay } from '../../../components/PreviewDrawOverlay';
import { PreviewViewportControls } from './PreviewViewportControls';
import { JsonPanel } from './JsonPanel';
import { LiveArtifactCodePanel } from './LiveArtifactCodePanel';
import { LiveArtifactRefreshHistoryPanel } from './LiveArtifactRefreshHistoryPanel';
import { LiveArtifactRefreshNotice } from './LiveArtifactRefreshNotice';
import { liveArtifactPreviewUrl, previewScaleShellStyle, previewViewportStyle } from '../rules';
import type { LiveArtifactRefreshEvent, PreviewCanvasSize, PreviewViewportId, TranslateFn } from '../types';

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];

export function LiveArtifactViewerView({
  t,
  projectId,
  liveArtifact,
  tabs,
  mode,
  onSetMode,
  detail,
  loading,
  previewUrlReloadKey,
  zoom,
  onSetZoom,
  previewViewport,
  onSetPreviewViewport,
  iframeRef,
  refreshError,
  refreshSuccess,
  onDismissRefreshSuccess,
  refreshEvents,
  refreshHistory,
  isRunning,
  onRefresh,
  onReloadPreview,
  presentMenuOpen,
  onSetPresentMenuOpen,
  presentWrapRef,
  onPresentInThisTab,
  onPresentFullscreen,
  onPresentNewTab,
  inTabPresent,
  onExitInTabPresent,
  zoomMenuOpen,
  onSetZoomMenuOpen,
  zoomMenuRef,
  chromeActionsHost,
  previewBodyRef,
  previewBodySize,
}: {
  t: TranslateFn;
  projectId: string;
  liveArtifact: LiveArtifactWorkspaceEntry;
  tabs: Array<{ id: 'preview' | 'code' | 'data' | 'refresh-history'; label: string }>;
  mode: 'preview' | 'code' | 'data' | 'refresh-history';
  onSetMode: (mode: 'preview' | 'code' | 'data' | 'refresh-history') => void;
  detail: LiveArtifact | null;
  loading: boolean;
  previewUrlReloadKey: number;
  zoom: number;
  onSetZoom: (zoom: number) => void;
  previewViewport: PreviewViewportId;
  onSetPreviewViewport: (viewport: PreviewViewportId) => void;
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
  refreshError: string | null;
  refreshSuccess: string | null;
  onDismissRefreshSuccess: () => void;
  refreshEvents: LiveArtifactRefreshEvent[];
  refreshHistory: LiveArtifactRefreshLogEntry[];
  isRunning: boolean;
  onRefresh: () => void;
  onReloadPreview: () => void;
  presentMenuOpen: boolean;
  onSetPresentMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  presentWrapRef: MutableRefObject<HTMLDivElement | null>;
  onPresentInThisTab: () => void;
  onPresentFullscreen: () => void;
  onPresentNewTab: () => void;
  inTabPresent: boolean;
  onExitInTabPresent: () => void;
  zoomMenuOpen: boolean;
  onSetZoomMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  zoomMenuRef: MutableRefObject<HTMLDivElement | null>;
  chromeActionsHost: HTMLElement | null;
  previewBodyRef: MutableRefObject<HTMLDivElement | null>;
  previewBodySize: PreviewCanvasSize | undefined;
}) {
  const dataPayload = detail?.document?.dataJson ?? null;
  const previewScale = zoom / 100;
  const previewUrl = `${liveArtifactPreviewUrl(projectId, liveArtifact.artifactId)}&v=${previewUrlReloadKey}`;

  return (
    <div className={`viewer html-viewer live-artifact-viewer${inTabPresent ? ' is-tab-present' : ''}`}>
      {((node: ReactNode) => (
        chromeActionsHost ? createPortal(node, chromeActionsHost) : node
      ))(
        <div className="present-wrap chrome-present-wrap" ref={presentWrapRef}>
          <button
            className="chrome-action chrome-action-secondary chrome-action-icon present-trigger od-tooltip"
            aria-haspopup="menu"
            aria-expanded={presentMenuOpen}
            aria-label={t('fileViewer.present')}
            data-tooltip={t('fileViewer.present')}
            data-tooltip-placement="bottom"
            title={t('fileViewer.present')}
            onClick={() => onSetPresentMenuOpen((v) => !v)}
          >
            <RemixIcon name="slideshow-3-line" size={15} />
          </button>
          {presentMenuOpen ? (
            <div className="present-menu" role="menu">
              <button role="menuitem" onClick={onPresentInThisTab}>
                <span className="present-icon"><RemixIcon name="eye-line" size={14} /></span>{' '}
                {t('fileViewer.presentInTab')}
              </button>
              <button role="menuitem" onClick={onPresentFullscreen}>
                <span className="present-icon"><RemixIcon name="play-line" size={14} /></span>{' '}
                {t('fileViewer.presentFullscreen')}
              </button>
              <button role="menuitem" onClick={onPresentNewTab}>
                <span className="present-icon"><RemixIcon name="share-forward-line" size={14} /></span>{' '}
                {t('fileViewer.presentNewTab')}
              </button>
            </div>
          ) : null}
        </div>,
      )}
      {inTabPresent ? (
        <button
          type="button"
          className="present-exit-btn"
          onClick={onExitInTabPresent}
          title={t('common.exitFullscreen')}
          aria-label={t('common.exitFullscreen')}
        >
          <Icon name="close" size={14} />
        </button>
      ) : null}
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
            <button
              type="button"
              className="icon-only od-tooltip"
              onClick={onReloadPreview}
              title={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
              data-tooltip={`${t('fileViewer.reload')} ${t('fileViewer.preview')}`}
              data-tooltip-placement="bottom"
              aria-label={`${t('fileViewer.reloadAria')} ${t('fileViewer.preview')}`}
            >
            <Icon name="reload" size={14} />
          </button>
        </div>
        <div className="viewer-toolbar-actions">
          <div className="viewer-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`viewer-tab ${mode === tab.id ? 'active' : ''}`}
                onClick={() => onSetMode(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div
            className="viewer-preview-controls"
            data-active={mode === 'preview' ? 'true' : 'false'}
            aria-hidden={mode === 'preview' ? undefined : true}
          >
            <span className="viewer-divider" aria-hidden />
            <PreviewViewportControls
              viewport={previewViewport}
              onViewport={onSetPreviewViewport}
              t={t}
              tabIndex={mode === 'preview' ? 0 : -1}
            />
            <span className="viewer-divider" aria-hidden />
            <div className="zoom-menu viewer-toolbar-zoom" ref={zoomMenuRef}>
              <button
                type="button"
                className="viewer-action zoom-trigger od-tooltip"
                aria-haspopup="menu"
                aria-expanded={zoomMenuOpen}
                title={t('fileViewer.resetZoom')}
                data-tooltip={t('fileViewer.resetZoom')}
                data-tooltip-placement="bottom"
                tabIndex={mode === 'preview' ? 0 : -1}
                onClick={() => onSetZoomMenuOpen((v) => !v)}
              >
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{zoom}%</span>
              </button>
              {zoomMenuOpen && mode === 'preview' ? (
                <div className="zoom-menu-popover" role="menu">
                  {ZOOM_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={`zoom-menu-item${zoom === level ? ' active' : ''}`}
                      role="menuitem"
                      onClick={() => {
                        onSetZoom(level);
                        onSetZoomMenuOpen(false);
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
            <span className="viewer-divider" aria-hidden />
            <a
              className="ghost-link"
              href={liveArtifactPreviewUrl(projectId, liveArtifact.artifactId)}
              target="_blank"
              rel="noreferrer noopener"
              tabIndex={mode === 'preview' ? 0 : -1}
            >
              {t('fileViewer.open')}
            </a>
          </div>
          <span className="viewer-divider" aria-hidden />
          <button
            type="button"
            className="viewer-action primary"
            data-running={isRunning ? 'true' : 'false'}
            onClick={onRefresh}
            disabled={isRunning}
            aria-busy={isRunning}
            aria-label={isRunning ? t('liveArtifact.refresh.running') : t('liveArtifact.refresh.button')}
            title={
              isRunning
                ? t('liveArtifact.refresh.running')
                : t('liveArtifact.refresh.buttonTitle')
            }
          >
            <Icon name={isRunning ? 'spinner' : 'reload'} size={13} />
            <span>{isRunning ? t('liveArtifact.refresh.running') : t('liveArtifact.refresh.button')}</span>
          </button>
        </div>
      </div>
      <div className="viewer-body" ref={previewBodyRef}>
        {refreshError ? (
          <LiveArtifactRefreshNotice
            tone="error"
            message={refreshError}
            action={t('liveArtifact.refresh.failureAction')}
          />
        ) : refreshSuccess ? (
          <LiveArtifactRefreshNotice
            tone="success"
            message={refreshSuccess}
            action={t('liveArtifact.refresh.successAction')}
            onDismiss={onDismissRefreshSuccess}
            dismissLabel={t('common.close')}
          />
        ) : isRunning ? (
          <LiveArtifactRefreshNotice
            tone="running"
            message={t('liveArtifact.refresh.runningMessage')}
            action={t('liveArtifact.refresh.runningAction')}
          />
        ) : (detail?.refreshStatus ?? liveArtifact.refreshStatus) === 'failed' ? (
          <LiveArtifactRefreshNotice
            tone="error"
            message={t('liveArtifact.refresh.previousFailure', { message: t('liveArtifact.refresh.genericFailure') })}
            action={t('liveArtifact.refresh.failureAction')}
          />
        ) : null}
        <div
          className={`live-artifact-preview-layer preview-viewport preview-viewport-${previewViewport}`}
          data-active={mode === 'preview' ? 'true' : 'false'}
          aria-hidden={mode === 'preview' ? undefined : true}
          style={previewViewportStyle(previewViewport, previewScale, previewBodySize)}
        >
          <div className="preview-frame-clip">
            <div style={previewScaleShellStyle(previewViewport, previewScale)}>
              <PreviewDrawOverlay>
                <iframe
                  ref={iframeRef}
                  data-testid="live-artifact-preview-frame"
                  title={liveArtifact.title}
                  sandbox="allow-scripts allow-popups allow-downloads"
                  src={previewUrl}
                />
              </PreviewDrawOverlay>
            </div>
          </div>
        </div>
        {mode !== 'preview' && loading ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : mode === 'code' ? (
          <LiveArtifactCodePanel
            projectId={projectId}
            artifactId={liveArtifact.artifactId}
            reloadKey={previewUrlReloadKey}
          />
        ) : mode === 'data' ? (
          <JsonPanel value={dataPayload} emptyLabel={t('liveArtifact.viewer.dataEmpty')} />
        ) : (
          <LiveArtifactRefreshHistoryPanel
            liveArtifact={detail}
            fallbackRefreshStatus={liveArtifact.refreshStatus}
            fallbackLastRefreshedAt={liveArtifact.lastRefreshedAt}
            isRunning={isRunning}
            sessionEvents={refreshEvents}
            persistedEvents={refreshHistory}
          />
        )}
      </div>
    </div>
  );
}
