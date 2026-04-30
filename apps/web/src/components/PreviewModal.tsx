import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { exportAsHtml, exportAsPdf, exportAsZip } from '../runtime/exports';
import { buildSrcdoc } from '../runtime/srcdoc';

export interface PreviewView {
  id: string;
  label: string;
  // Null means "still loading" — modal renders the loading affordance.
  // Undefined means "not yet requested" — parent should react to onView and
  // begin a fetch. Both states keep the iframe blank.
  html: string | null | undefined;
}

interface Props {
  title: string;
  subtitle?: string;
  views: PreviewView[];
  initialViewId?: string;
  // Per-view filename hint for the share menu — receives the active view id
  // so DS can produce e.g. "Airtable — showcase" while Examples stay flat.
  exportTitleFor: (viewId: string) => string;
  // Fired whenever the active view changes — including on first mount with
  // initialViewId. Lets the parent drive lazy fetches without prop drilling
  // a loader callback in.
  onView?: (viewId: string) => void;
  onClose: () => void;
}

// A full-screen overlay that renders an iframe of arbitrary HTML, with an
// optional tab bar for multiple views, a Share menu (PDF / HTML / ZIP /
// open-in-new-tab), and a Fullscreen toggle. Used by both the design-system
// preview and the example card preview, so the two paths feel identical.
export function PreviewModal({
  title,
  subtitle,
  views,
  initialViewId,
  exportTitleFor,
  onView,
  onClose,
}: Props) {
  const t = useT();
  const initial = initialViewId && views.some((v) => v.id === initialViewId)
    ? initialViewId
    : views[0]?.id ?? '';
  const [activeId, setActiveId] = useState<string>(initial);
  const [shareOpen, setShareOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const shareRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Tell the parent the initial view id so it can prime a fetch. Re-fires on
  // tab change. Guarded against re-firing while the same id is active to
  // avoid noisy effects in the parent.
  useEffect(() => {
    onView?.(activeId);
  }, [activeId, onView]);

  // Close on Escape. If we're in fullscreen, exit fullscreen first instead
  // of dismissing the whole modal in one keystroke.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (fullscreen) {
        setFullscreen(false);
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, fullscreen]);

  // Close share popover on outside click / Escape.
  useEffect(() => {
    if (!shareOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!shareRef.current) return;
      if (!shareRef.current.contains(e.target as Node)) setShareOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [shareOpen]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const activeView = views.find((v) => v.id === activeId) ?? views[0];
  const activeHtml = activeView?.html ?? null;
  const srcDoc = useMemo(
    () => (activeHtml ? buildSrcdoc(activeHtml) : ''),
    [activeHtml],
  );
  const exportTitle = exportTitleFor(activeView?.id ?? '');

  function openInNewTab() {
    if (!activeHtml) return;
    const blob = new Blob([activeHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function enterFullscreen() {
    const el = stageRef.current;
    if (el && typeof el.requestFullscreen === 'function') {
      el.requestFullscreen()
        .then(() => setFullscreen(true))
        .catch(() => setFullscreen(true));
    } else {
      setFullscreen(true);
    }
  }

  function exitFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    setFullscreen(false);
  }

  const showTabs = views.length > 1;

  return (
    <div className="ds-modal-backdrop" role="dialog" aria-modal="true" aria-label={`${title} preview`}>
      <div className={`ds-modal ${fullscreen ? 'ds-modal-fullscreen' : ''}`}>
        <header className="ds-modal-header">
          <div className="ds-modal-title-block">
            <div className="ds-modal-title">{title}</div>
            {subtitle ? <div className="ds-modal-subtitle">{subtitle}</div> : null}
          </div>
          {showTabs ? (
            <div className="ds-modal-tabs" role="tablist">
              {views.map((v) => (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={activeId === v.id}
                  className={`ds-modal-tab ${activeId === v.id ? 'active' : ''}`}
                  onClick={() => setActiveId(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          ) : (
            <span aria-hidden="true" />
          )}
          <div className="ds-modal-actions">
            <button
              className="ghost"
              onClick={fullscreen ? exitFullscreen : enterFullscreen}
              title={
                fullscreen
                  ? t('common.exitFullscreen')
                  : t('common.fullscreen')
              }
            >
              {fullscreen ? t('preview.exit') : t('preview.fullscreen')}
            </button>
            <div className="share-menu" ref={shareRef}>
              <button
                className="ghost"
                aria-haspopup="menu"
                aria-expanded={shareOpen}
                onClick={() => setShareOpen((v) => !v)}
                disabled={!activeHtml}
              >
                {t('preview.shareMenu')}
              </button>
              {shareOpen ? (
                <div className="share-menu-popover" role="menu">
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setShareOpen(false);
                      if (activeHtml) exportAsPdf(activeHtml, exportTitle);
                    }}
                  >
                    <span className="share-menu-icon">📄</span>
                    <span>{t('common.exportPdf')}</span>
                  </button>
                  <div className="share-menu-divider" />
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setShareOpen(false);
                      if (activeHtml) exportAsZip(activeHtml, exportTitle);
                    }}
                  >
                    <span className="share-menu-icon">🗜</span>
                    <span>{t('common.exportZip')}</span>
                  </button>
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setShareOpen(false);
                      if (activeHtml) exportAsHtml(activeHtml, exportTitle);
                    }}
                  >
                    <span className="share-menu-icon">🌐</span>
                    <span>{t('common.exportHtml')}</span>
                  </button>
                  <div className="share-menu-divider" />
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setShareOpen(false);
                      openInNewTab();
                    }}
                  >
                    <span className="share-menu-icon">↗</span>
                    <span>{t('preview.openInNewTab')}</span>
                  </button>
                </div>
              ) : null}
            </div>
            <button
              className="ghost"
              onClick={onClose}
              title={t('preview.closeTitle')}
              aria-label={t('common.close')}
            >
              ✕
            </button>
          </div>
        </header>
        <div className="ds-modal-stage" ref={stageRef}>
          {activeHtml === null || activeHtml === undefined ? (
            <div className="ds-modal-empty">
              {t('preview.loading', {
                label:
                  activeView?.label.toLowerCase() ?? t('common.preview').toLowerCase(),
              })}
            </div>
          ) : (
            <iframe
              key={activeView?.id ?? 'view'}
              title={`${title} ${activeView?.label ?? ''}`}
              sandbox="allow-scripts allow-same-origin"
              srcDoc={srcDoc}
            />
          )}
        </div>
      </div>
    </div>
  );
}
